# 08 実装詳細設計 — Step1(A統合MVP) と Step3(ワンクリック化)

- 作成日: 2026-07-09
- 作成: Fable 5（シニアフルスタック × 組込みエンジニアロール／read-only調査ベース・コード変更なし）
- 位置づけ: `07-packaging-analysis` の「移行パス8ステップ」を**実装レベルに具体化**した手順書。既存の結論（案A確定・A-1 vendoring確定・dfu RPC設計）は作り直さず、上乗せする
- 前提: `00`〜`07` を読了していること。特に `03 §2`（ブートローダー自動遷移の結論）、`07 §5`（移行パス8ステップ）
- 出典表記: 事実には `ファイルパス:行番号` を付ける。実機・実ビルドでしか確定しない箇所は「未確認」と明記

---

## 0. 30秒サマリー（まさかず向け）

```
Step1 = 今すぐ出せる更新機能（初回だけ手動リセット2回）
         └ 中身は出来ている flasher の「引っ越し」+ 救出UI/ログ保存/写真ガイドの新規実装
         └ 工数の実体 ≒ 移植 + 新規UI実装 + 実機の再確認（Codexレビュー10反映で ≈5.5〜7人日）

Step3 = 「接続して更新ボタンだけ」の全自動（リセット2回が要らなくなる)
         └ FW側に小さな受け口(dfu)を足す
         └ ★鶏卵問題: 受け口は今の出荷FWに無い。
           だから「受け口入りFWを顧客が1回(手動で)焼いた後」から自動になる
```

- **一番大事な事実**: Step1 と Step3 は別物ではなく、**Step1 の状態機械に分岐を1本足すのが Step3**。作り直しは発生しない（S3.4 で図示）。
- **正直な限界**: 「全顧客がいきなりワンクリック」は原理的に不可能。受け口FWをいつ配るかで到達時期が決まる（S3.1・S3.6）。

---

## 1. 全体像（何をどこへ移すか）

flasher の資産は3層に分かれており、そのまま持ち込める形で作られている（`07 §1.4` で確認済み）。

```
flasher (~/farmware/minimal-keys-flash)          →  Studio (~/claude-code/minimal-keys-studio)
─────────────────────────────────────────────────────────────────────────────────────────
crates/mk-flash-core   (純Rust・tauri非依存・35テスト) →  crates/mk-flash-core   ← srcは無改造・Cargo.tomlはstandalone化(S1.2-a)
crates/mk-flash-cli    (救出用CLI)                     →  crates/mk-flash-cli    ← 救出用に温存(任意・Cargo.toml同上)
src-tauri/src/commands.rs (6コマンド・175行)          →  src-tauri/src/flash/mod.rs ← Studioへ配線し直す
src/wizard/machine.ts  (純reducer・15状態)            →  src/firmware-update/machine.ts ← 通常フロー無改造+recovery 3モード追加(S1.12b)
src/useFirmwareUpdate.ts / App.tsx / i18n/ja.ts       →  src/firmware-update/ 一式    ← Studio流に再スキン
src-tauri/Info.plist   (TCC説明文)                     →  Studio Info.plist へ「追記」
```

- **改造が要るのは「配線」「見た目」、そして crate の Cargo.toml standalone化（S1.2-a）**。ロジック（`.rs`/`.ts` のソース本体）は無改造で載るが、`mk-flash-core`/`mk-flash-cli` の **Cargo.toml は flasher 親workspaceの継承**（`version.workspace = true` / `serde = { workspace = true }` 等。`flasher crates/mk-flash-core/Cargo.toml:4-13`、親定義は `flasher Cargo.toml:1-16`）に依存しており、文字通りの「無改造コピー」ではコンパイル不能（Codexレビュー10 Critical-1）。
- flasher の安全装置は **既に顧客が通るGUI経路に全部配線済み**（`06` の指摘 C1〜C7 は全て是正され、実機E2Eも完走。`flasher docs/BUILD_STATE.md:15,19,40-59`）。つまり移植とは「動いている安全な機能を運ぶ」作業であり、安全設計をやり直す作業ではない。

---

# Step1 — A統合MVP（初回は手動リセット2回）

顧客が「自分でFWを最新にできる」を達成する最小構成。ブートローダー遷移は初回のみ手動（リセットボタン2回）。Mac先行、Windowsは後続（`03 §4`・`07` の段階リリース方針を踏襲）。

## S1.1 移設対象の確定マップ（flasher実コード → Studio）

### Rust（コア）— srcは無改造・Cargo.tomlのみstandalone化して移設（S1.2-a）

`crates/mk-flash-core` の公開面（`flasher crates/mk-flash-core/src/lib.rs:20-30`）:

| 公開シンボル | 役割 | 出典 |
|---|---|---|
| `validate_uf2(bytes, limits) -> Uf2Info` | UF2構造・familyID・アドレス窓・SHA全ブロック検証 | `uf2.rs:95` |
| `scan_bootloader_volumes(env)` / `wait_for_new_volume(...)` / `acquire_bootloader(...)` | ボリューム検出・単一ボリューム強制・Board-ID前方一致 | `volume.rs:14,22,64` |
| `flash_uf2(env, volume, filename, data, config, progress, cancel) -> FlashOutcome` | 書込本体（アンマウント裁定・errno分類・リトライ） | `machine.rs:149` |
| `parse_board_id` / `FlashEnv`トレイト（`list_uf2_volumes/volume_present/read_info_uf2/write_attempt/sleep`） | OS抽象化（Mac=`/Volumes`走査 / Win=A:〜Z:） | `fsops.rs:33-51,54` |
| `parse_manifest` / `version_ge` / `FwManifest` / `FwAsset` | manifest解釈・semver比較 | `manifest.rs:85,112` |
| `fetch_manifest` / `download_asset`（feature=`download`） | HTTP取得（ureq・16MB上限・タイムアウト） | `download.rs:29,38` |

- **`FlashEnv` トレイトのOS分岐が唯一の要注意点**。`RealEnv` は `#[cfg(target_os)]` でMac/Win別実装、非対応OSは空Vecを返す無音分岐がある（`flasher fsops.rs:148-193`。`07 flasher-analysis` の移植リスク3）。→ Studioのビルドターゲット（`macos-15` universal + `windows-latest`、`Studio release.yml:32-39`）で確実にどちらかの分岐に入ることをS1.9のCIで担保する。

### TypeScript（状態機械・UI）— 通常フローreducerは無改造（recovery側のみ追加）、UIはStudio流に

| flasher | 役割 | Studio移植時の扱い |
|---|---|---|
| `src/wizard/machine.ts`（15状態/18イベント・純reducer・React非依存） | 更新の全手順を型で強制 | コピー+**recovery 3モード分の状態/イベント追加**（S1.12b。通常フロー遷移は不変。`src/firmware-update/machine.ts`） |
| `src/wizard/machine.test.ts`（vitest 11件） | R→L順序強制などの回帰テスト | コピー+recovery遷移テスト追加（S1.12b） |
| `src/useFirmwareUpdate.ts`（invoke/Channel配線・フック） | reducerとTauriコマンドの糊 | コマンド名の名前空間だけ調整（S1.3） |
| `src/App.tsx`（インラインstyle・自作Button・`<progress>`） | ウィザード描画 | **破棄して再スキン**（S1.5）。Studioは Tailwind + react-aria なので見た目を作り直す |
| `src/i18n/ja.ts`（文言・エラーマップ） | 日本語文言 | 文言は流用、置き場をStudio流に |

## S1.2 crate配置（vendoring・A-1確定）

Studioは現在 **単一crate**（workspace宣言なし。`Studio src-tauri/Cargo.toml` に `[workspace]` 無し、`crates/` ディレクトリ無し。`studio-analysis §2`）。ここに flasher の `crates/` を持ち込む（root workspaceは導入しない＝推奨A。下記S1.2-aのstandalone化が必須）。

```
minimal-keys-studio/
├─ crates/                        ← 新規
│   ├─ mk-flash-core/             ← flasherからコピー(srcは無改造・Cargo.tomlはstandalone化 S1.2-a)
│   └─ mk-flash-cli/              ← 任意(救出CLIとして温存・Cargo.toml同上)
└─ src-tauri/
    └─ Cargo.toml                 ← path依存を1行追加
```

`src-tauri/Cargo.toml` に追加（flasherの `src-tauri/Cargo.toml:20` と同じ書式、パスだけStudio用に）:

```toml
mk-flash-core = { path = "../crates/mk-flash-core", features = ["download"] }
sha2 = "0.10"   # 既にcoreが持つ。src-tauri側で直接使わないなら不要
```

**判断が要る1点（workspace合流）**: 現状flasherは「`crates/*`＝ルートworkspace」「`src-tauri`＝独立workspace」の2ワークスペース構成（`flasher Cargo.toml:1-6` / `src-tauri/Cargo.toml:9`。tauri抜きでcoreを速くテストするための意図的分離）。Studioは `src-tauri` 単独。合流の選択肢は2つ:

- **推奨A（確定）**: Studioも「ルート未定義のまま `src-tauri` が `crates/*` を path 参照」。workspace化しない。最も差分が小さい。coreのテストは `cargo test --manifest-path crates/mk-flash-core/Cargo.toml` で回す。
- 代替B: リポルートに `[workspace] members=["src-tauri","crates/*"]` を新設。Cargo.lockが一本化されるが、既存Studioビルドの解決が変わる副作用の検証が要る（`07 flasher-analysis` 移植リスク1）→ **不採用**。

MVPは**推奨A**（差分最小・既存ビルドに触れない）で確定。

**★訂正（Codexレビュー10 Critical-1）— 推奨Aでは「無改造コピー」は成立しない**: `mk-flash-core`/`mk-flash-cli` の Cargo.toml は flasher 親workspaceの継承に依存している（`version.workspace = true` / `edition.workspace = true` / `serde = { workspace = true }` 等。`flasher crates/mk-flash-core/Cargo.toml:4-13`。親定義は `flasher Cargo.toml:1-16` の `[workspace.package]`/`[workspace.dependencies]`）。親workspaceを持たない推奨Aでは、コピーしただけではコンパイル不能。→ 移植時タスク **S1.2-a（Cargo.toml standalone化・0.25日）** を必須で追加する:

1. `crates/mk-flash-core/Cargo.toml`: `version/edition/license/repository` のworkspace継承を実値へ（flasher `[workspace.package]` の値 `0.1.0` / `2021` / `MIT` を転記）。依存も通常指定へ: `serde = { version = "1", features = ["derive"] }` / `serde_json = "1"` / `sha2 = "0.10"` / `thiserror = "1"`（flasher `[workspace.dependencies]` の値をそのまま転記。`flasher Cargo.toml:13-16`。バージョンを勝手に上げない）。
2. `crates/mk-flash-cli/Cargo.toml`: 同様にstandalone化（`mk-flash-core` へのpath依存は相対のまま動く。`flasher crates/mk-flash-cli/Cargo.toml:14`）。
3. 変更は **Cargo.toml 2ファイルのみ**。`src/**`（.rs本体）と35テストは無改造。standalone化後に `cargo test --manifest-path crates/mk-flash-core/Cargo.toml` 35件緑で等価性を確認してから配線に進む。

- `mk-flash-core` のCargo.lock版は flasher で **2.11.5**、Studioは **2.11.3**（`07 §1`）。coreはtauri非依存なので直接は無関係。Studio側の解決に一本化される。

## S1.3 src-tauri コマンド統合（名前空間・衝突チェック）

Studio既存6コマンド（`Studio main.rs:23-30`）と flasher 6コマンドは**名前が完全に別**で衝突しない:

```
Studio既存:  transport_send_data / transport_close /
             gatt_list_devices / gatt_connect / serial_list_devices / serial_connect
flasher追加:  fw_fetch_manifest / fw_download_asset / flash_scan_volumes /
             flash_wait_for_bootloader / flash_write_uf2 / flash_cancel
              （flasher commands.rs:72,79,91,98,122,172）
```

配置と登録（**Tauri v2の罠に注意**）:

1. `flasher src-tauri/src/commands.rs`（175行）を Studio の `src-tauri/src/flash/mod.rs` として置く（module化してtransportと並べる。`Studio transport/mod.rs:1-3` と同じ流儀）。
2. `Studio src-tauri/src/main.rs` の `invoke_handler(tauri::generate_handler![...])`（`main.rs:23-30`）に6コマンドを**追記**。
3. `main.rs` の Builder に `.manage(flash::FlashState::new())` を追加（flasherは `main.rs:11` で登録。`FlashState { cancel, busy: AtomicBool }`＝単一飛行ロック。`flasher commands.rs:27-30`）。
4. **罠**: Studioの `src-tauri/src/lib.rs` は最小スタブでコマンド登録は `main.rs` 側にある（`studio-analysis §1`）。Tauri v2の標準テンプレは `lib.rs` に書くので、テンプレ通りに生成すると**静かに無効化される**。必ず `main.rs` の既存 invoke_handler に足す。

```rust
// Studio src-tauri/src/main.rs（イメージ・追記部分のみ）
tauri::Builder::default()
    // ...既存plugin...
    .manage(transport::commands::ActiveConnection::default()) // 既存
    .manage(flash::FlashState::new())                          // 追加
    .invoke_handler(tauri::generate_handler![
        transport_send_data, transport_close,
        gatt_list_devices, gatt_connect,
        serial_list_devices, serial_connect,
        // ↓ 追加6個
        flash::fw_fetch_manifest, flash::fw_download_asset,
        flash::flash_scan_volumes, flash::flash_wait_for_bootloader,
        flash::flash_write_uf2, flash::flash_cancel,
    ])
```

- **single-instanceプラグインは持ち込まない**（flasherは `tauri-plugin-single-instance` を使うが、Studio全体の起動挙動を変えるため。`07 A-6`）。プロセス内の二重書込防止は `FlashState.busy`(AtomicBool)+`BusyGuard`(RAII) で既に担保されている（`flasher commands.rs:47-64`）＝これはそのまま移植する。
- **接続ライフサイクルとの結合**（唯一の統合点）: Studioは BLE/USB を単一 `ActiveConnection` で共有する（`Studio transport/commands.rs:22-25`）。Step1のUF2書込は**RPCに一切依存しない**（MSCボリュームへ直書き）ので、書込中に既存RPC接続が生きていても衝突しない。ただし安全側として「ウィザード起動中はRPC接続を切る」推奨（`03 §3.1`・`07 A-2`）。ここはUI側で `useConnection` を見て切断する1フックのみ（Rust無改造）。

## S1.4 Info.plist / capabilities 追記（webview権限は広げない）

| ファイル | 変更 | 根拠 |
|---|---|---|
| `Studio src-tauri/Info.plist` | `NSRemovableVolumesUsageDescription` を**追記**（既存のBluetooth説明は残しマージ） | macOS Catalina+ のリムーバブルボリューム初回アクセスTCC。無いと無言拒否UX。flasherは同キーを持ち実機で通過確認済み（`flasher Info.plist:7-8`, `BUILD_STATE.md:15`） |
| `Studio src-tauri/capabilities/default.json` | **変更なし** | flash系はカスタムコマンド。fs/shellプラグインの広い権限は不要（flasherは `core:default`+`dialog:default` のみで動作。`flasher capabilities/default.json:4-6`）。Studio既存の `fs:allow-write-text-file **` も広げも狭めもしない（本件と無関係。`studio-analysis §3`） |
| `Studio src-tauri/tauri.conf.json` CSP | **変更なし** | ダウンロードはRust側ureq。webviewのfetchではないのでCSP `connect-src`（現状 ipc:+GAS2つ。`studio-analysis §3`）に手を入れない |
| `entitlements.plist` | **変更なし**（sandbox=false のまま） | 非sandboxでUSB/removable系entitlement不要（`03 §3.6`） |

追記する文言（flasherの実文言をコピー。`flasher Info.plist:7-8`）:
> 「キーボードにファームウェアを書き込むため、書き込みモードのキーボード（リムーバブルボリューム）へアクセスします。」

## S1.5 フロント配置（`src/firmware-update/`）とStudio流の再スキン

置き場（Studioの機能フォルダ流儀 `src/keyboard/` 等に合わせる。`studio-analysis §4`）:

```
src/firmware-update/
├─ machine.ts          ← flasherコピー+recovery 3モード分の状態/イベント追加(S1.12b)
├─ machine.test.ts     ← flasherコピー(vitest 11件)+recovery遷移テスト追加(S1.12b)
├─ useFirmwareUpdate.ts ← コマンド名の名前空間調整+SupportLog収集(S1.12b)
├─ useRecoveryActions.ts ← 新規(3モード救出の副作用フック。通常フローと分離 S1.12b)
├─ supportLog.ts       ← 新規(SupportLog型+収集+保存処理 S1.12b)
├─ FirmwareUpdateModal.tsx  ← 新規(GenericModalベース・Tailwind)
├─ steps/              ← 画面ごとのコンポーネント(09のUIに対応)
├─ RecoveryPanel.tsx   ← 新規(3モード救出UI S1.12b)
├─ proto/dfu.ts        ← Step3で追加(Step1では空)
└─ ja.ts               ← flasher i18n/ja.ts の文言を流用
```

**再スキンの中身**（flasher App.tsx はインラインstyle+自作Button+`<progress>`。Studioは Tailwind+react-aria。`studio-analysis §5,6` / `flasher §5`）:

- モーダル外枠 = Studio既存 `GenericModal.tsx`（`<dialog>`ラッパ）を流用（`studio-analysis §6`）。
- ボタン = react-aria `Button`（Studio既存流儀 `AppHeader.tsx:1-7`）。
- **進捗バーは新規**（Studioに progress コンポーネントが無い。`studio-analysis §6` 注意点4）。`flasher App.tsx:99` の HTML `<progress>` を Tailwind でスタイルした共通 `ProgressBar` として作る（09で意匠指定）。
- トースト = Studio既存 `useToast()`（success/error/info・3秒。`studio-analysis §6`）を流用。
- 色/ダーク = Studioの `light-dark()` OS追従トークン（`tailwind.config.js:17-26`）に乗せる。flasher側の色指定は捨てる。

**エラー表示の要注意**: flasherの `FlashError` はタグ付きJSON（`kind`/`detail`）で、TS側 `formatError`（`flasher i18n/ja.ts:35-62`）が `kind` で日本語に分岐する。これを**必ず一緒に移植**する（`06 W3` の「[object Object]」バグは flasher では是正済み。Studioへ運ぶ時に落とさない）。

## S1.6 feature flag と Web版ゲート

2枚のゲートで「表示するか」を制御（`07 §5 Step4`）:

1. **Web版で非表示**: `window.__TAURI_INTERNALS__` の有無で判定（Studio唯一のTauri/Web分岐機構。`studio-analysis §5`）。Web版（GitHub Pages）はボリューム書込不可なのでメニュー自体を出さない。
2. **リリース可逆化**: `VITE_FEATURE_FW_UPDATE`。**注意**: Studioは `envPrefix` に `VITE_` を宣言済みだが `import.meta.env.VITE_*` の実使用箇所は現状ゼロ（宣言のみ。`studio-analysis §5`）。つまり**この機能が最初のVITE_フラグ実利用者**になる。実装は `import.meta.env.VITE_FEATURE_FW_UPDATE === "1"` の単純ガードで足りる。

```
表示条件 =  isTauri(window.__TAURI_INTERNALS__)  AND  VITE_FEATURE_FW_UPDATE==="1"
```

## S1.7 メニュー統合（更新ボタンをどこに置くか）

Studioのナビは**上部ヘッダー直下の横並びタブバー**（サイドバーではない。React Routerなし。`TAB_GROUPS` 配列でタブ定義。`studio-analysis §6`）。加えて `AppHeader` にメニュー（「設定を初期化」等が並ぶ。`03 §3.4`）。

MVPの置き方（詳細UIは09）:
- **入口はタブではなくヘッダーメニュー**の1項目「ファームウェア更新」。理由: 年1〜2回の低頻度操作で常時タブを占有しない（`07 §2`）。react-aria `MenuItem` を1行追加（`AppHeader.tsx` の既存 Menu に。`studio-analysis §6`）。
- 起動すると `FirmwareUpdateModal` を開く（Studio既存モーダル流儀）。
- 「更新あり」バッジは Step1 では**任意**（現バージョン検出はStep3のdfuが必要なため。S3で有効化。Step1は「最新を確認/書き込む」だけ提供）。

## S1.8 安全装置の移植と維持（この5つを落とさない）

flasherで**既に顧客経路(GUI→Tauriコマンド→書込)に配線済み**の安全装置（`flasher §7`・`BUILD_STATE.md:40-59`）。移植は「配線ごと運ぶ」＝Rust無改造なので維持される。移植後にGUI経路で実際に呼ばれることをS1.13で再確認する（`06`の教訓＝過去にCLIのみ配線されGUIに漏れていた事故の再発防止）。

| 安全装置 | 実装場所 | 維持方法 |
|---|---|---|
| ①書込前UF2検証（構造+familyID+アドレス窓+SHA全ブロック） | `flasher commands.rs:143-153` が `uf2.rs:95 validate_uf2` を write直前に呼ぶ | commands.rs を無改造移植＝配線ごと運ぶ |
| ②Board-IDゲート（`Seeed_XIAO_nRF52840` 前方一致） | `machine.rs:248-265 preflight_board_id`、flash_uf2冒頭で呼ぶ（`machine.rs:167-169`） | core無改造。**ただしprefix定数が2箇所に重複**（GUI待機側=`flasher commands.rs:21-23 BOARD_ID_PREFIX`／書込直前preflight側=`FlashConfig::default()` `machine.rs:80-88`）。片方だけ変わると「検出は通るが書込で拒否」またはその逆が起きるため、移植時に `mk-flash-core` へ `pub const MINIMAL_KEYS_BOARD_ID_PREFIX` を公開し、`FlashConfig::default()` とTauriコマンド層の両方が同一定数を参照する形に**1本化する（必須タスク。Codexレビュー10）** |
| ③単一ボリューム（baseline差分・2個以上で中断） | `volume.rs:22-54,64-95` | core無改造 |
| ④単一飛行ロック（同時書込防止） | `commands.rs:47-64 BusyGuard`+`FlashState.busy` | 移植。single-instanceプラグインは**持ち込まない**（S1.3） |
| ⑤settings_resetハードブロック | `machine.ts:108-115`（`requires_settings_reset=true`→`blocked{settings_reset_unsupported}`） | reducer無改造。GATT変更更新はStudioのバックアップ/復元が出来るまで**アプリから実行させない**（`00-decisions 決定1`のスパイク結論待ち。それまではLINE/Discord人手案内） |

- **⑤の意味（重要な割り切り）**: 現状 flasher は GATT変更（settings_reset必須）の更新を**アプリ側で拒否**している。`00-decisions` はバックアップ→復元機構(a)を選んだが「実装の現実性に疑問→実機スパイクで確認」の条件付き。**MVPでは⑤の拒否をそのまま維持**し、GATT変更更新は範囲外（人手案内）とするのが安全。バックアップ/復元は Step2 相当の別作業（本設計のStep1/Step3の外）。

## S1.9 CI統合

Studio `release.yml` は現在 `npm ci/lint/test/build` + tauri-action（macos-15/windows-latest）（`studio-analysis §8`）。flasher CIは4ジョブ（core/gui-macos/frontend/pipeline。`flasher §9`）。統合:

1. testジョブに **`cargo test --manifest-path crates/mk-flash-core/Cargo.toml`** を追加（coreの35テストをStudio CIで回す。`07 §5 Step5`）。
2. **`cargo check` で src-tauri をコンパイル**する行を追加（Studio CIは現状 `npm run build` のみでRust側をCIビルドしていない疑い＝flasherで `commands.rs` がCIをすり抜けた前例あり。`06 W2`）。macOSランナーで実施（`flasher ci.yml:22` の理由＝system WebKitでGUIバイナリもコンパイル、と同じ）。**Windowsランナーでも `cargo check` を回す**と `RealEnv` のWin分岐（`fsops.rs` cfg(windows)側）が初めてコンパイル検証される（`06 W2`）。
3. リリースビルド自体は tauri-action が同一バイナリに含めるので **release側の追加変更は不要**（`07 §5 Step5`）。

## S1.10 変更/新規ファイル一覧（Step1）

**新規**:
```
crates/mk-flash-core/**            (flasherコピー。srcは無改造・Cargo.tomlはstandalone化 S1.2-a。
                                    MINIMAL_KEYS_BOARD_ID_PREFIX 公開の小改造 S1.8②)
crates/mk-flash-cli/**             (任意・救出CLI・Cargo.tomlはstandalone化 S1.2-a)
src-tauri/src/flash/mod.rs         (flasher commands.rs 移植。BOARD_ID_PREFIXはcore公開定数を参照 S1.8②)
src/firmware-update/machine.ts     (flasherコピー+recovery 3モード追加 S1.12b)
src/firmware-update/machine.test.ts(flasherコピー+recovery遷移テスト追加 S1.12b)
src/firmware-update/useFirmwareUpdate.ts (名前空間調整+SupportLog収集 S1.12b)
src/firmware-update/useRecoveryActions.ts (新規・3モード救出の副作用フック S1.12b)
src/firmware-update/supportLog.ts  (新規・SupportLog型+収集+保存処理 S1.12b ★Codexレビュー10 Critical-2)
src/firmware-update/FirmwareUpdateModal.tsx (新規・Studio流)
src/firmware-update/steps/*.tsx    (新規・09のUI)
src/firmware-update/RecoveryPanel.tsx (新規・3モード救出UI S1.12b)
src/firmware-update/ja.ts          (flasher文言流用)
src/firmware-update/ProgressBar.tsx(新規・Studioに無い)
src/assets/firmware-update/**      (新規・写真/GIFアセット A1-A6。09 §3.4。実装クリティカルパス)
```

**変更（追記のみ・既存ロジック不変）**:
```
src-tauri/Cargo.toml               path依存1行 + (workspace方針次第で数行)
src-tauri/src/main.rs              invoke_handler に6コマンド + .manage(FlashState)
src-tauri/src/mod宣言(main.rs or lib) mod flash;
src-tauri/Info.plist               NSRemovableVolumesUsageDescription 追記
src/AppHeader.tsx                  MenuItem 1行 + モーダル起動
.github/workflows/release.yml      cargo test(core) + cargo check(src-tauri) 追加
```

**触らない**（回帰リスクゼロを明示）: `src-tauri/src/transport/*`、`src/proto/*`、`src/rpc/*`、既存タブUI、capabilities、CSP、entitlements。

## S1.11 状態機械（通常フローは差分なし・recovery側のみ追加）

flasher の15状態/18イベント reducer をベースに使う（`flasher machine.ts:41-80`）。R→L順序はreducerの型で構造的に強制されており（Lの状態はR完了後のswap経由でしか出現しない。`machine.ts:41-57`）、vitest 11件で裏取り済み（`flasher machine.test.ts`）。**通常フロー（R→L）の遷移には手を入れない**。Step1での追加は S1.12b の recovery 3モード分（状態3+イベント5）のみ（Codexレビュー10 Critical-3反映）。Step3で自動遷移の分岐を1本足す（S3.4）。

```
idle → fetching_manifest → show_release → downloading → r_confirm
  → r_bootloader_guide → r_flashing → swap_to_l → l_confirm
  → l_bootloader_guide → l_flashing → verify_checklist → done
（横断: blocked / error / recovery。RESET/ENTER_RECOVERYは全状態から優先）
```

## S1.12 エラー/中断ハンドリング（移植で維持）

flasherで実装済み（`flasher error.rs:10-65` / `i18n/ja.ts:35-62`）を運ぶ:

- エラーは `FlashError`（tagged enum）→ `formatError` で日本語化。特に顧客の次の行動が違う2つを分ける（`flasher i18n/ja.ts:40,42`）:
  - `NoBootloaderVolume`（タイムアウト）→「リセットを素早く2回、もう一度」
  - `MultipleBootloaderVolumes`（両側挿し）→「片方だけUSB接続」
- 中断: `flash_cancel`（`commands.rs:172-174`）でコア協調キャンセル（書込前のみ中断可）。**flasherはキャンセルボタンUI未実装**（バックエンドのみ。`BUILD_STATE.md:64`。download/flashing画面に中止ボタン自体が無い `flasher App.tsx:66-68,94-103`）→ Studio移植時に**キャンセルボタンを実装**する（09 §6.5で意匠・文言指定）。書込中は「抜かないで/閉じないで」警告（`flasher App.tsx:100`）。**具体配線（実装タスク・Codexレビュー10）**:
  - **(a) wait_for_bootloader 中（④⑦画面）**: [中止]有効。`flash_cancel` が `acquire_bootloader` の待機ループを協調中断する（cancel tokenは待機中もポーリングされる）。
  - **(b) download 中（③画面）**: 現コアの `fw_download_asset` は cancel token を受けない（`flasher commands.rs:79-89`）＝協調キャンセル不可。Step1では [中止]＝**UI即時RESET・結果破棄**の擬似中止とする（裏のDLは完走させキャッシュに残す。coreへのcancel token追加はStep1ではしない）。
  - **(c) 書込開始後（⑤⑧画面）**: [中止]を**disabled化**（グレーアウト。中途半端に止めない。`03 §3.3-5`）。
- 書込中断からの復旧: UF2はブートローダー領域を上書きしないので、失敗しても「リセット2回→焼き直し」で必ず戻れる（`03 §2.6`）。この受け皿が RecoveryPanel（S1.12b）。

## S1.12b RecoveryPanel（3モード）と support_log_export の実装設計 ★Codexレビュー10 Critical-2/3反映

`06 C6`（「ログを保存」の文言だけ先行し実体が無いUI）の再発防止として、両方を **Step1の必須実装成果物**に昇格する。現flasherの復旧UIは「最初に戻る＋サポート案内」のみ（`flasher App.tsx:154-167`）、hookの副作用も通常フロー用の central/peripheral 書込だけ（`flasher useFirmwareUpdate.ts:93-115`）で、任意の片側を選んで1回焼く独立recoveryパスは存在しない＝**これは再スキンではなく新規実装**（旧見積0.5日は過小。S1.15で上方修正済み）。

### 3モードの状態機械（machine.ts への追加分）

既存の `recovery` 状態（`flasher machine.ts:57,160`。`ENTER_RECOVERY` で全状態から到達・`RESET` で先頭へ）を入口に、**状態3つ+イベント5つ**を追加する:

```
recovery ──RECOVERY_FLASH_SIDE(side)──> recovery_waiting {side}    (ボリューム待ち/既存マウント採用)
recovery_waiting {side} ──RECOVERY_VOLUME_OK──> recovery_flashing {side}
recovery_flashing {side} ──RECOVERY_FLASH_OK──> recovery_done {side}  (→verify_checklistへ誘導)
recovery_waiting/recovery_flashing ──RECOVERY_FLASH_ERR(message)──> recovery  (エラー文言表示)
（RESET / ENTER_RECOVERY が全状態から優先される既存規則は不変）
```

- **モード1 `retry_current_step`**: 状態追加なし。`recovery` を `{ step: "recovery", from: WizardStep }` に拡張して突入元stepを保持し、[もう一度試す] は from への復帰イベントで返す（RESETで先頭に戻すのとは別導線）。
- **モード2 `flash_one_side(side)`**: 上記の新規状態3つを使う。
- **モード3 `export_support_log`**: reducerに状態不要（純UIアクション。下記）。
- vitest追加: 「recovery→片側書込→done」「片側書込失敗→recoveryへ戻る」「recovery_flashing中もRESET優先」など既存11件に追加（S1.13）。

### フック（通常ウィザードと別の副作用関数に分離）

`useFirmwareUpdate` の効果switch（通常フロー）には混ぜず、**`useRecoveryActions` を独立フック**として実装する（Codexレビュー10 追加提案）:

- `flashOneSide(side)`: `flash_wait_for_bootloader` を **baseline=[]** で呼ぶ → `acquire_bootloader` が「既にマウント済みのBoard-ID一致・単一UF2ボリューム」をそのまま採用する（`flasher volume.rs:64-95`。`06 W4` の「せっかちな顧客がガイド前にリセット済み→検出されない」トラップ対策）→ `flash_write_uf2`。**validate_uf2/SHA/アドレス窓/Board-ID preflight は通常フローと同一のコマンド経路**＝recovery経路でも安全装置を落とさない（S1.13の配線確認は両経路で行う）。
- `exportSupportLog()`: 下記 SupportLog を保存。

### support_log_export（ログ収集データ構造＋保存UI＋保存処理）

- **データ構造**: `src/firmware-update/supportLog.ts` に `SupportLog` 型を定義し、`useFirmwareUpdate` 内で逐次収集する（Codexレビュー10 指定の保存内容）:
  - 検出volumes＋**INFO_UF2全文**＋board_id — `flash_scan_volumes`/`flash_wait_for_bootloader` の返却 `VolumeEntry` が `info_uf2`/`board_id` を既に含むため **Rust追加不要**（`flasher volume.rs` の `VolumeEntry`。実コード確認済み）
  - manifest version / assets sha256（`fw_fetch_manifest` 結果）
  - step履歴（reducerのイベントログ: `{ts, step, event}` 配列）
  - FlashError JSON（発生順・日本語化前の生 `kind`/`detail` tagged enum）
  - OS（`navigator.userAgent`）・アプリ/Tauriバージョン（`@tauri-apps/api/app` の `getVersion` 等）
- **保存処理/UI**: Studio既存のJSON保存パターン `downloadJson`（Tauri save dialog + `writeTextFile`。`Studio src/keyboard/keymap-io.ts:207-219`）を流用。RecoveryPanel の [ログを保存]（09 §6.4 ③）から `support-log-YYYYMMDD-HHmm.json` として保存する。keymap-io と同経路のため **capabilities 追加は不要**（S1.4「変更なし」のまま成立）。
- 09 §6.4 の「実装 or 文言削除」の二択は**「実装する」で確定**（本節が成果物定義。文言と実体の整合はS1.13でゲート化）。

## S1.13 テスト計画（Step1）

| 層 | 内容 | 合否基準 |
|---|---|---|
| 単体(Rust) | core 35テスト（`flasher §2`） | CIで緑（S1.9） |
| 単体(TS) | machine reducer 11テスト+recovery 3モード遷移テスト（順序強制・settings_resetブロック・片側書込/失敗復帰。S1.12b） | CIで緑 |
| コンパイル | src-tauri を macOS/Windows で `cargo check` | 両OSで緑（`RealEnv` cfg両分岐がコンパイルされる） |
| **配線確認** | GUI経路で ①UF2検証 ②Board-IDゲート が実際に呼ばれるか（`06`教訓の再発防止） | 通常ウィザードと**RecoveryPanel片側焼き直し（S1.12b）の両経路**で、flash_write_uf2 到達前に validate_uf2/preflight が実行されるトレース確認。「ログを保存」ボタンが実ファイルを書くことも確認（文言先行の再発防止） |
| 実機(Mac) | 旧FW実機1台を**非開発者の手順書なし操作**で最新化 | R→L完走。故意の失敗3種（途中でケーブル抜く/違う半分をリセット/タイムアウト）から全て復帰（`03 M2`完了条件） |
| 実機(Win・M3) | Win10/11 + Defender標準環境で同テスト | 書込成功・タイミング定数の再計測（`03 §4`） |

## S1.14 実機再検証（StudioバンドルIDでのTCC再走）★必須

flasherの実機E2Eは flasher の identifier（`com.minimalkeys.flash`。`flasher tauri.conf.json:5`）で通したもの。**Studio の identifier（`com.hyhy-masa.minimal-keys-customize`。`studio-analysis §3`）では TCCプロンプトを取り直す**（TCC許可はバンドルID単位。`07 A-3`）。

再走項目:
1. Studioバンドルで `/Volumes/XIAO-SENSE` 書込時に NSRemovableVolumesUsageDescription プロンプトが出るか、**拒否したときの復帰導線**（システム設定→プライバシーへの案内）が機能するか（`03 U-3`）。
2. ad-hoc署名（Studioは `signingIdentity:"-"`。`studio-analysis §3`）は更新のたび署名同一性が変わりTCC許可が引き継がれない可能性（`02` 検証結果）→ 実機で1回確認。
3. Studio内ウィザードでR→L実機E2E（flasherと同項目）。

## S1.15 工数見積（Step1・Codexレビュー10反映で上方修正）

`07 §5` の「2〜4人日＋実機0.5日」を作業分解。**旧見積 ≈3.5〜4.5人日 は、RecoveryPanel（再スキンではなく新規実装）・support_log_export（成果物昇格）・写真/GIFアセット（実装クリティカルパス）を過小評価していたため上方修正**（Codexレビュー10 Critical-2/3・写真アセット指摘）:

| タスク | 工数 | 備考 |
|---|---|---|
| crate配置(vendoring)+**Cargo.toml standalone化(S1.2-a)**・ビルド通し | 0.5〜0.75日 | S1.2 推奨A。「無改造コピー」不成立の訂正分（Critical-1） |
| Rustコマンド層移植(flash/mod.rs)・invoke登録・Board-ID定数1本化(S1.8②) | 0.5日 | src無改造+配線+定数公開 |
| Info.plist追記・権限方針確認 | 0.25日 | S1.4 |
| フロント移植+**Studio流の再スキン**(進捗バー/モーダル/ボタン/エラー文言) | 1.0〜1.5日 | UIの作り直しがここ。09に依存 |
| キャンセルボタンUI配線(③④⑦有効/⑤⑧disabled・S1.12具体配線) | 0.5日 | flasher未実装分の補完 |
| **RecoveryPanel 3モード**(状態機械+フック+画面。S1.12b) | 1.0日 | 旧0.5日から上方修正。新規実装（Critical-3） |
| **support_log_export**(SupportLog型+収集+保存UI。S1.12b) | 0.5日 | 新規計上。downloadJson流用（Critical-2） |
| **写真/GIFアセット A1-A6**(撮影・加工・アプリ内蔵・ライト/ダーク確認) | 0.5〜1.0日 | 新規計上。実装クリティカルパス（09 §3.4）。実機写真(U-7)確定後に撮影。遅延時は暫定簡易図で先行（09 §3.4 fallback） |
| CI統合(core test + cargo check両OS) | 0.25日 | S1.9 |
| 実機再検証(TCC再走+R→L E2E+recovery経路+非開発者テスト) | 0.5日 | S1.14。ハード必須 |
| **合計** | **≈5.5〜7人日** | 旧 ≈3.5〜4.5人日から上方修正。Mac先行。Windows(M3)は別途2人日(`03 M3`) |

## S1.16 リスクと対策（Step1）

| # | リスク | 重さ | 対策 |
|---|---|---|---|
| S1-R1 | 再スキンで安全装置の配線を落とす（特にエラー日本語化・検証呼び出し） | 中 | S1.13の「配線確認」を完了ゲート化。reducer/coreは無改造でUIだけ触る原則 |
| S1-R2 | StudioバンドルIDでTCC挙動が変わる/拒否復帰が効かない | 中 | S1.14で最初に潰す。文言＋設定導線で吸収可能な種類 |
| S1-R3 | workspace合流でStudio既存ビルドの依存解決が変わる | 低〜中 | 推奨A（workspace化しない）で回避。代替B採用時のみ要検証 |
| S1-R4 | settings_reset更新を顧客が求める（拒否では不満） | 中 | MVPは人手案内（LINE/Discord・`00 決定2`）。バックアップ/復元は別作業として明示 |
| S1-R5 | Board-ID prefix重複定義のsilent divergence（検出は通るが書込で拒否、またはその逆） | 中 | `mk-flash-core::MINIMAL_KEYS_BOARD_ID_PREFIX` 公開で1本化＝移植時の**必須タスク**（S1.8②。「低リスク・推奨」から格上げ。Codexレビュー10） |
| S1-R6 | リリース列車の結合（flashバグ修正がStudio次リリース待ち） | 中 | `VITE_FEATURE_FW_UPDATE` で機能単位の無効化を可逆に（`07 A-1`） |
| S1-R7 | 写真/GIFアセットが実機写真(U-7)待ちで遅延し、④⑦画面がブロックされる | 中 | 暫定簡易図fallbackで実装を先行し、写真は差し替え可能なアセット参照にする（09 §3.4）。ただしMVP完了条件は最終写真での非開発者テスト合格 |

---

# Step3 — ワンクリック化（dfu RPC）

「接続して更新ボタンだけ」でリセット2回が要らなくなる。Step1完成後に着手（`03 §2.4` のdfu RPC設計を実装レベルに）。

## S3.0 着手前FWスパイク（先行必須・0.5日）★Codexレビュー10 追加提案反映

Step3の本実装（S3.2以降）に入る前に、**小さいFWスパイクを先に切って以下4点を実機で通す**。どれかが落ちたら設計を微修正してから本実装に進む（「動く見込み」のまま本実装に入らない）:

| # | 検証項目 | 合否基準 |
|---|---|---|
| SP-1 | **`bootload` binding解決**: 実ビルドFW上で `zmk_behavior_get_binding("bootload")` が非NULLを返すか（devicetree文字列は `bootload` 確認済み=`zmk app/dts/behaviors/reset.dtsi:18-23`。実ビルド後のbinding解決が残り） | central/peripheral両ビルドで解決 |
| SP-2 | **central自動遷移**: RPC応答→`k_work_schedule`(約200ms)→`sys_reboot(RST_UF2)` の順で、応答がUSB/BLEバッファからホストに届いてからrebootするか | Studio側でack受信→ブートローダーボリューム出現 |
| SP-3 | **L invoke時のperipheral fallthrough挙動**: `peripheral.c` の `INVOKE_BEHAVIOR` case はbehavior実行後に `break`/`return` が無く `default`→`-ENOTSUP` に落ちる構造（`zmk app/src/split/peripheral.c:32-58`。実コード確認済み）。rebootが先に走るか、transport側のエラー/ack/ログ挙動を確認 | Lがブートローダーへ落ちる。**NGならZMK fork側で `break`（または `return 0`）を追加**して再検証 |
| SP-4 | **新R×旧Lのsplit互換**: dfu入り新Rから旧LへINVOKE_BEHAVIORが通るか | 旧Lが落ちる、または「手動フォールバック」判定が正しく出る |

- スパイクの成果物: 検証ログ＋（SP-3 NG時の）fork側 `break` 追加コミット。S3.9 の見積に0.5日で計上。

## S3.1 鶏卵問題（この設計の核心・隠さず明記）★

```
自動でブートローダーに入る「受け口(dfu RPC)」は、今出荷済みのFWに存在しない。
（core RPCにreboot系なし・全カスタムモジュールにsys_rebootゼロ件。03 §2.3で全経路を潰して確認）

→ だから論理的に、こうなる:
   ①受け口の無いFWを積んだ個体  → 何をどう作っても初回は物理リセット必須(回避不能)
   ②受け口入りFWを一度でも焼いた個体 → その次の更新から全自動

つまり「ワンクリック到達」は個体ごとに:
   [受け口入りFWを配布] → 顧客がそれを(手動リセットで)1回焼く → 以後その個体は自動
```

- **回避不能**: Step1のMVPで初回手動が必要なのは実装の手抜きではなく、出荷済みFWの物理的制約（`03 §2.3`）。
- **到達時期を早める唯一のレバー = 受け口dfuを「早いFWリリース」に載せること**（S3.6）。載せるのが遅いほど、全個体が自動になる日が後ろ倒しになる。
- **最速シナリオでも2段**: 「次のFWに受け口を載せる」→「顧客が手動で1回焼く」→「その次から自動」。今日から全員自動は不可能。

## S3.2 FW側 — zmk-module-dfu-rpc（新規westモジュール）

`03 §2.4/§3.5` の設計を採用（zmk fork本体は変更不要・settings-rpcと同型のカスタムサブシステム）。置き場 `hyhy-masa/zmk-module-dfu-rpc`。

proto（`03 §3.5` より・要点）:
```proto
package zmk.dfu;
message GetFirmwareInfoRequest { bool include_peripherals = 1; }
message FirmwareInfo { uint32 source=1; string version=2; string git_rev=3;
                       string build_date=4; bool is_central=5; }
message EnterBootloaderRequest { uint32 target = 1; }  // 0=central, 1+=peripheral index
message EnterBootloaderResponse { bool acknowledged = 1; }
```

実装要点（証拠チェーンの確認状況を正確に: **ZMK fork側は `sys_reboot(RST_UF2)` まで実ソース確認済み**（`zmk behavior_reset.c:24-33` / `reset.h:10-13`）。ただし**Zephyr/nRF52側の末端＝`soc/arm/nordic_nrf/nrf52/soc.c` の `sys_arch_reboot` がGPREGRETを書く一次ソースは、ローカルに該当Zephyrソースが無く今回未検証**。`03` の結論を覆す材料は無いが、「全リンク確認済み」という従来表記はここで撤回する。実機ではSP-2で末端まで通す。Codexレビュー10反映）:
- **central向け EnterBootloader**: RPC応答を返す → `k_work_schedule`（約200ms・応答がUSB/BLEバッファから出る猶予）→ `sys_reboot(RST_UF2=0x57)`（`zmk behavior_reset.c:33,39` / `reset.h:13`）。
- **peripheral(L)向け**: `zmk_split_central_invoke_behavior(idx, &binding, event, true)` で子機だけをブートローダーへ（`zmk central.c:91`。受信は `peripheral.c:35-44` に既存）。
- **GetFirmwareInfo のL分回収**: 汎用イベントリレー（`ZMK_RELAY_EVENT_PERIPHERAL_TO_CENTRAL` / settings-rpcが実使用中の方式）。
- **U-1は一部解消（Codexレビュー10で更新）**: `behavior_dev` の実文字列は devicetree 上 `bootload` と確認できた（`zmk app/dts/behaviors/reset.dtsi:18-23`）。central payloadの `behavior_dev[16]` 長さ制限（`zmk transport/types.h:93-103`）にも収まる。**残る未確定**は (a) 実ビルド後に `zmk_behavior_get_binding("bootload")` が解決するか（SP-1）、(b) 下記fallthroughの実機挙動（SP-3）。動かなくてもL自動化だけが手動に落ち、全体は回る（`03 R10`）。
- **★peripheral fallthrough疑い（Codexレビュー10 Critical-4）**: `peripheral.c` の `INVOKE_BEHAVIOR` case はbehavior実行後に `break`/`return` が無く、そのまま `default` に落ちて `-ENOTSUP` を返す構造（`zmk app/src/split/peripheral.c:32-58`。実コードで確認済み）。bootloadではrebootが先に走る可能性が高いが、transport側のエラー扱い/ack/ログは未確認。**S3.0 SP-3で実機確認し、必要ならZMK fork側で `break`（または `return 0`）を追加する**。
- 配線: farmware/dev両リポの west.yml に1エントリ + `minimal-keys_R.conf` に `CONFIG_MK_DFU_RPC=y`。バージョン文字列は `CONFIG_MK_FW_VERSION`（CIがtagから注入）。

## S3.3 Studio側 — dfuクライアント

Studioの**既存カスタムサブシステム機構をそのまま使う**（`studio-analysis §4`）。新規transportは不要:

- `src/firmware-update/proto/dfu.ts`: encode/decode（Studio既存 `src/proto/settings.ts:7` 等と同型。`SUBSYSTEM_ID="zmk__dfu"` を定義）。
- 呼び出し: `useCustomSubsystem("zmk__dfu")` フック（`studio-analysis §4`。identifier文字列でサブシステムを引き `callRPC(payload,timeout)` を返す）。**RPC基盤は無改造で流用**（`03 §3.1`）。
- **現バージョン検出＆旧FW判定**: `CustomSubsystemsContext` に `"zmk__dfu"` が**無ければ旧FW**＝「更新推奨（受け口なし＝初回は手動）」と表示。有れば `GetFirmwareInfo` でR/Lの現バージョンを出す（`03 §3.4`）。これがStep3で初めて「更新あり/なし」バッジが正確になる理由。
- 注意: Step1の書込チャネル（MSC）とdfuのRPCチャネル（BLE/USB既存接続）は別物。dfuは既存 `ActiveConnection` 経由（`Studio transport/commands.rs:22-25`）＝有線RPCバグ（Track1）が未修正でもBLE接続で成立する（`03 §3.1`）。

## S3.4 状態機械の差分（Step1のどこに分岐を足すか）★作り直さない

Step1の reducer（S1.11）に対し、**bootloader_guide の入口に「自動遷移を試す」分岐を1本挿すだけ**。手動ガイドは削除せず**フォールバックとして残す**（`03 §2.5` の分岐原則「自動が失敗したら必ず同じ手動ガイドに落ちる」）。

```
【Step1（手動）】
 r_confirm ──CONFIRM_R──> r_bootloader_guide(手動:リセット2回) ──BOOTLOADER_R──> r_flashing

【Step3（自動・分岐を1本追加）】
 r_confirm ──CONFIRM_R──> r_enter_bootloader(dfu.EnterBootloader送信)
                              │成功(ボリューム出現) ─────────────> r_flashing
                              │失敗/旧FW/タイムアウト ──> r_bootloader_guide(既存の手動) ──> r_flashing
```

- 追加状態は `r_enter_bootloader` / `l_enter_bootloader` の2つ（と、Lはswap前にdfuで落とすなら `swap_to_l` の直前処理）。
- **既存の手動状態(`r_bootloader_guide`等)は1文字も消さない**。旧FW個体・電池切れL・splitリンク断は全部この手動へ落ちる。
- Lの自動化（`03 §2.4`）: 新Rのdfu RPC → 既存split INVOKE_BEHAVIOR で旧Lもブートローダーへ（旧Lの `peripheral.c` にも実装済み）。差し替え前にLを落としておくと `l_enter_bootloader` は即ボリューム出現。
- vitestは既存11件に「自動→失敗→手動フォールバック」の遷移テストを数件追加（reducerの新分岐分）。

## S3.5 R自動化 / L自動化 / 手動フォールバック（遷移表）

| 半分 | 受け口あり(dfu入りFW) | 受け口なし(旧FW) or 失敗時 |
|---|---|---|
| R(親機) | dfu.EnterBootloader(0) → 200ms後 sys_reboot(RST_UF2) → 自動でボリューム出現 → 書込 | 手動ガイド(リセット2回)へ自動フォールバック |
| L(子機) | 新Rのdfu経由 `zmk_split_central_invoke_behavior` でL落下 → ケーブル差替 → 即書込 | 手動ガイド(L側リセット2回)へ |

- **初回ですら手動は最悪1回(R側)で済む**見込み（新Rさえ入れば旧Lは自動落下可能。`03 §2.4`）。ただし**S3.0スパイク（SP-1〜SP-4）完了前は保証しない**（binding解決・peripheral fallthrough・新旧split互換が未検証のため）。
- 手動フォールバックは常設＝**行き止まりを作らない**（`03 §2.5`）。

## S3.6 受け口FWの配布タイミング戦略（到達時期の設計）

「いつ受け口を配るか」で全個体自動化の日が決まる。選択肢:

| 戦略 | 内容 | ワンクリック到達 | 背反 |
|---|---|---|---|
| **A: 次のFWリリースに即載せる**(推奨) | dfuモジュールを次回FW更新に同梱。顧客はStep1(手動)でそれを焼く | 最速。その顧客の**次の次**の更新から自動 | dfu実装(U-1解決含む)を次リリースに間に合わせる必要 |
| B: 専用の「受け口だけ更新」を先行配布 | 機能追加なしでdfuだけ入れたFWを配る | Aとほぼ同じ | 顧客に「中身が変わらない更新」を焼かせる説得コスト |
| C: 様子見(Step1運用が安定してから) | 当面Step1手動のみで回す | 後ろ倒し | 手動運用が長引く |

- **推奨A**。Step1が出た直後の最初のFWリリースにdfuを載せる。そうすれば「Step1で一度手動更新した顧客」が、その次から自動になる。
- **告知連動**（`00 決定2`）: 「今回の更新には次回から自動化する準備が入っています」とLINE/Discordで伝えると、手動1回の納得感が上がる。

## S3.7 変更/新規ファイル一覧（Step3）

**新規（FW側リポ）**: `zmk-module-dfu-rpc/**`（proto/handler/Kconfig/module.yml。zmk fork本体は不変）。
**変更（FW配布）**: farmware/dev の west.yml 各1行、`minimal-keys_R.conf` に `CONFIG_MK_DFU_RPC=y`、CIにバージョン注入。
**新規（Studio）**: `src/firmware-update/proto/dfu.ts`。
**変更（Studio・追記のみ）**: `machine.ts`（`r_enter_bootloader`/`l_enter_bootloader` 分岐追加）、`useFirmwareUpdate.ts`（dfu呼び出し）、`FirmwareUpdateModal`（自動/手動の画面出し分け）、`machine.test.ts`（フォールバック遷移テスト追加）。
**触らない**: Rust flashコア（MSC書込はdfuと無関係）、transport層、Studio既存RPC。

## S3.8 テスト計画（Step3）

| 内容 | 合否基準（`03 M4`） |
|---|---|
| 新FW同士 | メニューから完了まで**手動リセット0回**（ケーブル差し替えのみ） |
| 旧L×新R混在 | L自動遷移が動く（U-1解決前提） |
| splitリンク断 | 手動フォールバックに落ちる（行き止まりなし） |
| 電池切れL | `peripheral_connected==false` 検出→「Lに給電して手動で」ガイド（`03 R9`） |
| S3.0スパイク4項目 | SP-1〜SP-4が**着手前**に緑（S3.0。M4冒頭ではなく本実装前に完了していること） |

## S3.9 工数見積（Step3・S3.0スパイク追加で更新）

`03 M4` = 3人日 に S3.0スパイクを加えて **3.5人日**（Codexレビュー10 追加提案反映）。内訳:
- **S3.0 着手前FWスパイク**(SP-1〜SP-4。SP-3 NG時のfork側 `break` 追加含む): 0.5日
- FW dfuモジュール実装: 1.5日
- Studio dfuクライアント(proto/フック/状態機械分岐): 1.0日
- 実機E2E(新旧混在・フォールバック): 0.5日

## S3.10 リスクと対策（Step3）

| # | リスク | 重さ | 対策 |
|---|---|---|---|
| S3-R1 | **鶏卵**: 受け口を配るまで全個体が自動化されない | 構造的(不可避) | S3.6 推奨A(次リリース即載せ)+告知。設計の前提として受容 |
| S3-R2 | S3.0スパイクNG（binding解決不可 / peripheral fallthroughでinvoke不達）でL自動化が動かない | 低〜中 | SP-3ならfork側 `break`/`return 0` 追加で対処可。最悪Lだけ手動フォールバックで全体は回る（`03 R10`） |
| S3-R3 | 新R×旧Lでsplitリンクが張れず検証が偽陰性 | 中 | 「L検証失敗」を「Lの更新に進んでください」に文言設計。混在は正常状態と定義（`03 §8.1③`） |
| S3-R4 | dfu応答前にreboot（200ms猶予不足） | 低 | `k_work_schedule` 遅延を実機で調整。応答ackを見てからのフォールバック |
| S3-R5 | splitプロト互換が切れるリリース | 中 | `requires_settings_reset`+notes_jaで明示。QAに新R×旧L試験を必須化 |

---

## 確認できなかった前提（実機/実ビルド/まさかず判断が要る）

| # | 未確定 | 確定方法 | 影響 |
|---|---|---|---|
| U-A | StudioバンドルIDでのTCC挙動・拒否復帰（ad-hoc署名の許可持続含む） | S1.14実機 | Step1初回UX |
| U-B | 推奨A+S1.2-a standalone化後にStudio既存ビルドが壊れないか | ローカルビルド1回（core `cargo test` 35件+`tauri build`） | Step1着手直後 |
| U-C | Board-ID実測値（`Seeed_XIAO_nRF52840` prefixで各出荷ロットが一致するか） | 実機INFO_UF2.TXT cat（flasherはM1で確認済＝`Seeed_XIAO_nRF52840_Sense`。`flasher BUILD_STATE.md:15`。他ロット差は要確認） | ②Board-IDゲート |
| U-D | U-1の残り: 実ビルドでの `bootload` binding解決＋peripheral fallthrough実機挙動（文字列自体は `bootload` とdevicetreeで確認済み＝一部解消。`zmk reset.dtsi:18-23`。Codexレビュー10） | S3.0スパイク SP-1/SP-3 | Step3のL自動化のみ |
| U-G | Zephyr側 `sys_arch_reboot`→GPREGRET書込の一次ソース（ローカルzmkに該当Zephyrソース無し・未検証。Codexレビュー10） | S3.0スパイク SP-2 が実機で通れば実用上確定 | Step3のR自動化 |
| U-E | settings_reset(GATT変更)更新をアプリで扱うか（バックアップ/復元の実現性） | `00 決定1` の実機スパイク（各カスタムRPCのget/set可否） | Step1では拒否のまま。別作業 |
| U-F | 受け口dfuを次FWリリースに載せる合意・タイミング | まさかず判断 | Step3のワンクリック到達時期 |

## 正直な総括

- Step1の骨格は「動いている安全な機能の引っ越し」で、新規リスクは主に**再スキンで配線を落とすこと**と**バンドルID差のTCC**。どちらもゲート化で潰せる。ただし**「真の新規発明はゼロに近い」は言い過ぎだったため撤回**する: RecoveryPanel 3モード・support_log_export・写真/GIFアセットは引っ越しではなく新規実装であり、見積を ≈5.5〜7人日 に上方修正した（S1.15。Codexレビュー10）。
- Step3は道の大半をソースで裏取り済みだが、**「全リンク確認済み」ではない**（Zephyr側GPREGRET末端=U-G、実ビルドbinding解決=SP-1、peripheral fallthrough=SP-3 が残る）。だから本実装前に S3.0スパイクを必須とした。**鶏卵問題は設計で消せない**。「全員がいきなり自動」は売り文句にできない。「一度手動で受け口を焼けば、次から自動」が正直な言い方。
- settings_reset(GATT変更)更新だけは Step1/Step3 の枠外に残る（バックアップ/復元が別課題）。ここを「更新機能」に含めると見積もりが大きく動くので、スコープを明確に分けること。

## 改訂履歴（2026-07-09・Codexレビュー10反映）

OpenAI Codex 独立レビュー（`10-codex-review-of-detailed-design.md`）の全指摘を反映。まさかず承認済み。

- **Critical-1（vendoring「無改造コピー」の誤り訂正）**: `mk-flash-core`/`mk-flash-cli` の Cargo.toml は flasher親workspace継承（`flasher Cargo.toml:1-16` / `crates/mk-flash-core/Cargo.toml:4-13`）に依存し、Studio（単一crate・workspace無し）への「無改造コピー」ではコンパイル不能。推奨A（root workspace非導入）を確定とし、**S1.2-a「Cargo.toml standalone化」タスク（0.25日・Cargo.toml 2ファイルのみ・src無改造・35テストで等価性確認）を必須追加**。§1・S1.1・S1.10・サマリー・総括の「無改造」表記を全て訂正。
- **Critical-2（support_log_export の成果物化）**: 「ログ収集データ構造（SupportLog型）＋保存UI＋保存処理」を S1.12b として設計し、S1.5/S1.10 の新規ファイル一覧に `supportLog.ts` を明記（`06 C6` 文言先行バグの再発防止）。保存内容=検出volumes/INFO_UF2全文/manifest version・assets sha/step履歴/FlashError JSON/OS・Tauri・appバージョン。保存は Studio既存 `downloadJson`（`keymap-io.ts:207-219`）流用・capabilities追加不要。INFO_UF2全文は `VolumeEntry.info_uf2` が既に返すためRust追加不要（実コード確認）。
- **Critical-3（RecoveryPanel 3モードの設計と見積訂正）**: S1.12b に `retry_current_step` / `flash_one_side(side)` / `export_support_log` の3モードを状態機械（状態3+イベント5追加）・フック（`useRecoveryActions`＝通常ウィザードと別の副作用関数）まで設計。`flash_one_side` は baseline=[] で `acquire_bootloader` の既存マウント済み単一ボリューム採用（`volume.rs:64-95`）を使用。旧「キャンセル+RecoveryPanel 0.5日」を分解し RecoveryPanel単体 1.0日 へ上方修正。
- **Critical-4（Step3 L自動化のfallthrough）**: `peripheral.c` の `INVOKE_BEHAVIOR` case が break無しで `default`→`-ENOTSUP` に落ちる構造（`zmk peripheral.c:32-58`）を S3.2 に明記。**S3.0「着手前FWスパイク」節を新設**（SP-1 binding解決 / SP-2 central応答到達 / SP-3 fallthrough確認・必要ならfork側break追加 / SP-4 新R×旧L互換）。S3.9 を 3人日→3.5人日 に更新。
- Board-ID prefix重複（`commands.rs:21-23` と `machine.rs:80-88`）→ `mk-flash-core::MINIMAL_KEYS_BOARD_ID_PREFIX` 公開による1本化を必須タスク化（S1.8②）。S1-R5 の重さを 低→中 に格上げ。
- `behavior_dev="bootload"` は devicetree（`reset.dtsi:18-23`）で確認済み＝U-1を「一部解消」に更新（残り=実ビルドbinding解決とfallthrough実機挙動。U-D改訂）。
- GPREGRET末端（Zephyr `sys_arch_reboot`）はローカル未検証と明記し「全リンク確認済み」を撤回（S3.2・総括・U-G新設）。
- キャンセルUIの具体配線を S1.12 に追加: (a) wait_for_bootloader中=有効 (b) download中=UI即時RESET・結果破棄の擬似中止（`fw_download_asset` にcancel token無し） (c) 書込開始後=disabled化。
- 写真/GIFアセット A1-A6 を S1.15 の独立タスク（0.5〜1.0日）として計上、S1-R7（アセット遅延→暫定簡易図fallback）を追加。
- Step1工数見積を **≈3.5〜4.5人日 → ≈5.5〜7人日** に上方修正（S1.15）。S1.13 に recovery経路の配線確認とログ保存の実体確認を追加。
