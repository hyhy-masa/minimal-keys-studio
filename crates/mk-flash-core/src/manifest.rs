//! Release manifest (`manifest.json`) shared with the M0 CI pipeline.
//!
//! Published to GitHub Releases alongside the three UF2 assets. The tool fetches
//! `.../releases/latest/download/manifest.json` (unauthenticated) and drives the
//! wizard from it.

use crate::error::FlashError;
use crate::uf2::Uf2Limits;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FwAsset {
    /// "central" | "peripheral" | "settings_reset"
    pub role: String,
    #[serde(default)]
    pub build_target: Option<String>,
    pub name: String,
    pub url: String,
    pub sha256: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub target_addr_min: Option<String>,
    #[serde(default)]
    pub target_addr_max: Option<String>,
}

impl FwAsset {
    /// UF2 validation limits derived from this asset (sha + address window).
    pub fn uf2_limits(&self) -> Uf2Limits {
        let mut l = Uf2Limits {
            expected_sha256: Some(self.sha256.clone()),
            ..Uf2Limits::default()
        };
        if let Some(min) = self.target_addr_min.as_deref().and_then(parse_hex_u32) {
            l.target_addr_min = min;
        }
        if let Some(max) = self.target_addr_max.as_deref().and_then(parse_hex_u32) {
            l.target_addr_max = max;
        }
        l
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FwManifest {
    pub schema: u32,
    pub version: String,
    #[serde(default)]
    pub released_at: Option<String>,
    #[serde(default)]
    pub requires_settings_reset: bool,
    #[serde(default)]
    pub breaking_gatt: bool,
    #[serde(default)]
    pub requires_backup_restore: bool,
    #[serde(default)]
    pub min_tool_version: Option<String>,
    #[serde(default)]
    pub min_studio_version: Option<String>,
    #[serde(default)]
    pub min_bootloader_version_tested: Option<String>,
    #[serde(default)]
    pub notes_ja: Option<String>,
    pub assets: Vec<FwAsset>,
}

impl FwManifest {
    pub fn asset(&self, role: &str) -> Option<&FwAsset> {
        self.assets.iter().find(|a| a.role == role)
    }
    /// The R -> L (-> optionally settings_reset) flashing order.
    pub fn central(&self) -> Option<&FwAsset> {
        self.asset("central")
    }
    pub fn peripheral(&self) -> Option<&FwAsset> {
        self.asset("peripheral")
    }
    pub fn settings_reset(&self) -> Option<&FwAsset> {
        self.asset("settings_reset")
    }
}

/// Parse a manifest JSON body, validating the minimum required shape.
pub fn parse_manifest(s: &str) -> Result<FwManifest, FlashError> {
    let m: FwManifest = serde_json::from_str(s).map_err(|e| FlashError::ManifestInvalid {
        reason: e.to_string(),
    })?;
    // Forward-compat guard: refuse a schema we do not understand rather than
    // silently mis-reading a future (semantically changed) manifest.
    if m.schema != 2 {
        return Err(FlashError::ManifestInvalid {
            reason: format!("unsupported manifest schema {} (expected 2)", m.schema),
        });
    }
    if m.central().is_none() || m.peripheral().is_none() {
        return Err(FlashError::ManifestInvalid {
            reason: "manifest must contain both a central and a peripheral asset".into(),
        });
    }
    if m.requires_settings_reset && m.settings_reset().is_none() {
        return Err(FlashError::ManifestInvalid {
            reason: "requires_settings_reset is true but no settings_reset asset".into(),
        });
    }
    Ok(m)
}

/// Semver-lite comparison: is `have` >= `need`? Compares dot-separated numeric
/// components; ignores pre-release/build metadata. Used for the `min_tool_version`
/// gate (a customer on an old tool must be told to update).
pub fn version_ge(have: &str, need: &str) -> bool {
    fn parts(v: &str) -> Vec<u64> {
        v.split(['.', '-', '+'])
            .take_while(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
            .filter_map(|s| s.parse().ok())
            .collect()
    }
    let (h, n) = (parts(have), parts(need));
    for i in 0..h.len().max(n.len()) {
        let a = h.get(i).copied().unwrap_or(0);
        let b = n.get(i).copied().unwrap_or(0);
        if a != b {
            return a > b;
        }
    }
    true
}

/// Parse `"0x27000"` / `"27000"` into a u32.
pub fn parse_hex_u32(s: &str) -> Option<u32> {
    let t = s.trim();
    let t = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")).unwrap_or(t);
    u32::from_str_radix(t, 16).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
      "schema": 2,
      "version": "v1.4.0",
      "requires_settings_reset": false,
      "assets": [
        {"role":"central","build_target":"minimal-keys_R","name":"minimal-keys_R.uf2","url":"https://x/R.uf2","sha256":"aa","target_addr_min":"0x27000","target_addr_max":"0xF4000"},
        {"role":"peripheral","build_target":"minimal-keys_L","name":"minimal-keys_L.uf2","url":"https://x/L.uf2","sha256":"bb"},
        {"role":"settings_reset","name":"settings_reset.uf2","url":"https://x/S.uf2","sha256":"cc"}
      ]
    }"#;

    #[test]
    fn parses_and_finds_roles() {
        let m = parse_manifest(SAMPLE).unwrap();
        assert_eq!(m.version, "v1.4.0");
        assert_eq!(m.central().unwrap().name, "minimal-keys_R.uf2");
        assert_eq!(m.peripheral().unwrap().build_target.as_deref(), Some("minimal-keys_L"));
        assert!(m.settings_reset().is_some());
    }

    #[test]
    fn asset_limits_use_hex_window() {
        let m = parse_manifest(SAMPLE).unwrap();
        let l = m.central().unwrap().uf2_limits();
        assert_eq!(l.target_addr_min, 0x27000);
        assert_eq!(l.target_addr_max, 0xF4000);
        assert_eq!(l.expected_sha256.as_deref(), Some("aa"));
    }

    #[test]
    fn missing_peripheral_is_rejected() {
        let bad = r#"{"schema":2,"version":"v1","assets":[{"role":"central","name":"R.uf2","url":"u","sha256":"a"}]}"#;
        assert!(matches!(
            parse_manifest(bad),
            Err(FlashError::ManifestInvalid { .. })
        ));
    }

    #[test]
    fn parse_hex_variants() {
        assert_eq!(parse_hex_u32("0x27000"), Some(0x27000));
        assert_eq!(parse_hex_u32("F4000"), Some(0xF4000));
        assert_eq!(parse_hex_u32("nope"), None);
    }

    #[test]
    fn unsupported_schema_is_rejected() {
        let s = SAMPLE.replace("\"schema\": 2", "\"schema\": 3");
        assert!(matches!(
            parse_manifest(&s),
            Err(FlashError::ManifestInvalid { .. })
        ));
    }

    #[test]
    fn version_compare() {
        assert!(version_ge("1.0.0", "1.0.0"));
        assert!(version_ge("0.2.0", "0.1.9"));
        assert!(!version_ge("0.1.0", "1.0.0")); // the self-block trap
        assert!(version_ge("1.2.3-beta", "1.2.3"));
    }
}
