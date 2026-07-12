# Firmware-update Step 4 report

## Verification

- `npm test` — exit 0: `Test Files  39 passed (39)`; `Tests  286 passed (286)`.
- `npm run build` — exit 0: `✓ built in 1.47s`.
- `npm run lint` — exit 0 (ESLint produced no errors or warnings).

The Vitest run prints expected `ErrorBoundary.test.tsx` error-boundary console output; all 39 test files and 286 tests passed.

## Added reducer tests

- T-1: guide → `VOLUME_DETECTED_R/L` reaches the matching confirmation state and retains manifest/origin.
- T-2: `CONFIRM_WRITE_R/L` transitions only from the matching confirmation state to flashing.
- T-3: unrelated and duplicate detection events are no-ops in `r_flash_confirm`.
- T-4: `CONFIRM_WRITE_R` in `r_bootloader_guide` is a no-op. This is the load-bearing structural confirmation-gate test: no guide → flashing event exists.
- T-5: confirmation states reset to idle and enter recovery with `from: null`.
- T-6: `ENTER_RECOVERY` propagates an optional message.
- T-7: the full R-confirm → L-confirm happy path reaches done.
- T-8: `RECOVERY_FLASH_ERR` from `recovery_flashing` returns to recovery and preserves `from`.

`ja.test.ts` also covers the `ConnectionLost` error kind and verifies that `errorRecoveryButtonLabel` is non-empty and differs from `stepTitle.recovery`.

## `git log --oneline -3`

```text
061b9d1 feat(fw): confirm-gate state machine + ConnectionLost text + hooks (Step 4)
38aaae7 refactor(fw): propagate adopt_present + AcquiredVolume through Tauri cmd and CLI (Step 3)
642f616 docs(fw-update): Step 1+2 completion report (Codex)
```

## `git diff --stat a7a16b9..HEAD`

```text
 docs/firmware-update-feature/STEP3-REPORT.md |  10 +--
 docs/firmware-update-feature/STEP4-REPORT.md |  53 +++++++++++++
 src-tauri/src/flash/mod.rs                   |   4 +-
 src/firmware-update/ja.test.ts               |  14 +++-
 src/firmware-update/ja.ts                    |   6 ++
 src/firmware-update/machine.test.ts          | 113 +++++++++++++++++++++++++--
 src/firmware-update/machine.ts               |  55 ++++++++++---
 src/firmware-update/useFirmwareUpdate.ts     |  37 ++++++---
 src/firmware-update/useRecoveryActions.ts    |   9 ++-
 9 files changed, 262 insertions(+), 39 deletions(-)
```

## BOOTLOADER event removal

`rg -n 'BOOTLOADER_[RL]' src --glob '*.{ts,tsx}'` returned zero results after implementation. `BOOTLOADER_R/L` is removed from the `WizardEvent` union, reducer handling, tests, and all TypeScript dispatch call sites.

## Deviations / points of uncertainty

None. The UI intentionally does not render the new confirmation states yet; that is Step 5 scope.
