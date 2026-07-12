# 18 — 実機異常系3問題 最終修正プラン（実装指示書・正本）

- 日付: 2026-07-12 ／ 統括: Fable 5（最終統括官）
- 対象: `feature/fw-update-integration`（v0.4.0 = `e79068e`）
- 位置づけ: **本書が実装の正本**。`16-fix-plan-fable5.md` は一次計画（経緯資料）、`17-codex-review.md` の Critical 1 / Major 5 / Minor 3 / 波及指摘を**全反映**して確定した。実装担当（Codex）は本書だけを見て実装する。
- 検証: 本書の file:line は 2026-07-12 に統括官が実コードで**全件独立再検証済み**（§10 に補正一覧）。
- 性質: 設計のみ。ソースは未変更。

---

## 0. 総括 — Codex レビューをどう反映したか

| Codex 指摘 | 反映内容 |
|---|---|
| **Critical C-1**（単発 scan は安全境界にならない／確認後の非同期取得と遷移が未定義） | C-fix-2 を **「検出後は常に最終確認」方式に全面再設計**（§3）。既存/新規を問わず、取得完了→`volumeRef` 確定→検出イベント→**確認画面**→確認イベント→flashing の一方向のみ。scan・baseline・drive letter・既存/新規の分類のいずれにも安全性を依存させない。取得は確認**前**に完了しているため「確認後の非同期取得」自体が存在しない設計にした（`*_bootloader_adopting` 中間状態は不要になる） |
| **Major M-1**（A-fix-1 の presence／リトライ／分類の自己矛盾） | A-fix-1 を再定義（§4）: `None` は presence 値に**かかわらず**有限リトライへ。途中で読めたら Board-ID 判定。全滅なら**最後に 1 回だけ** presence 判定 → 消失=`ConnectionLost`／存在=`Io`。`NotUf2Volume` は「読めたが Board-ID 欠落 or prefix 不一致」に限定。リトライ途中の抜線が `NotUf2Volume` に落ちる経路をゼロにした |
| **Major M-2**（複数台/Board-ID/キャンセル/同一 path 再列挙の契約不足） | Board-ID 分類・複数台判定・origin（既存/新規）分類は**全て Rust core に置く**（TS に prefix を複製しない）。0/1/2+・scan error・cancel・確認中 detach・late async の遷移を §3 の契約表で全定義。通常フローは baseline を渡さない（`baseline: []`）ため **path identity への依存自体を排除** — Windows 同一ドライブレター問題は顧客経路で構造的に消滅 |
| **Major M-3**（テストコマンド不成立・CI に Rust テストなし） | workspace 無しを確認済み。`--manifest-path` 3 種＋npm に是正（§6）。release CI に core/CLI/Tauri の Rust テストを追加し、**clamp テストを出荷ゲート化**（§5 Step 6） |
| **Major M-4**（新 state の網羅契約が未明文化） | §3.2 の契約表で「表示／許可 event／effect／close・cancel／redrivable origin／late async／R・L 両側」を state ごとに明文化。`stepTitle` は `Record` でコンパイル強制、body switch は **WizardBody 抽出で modal/stories の複製を 1 本化**、`canClose` は `machine.ts` の関数へ抽出して 3 重複製を解消 |
| **Major M-5**（Windows 同一レター再利用の再現テストなし） | §6 Rust ケース V-7/V-8 で `E:\` 消失→再出現、foreign が先に同一レターを使うケースを unit test 化。実機 E2E に E7（レター記録付き）を追加 |
| **Minor m-1**（表示文言と判定値の結合） | 判定は `fw.version` 直値、表示は別変数でフォールバック（§2 B-fix-2）。sentinel 文字列 `"不明"` 依存を撤去 |
| **Minor m-2**（A-3 改名箇所とテスト先が不正確） | ボタン文言を `ja.ts` の定数 `errorRecoveryButtonLabel` に集約し、WizardBody（1 本化後）が参照。`ja.test.ts` で「recovery タイトルと不一致」を assert（§2 A-3） |
| **Minor m-3**（story だけでは回帰にならない） | done×未接続の **component test**（Vitest + Testing Library、既存基盤あり）を追加。文言も「今回書き込んだ版」と分かる形に（§2 B-fix-1） |
| **波及漏れ**（`volume.rs:251` foreign test／`wait_for_new_volume` の test 呼出 4 件） | §7 の波及チェックリストに全件列挙（実コードで行番号を再確認済み: :151/:170/:191/:207/:224/:251） |
| **訂正**（`crates/mk-flash-core/src/mod.rs` は存在しない） | 確認済み。ブリック防止ゲートの正しい所在は `src-tauri/src/flash/mod.rs:133-160`（`build_limits`）＋ `:162-208`（検証→書込経路）＋ `:215-310`（F-1〜F-3 テスト）。**この範囲は差分ゼロ**をレビュー条件とする（§8） |
| **代替案**（bool より enum） | Codex 自身が「必須条件ではない」と明記。**bool `adopt_present` を採用**（最小差分・Tauri 境界で named boolean として十分）。判断理由を §2 C-fix-1 に記録 |

**16 からの重要な設計変更（矛盾の解消）**: 一次計画は「通常フロー = `adoptPresent:false`（新規のみ待つ）」だったが、Codex 推奨の「検出後は常に最終確認」を採用すると、**通常フローも既存採用（adopt=true）を許した上で、人間の確認を必須ゲートにする**のが正しい形になる（adopt=false のままだと bootloader 残留客が 60 秒タイムアウトに詰まる＝C-fix-2 が防ごうとした事象が再発する）。安全思想は「baseline diff が唯一のガード」から「**確認画面が必須ゲート、baseline は不使用**」へ移行する。`adopt_present` パラメータ自体は残す（呼び出し側の意図をシグネチャに固定し、`false`＝新規限定モードの契約をテストで固定するため。将来の非 UI 呼び出しにも効く）。

**実測で確定済みの前提（コード修正の要否に直結）**:
- A-1: 抜線後デバイスは bootloader 残留 → C-fix-2 の「既存検出→確認」が必須。
- A-2: 「minimal-keys ではない」は抜いた直後の自動表示（preflight 窓）→ A-fix-1 が正対。
- A-3: **②が出ない件は error 画面と recovery 画面の取り違えで確定（コードバグではない）** → 対処は error 画面ボタン改名のみ。16 §5 の「旧ビルド説」は棄却済み。
- B-1/B-2: FW v1.0.0 は fwinfo 実装済み・BLE 再接続で版表示 → B 系は表示修正（B-fix-1/2）のみで確定。

---

## 1. 変更対象ファイル一覧（全体マップ）

| ファイル | 変更 | Step |
|---|---|---|
| `crates/mk-flash-core/src/volume.rs` | `adopt_present` 引数＋`AcquiredVolume`/`VolumeOrigin` 戻り値、`wait_for_new_volume` に prefix filter、テスト全面更新 | 1 |
| `crates/mk-flash-core/src/lib.rs` | `AcquiredVolume` / `VolumeOrigin` の re-export 追加（`:31` 付近） | 1 |
| `crates/mk-flash-core/src/error.rs` | `ConnectionLost { path }` variant 追加 | 2 |
| `crates/mk-flash-core/src/machine.rs` | `preflight_board_id` 再定義＋`Timings` に preflight リトライ定数＋テスト追加（**書込ループ等は差分ゼロ**） | 2 |
| `src-tauri/src/flash/mod.rs` | `flash_wait_for_bootloader` のみ変更（`adopt_present` 受け・`AcquiredVolume` 返し）。**`build_limits`/`flash_write_uf2`/テスト群は差分ゼロ** | 3 |
| `crates/mk-flash-cli/src/main.rs` | `:125` / `:189` の呼出を新シグネチャに追随（`true`・`.volume`） | 3 |
| `src/firmware-update/machine.ts` | 新 state ×2・新 event ×4・`BOOTLOADER_R/L` 廃止・`ENTER_RECOVERY` に message・`canCloseStep()` 追加 | 4 |
| `src/firmware-update/ja.ts` | `stepTitle` 2 键追加・`ConnectionLost` 文言・`errorRecoveryButtonLabel` 定数 | 4 |
| `src/firmware-update/useFirmwareUpdate.ts` | `waitBootloader` 再実装（scan 廃止・adopt=true・origin 受け）・effect switch に確認 state（no-effect） | 4 |
| `src/firmware-update/useRecoveryActions.ts` | `adoptPresent: true` 明示・`.volume` 追随 | 4 |
| `src/firmware-update/machine.test.ts` / `ja.test.ts` | 新遷移・新文言・flashing 由来 RECOVERY_FLASH_ERR ほか | 4 |
| `src/firmware-update/WizardBody.tsx`（新規） | body switch の抽出（modal と stories の複製を 1 本化） | 5 |
| `src/firmware-update/FirmwareUpdateModal.tsx` | WizardBody 使用・確認画面・B-fix-1/2・A-3 改名・`canCloseStep` 参照 | 5 |
| `src/firmware-update/RecoveryPanel.tsx` | A-fix-2（ケーブル確認を先頭に） | 5 |
| `src/firmware-update/FirmwareUpdateModal.stories.tsx` | 複製 Screen を WizardBody 参照へ・確認画面/done×未接続 story 追加 | 5 |
| `src/firmware-update/WizardBody.test.tsx` / `RecoveryPanel.test.tsx`（新規） | component test（Testing Library・既存基盤 `src/*.test.tsx` と同様式） | 5 |
| `.github/workflows/release.yml` | Rust テスト 3 種を CI に追加 | 6 |

**変更しないもの（差分ゼロ条件・§8）**: `src-tauri/src/flash/mod.rs` の `build_limits`（`:133-160`）・`flash_write_uf2`（`:162-208`）・`#[cfg(test)]` F-1〜F-3 テスト群（`:215-310`）／ `machine.rs` の書込ループ（`:154-251`）・`finish_completed`/`rewrite_and_finish`/`await_unmount`（`:272-372`）・`classify_errno`（`:120-143`）／ `src-tauri/src/main.rs:35` の command 登録（引数追加のみで登録名は不変＝**変更不要と確認済み**）。

---

## 2. 問題別 最終修正（file:line・確定方針）

### 2-C. 問題C — リセット2回押しなしで書き込み開始（publish ブロッカー）

**C-fix-1（コア・確定）: `acquire_bootloader` に `adopt_present: bool` を追加し、戻り値で origin を報告する**

- 場所: `crates/mk-flash-core/src/volume.rs:64-95`（定義）。現状は present 一致 1 個なら baseline を見ずに即採用（`:85-86`）、baseline は `wait_for_new_volume`（`:94` → filter `:37`）でしか参照されない — 実コードで確認済み。
- 新契約:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VolumeOrigin { Existing, New }

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AcquiredVolume {
    pub volume: VolumeEntry,
    pub origin: VolumeOrigin,
}

pub fn acquire_bootloader(
    env: &dyn FlashEnv,
    baseline: &[String],
    board_id_prefix: Option<&str>,
    adopt_present: bool,
    timeout: Duration,
    poll: Duration,
    cancel: &CancelFlag,
) -> Result<AcquiredVolume, FlashError>
```

- 動作:
  - `adopt_present == true`: 現行どおり present を prefix で絞り、1 個 → `Ok(AcquiredVolume { volume, origin: Existing })`、2 個以上 → `MultipleBootloaderVolumes`、0 個 → `wait_for_new_volume` へフォールスルー → 成功時 `origin: New`。
  - `adopt_present == false`: **present 分岐を丸ごとスキップ**して即 `wait_for_new_volume` へ → 成功時 `origin: New`。
- bool か enum か: Codex 代替案の `AdoptPresent::Allow/Forbid` enum は「必須条件ではない」（17 §代替案）。**bool を採用**（差分最小・Tauri 境界は named boolean で十分・rustdoc に契約を明記）。
- 呼び出し側の値（全件）: 通常フロー=**true**（§3 の確認画面が必須ゲートになるため。16 の「通常=false」から変更）／recovery=**true**（現挙動維持）／CLI=**true**（現挙動維持。厳格化の要否は次版判断として記録のみ）。

**C-fix-2（再設計・確定）: 「検出後は常に最終確認」— 詳細は §3**

- 通常フロー（`useFirmwareUpdate.ts:144-159` `waitBootloader`）を以下に変更:
  1. `flash_scan_volumes` の事前呼出（`:146-147`）を**廃止**（baseline を作らない）。
  2. `flash_wait_for_bootloader({ baseline: [], adoptPresent: true, timeoutSecs: 60 })` を 1 回呼ぶ。
  3. 成功: `volumeRef.current = acq.volume.path` を**先に**確定 → `recordVolume(acq.volume)` → `dispatch({ type: "VOLUME_DETECTED_R"|"VOLUME_DETECTED_L", origin: acq.origin })` → **確認画面**（`r_flash_confirm` / `l_flash_confirm`）。
  4. ユーザーが「このまま進める」→ `CONFIRM_WRITE_R/L` → `r_flashing`/`l_flashing`（既存 effect が `volumeRef.current` で書込。取得は確認前に完了済みなので Codex C-1 の「空/古い path で書く」レースは構造的に存在しない）。
  5. 失敗（timeout / 2 個以上 / IO）: `dispatch({ type: "ENTER_RECOVERY", message: formatError(e) })` — recovery 画面が理由を表示（`MultipleBootloaderVolumes` は既存の「片方だけ接続」文言 `ja.ts:44-45` がそのまま出る）。
- baseline を捨てる根拠: 確認画面が必須ゲートになった後、baseline path filter が提供する安全は残らず、**Windows 同一ドライブレター再利用時の 60 秒タイムアウト（M-2 第 2 懸念）という害だけが残る**ため。path identity への依存を消すのが Codex M-2 の推奨解でもある。
- R/L 取り違えの残余リスクと防御: R と L は同一 Board-ID（`machine.rs:75`・`volume.rs:1-6`）でソフトからは原理的に判別不能。確認画面の existing 用文言に「**反対側がつながったままなら差し替えてください**」を明記し、写真ガイド（`GuideDiagram`）と合わせて人間判断に必要な情報を渡す（§3.3 文言）。誤書込してもブリックはしない（`build_limits` clamp、テスト担保）。

**C-fix-3（コア・確定）: `wait_for_new_volume` に Board-ID prefix filter（対称化）**

- 場所: `crates/mk-flash-core/src/volume.rs:22-54`。
- 新シグネチャ: `wait_for_new_volume(env, baseline: &[String], board_id_prefix: Option<&str>, timeout, poll, cancel)`。filter（`:37`）を `!baseline.contains(&v.path) && matches_prefix(v, board_id_prefix)` にする。prefix 一致判定は present 分岐（`:72-79`）と共通のヘルパー関数に切り出して単一実装にする。
- 波及: 内部呼出 `:94`、テスト呼出 `:151` / `:170` / `:191` / `:207` の 4 件、re-export `lib.rs:31`（名前不変）。§7 参照。

### 2-A. 問題A — NotUf2Volume 誤分類＋復帰不全

**A-fix-1（コア・再定義済み）: §4 に確定契約。** `machine.rs:253-270` の `None => Err(not_uf2())`（`:268`）を廃し、有限リトライ＋最終 presence 判定で `ConnectionLost` / `Io` / `NotUf2Volume` に正しく分類する。

**A-fix-2（UI・小）: recovery_waiting にケーブル確認を先頭追加**

- 場所: `src/firmware-update/RecoveryPanel.tsx:175-189`（現文言 `:178-180` は「リセット 2 回」のみ — 確認済み）。
- 新文言: 「**① USB ケーブルがつながっているか確認 → ② {右|左}側のリセットボタンを「カチカチッ」と素早く 2 回押してください。**」（A-1 実測より、挿し直しだけで bootloader が再マウントされる場合は adopt=true の recovery 取得がリセット不要で成立する。その旨の補足は不要 — 案内はこの 2 手で足りる）。
- テスト: `RecoveryPanel.test.tsx`（新規）で recovery_waiting 表示にケーブル文言が含まれることを assert。

**A-3（UX・小）: error 画面ボタンの改名 — 原因は画面取り違えで確定済み**

- 誘因（実コードで確認）: error 画面の**ボタン**「うまくいかないとき」（`FirmwareUpdateModal.tsx:413-415`、stories 複製 `:396`）と recovery 画面の**タイトル**「うまくいかないとき」（`ja.ts:20`）が同一文字列。
- 修正: `ja.ts` に `export const errorRecoveryButtonLabel = "対処方法を見る";` を新設し、WizardBody（Step 5 で 1 本化）が参照。stories は WizardBody 参照になるため複製更新は自動解消。
- テスト: `ja.test.ts` に「`errorRecoveryButtonLabel` が空でなく、`stepTitle.recovery` と不一致」を assert（m-2 の「ja.test.ts では検証不可」問題を、定数集約により検証可能に変える）。加えて WizardBody.test.tsx で error 画面にこのラベルのボタンが出ることを assert。
- 用語整理（m-2）: 「A-3 文言修正」（本項）と「A-fix-3 = 失敗側 side 事前選択（次版）」は**別項目**。以後この名で区別する。

### 2-B. 問題B — 更新後バージョン不明

**B-fix-1（必須）: done 画面は manifest.version を常時表示**

- 場所: `FirmwareUpdateModal.tsx:387`（現状 `{fw.version && <p>バージョン {fw.version}</p>}` — 確認済み。更新直後は BLE 切断で `fw.version=null` のため構造的に非表示）。
- 修正: `<p>バージョン {state.manifest.version} を書き込みました</p>` を**無条件**表示（done は manifest を保持 — `machine.ts:59` 確認済み）。「〜を書き込みました」の文言で**今回書き込んだ版**であることを明示（m-3 反映。現在接続中の版と誤読させない）。
- テスト: WizardBody.test.tsx — done state × `fw.version=null` で `manifest.version` が DOM に出ることを assert（story 追加だけにしない）。stories にも done×`fwVersion:null` を追加（視覚確認用）。

**B-fix-2（必須・小）: show_release の表示文言と判定値を分離（m-1 反映）**

- 場所: `FirmwareUpdateModal.tsx:202`（`fw.version ?? "不明"`）・`:231`（`isUpdateAvailable(currentVersion === "不明" ? "" : currentVersion, latest)`）・`:246-251`（表示）。
- 修正（WizardBody 内）:

```tsx
const available = isUpdateAvailable(fw.version ?? "", latest);      // 判定は fw.version 直値
const currentVersionDisplay = fw.version ?? "確認できません（更新には支障ありません）"; // 表示専用
```

  `"不明"` sentinel と `currentVersion === "不明" ? "" : ...` の結合を撤去。`upToDate = fw.supported && fw.version !== null && !available`（`:232`）は不変。`isUpdateAvailable`（`versions.ts:13-16`）は不変。
- テスト: WizardBody.test.tsx — (1) `fw.version=null` → 表示に「確認できません」・見出し「最新版を書き込めます」・「更新する」活性、(2) `fw.version="1.5.0"`×latest `1.5.0`×supported → 「最新です」。

**B-fix-3（次版）**: done 後の BLE 自動再接続＋ライブ版照合。B-1/B-2 実測により今回不要と確定。

---

## 3. C-fix-2 再設計 — 状態機械の契約表（M-4 反映）

### 3.1 新規 state / event 定義（`src/firmware-update/machine.ts`）

```ts
export type VolumeOrigin = "existing" | "new";   // Rust serde (rename_all="lowercase") と一致

// WizardState に追加（:52-53 の guide の直後に）:
  | { step: "r_flash_confirm"; manifest: Manifest; origin: VolumeOrigin }
  | { step: "l_flash_confirm"; manifest: Manifest; origin: VolumeOrigin }

// WizardEvent の変更:
//   削除: { type: "BOOTLOADER_R" } / { type: "BOOTLOADER_L" }（:82 / :87）
//   追加:
  | { type: "VOLUME_DETECTED_R"; origin: VolumeOrigin }
  | { type: "VOLUME_DETECTED_L"; origin: VolumeOrigin }
  | { type: "CONFIRM_WRITE_R" }
  | { type: "CONFIRM_WRITE_L" }
//   変更: { type: "ENTER_RECOVERY"; message?: string }   // recovery 画面に理由を出す
```

`BOOTLOADER_R/L` は**削除**する（温存すると guide→flashing の直行経路が残り、確認ゲートの構造保証が壊れる）。削除により `useFirmwareUpdate.ts:193/:199`・`machine.test.ts` の全使用箇所がコンパイルエラーで洗い出される（意図的）。

reducer 追加分:

```ts
case "r_bootloader_guide":
  if (event.type === "VOLUME_DETECTED_R")
    return { step: "r_flash_confirm", manifest: state.manifest, origin: event.origin };
  return state;
case "r_flash_confirm":
  if (event.type === "CONFIRM_WRITE_R") return { step: "r_flashing", manifest: state.manifest };
  return state;
// L 側も対称に。ENTER_RECOVERY / RESET は既存どおり reducer 先頭で全 state 共通処理（:144-145）。
// enterRecovery(state, message?) — message を recovery state に載せる（既存 message フィールド :67 を利用）。
```

`canClose` は `machine.ts` に関数として抽出し単一ソース化（modal `:174-182` と stories `:188-197 付近` の複製を解消）:

```ts
export function canCloseStep(step: WizardState["step"]): boolean {
  // 既存 8 step は不変。r_flash_confirm / l_flash_confirm は false（中止ボタンで抜ける）
}
```

### 3.2 契約表（新規・変更 state の全項目）

| state | 表示（stepTitle / body） | 許可 event（それ以外は no-op） | effect（useFirmwareUpdate） | close(X)・Escape | 中止（cancel） | redrivable origin | late async |
|---|---|---|---|---|---|---|---|
| `r_bootloader_guide`（変更） | 「右側を書き込みモードにしてください」＋写真＋「待機中… ボタンを押すと**確認画面**に進みます。」（`:316` の文言を修正） | `VOLUME_DETECTED_R` → `r_flash_confirm`／`ENTER_RECOVERY`／`RESET` | 進入時に `flash_wait_for_bootloader({baseline: [], adoptPresent: true, timeoutSecs: 60})` を 1 回。成功=volumeRef 確定→`VOLUME_DETECTED_R{origin}`。失敗=`ENTER_RECOVERY{message: formatError(e)}` | 不可（従来どおり） | あり（`flash_cancel`→CancelFlag→Rust が `Cancelled` 返却→cleanup の `cancelled` ガードで dispatch 抑止→RESET 済み） | 自身（既存 `:117` 不変。retry で再取得からやり直し） | effect cleanup の `cancelled` フラグ（既存機構 `:123, :154, :157`）で無視 |
| **`r_flash_confirm`（新規）** | title「右側に書き込む準備ができました」。body は origin で分岐: **existing**=「この右半分はすでに書き込みモードになっています。写真と同じ側（右半分）だけがつながっていることを確認してください。反対側がつながったままの場合は、ケーブルを差し替えて『中止』からやり直してください。」／**new**=「右側を書き込みモードで検出しました。」共通ボタン: [中止(Ghost)] [このまま進める(Primary)] | `CONFIRM_WRITE_R` → `r_flashing`／`RESET`／（`ENTER_RECOVERY` は UI 導線なしだが reducer 上は全 state 共通で有効） | **なし**（純粋にユーザー待ち。invoke を一切発行しない） | 不可（`canCloseStep`=false・Escape は既存 F-5 機構 `:190-200` が canClose 連動で自動抑止） | あり（[中止]→`cancel()`＝`flash_cancel`(no-op)＋`RESET`→idle） | **null**（`redrivableOrigin` の default 枝。確認画面へ retry で戻ると volumeRef が stale になり得るため対象外とする） | この state から発行する async なし。**確認表示中の抜線**はここでは検出せず、`CONFIRM_WRITE_R` 後の書込 preflight（A-fix-1）が `ConnectionLost` に分類して error→recovery へ（契約として明文化） |
| `r_flashing`（不変） | 既存どおり（`:325-341`） | 既存どおり | 既存どおり（`volumeRef.current` 使用 `:171`。**取得は confirm 前に完了済み**） | 不可 | 不可（disabled `:335`） | null（既存） | 既存 |
| `l_bootloader_guide` / **`l_flash_confirm`** / `l_flashing` | 上記 R 行と完全対称（VOLUME_DETECTED_L / CONFIRM_WRITE_L） | 〃 | 〃 | 〃 | 〃 | 〃 | 〃 |
| `recovery`（変更小） | 既存＋`ENTER_RECOVERY{message}` 経由時は理由（例: 複数台文言 `ja.ts:44-45`）を既存の message 枠（`RecoveryPanel.tsx:100-105`）に表示 | 既存どおり | なし（既存） | 可（既存） | — | 既存 | — |

**取得系エラーの遷移契約（M-2 の 0/1/2+/scan error/cancel/detach を全定義）**:

| 事象 | Rust の返り | フロントの遷移 |
|---|---|---|
| 一致 0 個のまま 60 秒 | `NoBootloaderVolume` | `ENTER_RECOVERY{message}` → recovery（「見つかりませんでした…2回押して」文言） |
| 一致 1 個（既存） | `Ok(origin=existing)` | `VOLUME_DETECTED_*` → 確認画面（existing 文言） |
| 一致 1 個（新規出現） | `Ok(origin=new)` | `VOLUME_DETECTED_*` → 確認画面（new 文言） |
| 一致 2 個以上（進入時 or 待機中） | `MultipleBootloaderVolumes` | `ENTER_RECOVERY{message}` → recovery（「片方だけ接続」文言） |
| foreign UF2 のみ | 採用せず待機継続（prefix filter） | （タイムアウトまで待機） |
| 取得中にユーザーが中止 | `Cancelled` | `RESET` 済み＋cleanup ガードで dispatch なし |
| 取得成功→確認表示中に抜線→「このまま進める」 | （書込側）preflight が `ConnectionLost` | `FLASH_*_ERR` → error →（ボタン）recovery |
| 確認表示中に 2 台目を接続→「このまま進める」 | 取得済み volume のみ対象。書込 preflight がその volume を再検証 | 正常書込（2 台目は無関係）— E9 で実機確認 |
| scan/IO 例外（`Io` 等） | 各 variant | `ENTER_RECOVERY{message}` → recovery |

**安全性の根拠（C-1 解消の言い換え）**: reducer 上、`r_flashing`/`l_flashing` に入る event は `CONFIRM_WRITE_R/L` **のみ**であり、その前提 state は `*_flash_confirm` のみ。`*_flash_confirm` に入る event は `VOLUME_DETECTED_*` のみで、これは取得（volumeRef 確定）**完了後**にしか dispatch されない。よって「無確認の書き込み」「取得前の書き込み」は**型と reducer の構造で不可能**。scan の読み損ね・drive letter・既存/新規誤分類は最悪でも「確認画面の文言が existing/new 逆になる」だけで、安全性に影響しない。これを reducer テストで固定する（§6 TS ケース）。

### 3.3 Tauri 境界の契約

- コマンド: `flash_wait_for_bootloader(state, baseline: Vec<String>, adopt_present: bool, timeout_secs: u64) -> Result<AcquiredVolume, FlashError>`（`src-tauri/src/flash/mod.rs:95-117` を変更。core 呼出は `:106-113`）。
- TS からは `{ baseline, adoptPresent, timeoutSecs }`（Tauri 2 は camelCase→snake_case を自動対応。既存 `timeoutSecs` で実績あり）。**注意**: Tauri の引数名不一致はコンパイルでなく実行時エラーになるため、Step 6 の実機 E2E（E1）を境界疎通の必須確認とする。
- TS 型定義（`useFirmwareUpdate.ts` か `supportLog.ts` 近傍）:

```ts
export interface AcquiredVolume { volume: VolumeInfo; origin: "existing" | "new"; }
```

- `flash_scan_volumes` コマンドと登録（`main.rs:34`）は**残す**（呼び出しが無くなるだけ。削除は次版判断）。

---

## 4. A-fix-1 再定義 — preflight 分類契約（M-1 反映）

### 4.1 確定契約

- 場所: `crates/mk-flash-core/src/machine.rs:253-270`（`preflight_board_id`）。呼出は `flash_uf2` 内 `:171-174`（stabilize `:168-169` の後）。
- 前提事実（確認済み）: `RealEnv::volume_present`＝`INFO_UF2.TXT.exists()`（`fsops.rs:78-83`）、`read_info_uf2`＝同ファイルの `read_to_string`（`:85-87`）。**両者は同一ファイル依存**のため、presence を先に単発判定する設計は成立しない（Codex M-1 のとおり）。
- 新契約（擬似コード）:

```rust
// Timings に追加（machine.rs:39-52 / Default :54-67）:
//   preflight_retry_wait: Duration,  // default 250ms
//   preflight_retries: u32,          // default 3（読取は計 1+3=4 回）

fn preflight_board_id(env, volume, prefix, timings) -> Result<(), FlashError> {
    for attempt in 0..=timings.preflight_retries {
        match env.read_info_uf2(volume) {
            Some(info) => {
                return match parse_board_id(&info) {
                    Some(b) if b.starts_with(prefix) => Ok(()),
                    _ => Err(FlashError::NotUf2Volume { path }),   // 読めたが欠落 or 不一致（即時・リトライしない）
                };
            }
            None if attempt < timings.preflight_retries => env.sleep(timings.preflight_retry_wait),
            None => {}
        }
    }
    // 全リトライで読めなかった。最後に 1 回だけ presence で確定分類:
    if env.volume_present(volume) {
        Err(FlashError::Io { reason: "INFO_UF2.TXT unreadable while volume still mounted (preflight)".into() })
    } else {
        Err(FlashError::ConnectionLost { path })
    }
}
```

- 分類の不変条件（テストで固定）:
  1. `None` 経路から `NotUf2Volume` は**絶対に出ない**（`NotUf2Volume`＝「読めたが Board-ID 欠落 or prefix 不一致」に限定）。
  2. リトライ途中の抜線（読めないまま消失）→ `ConnectionLost`。**presence 判定は最初でなく最後**なので「最初に present=false を見て即 ConnectionLost → リトライに入れない」という M-1 の矛盾は構造的に起きない。
  3. 一過性未準備（None → None → Some(一致)）→ `Ok`。
  4. 終始読めないが volume は存在 → `Io`（`NotUf2Volume` にしない）。`PermissionDenied` への細分は `FlashEnv` API 変更（io エラー種の伝搬）が必要なため**次版**（記録）。
  5. 追加待ち時間の上限 = 3×250ms=750ms（失敗経路のみ。成功時は初回読取で即決）。
- 設計判断の記録: Codex の「各試行で read と presence を観測」に対し、**presence は最終 1 回のみ**とした。理由: (a) 一過性未準備では read と presence が同時に false になり得るため途中観測は分類に寄与しない、(b) 最終 1 回で M-1 の全ケースが正しく分類できる、(c) 実装とテストが単純になる。誤分類の最悪ケースは「一過性なのに ConnectionLost 表示」だが、案内（挿し直して再試行）で自然回復する。
- エラー variant 追加: `crates/mk-flash-core/src/error.rs`（enum `:10-65`）に

```rust
/// The volume vanished while (or just before) we were about to write —
/// classified after the preflight retry loop confirmed INFO_UF2.TXT is gone.
#[error("connection to the bootloader volume was lost: {path}")]
ConnectionLost { path: String },
```

- 文言: `ja.ts` `formatError`（`:38-69`）に `case "ConnectionLost": return "キーボードとの接続が切れたようです。ケーブルを挿し直して、もう一度お試しください。";`。`ja.test.ts` の `FLASH_ERROR_KINDS`（`:9-23`）に `"ConnectionLost"` を追加（fallback でないことが自動検証される既存様式）。
- 却下済み代替（16 §2-A から継承）: stabilize（`:168-169`）を preflight 後ろへ回す案は FSKit 未準備の偽 NotUf2Volume を増やすため不採用（次版の任意改善のまま）。

---

## 5. 実装 Step 別指示書（TDD 順・各 Step 終了時に全テスト緑）

> 実装者への大原則: 各 Step は「**失敗するテストを先に書く → 実装 → 緑 → コミット**」。コミットは Step 単位（Step 5 は 5a/5b の 2 コミット）。この文書にない変更（リファクタ・改善の便乗）は行わない。

### Step 0 — ベースライン確認
- `git status` がクリーンであること。§6 の 4 コマンド＋`npm run build`＋`npm run lint` を実行し、**全緑を記録**（以後の各 Step の受入基準の基準点）。

### Step 1 — Rust core: `volume.rs`（C-fix-1＋C-fix-3）
1. **テスト先行**（`volume.rs` `#[cfg(test)]`。`SeqEnv` は snapshot 列方式のまま流用）: §6「Rust: volume.rs」V-1〜V-9 を追加・改修（既存 4 テスト `:146-215` は `wait_for_new_volume` の新引数 `None`/`Some(prefix)` を追加して維持。`:217-234` は adopt=true＋`origin==Existing` 期待に、`:236-261` は adopt を明示して更新）。
2. 実装: `VolumeOrigin`・`AcquiredVolume`・`acquire_bootloader(adopt_present)`・`wait_for_new_volume(board_id_prefix)`・prefix 判定ヘルパーの共通化（§2 C-fix-1/C-fix-3 のとおり）。
3. `lib.rs:31` に `AcquiredVolume` / `VolumeOrigin` を re-export 追加。
- **受入基準**: `cargo test --manifest-path crates/mk-flash-core/Cargo.toml` 全緑（この時点で CLI / Tauri はコンパイル不能で良い — Step 3 で追随）。`volume.rs` のヘッダコメント（`:1-6`「baseline diff が構造ガード」）を新契約（「人間の最終確認が必須ゲート。origin は表示用」）に**書き換える**こと（doc drift 防止）。

### Step 2 — Rust core: `machine.rs`＋`error.rs`（A-fix-1）※Step 1 と独立・同 PR 可
1. **テスト先行**: §6「Rust: machine.rs」M-1〜M-6。`MockEnv`（`:381-435`）を拡張: `read_info_uf2` を呼出ごとの `Option<String>` 列で返せる形（既存 `with_info` 互換は維持）＋ `sleep` 呼出回数カウンタ。
2. 実装: `Timings` に `preflight_retry_wait`（default 250ms）/ `preflight_retries`（default 3）を追加（`fast_timings`（`:437-448`）は `ZERO`/3）。`preflight_board_id` を §4.1 契約に書換え。`error.rs` に `ConnectionLost { path }` 追加。
- **受入基準**: core 全緑。**差分ゼロ確認**: `flash_uf2` の書込ループ（`:176-251`）・`finish_completed`（`:275-309`）・`rewrite_and_finish`（`:315-357`）・`await_unmount`（`:360-372`）・`classify_errno`（`:120-143`）に diff が無いこと（`git diff` で目視＋レビュー条件）。既存テスト（`:462-602`、特に Board-ID gate `:570-591`）が無改変で緑のこと。

### Step 3 — Tauri＋CLI の署名追随（Step 1 依存）
1. `src-tauri/src/flash/mod.rs:95-117`: `adopt_present: bool` 引数追加・戻り値 `AcquiredVolume`・core へ伝播（`:106-113`）。**このファイルの他部分に差分を出さない**。
2. `crates/mk-flash-cli/src/main.rs:125` / `:189`: `true` を渡し、戻り値は `.volume` 経由に（`vol.path` → `acq.volume.path`）。挙動不変。
3. `npm run build`（`dist/` 生成。`tauri::generate_context!` が dist を要求するため cargo test の前に必須）→ `cargo test --manifest-path src-tauri/Cargo.toml`。
- **受入基準**: Tauri crate テスト全緑（F-1〜F-3 テスト `:242-309` が**無改変**で緑）。`cargo build --manifest-path crates/mk-flash-cli/Cargo.toml` 成功。`git diff src-tauri/src/flash/mod.rs` が `flash_wait_for_bootloader` 範囲のみであること。`src-tauri/src/main.rs` は**無変更**（登録 `:35` は名前ベースで変更不要 — 確認済み）。

### Step 4 — TS: 状態機械・文言・フック（Step 3 依存）
1. **テスト先行**: `machine.test.ts` に §6「TS: reducer」T-1〜T-8（既存 happy path 等は `BOOTLOADER_R/L` → `VOLUME_DETECTED_*{origin}`＋`CONFIRM_WRITE_*` に書換え）。`ja.test.ts` に `"ConnectionLost"` kind＋`errorRecoveryButtonLabel` テスト。
2. `machine.ts`: §3.1 のとおり（新 state ×2・新 event ×4・`BOOTLOADER_R/L` 削除・`ENTER_RECOVERY{message?}`・`enterRecovery` の message 対応・`canCloseStep()` 抽出）。
3. `ja.ts`: `stepTitle` に `r_flash_confirm` / `l_flash_confirm`（§3.2 の文言）・`ConnectionLost` case・`errorRecoveryButtonLabel` 定数。
4. `useFirmwareUpdate.ts`: `waitBootloader` を §2 C-fix-2 手順に書換え（scan 廃止・`AcquiredVolume` 受け・volumeRef→dispatch の順序厳守・catch は `ENTER_RECOVERY{message}`）。effect switch（`:188-206`）に `r_flash_confirm` / `l_flash_confirm` を**明示 no-effect** case として追加（コメントで「確認はユーザー操作のみ。invoke 禁止」を明記）。
5. `useRecoveryActions.ts:64-67`: `adoptPresent: true` を明示・`acq.volume` 追随（挙動不変）。
- **受入基準**: `npm test` 全緑・`npm run build` 緑・`npm run lint` 緑。※この時点で UI は新 state の描画を持たない（`stepTitle` の Record はコンパイル強制で追加済み、body 描画は Step 5）。実行到達はしないため一時的に許容。

### Step 5 — UI（Step 4 依存）
**5a（純粋抽出・挙動不変コミット）**:
1. `WizardBody.tsx` 新設: `FirmwareUpdateModal.tsx:204-435` の body switch を presentational component として移動（props: `state, progress, fw: {version, supported}, dispatch, cancel, onClose, start, recovery`）。modal は hooks・`canCloseStep`・Escape 抑止（`:190-200`）・dialog shell（`:438`）を保持し WizardBody を描画。
2. stories の複製 `Screen`（`:169 付近-443`、canClose 複製 `:188-197 付近`、body switch 複製）を WizardBody 参照に置換（dummy props 注入は現行と同じ思想）。
- 受入基準: `npm test`/`build`/`lint` 緑・storybook が従前と同一表示（目視）。**diff は移動のみで文言・構造変更を含まない**こと。
**5b（挙動変更コミット・テスト先行）**:
1. **テスト先行**: `WizardBody.test.tsx`（新規）に §6「TS: component」C-1〜C-6、`RecoveryPanel.test.tsx`（新規）に C-7。
2. WizardBody: `r_flash_confirm`/`l_flash_confirm` 画面（§3.2 文言・[中止][このまま進める]）／done の B-fix-1／show_release の B-fix-2／error ボタンを `errorRecoveryButtonLabel` に／guide 文言 `:316` を「確認画面に進みます」へ。
3. `RecoveryPanel.tsx:178-180`: A-fix-2 文言。
4. stories: `FlashConfirmRNew` / `FlashConfirmRExisting` / `FlashConfirmL*` / `DoneDisconnected`（`fwVersion: null`）の pair 追加。
- **受入基準**: `npm test`/`build`/`lint` 全緑。

### Step 6 — CI＋総合検証（全 Step 依存）
1. `.github/workflows/release.yml`:
   - `test` job（`:15-28`）に追加: `dtolnay/rust-toolchain@stable`＋`swatinem/rust-cache@v2`＋`cargo test --manifest-path crates/mk-flash-core/Cargo.toml`＋`cargo test --manifest-path crates/mk-flash-cli/Cargo.toml`（ubuntu で完結。GUI 依存なし）。
   - `build-tauri` job（`:30-64`）の `npm ci` 後に追加: `npm run build` → `cargo test --manifest-path src-tauri/Cargo.toml`（**clamp テストが両 OS の release 経路の必須ゲートになる**。Windows 側では `classify_errno` の windows 分岐もこの時点で初めて CI コンパイル・テストされる）。
   - 要確認（実装時）: ubuntu で core の `download` モジュール（reqwest/TLS）がビルド可能なこと。不可なら core テストも build-tauri 側へ移す（判断根拠を PR に記録）。
2. ローカル総合: §6 の全コマンド緑。
3. Windows 実機 E2E: §6 の E1〜E9（可能なら E10/E11）。
- **受入基準**: CI 緑（tag push の dry-run は不可のため、PR 上は `workflow_dispatch` 追加はせず、YAML lint＋ローカル同等コマンドで代替確認）＋実機 E2E 記録（各ケースの結果・ドライブレター・スクリーンショット）を `docs/firmware-update-feature/19-e2e-results.md` に保存。

---

## 6. テストコマンドとテストケース（M-3／§テスト方針の統合）

### 正しいテストコマンド（このリポは cargo workspace **ではない** — root に Cargo.toml が無いことを確認済み）

```bash
# Rust（3 manifest。root での cargo test -p は不成立）
cargo test --manifest-path crates/mk-flash-core/Cargo.toml
cargo test --manifest-path crates/mk-flash-cli/Cargo.toml     # テスト無しなら cargo build で代替可
npm run build                                                  # dist/ 生成（次行の generate_context! が要求）
cargo test --manifest-path src-tauri/Cargo.toml

# TypeScript / UI
npm test          # vitest run
npm run build     # tsc && vite build
npm run lint
```

### Rust: `volume.rs` に追加・改修するケース

| # | ケース | 期待 |
|---|---|---|
| V-1 | `adopt=true` × 一致 1 個 present（baseline に含まれていても） | `Ok(origin=Existing)`（既存 `:217-234` の更新版） |
| V-2 | `adopt=false` × 一致 1 個 present・新規なし | present を採用せず待機 → timeout で `NoBootloaderVolume` |
| V-3 | `adopt=false` × 一致 1 個 present → 別 path に新規一致が出現 | 新規の方を `Ok(origin=New)` で返す（present は無視） |
| V-4 | `adopt=true` × 一致 2 個 present | `MultipleBootloaderVolumes`（既存挙動の署名追随） |
| V-5 | `adopt∈{true,false}` × foreign のみ present → 後から一致出現 | foreign 不採用・一致を `Ok(origin=New)`（`:236-261` の更新＋false 版を追加） |
| V-6 | `wait_for_new_volume(prefix=Some)` × 新規に foreign が出現 → 後から一致出現 | foreign を掴まず一致を返す（**C-fix-3 の新規テスト**。待機継続の証明） |
| V-7 | **Windows 同一レター（M-5）**: `adopt=true, baseline=[]`, snapshots `[[]] → [["E:\\"(一致)]]` | `Ok("E:\\", origin=New)` — 顧客経路（baseline 不使用）で再出現が普通に検出されることを固定 |
| V-8 | **同一レター×foreign 先行（M-5）**: snapshots `[[foreign "E:\\"]] → [[foreign "E:\\", 一致 "F:\\"]]` | foreign 不採用・`Ok("F:\\")` |
| V-9 | 「scan 時 unreadable → 直後 readable」相当: `adopt=true, baseline=[]`, snapshots `[[], [一致]]` | `Ok(origin=New)` — **確認画面を迂回しない**のは reducer 側 T-2/T-4 が保証（unit はここまで） |
| 既存 | `:146-160 / :162-181 / :183-200 / :202-215` | prefix 引数（`None` or `Some`）を追加して**全維持** |

### Rust: `machine.rs` に追加するケース（A-fix-1）

| # | ケース（MockEnv: info 列＋present 列＋sleep カウンタ） | 期待 |
|---|---|---|
| M-1 | info: `None, None, Some(一致)` | `Ok`（一過性回復。sleep 2 回） |
| M-2 | info: 全 `None`（4 回）・最終 present=false | `ConnectionLost`（リトライ途中抜線含む） |
| M-3 | info: 全 `None`・最終 present=true | `Io`（`NotUf2Volume` でない） |
| M-4 | info: `Some("Board-ID 行なし")` | `NotUf2Volume`（即時・sleep 0 回） |
| M-5 | info: `Some(prefix 不一致)` | `NotUf2Volume`（既存 `:570-578` 維持で担保） |
| M-6 | リトライ回数・sleep 回数の上限（retries=3 → 読取 4 回・sleep 3 回で必ず終了） | カウンタで検証（有限性） |

### Rust: Tauri 境界（`src-tauri`）

- `adopt_present` が command から core へそのまま伝播すること（コンパイル＋E1 実機で疎通確認。Tauri の引数名対応は実行時解決のため実機確認を必須とする）。
- 通常・recovery・確認経路の 3 経路とも `flash_write_uf2` に到達し `build_limits → validate_uf2 → flash_uf2` の順が不変であること（コードレビューで確認 — この経路は今回無変更）。
- **F-1〜F-3 テスト（`mod.rs:242-309`、特に `widen_clamp_blocks_bootloader_region_write` `:288-309`）が無改変で緑・かつ CI の必須ゲートに入ること。**

### TS: reducer（`machine.test.ts`）

| # | ケース | 期待 |
|---|---|---|
| T-1 | guide → `VOLUME_DETECTED_R{origin:"existing"}` | `r_flash_confirm`（origin 保持・manifest 保持）。L も対称 |
| T-2 | `r_flash_confirm` → `CONFIRM_WRITE_R` | `r_flashing`。L も対称 |
| T-3 | `r_flash_confirm` で他 event（`FLASH_R_OK`・`VOLUME_DETECTED_R` 再送 等） | no-op |
| T-4 | **guide から flashing への直行が存在しない**: guide に `CONFIRM_WRITE_R` を投げても no-op（`BOOTLOADER_R` は型ごと削除済み） | 確認ゲートの構造保証 |
| T-5 | `r_flash_confirm` + `RESET` → idle／+ `ENTER_RECOVERY` → recovery（from=null） | 契約表どおり |
| T-6 | `ENTER_RECOVERY{message:"…"}` → recovery.message に反映／message なしは undefined | 新 event 形 |
| T-7 | happy path 全経路（R 確認→L 確認→done）を新 event で再構成 | done 到達 |
| T-8 | `recovery_flashing` で `RECOVERY_FLASH_ERR` → `recovery`（from 温存） | 既存は waiting 由来のみ（`:149-158 付近`）のため flashing 由来を追加 |

### TS: component（`WizardBody.test.tsx` / `RecoveryPanel.test.tsx`・Testing Library）

| # | ケース | 期待 |
|---|---|---|
| C-1 | done × `fw.version=null` | `manifest.version` を含む「…を書き込みました」が DOM に出る（B-fix-1／m-3） |
| C-2 | show_release × `fw.version=null` | 「確認できません（更新には支障ありません）」＋「最新版を書き込めます」＋更新ボタン活性（B-fix-2／m-1） |
| C-3 | show_release × `fw.version="1.5.0"`=latest × supported | 「お使いのファームウェアは最新です」 |
| C-4 | `r_flash_confirm` origin=existing / new（R・L 両側） | それぞれの文言＋[このまま進める] 押下で `CONFIRM_WRITE_*` が dispatch される |
| C-5 | error 画面 | ボタンが `errorRecoveryButtonLabel`（=「対処方法を見る」）であり `stepTitle.recovery` と不一致（ja.test.ts でも定数レベルで assert） |
| C-6 | `canCloseStep`: 新 2 state が false・既存 8 state が true（unit） | 3.1 の契約 |
| C-7 | RecoveryPanel recovery_waiting | 「ケーブルがつながっているか確認」がリセット案内より先に出る（A-fix-2） |

### Windows 実機 E2E（修正後ビルド・結果は 19 に記録）

| # | シナリオ | 期待 |
|---|---|---|
| E1 | 正常系フル（R→L→checklist→done） | guide で待機→リセット 2 回→**確認画面（新規文言）**→「このまま進める」で初めて書込。done に「バージョン v◯ を書き込みました」が**BLE 切断のまま**表示 |
| E2 | r_flashing 進捗 0% 帯（preflight 窓）で抜線 | 「接続が切れたようです」（ConnectionLost。NotUf2Volume でない）→挿し直し→recovery ②R→完走 |
| E3 | bootloader 残留のまま更新開始（問題 C 再現）。**R 残留と L 残留の両方**で実施 | 自動書込されず**確認画面（existing 文言）**。L 残留×R 工程では文言の「反対側なら差し替え」に従い差し替えで正しく継続できること。書込 asset・写真・文言の side 一致を確認 |
| E4 | recovery ②の完走（A 症状 2 再現） | 抜線→ConnectionLost→［対処方法を見る］→②R→完走（error/recovery の画面取り違えが改名で解消していることも確認） |
| E5 | 書込後半（75% 以降）で抜線（偽成功の既知制約） | swap_to_l に進み得ることを記録→checklist で人間検出→recovery で復旧できること |
| E6 | 更新前 BLE 接続で show_release | 版が数字表示（B-1 回帰）。未接続では「確認できません（更新には支障ありません）」 |
| E7 | **同一ドライブレター（M-5）**: guide 進入前に抜き差しして同じレターに再マウント | 確認画面が出て進められる（タイムアウトに詰まらない）。実レターをログへ記録 |
| E8 | 確認画面表示中に抜線→「このまま進める」 | ConnectionLost → error → recovery（契約表どおり） |
| E9 | 確認待ち中に 2 台目接続→進める／guide 進入時から 2 台 | 前者=取得済み側に正常書込。後者=「片方だけ接続」文言が recovery に表示 |
| E10 | foreign UF2（RPI-RP2 等が用意できれば）併用 | 無視して待機継続（C-fix-3） |
| E11 | 一過性 INFO 未準備（再現困難なら省略可） | 誤 ConnectionLost/NotUf2Volume にならない（unit M-1 で主担保） |

---

## 7. 波及チェックリスト（実装時に 1 件ずつ☑。行番号は 2026-07-12 検証時点）

### `acquire_bootloader` 署名変更（`adopt_present` 追加＋戻り値 `AcquiredVolume`）
- [ ] `crates/mk-flash-core/src/volume.rs:64` — 定義本体
- [ ] `crates/mk-flash-core/src/volume.rs:224` — test `acquire_adopts_already_present_matching_volume`（adopt=true・`origin==Existing`・`.volume.path`）
- [ ] `crates/mk-flash-core/src/volume.rs:251` — test `acquire_ignores_foreign_board_and_waits`（**Codex 指摘の漏れ**。adopt を明示し true/false 両版に展開・`.volume.path`）
- [ ] `src-tauri/src/flash/mod.rs:106-113` — Tauri command からの伝播＋戻り型
- [ ] `crates/mk-flash-cli/src/main.rs:125` — `cmd_write`（true・`.volume.path`）
- [ ] `crates/mk-flash-cli/src/main.rs:189` — `guided_flash`（true・`.volume.path`）
- [ ] `crates/mk-flash-core/src/lib.rs:31` — `AcquiredVolume` / `VolumeOrigin` re-export 追加

### `wait_for_new_volume` prefix 引数追加
- [ ] `crates/mk-flash-core/src/volume.rs:94` — `acquire_bootloader` 内部呼出
- [ ] `crates/mk-flash-core/src/volume.rs:151` — test `detects_single_new_volume`
- [ ] `crates/mk-flash-core/src/volume.rs:170` — test `rejects_two_new_volumes`
- [ ] `crates/mk-flash-core/src/volume.rs:191` — test `ignores_baseline_volume`
- [ ] `crates/mk-flash-core/src/volume.rs:207` — test `times_out_when_nothing_appears`
- [ ] `crates/mk-flash-core/src/lib.rs:31` — re-export（名前不変・シグネチャのみ）

### `flash_wait_for_bootloader`（TS 側）
- [ ] `src/firmware-update/useFirmwareUpdate.ts:144-159` — `waitBootloader` 再実装（scan 廃止・`adoptPresent:true`・`AcquiredVolume`・volumeRef→dispatch 順序）
- [ ] `src/firmware-update/useRecoveryActions.ts:64-67` — `adoptPresent:true` 明示・`.volume`
- [ ] `src-tauri/src/main.rs:35` — command 登録は**変更不要**（名前不変。確認済み）

### `BOOTLOADER_R/L` 廃止 → `VOLUME_DETECTED_R/L`＋`CONFIRM_WRITE_R/L`
- [ ] `src/firmware-update/machine.ts` — event union（旧 `:82`/`:87`）・reducer（旧 `:185-187`/`:202-204`）
- [ ] `src/firmware-update/useFirmwareUpdate.ts:193 / :199` — effect switch の dispatch
- [ ] `src/firmware-update/machine.test.ts` — `BOOTLOADER_*` 全使用箇所（happy path `:21-29` ほか。コンパイルエラーで全件洗い出し）

### 新 state 追加の網羅（M-4。コンパイル or 単一ソースで強制）
- [ ] `ja.ts:4-24` — `stepTitle` Record（キー不足はコンパイルエラー）
- [ ] `WizardBody.tsx` — body switch（5a の抽出により modal/stories の 2 重複製が 1 本化済みであること）
- [ ] `machine.ts` — `canCloseStep()`（modal `:174-182` と stories の複製を置換済みであること）
- [ ] `machine.ts:113-126` — `redrivableOrigin`: 新 state は default（null）に落ちること（**変更しない**ことの確認）
- [ ] `FirmwareUpdateModal.tsx:190-200` — Escape 抑止は `canCloseStep` 連動で自動（個別変更不要の確認)
- [ ] `FirmwareUpdateModal.stories.tsx` — 新 state の story pair 追加

### `ConnectionLost` 追加
- [ ] `crates/mk-flash-core/src/error.rs`（enum `:10-65`）— variant
- [ ] `crates/mk-flash-core/src/machine.rs` — `preflight_board_id`＋`Timings`＋テスト
- [ ] `src/firmware-update/ja.ts:38-69` — `formatError` case
- [ ] `src/firmware-update/ja.test.ts:9-23` — `FLASH_ERROR_KINDS` に追加

### error 画面ボタン改名（A-3）
- [ ] `src/firmware-update/ja.ts` — `errorRecoveryButtonLabel` 新設
- [ ] `WizardBody.tsx`（旧 modal `:413-415`）— 定数参照
- [ ] stories（旧複製 `:396`）— 5a で WizardBody 参照化により自動解消の確認
- [ ] `ja.test.ts` — recovery タイトルと不一致 assert

### CI
- [ ] `.github/workflows/release.yml:15-28` — test job に core/CLI cargo test
- [ ] `.github/workflows/release.yml:30-64` — build-tauri に `npm run build`→src-tauri cargo test（tauri-action の前）

---

## 8. 差分ゼロ保証（ブリック防止ゲート）とレビュー条件

- **差分ゼロ対象**（レビュー時に `git diff` で機械的確認）:
  - `src-tauri/src/flash/mod.rs:133-160` `build_limits`（F-1 SHA 必須・F-2 fail-closed・F-3 clamp-only）
  - `src-tauri/src/flash/mod.rs:162-208` `flash_write_uf2`（`build_limits → validate_uf2 → flash_uf2` の順）
  - `src-tauri/src/flash/mod.rs:215-310` F-1〜F-3 テスト（`widen_clamp_blocks_bootloader_region_write` `:288-309` 含む）
  - `crates/mk-flash-core/src/machine.rs` の書込ループ・completion 判定・errno 分類（§5 Step 2 受入基準に列挙）
- 同ファイル内で変更してよいのは `flash_wait_for_bootloader`（mod.rs）と `preflight_board_id`／`Timings`／tests（machine.rs）のみ。
- CI に Rust テストが入ることで、clamp テストが**出荷の必須ゲート**になる（M-3 解消。従来は npm 系のみで Rust unit が未実行だった）。
- アドレス窓の破壊的実機試験は行わない（clamp の unit test を出荷ゲートとする — Codex 同意済み）。

---

## 9. publish 線引き

**publish ブロッカー（今回全部やる）**:
1. **C-fix-2 再設計一式**（§3 状態機械＋hook＋UI）＋ **C-fix-1**（adopt_present 明示）＋ **C-fix-3**（prefix filter）— 「操作ゼロで書き込み」の根絶と「詰まり」への置換防止は 1 セット。
2. **A-fix-1**（ConnectionLost 再分類・リトライ契約）＋ ja 文言 — 最頻異常（抜線）への正しい案内。
3. **B-fix-1**（done で manifest.version 常時表示）— 更新成功の伝達。
4. **A-fix-2＋A-3 改名＋B-fix-2** — 各 1〜数行級。同梱。
5. **テストコマンド是正＋CI Rust テストゲート**（M-3）— 安全ゲートが出荷ゲートに入っていない状態を先に解消。
6. **Windows 実機 E2E E1〜E9 通過**（E10/E11 は可能なら）。

**次版（今回やらない・記録）**: B-fix-3（BLE 自動再接続＋ライブ版照合）／A-fix-3（失敗側 side 事前選択）／偽成功ハードニング（更新後 fwinfo 照合。窓=最後 25%×抜線、checklist＋recovery ②で復旧可・ブリック経路なし）／stabilize 窓縮小／CLI の adopt 厳格化判断／preflight の `Io`→`PermissionDenied` 細分（FlashEnv API 変更要）／recovery ②にも確認ゲートを足す対称化（現状はボタン押下＝人間の意図表明とみなす）／`flash_scan_volumes` コマンドの要否整理／CLI の `BOARD_ID_PREFIX` 独自定数（`main.rs:20`）を core 定数へ寄せる単一ソース化（**今回発見・別問題として報告**。今回は触らない）。

---

## 10. 統括官の独立検証結果（3 診断・16・17 の主張照合）

1. **17（Codex）の主要主張は全件実コードと一致**: workspace 無し／`fsops.rs` の presence=read 同一ファイル依存（実際は `:78-83`・`:85-87`。Codex 表記 `:78-86` とほぼ一致）／Windows scan の read できた瞬間だけ候補化（`:173-188`）／`volumeRef.current` の即時使用（`useFirmwareUpdate.ts:171`）／stories の body 複製（`Screen`、error ボタン複製 `:396`）／`wait_for_new_volume` テスト呼出 4 件（:151/:170/:191/:207）／`volume.rs:251` foreign test／`main.rs:35` 変更不要／ブリック防止ゲートの所在訂正（`src-tauri/src/flash/mod.rs`）。**誤りは検出されなかった**（行番号の ±数行のずれのみ。本書は再測定値で記載）。
2. **16 の主張も全件一致**（§9 の検証記録どおり）。ただし 16 §5「A-3 本命=旧ビルド説」は**実機実測で棄却済み**（v0.4.0 で発生・error 画面取り違えで確定）— 本書 §2 A-3 が最終見解。16 の「通常フロー=adopt:false」は Codex C-1 採用に伴い**本書で上書き**（§0 の設計変更を参照）。
3. **軽微な行番号補正**: MockEnv は `machine.rs:381-435`（16 表記 :375-460）／F-1〜F-3 テスト mod は `mod.rs:215-310`（17 表記 :243-309）／widen clamp test は `:288-309`（16 表記 :289-309）。内容の相違なし。
4. **新規発見（今回のスコープ外・報告のみ）**: CLI が core の `MINIMAL_KEYS_BOARD_ID_PREFIX` を使わず独自定数 `BOARD_ID_PREFIX`（`crates/mk-flash-cli/src/main.rs:20`）を持つ。単一ソース契約（machine.rs:69-75 の docstring）からの既存ドリフト。次版で 1 行修正を提案（§9 次版リスト）。
5. **要確認として残る点（捏造回避のため明示）**: (a) `cargo test --manifest-path src-tauri/Cargo.toml` が `dist/` 不在時に `generate_context!` で失敗するかは未実測（`dist/` は現存・CI 手順は build 先行で安全側に設計）。(b) ubuntu CI での core（reqwest/TLS）ビルド可否は Step 6 実装時に確認し、不可なら build-tauri 側へ移す。(c) Tauri の `adoptPresent`→`adopt_present` 引数マッピングは既存 `timeoutSecs` の実績から高確度だが、E1 実機疎通を必須確認とする。

---

## 11. まさかず向けサマリー

**今回の直し方（Codex のレビューを全部反映した最終形）**

- **勝手に書き込みが始まる件（C）**: 直し方を一段強くしました。「前からあったものは掴まない」だけだと、Windows のドライブ名の癖で今度は**先に進めなくなる**ことが分かったためです。最終形は「**書き込む直前に、必ず 1 回『このまま進める』ボタンを押してもらう**」方式です。リセット 2 回押しで検出されたときも、すでに書き込みモードだったときも、**ボタンを押すまで絶対に書き込みません**。1 クリック増えますが、どんなタイミングの抜き差しでも「勝手に始まる」ことが仕組み上できなくなります。
- **「minimal-keys ではない」と出る件（A）**: ケーブルが抜けたときは「接続が切れたようです。挿し直してください」と正しく出します。読み取りに一瞬失敗しただけのときは 4 回まで読み直してから判断するので、誤表示も減ります。
- **バージョン不明の件（B）**: 更新完了画面に、接続が切れていても「バージョン v1.0.0 **を書き込みました**」と必ず出します。更新前画面の「不明」も「確認できません（更新には支障ありません）」に変えます。
- **②ボタンが見えなかった件（A-3）**: 実機確認で「エラー画面と対処画面の見間違い」と確定しました。プログラムは正常です。紛らわしかったボタン名を「**対処方法を見る**」に変えて、同じ見間違いが起きないようにします。
- **壊れない保証はそのまま**: 書き込み範囲を制限する安全装置（ブリック防止）には**一切手を触れず**、変更ゼロをレビュー条件にしました。さらに、この安全装置のテストがリリース時に必ず実行されるよう、CI にも組み込みます（今まで実は実行されていませんでした）。
- **このあと**: Codex がこの指示書どおりに 6 ステップで実装 → 各ステップでテスト全緑を確認 → 最後に Windows 実機で 9 シナリオを通してから publish 判断です。
