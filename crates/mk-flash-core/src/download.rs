//! Manifest + asset download (feature `download`).
//!
//! Kept behind a feature flag so the flashing core and its unit tests build with
//! no network stack. Uses `ureq` (blocking) — the whole core is synchronous; the
//! Tauri layer wraps calls in `spawn_blocking`.

use crate::error::FlashError;
use crate::manifest::{parse_manifest, FwAsset, FwManifest};
use crate::uf2::sha256_hex;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Hard cap on any downloaded body. UF2s are well under this; a runaway/huge
/// response is rejected rather than read into memory unbounded (W6/M1).
const MAX_BODY_BYTES: u64 = 16 * 1024 * 1024;

/// Agent with explicit timeouts — ureq has *no* default read/overall timeout, so
/// a stalled connection would otherwise hang the blocking thread forever.
fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout_read(Duration::from_secs(60))
        .timeout_write(Duration::from_secs(60))
        .build()
}

/// Fetch and parse a manifest from a (public, unauthenticated) URL.
pub fn fetch_manifest(url: &str) -> Result<FwManifest, FlashError> {
    let body = String::from_utf8(http_get_bytes(url)?).map_err(|e| FlashError::DownloadFailed {
        reason: e.to_string(),
    })?;
    parse_manifest(&body)
}

/// Download an asset into `dest_dir`, verifying its declared size (if any) and
/// its SHA-256 against the manifest before writing.
pub fn download_asset(asset: &FwAsset, dest_dir: &Path) -> Result<PathBuf, FlashError> {
    let bytes = http_get_bytes(&asset.url)?;
    if asset.size > 0 && bytes.len() as u64 != asset.size {
        return Err(FlashError::DownloadFailed {
            reason: format!("size {} != manifest {}", bytes.len(), asset.size),
        });
    }
    let actual = sha256_hex(&bytes);
    if !actual.eq_ignore_ascii_case(&asset.sha256) {
        return Err(FlashError::ChecksumMismatch {
            expected: asset.sha256.clone(),
            actual,
        });
    }
    std::fs::create_dir_all(dest_dir).map_err(|e| FlashError::Io {
        reason: e.to_string(),
    })?;
    // Only the file-name component of `name` is honoured (no `../` traversal).
    let name = Path::new(&asset.name)
        .file_name()
        .ok_or_else(|| FlashError::ManifestInvalid {
            reason: format!("bad asset name {:?}", asset.name),
        })?;
    let path = dest_dir.join(name);
    std::fs::write(&path, &bytes).map_err(|e| FlashError::Io {
        reason: e.to_string(),
    })?;
    Ok(path)
}

fn http_get_bytes(url: &str) -> Result<Vec<u8>, FlashError> {
    let resp = agent().get(url).call().map_err(|e| FlashError::DownloadFailed {
        reason: e.to_string(),
    })?;
    let mut buf = Vec::new();
    resp.into_reader()
        .take(MAX_BODY_BYTES + 1)
        .read_to_end(&mut buf)
        .map_err(|e| FlashError::DownloadFailed {
            reason: e.to_string(),
        })?;
    if buf.len() as u64 > MAX_BODY_BYTES {
        return Err(FlashError::DownloadFailed {
            reason: format!("response exceeds {} bytes", MAX_BODY_BYTES),
        });
    }
    Ok(buf)
}
