# minimal-keys Studio 有線接続／ファーム書き込み 現状マッピング

調査日: 2026-07-08
Studio repo: /Users/masakazuhayata/claude-code/minimal-keys-studio (HEAD=8a54181, branch=main)
FW repo: /Users/masakazuhayata/farmware/minimal-keys-trackball-test

## 3行サマリー
1. **有線transportの現状**: USB(serial) transportは既に実装済み（未実装ではない）。Tauriネイティブ版（Rust `tokio_serial` + TS `invoke`）と、ブラウザ版（Web Serial API, ts-client由来）の2系統が両方存在し、`App.tsx` の `TRANSPORTS` 配列でBLEと並列に選択可能。FW側も `snippet: studio-rpc-usb-uart` がビルドマトリクスに設定済みで、出荷FWはUSB CDC-ACM経由のStudio RPCが原理上有効。
2. **flash機能の現状**: Studioアプリ内にUF2/DFU/bootloaderコピー等のファーム書き込みコードは一切無い（`grep`で確認、ヒットは無関係な"Bootloader"キーコード名のみ）。scripts/には release data 生成スクリプトが1本あるだけ。
3. **flash統合の実現性の第一印象**: Tauri capabilities は `fs:allow-write-text-file`/`fs:allow-read-text-file`（path `**`）のみでバイナリ書込・ディレクトリ列挙・外部プロセス実行の権限が無い（shell/processプラグイン自体が未導入）。UF2を`/Volumes/*`へバイナリコピーする機能をGUI統合するには、Rust側に新規Tauriコマンド（`fs::write` 相当のバイナリ書込 or `std::fs::copy`）と対応する capabilities 権限追加が必要（現状ゼロから作る前提）。

---

## A. transport（接続経路）アーキテクチャ

1. **有線transportコードは存在する（想定と異なる）**。BLE以外にUSB(serial) transportが2系統ある:
   - Tauriネイティブ: `src-tauri/src/transport/serial.rs` (Rust, `tokio_serial`) + `src/tauri/serial.ts` (TS `invoke`ラッパー)
   - ブラウザ: ts-client由来の `node_modules/@zmkfirmware/zmk-studio-ts-client/lib/transport/serial.js`（Web Serial API直叩き）。Studioリポ内にソースは無く、`node_modules`のビルド済みJSのみ（サブモジュールのビルド成果物）

2. **ファイル場所と実装状況**:
   | Transport | ファイル | 状態 |
   |---|---|---|
   | BLE (Tauri) | `src-tauri/src/transport/gatt.rs`, `src/tauri/ble.ts` | 実装済み |
   | BLE (ブラウザ Web Bluetooth) | `src/transport/gatt.ts` | 実装済み（詳細なreconnect/retryロジック付き） |
   | USB/serial (Tauri) | `src-tauri/src/transport/serial.rs`, `src/tauri/serial.ts` | 実装済み |
   | USB/serial (ブラウザ Web Serial) | `node_modules/@zmkfirmware/zmk-studio-ts-client/lib/transport/serial.js`（ソースはts-client側、Studioリポにvendorされたコードなし） | 実装済み（ts-client由来） |

3. **接続入口UI**: `src/App.tsx:64-93` の `TRANSPORTS` 配列で構築、`src/ConnectModal.tsx` がUIレンダリング。
   - Tauriアプリ内（`window.__TAURI_INTERNALS__` あり）: `App.tsx:66-84` で **BLEとUSBの両方**が `pick_and_connect` パターンで登録される（`App.tsx:76-82` がUSB）
   - ブラウザ実行時（Tauri外）: `App.tsx:86-92` で `navigator.serial` があればWeb Serial USB、`navigator.bluetooth` があればWeb Bluetooth BLEが登録
   - `ConnectModal.tsx:166-201` の `DeviceList` で `transport.isWireless ? "BLE" : "USB"` のラベル表示あり（`ConnectModal.tsx:184`）→ **有線を選ぶ導線は既にある**

---

## B.「有線で認識されるが接続できない」の発生源候補

4. **デバイス列挙**: `src-tauri/src/transport/serial.rs:71-103` の `serial_list_devices` が `tokio_serial::available_ports()` を呼び、`SerialPortType::UsbPort` のみを候補として返す（`serial.rs:77`）。UsbPort以外の種別（例: 一部ドライバがPciPort等で報告するケース）はフィルタで除外され「一覧に出ない」＝そもそも認識されない側の原因になり得る。
5. **接続失敗の候補箇所（コード上の根拠、断定はしない）**:
   - `serial.rs:19` `tokio_serial::new(id, 9600)` — **ボーレートが 9600 にハードコードされている**。一方、同アプリ内のブラウザ版Web Serial実装（`node_modules/@zmkfirmware/zmk-studio-ts-client/lib/transport/serial.js:5` `port.open({ baudRate: 12500 })`）は **12500** を使用しており、Tauriネイティブ版とブラウザ版でボーレート値が不一致。USB CDC-ACMは通常ボーレートを無視する実装が多いが、ファーム側/OSドライバの実装依存で挙動が変わりうるため候補として記載。
   - `serial.rs:21-23` `port.set_exclusive(false).expect(...)` — Unix限定で排他モード解除に失敗すると `.expect()` が **panic** する。この非同期タスク内でのpanicが「デバイスは見えるが接続コマンドが失敗（あるいは無応答）」という体感に繋がりうる候補。
   - FW側の split構成起因の候補: `config/boards/shields/minimal-keys/minimal-keys_R.conf` にのみ `CONFIG_ZMK_STUDIO=y` 等の設定があり、`zmk` fork側 `app/src/studio/Kconfig:6` の `select ZMK_STUDIO_RPC if !ZMK_SPLIT || ZMK_SPLIT_ROLE_CENTRAL` によりStudio RPCはセントラル（R側）でのみ有効化される可能性が高い（L.conf側にSTUDIO関連設定なし、`grep`で確認）。ペリフェラル（L）のUSBポートに接続しようとした場合、ポートは認識されてもStudio RPCが応答せず「接続できない」体感になりうる候補。
6. **Tauri側 serial/USB依存**: `src-tauri/Cargo.toml` に `tokio-serial = "5.4.1"`（Cargo.lock解決 `5.4.4`）と `serialport = "4.5.0"` の両方が入っている（`serial.rs` 実装では `tokio_serial` のみ使用、`serialport` crateの直接利用箇所は未確認＝依存されているが未使用の可能性あり）。
   - WebSerial（`navigator.serial`）を使うTS側コードは `App.tsx:86-88` および ts-client由来の `serial.js`。Tauri webview で WebSerial が使えない前提は明示コードで確認: `App.tsx:66` `window.__TAURI_INTERNALS__` の分岐で、Tauri実行時はWeb Serial側（`App.tsx:87`）を使わず必ずTauriネイティブ`tauri_serial_connect`（`App.tsx:80`）を使う設計になっている（＝Tauri内でのWebSerial不使用は設計上の前提であり、コード上の直接的な「WebSerial非対応エラー」処理は見当たらない＝分岐で回避している）。
6. **ZMK Studio upstream USB transport の取り込み状況**: `package.json:22` `"@zmkfirmware/zmk-studio-ts-client": "github:hyhy-masa/zmk-studio-ts-client#custom-studio-protocol"`。`package-lock.json` 解決先は `git+ssh://git@github.com/hyhy-masa/zmk-studio-ts-client.git#7c833385c0d7a76e09a5ab7b16a16e5c72c68dac`（自社フォーク、`custom-studio-protocol`ブランチ）。upstream (zmkfirmware/zmk-studio) のUSB serial transportは無効化されておらず、**このフォークにも`transport/serial`が残っている**（`node_modules/.../lib/transport/serial.js` の存在で確認）。

---

## C. ファーム書き込み（flash）機能の現状

7. **Studioコード内にflash関連コードは存在しない**。`grep -rniI "uf2|dfu|bootloader|flash|Volumes" src src-tauri/src scripts` の結果、ヒットは以下のみですべて無関係:
   - `src/HidUsageTables-1.5.json` — HIDインジケータ名の"Flash"（無関係）
   - `src/behaviors/behavior-descriptions.ts:140`, `src/behaviors/binding-display.ts:63`, `src/keyboard/key-descriptions.ts:148`, `src/keyboard/behavior-short-names.json:3`, `src/behaviors/picker/SystemTab.tsx:12`, `SystemTab.test.tsx:10` — ZMKの `&bootloader` ビヘイビア（キーコード）表示名。ファーム書き込み機能とは無関係
   - `scripts/generate-release-data.js` — GitHub Releases APIからリリース情報を取得するだけのビルド補助スクリプト。flash処理なし
   - `/Volumes` への言及、`.uf2`/`dfu`関連のRust/TSコードは0件
   - `scripts/flash-farmware.sh` はStudioリポには存在しない（ユーザー言及の通りFW側リポの別物と推定されるが、Studioリポには同名ファイルなし）

8. **FW側リポでStudio用USB-UARTが有効か**:
   - `build.yaml:1-9` のビルドマトリクスで、`minimal-keys_R`・`minimal-keys_L` 両shieldとも `snippet: studio-rpc-usb-uart` が指定されている
   - このsnippetの実体（west.yml固定コミット `aa6ddd443e4618d80518aeeb65022658b1725991` と一致するローカルチェックアウト `/Users/masakazuhayata/farmware/zmk` で確認、`git log -1` のハッシュも一致）:
     - `app/snippets/studio-rpc-usb-uart/studio-rpc-usb-uart.conf`: `CONFIG_ZMK_USB=y`, `CONFIG_USB_DEVICE_STACK=y`, `CONFIG_USB_CDC_ACM=y`, `CONFIG_SERIAL=y` 等
     - `app/snippets/studio-rpc-usb-uart/studio-rpc-usb-uart.overlay`: devicetree `chosen { zmk,studio-rpc-uart = &snippet_studio_rpc_usb_uart; }` でUSB CDC-ACM UARTノードを指定
   - `app/src/studio/Kconfig:63-67`: `config ZMK_STUDIO_TRANSPORT_UART` は `default y if $(dt_chosen_enabled,$(DT_CHOSEN_ZMK_STUDIO_RPC_UART))` — snippetが上記chosenノードを設定するため、**明示的なconfig行なしに自動でUART(USB CDC-ACM) transportが有効化される**
   - `config/boards/shields/minimal-keys/minimal-keys_R.conf:70-72`: `CONFIG_ZMK_STUDIO=y`, `CONFIG_ZMK_STUDIO_TRANSPORT_BLE=y`（USB側は明示なし＝snippet由来のデフォルトyに依存）
   - **判定**: 出荷FW（GitHub Actions `build.yaml` でビルドされるもの）は、原理的に **有線（USB CDC-ACM経由）Studio接続が可能**。ただし `CONFIG_ZMK_STUDIO=y` 等StudioそのものはR(セントラル)側のみに設定されており（`minimal-keys_L.conf`にSTUDIO関連設定なし、grep確認）、L側での有線Studio接続可否は本調査だけでは断定できない（**不明**、Kconfigのselect連鎖の実挙動はビルド出力の`.config`を見ないと確定できない）

---

## D. Tauri のネイティブ能力（flash統合の実現性材料）

9. **Tauriバージョン**:
   - `src-tauri/Cargo.toml:14` `tauri = { version = "2.0.0", ... }` → Cargo.lock解決版 `2.11.3`
   - `package.json` `"@tauri-apps/api": "^2.0.0"`, `"@tauri-apps/cli": "^2.10.0"`
   - `src-tauri/tauri.conf.json` はスキーマ参照のみでバージョンフィールド自体は `"version": "0.3.0"`（アプリのバージョン、Tauri本体のバージョンではない）

10. **capabilities/権限**（`src-tauri/capabilities/default.json:1-32`）:
    - 付与済み: `core:*:default` 一式, `cli:default`, `http:default`（Googleスクリプトドメインのみ許可）, `dialog:default`, `fs:default`, `fs:allow-write-text-file`（path: `**`）, `fs:allow-read-text-file`（path: `**`）
    - `fs:default` 自体は `tauri-plugin-fs-2.5.1/permissions/default.toml` により **アプリ専用ディレクトリ（AppConfig/AppData等）への読み取りのみ**に制限（`create-app-specific-dirs`, `read-app-specific-dirs-recursive`, `deny-default`）
    - `default.json` が追加で `fs:allow-write-text-file` / `fs:allow-read-text-file` を `**`（任意パス）で許可 — **ただしテキストファイルI/Oのみ**。バイナリファイル書込（`fs:allow-write-file`）、ディレクトリ一覧（`fs:allow-read-dir`）、ファイルコピー等の権限は capabilities に **記載なし**
    - **shell/process実行系プラグインは存在しない**: `Cargo.toml` に `tauri-plugin-shell` 等の依存なし、`package.json` に `@tauri-apps/plugin-shell` 等の依存なし。`grep -rni "shell|process|Command::new"` の結果もヒットなし（`src-tauri/src/transport/serial.rs:31,58` の "read_process" はローカル変数名で無関係）
    - `entitlements.plist:1-9`（macOS）: `com.apple.security.app-sandbox = false`（サンドボックス無効）, `com.apple.security.device.bluetooth = true`, `com.apple.security.network.client = true`。**USB/シリアルデバイス関連のentitlement記載なし**（サンドボックス無効のため通常は不要と推定されるが、UF2ボリューム=`/Volumes/*`への書込に関する追加のmacOS権限要否は本調査からは**不明**）
    - **flash統合への含意**: バイナリUF2コピー機能を追加する場合、(a) 新規Tauri Rustコマンド（`std::fs::copy`等）を実装し、(b) 対応する capabilities（バイナリfs書込 or 独自コマンドのpermission定義）を追加する必要がある。現状のcapabilitiesのままでは実現不可

---

## E. ビルド・構成の基礎情報

11. **package.json主要依存**（`package.json:1-58`）:
    - React `^18.2.0`, Vite `^5.4.8`（devDependencies）, `@tauri-apps/cli ^2.10.0`, `@tauri-apps/api ^2.0.0`
    - `@zmkfirmware/zmk-studio-ts-client`: `github:hyhy-masa/zmk-studio-ts-client#custom-studio-protocol`（自社フォーク）
    - `@tauri-apps/plugin-cli ^2.4.1`, `plugin-dialog ^2.7.1`, `plugin-fs ^2.5.1`, `plugin-http ^2.0.0`
    - `@types/w3c-web-serial ^1.0.6`, `@types/web-bluetooth ^0.0.20`（ブラウザ版transport用の型定義、devDependencies）
    - npm scripts: `dev`(vite), `build`(tsc+vite build), `lint`(eslint), `test`(vitest run), `tauri`(tauri cli), `storybook`/`build-storybook`

12. **src-tauri/src/ モジュール構成**:
    - `main.rs:1-33` — デスクトップ版の実エントリポイント。`tauri::Builder::default()` に `tauri_plugin_cli`, `tauri_plugin_http`, `tauri_plugin_dialog`, `tauri_plugin_fs` を登録し、`invoke_handler` に `transport_send_data`, `transport_close`, `gatt_list_devices`, `gatt_connect`, `serial_list_devices`, `serial_connect` の6コマンドを登録（`main.rs:23-30`）。transport系以外のコマンドは**登録されていない**
    - `lib.rs:1-6` — `#[cfg_attr(mobile, tauri::mobile_entry_point)]` 付きのモバイルエントリスタブ。プラグイン・コマンド登録なし。`Cargo.toml`に`[lib]`セクション明記はなく、`[package] name = "app"`, `default-run = "app"` から、デスクトップビルドの実体は`main.rs`（`app`バイナリ）であり`lib.rs`は現状デスクトップ機能には未使用と推定（**確定的な検証はcargo build出力までは未実施**）
    - `transport/mod.rs:1-3` — `commands`, `gatt`, `serial` の3サブモジュールを公開
    - `transport/commands.rs` — 全transport共通の `ActiveConnection` state（`Mutex<Option<Box<dyn Sink...>>>`）と `transport_send_data`/`transport_close` コマンド。BLE/USB両方が同じ `ActiveConnection` を介して送受信する設計（`gatt.rs:115`, `serial.rs:29` とも同じstateにセット）

---

## 注意点・リスク（推測を明示）

- 本調査は「B(発生源特定)」について、ユーザーが実際に遭遇した「認識されるが接続できない」不具合の**再現ログ・エラーメッセージを未確認**のまま、コード上の候補箇所を列挙したもの。断定ではなく候補（ボーレート不一致9600 vs 12500、split central/peripheral限定、`set_exclusive`のpanic）。実装設計に入る前に、実機での再現テスト（どちらのUSBポート/どのOSで発生するか）を推奨
- L側shieldでのStudio RPC有効可否は `.config` 実ビルド出力を見ないと断定できない（**不明**と明記）
- `lib.rs` がデスクトップビルドで本当に未使用か（cargoのターゲット解決）は `cargo build --bin app` 等の実ビルドまでは検証していない（**不明**）
- macOSでの `/Volumes/*` 書込に関する追加entitlement要否は未検証（**不明**）
