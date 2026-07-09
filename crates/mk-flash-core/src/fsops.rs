//! Filesystem + time abstraction so the flash state machine is unit-testable.
//!
//! `RealEnv` is the production implementation (macOS `/Volumes`, Windows drive
//! probing). Tests inject a mock `FlashEnv` that scripts write outcomes and
//! mount/unmount transitions without touching real hardware.

use serde::Serialize;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::time::Duration;

/// A candidate UF2 bootloader volume.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VolumeEntry {
    /// Mount path: `/Volumes/XIAO-SENSE` (macOS) or `E:\` (Windows).
    pub path: String,
    pub label: String,
    pub info_uf2: Option<String>,
    pub board_id: Option<String>,
}

/// Result of one OS-level write attempt.
#[derive(Debug, Clone, PartialEq)]
pub struct WriteAttempt {
    /// Bytes successfully written before completion or error.
    pub written: u64,
    /// `None` = clean completion; `Some(errno)` = failed/interrupted.
    pub errno: Option<i32>,
}

/// Abstraction over the pieces of the environment the flashing core touches.
pub trait FlashEnv {
    /// Removable volumes that look like UF2 bootloaders (have `INFO_UF2.TXT`).
    fn list_uf2_volumes(&self) -> Vec<VolumeEntry>;
    /// Is this volume still mounted? (used to detect the post-write reboot)
    fn volume_present(&self, path: &Path) -> bool;
    /// Re-read `INFO_UF2.TXT` (TOCTOU-safe preflight).
    fn read_info_uf2(&self, path: &Path) -> Option<String>;
    /// Write `data` to `<path>/<filename>` in `chunk`-sized writes.
    fn write_attempt(
        &self,
        path: &Path,
        filename: &str,
        data: &[u8],
        chunk: usize,
        progress: &mut dyn FnMut(u64),
    ) -> WriteAttempt;
    /// Sleep (a no-op in tests so the state machine runs instantly).
    fn sleep(&self, d: Duration);
}

/// Extract the `Board-ID:` value from an `INFO_UF2.TXT` body.
pub fn parse_board_id(info: &str) -> Option<String> {
    for line in info.lines() {
        if let Some(rest) = line.trim().strip_prefix("Board-ID:") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

/// The real, on-machine environment.
#[derive(Debug, Default)]
pub struct RealEnv;

impl RealEnv {
    pub fn new() -> Self {
        RealEnv
    }
}

impl FlashEnv for RealEnv {
    fn list_uf2_volumes(&self) -> Vec<VolumeEntry> {
        real_list_uf2_volumes()
    }

    fn volume_present(&self, path: &Path) -> bool {
        // Presence is keyed on INFO_UF2.TXT: it is readable while the bootloader
        // is mounted and vanishes when the board reboots. On Windows this also
        // dodges the drive-letter-root-"exists" quirk.
        path.join("INFO_UF2.TXT").exists()
    }

    fn read_info_uf2(&self, path: &Path) -> Option<String> {
        std::fs::read_to_string(path.join("INFO_UF2.TXT")).ok()
    }

    fn write_attempt(
        &self,
        path: &Path,
        filename: &str,
        data: &[u8],
        chunk: usize,
        progress: &mut dyn FnMut(u64),
    ) -> WriteAttempt {
        let target = path.join(filename);
        let mut written: u64 = 0;
        // NOTE: we use std::fs (no `cp`), so no AppleDouble `._` sidecar is ever
        // created — this is the `cp -X` behaviour the shell scripts needed for
        // old (0.6.x) bootloaders, achieved structurally.
        // NOTE: an IO error without a raw OS errno (e.g. WriteZero) must NOT be
        // reported as `None` — `None` means "clean completion" to the state
        // machine and would be mistaken for success (M3). Map it to a sentinel.
        let errno_of = |e: &std::io::Error| e.raw_os_error().or(Some(-1));
        let mut f = match File::create(&target) {
            Ok(f) => f,
            Err(e) => {
                return WriteAttempt {
                    written: 0,
                    errno: errno_of(&e),
                }
            }
        };
        for c in data.chunks(chunk.max(1)) {
            if let Err(e) = f.write_all(c) {
                return WriteAttempt {
                    written,
                    errno: errno_of(&e),
                };
            }
            written += c.len() as u64;
            progress(written);
        }
        if let Err(e) = f.flush() {
            return WriteAttempt {
                written,
                errno: errno_of(&e),
            };
        }
        if let Err(e) = f.sync_all() {
            return WriteAttempt {
                written,
                errno: errno_of(&e),
            };
        }
        WriteAttempt {
            written,
            errno: None,
        }
    }

    fn sleep(&self, d: Duration) {
        std::thread::sleep(d);
    }
}

#[cfg(target_os = "macos")]
fn real_list_uf2_volumes() -> Vec<VolumeEntry> {
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir("/Volumes") {
        for e in entries.flatten() {
            let p = e.path();
            if let Ok(info) = std::fs::read_to_string(p.join("INFO_UF2.TXT")) {
                let label = p
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let board_id = parse_board_id(&info);
                out.push(VolumeEntry {
                    path: p.to_string_lossy().to_string(),
                    label,
                    info_uf2: Some(info),
                    board_id,
                });
            }
        }
    }
    out
}

#[cfg(target_os = "windows")]
fn real_list_uf2_volumes() -> Vec<VolumeEntry> {
    let mut out = Vec::new();
    for letter in b'A'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        if let Ok(info) = std::fs::read_to_string(std::path::Path::new(&root).join("INFO_UF2.TXT")) {
            let board_id = parse_board_id(&info);
            out.push(VolumeEntry {
                path: root.clone(),
                label: root,
                info_uf2: Some(info),
                board_id,
            });
        }
    }
    out
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn real_list_uf2_volumes() -> Vec<VolumeEntry> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_board_id() {
        // Real shipping INFO_UF2.TXT (measured on hardware 2026-07-09).
        let info = "UF2 Bootloader 0.6.1\r\nModel: Seeed XIAO nRF52840 Sense\r\nBoard-ID: Seeed_XIAO_nRF52840_Sense\r\n";
        assert_eq!(
            parse_board_id(info).as_deref(),
            Some("Seeed_XIAO_nRF52840_Sense")
        );
    }

    #[test]
    fn board_id_absent() {
        assert_eq!(parse_board_id("nothing here"), None);
    }
}
