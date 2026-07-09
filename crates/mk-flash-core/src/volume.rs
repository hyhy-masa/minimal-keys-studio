//! Bootloader-volume detection.
//!
//! R and L both mount as the same `XIAO-SENSE` volume with no side marker, so
//! we never try to tell them apart here. Instead we enforce **exactly one new
//! volume at a time** (baseline diff) — the structural guard against R/L
//! mix-ups. The wizard drives the R→L ordering on top of this.

use crate::error::FlashError;
use crate::fsops::{FlashEnv, VolumeEntry};
use crate::machine::CancelFlag;
use std::time::Duration;

/// Current set of UF2 bootloader volumes.
pub fn scan_bootloader_volumes(env: &dyn FlashEnv) -> Vec<VolumeEntry> {
    env.list_uf2_volumes()
}

/// Wait for exactly one *new* UF2 volume (not in `baseline`) to appear.
///
/// - 0 new within the timeout -> [`FlashError::NoBootloaderVolume`]
/// - 2+ new                    -> [`FlashError::MultipleBootloaderVolumes`]
pub fn wait_for_new_volume(
    env: &dyn FlashEnv,
    baseline: &[String],
    timeout: Duration,
    poll: Duration,
    cancel: &CancelFlag,
) -> Result<VolumeEntry, FlashError> {
    let mut waited = Duration::ZERO;
    loop {
        if cancel.is_cancelled() {
            return Err(FlashError::Cancelled);
        }
        let mut new: Vec<VolumeEntry> = env
            .list_uf2_volumes()
            .into_iter()
            .filter(|v| !baseline.contains(&v.path))
            .collect();
        match new.len() {
            0 => {}
            1 => return Ok(new.remove(0)),
            _ => {
                return Err(FlashError::MultipleBootloaderVolumes(
                    new.iter().map(|v| v.path.clone()).collect(),
                ))
            }
        }
        if waited >= timeout {
            return Err(FlashError::NoBootloaderVolume);
        }
        env.sleep(poll);
        waited = waited.saturating_add(poll.max(Duration::from_millis(1)));
    }
}

/// Acquire the bootloader volume to write to, robust to a board that is *already*
/// in bootloader mode (the classic baseline trap: a failed retry leaves the board
/// mounted, so `wait_for_new_volume` would never see it as "new").
///
/// If exactly one matching UF2 volume is already present, adopt it; otherwise
/// wait for a new one. `board_id_prefix` filters out foreign UF2 devices (USB
/// sticks, other boards) so we never adopt something we would then refuse to
/// write anyway.
pub fn acquire_bootloader(
    env: &dyn FlashEnv,
    baseline: &[String],
    board_id_prefix: Option<&str>,
    timeout: Duration,
    poll: Duration,
    cancel: &CancelFlag,
) -> Result<VolumeEntry, FlashError> {
    let matches = |v: &VolumeEntry| match board_id_prefix {
        None => true,
        Some(p) => v
            .board_id
            .as_deref()
            .map(|b| b.starts_with(p))
            .unwrap_or(false),
    };
    let present: Vec<VolumeEntry> = env
        .list_uf2_volumes()
        .into_iter()
        .filter(|v| matches(v))
        .collect();
    match present.len() {
        1 => return Ok(present.into_iter().next().unwrap()),
        0 => {}
        _ => {
            return Err(FlashError::MultipleBootloaderVolumes(
                present.iter().map(|v| v.path.clone()).collect(),
            ))
        }
    }
    wait_for_new_volume(env, baseline, timeout, poll, cancel)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::path::Path;

    struct SeqEnv {
        // each call to list_uf2_volumes pops one snapshot
        snapshots: RefCell<Vec<Vec<VolumeEntry>>>,
    }
    fn entry(path: &str) -> VolumeEntry {
        VolumeEntry {
            path: path.to_string(),
            label: "XIAO-SENSE".into(),
            info_uf2: Some("Board-ID: Seeed_XIAO_nRF52840_Sense".into()),
            board_id: Some("Seeed_XIAO_nRF52840_Sense".into()),
        }
    }
    impl FlashEnv for SeqEnv {
        fn list_uf2_volumes(&self) -> Vec<VolumeEntry> {
            let mut s = self.snapshots.borrow_mut();
            if s.is_empty() {
                vec![]
            } else {
                s.remove(0)
            }
        }
        fn volume_present(&self, _p: &Path) -> bool {
            true
        }
        fn read_info_uf2(&self, _p: &Path) -> Option<String> {
            None
        }
        fn write_attempt(
            &self,
            _p: &Path,
            _f: &str,
            data: &[u8],
            _c: usize,
            _pr: &mut dyn FnMut(u64),
        ) -> crate::fsops::WriteAttempt {
            crate::fsops::WriteAttempt {
                written: data.len() as u64,
                errno: None,
            }
        }
        fn sleep(&self, _d: Duration) {}
    }

    #[test]
    fn detects_single_new_volume() {
        let env = SeqEnv {
            snapshots: RefCell::new(vec![vec![], vec![entry("/Volumes/XIAO-SENSE")]]),
        };
        let got = wait_for_new_volume(
            &env,
            &[],
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.path, "/Volumes/XIAO-SENSE");
    }

    #[test]
    fn rejects_two_new_volumes() {
        let env = SeqEnv {
            snapshots: RefCell::new(vec![vec![
                entry("/Volumes/XIAO-SENSE"),
                entry("/Volumes/XIAO-SENSE 1"),
            ]]),
        };
        let got = wait_for_new_volume(
            &env,
            &[],
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        );
        assert!(matches!(
            got,
            Err(FlashError::MultipleBootloaderVolumes(_))
        ));
    }

    #[test]
    fn ignores_baseline_volume() {
        let env = SeqEnv {
            snapshots: RefCell::new(vec![
                vec![entry("/Volumes/SOME_USB")],
                vec![entry("/Volumes/SOME_USB"), entry("/Volumes/XIAO-SENSE")],
            ]),
        };
        let got = wait_for_new_volume(
            &env,
            &["/Volumes/SOME_USB".to_string()],
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.path, "/Volumes/XIAO-SENSE");
    }

    #[test]
    fn times_out_when_nothing_appears() {
        let env = SeqEnv {
            snapshots: RefCell::new(vec![]),
        };
        let got = wait_for_new_volume(
            &env,
            &[],
            Duration::ZERO,
            Duration::from_millis(1),
            &CancelFlag::new(),
        );
        assert!(matches!(got, Err(FlashError::NoBootloaderVolume)));
    }

    #[test]
    fn acquire_adopts_already_present_matching_volume() {
        // H4/W4 regression: a board already in bootloader (in baseline) is adopted
        // rather than trapping on "no new volume".
        let env = SeqEnv {
            snapshots: RefCell::new(vec![vec![entry("/Volumes/XIAO-SENSE")]]),
        };
        let got = acquire_bootloader(
            &env,
            &["/Volumes/XIAO-SENSE".to_string()], // already in baseline!
            Some("Seeed_XIAO_nRF52840"),
            Duration::ZERO,
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.path, "/Volumes/XIAO-SENSE");
    }

    #[test]
    fn acquire_ignores_foreign_board_and_waits() {
        // A non-matching UF2 device (e.g. RPI-RP2) present first, then our board.
        let foreign = VolumeEntry {
            path: "/Volumes/RPI-RP2".into(),
            label: "RPI-RP2".into(),
            info_uf2: Some("Board-ID: RPI-RP2".into()),
            board_id: Some("RPI-RP2".into()),
        };
        let env = SeqEnv {
            snapshots: RefCell::new(vec![
                vec![foreign.clone()],
                vec![foreign, entry("/Volumes/XIAO-SENSE")],
            ]),
        };
        let got = acquire_bootloader(
            &env,
            &["/Volumes/RPI-RP2".to_string()], // foreign was present before we started
            Some("Seeed_XIAO_nRF52840"),
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.path, "/Volumes/XIAO-SENSE");
    }
}
