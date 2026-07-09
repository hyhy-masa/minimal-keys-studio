//! Error type shared across the flashing core.
//!
//! `FlashError` is `serde::Serialize` (tagged) so it can be handed straight to
//! the Tauri layer and rendered by the UI without a second mapping step.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize, thiserror::Error)]
#[serde(tag = "kind", content = "detail")]
pub enum FlashError {
    /// No UF2 bootloader volume appeared within the timeout.
    #[error("no bootloader volume detected")]
    NoBootloaderVolume,

    /// More than one candidate volume is present; we refuse to guess which half
    /// to write (structural protection against R/L mix-ups).
    #[error("multiple bootloader volumes present: {0:?}")]
    MultipleBootloaderVolumes(Vec<String>),

    /// The mounted volume does not look like a XIAO UF2 bootloader.
    #[error("not a UF2 bootloader volume: {path}")]
    NotUf2Volume { path: String },

    /// The UF2 file failed structural validation.
    #[error("invalid UF2: {reason}")]
    InvalidUf2 { reason: String },

    /// Write failed and the device did not reboot (still mounted after retry).
    #[error("write failed (errno={errno:?}, written={written})")]
    WriteFailed { errno: i32, written: u64 },

    /// The volume disappeared before enough data was written to be a real
    /// success — the board rebooted without receiving the full image.
    #[error("premature reboot: only {written} of {total} bytes written")]
    PrematureReboot { written: u64, total: u64 },

    /// Wrote successfully but the volume never unmounted (no reboot observed).
    #[error("timed out waiting for the keyboard to reboot")]
    UnmountTimeout,

    /// Firmware/manifest download failed.
    #[error("download failed: {reason}")]
    DownloadFailed { reason: String },

    /// SHA-256 of a downloaded asset did not match the manifest.
    #[error("checksum mismatch (expected {expected}, got {actual})")]
    ChecksumMismatch { expected: String, actual: String },

    /// Manifest JSON was missing fields or otherwise invalid.
    #[error("invalid manifest: {reason}")]
    ManifestInvalid { reason: String },

    /// The user cancelled before writing started.
    #[error("cancelled")]
    Cancelled,

    /// The OS denied access to the volume (macOS TCC / removable-volume prompt,
    /// Windows AV) even after the FSKit-not-ready retry loop.
    #[error("permission denied: {path}")]
    PermissionDenied { path: String },

    /// Any other IO error we could not classify.
    #[error("io error: {reason}")]
    Io { reason: String },
}
