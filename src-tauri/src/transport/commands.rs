use std::sync::atomic::{AtomicU64, Ordering};

use futures::channel::mpsc::Sender;
use futures::lock::Mutex;
use futures::SinkExt;
use serde::{Deserialize, Serialize};
use tauri::{
    command,
    ipc::{InvokeBody, Request},
    AppHandle, Emitter, State,
};

const MAX_JS_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Serialize, Deserialize)]
pub struct AvailableDevice {
    pub label: String,
    pub id: String,
}

#[derive(Debug, Serialize)]
pub struct ConnectionHandle {
    pub generation: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct ConnectionData {
    pub generation: u64,
    pub data: Vec<u8>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ConnectionDisconnected {
    pub generation: u64,
}

/// Everything required to stop one physical connection. The slot owns the
/// sender (which ends the writer when dropped), task abort handles, and the
/// BLE shutdown signal together so lifecycle decisions stay atomic.
pub struct ConnectionCleanup {
    abort_handles: Vec<tauri::async_runtime::JoinHandle<()>>,
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    // BLE disconnect is stopped by `shutdown`; it is intentionally not
    // aborted, because it owns the physical disconnect operation.
    disconnect_task: Option<tauri::async_runtime::JoinHandle<()>>,
}

impl ConnectionCleanup {
    pub fn new(abort_handles: Vec<tauri::async_runtime::JoinHandle<()>>) -> Self {
        Self {
            abort_handles,
            shutdown: None,
            disconnect_task: None,
        }
    }

    pub fn with_ble_shutdown(
        abort_handles: Vec<tauri::async_runtime::JoinHandle<()>>,
        shutdown: tokio::sync::oneshot::Sender<()>,
        disconnect_task: tauri::async_runtime::JoinHandle<()>,
    ) -> Self {
        Self {
            abort_handles,
            shutdown: Some(shutdown),
            disconnect_task: Some(disconnect_task),
        }
    }

    fn request_stop(&mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        for handle in &self.abort_handles {
            handle.abort();
        }
        // Dropping a JoinHandle detaches it. It continues the physical
        // disconnect outside the slot mutex after receiving shutdown.
        drop(self.disconnect_task.take());
    }
}

struct ConnectionSlot {
    generation: u64,
    sink: Sender<Vec<u8>>,
    cleanup: ConnectionCleanup,
}

/// Tauri-independent lifecycle core. `next_generation` only issues unique
/// numbers; currentness is decided exclusively under `slot`'s mutex.
pub struct ConnectionRegistry {
    next_generation: AtomicU64,
    slot: Mutex<Option<ConnectionSlot>>,
}

impl Default for ConnectionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectionRegistry {
    pub fn new() -> Self {
        Self {
            next_generation: AtomicU64::new(0),
            slot: Mutex::new(None),
        }
    }

    pub fn issue_generation(&self) -> Result<u64, String> {
        self.next_generation
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
                if current < MAX_JS_SAFE_INTEGER {
                    Some(current + 1)
                } else {
                    None
                }
            })
            .map(|current| current + 1)
            .map_err(|_| "Connection generation space exhausted".to_string())
    }

    pub async fn open(&self, generation: u64, sink: Sender<Vec<u8>>, cleanup: ConnectionCleanup) {
        let previous = {
            let mut slot = self.slot.lock().await;
            if let Some(previous) = slot.as_mut() {
                previous.cleanup.request_stop();
            }
            slot.replace(ConnectionSlot {
                generation,
                sink,
                cleanup,
            })
        };

        // Abort is only a request, so old tasks may still emit their
        // generation-tagged final event. Never await them while the slot mutex
        // is held; dropping the previous sender happens here, outside it.
        drop(previous);
    }

    pub async fn close_if_current(&self, generation: u64) -> bool {
        let previous = {
            let mut slot = self.slot.lock().await;
            if slot.as_ref().map(|current| current.generation) != Some(generation) {
                return false;
            }
            let mut previous = slot.take();
            if let Some(previous) = previous.as_mut() {
                previous.cleanup.request_stop();
            }
            previous
        };

        drop(previous);
        true
    }

    async fn current_sender(&self) -> Option<(u64, Sender<Vec<u8>>)> {
        self.slot
            .lock()
            .await
            .as_ref()
            .map(|slot| (slot.generation, slot.sink.clone()))
    }
}

pub struct ActiveConnection {
    registry: ConnectionRegistry,
}

impl Default for ActiveConnection {
    fn default() -> Self {
        Self::new()
    }
}

impl ActiveConnection {
    pub fn new() -> Self {
        Self {
            registry: ConnectionRegistry::new(),
        }
    }

    pub fn issue_generation(&self) -> Result<u64, String> {
        self.registry.issue_generation()
    }

    pub async fn open_connection(
        &self,
        generation: u64,
        sink: Sender<Vec<u8>>,
        cleanup: ConnectionCleanup,
    ) {
        self.registry.open(generation, sink, cleanup).await;
    }

    pub async fn close_if_current(&self, generation: u64) -> bool {
        self.registry.close_if_current(generation).await
    }
}

pub fn emit_disconnected(app_handle: &AppHandle, generation: u64) {
    let _ = app_handle.emit(
        "connection_disconnected",
        ConnectionDisconnected { generation },
    );
}

#[command]
pub async fn transport_send_data(
    req: Request<'_>,
    app_handle: AppHandle,
    state: State<'_, ActiveConnection>,
) -> Result<(), ()> {
    let data = match req.body() {
        InvokeBody::Raw(data) => data.clone(),
        _ => return Err(()),
    };
    let (generation, mut sink) = state.registry.current_sender().await.ok_or(())?;

    // Never hold the lifecycle mutex across this await: a full mpsc channel
    // must not prevent another connection from opening or closing.
    if let Err(error) = sink.send(data).await {
        eprintln!("[Transport] Send failed: {:?}", error);
        if state.close_if_current(generation).await {
            emit_disconnected(&app_handle, generation);
        }
        return Err(());
    }

    Ok(())
}

#[command]
pub async fn transport_close(
    generation: u64,
    state: State<'_, ActiveConnection>,
) -> Result<(), ()> {
    state.close_if_current(generation).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::channel::mpsc::channel;
    use futures::{executor::block_on, StreamExt};
    use std::sync::atomic::AtomicBool;
    use std::sync::{Arc, Barrier};
    use std::time::Duration;

    #[test]
    fn stale_close_keeps_the_current_sink() {
        block_on(async {
            let registry = ConnectionRegistry::new();
            let first = registry.issue_generation().unwrap();
            let (sink1, _receiver1) = channel(1);
            registry
                .open(first, sink1, ConnectionCleanup::new(vec![]))
                .await;

            let second = registry.issue_generation().unwrap();
            let (sink2, mut receiver2) = channel(1);
            registry
                .open(second, sink2, ConnectionCleanup::new(vec![]))
                .await;

            assert!(!registry.close_if_current(first).await);
            let (_, mut current_sink) = registry.current_sender().await.expect("current sink");
            current_sink.send(vec![7]).await.unwrap();
            assert_eq!(receiver2.next().await, Some(vec![7]));
        });
    }

    #[test]
    fn current_close_only_clears_once() {
        block_on(async {
            let registry = ConnectionRegistry::new();
            let generation = registry.issue_generation().unwrap();
            let (sink, _receiver) = channel(1);
            registry
                .open(generation, sink, ConnectionCleanup::new(vec![]))
                .await;

            assert!(registry.close_if_current(generation).await);
            assert!(registry.current_sender().await.is_none());
            assert!(!registry.close_if_current(generation).await);
        });
    }

    #[test]
    fn new_connection_aborts_the_previous_task() {
        struct DropGuard(Arc<AtomicBool>);
        impl Drop for DropGuard {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }

        block_on(async {
            let registry = ConnectionRegistry::new();
            let first = registry.issue_generation().unwrap();
            let stopped = Arc::new(AtomicBool::new(false));
            let guard = DropGuard(stopped.clone());
            let old_task = tauri::async_runtime::spawn(async move {
                let _guard = guard;
                futures::future::pending::<()>().await;
            });
            let (sink1, _receiver1) = channel(1);
            registry
                .open(first, sink1, ConnectionCleanup::new(vec![old_task]))
                .await;

            let second = registry.issue_generation().unwrap();
            let (sink2, _receiver2) = channel(1);
            registry
                .open(second, sink2, ConnectionCleanup::new(vec![]))
                .await;

            async_std::future::timeout(Duration::from_secs(1), async {
                while !stopped.load(Ordering::SeqCst) {
                    async_std::task::sleep(Duration::from_millis(1)).await;
                }
            })
            .await
            .expect("old task must be cancelled, not merely asked to stop");
        });
    }

    #[test]
    fn stale_close_and_new_open_are_safe_in_either_lock_order() {
        for _ in 0..20 {
            let registry = Arc::new(ConnectionRegistry::new());
            let first = registry.issue_generation().unwrap();
            let (sink1, _receiver1) = channel(1);
            block_on(registry.open(first, sink1, ConnectionCleanup::new(vec![])));

            let second = registry.issue_generation().unwrap();
            let barrier = Arc::new(Barrier::new(3));
            let close_registry = registry.clone();
            let close_barrier = barrier.clone();
            let close = std::thread::spawn(move || {
                close_barrier.wait();
                block_on(close_registry.close_if_current(first));
            });
            let open_registry = registry.clone();
            let open_barrier = barrier.clone();
            let open = std::thread::spawn(move || {
                let (sink2, _receiver2) = channel(1);
                open_barrier.wait();
                block_on(open_registry.open(second, sink2, ConnectionCleanup::new(vec![])));
            });

            barrier.wait();
            close.join().unwrap();
            open.join().unwrap();
            assert_eq!(
                block_on(registry.current_sender()).map(|(generation, _)| generation),
                Some(second)
            );
        }
    }

    #[test]
    fn a_blocked_old_send_does_not_block_new_open_or_clear_it_after_failure() {
        let registry = Arc::new(ConnectionRegistry::new());
        let first = registry.issue_generation().unwrap();
        let (mut sink1, receiver1) = channel(1);
        sink1.try_send(vec![1]).unwrap();
        block_on(registry.open(first, sink1, ConnectionCleanup::new(vec![])));

        let (generation, mut blocked_sender) = block_on(registry.current_sender()).unwrap();
        let sender_thread = std::thread::spawn(move || {
            let _ = block_on(blocked_sender.send(vec![2]));
        });

        let second = registry.issue_generation().unwrap();
        let (sink2, _receiver2) = channel(1);
        block_on(registry.open(second, sink2, ConnectionCleanup::new(vec![])));
        std::thread::sleep(Duration::from_millis(50));
        assert!(!block_on(registry.close_if_current(generation)));
        assert_eq!(
            block_on(registry.current_sender()).map(|(current, _)| current),
            Some(second)
        );

        drop(receiver1);
        sender_thread.join().unwrap();
        assert_eq!(
            block_on(registry.current_sender()).map(|(current, _)| current),
            Some(second)
        );
    }

    #[test]
    fn issued_generations_stay_within_the_javascript_safe_integer_range() {
        let registry = ConnectionRegistry {
            next_generation: AtomicU64::new(MAX_JS_SAFE_INTEGER - 1),
            slot: Mutex::new(None),
        };
        assert_eq!(registry.issue_generation(), Ok(MAX_JS_SAFE_INTEGER));
        assert!(registry.issue_generation().is_err());
    }

    #[test]
    fn event_payloads_follow_the_transport_contract() {
        assert_eq!(
            serde_json::to_value(ConnectionData {
                generation: 4,
                data: vec![1, 2],
            })
            .unwrap(),
            serde_json::json!({"generation": 4, "data": [1, 2]})
        );
        assert_eq!(
            serde_json::to_value(ConnectionDisconnected { generation: 4 }).unwrap(),
            serde_json::json!({"generation": 4})
        );
    }
}
