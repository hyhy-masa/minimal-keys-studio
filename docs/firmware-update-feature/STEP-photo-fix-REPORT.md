# STEP Photo Fix Report

## 1. Summary of the change

- In the shared `r_flash_confirm` / `l_flash_confirm` branch, derived `sideRL` as the `"R" | "L"` value required by `GuideDiagram` while retaining the existing Japanese `side` display string.
- Added `<GuideDiagram side={sideRL} />` after the origin-specific explanatory paragraph and before the button row.
- Because the diagram is outside the `origin === "existing"` conditional, it is rendered for both `origin="existing"` and `origin="new"`, and for both R/L confirmation screens.
- No changes were made to `r_flashing` / `l_flashing`, `machine.ts`, `src-tauri/src/flash/mod.rs`, or `.github/workflows/release.yml`.

## 2. Test added

- `C-4a: renders the right-side guide photo for existing confirmation`
- `C-4a: renders the right-side guide photo for new confirmation`

These are the two expanded cases of one `it.each` test. Before the implementation, both cases failed because no accessible `img` existed; after the implementation, the focused suite passed with 11/11 tests.

## 3. Verification results

### `npm test`

PASS (exit code 0):

```text
Test Files  41 passed (41)
Tests  298 passed (298)
Duration  2.87s
```

The `ErrorBoundary.test.tsx` suite printed its intentional thrown-error stack traces, but Vitest completed successfully with zero failed tests.

### `npm run build`

PASS (exit code 0):

```text
> tsc && vite build
✓ 3015 modules transformed.
✓ built in 1.49s
```

Vite emitted the existing dynamic/static import and chunk-size warnings; the build completed successfully.

### `npm run lint`

PASS (exit code 0):

```text
> eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0
```

## 4. `git diff --stat` output

Command scoped to the two authorized code/test files so the pre-existing unrelated `CLAUDE.md` working-tree change is excluded:

```text
$ git diff --stat -- src/firmware-update/WizardBody.tsx src/firmware-update/WizardBody.test.tsx
 src/firmware-update/WizardBody.test.tsx | 9 +++++++++
 src/firmware-update/WizardBody.tsx      | 4 +++-
 2 files changed, 12 insertions(+), 1 deletion(-)
```

The following protected-scope command produced no output, confirming zero diff in the state machine, Rust gate, and release workflow:

```text
$ git diff --name-only -- src/firmware-update/machine.ts src-tauri/src/flash/mod.rs .github/workflows/release.yml
```

Inspection of the `WizardBody.tsx` hunk also confirms that `r_flashing` / `l_flashing` and the cancel button's `isDisabled` logic are untouched.

## 5. `git log -1 --oneline` output and HEAD

```text
$ git log -1 --oneline
0e4a5a2 ci: add artifact upload fallback for tauri-action release failure

$ git rev-parse HEAD
0e4a5a2552c1f6f7bc2d47a46b2905b50517cee6
```

HEAD remains `0e4a5a2`; no commit, add, tag, push, rebase, or reset was performed. The unrelated pre-existing `CLAUDE.md` modification was not touched.
