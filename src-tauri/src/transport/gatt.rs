use async_std::future::timeout;
use futures::{channel::mpsc::channel, FutureExt, StreamExt, TryFutureExt};

use std::collections::HashSet;
use std::time::Duration;
use uuid::Uuid;

use bluest::{Adapter, ConnectionEvent, Device, DeviceId};
use tauri::{command, AppHandle, Emitter, Manager, State};

use super::commands::{emit_disconnected, ConnectionCleanup, ConnectionData};

const SVC_UUID: Uuid = Uuid::from_u128(0x00000000_0196_6107_c967_c5cfb1c2482a);
const RPC_CHRC_UUID: Uuid = Uuid::from_u128(0x00000001_0196_6107_c967_c5cfb1c2482a);

async fn disconnect_if_owned(adapter: &Adapter, device: &Device, connected_by_this_attempt: bool) {
    if connected_by_this_attempt {
        let _ = adapter.disconnect_device(device).await;
    }
}

#[command]
pub async fn gatt_connect(
    id: String,
    app_handle: AppHandle,
    state: State<'_, super::commands::ActiveConnection>,
) -> Result<super::commands::ConnectionHandle, String> {
    let adapter = Adapter::default()
        .await
        .ok_or("Failed to access the BT adapter".to_string())?;
    adapter
        .wait_available()
        .await
        .map_err(|e| format!("Failed to wait for the BT adapter access: {}", e.message()))?;

    let device_id: DeviceId = serde_json::from_str(&id).unwrap();
    let device = adapter
        .open_device(&device_id)
        .await
        .map_err(|e| format!("Failed to open the device: {}", e.message()))?;

    let connected_by_this_attempt = if device.is_connected().await {
        false
    } else {
        adapter
            .connect_device(&device)
            .await
            .map_err(|e| format!("Failed to connect to the device: {}", e.message()))?;
        true
    };

    let service = match device.discover_services_with_uuid(SVC_UUID).await {
        Ok(services) => services.into_iter().next(),
        Err(e) => {
            disconnect_if_owned(&adapter, &device, connected_by_this_attempt).await;
            return Err(format!(
                "Failed to find the device services: {}",
                e.message()
            ));
        }
    };
    let service = match service {
        Some(service) => service,
        None => {
            disconnect_if_owned(&adapter, &device, connected_by_this_attempt).await;
            return Err(
                "Failed to connect: Unable to locate the required studio GATT service".to_string(),
            );
        }
    };

    let characteristic = match service
        .discover_characteristics_with_uuid(RPC_CHRC_UUID)
        .await
    {
        Ok(characteristics) => characteristics.into_iter().next(),
        Err(e) => {
            disconnect_if_owned(&adapter, &device, connected_by_this_attempt).await;
            return Err(format!(
                "Failed to find the studio service characteristics: {}",
                e.message()
            ));
        }
    };
    let characteristic = match characteristic {
        Some(characteristic) => characteristic,
        None => {
            disconnect_if_owned(&adapter, &device, connected_by_this_attempt).await;
            return Err(
                "Failed to connect: Unable to locate the required studio GATT characteristic"
                    .to_string(),
            );
        }
    };

    let generation = state.issue_generation()?;
    let (send, mut recv) = channel::<Vec<u8>>(5);
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    let notify_characteristic = characteristic.clone();
    let notify_app_handle = app_handle.clone();
    let notify_task = tauri::async_runtime::spawn(async move {
        if let Ok(mut notifications) = notify_characteristic.notify().await {
            while let Some(Ok(value)) = notifications.next().await {
                let _ = notify_app_handle.emit(
                    "connection_data",
                    ConnectionData {
                        generation,
                        data: value,
                    },
                );
            }
        }
    });

    let disconnect_app_handle = app_handle.clone();
    let disconnect_task = tauri::async_runtime::spawn(async move {
        enum DisconnectReason {
            DeviceDisconnected,
            AppRequested,
            EventStreamEnded,
        }

        let reason = if let Ok(mut events) = adapter.device_connection_events(&device).await {
            tokio::select! {
                result = async {
                    while let Some(event) = events.next().await {
                        if event == ConnectionEvent::Disconnected {
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
            DisconnectReason::AppRequested => {
                let _ = adapter.disconnect_device(&device).await;
            }
            DisconnectReason::DeviceDisconnected | DisconnectReason::EventStreamEnded => {
                let state = disconnect_app_handle.state::<super::commands::ActiveConnection>();
                if state.close_if_current(generation).await {
                    emit_disconnected(&disconnect_app_handle, generation);
                }
            }
        }
    });

    let write_app_handle = app_handle.clone();
    let write_task = tauri::async_runtime::spawn(async move {
        while let Some(data) = recv.next().await {
            if let Err(error) = characteristic.write(&data).await {
                eprintln!("[BLE] Write failed: {:?}", error);
                let state = write_app_handle.state::<super::commands::ActiveConnection>();
                if state.close_if_current(generation).await {
                    emit_disconnected(&write_app_handle, generation);
                }
                break;
            }
        }
    });

    state
        .open_connection(
            generation,
            send,
            ConnectionCleanup::with_ble_shutdown(
                vec![notify_task, write_task],
                shutdown_tx,
                disconnect_task,
            ),
        )
        .await;

    Ok(super::commands::ConnectionHandle { generation })
}

const ADAPTER_TIMEOUT: Duration = Duration::from_secs(2);

#[command]
pub async fn gatt_list_devices() -> Result<Vec<super::commands::AvailableDevice>, ()> {
    let adapter = Adapter::default()
        .map(|adapter| adapter.ok_or(()))
        .and_then(|adapter| async {
            timeout(ADAPTER_TIMEOUT, adapter.wait_available())
                .await
                .map_err(|_| ())
                .map(|_| adapter)
        })
        .await;

    let mut devices = vec![];
    if let Ok(adapter) = adapter {
        if let Ok(connected) = adapter.connected_devices_with_services(&[SVC_UUID]).await {
            for device in &connected {
                let label = device.name_async().await.unwrap_or("Unknown".to_string());
                let id = serde_json::to_string(&device.id()).unwrap();
                devices.push(super::commands::AvailableDevice { label, id });
            }
        }

        let mut seen_ids: HashSet<String> =
            devices.iter().map(|device| device.id.clone()).collect();
        if let Ok(scan_stream) = adapter.scan(&[SVC_UUID]).await {
            let devices_stream =
                scan_stream.take_until(async_std::task::sleep(Duration::from_secs(5)));
            futures::pin_mut!(devices_stream);
            while let Some(advertisement) = devices_stream.next().await {
                let device = advertisement.device;
                let id = serde_json::to_string(&device.id()).unwrap();
                if !seen_ids.insert(id.clone()) {
                    continue;
                }
                let label = device.name_async().await.unwrap_or("Unknown".to_string());
                devices.push(super::commands::AvailableDevice { label, id });
            }
        }
    }

    Ok(devices)
}
