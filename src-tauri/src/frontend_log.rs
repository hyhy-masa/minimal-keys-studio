use std::{
    fmt::Display,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};

use tauri::{AppHandle, Manager};

const LOG_FILE_NAME: &str = "minimal-keys-studio.log";
const MAX_LOG_FILE_BYTES: u64 = 1_024 * 1_024;
const MAX_ARCHIVED_LOG_FILES: usize = 4;
const MAX_LOG_ENTRY_CHARS: usize = 8_000;

static LOG_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

fn log_path() -> &'static Mutex<Option<PathBuf>> {
    LOG_PATH.get_or_init(|| Mutex::new(None))
}

pub fn initialize(app: &AppHandle) {
    let Ok(directory) = app.path().app_log_dir() else {
        return;
    };
    if fs::create_dir_all(&directory).is_err() {
        return;
    }
    if let Ok(mut path) = log_path().lock() {
        *path = Some(directory.join(LOG_FILE_NAME));
    }
}

fn rotate_if_needed(path: &PathBuf) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if metadata.len() < MAX_LOG_FILE_BYTES {
        return;
    }

    let oldest = path.with_extension(MAX_ARCHIVED_LOG_FILES.to_string());
    let _ = fs::remove_file(oldest);
    for index in (1..MAX_ARCHIVED_LOG_FILES).rev() {
        let source = path.with_extension(index.to_string());
        let target = path.with_extension((index + 1).to_string());
        let _ = fs::rename(source, target);
    }
    let _ = fs::rename(path, path.with_extension("1"));
}

fn write_line(message: &str) {
    let Ok(path) = log_path().lock() else {
        return;
    };
    let Some(path) = path.as_ref() else {
        return;
    };

    rotate_if_needed(path);
    let entry = message
        .chars()
        .take(MAX_LOG_ENTRY_CHARS)
        .collect::<String>();
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{entry}");
    }
}

pub fn diagnostic(message: impl Display) {
    let message = message.to_string();
    eprintln!("{message}");
    write_line(&message);
}

#[tauri::command]
pub fn log_from_frontend(level: String, message: String, stack: Option<String>) {
    diagnostic(format!("[APP][{level}] {message}"));
    if let Some(stack) = stack {
        diagnostic(format!("[APP][{level}] stack:\n{stack}"));
    }
}

#[tauri::command]
pub fn frontend_log_path(app: AppHandle) -> Option<String> {
    app.path()
        .app_log_dir()
        .ok()
        .map(|directory| directory.join(LOG_FILE_NAME).display().to_string())
}
