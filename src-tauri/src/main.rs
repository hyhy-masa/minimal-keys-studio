// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;

mod flash;
mod frontend_log;
mod transport;
use frontend_log::{frontend_log_path, log_from_frontend};
use transport::commands::{transport_close, transport_send_data, ActiveConnection};

use transport::gatt::{gatt_connect, gatt_list_devices};
use transport::serial::{serial_connect, serial_list_devices};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            frontend_log::initialize(&app.handle());
            Ok(())
        })
        .manage(ActiveConnection::new())
        .manage(flash::FlashState::new())
        .invoke_handler(tauri::generate_handler![
            transport_send_data,
            transport_close,
            gatt_list_devices,
            gatt_connect,
            serial_list_devices,
            serial_connect,
            log_from_frontend,
            frontend_log_path,
            flash::fw_fetch_manifest,
            flash::fw_download_asset,
            flash::flash_scan_volumes,
            flash::flash_wait_for_bootloader,
            flash::flash_write_uf2,
            flash::flash_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
