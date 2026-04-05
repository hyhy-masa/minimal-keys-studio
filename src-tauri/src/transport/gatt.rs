use async_std::future::timeout;
use futures::future::ready;
use futures::{channel::mpsc::channel, FutureExt};
use futures::{StreamExt, TryFutureExt};

use std::collections::HashSet;
use std::time::Duration;
use uuid::Uuid;

use bluest::{Adapter, ConnectionEvent, Device, DeviceId};

use tauri::{command, AppHandle, State};

const SVC_UUID: Uuid = Uuid::from_u128(0x00000000_0196_6107_c967_c5cfb1c2482a);
const RPC_CHRC_UUID: Uuid = Uuid::from_u128(0x00000001_0196_6107_c967_c5cfb1c2482a);

#[command]
pub async fn gatt_connect(
    id: String,
    app_handle: AppHandle,
    state: State<'_, super::commands::ActiveConnection<'_>>,
) -> Result<bool, String> {
    let adapter = Adapter::default().await.ok_or("Failed to access the BT adapter".to_string())?;

    adapter.wait_available().await.map_err(|e| format!("Failed to wait for the BT adapter access: {}", e.message()))?;

    let device_id: DeviceId = serde_json::from_str(&id).unwrap();
    let d = adapter.open_device(&device_id).await.map_err(|e| format!("Failed to open the device: {}", e.message()))?;

    if !d.is_connected().await {
        adapter.connect_device(&d).await.map_err(|e| format!("Failed to connect to the device: {}", e.message()))?;
    }

    let service = d
        .discover_services_with_uuid(SVC_UUID)
        .await
        .map_err(|e| format!("Failed to find the device services: {}", e.message()))?
        .get(0)
        .cloned();

    if let Some(s) = service {
        let char = s
            .discover_characteristics_with_uuid(RPC_CHRC_UUID)
            .await
            .map_err(|e| format!("Failed to find the studio service characteristics: {}", e.message()))?
            .get(0)
            .cloned();

        if let Some(c) = char {
            let c2 = c.clone();
            let ah1 = app_handle.clone();
            let notify_handle = tauri::async_runtime::spawn(async move {
                if let Ok(mut n) = c2.notify().await {
                    use tauri::Emitter;

                    while let Some(Ok(vn)) = n.next().await {
                        ah1.emit("connection_data", vn.clone());
                    }
                }
            });

            // Oneshot channel to signal app-initiated disconnect
            let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

            let ah2 = app_handle.clone();
            let disconnect_handle = tauri::async_runtime::spawn(async move {
                // Need to keep adapter from being dropped while active/connected
                let a = adapter;

                use tauri::Emitter;
                use tauri::Manager;

                enum DisconnectReason {
                    DeviceDisconnected,
                    AppRequested,
                    EventStreamEnded,
                }

                let reason = if let Ok(mut events) = a.device_connection_events(&d).await {
                    tokio::select! {
                        result = async {
                            while let Some(ev) = events.next().await {
                                if ev == ConnectionEvent::Disconnected {
                                    return DisconnectReason::DeviceDisconnected;
                                }
                            }
                            DisconnectReason::EventStreamEnded
                        } => result,
                        _ = shutdown_rx => DisconnectReason::AppRequested,
                    }
                } else {
                    let _ = shutdown_rx.await;
                    DisconnectReason::AppRequested
                };

                match reason {
                    DisconnectReason::DeviceDisconnected => {
                        // Device disconnected on its own - notify the app
                        let state = ah2.state::<super::commands::ActiveConnection>();
                        *state.conn.lock().await = None;
                        if let Err(e) = ah2.emit("connection_disconnected", ()) {
                            println!("ERROR RAISING! {:?}", e);
                        }
                    }
                    DisconnectReason::AppRequested | DisconnectReason::EventStreamEnded => {
                        // App requested disconnect - properly close BLE connection
                        println!("[BLE] Disconnecting device...");
                        let _ = a.disconnect_device(&d).await;
                        println!("[BLE] Device disconnected");
                    }
                }
            });

            let (send, mut recv) = channel(5);
            *state.conn.lock().await = Some(Box::new(send));
            let ah3 = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(data) = recv.next().await {
                    if let Err(e) = c.write(&data).await {
                        eprintln!("[BLE] Write failed: {:?}", e);
                        // Notify JS side of disconnect
                        {
                            use tauri::Emitter;
                            let _ = ah3.emit("connection_disconnected", ());
                        }
                        break;
                    }
                }

                // Signal disconnect handler to properly disconnect BLE device
                let _ = shutdown_tx.send(());
                notify_handle.abort();
                // Wait for disconnect handler to finish cleanup
                let _ = disconnect_handle.await;
            });

            Ok(true)
        } else {
            Err("Failed to connect: Unable to locate the required studio GATT characteristic".to_string())
        }
    } else {
        Err("Failed to connect: Unable to locate the required studio GATT service".to_string())
    }
}

#[cfg(target_os = "macos")]
async fn check_connected(adapter: &Adapter, device: &Device) -> bool {
    if let Ok(()) = adapter.connect_device(&device).await {
        true
    } else {
        false
    }
}

#[cfg(not(target_os = "macos"))]
async fn check_connected(_: &Adapter, device: &Device) -> bool {
    device.is_connected().await
}

const ADAPTER_TIMEOUT: Duration = Duration::from_secs(2);

#[command]
pub async fn gatt_list_devices() -> Result<Vec<super::commands::AvailableDevice>, ()> {
    let adapter = Adapter::default()
        .map(|a| a.ok_or(()))
        .and_then(|a| async {
            timeout(ADAPTER_TIMEOUT, a.wait_available())
                .await
                .map_err(|_| ())
                .map(|_| a)
        })
        .await;

    let mut ret = vec![];

    if let Ok(a) = adapter {
        // First: get already-connected devices (instant, no scan needed)
        if let Ok(connected) = a.connected_devices_with_services(&[SVC_UUID]).await {
            println!("[BLE scan] Found {} connected device(s)", connected.len());
            for device in &connected {
                let label = device.name_async().await.unwrap_or("Unknown".to_string());
                let id = serde_json::to_string(&device.id()).unwrap();
                println!("[BLE scan] Connected: {} ({})", label, id);
                ret.push(super::commands::AvailableDevice { label, id });
            }
        }

        // Then: scan for advertising devices (5 seconds)
        let mut seen_ids: HashSet<String> = ret.iter().map(|d| d.id.clone()).collect();
        if let Ok(scan_stream) = a
            .scan(&[SVC_UUID])
            .await
        {
            let devices = scan_stream
                .take_until(async_std::task::sleep(Duration::from_secs(5)));

            futures::pin_mut!(devices);

            while let Some(adv_device) = devices.next().await {
                let device = adv_device.device;
                let id = serde_json::to_string(&device.id()).unwrap();
                if !seen_ids.insert(id.clone()) {
                    continue;
                }
                let label = device.name_async().await.unwrap_or("Unknown".to_string());
                println!("[BLE scan] Advertising: {} ({})", label, id);
                ret.push(super::commands::AvailableDevice { label, id });
            }
        }

        println!("[BLE scan] Total: {} device(s)", ret.len());
    }

    Ok(ret)
}
