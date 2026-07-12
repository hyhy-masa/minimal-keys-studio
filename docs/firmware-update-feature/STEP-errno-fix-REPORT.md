# STEP errno fix completion report

## 1. Changed tests

`ERRNO_PERM`:

- `eacces_then_success`
- `permission_denied_exhausts_retries`
- `eacces_then_volume_gone_is_no_bootloader`

`ERRNO_REBOOT_LIKE`:

- `reboot_like_near_end_is_success`
- `reboot_like_early_and_gone_is_premature`
- `partial_write_present_then_partial_rewrite_is_not_success`
- `small_uf2_zero_written_is_not_false_success`

All errno injections in `machine.rs` were audited. `errno_other_is_write_failed` remains unchanged with `Some(-1)`, which classifies as `Other` on both Unix and Windows. No other test injects an errno literal.

## 2. Constants introduced

```rust
#[cfg(windows)]
const ERRNO_PERM: i32 = 5;
#[cfg(not(windows))]
const ERRNO_PERM: i32 = 13;
const ERRNO_REBOOT_LIKE: i32 = 2;
```

## 3. Test result

Command:

```text
cargo test --manifest-path crates/mk-flash-core/Cargo.toml
```

Result:

```text
running 51 tests
test result: ok. 51 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

Doc-tests mk_flash_core

running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

## 4. Diff scope

`git diff --stat`:

```text
 CLAUDE.md                           |  4 +++
 crates/mk-flash-core/src/machine.rs | 50 +++++++++++++++++++++++++++++--------
 2 files changed, 44 insertions(+), 10 deletions(-)
```

The `CLAUDE.md` diff existed before this task and was not modified. Every changed hunk in `machine.rs` is inside its `#[cfg(test)] mod tests` module. Production code, including `classify_errno`, `flash_uf2`, and all other non-test functions, has zero diff.

The brick-prevention gate is `build_limits` in `src-tauri/src/flash/mod.rs`. `git diff --stat -- src-tauri/src/flash/mod.rs` produced no output, confirming zero diff.

## 5. HEAD and commit status

`git log -1 --oneline`:

```text
81f1521 docs(fw-update): Step 5+6 completion reports (Codex)
```

HEAD remains `81f1521`. No commit was made.
