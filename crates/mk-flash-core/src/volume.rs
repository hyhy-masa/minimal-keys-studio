//! Bootloader-volume detection.
//!
//! R and L both mount as the same `XIAO-SENSE` volume with no side marker, so
//! we never try to tell them apart here. The wizard's human final confirmation
//! is the required gate before writing; [`VolumeOrigin`] is display-only context
//! for that confirmation and is not a safety boundary.

use crate::error::FlashError;
use crate::fsops::{FlashEnv, VolumeEntry};
use crate::machine::CancelFlag;
use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VolumeOrigin {
    Existing,
    New,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AcquiredVolume {
    pub volume: VolumeEntry,
    pub origin: VolumeOrigin,
}

fn matches_prefix(volume: &VolumeEntry, board_id_prefix: Option<&str>) -> bool {
    match board_id_prefix {
        None => true,
        Some(prefix) => volume
            .board_id
            .as_deref()
            .map(|board_id| board_id.starts_with(prefix))
            .unwrap_or(false),
    }
}

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
    board_id_prefix: Option<&str>,
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
            .filter(|v| !baseline.contains(&v.path) && matches_prefix(v, board_id_prefix))
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
/// With `adopt_present`, exactly one matching UF2 volume already present is
/// adopted; otherwise present volumes are skipped and a new one is awaited.
/// `board_id_prefix` filters out foreign UF2 devices (USB sticks, other boards).
pub fn acquire_bootloader(
    env: &dyn FlashEnv,
    baseline: &[String],
    board_id_prefix: Option<&str>,
    adopt_present: bool,
    timeout: Duration,
    poll: Duration,
    cancel: &CancelFlag,
) -> Result<AcquiredVolume, FlashError> {
    if adopt_present {
        let present: Vec<VolumeEntry> = env
            .list_uf2_volumes()
            .into_iter()
            .filter(|v| matches_prefix(v, board_id_prefix))
            .collect();
        match present.len() {
            1 => {
                return Ok(AcquiredVolume {
                    volume: present.into_iter().next().unwrap(),
                    origin: VolumeOrigin::Existing,
                })
            }
            0 => {}
            _ => {
                return Err(FlashError::MultipleBootloaderVolumes(
                    present.iter().map(|v| v.path.clone()).collect(),
                ))
            }
        }
    }
    wait_for_new_volume(env, baseline, board_id_prefix, timeout, poll, cancel).map(|volume| {
        AcquiredVolume {
            volume,
            origin: VolumeOrigin::New,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};
    use std::path::Path;

    struct SeqEnv {
        // each call to list_uf2_volumes pops one snapshot
        snapshots: RefCell<Vec<Vec<VolumeEntry>>>,
        list_calls: Cell<usize>,
        sleep_calls: Cell<usize>,
    }
    impl SeqEnv {
        fn new(snapshots: Vec<Vec<VolumeEntry>>) -> Self {
            Self {
                snapshots: RefCell::new(snapshots),
                list_calls: Cell::new(0),
                sleep_calls: Cell::new(0),
            }
        }
    }
    fn entry(path: &str) -> VolumeEntry {
        VolumeEntry {
            path: path.to_string(),
            label: "XIAO-SENSE".into(),
            info_uf2: Some("Board-ID: Seeed_XIAO_nRF52840_Sense".into()),
            board_id: Some("Seeed_XIAO_nRF52840_Sense".into()),
        }
    }
    fn foreign_entry(path: &str) -> VolumeEntry {
        VolumeEntry {
            path: path.to_string(),
            label: "RPI-RP2".into(),
            info_uf2: Some("Board-ID: RPI-RP2".into()),
            board_id: Some("RPI-RP2".into()),
        }
    }
    impl FlashEnv for SeqEnv {
        fn list_uf2_volumes(&self) -> Vec<VolumeEntry> {
            self.list_calls.set(self.list_calls.get() + 1);
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
        fn sleep(&self, _d: Duration) {
            self.sleep_calls.set(self.sleep_calls.get() + 1);
        }
    }

    #[test]
    fn detects_single_new_volume() {
        let env = SeqEnv::new(vec![vec![], vec![entry("/Volumes/XIAO-SENSE")]]);
        let got = wait_for_new_volume(
            &env,
            &[],
            None,
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.path, "/Volumes/XIAO-SENSE");
    }

    #[test]
    fn rejects_two_new_volumes() {
        let env = SeqEnv::new(vec![vec![
            entry("/Volumes/XIAO-SENSE"),
            entry("/Volumes/XIAO-SENSE 1"),
        ]]);
        let got = wait_for_new_volume(
            &env,
            &[],
            None,
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        );
        assert!(matches!(got, Err(FlashError::MultipleBootloaderVolumes(_))));
    }

    #[test]
    fn ignores_baseline_volume() {
        let env = SeqEnv::new(vec![
            vec![entry("/Volumes/SOME_USB")],
            vec![entry("/Volumes/SOME_USB"), entry("/Volumes/XIAO-SENSE")],
        ]);
        let got = wait_for_new_volume(
            &env,
            &["/Volumes/SOME_USB".to_string()],
            None,
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.path, "/Volumes/XIAO-SENSE");
    }

    #[test]
    fn times_out_when_nothing_appears() {
        let env = SeqEnv::new(vec![]);
        let got = wait_for_new_volume(
            &env,
            &[],
            None,
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
        let env = SeqEnv::new(vec![vec![entry("/Volumes/XIAO-SENSE")]]);
        let got = acquire_bootloader(
            &env,
            &["/Volumes/XIAO-SENSE".to_string()], // already in baseline!
            Some("Seeed_XIAO_nRF52840"),
            true,
            Duration::ZERO,
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.volume.path, "/Volumes/XIAO-SENSE");
        assert_eq!(got.origin, VolumeOrigin::Existing);
    }

    #[test]
    fn acquire_without_adoption_times_out_when_matching_volume_is_already_present() {
        let env = SeqEnv::new(vec![vec![entry("/Volumes/XIAO-SENSE")]]);
        let got = acquire_bootloader(
            &env,
            &["/Volumes/XIAO-SENSE".to_string()],
            Some("Seeed_XIAO_nRF52840"),
            false,
            Duration::ZERO,
            Duration::from_millis(1),
            &CancelFlag::new(),
        );
        assert!(matches!(got, Err(FlashError::NoBootloaderVolume)));
        assert_eq!(env.list_calls.get(), 1);
    }

    #[test]
    fn acquire_without_adoption_waits_for_different_matching_path() {
        let env = SeqEnv::new(vec![
            vec![entry("E:\\")],
            vec![entry("E:\\"), entry("F:\\")],
        ]);
        let got = acquire_bootloader(
            &env,
            &["E:\\".to_string()],
            Some("Seeed_XIAO_nRF52840"),
            false,
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.volume.path, "F:\\");
        assert_eq!(got.origin, VolumeOrigin::New);
        assert_eq!(env.list_calls.get(), 2);
        assert_eq!(env.sleep_calls.get(), 1);
    }

    #[test]
    fn acquire_with_adoption_rejects_two_matching_present_volumes() {
        let env = SeqEnv::new(vec![vec![entry("E:\\"), entry("F:\\")]]);
        let got = acquire_bootloader(
            &env,
            &[],
            Some("Seeed_XIAO_nRF52840"),
            true,
            Duration::ZERO,
            Duration::from_millis(1),
            &CancelFlag::new(),
        );
        assert!(matches!(got, Err(FlashError::MultipleBootloaderVolumes(_))));
    }

    fn assert_foreign_present_is_ignored(adopt_present: bool) {
        // A non-matching UF2 device (e.g. RPI-RP2) present first, then our board.
        let foreign = foreign_entry("/Volumes/RPI-RP2");
        let env = SeqEnv::new(vec![
            vec![foreign.clone()],
            vec![foreign, entry("/Volumes/XIAO-SENSE")],
        ]);
        let got = acquire_bootloader(
            &env,
            &["/Volumes/RPI-RP2".to_string()], // foreign was present before we started
            Some("Seeed_XIAO_nRF52840"),
            adopt_present,
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.volume.path, "/Volumes/XIAO-SENSE");
        assert_eq!(got.origin, VolumeOrigin::New);
    }

    #[test]
    fn acquire_with_adoption_ignores_foreign_board_and_waits() {
        assert_foreign_present_is_ignored(true);
    }

    #[test]
    fn acquire_without_adoption_ignores_foreign_board_and_waits() {
        assert_foreign_present_is_ignored(false);
    }

    #[test]
    fn wait_with_prefix_ignores_foreign_new_volume_then_returns_matching_volume() {
        let foreign = foreign_entry("/Volumes/RPI-RP2");
        let env = SeqEnv::new(vec![
            vec![foreign.clone()],
            vec![foreign, entry("/Volumes/XIAO-SENSE")],
        ]);
        let got = wait_for_new_volume(
            &env,
            &[],
            Some("Seeed_XIAO_nRF52840"),
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.path, "/Volumes/XIAO-SENSE");
    }

    #[test]
    fn acquire_with_empty_baseline_detects_reappeared_windows_drive_as_new() {
        let env = SeqEnv::new(vec![vec![], vec![entry("E:\\")]]);
        let got = acquire_bootloader(
            &env,
            &[],
            Some("Seeed_XIAO_nRF52840"),
            true,
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.volume.path, "E:\\");
        assert_eq!(got.origin, VolumeOrigin::New);
    }

    #[test]
    fn acquire_ignores_foreign_reuse_of_windows_drive_then_returns_matching_drive() {
        let foreign = foreign_entry("E:\\");
        let env = SeqEnv::new(vec![
            vec![foreign.clone()],
            vec![foreign.clone()],
            vec![foreign, entry("F:\\")],
        ]);
        let got = acquire_bootloader(
            &env,
            &[],
            Some("Seeed_XIAO_nRF52840"),
            true,
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.volume.path, "F:\\");
        assert_eq!(got.origin, VolumeOrigin::New);
    }

    #[test]
    fn acquire_after_initial_unreadable_scan_returns_new_matching_volume() {
        let env = SeqEnv::new(vec![vec![], vec![entry("/Volumes/XIAO-SENSE")]]);
        let got = acquire_bootloader(
            &env,
            &[],
            Some("Seeed_XIAO_nRF52840"),
            true,
            Duration::from_millis(10),
            Duration::from_millis(1),
            &CancelFlag::new(),
        )
        .unwrap();
        assert_eq!(got.volume.path, "/Volumes/XIAO-SENSE");
        assert_eq!(got.origin, VolumeOrigin::New);
    }
}
