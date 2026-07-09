//! Tauri command layer — thin wrappers around `mk-flash-core`.
//!
//! Every command runs the (synchronous, blocking) core on a blocking thread so
//! the UI stays responsive. Safety gates that the plan requires on the customer
//! path live here: **UF2 validation before every write**, the Board-ID preflight
//! (via `FlashConfig`), an app-cache download dir (never a CWD-relative path),
//! single-flight, and cooperative cancel.

use mk_flash_core::{
    acquire_bootloader, download, flash_uf2, parse_hex_u32, scan_bootloader_volumes, validate_uf2,
    CancelFlag, FlashConfig, FlashError, FlashOutcome, FlashProgress, FwAsset, FwManifest,
    MINIMAL_KEYS_BOARD_ID_PREFIX, RealEnv, Uf2Limits, VolumeEntry,
};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::Manager;

/// Shared, managed flash state: a cancel flag the UI can trip, and a single-flight
/// guard so two writes can never race the same volume.
pub struct FlashState {
    cancel: Arc<CancelFlag>,
    busy: AtomicBool,
}

impl FlashState {
    pub fn new() -> Self {
        Self {
            cancel: Arc::new(CancelFlag::new()),
            busy: AtomicBool::new(false),
        }
    }
}

impl Default for FlashState {
    fn default() -> Self {
        Self::new()
    }
}

/// RAII single-flight guard: only one flash/wait op runs at a time.
struct BusyGuard<'a>(&'a AtomicBool);
impl<'a> BusyGuard<'a> {
    fn acquire(b: &'a AtomicBool) -> Result<Self, FlashError> {
        if b.swap(true, Ordering::SeqCst) {
            Err(FlashError::Io {
                reason: "another operation is already running".into(),
            })
        } else {
            Ok(BusyGuard(b))
        }
    }
}
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn join_err(e: impl std::fmt::Display) -> FlashError {
    FlashError::Io {
        reason: e.to_string(),
    }
}

#[tauri::command]
pub async fn fw_fetch_manifest(url: String) -> Result<FwManifest, FlashError> {
    tauri::async_runtime::spawn_blocking(move || download::fetch_manifest(&url))
        .await
        .map_err(join_err)?
}

#[tauri::command]
pub async fn fw_download_asset(app: tauri::AppHandle, asset: FwAsset) -> Result<String, FlashError> {
    // Resolve inside the app cache dir — never a CWD-relative path (a Finder /
    // Explorer launch has CWD=`/`).
    let dir = app.path().app_cache_dir().map_err(join_err)?.join("firmware");
    tauri::async_runtime::spawn_blocking(move || {
        download::download_asset(&asset, &dir).map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(join_err)?
}

#[tauri::command]
pub async fn flash_scan_volumes() -> Result<Vec<VolumeEntry>, FlashError> {
    tauri::async_runtime::spawn_blocking(|| Ok(scan_bootloader_volumes(&RealEnv::new())))
        .await
        .map_err(join_err)?
}

#[tauri::command]
pub async fn flash_wait_for_bootloader(
    state: tauri::State<'_, FlashState>,
    baseline: Vec<String>,
    timeout_secs: u64,
) -> Result<VolumeEntry, FlashError> {
    let _guard = BusyGuard::acquire(&state.busy)?;
    let cancel = state.cancel.clone();
    cancel.reset();
    tauri::async_runtime::spawn_blocking(move || {
        let env = RealEnv::new();
        acquire_bootloader(
            &env,
            &baseline,
            Some(MINIMAL_KEYS_BOARD_ID_PREFIX),
            Duration::from_secs(timeout_secs),
            Duration::from_millis(500),
            &cancel,
        )
    })
    .await
    .map_err(join_err)?
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn flash_write_uf2(
    state: tauri::State<'_, FlashState>,
    volume: String,
    filename: String,
    uf2_path: String,
    sha256: String,
    target_addr_min: Option<String>,
    target_addr_max: Option<String>,
    on_progress: Channel<FlashProgress>,
) -> Result<FlashOutcome, FlashError> {
    let _guard = BusyGuard::acquire(&state.busy)?;
    let cancel = state.cancel.clone();
    cancel.reset();
    tauri::async_runtime::spawn_blocking(move || {
        let data = std::fs::read(&uf2_path).map_err(|e| FlashError::Io {
            reason: e.to_string(),
        })?;
        // Validate BEFORE writing: structure + familyID + address window + SHA.
        // This is the customer-path gate that was previously missing.
        let mut limits = Uf2Limits::default();
        if !sha256.is_empty() {
            limits.expected_sha256 = Some(sha256);
        }
        if let Some(m) = target_addr_min.as_deref().and_then(parse_hex_u32) {
            limits.target_addr_min = m;
        }
        if let Some(m) = target_addr_max.as_deref().and_then(parse_hex_u32) {
            limits.target_addr_max = m;
        }
        validate_uf2(&data, &limits)?;

        let env = RealEnv::new();
        flash_uf2(
            &env,
            Path::new(&volume),
            &filename,
            &data,
            &FlashConfig::default(),
            &mut |p| {
                let _ = on_progress.send(p);
            },
            &cancel,
        )
    })
    .await
    .map_err(join_err)?
}

#[tauri::command]
pub fn flash_cancel(state: tauri::State<'_, FlashState>) {
    state.cancel.cancel();
}
