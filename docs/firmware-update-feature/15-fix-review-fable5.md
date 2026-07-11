# 15. 必須修正7件の実装レビュー — Fable 5

対象: working tree（HEAD `5d48146` からの未コミット差分・12ファイル＋新規 `ja.test.ts`）
指示の正本: `14-integrated-verdict-fable5.md`（F-1〜F-6＋M-2＋B1）
手法: 全差分の実コード裏取り＋周辺コード読解（useModalRef / GenericModal / ConnectModal / error.rs / semverGe / CLI callsite）＋テスト・ビルド全実走

---

## 1. 結論

### コミット可否: **GO（コミット可）**

- **要再修正: 0件**（Critical 0 / Major 0）
- 必須7件（F-1〜F-6＋M-2）＋B1 は**全て doc14 の指示通り、または指示より僅かに堅く**実装されている
- 検証は全て green: vitest **275/275**・mk-flash-core **37/37**・src-tauri **5/5**・`npm run build`（tsc+vite）✓・`npm run lint`（max-warnings 0）✓・mk-flash-cli `cargo check` ✓
- 指摘は Minor 2件＋Info 5件のみ（§4）。いずれもコミットをブロックしない
- 実機確認の残項目は doc14 §5 のまま有効（Escape実挙動・二重モーダル前後関係）。§3 F-5 に新シナリオ1点を追記した

### 一目サマリ

| 修正 | 判定 | 根拠（file:line） |
|------|------|------------------|
| F-1 SHA fail-closed | ✅ 指示通り＋強化 | `src-tauri/src/flash/mod.rs:138` |
| F-2 窓parse→error | ✅ 指示通り | `mod.rs:146-157` |
| F-3 widenクランプ（Tauri＋CLI横展開） | ✅ 指示通り＋e2e対照テストが秀逸 | `mod.rs:151,157` / `crates/mk-flash-core/src/manifest.rs:41,44` |
| F-4 ManifestInvalid/Io 文言 | ✅ 文言一字一句一致・13 variant回帰ロック | `src/firmware-update/ja.ts:59-62` / `ja.test.ts` |
| F-5 Escapeガード＋close時cancel | ✅ 指示通り＋N-3同時解消 | `FirmwareUpdateModal.tsx:162,169-172,190-200,438` |
| F-6 二重モーダル抑制 | ✅ 指示通り（テスト3本） | `App.tsx:227,403,424-425` / `AppHeader.tsx` |
| M-2 stripV両辺 | ✅ バグ実在を確認の上、正しく修正 | `machine.ts:11,159` |
| B1 バージョンバンプ | ✅ 3箇所とも 0.4.0 一致 | `package.json:4` / `tauri.conf.json:11` / `machine.ts:13` |

---

## 2. 修正別の裏取り詳細（観点1・3）

### F-1: SHA fail-closed — ✅

`src-tauri/src/flash/mod.rs:133-141` の新設 `build_limits()` が `sha256.trim().is_empty()` で `ManifestInvalid` を返す。doc14 の指示（`is_empty()`）より僅かに堅い（空白のみのshaも拒否）。

- **正常manifestを壊さない**: sha有りなら `expected_sha256 = Some(sha)` で従来通り `validate_uf2` のSHA照合が機能。トリムせず格納するが、万一空白付きshaが来ても照合不一致＝fail-closed（fail-openになる経路なし）
- 旧コードの「TSが `""` を渡すとSHA照合スキップ」経路は Rust 側で遮断され、F-4 の ManifestInvalid 文言で顧客に表示される
- テスト: `build_limits_rejects_empty_sha`（`""`と`"   "`の両方）✓

### F-2: 窓parse失敗をエラーに — ✅

`mod.rs:146-157`: `parse_hex_u32` 失敗で `ManifestInvalid { reason: "bad target_addr_min/max ..." }`。silent-skip→既定（広い）窓へのfallbackを排除。正常な16進窓は従来通り通る。テスト `build_limits_rejects_bad_hex_window`（min/max両側）✓

### F-3: widenクランプ — ✅（文鎮経路の構造的遮断を確認）

- Tauri経路: `mod.rs:151` `m.max(DEFAULT_TARGET_ADDR_MIN)` / `:157` `m.min(DEFAULT_TARGET_ADDR_MAX)`
- CLI横展開: `manifest.rs:41,44` に同型クランプ。**CLIの全callsite（`crates/mk-flash-cli/src/main.rs:160-177` の6箇所、settings-reset資産含む）がクランプ済み `uf2_limits()` 経由**であることを確認
- `DEFAULT_TARGET_ADDR_MIN/MAX` は `lib.rs` で re-export 済み（doc14の確認指示どおり・追加不要だった）✓
- **安全性の論証**: クランプ後の窓は常に `[0x27000, 0xF4000]` の部分集合 → MBR/SoftDevice/bootloader 域への書込は敵対manifestでも構造的に不可能。min>max になる敵対値は「空窓」＝全ブロック拒否でこれもfail-closed
- テスト: narrow許可・widenクランプ（両クレート）に加え、`widen_clamp_blocks_bootloader_region_write`（`mod.rs`）が**対照付きe2e**——クランプなしなら 0xF5000 のブロックが検証を通ることを対照で示した上で、クランプが遮断することを証明。「クランプが実際に効いている」ことのload-bearing証明になっており、doc14の要求を超える品質
- 前提の明文化（提案・非ブロッカー）: このクランプは「正規資産が既定窓外を書く必要は永遠にない」前提（uf2.rs:35 の設計意図どおり）。manifest 生成側（CI）の契約としてどこかに1行残すとよい

### F-4: ManifestInvalid/Io 文言 — ✅

- `ja.ts:59-62`: doc14 §4 の指示文言と**一字一句一致**
- `error.rs` の FlashError は 13 variant・`#[serde(tag="kind", content="detail")]` — 新規 `ja.test.ts` の13定数リストと**完全一致**を突合済み。全variantがfallback（「予期しないエラー」）に落ちないことを table-driven でロック＋fallback/文字列passthroughも網羅。variant追加・改名時にテストが落ちる回帰ロックとして正しく機能する

### F-5: Escapeガード＋close時cancel — ✅（N-3も同時解消）

実装は doc14 の指示と同型だが、`useModalRef(open, false, !flashing)` → `useModalRef(open)` の変更が加わっている。これは**正しい判断**:

- 旧 reopen パターン（`useModalRef.ts:10-21`）は Escape時に close イベントが発火してから showModal し直すため、`GenericModal onClose` → 親フラグ desync が構造的に残る。allowCancel を渡さないことで reopen 経路自体を不使用にし、抑止は自前の `cancel` リスナ（`FirmwareUpdateModal.tsx:190-200`）で行う——`canCloseRef` による最新値参照＋mount時1回attachのパターンも正しい（dialogは常時DOM内・refは安定）
- **閉じられない全画面で効くか**: `canClose`（:174-182）の補集合 = fetching_manifest / downloading / r_confirm / r_bootloader_guide / r_flashing / swap_to_l / l_confirm / l_bootloader_guide / l_flashing / verify_checklist / recovery_flashing。**依頼観点の7画面（downloading/r_confirm/l_confirm/bootloader_guide/swap_to_l/verify_checklist/flashing）を全カバー**（fetching_manifest が非closableなのは既存仕様のまま）
- **他モーダルへの影響ゼロ**: 共有 `useModalRef` は無変更。他の呼び出し（ConnectModal の `(open||false, false, false)` 等）はシグネチャ・挙動とも不変
- **close時cancel配線**（:438 `onClose={handleClose}`）: dialogがどう閉じても `cancel()`（`useFirmwareUpdate.ts:105-108` = `invoke("flash_cancel")`＋`RESET`）が走る → doc14 N-3（60秒waitがBusyGuardを握ったまま→次回開始で「予期しないエラー」）も同時解消
- **cancelフラグ汚染なしを確認**: 完了時の「閉じる/完了」も `flash_cancel` を打つが、`flash_wait_for_bootloader` / `flash_write_uf2` とも冒頭で `cancel.reset()`（`mod.rs:103,176`）するため次操作は汚染されない。二重close（Xボタン→open=false→useModalRef close→closeイベント→handleClose再実行）も冪等で無害
- **reopen経路無効化の新不整合なし**: closeイベントは必ず handleClose に集約され、親フラグと dialog 状態が単方向に同期する。desyncの残経路は見つからなかった

**残リスク（静的には解消不能・実機確認へ）**: doc14 §5 指定の「WKWebViewで `cancel` の preventDefault が効くか」に加えて1点補強——近年のエンジンの close-request 仕様（CloseWatcher 系）では **Escape連打の2打目が preventDefault を無視して close し得る**。その場合でも本実装は handleClose 経由の「cancel＋整合的close」に劣化する（旧実装の「モーダル消失＋バックグラウンド書込続行」より大幅に安全）が、書込中の強制closeは片側未完→recovery行きになる。**doc14 §5 の実機シナリオ「Escape連打」は必ず *_flashing 中に実施**すること。

### F-6: 二重モーダル抑制 — ✅

doc14 の4手順＋テストを全て実装:

1. リフト: `App.tsx:227` `const [fwUpdateOpen, setFwUpdateOpen] = useState(false)` ✓
2. `App.tsx:403` `open={!conn.conn && !fwUpdateOpen}` ✓
3. AppHeader props化＋ローカルstate撤去（`showFirmwareUpdate` の残骸は repo 全grepで0件）✓
4. テスト: `AppHeader.test.tsx` に3本（flag ONでボタン表示 / press→`onFwUpdateOpenChange(true)` / flag OFFで非表示）— doc14要求の2本＋1本 ✓

退行チェック（観点5）:
- **正常な接続フロー**: 未接続かつウィザード閉なら従来通り ConnectModal 表示（`!null && !false` = true）
- **更新中のRPC切断**: `AppHeader` は **App.tsx:413 で無条件マウント**（`conn.conn` 条件は :427 のタブnav以下のみ）→ 切断中もウィザードは生存し、ConnectModal は抑止される
- **更新後の再接続導線**: ウィザードclose → `fwUpdateOpen=false` → conn null なら ConnectModal が自然表示。ConnectModal 側の `useModalRef` は open の false→true 遷移で showModal＋reopenリスナ再attach（着脱バランス確認済み）— 導線は残る ✓
- `fwUpdateOpen`/`onFwUpdateOpenChange` はoptional（既定 false / no-op）なので、props未配線の単体レンダ（テスト・Storybook）も壊れない

### M-2: stripV両辺 — ✅（バグの実在を確認済み）

- バグ実在の裏取り: `semverGe` の `parts()`（`machine.ts:24-41`）は `"v9"` が `/^\d+$/` 不一致で break → `[]` → 「制約なし」扱い＝**v付きmanifestでゲートが静かに開く**ことを実コードで確認
- 修正 `machine.ts:159` `semverGe(stripV(TOOL_VERSION), stripV(min))` で遮断。テスト2本（v9.0.0でblock / v0.0.1で通過）✓
- 意味論の退行なし: v無しmanifestでは stripV は no-op。TOOL_VERSION 0.1.0→0.4.0 により `min_tool_version ∈ (0.1.0, 0.4.0]` のmanifestが通るようになるが、これはツールが実際に新しくなったので正しい

### B1: バージョンバンプ — ✅

`package.json` 0.4.0 / `src-tauri/tauri.conf.json` 0.4.0 / `machine.ts:13` TOOL_VERSION "0.4.0" — 3箇所一致。

---

## 3. 観点6: main.rs について（タスク指示との不一致）

**依頼文の「`src-tauri/src/main.rs`（変更あり＝要確認）」は事実と不一致**。`git diff HEAD -- src-tauri/src/main.rs` は**空**（変更12ファイルにも含まれない）。かつ「変更不要」が正しい: 新コマンドは追加されておらず（`build_limits` は private fn）、`invoke_handler` の flash 系6コマンド登録（`main.rs:32-37`: fw_fetch_manifest / fw_download_asset / flash_scan_volumes / flash_wait_for_bootloader / flash_write_uf2 / flash_cancel）は完備のまま。

---

## 4. 指摘一覧（要再修正なし・全てMinor以下）

| # | 重要度 | 指摘 | 場所 | 提案 |
|---|--------|------|------|------|
| 1 | **Minor** | **import循環の新規発生**: `machine.ts:11` が `versions.ts` の `stripV` を import、`versions.ts:1` は `machine.ts` の `semverGe` を import。両方とも関数宣言のみ・トップレベル評価なしで**現状は安全**（tsc/vite/vitest 全通過を実測）だが、将来どちらかがトップレベルで相手を使うと初期化順の罠になる | `machine.ts` ↔ `versions.ts` | 次版で `stripV` を machine.ts へ移し versions.ts から re-export（3行）。今回のコミットは止めない |
| 2 | **Minor** | rustfmt乖離: `mod.rs:8`（import block）と `manifest.rs` の新テスト（コメント整列）は今回編集起因のfmt drift。ただし**リポジトリ全体に既存driftが多数**（machine.rs 20箇所等）で、CIにcargoゲート自体がない＝ブロッカーではない | `mod.rs` / `manifest.rs` | `cargo fmt` 一括は別コミットで（今回diffに混ぜない） |
| 3 | Info | **CIがRustテストを実行しない**: `release.yml` の test ジョブは npm のみ。今回の安全ゲートのテスト（build_limits系・クランプ系）はローカルでしか回らない | `.github/workflows/release.yml` | `cargo test`（core＋src-tauri）をCIに追加する価値大。別承認事項として提案 |
| 4 | Info | Rust側 `version_ge`（`manifest.rs:117`）にも同じ v-prefix 弱点があるが、**cli/tauri に呼び出し元ゼロ**（テストのみ＝実質dead code）で実害なし | `manifest.rs:117-133` | doc14 #19（semver契約明文化・次版）で一緒に |
| 5 | Info | S-1〜S-3（同乗推奨: httpsスキーム固定 / scanのsupportLog / 終了ガード）は**今回未実装** | `download.rs` / `useFirmwareUpdate.ts` | doc14上「推奨・非ブロッカー」どおり。rc.1に混ぜるかはまさかず判断 |
| 6 | Info | `CLAUDE.md` の変更（記憶セクション追記）が同じworking treeに混在。flasher修正と無関係 | `CLAUDE.md` | コミットを分ける（fw-update系とdoc系） |
| 7 | Info | CLI経路のbad-hex窓は依然silent-skip（`manifest.rs:40,44` `.and_then(parse_hex_u32)`）だが、fallbackは既定窓＝クランプ済みの安全側。doc14はF-2をcustomer pathのみに指定しており**仕様通り** | `manifest.rs:40,44` | 対応不要（記録のみ） |

---

## 5. 退行チェック（観点2）と検証ログ（観点7）

### 退行なしを確認した項目

- **R→L更新フロー**: `machine.ts` reduce の変更は FETCH_OK のゲート1行のみ。状態遷移表は不変
- **recovery 3経路**: `useRecoveryActions.ts`・recovery系step は無変更。canClose で recovery / recovery_waiting / recovery_done は closable 維持、recovery_flashing は非closable 維持
- **既存モーダル**: 共有 `useModalRef` / `GenericModal` 無変更。ConnectModal ほか他呼び出しの引数不変
- **既存Rustコマンド**: `flash_wait_for_bootloader` / `fw_download_asset` / `flash_uf2` コア無変更。`flash_write_uf2` のシグネチャ不変（TS側呼び出しへの影響なし）

### 実走した検証（全てgreen）

| 検証 | 結果 |
|------|------|
| `npx vitest run` | 39 files / **275 tests passed**（新規 ja.test.ts 18・machine M-2 2・AppHeader F-6 3 含む） |
| `cargo test`（mk-flash-core） | **37 passed**（クランプ2本含む） |
| `cargo test`（src-tauri） | **5 passed**（build_limits 4本＋e2e対照1本） |
| `npm run build`（tsc＋vite） | ✓（型エラーなし・import循環も実害なし） |
| `npm run lint`（--max-warnings 0） | ✓ |
| `cargo check`（mk-flash-cli） | ✓（クランプ横展開後もCLIコンパイル成立。※sandboxの `~/.cargo` 書込制限で初回失敗→CARGO_HOME退避で実施） |

### この判定の限界

- F-5 の Escape 実挙動（WKWebViewのpreventDefault・close-request仕様のEscape連打バイパス）と F-6 のモーダル前後関係は静的解析＋テストのみ。**doc14 §5 の実機2シナリオ（Escape連打は *_flashing 中に・接続状態からの更新開始）を GO-2 で必ず実施**
- `cargo clippy` は未実施（CIにも無し・doneの定義外）。fmt/clippy の整備は別件提案（§4 #2, #3）

---

*レビュー: Fable 5（2026-07-12）。全指摘は実コード・実行結果に基づく（憶測ゼロ）。*
