# minimal-keys Studio 開発ログ

## プロジェクト概要
- **リポジトリ**: https://github.com/hyhy-masa/minimal-keys-studio (Private)
- **ファームウェア**: https://github.com/hyhy-masa/minimal-keys2
- **ベース**: cormoran/zmk-studio フォーク (カスタムRPCサブシステム対応)
- **キーボード**: minimal-keys, 43キー分割, PMW3610トラックボール, nRF52840
- **ZMKフォーク**: `v0.3-branch+custom-studio-protocol+ble`
- **ts-client**: `github:cormoran/zmk-studio-ts-client#custom-studio-protocol`

## 完了した作業

### Phase 1-3: Web UI構築 (以前のセッション)
- タブ構成: Keymap, Trackball, Bluetooth, Battery, Settings
- カスタムRPC: `useCustomSubsystem(id)` → discover → `callRPC(payload)` → decode
- サブシステムID: `cormoran_rip`, `cormoran_ble`, `zmk__battery_history`, `zmk__settings`
- Protoコーデック: `src/proto/{rip,ble,battery,settings}.ts` (protobufjs/minimal)

### Fix 1: runtime-input-processor dtsiパースエラー修正
- **原因**: `runtime-input-processor.dtsi` で `INPUT_EV_REL` 等のZephyr定数を使用しているが、ヘッダーが未include
- **修正**: `minimal-keys_R.overlay` に `#include <dt-bindings/input/input-event-codes.h>` を追加
- **ファイル**: `/farmware/minimal-keys2/config/boards/shields/minimal-keys/minimal-keys_R.overlay`

### Fix 2: スクロールレイヤー復旧
- **問題**: runtime-input-processor追加後、スクロールレイヤーが動作しなくなった
- **根本原因**: input-listenerのscroller子ノードがcormoranのZMKフォークで正しく動作しない
- **解決**: scroller子ノードを完全に削除、PMW3610の `scroll-layers = <3>` を復元
- **教訓**: PMW3610の `scroll-layers` は実績があり信頼性が高い。input-listener scrollerは使わない

### Fix 3: GitHub Pages デプロイ設定
- **状況**: リポジトリがPrivateのため、無料プランではGitHub Pagesが使えない
- **対応**: `.github/workflows/deploy.yml` の自動デプロイ(push trigger)をコメントアウト
- `vite.config.ts` の `base: "/minimal-keys-studio/"` は設定済み

### Trackball Settings UI改善
- `getInputProcessor(0)` → `listInputProcessors()` + Notification方式に変更 (cormoran公式パターン)
- 複数プロセッサのセレクタUI追加
- スピードスライダー (0.5x〜5.0x、0.5刻み) に変更 (multiplier/divisor直接入力から)
- RPC 5秒タイムアウト追加 (Apply/Reset のハング防止)
- Notification受信時のフォーム値リセット問題を修正 (初回発見時のみ値を設定)

### BLE管理タブ デバッグ強化
- `[BLE]` プレフィックス付きコンソールログ追加
- RPC呼び出しに5秒タイムアウト追加
- `useCustomSubsystem` にサブシステム発見ログ追加 (`[CustomSubsystem]`)

## 未解決の問題

### 1. USB接続エラー (優先度: 高)
- **症状**: `InvalidStateError: The port is already open`
- **原因**: 前回のセッションでシリアルポートが解放されていない
- **対策**: Chrome を Cmd+Q で完全終了してから再起動。ファームウェア再書き込みでUSB CDC ACMがリセットされる可能性あり

### 2. BLE経由のStudio接続 (優先度: 高)
- **症状**: Web BluetoothのデバイスピッカーにキーボードがService UUID `00000000-0196-6107-c967-c5cfb1c2482a`で表示されない
- **考えられる原因**:
  - ファームウェアがBLE経由でStudio GATT serviceをadvertiseしていない
  - すでにBLEキーボードとして接続済みの場合、Studio用GATTサービスが見えない
- **調査方法**: USB接続後、コンソールで `[CustomSubsystem] Available subsystems:` を確認し、`cormoran_ble` が含まれているか確認

### 3. BLE管理タブ応答なし (優先度: 中)
- **症状**: Bluetoothタブでプロファイルが表示されない
- **調査**: USB接続時にコンソールで以下を確認:
  - `[CustomSubsystem] Available subsystems:` → `cormoran_ble` があるか
  - `[BLE] Loading profiles...` → RPC呼び出しが始まるか
  - `[BLE] getProfiles response:` → レスポンス内容
  - `[BLE] RPC timeout:` → タイムアウトしていないか

### 4. カーソルのカクカク問題 (優先度: 中)
- **症状**: 高いmultiplierでカーソルが滑らかに動かず、カクカクする
- **根本原因**: CPIが低いままmultiplierで速度を上げると、各レポート間の移動量が大きくなる
- **対策**: ファームウェアでCPIを上げて、multiplierは1x付近に保つ
  ```dts
  trackball: trackball@0 {
      ...
      cpi = <1600>;  // デフォルトから上げる (400, 800, 1200, 1600 等)
  };
  ```
- CPIはデバイスツリーのプロパティなので、ファームウェア再ビルドが必要

### 5. Scrollプロセッサの Apply ハング (優先度: 低)
- **症状**: Scrollプロセッサを選択してApplyすると「Applying...」が終わらない
- **対策**: 5秒タイムアウトを追加済み。タイムアウト後はエラーログが出る
- **根本原因**: ファームウェアがScrollプロセッサのRPC設定変更に応答しない可能性

### 6. battery-history / settings-rpc (優先度: 低, ブロック中)
- cormoran ZMKフォークに不足しているAPI:
  - `ZMK_RELAY_EVENT_HANDLE` マクロ (battery-history用)
  - `zmk_activity_get/set_idle_ms/sleep_ms` 関数 (settings-rpc用)
- 対策: cormoranのZMKをフォークして自前で追加するか、cormoran氏に問い合わせる

## ファイル構成

### Web UI (minimal-keys-studio)
```
src/
├── App.tsx                    # メインアプリ、タブ管理、接続フロー
├── ConnectModal.tsx           # USB/BLE接続選択UI
├── trackball/
│   └── TrackballSettings.tsx  # トラックボール設定 (スピード、回転、軸制御)
├── bluetooth/
│   └── BleManagement.tsx      # BLEプロファイル管理
├── battery/
│   └── BatteryHistory.tsx     # バッテリー履歴 (未実装 - API不足)
├── settings/
│   └── DeviceSettings.tsx     # デバイス設定 (未実装 - API不足)
├── proto/
│   ├── rip.ts                 # Runtime Input Processor protobuf codec
│   ├── ble.ts                 # BLE Management protobuf codec
│   ├── battery.ts             # Battery History protobuf codec
│   └── settings.ts            # Settings protobuf codec
└── rpc/
    ├── useCustomSubsystem.ts  # カスタムサブシステム発見・呼び出しHook
    ├── ConnectionContext.ts   # 接続状態Context
    └── logging.ts             # RPC呼び出しラッパー
```

### ファームウェア (minimal-keys2)
```
config/boards/shields/minimal-keys/
├── minimal-keys_R.overlay     # 右側: トラックボール、SPI、runtime-input-processor
├── minimal-keys_R.conf        # 右側Kconfig (BLE_MANAGEMENT, RUNTIME_INPUT_PROCESSOR)
├── minimal-keys.dtsi          # 共通デバイスツリー
└── ...
config/west.yml                # モジュール定義 (ble-management, runtime-input-processor)
```

## 次回の検証手順

1. ファームウェア書き込み完了確認
2. Chrome を **Cmd+Q** で完全終了 → 再起動
3. `npm run dev` → `http://localhost:5173/minimal-keys-studio/`
4. USB接続 → コンソール(F12)で `[CustomSubsystem]` ログを確認
5. Trackballタブでスピードスライダー動作確認
6. Bluetoothタブで `[BLE]` ログを確認
7. BLE接続テスト (Web Bluetooth ピッカーに表示されるか)

## コミット履歴
- `2da72ba` feat: Improve trackball speed slider and add BLE debug logging
- `945f3dd` ci: Disable auto-deploy until repo is public
- `e3457c2` fix: Remove unused generate-data script that fails in CI
- `c44bc04` feat: minimal-keys Studio - Custom ZMK Studio Web UI
