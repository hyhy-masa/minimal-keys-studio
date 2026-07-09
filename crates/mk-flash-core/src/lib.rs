//! `mk-flash-core` — OS-agnostic UF2 flashing core for minimal-keys.
//!
//! Deliberately tauri-free and (by default) network-free so it can be:
//!  - unit tested without hardware (via the [`fsops::FlashEnv`] abstraction), and
//!  - reused by both the GUI updater and the `mk-flash-cli` rescue tool.
//!
//! Pipeline: [`volume::scan_bootloader_volumes`] / [`volume::wait_for_new_volume`]
//! -> [`uf2::validate_uf2`] -> [`machine::flash_uf2`].

pub mod error;
pub mod fsops;
pub mod machine;
pub mod manifest;
pub mod uf2;
pub mod volume;

#[cfg(feature = "download")]
pub mod download;

pub use error::FlashError;
pub use fsops::{parse_board_id, FlashEnv, RealEnv, VolumeEntry, WriteAttempt};
pub use machine::{
    flash_uf2, CancelFlag, FlashConfig, FlashOutcome, FlashProgress, Timings,
    MINIMAL_KEYS_BOARD_ID_PREFIX,
};
pub use manifest::{parse_hex_u32, parse_manifest, version_ge, FwAsset, FwManifest};
pub use uf2::{
    sha256_hex, validate_uf2, Uf2Info, Uf2Limits, DEFAULT_TARGET_ADDR_MAX, DEFAULT_TARGET_ADDR_MIN,
    FAMILY_ID_NRF52840,
};
pub use volume::{acquire_bootloader, scan_bootloader_volumes, wait_for_new_volume};
