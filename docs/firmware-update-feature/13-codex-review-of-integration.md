## R1: Rust/Tauri安全層（Codex GPT-5.6）

### 結論

R1は不合格です。書込前SHA検証が空文字でfail-openになるため、rcタグ前にfail-closedへ直すべきCriticalが1件あります。単独版`commands.rs`からStudio版`flash/mod.rs`への書き直しで落ちた安全ゲートはなく、実差分はBoard-ID定数の参照元一本化だけでした。vendored coreのRustソース差分にも副作用は見つかりませんでした。

レビューは指定どおりread-onlyで行い、ビルド・テスト・gitコマンドは実行していません。

### 指摘

- `src-tauri/src/flash/mod.rs:140` / `sha256 == ""`のとき`expected_sha256`を設定せず、構造・familyID・アドレス窓だけ通る別内容のUF2を`flash_uf2`へ渡せます。現状の通常経路は`src/firmware-update/useFirmwareUpdate.ts:174`、recovery経路は`src/firmware-update/useRecoveryActions.ts:77`で`asset.sha256`を渡しますが、両方ともasset不在時は空文字へ落ちます。ダウンロード時検証後のキャッシュ差し替え、将来のフロント回帰、直接invokeのいずれでも書込直前SHAゲートが素通りするため、Rust側で空文字・欠落をエラーにするfail-closedが必要です / Critical
- `src-tauri/src/flash/mod.rs:143` / manifestの`target_addr_min`または`target_addr_max`が不正な16進文字列でも、`parse_hex_u32`の`None`をエラーにせず既定窓へ黙ってフォールバックします。manifestが意図した狭い窓より広い`0x27000..0xF4000`で検証され、壊れたmanifestのアドレス制約を検知できません。既定窓自体はブートローダー上端を越えませんが、manifest指定値が存在する場合のparse失敗は書込前に拒否すべきです（max側も同ファイル`:146`） / Major
- `src-tauri/src/flash/mod.rs:102` / 待機開始時の`cancel.reset()`と`flash_cancel`が競合し、開始直後に中止した場合はcancelが先に立った後でresetされ、最大60秒の待機がバックグラウンドに残ります。その間BusyGuardが次の待機・書込を拒否するため、ユーザーが「中止→やり直す」を選んでも復帰できません / Major
- `src-tauri/src/flash/mod.rs:169` / Rust側は実行中phaseを持たず、書込中でも`flash_cancel`を無条件に受け付けます。UIは通常・recovery書込画面で中止をdisabledにしていますが、フロント回帰または直接invokeでcancelされると、permission-denied後の再試行直前に`crates/mk-flash-core/src/machine.rs:179`が`Cancelled`を返し、書込開始後は最後まで走らせる契約をバックエンドが強制できません / Major
- `src/firmware-update/useFirmwareUpdate.ts:146` / scan結果はbaseline作成だけに使われ、support logへ記録されません。複数ボリュームや既存の異物UF2が原因で`acquire_bootloader`が失敗した場合、`supportLog.ts:42`が掲げる「scan + acquired」のうちscan側の`INFO_UF2.TXT`・Board-IDが欠落し、顧客環境の衝突原因をログから裏取りできません / Major
- `src-tauri/src/flash/mod.rs:76` / `fw_download_asset`はBusyGuard対象外で、同名assetへの多重invokeは`crates/mk-flash-core/src/download.rs:62`の同一キャッシュファイル書込を競合させます。現行通常フローは直列で、後段SHA検証もあるため誤書込には直結しませんが、並行呼出し時の結果は保証されません / Deferred

### 必須質問1: `10-codex-review-of-detailed-design.md`答案チェック

「要修正」11項目を1件ずつ確認しました。

| # | 要修正提案 | 判定 | HEADの根拠 |
|---|---|---|---|
| 1 | `mk-flash-core` / `mk-flash-cli`のCargo standalone化 | 合格 | `crates/mk-flash-core/Cargo.toml:4`でworkspace継承を通常値へ変更し、依存も同`:12-19`で明示。CLIも`crates/mk-flash-cli/Cargo.toml:4-8`で通常値化。Studioからdownload featureを`src-tauri/Cargo.toml:32`で有効化 |
| 2 | support logを実装成果物にする | 一部不合格 | 保存処理は`src/firmware-update/supportLog.ts:85-96`、UIは`src/firmware-update/RecoveryPanel.tsx:141-160`に実在。ただしscanしたvolumeの記録が`src/firmware-update/useFirmwareUpdate.ts:146-153`で欠落（指摘Major） |
| 3 | RecoveryPanelを片側焼き直し・ログ保存・診断まで実装 | 合格 | 3モードのactionは`src/firmware-update/useRecoveryActions.ts:32-35`、片側再取得・書込は同`:45-86`、Panelは`src/firmware-update/RecoveryPanel.tsx:110-162` |
| 4 | Board-ID prefixをcore公開定数へ一本化 | 合格 | 定義は`crates/mk-flash-core/src/machine.rs:69-75`、書込側default参照は同`:88-93`、検出側参照は`src-tauri/src/flash/mod.rs:105-109` |
| 5 | Step3 peripheral handler fallthroughを実機確認・必要なら修正 | 今回対象外 | 元提案は`docs/firmware-update-feature/10-codex-review-of-detailed-design.md:25`。本HEADの対象はStudio統合で、Step3のFW変更は含まれません。R1合否・件数には算入しません |
| 6 | Step3 `bootload` binding解決等を実機確認 | 今回対象外 | 元提案は`docs/firmware-update-feature/10-codex-review-of-detailed-design.md:26`。Studio R1の実装対象外で、実機確認も本レビューの禁止事項です |
| 7 | GPREGRET末端を未確認と明記 | 合格（記述上） | 元レビュー自身が未確認を`docs/firmware-update-feature/10-codex-review-of-detailed-design.md:27`に明記。HEADへ入れるコード修正提案ではありません |
| 8 | error / info / warning tokenを定義 | 合格 | `tailwind.config.js:31-38`にerror・warning・info・dangerと各content色を定義 |
| 9 | firmware modalの幅・mobile幅・縦scrollを明示 | 合格 | `src/firmware-update/FirmwareUpdateModal.tsx:420`に`w-[min(560px,92vw)] max-h-[85vh] overflow-y-auto` |
| 10 | 写真/GIF assetを実装クリティカルパスに含める | 合格 | 実assetを`src/firmware-update/FirmwareUpdateModal.tsx:12-13`でimportし、同`:420`のscroll可能modal内で表示。`src/assets/fw-reset-right.webp`と`src/assets/fw-reset-left.webp`も実在 |
| 11 | cancel UIをDL・待機へ配線し、書込中disabled | 一部不合格 | DLは`src/firmware-update/FirmwareUpdateModal.tsx:255-264`、待機は同`:289-302`、書込disabledは同`:307-320`。ただしRust側のphase強制と開始直後cancel競合が未解決（指摘Major 2件） |

追加提案のうち重複しない内容も確認しました。support logのmanifest/version/hash・step履歴・raw error・OS/app/Tauri情報は`src/firmware-update/supportLog.ts:31-47,85-96`に実装済みですが、上記のとおりscan volumeだけ不足しています。Recovery actionを通常flowと別hookにする提案は`src/firmware-update/useRecoveryActions.ts:1-10`で実装済みです。Step3のFW spikeと撮影遅延時fallbackは現Studio R1の対象外です。

したがって必須質問1は「該当なし＝安全」ではありません。未完了はsupport logのscan記録とRust cancel契約です。SHA fail-openとアドレス窓parse fail-openは今回新たに確認した追加指摘です。

### 必須質問2: 単独版`commands.rs`対Studio版`flash/mod.rs`

両実物を全文`diff -u`で照合しました。差分は次の1点だけです。

- 単独版`src-tauri/src/commands.rs:21-23`のローカル`BOARD_ID_PREFIX`を削除し、Studio版は`src-tauri/src/flash/mod.rs:9-12`でcore公開定数をimport、同`:105-109`で使用。

それ以外のコマンド署名、BusyGuard、app cache、spawn_blocking、baseline、timeout、cancel、`validate_uf2`、SHA/アドレス窓、`FlashConfig::default()`、progress転送、エラー変換は同一です。書き直しで落ちた安全ゲート・挙動差は**該当なし＝安全**です。ただし両版に共通して存在するfail-openとcancel問題は上の指摘に計上しました。

### 必須質問3: vendored core差分

Rustソース8ファイルを単独版と全文照合しました。

- 完全一致: `download.rs`、`volume.rs`、`uf2.rs`、`manifest.rs`、`fsops.rs`、`error.rs`
- `machine.rs`: `crates/mk-flash-core/src/machine.rs:69-75`へ定数を抽出し、同`:92`とテストの文字列リテラルを同定数へ置換しただけ
- `lib.rs`: `crates/mk-flash-core/src/lib.rs:22-25`で同定数をre-exportしただけ

値は単独版の実文字列`"Seeed_XIAO_nRF52840"`と一致し、検出側と書込側が同じ定数を参照します。定数抽出による副作用は**該当なし＝安全**です。

Cargo差分は意図したstandalone化です。単独版rootのworkspace package/dependency値（version 0.1.0、edition 2021、MIT、repository、serde derive、serde_json 1、sha2 0.10、thiserror 1）とStudioの`crates/mk-flash-core/Cargo.toml:7-19`は一致します。元にdev-dependencies・profile定義はなく、欠落もありません。CLIも同様に通常値化され、`src-tauri/Cargo.toml:32`のdownload featureも有効です。

### 必須質問4: §4-1チェックリスト裏取り

| §4-1項目 | 判定 | 根拠 |
|---|---|---|
| `validate_uf2`が全書込経路で呼ばれる | 一部不合格 | 通常・recoveryは共通コマンド`src-tauri/src/flash/mod.rs:120-165`を通り、CLIも`crates/mk-flash-cli/src/main.rs:116,185`で事前検証。ただしSHAだけは同`flash/mod.rs:140-142`で空文字時に無効化（Critical） |
| manifest SHA・窓がフロント→Rustへ届き、既定窓が生きる | 一部不合格 | 通常は`src/firmware-update/useFirmwareUpdate.ts:170-177`、recoveryは`src/firmware-update/useRecoveryActions.ts:73-80`。既定窓は`crates/mk-flash-core/src/uf2.rs:48-54`。空SHAと不正hexのfail-openが残る |
| Board-ID TOCTOU preflight＋定数両参照 | 合格 | 検出側`src-tauri/src/flash/mod.rs:105-109`、write default`crates/mk-flash-core/src/machine.rs:88-93`、書込直前再読`crates/mk-flash-core/src/machine.rs:171-174,253-269` |
| `acquire_bootloader`のbaseline・既存mount採用 | 合格 | coreの採用ロジック`crates/mk-flash-core/src/volume.rs:64-95`。通常baselineは`src/firmware-update/useFirmwareUpdate.ts:146-151`、recoveryは`src/firmware-update/useRecoveryActions.ts:60-67`の`baseline: []` |
| `commands.rs`対`flash/mod.rs`全差分 | 合格 | 実差分は`src-tauri/src/flash/mod.rs:12,108`のcore定数参照だけ。安全ゲート・エラー変換差なし |
| vendored core diff副作用 | 合格 | `crates/mk-flash-core/src/machine.rs:69-75,92`と`lib.rs:22-25`だけが定数抽出差分。残る6ソースは一致 |
| Cargo standalone化・feature・dev/profile | 合格 | `crates/mk-flash-core/Cargo.toml:4-23`、`crates/mk-flash-cli/Cargo.toml:4-15`、`src-tauri/Cargo.toml:32`。元・先ともdev-dependencies/profileなし |
| BusyGuard全書込＋download多重呼出し | 一部不合格 | 待機・書込は`src-tauri/src/flash/mod.rs:100,130`で単一飛行。downloadは同`:76-85`でguardなし（Deferred） |
| cancel状態別挙動をRustでも強制 | 不合格 | 待機・書込共通flagは`src-tauri/src/flash/mod.rs:101-102,131-132`、cancelは同`:168-170`でphase無条件。開始直後lost-cancelと書込中受付をMajor計上 |
| Permission denied retry・sync | 合格 | retryは`crates/mk-flash-core/src/machine.rs:198-210`、flush/syncは`crates/mk-flash-core/src/fsops.rs:125-135`。Studioは同coreの`RealEnv`を`src-tauri/src/flash/mod.rs:151-162`で使用 |
| cache解決・disk full・unmountのerror伝播 | 合格 | cache解決は`src-tauri/src/flash/mod.rs:76-84`で`FlashError::Io`へ変換。download保存失敗は`crates/mk-flash-core/src/download.rs:52-64`、volume書込失敗は`fsops.rs:106-140`→`machine.rs:191-249`でFlashErrorへ伝播 |
| Info.plist TCC拒否経路 | 合格 | 実物キーは`src-tauri/Info.plist:7-8`。Unix EPERM/EACCES分類は`crates/mk-flash-core/src/machine.rs:120-126`、最終`PermissionDenied`は同`:198-206`、表示は`src/firmware-update/ja.ts:55-56` |
| main.rs 6コマンド登録・既存6個非干渉 | 合格 | 既存6個は`src-tauri/src/main.rs:26-31`、追加6個は同`:32-37`で名称衝突なし。FlashState管理は同`:24` |
| supportLogのPII | 注意付き合格 | `src/firmware-update/supportLog.ts:31-47,85-96`はuserAgent、app/Tauri version、volume path、INFO_UF2全文、manifest hash、step、raw errorを、ユーザーが保存操作したローカルJSONだけへ出力。自動送信はありません。現INFO_UF2に顧客名・シリアルを追加する将来変更時は再評価が必要 |

### 重要度別件数

- Critical: 1
- Major: 4
- Minor: 0
- Deferred: 1

合格根拠・対象外のStep3項目は件数に算入していません。
