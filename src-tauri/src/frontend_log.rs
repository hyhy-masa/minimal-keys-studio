#[tauri::command]
pub fn log_from_frontend(level: String, message: String, stack: Option<String>) {
    eprintln!("[APP][{level}] {message}");
    if let Some(stack) = stack {
        eprintln!("[APP][{level}] stack:\n{stack}");
    }
}
