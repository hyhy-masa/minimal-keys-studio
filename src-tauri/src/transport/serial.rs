use blocking::unblock;
use futures::channel::mpsc::channel;
use futures::StreamExt;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_serial::{available_ports, SerialPortBuilderExt, SerialPortType};

use tauri::{command, AppHandle, Emitter, Manager, State};
use tauri_plugin_cli::CliExt;

use super::commands::{emit_disconnected, ConnectionCleanup, ConnectionData};

const READ_BUF_SIZE: usize = 1024;

#[command]
pub async fn serial_connect(
    id: String,
    app_handle: AppHandle,
    state: State<'_, super::commands::ActiveConnection>,
) -> Result<super::commands::ConnectionHandle, String> {
    eprintln!("[USB] Opening port: {id}");
    match tokio_serial::new(id.clone(), 9600).open_native_async() {
        Ok(mut port) => {
            #[cfg(unix)]
            port.set_exclusive(false)
                .expect("Unable to set serial port exclusive to false");

            let generation = state.issue_generation()?;
            let (mut reader, mut writer) = tokio::io::split(port);
            let (send, mut recv) = channel::<Vec<u8>>(5);

            let read_app_handle = app_handle.clone();
            let read_process = tauri::async_runtime::spawn(async move {
                let mut buffer = vec![0; READ_BUF_SIZE];
                loop {
                    match reader.read(&mut buffer).await {
                        Ok(0) => {
                            eprintln!("[USB] Read task ended: EOF");
                            break;
                        }
                        Ok(size) => {
                            let _ = read_app_handle.emit(
                                "connection_data",
                                ConnectionData {
                                    generation,
                                    data: buffer[..size].to_vec(),
                                },
                            );
                        }
                        Err(error) => {
                            eprintln!("[USB] Read task ended with error: {error}");
                            break;
                        }
                    }
                }

                let state = read_app_handle.state::<super::commands::ActiveConnection>();
                if state.close_if_current(generation).await {
                    emit_disconnected(&read_app_handle, generation);
                }
            });

            let write_app_handle = app_handle.clone();
            let write_process = tauri::async_runtime::spawn(async move {
                while let Some(data) = recv.next().await {
                    if let Err(error) = writer.write_all(&data).await {
                        eprintln!("[USB] Write failed: {error}");
                        break;
                    }
                }

                let state = write_app_handle.state::<super::commands::ActiveConnection>();
                if state.close_if_current(generation).await {
                    emit_disconnected(&write_app_handle, generation);
                }
            });

            state
                .open_connection(
                    generation,
                    send,
                    ConnectionCleanup::new(vec![read_process, write_process]),
                )
                .await;

            eprintln!("[USB] Connection established (generation {generation})");
            Ok(super::commands::ConnectionHandle { generation })
        }
        Err(e) => {
            eprintln!("[USB] Failed to open port {id}: {}", e.description);
            Err(format!("Failed to open the serial port: {}", e.description))
        }
    }
}

#[command]
pub async fn serial_list_devices(
    app_handle: AppHandle,
) -> Result<Vec<super::commands::AvailableDevice>, ()> {
    let ports = unblock(available_ports).await.unwrap();

    let mut candidates = ports
        .into_iter()
        .filter_map(|pi| {
            if let SerialPortType::UsbPort(u) = pi.port_type {
                // macOS exposes each serial device as both callout (cu.*) and dial-in
                // (tty.*) nodes. Dial-in nodes may block waiting for carrier detect.
                if pi.port_name.starts_with("/dev/tty.") {
                    return None;
                }

                Some(super::commands::AvailableDevice {
                    id: pi.port_name,
                    label: u.product.unwrap_or("Unnamed device".to_string()),
                })
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    if let Ok(m) = app_handle.cli().matches() {
        if let Some(p) = m.args.get("serial-port") {
            if let serde_json::Value::String(path) = &p.value {
                candidates.push(super::commands::AvailableDevice {
                    id: path.to_string(),
                    label: format!("CLI Port: {path}"),
                })
            }
        }
    }

    eprintln!("[USB] Found {} port(s)", candidates.len());
    for candidate in &candidates {
        eprintln!("[USB] Port: id={}, label={}", candidate.id, candidate.label);
    }

    Ok(candidates)
}
