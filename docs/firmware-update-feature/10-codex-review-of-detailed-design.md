# Codex 独立レビュー（第3の目）— 08/09 詳細設計

OpenAI Codex による独立レビュー（2026-07-09、実コード裏取り）。対象= Fable5 の
`08-detailed-design-mvp-and-oneclick-fable5.md` / `09-uiux-design-fable5.md`。
固定前提（案A・A-1 vendoring・Step1→Step3）は再議論せず、実装レベルの正誤だけを見た。

---

## CONFIRMED（同意できる部分）

- **Tauriコマンド登録の罠は実在する。** Studioデスクトップ実体は `src-tauri/src/main.rs` の Builder で、既存invokeはtransport系6個だけ（`/Users/masakazuhayata/claude-code/minimal-keys-studio/src-tauri/src/main.rs:14-30`）。`lib.rs` は空のBuilderスタブで既存コマンド登録が無い（`/Users/masakazuhayata/claude-code/minimal-keys-studio/src-tauri/src/lib.rs:1-6`）。08の「lib.rsではなくmain.rsへ追記」は正しい。
- **6追加コマンド名は既存6個と衝突しない。** Studio既存は `transport_send_data` / `transport_close` / `gatt_*` / `serial_*`（`/Users/masakazuhayata/claude-code/minimal-keys-studio/src-tauri/src/main.rs:23-30`）。flasher側は `fw_fetch_manifest` / `fw_download_asset` / `flash_scan_volumes` / `flash_wait_for_bootloader` / `flash_write_uf2` / `flash_cancel`（`/Users/masakazuhayata/farmware/minimal-keys-flash/src-tauri/src/main.rs:12-19`）。
- **06で問題だったGUI安全ゲート漏れは、現在のflasher実コードではかなり修正済み。** GUIコマンド `flash_write_uf2` は書込直前に `validate_uf2` を呼び、SHA/アドレス窓も渡している（`/Users/masakazuhayata/farmware/minimal-keys-flash/src-tauri/src/commands.rs:124-166`）。Board-ID preflightも `flash_uf2` 冒頭で走る（`/Users/masakazuhayata/farmware/minimal-keys-flash/crates/mk-flash-core/src/machine.rs:166-169`, `:248-265`）。
- **5安全装置のうち、settings_resetを除く中核4つは実装の芯がある。** 単一ボリューム/既存マウント採用は `acquire_bootloader`（`/Users/masakazuhayata/farmware/minimal-keys-flash/crates/mk-flash-core/src/volume.rs:64-95`）、単一飛行は `BusyGuard`（`/Users/masakazuhayata/farmware/minimal-keys-flash/src-tauri/src/commands.rs:47-64`）、settings_resetはMVPでハードブロックされる（`/Users/masakazuhayata/farmware/minimal-keys-flash/src/wizard/machine.ts:108-114`）。
- **CIでmacOS/Windows両方のRust cfgを明示的に通す、という08の提案は妥当。** Studio現行CIのtest jobはUbuntuで `npm ci/lint/test/build` のみ（`/Users/masakazuhayata/claude-code/minimal-keys-studio/.github/workflows/release.yml:15-28`）。Tauri buildはmacOS/Windows matrixで走るが（同 `:30-65`）、失敗検出がrelease build寄りなので、移植時は `cargo check` を別ゲートにする方が安全。
- **Step3の基本チェーンはZMK fork上で成立している。** `bootloader: bootload` は `type = <RST_UF2>`（`/Users/masakazuhayata/farmware/zmk/app/dts/behaviors/reset.dtsi:18-23`）、`RST_UF2` は `0x57`（`/Users/masakazuhayata/farmware/zmk/app/include/dt-bindings/zmk/reset.h:10-13`）、reset behaviorは `sys_reboot(cfg->type)` を呼ぶ（`/Users/masakazuhayata/farmware/zmk/app/src/behaviors/behavior_reset.c:24-33`）。centralからperipheralへbehaviorを送るAPIも存在する（`/Users/masakazuhayata/farmware/zmk/app/src/split/central.c:91-120`）。
- **09のStudio UI基盤認識は概ね正しい。** Tailwind tokenは `light-dark()` + oklch中心（`/Users/masakazuhayata/claude-code/minimal-keys-studio/tailwind.config.js:16-30`）、`react-aria-components` と `lucide-react` は依存済み（`/Users/masakazuhayata/claude-code/minimal-keys-studio/package.json:31-35`）、GenericModalも既存（`/Users/masakazuhayata/claude-code/minimal-keys-studio/src/GenericModal.tsx:9-15`）。

## 要修正（誤り・過小評価）

- **Critical: 08の「推奨A = workspace化しない + core無改造コピー」は、そのままではコンパイル不能。** flasherの `mk-flash-core` は `version.workspace` / `edition.workspace` / `serde = { workspace = true }` 等に依存している（`/Users/masakazuhayata/farmware/minimal-keys-flash/crates/mk-flash-core/Cargo.toml:4-13`）。その親workspace定義はflasherルートにある（`/Users/masakazuhayata/farmware/minimal-keys-flash/Cargo.toml:1-16`）。一方Studioの `src-tauri/Cargo.toml` は単一crateでworkspace定義が無い（`/Users/masakazuhayata/claude-code/minimal-keys-studio/src-tauri/Cargo.toml:1-40`）。対策は二択: Studioルートworkspaceを導入するか、移植時に `mk-flash-core/Cargo.toml` と `mk-flash-cli/Cargo.toml` の workspace継承を通常値へ直す。08の「無改造」は修正が必要。
- **Critical: support_log_export はまだ実装ではなく要件。08の実装リストにバックエンド/フックが無い。** flasherのTauri登録は6コマンドだけでログ保存コマンドは無い（`/Users/masakazuhayata/farmware/minimal-keys-flash/src-tauri/src/main.rs:12-19`）。現flasherのrecovery画面も「最初に戻る」とサポート連絡だけで、ログ保存ボタンは無い（`/Users/masakazuhayata/farmware/minimal-keys-flash/src/App.tsx:154-167`）。09は「実装 or 文言削除」と警告できているが（設計文）、08の新規/変更ファイル一覧には `support_log_export` 相当が無い。C6再発を避けるには、Step1の必須成果物として「ログ収集データ構造 + 保存UI + 保存処理」を明記すること。
- **Critical: RecoveryPanel強化の工数が過小。** 現flasherの復旧UIはまだ最小（`/Users/masakazuhayata/farmware/minimal-keys-flash/docs/BUILD_STATE.md:61-64`）。現hookの副作用は通常フロー用の `central/peripheral` 書込だけで、任意の片側を選んで1回焼く独立recoveryパスは無い（`/Users/masakazuhayata/farmware/minimal-keys-flash/src/useFirmwareUpdate.ts:93-115`）。09の「片方だけ書き直す」「ログを保存」「R/L取り違え診断」は、単なる再スキンではなく状態機械/フック/画面の追加実装。08の「キャンセルボタン+RecoveryPanel強化 0.5日」は楽観的。
- **Board-ID prefixが実際に2箇所へ重複している。低リスク扱いは甘い。** GUI待機側は `commands.rs` の `BOARD_ID_PREFIX`（`/Users/masakazuhayata/farmware/minimal-keys-flash/src-tauri/src/commands.rs:21-23`）、書込直前preflight側は `FlashConfig::default()` 内の文字列（`/Users/masakazuhayata/farmware/minimal-keys-flash/crates/mk-flash-core/src/machine.rs:80-88`）。片方だけ変わると「検出は通るが書込で拒否」または逆が起きる。`mk-flash-core` に `MINIMAL_KEYS_BOARD_ID_PREFIX` を公開して1本化すべき。
- **Step3のL自動化は「動く見込み」止まり。peripheral handlerにfallthroughがある。** `peripheral.c` は `INVOKE_BEHAVIOR` case内でbehaviorを実行するが、`break` が無くそのまま `default` に落ちて `-ENOTSUP` を返す構造に見える（`/Users/masakazuhayata/farmware/zmk/app/src/split/peripheral.c:32-58`）。bootloaderではrebootが先に走る可能性が高いが、transport側のエラー扱い/ログ/ack挙動は未確認。Step3着手前にここを実機で確認し、必要ならZMK fork側で `break` / `return 0` を入れるべき。
- **Step3の「behavior_devは未確定U-1」は一部だけ古い。** devicetree上の実文字列は `bootload` と確認できる（`/Users/masakazuhayata/farmware/zmk/app/dts/behaviors/reset.dtsi:18-23`）。centralのpayloadは `behavior_dev[16]` で（`/Users/masakazuhayata/farmware/zmk/app/include/zmk/split/transport/types.h:93-103`）、`bootload` は長さ制限にも収まる。ただし `zmk_behavior_get_binding()` で実ビルド後に解決できるか、上記fallthroughを含めた実機確認は必須。
- **Zephyr/nRF52のGPREGRET末端はこの環境では再確認できなかった。** ZMK fork側の `sys_reboot(RST_UF2)` までは確認済み（`/Users/masakazuhayata/farmware/zmk/app/src/behaviors/behavior_reset.c:29-33`）。ただしローカルの `/Users/masakazuhayata/farmware/zmk` には該当Zephyr `soc/arm/nordic_nrf/nrf52/soc.c` が無く、`sys_arch_reboot` がGPREGRETを書いている一次ソースまでは未検証。03の結論を覆すものではないが、08の「全リンクを今回も確認済み」とは書かない方が正確。
- **UI token整合に穴がある。** 09は既存Toastを success/error/info として扱うが、実際のTailwind定義にある意味色は `success` だけ（`/Users/masakazuhayata/claude-code/minimal-keys-studio/tailwind.config.js:16-30`）。Toast実装は `bg-error text-error-content` / `bg-info text-info-content` も使っている（`/Users/masakazuhayata/claude-code/minimal-keys-studio/src/misc/Toast.tsx:42-48`）。更新UIでwarning/errorを増やす前に、既存Toast色も含めてtokenを定義する必要がある。
- **GenericModalの「既存幅に準拠」は曖昧。** `GenericModal` 本体は padding/rounded/backgroundのみで幅制約を持たない（`/Users/masakazuhayata/claude-code/minimal-keys-studio/src/GenericModal.tsx:11-15`）。既存利用側が `max-w-*` を個別に渡している（例: `/Users/masakazuhayata/claude-code/minimal-keys-studio/src/AppHeader.tsx:77`）。ファーム更新Modalは、写真/GIFが入るため `max-w` / mobile時幅 / 縦スクロールを09側で明示した方がよい。
- **写真/GIFアセットは「見た目の作り込み」ではなく実装クリティカルパス。** 現flasherのbootloader guideはテキスト1行だけ（`/Users/masakazuhayata/farmware/minimal-keys-flash/src/App.tsx:91-93`）。09のA1〜A4は実写/オーバーレイ/GIFを要求しているが、08のStep1見積には撮影・加工・アプリ内蔵・ライト/ダーク確認の作業が明示されていない。UX-1を「最初のボトルネック」と書くなら、S1.15の見積にも別タスクとして入れるべき。
- **キャンセルUIはバックエンドだけ。** `flash_cancel` はある（`/Users/masakazuhayata/farmware/minimal-keys-flash/src-tauri/src/commands.rs:172-174`）が、現flasherのdownload/flashing画面に中止ボタンは無い（`/Users/masakazuhayata/farmware/minimal-keys-flash/src/App.tsx:66-68`, `:94-103`）。09のワイヤーに `[中止]` を置くなら、実装タスクに「書込開始後はdisabled化」「download中のcancel可否」「wait_for_bootloader中のcancel」の具体配線を追加すること。

## 追加提案

- vendoring方針は「推奨A（workspace化しない）」を維持するなら、移植前に `mk-flash-core` / `mk-flash-cli` のCargo.tomlをstandalone化する小タスクをStep1.2に追加する。逆にroot workspaceを作るなら、08の代替BとしてCargo.lock一本化の影響を受け入れる。
- `BOARD_ID_PREFIX` は `mk-flash-core::MINIMAL_KEYS_BOARD_ID_PREFIX` として公開し、`FlashConfig::default()` とTauri `acquire_bootloader` の両方が同じ定数を参照する形にする。
- RecoveryPanelは最低限3モードに分ける: `retry_current_step`、`flash_one_side(role)`、`export_support_log`。通常ウィザードとは別の副作用関数にし、既存マウント済みの単一UF2ボリューム採用（`acquire_bootloader`）を必ず使う。
- support logは「検出volumes、INFO_UF2全文、manifest version/assets sha、実行step履歴、FlashError JSON、OS/Tauri/app version」をJSONで保存する。Studioには既にTauri側のJSON保存パターンがある（`/Users/masakazuhayata/claude-code/minimal-keys-studio/src/keyboard/keymap-io.ts:207-219`）ので、UI保存自体は流用できる。
- Step3は最初に小さいFWスパイクを切るべき。検証項目は `bootload` binding解決、central `k_work_schedule` 後のRPC応答到達、L invoke時のperipheral fallthrough挙動、新R×旧Lのsplit互換の4点。
- 09の写真/GIFは、実物撮影が遅れる場合の暫定fallback（高解像度写真なしでも出せる簡易図）を定義する。ただし顧客向けMVPの完了条件には、最終写真アセット実装後の非開発者テストを含める。

## 総括

A統合・vendoring・Step1→Step3の方針は妥当。08/09は前回06の事故をかなり反映しており、特に「settings_resetはMVPで拒否」「GUI経路で安全装置を落とさない」という方向は正しい。

ただし、このまま実装開始すると最初に詰まる点がある。**最大の誤りは、flasher coreを「無改造コピー」できるという前提**。現実の `mk-flash-core` はworkspace継承Cargo.tomlなので、08の推奨Aと矛盾している。次に、RecoveryPanel/support_log/photo assetはUI文言以上の実装量があり、見積に十分入っていない。

### Critical issues before implementation

1. `mk-flash-core` / `mk-flash-cli` のCargo workspace継承をどう処理するか決める。
2. `support_log_export` を実装成果物に入れるか、UI文言から完全に消すか決める。
3. RecoveryPanelの片側焼き直し・ログ保存・取り違え診断を状態機械/フックまで設計する。
4. Step3のL自動化は `peripheral.c` fallthroughを含め、実機スパイクを先に通す。

この4点を直さないまま「移植だけ」と見なすと、またGUI経路だけ穴が空く。
