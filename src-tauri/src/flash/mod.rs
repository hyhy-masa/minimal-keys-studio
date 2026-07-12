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
    DEFAULT_TARGET_ADDR_MAX, DEFAULT_TARGET_ADDR_MIN, MINIMAL_KEYS_BOARD_ID_PREFIX, RealEnv,
    Uf2Limits, VolumeEntry,
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
    adopt_present: bool,
    timeout_secs: u64,
) -> Result<mk_flash_core::AcquiredVolume, FlashError> {
    let _guard = BusyGuard::acquire(&state.busy)?;
    let cancel = state.cancel.clone();
    cancel.reset();
    tauri::async_runtime::spawn_blocking(move || {
        let env = RealEnv::new();
        acquire_bootloader(
            &env,
            &baseline,
            Some(MINIMAL_KEYS_BOARD_ID_PREFIX),
            adopt_present,
            Duration::from_secs(timeout_secs),
            Duration::from_millis(500),
            &cancel,
        )
    })
    .await
    .map_err(join_err)?
}

/// Build the UF2 validation limits for a customer-path write.
///
/// This is the single gate between a (potentially supply-chain-tampered)
/// manifest and an *irreversible* write, so it is fail-closed and clamp-only:
///
/// * **F-1 — SHA is mandatory.** `asset.sha256` is a required manifest field, so
///   an empty hash here means something upstream dropped it: refuse to write
///   rather than silently skip hash verification.
/// * **F-2 — a malformed address window is an error**, never a silent skip that
///   would fall back to the (wider) default window.
/// * **F-3 — the manifest may only *narrow* the window.** The default window
///   (`0x27000..=0xF4000`, below the MBR / SoftDevice / bootloader) is a hard
///   ceiling clamped via `max`/`min`, so a hostile manifest can never widen the
///   write into the bootloader region and brick the board.
fn build_limits(
    sha256: &str,
    target_addr_min: Option<&str>,
    target_addr_max: Option<&str>,
) -> Result<Uf2Limits, FlashError> {
    if sha256.trim().is_empty() {
        return Err(FlashError::ManifestInvalid {
            reason: "missing sha256 for flash target".into(),
        });
    }
    let mut limits = Uf2Limits {
        expected_sha256: Some(sha256.to_string()),
        ..Uf2Limits::default()
    };
    if let Some(s) = target_addr_min {
        let m = parse_hex_u32(s).ok_or_else(|| FlashError::ManifestInvalid {
            reason: format!("bad target_addr_min {s:?}"),
        })?;
        limits.target_addr_min = m.max(DEFAULT_TARGET_ADDR_MIN);
    }
    if let Some(s) = target_addr_max {
        let m = parse_hex_u32(s).ok_or_else(|| FlashError::ManifestInvalid {
            reason: format!("bad target_addr_max {s:?}"),
        })?;
        limits.target_addr_max = m.min(DEFAULT_TARGET_ADDR_MAX);
    }
    Ok(limits)
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
        // `build_limits` is fail-closed: mandatory SHA (F-1), error on a bad
        // window (F-2), and clamp-only so the manifest can never widen the
        // window into the bootloader region (F-3).
        let limits = build_limits(
            &sha256,
            target_addr_min.as_deref(),
            target_addr_max.as_deref(),
        )?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use mk_flash_core::sha256_hex;

    /// Build a syntactically valid single-block UF2 targeting `start`.
    fn make_uf2_block(start: u32) -> Vec<u8> {
        use mk_flash_core::uf2::{
            UF2_BLOCK_SIZE, UF2_FLAG_FAMILY_ID_PRESENT, UF2_MAGIC_END, UF2_MAGIC_START0,
            UF2_MAGIC_START1,
        };
        use mk_flash_core::FAMILY_ID_NRF52840;
        let mut b = vec![0u8; UF2_BLOCK_SIZE];
        b[0x00..0x04].copy_from_slice(&UF2_MAGIC_START0.to_le_bytes());
        b[0x04..0x08].copy_from_slice(&UF2_MAGIC_START1.to_le_bytes());
        b[0x08..0x0C].copy_from_slice(&UF2_FLAG_FAMILY_ID_PRESENT.to_le_bytes());
        b[0x0C..0x10].copy_from_slice(&start.to_le_bytes());
        b[0x10..0x14].copy_from_slice(&256u32.to_le_bytes()); // payloadSize
        b[0x14..0x18].copy_from_slice(&0u32.to_le_bytes()); // blockNo
        b[0x18..0x1C].copy_from_slice(&1u32.to_le_bytes()); // numBlocks
        b[0x1C..0x20].copy_from_slice(&FAMILY_ID_NRF52840.to_le_bytes());
        b[0x1FC..0x200].copy_from_slice(&UF2_MAGIC_END.to_le_bytes());
        b
    }

    // F-1: an empty (or whitespace-only) sha must be rejected, never treated as
    // "skip hash verification".
    #[test]
    fn build_limits_rejects_empty_sha() {
        assert!(matches!(
            build_limits("", None, None),
            Err(FlashError::ManifestInvalid { .. })
        ));
        assert!(matches!(
            build_limits("   ", None, None),
            Err(FlashError::ManifestInvalid { .. })
        ));
    }

    // F-2: a malformed address window must be an error, not a silent fall-back to
    // the default (wider) window.
    #[test]
    fn build_limits_rejects_bad_hex_window() {
        assert!(matches!(
            build_limits("aa", Some("nope"), None),
            Err(FlashError::ManifestInvalid { .. })
        ));
        assert!(matches!(
            build_limits("aa", None, Some("zzz")),
            Err(FlashError::ManifestInvalid { .. })
        ));
    }

    // F-3: a manifest that tries to WIDEN the window is clamped back to default.
    #[test]
    fn build_limits_clamps_widening_window() {
        let l = build_limits("aa", Some("0x1000"), Some("0xFF000")).expect("valid");
        assert_eq!(l.target_addr_min, DEFAULT_TARGET_ADDR_MIN);
        assert_eq!(l.target_addr_max, DEFAULT_TARGET_ADDR_MAX);
        assert_eq!(l.expected_sha256.as_deref(), Some("aa"));
    }

    // F-3: narrowing (raising min, lowering max) is legitimate and honored.
    #[test]
    fn build_limits_allows_narrowing_window() {
        let l = build_limits("aa", Some("0x30000"), Some("0xE0000")).expect("valid");
        assert_eq!(l.target_addr_min, 0x30000);
        assert_eq!(l.target_addr_max, 0xE0000);
    }

    // F-3 end-to-end: the clamp actually blocks a write into the bootloader
    // region (the only structural brick path). The control proves the clamp is
    // load-bearing: the same image validates under the raw widened window.
    #[test]
    fn widen_clamp_blocks_bootloader_region_write() {
        let uf2 = make_uf2_block(0x000F_5000); // above default max 0xF4000
        let sha = sha256_hex(&uf2);

        // Control: without the clamp, the widened window would admit the image.
        let widened = Uf2Limits {
            target_addr_max: 0x000F_F000,
            expected_sha256: Some(sha.clone()),
            ..Uf2Limits::default()
        };
        assert!(validate_uf2(&uf2, &widened).is_ok());

        // With build_limits the widening manifest is clamped to the default max,
        // so the bootloader-region write is rejected before it ever happens.
        let clamped = build_limits(&sha, Some("0x27000"), Some("0xFF000")).expect("valid");
        assert_eq!(clamped.target_addr_max, DEFAULT_TARGET_ADDR_MAX);
        assert!(matches!(
            validate_uf2(&uf2, &clamped),
            Err(FlashError::InvalidUf2 { .. })
        ));
    }
}
