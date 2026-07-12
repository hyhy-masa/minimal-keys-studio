# 16 — 実機異常系3問題の修正計画（最終確定版）

- 日付: 2026-07-12 ／ 統括: Fable 5（最終統括官）
- 対象: `feature/fw-update-integration`（v0.4.0 タグ = `e79068e`、2026-07-12 打刻）
- 入力: 3診断レポート（A/B/C）＋ Windows 実機実測（A-1/A-2/A-3/B-1/B-2）
- 性質: **計画のみ**。本ドキュメント以外のファイルは一切変更していない。
- 検証方針: 3診断の主要主張（file:line）は全て実コードで独立再検証した。検証結果は各所に「✅検証済」と付す。診断と食い違った点・補正した点は §9 に集約。

---

## 1. 横断整合サマリ — 3問題はどうつながっているか

```
[ケーブル抜去 (問題Aの引き金)]
   ├─ 抜いた瞬間が preflight 窓 → read_info_uf2=None → NotUf2Volume 誤分類  … A症状1 ✅検証済
   │     (machine.rs:268 None枝 / stabilize 2秒が machine.rs:168-169 で窓を広げる)
   ├─ R半分は bootloader に残留（A-1 実測で確定）
   │     └─ 次回ウィザードで acquire_bootloader が baseline を無視して残留を即採用
   │           → リセット2回押しなしで書き込み開始  … 問題C ✅検証済 (volume.rs:85-86)
   └─ 更新後は BLE 切断中 → fwinfo がライブで読めず「不明」表示  … 問題B ✅検証済
         (App.tsx の conn=null → subsystems=[] → version=null → "不明")
```

**共通根（実コードで確認）**: `crates/mk-flash-core/src/volume.rs:64-95` の `acquire_bootloader` は、Board-ID 一致ボリュームが 1 個マウント済みなら **baseline の中身を一切見ずに** 即採用して return する（`volume.rs:85-86`）。baseline は present=0 のときの `wait_for_new_volume`（`volume.rs:94` → `:37`）でしか参照されない。設計ドキュメント（`08:318` 付近・`09:450` 付近 ✅検証済）は「recovery だけが baseline=[] で採用する」契約のつもりで書かれており、**実装が設計と乖離**している。これが問題Cの構造的原因であり、問題Aが作る「bootloader 残留」を静かに拾う受け皿になっている。

- 問題A症状1: `machine.rs:253-270` `preflight_board_id` の `None => Err(not_uf2())`（`:268`）が「切断・消失」を「別デバイス」に誤分類。`NotUf2Volume` の生成箇所はリポ全体でここ 1 箇所のみ（grep で✅検証済: `machine.rs:254` のみ。他は error 定義とテスト）。A-2 実測（抜いた直後に自動表示）と整合: `r_flashing` 進入 → `flash()` → stabilize 2秒（この間 UI は「右側に書き込み中…」`FirmwareUpdateModal.tsx:325-341`・進捗0%）→ preflight で検出、の窓で抜かれた。
- 問題B: 「不明」の一義的原因は **更新直後の BLE 切断**（B-1/B-2 実測で FW 実装済み確定）。done 画面 `FirmwareUpdateModal.tsx:387` は `{fw.version && ...}` のため更新直後は構造的にほぼ必ず版が出ない。done 状態は `manifest` を保持している（`machine.ts:59` ✅検証済）ので接続なしで版を出せる。
- 問題C: 上記共通根そのもの。`useFirmwareUpdate.ts:144-159` の `waitBootloader` は残留ボリューム込みの baseline を渡すが、`volume.rs:85-86` が baseline を無視して即採用 → `BOOTLOADER_R` → `r_flashing`。**レースではなく決定的に発火**（✅検証済）。

---

## 2. 問題別 修正箇所の最終確定

### 2-A. 問題A — NotUf2Volume 誤分類＋復帰不全

**A-fix-1（必須）: preflight の None 枝を接続喪失として分類し直す**
- 場所: `crates/mk-flash-core/src/machine.rs:253-270`（`preflight_board_id`）
- 現状: `env.read_info_uf2(volume)` が `None` → 無条件に `NotUf2Volume`（`:268`）。
- 修正:
  1. `None` 枝で `env.volume_present(volume)` を確認（`FlashEnv` に既存。実装は INFO_UF2.TXT の存在判定 `fsops.rs` ✅検証済 — 抜線検知として適切）。
  2. **present=false → 新設エラー `ConnectionLost`** を返す（`error.rs:10-65` に variant 追加。serde tag 付き enum なので `ja.ts:38-68` の `formatError` に case 追加、`ja.test.ts` 更新）。文言案: 「キーボードとの接続が切れたようです。ケーブルを挿し直して、もう一度お試しください。」
  3. present=true だが読めない → **有限リトライ（3回 × 250ms、`env.sleep` 使用）** 後もダメなら現行どおり `NotUf2Volume`（macOS FSKit 未準備の一過性対策）。
  4. `NotUf2Volume`（「minimal-keys ではない」）は **Board-ID が読めて不一致（`machine.rs:265`）に限定**される状態になる。
- 却下した代替案: 診断Aの「stabilize（`machine.rs:168-169`, 既定2秒 ✅検証済）を preflight の後ろへ回して窓を縮める」は**採らない**。マウント直後の preflight は FSKit 未準備で偽 NotUf2Volume を増やすリスクがあり、上記の再分類＋リトライで「窓に当たったときの表示が正しくなる」ため十分。窓縮小は次版の任意改善。

**A-fix-2（必須・小）: recovery_waiting にケーブル再接続の案内を足す**
- 場所: `src/firmware-update/RecoveryPanel.tsx:175-189`（`recovery_waiting`）
- 現状: 「リセットボタンを2回押してください」のみ（✅検証済）。抜線起因の復帰では接続再確立が先。
- 修正: 「①ケーブルがつながっているか確認 → ②リセットボタンを素早く2回」の順序を1行追加。なお A-1 実測（挿し直すだけで bootloader が再マウント）より、挿し直し後は recovery ②の adopt（baseline=[]）が**リセット不要で**成立する見込み。

**A-fix-3（推奨・次版可）: 失敗側の side 事前選択と②への視線誘導**
- 場所: `machine.ts`（ENTER_RECOVERY に side ヒント）＋ `RecoveryPanel.tsx:83`（`useState<Side>("R")` の初期値上書き）。
- 今回の実測は R 失敗＝既定 R と偶然一致するため実害が薄い。L 失敗時の取り違え防止として次版で実施。

**症状2「最初からやり直すに戻される」の判定（✅検証済）**: 状態機械は自動 RESET しない（`machine.ts:225-226, 231-232` — 失敗は常に recovery へ戻る）。「戻される」は from=null で①が出ず（`RecoveryPanel.tsx:111`）、出口が「最初からやり直す」に見える体感問題＋（後述 A-3 の可能性として）旧ビルド。C-fix と A-fix-2 で復帰経路が機能すれば解消する。

### 2-B. 問題B — 更新後バージョン不明

B-1/B-2 実測で確定した事実: FW v1.0.0 は `zmk__fwinfo` 実装済み・版注入済み。「不明」は**更新直後の BLE 切断中だけの一時表示**。よって診断Bの (ii) 自動再接続は不要になり、**(i) 表示修正のみで確定**。

**B-fix-1（必須）: done 画面は manifest.version を常時表示する**
- 場所: `src/firmware-update/FirmwareUpdateModal.tsx:387`
- 現状: `{fw.version && <p>バージョン {fw.version}</p>}` — 更新直後は `conn=null`（`App.tsx:176-184` の通知ストリーム終了 → `setConn({conn:null})`、F-6 コメント ✅検証済）→ `CustomSubsystemsProvider.tsx:14-21` が `subsystems=[]` → `useFirmwareVersion.ts:70-78` が `version=null` → 行ごと非表示。
- 修正: `state.manifest.version`（done 状態が保持。`machine.ts:59` ✅検証済）を使い「バージョン v1.0.0 を書き込みました」を**接続の有無に関わらず常時表示**。ライブ読取 `fw.version` への依存を外す。
- 回帰面: `machine.test.ts` は遷移のみで非依存。stories（`FirmwareUpdateModal.stories.tsx`）に done×未接続を追加。

**B-fix-2（推奨・小）: show_release の「お使いのバージョン: 不明」の文言**
- 場所: `FirmwareUpdateModal.tsx:202`（`fw.version ?? "不明"`）と `:246-251`
- 修正: 読めないときは「確認できません（更新には支障ありません）」等、失敗と誤読されない表現へ。`isUpdateAvailable(currentVersion === "不明" ? "" : ...)`（`:231`）のロジックは触らない。

**B-fix-3（次版）: done 到達時の BLE 自動再接続**（診断B (ii)）。リブート直後の再接続は時間がかかり失敗もあり得るため、スピナー＋フォールバック設計が必要。B-fix-1 で顧客価値は満たされるので次版。

### 2-C. 問題C — リセット2回押しなしで書き込み開始

**C-fix-1（必須・コア）: adopt を明示オプトインにする — 方針A採用**
- 場所: `crates/mk-flash-core/src/volume.rs:64-95`、`src-tauri/src/flash/mod.rs:95-117`、`src/firmware-update/useFirmwareUpdate.ts:148-151`、`src/firmware-update/useRecoveryActions.ts:64-67`、`crates/mk-flash-cli/src/main.rs:125, 189`
- 修正:
  - `acquire_bootloader` に `adopt_present: bool` を追加。`true` のときだけ `volume.rs:80-93` の「既存採用」分岐を実行、`false` は即 `wait_for_new_volume` へ。
  - Tauri コマンド `flash_wait_for_bootloader` に `adopt_present` パラメータを追加して伝播。
  - 通常フロー（`useFirmwareUpdate.ts`）= `adoptPresent: false`。recovery（`useRecoveryActions.ts`）= `adoptPresent: true`（baseline=[] は現状維持）。
  - CLI = `true`（現挙動維持）。CLI は開発者ツールで顧客経路ではないため挙動を変えない。厳格化の要否は別途判断（記録のみ）。
- **方針B（`baseline.is_empty()` ガード）を選ばない理由**: 最小差分だが「採用条件が baseline 空に暗黙結合」する。将来、通常文脈で空 baseline を渡すコードが入ると**同じバグが無言で再発**する。方針Aは呼び出し側の意図がシグネチャに現れ、テストも「adopt=false で採用しない」と直接書ける。設計ドキュメント（08/09）の「recovery だけ採用」という契約も、フラグ名で明文化される。安全機構の分岐は暗黙でなく明示にする。

**C-fix-2（必須・UX）: 「すでに書き込みモード」検出時の確認ボタン**
- 場所: `src/firmware-update/machine.ts`（新状態＋新イベント）、`useFirmwareUpdate.ts:144-159`、`FirmwareUpdateModal.tsx:307-323`
- 理由: C-fix-1 の厳格化だけだと、bootloader 残留した半分（A-1 で実在確認済み）の顧客は新規マウントが発生せず **60秒タイムアウト→ENTER_RECOVERY に詰まる**。特に **Windows ではドライブレターが再利用される**ため、挿し直しても同一パス（例 `E:\`）で再マウント＝baseline フィルタに食われて検出されない可能性が高い（§9 補正3）。「早すぎる書き込み」を「詰まり」にすり替えないための対。
- 修正:
  1. `r_bootloader_guide` / `l_bootloader_guide` 進入時に `flash_scan_volumes` を実行し、Board-ID 一致ボリューム（`VolumeEntry.board_id` は scan 結果に含まれる）が既にマウント済みなら、自動採用も無言待ちもせず**確認画面**を出す:「この半分はすでに書き込みモードになっています。準備ができたら『このまま進める』を押してください」。
  2. ボタン押下で `flash_wait_for_bootloader({baseline: [], adoptPresent: true})` → `BOOTLOADER_R/L` → 書き込み。
  3. 一致 2 個以上なら既存の `MultipleBootloaderVolumes` 文言（`ja.ts:44-45`）で「片方だけ接続」を案内。
  4. 状態機械: 側ごとに確認状態を 1 つ追加（例 `{ step: "r_bootloader_present"; manifest }` ＋ イベント `BOOTLOADER_PRESENT` / `CONFIRM_PRESENT`。命名は実装時に既存様式へ合わせる）。`machine.test.ts:31-125` の様式で遷移テスト追加。
- 効果: **「片側につき一度の意図的な人間の操作」という安全思想を復元**。リセット2回押し or 確認ボタン、必ずどちらかの人間操作を経る。

**C-fix-3（推奨・コア小）: `wait_for_new_volume` にも Board-ID フィルタ（対称化）**
- 場所: `crates/mk-flash-core/src/volume.rs:22-54`（filter `:37` に prefix 条件を追加）＋呼び出し `:94`
- 理由（✅検証済）: present 枝は Board-ID で絞る（`:72-84`）が新規待ちは絞らない非対称。異物 UF2 が「新規」に出ると採用→書き込み側 preflight が弾いてエラー終了し、本物のボードを待ち続けられない。フィルタすれば待機が継続する。低リスク・テスト容易。

---

## 3. 修正順序と依存関係

```
Step 1  Rust core: volume.rs (C-fix-1 adopt param + C-fix-3 filter) + volume.rs tests
Step 2  Rust core: machine.rs preflight 再分類 (A-fix-1) + error.rs ConnectionLost + machine.rs tests
        ── Step 1 と独立。同一クレートなので同 PR 可
Step 3  Tauri: mod.rs flash_wait_for_bootloader に adopt_present 追加（Step 1 に依存）
Step 4  TS: ja.ts (ConnectionLost 文言) / machine.ts (C-fix-2 状態) /
        useFirmwareUpdate.ts (adoptPresent:false + 進入時 scan) /
        useRecoveryActions.ts (adoptPresent:true) + machine.test.ts / ja.test.ts
        （Step 2, 3 に依存）
Step 5  UI: FirmwareUpdateModal (確認画面 + B-fix-1 done manifest.version + B-fix-2 文言) /
        RecoveryPanel (A-fix-2 案内) + stories
        （Step 4 に依存。B-fix-1/2 だけは独立に先行可能）
Step 6  cargo test → npm test → Windows 実機 E2E（§6 マトリクス）
```

依存の要点: **volume.rs の adopt 修正は A（recovery 復帰経路）と C（通常フロー）の両方に効く**ため最初に固める。recovery ②は adopt=true を明示することで挙動不変（既存テスト `acquire_adopts_already_present_matching_volume` `volume.rs:217-234` は adopt=true 版として温存）。B-fix-1 は他と依存ゼロなので、レビュー負荷分散のため独立コミットにしてよい。

---

## 4. リスク評価（性悪説）

### (a) 問題C起因の「反対側への誤書き込み」 — 実在するが狭い。修正で構造ガード復元

✅実コード検証結果:
- R/L は同一ラベル `XIAO-SENSE`・同一 Board-ID `Seeed_XIAO_nRF52840_Sense`（`volume.rs:1-6` ヘッダ、`machine.rs:69-75`）。**R/L を区別する唯一の構造ガードは baseline diff** であり、`volume.rs:85-86` の adopt はそれを丸ごとバイパスする（診断C 3.2 は正確）。
- 書き込み側 preflight（`machine.rs:253-270`）は prefix 一致のみ＝R/L 判別不能。SHA/familyID/アドレス窓も同一 MCU なので素通し。
- 成立条件: 「反対側 1 個だけが bootloader でマウントされている」状態で guide に進入。両側マウント済みなら `MultipleBootloaderVolumes`（`volume.rs:88-92`）で安全停止。
- **ブリックはしない**（✅検証済）: `mod.rs:133-160` の clamp-only 窓（`build_limits`、既定 `0x27000..=0xF4000`）は manifest がどうであれ bootloader 領域を書けない。テスト `widen_clamp_blocks_bootloader_region_write`（`mod.rs:289-309`）が担保。誤書き込みは「役割違いアプリが載る機能故障」で、再フラッシュで復旧可能。
- 深刻度: ブリック=なし ／ 機能故障=中（条件狭い・復旧可）／ UX・信頼毀損=高（「勝手に書き込みが始まる」は顧客製品として不合格）。
- **判定: C-fix-1＋C-fix-2 は publish ブロッカー**。修正後は「新規マウント（=リセット押下）or 明示確認ボタン」でしか書き込みに進まず、baseline diff ガードが復元される。残余リスクは「ユーザーが物理的に逆側をリセットする」だがソフトでは原理的に判別不能（Board-ID 同一）で、写真ガイド（`GuideDiagram`）が現行の妥当な防御。

### (b) 問題Aの「偽成功」（中断を ProvisionalSuccess と誤判定） — 実在するが狭く、多層で受け止められる。次版扱い

✅実コード検証結果:
- 経路: 書き込みループ中の抜線 → errno が RebootLike（Windows: 21/1/2/3/31/433 `machine.rs:130-138` — 抜線は NOT_READY/GEN_FAILURE/NO_SUCH_DEVICE になりやすい）→ `res.written >= threshold` なら `finish_completed`（`machine.rs:213-227`）→ `await_unmount` は抜線でも true（ボリューム消失）→ `ProvisionalSuccess`。
- 窓の広さ: `threshold = total - min(256KB, total/4)`（`machine.rs:145-150`）。典型 UF2（数百KB）では slack が total/4 にクランプされ **「最後の25%」で抜いた場合**に限られる。加えて OS の書き込みバッファで `written` が実到達より先行し得る（`write_attempt` は chunk write_all + 最後に flush。`fsops.rs:89-130` ✅検証済）。
- 実害の連鎖: R で偽成功 → swap_to_l「右半分の更新が終わりました」（虚偽表示）→ L 書き込み → **verify_checklist（`FirmwareUpdateModal.tsx:360-377`）で「右手で入力できない」が人間検出** → recovery → ②R 書き直し（adopt で残留 bootloader を掴む）→ 復旧。`FlashOutcome::ProvisionalSuccess` の名のとおり、最終判定はチェックリストに委ねる設計が既に効いている。
- 根本対策の限界: 「抜線 unmount」と「正常 reboot unmount」はコアの `FlashEnv`（FS 観測のみ）では原理的に判別不能。判別には USB 再列挙の観測（HID/シリアル出現）か更新後 fwinfo 照合が必要＝アーキテクチャ追加。
- **判定: publish ブロッカーではない**。理由: (1) 窓が狭い（最後の25%×抜線）、(2) 下流の人間チェックリスト＋recovery ②で必ず復旧可能、(3) ブリック経路なし。既知の制約として本ドキュメントに記録し、次版で「更新後 fwinfo による自動照合（B-fix-3 の再接続と同梱）」を検討する。threshold の slack を絞る案は正常フラッシュ（最終ブロック受領で即リブート）を偽失敗にする背反があり採らない。

### (c) 修正自体の背反チェック

- C-fix-1 で recovery ②が壊れないか → adopt=true を明示するので挙動不変。既存テストを adopt=true 版として維持して担保。
- C-fix-2 の確認画面が「正常な新規マウント」を邪魔しないか → 進入時 scan で present=0 なら現行どおり即待機。分岐追加のみ。
- A-fix-1 のリトライで真の異物検出が3×250ms遅れる → 許容（preflight は書き込み前の一度きり）。
- ConnectionLost 追加で serde タグ互換が壊れないか → FlashError は tagged enum としてフロントに渡る。`formatError` は未知 kind をフォールバック処理（`ja.ts:65-67`）するため後方互換。

---

## 5. A-3 の謎 — 「②片方だけ書き直す」が実機で表示されなかった

### コード側の確定事実（✅全て独立検証済）

- v0.4.0（`e79068e`）の `RecoveryPanel.tsx:118-139` で②は **`case "recovery"` 内の無条件レンダー**。条件付きは ①（`state.from &&`、`:111`）と message のみ。②を消せる分岐はコード上存在しない。
- モーダルは `max-h-[85vh] overflow-y-auto`（`FirmwareUpdateModal.tsx:438`、`GenericModal` は className をそのまま `<dialog>` に適用）でスクロール可能。recovery 画面のコンテンツは短く、通常は切れない。
- **決定的な発見**: RecoveryPanel 導入（`69ebeac`）**以前**のビルド（`30314b3` 時点）の recovery 画面は『うまくいかない場合は、一度ケーブルを抜き差しして最初からやり直してみてください。／解決しないときは、公式 LINE / Discord のサポートにご連絡ください。／[最初に戻る]』のみ — **②も③もない。まさかずの目撃談と完全一致する**。
- ビルド系列の事実: アプリ version はどちらも要注目 — `69ebeac` 時点の `tauri.conf.json` は **0.3.0**、`15c44d7` で 0.4.0 に bump。リリース CI（`release.yml`）は **tag push でのみ**ビルドし、v0.4.0 タグは 2026-07-12（今日）打刻。v0.3.0 タグ（`8a54181`, 07-05）は fw-update 機能より前で**ウィザード自体が入っていない**。つまり「ウィザードは動くが②がない」ビルドは、中間コミット（`30314b3`〜`b40da38` 帯）からの **ローカル/手動ビルド（フラグ env 上書き）でのみ**存在し得る。

### 仮説（優先順）

1. **【本命】Windows 実機の Studio が旧ビルド**（RecoveryPanel 導入前の中間ビルド、アプリ version 0.3.0 表示のはず）。目撃された画面構成（②なし・③なし・「最初に戻る」だけ）が旧実装と一致しすぎている。該当なら**コード修正は不要**で、v0.4.0 CI ビルドへの入れ替えが対処。
2. **【対抗】画面の取り違え**: error 画面（タイトル「エラーが発生しました」、ボタン「最初に戻る」＋「うまくいかないとき」）を recovery 画面と誤認した。紛らわしさの構造要因: error 画面の**ボタン名**「うまくいかないとき」と recovery 画面の**タイトル**「うまくいかないとき」が同一文字列（`ja.ts:20` / `FirmwareUpdateModal.tsx:413-415`）。ボタン押下が効いていなければ（WebView2 での onPress 不発は低確率だが零ではない）error 画面に留まり、②なし＋「最初に戻る」の目撃と一致する。
3. **【弱】表示切れ**: Windows の表示スケーリング（150%等）＋低い窓で②が折り返し以下になり、スクロールバー非表示（オーバーレイスクロール）で気づけなかった。ただし③まで見えていないなら説明できない。

### 追加実機確認（この順で。1つ目でほぼ確定する）

| # | 確認 | 判定 |
|---|------|------|
| 1 | Windows の Studio のバージョン表記（インストーラのファイル名 `_0.3.0_` か `_0.4.0_` か／アプリ内表記） | **0.3.0 → 仮説1確定**。v0.4.0 CI ビルドを入れ直して再試験。コード修正不要 |
| 2 | r_bootloader_guide に**製品写真（オレンジ丸のリセットボタン）**が出ていたか | 写真は `5d48146`（RecoveryPanel より後）で追加。写真なし → 仮説1確定の傍証 |
| 3 | ②が無かった画面の**タイトル**は「うまくいかないとき」か「エラーが発生しました」か。「③ログを保存」はあったか | タイトルが「エラー…」or ③なし → 仮説2（error 画面）。③あり②なしは現行コードではあり得ない → 仮説3を精査 |
| 4 | （v0.4.0 で再現するなら）recovery 画面でマウスホイールスクロール＋窓最大化して②の有無 | 出る → 仮説3。出ない → 前例のない不具合としてエスカレーション（スクリーンショット必須） |

**計画への織り込み**: 仮説2の構造要因（error 画面のボタン名と recovery タイトルの同名衝突）は独立した UX 地雷なので、**error 画面のボタン名を「対処方法を見る」等に変更**する小修正を Step 5 に含める（`ja.ts` or `FirmwareUpdateModal.tsx:413-415`、1行）。仮説1が確定した場合も、この改名は入れて損がない。

### C-1/C-2（未実測）の扱い

- C-1（残留マウントの有無）は **A-1 実測が代替裏付け済み**（再接続でマウント音＝bootloader 残留）。フラッシュ画面到達直前にエクスプローラで `XIAO-SENSE` ドライブの有無を見れば完全確定。
- C-2（通常状態での正常系）は修正後の回帰確認として §6 マトリクスに含める。

---

## 6. テスト方針

### Rust core（`cargo test -p mk-flash-core`）

- `volume.rs`:
  - 新規: `adopt_present=false` × baseline 内の既存単一ボリューム → 採用せず待機、出なければ `NoBootloaderVolume`（既存 `acquire_adopts_already_present_matching_volume` の逆期待版）。
  - 維持: `adopt_present=true` × 同条件 → 採用（既存テストを true 版として温存）。
  - 新規: `wait_for_new_volume` の Board-ID フィルタ — 異物 UF2 が新規に出ても掴まず、本物が出たら掴む（C-fix-3）。
  - 既存維持: 2個同時 → `MultipleBootloaderVolumes`（`volume.rs:162-181`）。
- `machine.rs`:
  - 新規: preflight `read_info_uf2=None` × `volume_present=false` → `ConnectionLost`（MockEnv は `machine.rs:375-460` の枠で `info=None` + `present` シーケンスで再現可 ✅確認済）。
  - 新規: `None` × `present=true` → リトライ3回後 `NotUf2Volume`（sleep 回数も検証）。
  - 既存維持: Board-ID 不一致 → `NotUf2Volume`（`machine.rs:570-578`）。

### TS（`npm test`）

- `machine.test.ts`: (1) `r_bootloader_guide` → `BOOTLOADER_PRESENT` → 確認状態 → `CONFIRM_PRESENT` → `r_flashing`（L 側も）。(2) `recovery_flashing` で `RECOVERY_FLASH_ERR` → `recovery`（idle でない）＋ from 温存 — 既存は waiting 由来のみ（`machine.test.ts:148-156`）なので flashing 由来を追加。
- `ja.test.ts`: `ConnectionLost` 文言、error 画面ボタン改名の追随。
- stories: done×未接続（`fw.version=null` でも manifest.version が出る）、bootloader_present 確認画面。

### 実機 E2E（Windows・v0.4.0 修正後ビルド）

| # | シナリオ | 期待 |
|---|---------|------|
| E1 | 正常系フル（C-2 兼用）: R→L→checklist | guide で待機し、リセット2回押しで初めて書き込み。done に「v◯.◯.◯ を書き込みました」が接続なしで表示 |
| E2 | r_flashing 表示中（進捗0%帯）に抜線 | 「接続が切れたようです」（NotUf2Volume でない）。挿し直し→recovery ②R→完走 |
| E3 | bootloader 残留のまま更新開始（今回の問題C再現） | 自動書き込みされず「すでに書き込みモード」確認画面 → ボタン押下で書き込み |
| E4 | recovery ②の完走（A 症状2再現） | 抜線→エラー→うまくいかないとき→②R→書き直し完了 |
| E5 | 書き込み後半（75%以降）で抜線（偽成功の窓） | 現版では swap_to_l に進み得ることを記録（既知の制約）。checklist で検出→recovery で復旧できることを確認 |
| E6 | 更新前 BLE 接続で show_release | 「お使いのバージョン」が数字表示（B-1 の回帰） |

---

## 7. publish 判断への接続（線引き）

**この修正を入れてから publish（ブロッカー）**:
1. C-fix-1（adopt 明示オプトイン）＋ C-fix-2（既存 bootloader の確認ボタン） — 「操作ゼロで書き込みが始まる」は顧客製品として出せない。かつ厳格化単独は Windows のドライブレター再利用下で「詰まり」を生むため、**2つで1セット**。
2. A-fix-1（ConnectionLost 再分類）＋ ja 文言 — 最も起きやすい異常（抜線）で見当違いの案内が出る＝サポートコスト直撃。
3. B-fix-1（done で manifest.version 常時表示） — 「更新成功が伝わらない」は更新機能の存在価値に関わる。差分も最小。
4. **A-3 の原因確定**（§5 実機確認 1〜3） — recovery ②は全異常系の最後の受け皿であり、「実機で見えない」の原因不明のまま出荷はできない。ただし本命仮説（旧ビルド）ならコード修正ゼロで closed。
5. A-fix-2＋error 画面ボタン改名（各1行級） — 上記のついでに入る規模。

**次版でよい**:
- B-fix-3（done 後の BLE 自動再接続＋ライブ版数照合）
- A-fix-3（失敗側 side の事前選択）
- 偽成功ハードニング（更新後 fwinfo 照合。B-fix-3 と同梱が自然）
- stabilize 窓の縮小、`MultipleBootloaderVolumes` の rename/残留 dedupe（macOS 事象・今回未観測）
- CLI の adopt 厳格化の要否判断

---

## 8. まさかず向けサマリー

**何が起きていたか（3つとも原因確定）**

- **勝手に書き込みが始まる（C）**: 前回の失敗で「書き込みモードのまま」残った右半分を、アプリが「新しく現れた」と区別せずに掴んでいました。プログラムの1箇所が、安全のための「前からあったものは掴まない」ルールを飛ばしていたのが原因です。
- **「minimal-keysではない」と出る（A）**: ケーブルが抜けて「見えなくなった」のを「違う機械がつながった」と勘違いして表示していました。メッセージの分類ミスです。
- **バージョン不明（B）**: 更新の直後はキーボードとの無線がつながっていないので、聞きに行けず「不明」になっていました。ファーム側は正しく作れています（実測で確認済み）。

**どう直すか**

- 書き込みは「リセット2回押し」か「『このまま進める』ボタンを押す」か、**必ずどちらかの操作をしてから**始まるようにします。
- ケーブルが抜けたときは「接続が切れたようです。挿し直してください」と正しく案内します。
- 更新完了の画面には、つながっていなくても「v1.0.0 を書き込みました」と必ず出します。

**確認をお願いしたいこと（②ボタンが見えなかった件）**

いまのプログラムでは②は必ず表示される作りなので、**テストに使ったWindowsのアプリが古い版だった**可能性が一番高いです。次の3点を見てください。
1. インストーラのファイル名の数字（0.3.0 なら古い版で確定。0.4.0 を入れ直せば解決）
2. リセットの案内画面に**キーボードの写真**が出ていたか（写真なし＝古い版）
3. ②が無かった画面の一番上の題名（「エラーが発生しました」だったら、それは②が出る前の画面です）

**残る弱点（今回は直さない・危険は小さい）**

- 書き込みの最後の方（75%以降）でケーブルを抜くと、まれに「成功」と出てしまうことがあります。ただし最後の動作チェックで必ず気づけて、②で直せます。壊れて戻らなくなることはありません（bootloader 領域は構造的に書き込めないことをテストで確認済み）。次の版で自動チェックを足します。

---

## 9. 診断レポートへの補正・確定事項（統括官の独立検証）

1. **診断A・B・Cの file:line 引用は全件一致**（volume.rs:80-94 / machine.rs:268, 168-174, 213-227, 253-270 / machine.ts:59, 113-141, 216-233 / RecoveryPanel.tsx:83, 111, 118-139 / FirmwareUpdateModal.tsx:202, 231, 246-251, 387, 438 / useFirmwareUpdate.ts:144-159 / useRecoveryActions.ts:64-67 / mod.rs:95-117, 133-160 / ja.ts:42-47 / App.tsx 通知ストリーム→conn=null / docs 08・09 の adopt 契約記述）。捏造・誤引用は検出されなかった。
2. **補正1（A→解決済み）**: 診断Aが「要実機確認」とした A-2 切り分けは実測①（自動表示）で確定。preflight 窓誤分類説が正となり、修正(a)系で解消。
3. **補正2（A/C→Windows事情の追加）**: 診断A 2-2(ii) の「rename 残留（XIAO-SENSE 1）」は macOS 固有。実機は Windows であり、そこでは**ドライブレター再利用**が対応する落とし穴（同一パス再マウント→baseline フィルタが新規を食う）。これが C-fix-2（確認ボタン）を必須に格上げする根拠。
4. **補正3（A修正案の一部却下）**: 「stabilize を preflight の後ろへ」は FSKit 未準備の偽 NotUf2Volume を増やす背反があるため不採用。再分類＋有限リトライで足りる。
5. **補正4（B→(ii)不要）**: B-1/B-2 実測により FW 実装済み確定。修正は表示系(i)のみに確定し、(ii)自動再接続は次版へ。
6. **A-3 は3診断の外にあった問題**: 現行コードでは②非表示は不可能（無条件レンダー）。旧ビルド説（0.3.0 中間ビルド）を本命とし、§5 の実機確認4点で確定させる。error 画面ボタン名と recovery タイトルの同名衝突という UX 地雷を新たに特定し、改名を計画に追加した。
