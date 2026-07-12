# Step 5 UI 実装報告

対象ブランチ: `feature/fw-update-integration`  
Step 4 基点: `6b81cab5c9df492ae1c8f15ec8282aca3c226ff8`

## 5a — 純粋抽出

コミット:

```text
99ed818 refactor(fw): extract WizardBody from modal/stories (Step 5a)
```

コミット直前の受入結果:

```text
npm test       PASS — 39 test files, 286 tests passed
npm run build  PASS — tsc && vite build (exit 0)
npm run lint   PASS — eslint (exit 0)
```

確認内容:

- `FirmwareUpdateModal.tsx` の body switch と表示専用部品を新規 `WizardBody.tsx` へ移動した。
- modal は hook、Escape 抑止、dialog shell を保持し、body は `WizardBody` を1回描画する形になった。
- stories の複製 body switch を削除し、同じ `WizardBody` にダミーpropsを渡す形へ置換した。
- `canClose` の重複 predicate は、Step 4 で導入済みの同値関数 `canCloseStep()` を参照する形へ置換した。対象state集合は不変。
- 5a差分には新UI文言・新state描画・イベント遷移の変更はない。story用コメントの更新と、抽出に伴うimport/props接続のみを含む。

5aコミット差分統計:

```text
.../FirmwareUpdateModal.stories.tsx                | 408 +--------------------
src/firmware-update/FirmwareUpdateModal.tsx        | 405 +-------------------
src/firmware-update/WizardBody.tsx                 | 392 ++++++++++++++++++++
3 files changed, 428 insertions(+), 777 deletions(-)
```

## 5b — UI挙動変更

コミット:

```text
c1d0381 feat(fw): confirm screens + version display + recovery/error text (Step 5b)
```

TDD記録:

- `WizardBody.test.tsx` と `RecoveryPanel.test.tsx` を先に追加して実行した。
- RED: C-1, C-2, C-4（R/L・existing/new）, C-5, C-7 が未実装として失敗。C-3/C-6 は既存Step 4の実装で通過。
- GREEN: 実装後、対象2ファイルは 10 tests passed。全体受入は次のとおり。

コミット直前の受入結果:

```text
npm test       PASS — 41 test files, 296 tests passed
npm run build  PASS — tsc && vite build (exit 0)
npm run lint   PASS — eslint (exit 0)
```

追加テスト:

- C-1: done で `fw.version=null` でも `manifest.version` と「を書き込みました」を表示。
- C-2: 未確認版の表示文言、最新版見出し、更新ボタン活性。
- C-3: supported かつ current=latest で「最新です」。
- C-4: R/L × existing/new の確認文言と `CONFIRM_WRITE_R/L` dispatch。
- C-5: error のボタンが `errorRecoveryButtonLabel` を使い、recovery title と異なる。
- C-6: `r_flash_confirm` / `l_flash_confirm` は close不可、既存8 state はclose可。
- C-7: recovery_waiting でケーブル確認がリセット案内より先。

実装内容:

- R/Lの確認画面、既存/新規の契約文言、[中止] / [このまま進める] と `CONFIRM_WRITE_R/L` dispatch。
- done は接続中の版に依存せず `manifest.version` を常時表示。
- show_release の判定値から `"不明"` sentinel を撤去し、表示専用フォールバックへ分離。
- errorボタンの `errorRecoveryButtonLabel` 参照、guide の「確認画面に進みます」文言、recovery_waiting のケーブル確認先行。
- stories に `FlashConfirmRNew` / `FlashConfirmRExisting` / `FlashConfirmLNew` / `FlashConfirmLExisting` / `DoneDisconnected` と各dark variantを追加。

## 履歴確認

`git log --oneline -4` 実測:

```text
c1d0381 feat(fw): confirm screens + version display + recovery/error text (Step 5b)
99ed818 refactor(fw): extract WizardBody from modal/stories (Step 5a)
6b81cab feat(fw): confirm-gate state machine + ConnectionLost text + hooks (Step 4)
38aaae7 refactor(fw): propagate adopt_present + AcquiredVolume through Tauri cmd and CLI (Step 3)
```

指定された Step 1〜4 の既存ハッシュは変更していない:

```text
6b81cab Step 4
38aaae7 Step 3
642f616 Step 1+2 completion report
76135ff Step 2 core
```

`git log --oneline -6` で `642f616` / `76135ff` も確認済み。rebase / amend / squash / reset / force push は実行していない。

## 基点からの差分

`git diff --stat 6b81cab..HEAD` 実測:

```text
.../FirmwareUpdateModal.stories.tsx                | 423 ++-------------------
src/firmware-update/FirmwareUpdateModal.tsx        | 405 +-------------------
src/firmware-update/RecoveryPanel.test.tsx         |  29 ++
src/firmware-update/RecoveryPanel.tsx              |   2 +-
src/firmware-update/WizardBody.test.tsx            | 109 ++++++
src/firmware-update/WizardBody.tsx                 | 414 ++++++++++++++++++++
6 files changed, 604 insertions(+), 778 deletions(-)
```

`git diff --check 6b81cab..HEAD` は出力なし（PASS）。Rust、CI、`machine.ts`、`CLAUDE.md` はこの差分に含まれない。

## 逸脱・迷った点

- `npm run build-storybook` は、Storybook が global settings を `~/.storybook/settings.json`（再試行時は `/tmp/.../.storybook/settings.json`）に作成しようとして環境権限で `EPERM` となり、終了コード1だった。preview bundle の生成完了ログは出たが、成功とは扱わない。これは必須受入の `npm test` / `npm run build` / `npm run lint` には含まれない。
- 生成された `storybook-static/` はコミットせず、作業中に生成したものだけを削除した。
- 本報告書は「5a/5bの2コミット」を守るため、2つの実装コミット後に作成しており、未コミットである。既存の `M CLAUDE.md` は一切変更・コミットしていない。
