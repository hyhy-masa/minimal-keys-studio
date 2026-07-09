//! The UF2 write state machine.
//!
//! Unifies three shell scripts (cp -X / dd variants). The core invariant, taken
//! from all of them: **success is judged by the volume unmounting (the board
//! rebooting) AFTER a write that reached (near) completion — never by the copy
//! command's exit code, and never on a partial write.** Constants come from
//! `flash_v5_production.sh` (stabilize 2s :50, EACCES retry 10×2s :53-64) and
//! `flash-farmware.sh` (15s unmount wait + one rewrite :63-69).

use crate::error::FlashError;
use crate::fsops::{parse_board_id, FlashEnv};
use serde::Serialize;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// Cooperative cancellation. Only honoured before writing begins — once a write
/// is in flight we always ride it out (the board must receive the full image).
#[derive(Debug, Default)]
pub struct CancelFlag(AtomicBool);

impl CancelFlag {
    pub fn new() -> Self {
        CancelFlag(AtomicBool::new(false))
    }
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    /// Clear a previous cancellation (call before starting a fresh flash so a
    /// stale cancel does not abort the new run).
    pub fn reset(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

#[derive(Debug, Clone)]
pub struct Timings {
    pub stabilize: Duration,
    pub eacces_retry_wait: Duration,
    pub eacces_max_retries: u32,
    pub unmount_poll: Duration,
    pub unmount_timeout: Duration,
    pub unmount_timeout_after_rewrite: Duration,
    /// Absolute byte slack below `total` within which a reboot-like error counts
    /// as "the device rebooted on the last blocks" (success candidate). Clamped
    /// per-file to `total/4` so small images are not defended vacuously (M2).
    pub premature_slack: u64,
    pub write_chunk: usize,
}

impl Default for Timings {
    fn default() -> Self {
        Self {
            stabilize: Duration::from_secs(2),
            eacces_retry_wait: Duration::from_secs(2),
            eacces_max_retries: 10,
            unmount_poll: Duration::from_millis(500),
            unmount_timeout: Duration::from_secs(15),
            unmount_timeout_after_rewrite: Duration::from_secs(30),
            premature_slack: 256 * 1024,
            write_chunk: 64 * 1024,
        }
    }
}

/// Everything the flash needs besides the data/volume. Bundled to keep
/// [`flash_uf2`]'s signature small.
#[derive(Debug, Clone)]
pub struct FlashConfig {
    pub timings: Timings,
    /// If set, `INFO_UF2.TXT` Board-ID must start with this or the write is
    /// refused with [`FlashError::NotUf2Volume`] (guards against writing a
    /// minimal-keys image to some other UF2 board / a USB stick).
    pub board_id_prefix: Option<String>,
}

impl Default for FlashConfig {
    fn default() -> Self {
        Self {
            timings: Timings::default(),
            // Real INFO_UF2.TXT Board-ID on the shipping Seeed XIAO nRF52840 Sense
            // is `Seeed_XIAO_nRF52840_Sense` (measured on hardware, 2026-07-09,
            // plan U-2 — NOT the Adafruit-upstream `nRF52840-SeeedXiaoSense-v1`).
            board_id_prefix: Some("Seeed_XIAO_nRF52840".to_string()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "phase", content = "detail")]
pub enum FlashProgress {
    Stabilizing,
    Writing { written: u64, total: u64 },
    Retrying { attempt: u32 },
    Rewriting,
    AwaitingReboot,
}

/// A successful write, pending the wizard's post-flash verification checklist.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum FlashOutcome {
    ProvisionalSuccess,
}

#[derive(Debug, PartialEq)]
enum ErrnoKind {
    PermissionDenied,
    RebootLike,
    Other,
}

#[cfg(unix)]
fn classify_errno(e: i32) -> ErrnoKind {
    match e {
        13 | 1 => ErrnoKind::PermissionDenied,        // EACCES, EPERM (macOS TCC often EPERM, L3)
        5 | 2 | 6 | 19 | 32 => ErrnoKind::RebootLike, // EIO, ENOENT, ENXIO, ENODEV, EPIPE
        _ => ErrnoKind::Other,
    }
}

#[cfg(windows)]
fn classify_errno(e: i32) -> ErrnoKind {
    // Win32 error codes (distinct from POSIX errno). Provisional; confirmed by
    // M3 real-hardware measurement (plan U-4).
    match e {
        5 | 225 | 226 => ErrnoKind::PermissionDenied, // ACCESS_DENIED, VIRUS_INFECTED, VIRUS_DELETED
        21 | 1 | 2 | 3 | 31 | 433 => ErrnoKind::RebootLike, // NOT_READY, INVALID_FUNCTION, FILE/PATH_NOT_FOUND, GEN_FAILURE, NO_SUCH_DEVICE
        _ => ErrnoKind::Other,
    }
}

#[cfg(not(any(unix, windows)))]
fn classify_errno(_e: i32) -> ErrnoKind {
    ErrnoKind::Other
}

/// Per-file success threshold: a write must reach at least this many bytes to be
/// eligible for a reboot-based success. `slack` is clamped to `total/4`.
fn success_threshold(total: u64, timings: &Timings) -> u64 {
    let slack = timings.premature_slack.min(total / 4);
    total.saturating_sub(slack)
}

/// Write `data` (a validated UF2) to `volume` as `filename`, driving the full
/// state machine. Returns `ProvisionalSuccess` once the board reboots.
pub fn flash_uf2(
    env: &dyn FlashEnv,
    volume: &Path,
    filename: &str,
    data: &[u8],
    config: &FlashConfig,
    progress: &mut dyn FnMut(FlashProgress),
    cancel: &CancelFlag,
) -> Result<FlashOutcome, FlashError> {
    if cancel.is_cancelled() {
        return Err(FlashError::Cancelled);
    }
    let total = data.len() as u64;

    progress(FlashProgress::Stabilizing);
    env.sleep(config.timings.stabilize);

    // Preflight: Board-ID gate (guards against foreign UF2 volumes).
    if let Some(prefix) = &config.board_id_prefix {
        preflight_board_id(env, volume, prefix)?;
    }

    let threshold = success_threshold(total, &config.timings);
    let mut attempt: u32 = 0;
    loop {
        if cancel.is_cancelled() {
            return Err(FlashError::Cancelled);
        }
        if attempt > 0 {
            progress(FlashProgress::Retrying { attempt });
        }

        progress(FlashProgress::Writing { written: 0, total });
        let res = env.write_attempt(volume, filename, data, config.timings.write_chunk, &mut |w| {
            progress(FlashProgress::Writing { written: w, total });
        });

        match res.errno {
            // Clean write reached the end: adjudicate by unmount.
            None => {
                return finish_completed(env, volume, filename, data, config, progress, total, {
                    FlashError::UnmountTimeout
                });
            }
            Some(e) => match classify_errno(e) {
                ErrnoKind::PermissionDenied => {
                    if !env.volume_present(volume) {
                        return Err(FlashError::NoBootloaderVolume);
                    }
                    if attempt >= config.timings.eacces_max_retries {
                        return Err(FlashError::PermissionDenied {
                            path: volume.to_string_lossy().to_string(),
                        });
                    }
                    attempt += 1;
                    env.sleep(config.timings.eacces_retry_wait);
                    continue;
                }
                // Reboot-like error after (nearly) the whole image: success candidate.
                ErrnoKind::RebootLike if res.written >= threshold => {
                    return finish_completed(
                        env,
                        volume,
                        filename,
                        data,
                        config,
                        progress,
                        total,
                        FlashError::WriteFailed {
                            errno: e,
                            written: res.written,
                        },
                    );
                }
                // Partial write. If the volume is gone, the board rebooted without
                // the full image = failure. If still present, one full rewrite —
                // and crucially we do NOT count a pre-rewrite unmount as success.
                ErrnoKind::RebootLike => {
                    if !env.volume_present(volume) {
                        return Err(FlashError::PrematureReboot {
                            written: res.written,
                            total,
                        });
                    }
                    return rewrite_and_finish(
                        env, volume, filename, data, config, progress, total, threshold,
                    );
                }
                ErrnoKind::Other => {
                    return Err(FlashError::WriteFailed {
                        errno: e,
                        written: res.written,
                    });
                }
            },
        }
    }
}

fn preflight_board_id(env: &dyn FlashEnv, volume: &Path, prefix: &str) -> Result<(), FlashError> {
    let not_uf2 = || FlashError::NotUf2Volume {
        path: volume.to_string_lossy().to_string(),
    };
    match env.read_info_uf2(volume) {
        Some(info) => {
            let ok = parse_board_id(&info)
                .map(|b| b.starts_with(prefix))
                .unwrap_or(false);
            if ok {
                Ok(())
            } else {
                Err(not_uf2())
            }
        }
        None => Err(not_uf2()),
    }
}

/// The current write reached completion. Await unmount; on timeout do exactly one
/// full rewrite and await again. Returns `ProvisionalSuccess` or `fail`.
#[allow(clippy::too_many_arguments)]
fn finish_completed(
    env: &dyn FlashEnv,
    volume: &Path,
    filename: &str,
    data: &[u8],
    config: &FlashConfig,
    progress: &mut dyn FnMut(FlashProgress),
    total: u64,
    fail: FlashError,
) -> Result<FlashOutcome, FlashError> {
    progress(FlashProgress::AwaitingReboot);
    if await_unmount(
        env,
        volume,
        config.timings.unmount_timeout,
        config.timings.unmount_poll,
    ) {
        return Ok(FlashOutcome::ProvisionalSuccess);
    }
    progress(FlashProgress::Rewriting);
    let _ = env.write_attempt(volume, filename, data, config.timings.write_chunk, &mut |w| {
        progress(FlashProgress::Writing { written: w, total });
    });
    progress(FlashProgress::AwaitingReboot);
    if await_unmount(
        env,
        volume,
        config.timings.unmount_timeout_after_rewrite,
        config.timings.unmount_poll,
    ) {
        Ok(FlashOutcome::ProvisionalSuccess)
    } else {
        Err(fail)
    }
}

/// Partial-write recovery: one full rewrite, then adjudicate. A rewrite that does
/// not itself reach `threshold` is never treated as success (fixes the "unmount
/// during await = false success" window).
#[allow(clippy::too_many_arguments)]
fn rewrite_and_finish(
    env: &dyn FlashEnv,
    volume: &Path,
    filename: &str,
    data: &[u8],
    config: &FlashConfig,
    progress: &mut dyn FnMut(FlashProgress),
    total: u64,
    threshold: u64,
) -> Result<FlashOutcome, FlashError> {
    progress(FlashProgress::Rewriting);
    let res = env.write_attempt(volume, filename, data, config.timings.write_chunk, &mut |w| {
        progress(FlashProgress::Writing { written: w, total });
    });
    let reached = res.errno.is_none() || res.written >= threshold;
    if !reached {
        return if !env.volume_present(volume) {
            Err(FlashError::PrematureReboot {
                written: res.written,
                total,
            })
        } else {
            Err(FlashError::WriteFailed {
                errno: res.errno.unwrap_or(-1),
                written: res.written,
            })
        };
    }
    progress(FlashProgress::AwaitingReboot);
    if await_unmount(
        env,
        volume,
        config.timings.unmount_timeout_after_rewrite,
        config.timings.unmount_poll,
    ) {
        Ok(FlashOutcome::ProvisionalSuccess)
    } else {
        Err(FlashError::WriteFailed {
            errno: res.errno.unwrap_or(0),
            written: res.written,
        })
    }
}

/// Poll until the volume disappears (`true`) or the timeout elapses (`false`).
fn await_unmount(env: &dyn FlashEnv, volume: &Path, timeout: Duration, poll: Duration) -> bool {
    let mut waited = Duration::ZERO;
    loop {
        if !env.volume_present(volume) {
            return true;
        }
        if waited >= timeout {
            return false;
        }
        env.sleep(poll);
        waited = waited.saturating_add(poll.max(Duration::from_millis(1)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fsops::{FlashEnv, VolumeEntry, WriteAttempt};
    use std::cell::RefCell;
    use std::path::PathBuf;

    struct MockEnv {
        writes: RefCell<Vec<WriteAttempt>>,
        present: RefCell<Vec<bool>>,
        info: Option<String>,
    }
    impl MockEnv {
        fn new(writes: Vec<WriteAttempt>, present: Vec<bool>) -> Self {
            MockEnv {
                writes: RefCell::new(writes),
                present: RefCell::new(present),
                info: None,
            }
        }
        fn with_info(mut self, info: &str) -> Self {
            self.info = Some(info.to_string());
            self
        }
    }
    impl FlashEnv for MockEnv {
        fn list_uf2_volumes(&self) -> Vec<VolumeEntry> {
            vec![]
        }
        fn volume_present(&self, _p: &Path) -> bool {
            let mut seq = self.present.borrow_mut();
            if seq.is_empty() {
                false
            } else {
                seq.remove(0)
            }
        }
        fn read_info_uf2(&self, _p: &Path) -> Option<String> {
            self.info.clone()
        }
        fn write_attempt(
            &self,
            _p: &Path,
            _f: &str,
            data: &[u8],
            _chunk: usize,
            progress: &mut dyn FnMut(u64),
        ) -> WriteAttempt {
            let mut w = self.writes.borrow_mut();
            let att = if w.is_empty() {
                WriteAttempt {
                    written: data.len() as u64,
                    errno: None,
                }
            } else {
                w.remove(0)
            };
            progress(att.written);
            att
        }
        fn sleep(&self, _d: Duration) {}
    }

    fn fast_timings() -> Timings {
        Timings {
            stabilize: Duration::ZERO,
            eacces_retry_wait: Duration::ZERO,
            eacces_max_retries: 10,
            unmount_poll: Duration::from_millis(1),
            unmount_timeout: Duration::ZERO,
            unmount_timeout_after_rewrite: Duration::ZERO,
            premature_slack: 100,
            write_chunk: 64 * 1024,
        }
    }
    fn cfg() -> FlashConfig {
        FlashConfig {
            timings: fast_timings(),
            board_id_prefix: None,
        }
    }
    fn vol() -> PathBuf {
        PathBuf::from("/Volumes/XIAO-SENSE")
    }
    fn flash(env: &MockEnv, data: &[u8], c: &FlashConfig) -> Result<FlashOutcome, FlashError> {
        flash_uf2(env, &vol(), "fw.uf2", data, c, &mut |_p| {}, &CancelFlag::new())
    }

    #[test]
    fn eacces_then_success() {
        let env = MockEnv::new(
            vec![
                WriteAttempt { written: 0, errno: Some(13) },
                WriteAttempt { written: 1000, errno: None },
            ],
            vec![true, false],
        );
        let mut c = cfg();
        c.timings.unmount_timeout = Duration::from_millis(10);
        assert_eq!(flash(&env, &vec![0u8; 1000], &c), Ok(FlashOutcome::ProvisionalSuccess));
    }

    #[test]
    fn reboot_like_near_end_is_success() {
        // total 1000, slack=min(100, 250)=100, threshold=900. 980>=900.
        let env = MockEnv::new(vec![WriteAttempt { written: 980, errno: Some(5) }], vec![false]);
        let mut c = cfg();
        c.timings.unmount_timeout = Duration::from_millis(10);
        assert_eq!(flash(&env, &vec![0u8; 1000], &c), Ok(FlashOutcome::ProvisionalSuccess));
    }

    #[test]
    fn reboot_like_early_and_gone_is_premature() {
        let env = MockEnv::new(vec![WriteAttempt { written: 400, errno: Some(5) }], vec![false]);
        assert_eq!(
            flash(&env, &vec![0u8; 1000], &cfg()),
            Err(FlashError::PrematureReboot { written: 400, total: 1000 })
        );
    }

    #[test]
    fn partial_write_present_then_partial_rewrite_is_not_success() {
        // W1 regression: partial write, volume present -> rewrite; rewrite also
        // partial and volume gone -> PrematureReboot (never a false success).
        let env = MockEnv::new(
            vec![
                WriteAttempt { written: 400, errno: Some(5) },
                WriteAttempt { written: 420, errno: Some(5) },
            ],
            vec![true /*present after 1st*/, false /*gone after rewrite*/],
        );
        assert_eq!(
            flash(&env, &vec![0u8; 1000], &cfg()),
            Err(FlashError::PrematureReboot { written: 420, total: 1000 })
        );
    }

    #[test]
    fn small_uf2_zero_written_is_not_false_success() {
        // M2 regression: total 100, slack=min(100,25)=25, threshold=75.
        // written 0 (<75) + volume gone -> PrematureReboot (was false success before).
        let env = MockEnv::new(vec![WriteAttempt { written: 0, errno: Some(5) }], vec![false]);
        assert_eq!(
            flash(&env, &vec![0u8; 100], &cfg()),
            Err(FlashError::PrematureReboot { written: 0, total: 100 })
        );
    }

    #[test]
    fn errno_other_is_write_failed() {
        // M3 regression: a mapped/unknown errno (e.g. -1) is a hard failure,
        // never confused with a clean (None) completion.
        let env = MockEnv::new(vec![WriteAttempt { written: 500, errno: Some(-1) }], vec![]);
        assert_eq!(
            flash(&env, &vec![0u8; 1000], &cfg()),
            Err(FlashError::WriteFailed { errno: -1, written: 500 })
        );
    }

    #[test]
    fn permission_denied_exhausts_retries() {
        let env = MockEnv::new(
            vec![
                WriteAttempt { written: 0, errno: Some(13) },
                WriteAttempt { written: 0, errno: Some(13) },
                WriteAttempt { written: 0, errno: Some(13) },
            ],
            vec![true, true, true, true],
        );
        let mut c = cfg();
        c.timings.eacces_max_retries = 2;
        assert!(matches!(
            flash(&env, &vec![0u8; 1000], &c),
            Err(FlashError::PermissionDenied { .. })
        ));
    }

    #[test]
    fn eacces_then_volume_gone_is_no_bootloader() {
        let env = MockEnv::new(vec![WriteAttempt { written: 0, errno: Some(13) }], vec![false]);
        assert_eq!(flash(&env, &vec![0u8; 1000], &cfg()), Err(FlashError::NoBootloaderVolume));
    }

    #[test]
    fn unmount_timeout_then_rewrite_succeeds() {
        let env = MockEnv::new(
            vec![
                WriteAttempt { written: 1000, errno: None },
                WriteAttempt { written: 1000, errno: None },
            ],
            vec![true, false],
        );
        assert_eq!(flash(&env, &vec![0u8; 1000], &cfg()), Ok(FlashOutcome::ProvisionalSuccess));
    }

    #[test]
    fn board_id_gate_rejects_foreign_volume() {
        let env = MockEnv::new(vec![], vec![]).with_info("Board-ID: RPI-RP2\r\n");
        let mut c = cfg();
        c.board_id_prefix = Some("Seeed_XIAO_nRF52840".to_string());
        assert!(matches!(
            flash(&env, &vec![0u8; 1000], &c),
            Err(FlashError::NotUf2Volume { .. })
        ));
    }

    #[test]
    fn board_id_gate_accepts_matching_volume() {
        // Real shipping INFO_UF2.TXT Board-ID (measured 2026-07-09).
        let env = MockEnv::new(
            vec![WriteAttempt { written: 1000, errno: None }],
            vec![false],
        )
        .with_info("Model: Seeed XIAO nRF52840 Sense\r\nBoard-ID: Seeed_XIAO_nRF52840_Sense\r\n");
        let mut c = cfg();
        c.board_id_prefix = Some("Seeed_XIAO_nRF52840".to_string());
        assert_eq!(flash(&env, &vec![0u8; 1000], &c), Ok(FlashOutcome::ProvisionalSuccess));
    }

    #[test]
    fn cancel_before_write() {
        let env = MockEnv::new(vec![], vec![]);
        let c = CancelFlag::new();
        c.cancel();
        assert_eq!(
            flash_uf2(&env, &vol(), "fw.uf2", &[0u8; 10], &cfg(), &mut |_p| {}, &c),
            Err(FlashError::Cancelled)
        );
    }
}
