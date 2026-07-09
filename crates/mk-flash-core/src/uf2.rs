//! UF2 parsing and validation.
//!
//! A UF2 file is a sequence of fixed 512-byte blocks. Each block has a 32-byte
//! header, up to 476 bytes of payload, and a trailing magic word. We validate
//! every block (not just the first) because a truncated or foreign image is a
//! brick risk on a device the customer flashes themselves.
//!
//! Layout (little-endian), offsets into each 512-byte block:
//!   0x00 magicStart0 = 0x0A324655 ("UF2\n")
//!   0x04 magicStart1 = 0x9E5D5157
//!   0x08 flags
//!   0x0C targetAddr
//!   0x10 payloadSize
//!   0x14 blockNo
//!   0x18 numBlocks
//!   0x1C familyID (valid only when flags & 0x2000)
//!   0x20 data[476]
//!   0x1FC magicEnd = 0x0AB16F30

use crate::error::FlashError;
use sha2::{Digest, Sha256};

pub const UF2_MAGIC_START0: u32 = 0x0A32_4655;
pub const UF2_MAGIC_START1: u32 = 0x9E5D_5157;
pub const UF2_MAGIC_END: u32 = 0x0AB1_6F30;
/// flags bit: familyID field is present and meaningful.
pub const UF2_FLAG_FAMILY_ID_PRESENT: u32 = 0x0000_2000;
/// nRF52840 family id (generic to the MCU, not to minimal-keys or R/L).
pub const FAMILY_ID_NRF52840: u32 = 0xADA5_2840;

pub const UF2_BLOCK_SIZE: usize = 512;
pub const UF2_MAX_PAYLOAD: u32 = 476;

/// Default app-image address window for minimal-keys (below the Adafruit
/// bootloader / MBR regions). Manifest assets may narrow this per role.
pub const DEFAULT_TARGET_ADDR_MIN: u32 = 0x0002_7000;
pub const DEFAULT_TARGET_ADDR_MAX: u32 = 0x000F_4000;

/// Constraints applied during validation. `expected_sha256`, when set, is the
/// manifest hash the whole file must match.
#[derive(Debug, Clone)]
pub struct Uf2Limits {
    pub target_addr_min: u32,
    pub target_addr_max: u32,
    pub expected_sha256: Option<String>,
}

impl Default for Uf2Limits {
    fn default() -> Self {
        Self {
            target_addr_min: DEFAULT_TARGET_ADDR_MIN,
            target_addr_max: DEFAULT_TARGET_ADDR_MAX,
            expected_sha256: None,
        }
    }
}

/// Summary of a validated UF2 image.
#[derive(Debug, Clone, PartialEq)]
pub struct Uf2Info {
    pub num_blocks: u32,
    pub start_addr: u32,
    /// exclusive end (last block targetAddr + its payloadSize)
    pub end_addr: u32,
    pub total_payload: u64,
    pub family_id: u32,
    pub sha256: String,
}

#[inline]
fn rd_u32(block: &[u8], off: usize) -> u32 {
    u32::from_le_bytes([block[off], block[off + 1], block[off + 2], block[off + 3]])
}

fn invalid(reason: impl Into<String>) -> FlashError {
    FlashError::InvalidUf2 {
        reason: reason.into(),
    }
}

/// Lowercase hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    let digest = h.finalize();
    let mut s = String::with_capacity(64);
    for b in digest {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// Validate a UF2 image against `limits`. Returns a summary or the first
/// structural problem found.
pub fn validate_uf2(bytes: &[u8], limits: &Uf2Limits) -> Result<Uf2Info, FlashError> {
    if bytes.is_empty() {
        return Err(invalid("empty file"));
    }
    if !bytes.len().is_multiple_of(UF2_BLOCK_SIZE) {
        return Err(invalid(format!(
            "size {} is not a multiple of {}",
            bytes.len(),
            UF2_BLOCK_SIZE
        )));
    }
    let num_blocks = (bytes.len() / UF2_BLOCK_SIZE) as u32;

    let mut total_payload: u64 = 0;
    let mut start_addr: u32 = 0;
    let mut end_addr: u32 = 0;
    let mut family_id: u32 = 0;
    let mut prev_end: Option<u32> = None;

    for i in 0..num_blocks {
        let block = &bytes[i as usize * UF2_BLOCK_SIZE..(i as usize + 1) * UF2_BLOCK_SIZE];

        if rd_u32(block, 0x00) != UF2_MAGIC_START0 || rd_u32(block, 0x04) != UF2_MAGIC_START1 {
            return Err(invalid(format!("block {i}: bad start magic")));
        }
        if rd_u32(block, 0x1FC) != UF2_MAGIC_END {
            return Err(invalid(format!("block {i}: bad end magic")));
        }

        let flags = rd_u32(block, 0x08);
        if flags & UF2_FLAG_FAMILY_ID_PRESENT == 0 {
            return Err(invalid(format!("block {i}: familyID flag not set")));
        }
        let fam = rd_u32(block, 0x1C);
        if fam != FAMILY_ID_NRF52840 {
            return Err(invalid(format!(
                "block {i}: familyID {fam:#010x} != nRF52840 {:#010x}",
                FAMILY_ID_NRF52840
            )));
        }
        if i == 0 {
            family_id = fam;
        }

        let target_addr = rd_u32(block, 0x0C);
        let payload_size = rd_u32(block, 0x10);
        let block_no = rd_u32(block, 0x14);
        let file_num_blocks = rd_u32(block, 0x18);

        if payload_size == 0 || payload_size > UF2_MAX_PAYLOAD {
            return Err(invalid(format!(
                "block {i}: payloadSize {payload_size} out of range (1..={UF2_MAX_PAYLOAD})"
            )));
        }
        if block_no != i {
            return Err(invalid(format!("block {i}: blockNo {block_no} != index {i}")));
        }
        if file_num_blocks != num_blocks {
            return Err(invalid(format!(
                "block {i}: numBlocks {file_num_blocks} != actual {num_blocks}"
            )));
        }

        // Address window + monotonic, non-overlapping.
        if target_addr < limits.target_addr_min {
            return Err(invalid(format!(
                "block {i}: targetAddr {target_addr:#010x} below min {:#010x}",
                limits.target_addr_min
            )));
        }
        let this_end = target_addr
            .checked_add(payload_size)
            .ok_or_else(|| invalid(format!("block {i}: targetAddr+payload overflow")))?;
        if this_end > limits.target_addr_max {
            return Err(invalid(format!(
                "block {i}: end {this_end:#010x} above max {:#010x}",
                limits.target_addr_max
            )));
        }
        if let Some(pe) = prev_end {
            if target_addr < pe {
                return Err(invalid(format!(
                    "block {i}: targetAddr {target_addr:#010x} overlaps previous end {pe:#010x}"
                )));
            }
        }

        if i == 0 {
            start_addr = target_addr;
        }
        end_addr = this_end;
        prev_end = Some(this_end);
        total_payload += payload_size as u64;
    }

    let sha = sha256_hex(bytes);
    if let Some(expected) = &limits.expected_sha256 {
        if !expected.eq_ignore_ascii_case(&sha) {
            return Err(FlashError::ChecksumMismatch {
                expected: expected.clone(),
                actual: sha,
            });
        }
    }

    Ok(Uf2Info {
        num_blocks,
        start_addr,
        end_addr,
        total_payload,
        family_id,
        sha256: sha,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a syntactically valid UF2 with `n` blocks starting at `start`.
    fn make_uf2(n: u32, start: u32) -> Vec<u8> {
        let mut out = vec![0u8; n as usize * UF2_BLOCK_SIZE];
        for i in 0..n {
            let b = &mut out[i as usize * UF2_BLOCK_SIZE..(i as usize + 1) * UF2_BLOCK_SIZE];
            b[0x00..0x04].copy_from_slice(&UF2_MAGIC_START0.to_le_bytes());
            b[0x04..0x08].copy_from_slice(&UF2_MAGIC_START1.to_le_bytes());
            b[0x08..0x0C].copy_from_slice(&UF2_FLAG_FAMILY_ID_PRESENT.to_le_bytes());
            b[0x0C..0x10].copy_from_slice(&(start + i * 256).to_le_bytes()); // 256-byte pages
            b[0x10..0x14].copy_from_slice(&256u32.to_le_bytes());
            b[0x14..0x18].copy_from_slice(&i.to_le_bytes());
            b[0x18..0x1C].copy_from_slice(&n.to_le_bytes());
            b[0x1C..0x20].copy_from_slice(&FAMILY_ID_NRF52840.to_le_bytes());
            b[0x1FC..0x200].copy_from_slice(&UF2_MAGIC_END.to_le_bytes());
        }
        out
    }

    #[test]
    fn valid_image_passes() {
        let uf2 = make_uf2(4, DEFAULT_TARGET_ADDR_MIN);
        let info = validate_uf2(&uf2, &Uf2Limits::default()).expect("valid");
        assert_eq!(info.num_blocks, 4);
        assert_eq!(info.start_addr, DEFAULT_TARGET_ADDR_MIN);
        assert_eq!(info.total_payload, 4 * 256);
        assert_eq!(info.family_id, FAMILY_ID_NRF52840);
        assert_eq!(info.sha256.len(), 64);
    }

    #[test]
    fn rejects_non_multiple_size() {
        let mut uf2 = make_uf2(1, DEFAULT_TARGET_ADDR_MIN);
        uf2.truncate(500);
        assert!(matches!(
            validate_uf2(&uf2, &Uf2Limits::default()),
            Err(FlashError::InvalidUf2 { .. })
        ));
    }

    #[test]
    fn rejects_bad_family_id() {
        let mut uf2 = make_uf2(1, DEFAULT_TARGET_ADDR_MIN);
        uf2[0x1C..0x20].copy_from_slice(&0xDEAD_BEEFu32.to_le_bytes());
        assert!(matches!(
            validate_uf2(&uf2, &Uf2Limits::default()),
            Err(FlashError::InvalidUf2 { .. })
        ));
    }

    #[test]
    fn rejects_missing_family_flag() {
        let mut uf2 = make_uf2(1, DEFAULT_TARGET_ADDR_MIN);
        uf2[0x08..0x0C].copy_from_slice(&0u32.to_le_bytes());
        assert!(matches!(
            validate_uf2(&uf2, &Uf2Limits::default()),
            Err(FlashError::InvalidUf2 { .. })
        ));
    }

    #[test]
    fn rejects_target_addr_out_of_range() {
        // start below the min window
        let uf2 = make_uf2(1, 0x1000);
        assert!(matches!(
            validate_uf2(&uf2, &Uf2Limits::default()),
            Err(FlashError::InvalidUf2 { .. })
        ));
    }

    #[test]
    fn rejects_block_number_gap() {
        let mut uf2 = make_uf2(3, DEFAULT_TARGET_ADDR_MIN);
        // corrupt blockNo of block 1
        uf2[UF2_BLOCK_SIZE + 0x14..UF2_BLOCK_SIZE + 0x18].copy_from_slice(&99u32.to_le_bytes());
        assert!(matches!(
            validate_uf2(&uf2, &Uf2Limits::default()),
            Err(FlashError::InvalidUf2 { .. })
        ));
    }

    #[test]
    fn rejects_truncated_tail() {
        let mut uf2 = make_uf2(3, DEFAULT_TARGET_ADDR_MIN);
        // drop the last block => numBlocks fields now say 3 but only 2 present
        uf2.truncate(2 * UF2_BLOCK_SIZE);
        assert!(matches!(
            validate_uf2(&uf2, &Uf2Limits::default()),
            Err(FlashError::InvalidUf2 { .. })
        ));
    }

    #[test]
    fn checksum_mismatch_detected() {
        let uf2 = make_uf2(2, DEFAULT_TARGET_ADDR_MIN);
        let limits = Uf2Limits {
            expected_sha256: Some("00".repeat(32)),
            ..Uf2Limits::default()
        };
        assert!(matches!(
            validate_uf2(&uf2, &limits),
            Err(FlashError::ChecksumMismatch { .. })
        ));
    }

    #[test]
    fn checksum_match_passes() {
        let uf2 = make_uf2(2, DEFAULT_TARGET_ADDR_MIN);
        let sha = sha256_hex(&uf2);
        let limits = Uf2Limits {
            expected_sha256: Some(sha.to_uppercase()),
            ..Uf2Limits::default()
        };
        assert!(validate_uf2(&uf2, &limits).is_ok());
    }
}
