# Track2 設計書: minimal-keys Studio 有線ファーム更新（顧客セルフ更新）統合

- 作成日: 2026-07-08
- 作成: Fable 5（シニア組込みエンジニア × デスクトップアプリ設計者ロール）
- 対象: minimal-keys Studio（Tauri 2.11.3 + React/TS）への UF2 書き込み GUI 統合
- 前提資料: `studio-wired-current-state.md`（現状把握ブリーフ）＋本調査での実コード裏取り
- スコープ: Track2のみ。Track1（有線設定接続のバグ修正）には触れない。既存 BLE/serial 設定接続・RPC・proto 層は変更しない

---

## 0. エグゼクティブサマリー（まさかず向け）

1. **推奨は「A: Studioに直接組み込む」**。書き込みの中身は flash-farmware.sh でやっていることの Rust 移植で、コピー先の検出→UF2をコピー→アンマウントで成否判定、という単純な処理。Mac/Win 両対応も標準ライブラリだけで書ける
2. 規模は **MVP（Macで顧客が使える最小）まで約7人日、Windows込みで約9人日、ワンクリック全自動まで約14人日**
3. 最大の急所だった「アプリから自動でブートローダーに入れるか」は**調査の結果、入れる**（ZMKの `&bootloader` の仕組みをRPCで叩けばよい。全チェーンをソースコードで裏取り済み）。ただし**今出荷済みのFWにはその受け口がない**ので、初回だけ「リセット2回」のガイド付き手動→FW更新後は次回から全自動、という2段構え
4. 文鎮化の実リスクは「本当の文鎮」ではなく**ペアリング不整合**（settings_reset を飛ばした時）。ブートローダー自体はUF2書き込みでは消えないので、最悪でもリセット2回で必ずやり直せる。設計はこの2つを分けて守る
5. 配布は **GitHub Releases（farmwareリポは既に公開）** に uf2 ＋ manifest.json を置き、Studioが直接ダウンロード。gh CLI も認証も不要
6. 次の一手は M0（リリースパイプライン整備・1人日）→ M1（Rust書き込みコア・3人日）

---

## 1. 選択肢の比較（規模 × 実現性 × 時間）

### 1.1 比較表

| 観点 | **A: Studioネイティブ統合**（推奨） | B: 独立GUIツール | C: 既存シェルの薄いGUIラッパ |
|---|---|---|---|
| 概要 | Studio に Rust の flash モジュール＋更新ウィザードUIを追加 | 書き込み専用の別アプリ（Tauri/egui）を新規作成 | flash-farmware.sh をGUIから呼ぶだけ |
| 総工数目安 | **9〜14人日**（MVP 7人日） | 11〜16人日（flash部は同じ＋アプリ骨格/配布/署名が別途） | 3〜4人日（ただしMac専用のまま） |
| Mac+Win 両対応 | ○（std::fsベースで両対応設計） | ○（同上） | **×**（bash・/Volumes・gh CLI 依存。Winは事実上の書き直し） |
| 顧客セルフ更新の成立 | **○**（1アプリで完結。バージョン検出→DL→書込→検証まで） | △（バージョン検出にキーボード接続が要る＝結局Studio相当の transport 実装が要る） | **×**（gh CLI 認証が前提。顧客に配れない） |
| 将来のワンクリック化 | **○**（既存RPC基盤に dfu サブシステムを足すだけ） | △（RPCクライアントを別アプリに複製） | × |
| 配布・署名コスト | 既存 Studio の配布に同乗（追加ゼロ） | **配布物が2つに増える**（署名・更新・サポートが2倍） | 配布不能 |
| 既存Studioへの影響 | 小（独立モジュール。§6参照） | ゼロ | ゼロ |
| リスク | OS差分（TCC/AV）・ユーザー操作ミス → §8で対策 | Aと同じ＋2アプリ間のバージョン整合問題 | 要件未達 |

### 1.2 コンポーネント別工数（A案）

| コンポーネント | 内容 | 工数目安 | 実現性 | 主リスク |
|---|---|---|---|---|
| M0: FWリリースパイプライン | tag→GitHub Release（uf2改名＋manifest.json） | 1人日 | 高（Actions既存。Release作成を足すだけ） | asset命名の空白問題（§3.7） |
| M1: Rust flashコア | ボリューム検出/UF2検証/書込/アンマウント判定/進捗 | 3人日 | 高（flash-farmware.shの実証済みロジックの移植） | macOS TCC・Winのタイミング差 |
| M2: 更新ウィザードUI | 状態機械＋ガイド画面＋失敗リカバリ（手動遷移版） | 3人日 | 高（既存Modal/Tourパターン流用） | 文言・導線の分かりやすさ |
| M3: Windows対応 | ドライブ走査・書込・NSIS動作確認 | 2人日 | 中〜高（std実装だが実機検証必須） | AV・ドライブレター競合 |
| M4: dfu RPC（ワンクリック化） | FW側モジュール＋Studio側クライアント | 3人日 | 高（settings-rpc/ble-managementと同型） | split越し invoke の実機検証 |
| M5: settings_resetフロー＋ロールバック | manifest駆動の4段フロー・旧版へ戻す | 2人日 | 高 | settings_reset後の挙動ばらつき |

**推奨: A案。** Cは顧客要件（配布・Win）を構造的に満たさない。Bは「flash部の工数はAと同じなのに、配布物と署名とバージョン整合の問題が1個ずつ増える」だけで利点がない。ただしA案でも **Rust flash コアは `src-tauri/src/flash/` に自己完結の独立モジュールとして書く**。将来「救出専用ツール」（B的なもの）が欲しくなったらそのまま crate として切り出せる。

---

## 2. ブートローダー自動遷移の結論（最重要論点）

### 2.1 結論

> **自動遷移は「できる」。ただし今出荷済みのFWには受け口（RPC）がないため、
> 「初回更新はガイド付き手動 → それ以降は全自動」の2段構えが正しい設計。**

- 技術的には: **可能**（証拠チェーン §2.2。全リンクをソースコードで確認済み）
- 出荷済みFWに対して: **不可能**（bootloader突入を外部から命令する経路が存在しない。§2.3）
- FWに小さなRPCを1つ足せば: **R（右・親機）は完全自動、L（左・子機）もsplitリンク越しに自動**（§2.4）
- 手動フォールバック: **常に存在する**（リセット2回。ブートローダーはUF2書き込みで消えない領域にあるため、どんな失敗からでもここに戻れる。§2.6）

### 2.2 証拠チェーン（全て実ソース確認済み）

自動遷移の機構は、ZMK標準の `&bootloader` ビヘイビアが使っているものと同一。

1. **`&bootloader` の実体**: `zmk,behavior-reset` / `type = <RST_UF2>`、`RST_UF2 = 0x57`
   （`zmk/app/dts/behaviors/reset.dtsi:19-24`, `zmk/app/include/dt-bindings/zmk/reset.h:13`）
2. **ビヘイビア実装**: `sys_reboot(cfg->type)` を呼ぶだけ。localityは `BEHAVIOR_LOCALITY_EVENT_SOURCE`（＝キーイベントが発生した側の半分で実行される）
   （`zmk/app/src/behaviors/behavior_reset.c:33,39`）
3. **nRF52でのsys_reboot**: Zephyr（ZMK pin版）の `sys_arch_reboot(type)` は `nrf_power_gpregret_set(NRF_POWER, 0, (uint8_t)type)` → `NVIC_SystemReset()`
   （zmkfirmware/zephyr `soc/arm/nordic_nrf/nrf52/soc.c`、GitHub APIで実ソース取得し確認）
4. **ブートローダー側**: Adafruit/Seeed nRF52 Bootloader は GPREGRET==0x57（DFU_MAGIC_UF2_RESET）を見て UF2 MSCモードに留まる（behavior_reset.c のコメントも Adafruit main.c を参照している）。XIAO nRF52840 Sense のブートローダー定義: `UF2_VOLUME_LABEL "XIAO-SENSE"` / `UF2_BOARD_ID "nRF52840-SeeedXiaoSense-v1"` / USB VID 0x2886, PID 0x0045
   （adafruit/Adafruit_nRF52_Bootloader `src/boards/xiao_nrf52840_ble_sense/board.h`、GitHub APIで取得）
5. **L（子機）への到達手段**: セントラルから任意ビヘイビアをペリフェラルで実行させるAPIが既存
   `zmk_split_central_invoke_behavior(uint8_t source, struct zmk_behavior_binding *binding, struct zmk_behavior_binding_event event, bool state)`
   （`zmk/app/src/split/central.c:91`。ペリフェラル側の受信処理は `peripheral.c:35-44` に既存。reset.dtsi には「Behavior can be invoked on peripherals, so name must be <= 8 characters」というコメントまであり、**ペリフェラルでのbootloader起動は設計上想定された使い方**）
6. **出荷FWとの整合**: 出荷リポ（hyhy-masa/minimal-keys-farmware、公開）の west.yml は開発リポと同一の zmk fork pin（aa6ddd4…）・同一モジュール構成。つまり上記1〜5は**顧客の手元の個体にそのまま当てはまる**（GitHub APIで出荷リポのwest.yml/keymapを取得し確認）

### 2.3 なぜ「出荷済みFW」には自動で入れないのか

外部（USB/BLE）からbootloader突入を命令できる経路を全て潰して確認した:

| 経路 | 結果 | 根拠 |
|---|---|---|
| 1200baudタッチ（Arduino風） | **無い** | `grep -rn "1200\|dte_rate" zmk/app/src` ヒットなし。ZephyrのCDC ACMには `cdc_acm_dte_rate_callback_set` というフックはあるが、ZMKはどこからも呼んでいない |
| Studio RPC core | **無い** | `core_subsystem.c` のハンドラは get_device_info / get_lock_state / reset_settings のみ。reset_settings はStudio管理設定（キーマップ等）の初期化であって再起動もボンド消去もしない（実装確認: `ZMK_RPC_SUBSYSTEM_SETTINGS_RESET_FOREACH` を回すだけ） |
| カスタムRPCモジュール群 | **無い** | settings-rpc（activity設定のみ）、ble-management（プロファイル/split bond管理のみ）、hold-tap-rpc 等。`grep sys_reboot` 全モジュールでゼロ件 |
| キーマップRPCで&bootloaderをキーに割当→ユーザーに押させる | 技術的には可能だが**不採用** | 永続キーマップを書き換えるため失敗時に変更が残る。どうせユーザー操作が要るならリセット2回の方が安全で説明も単純 |

よって出荷済みFWの個体では、bootloader突入は必ず物理操作になる:
- **リセットボタン2回押し**（R/L両方で可能。出荷用 ship-flash.sh が組立済み実機にこの手順を使っている＝製品状態でボタンにアクセス可能であることの実績）
- **キーマップの `&bootloader` キー**（layer_4 に1個、**右半分のみ**。出荷keymap 139行目で確認。Lには無い）

### 2.4 FWに足す受け口（Phase 2）と、その後の全自動フロー

新モジュール `zmk-module-dfu-rpc`（settings-rpc と同型のカスタムRPCサブシステム）を追加する:

- `EnterBootloader { target: 0=central / 1+=peripheral }`
  - central: RPC応答を返してから `k_work_schedule` で約200ms後に `sys_reboot(RST_UF2)`（応答がUSB/BLEバッファから出て行く猶予）
  - peripheral: `zmk_split_central_invoke_behavior(target-1, {behavior_dev: "bootload"}, …, true)` で子機側だけをbootloaderへ
- `GetFirmwareInfo` → 自機の version/git_rev/build_date を返し、ペリフェラルへは既存の**汎用イベントリレー**（`ZMK_RELAY_EVENT_PERIPHERAL_TO_CENTRAL` / `ZMK_RELAY_EVENT_HANDLE`、settings-rpc が実際に使っている）で問い合わせ、Notification で回収

**初回更新（旧FW→新FW）の遷移表:**

| 半分 | 初回更新 | 2回目以降 |
|---|---|---|
| R（親機） | 手動（リセット2回 or bootloaderキー）。ガイド表示＋ボリューム出現の自動検出 | **全自動**（dfu RPC） |
| L（子機） | **Rを先に新FW化すれば自動化できる**: 新Rの dfu RPC → 既存splitコマンド INVOKE_BEHAVIOR は旧Lの peripheral.c にも実装済みなので、旧Lでも `bootload` が起動する（同一zmk pinで確認）。splitリンクが張れない場合は手動フォールバック | 全自動 |

つまり**初回ですら手動操作は最悪1回（R側）で済む**見込み。

### 2.5 手動ガイドの設計（Phase 1のMVPであり、恒久のフォールバック）

自動化の成否に関係なく、この画面は必ず作る（失敗時の受け皿を兼ねる）:

1. 画面に対象半分の**写真/イラストとリセットボタン位置**を表示。「リセットボタンを素早く2回押してください」
2. 代替手段のアコーディオン: 「キーボードから入る方法（layer_4 + 該当キー、R側のみ）」
3. アプリは裏で `flash_wait_for_bootloader` をポーリング。**ボリューム出現を検知した瞬間に自動で次ステップへ進む**（ユーザーは「押すだけ」。成功判定を目視させない）
4. 60秒でタイムアウト→「もう一度2回押し。間隔は素早く（0.5秒以内）」等の追い込みガイド
5. どの画面からも「最初からやり直す」と「リカバリモード」（§3.4）に到達できる

### 2.6 なぜ手動フォールバックが常に安全側なのか（文鎮化しない根拠）

- UF2書き込みはアプリ領域（実測 targetAddr=0x27000〜）にしか書かない。**ブートローダー本体とSoftDeviceはUF2転送では上書きされない** → 書き込みが途中で失敗しても「リセット2回」で必ずMSCモードに戻れる
- 本設計の書き込みガード（§3.3）は familyID 0xADA52840 を全ブロック検証するため、「別ボード用uf2で変な領域に書く」事故を入口で遮断する
- 実害のある失敗は物理破壊ではなく **(a) R/L取り違え（→正しいuf2を焼き直せば復旧）** と **(b) GATT変更時のペアリング不整合（→settings_resetフローで復旧）**。どちらも回復手順が存在し、リカバリモードUIに実装する

---

## 3. アーキテクチャ設計

### 3.1 全体構成

```
┌────────────────────────── minimal-keys Studio ──────────────────────────┐
│ React/TS フロント                                                        │
│  src/firmware-update/            ← 全て新規（既存画面に依存しない）      │
│   ├ FirmwareUpdateModal.tsx      ウィザードUI（状態機械の描画）          │
│   ├ useFirmwareUpdate.ts         状態機械（XState風の純TS実装＋vitest）  │
│   ├ RecoveryMode.tsx             リカバリ（任意の半分を手動フローで焼く）│
│   └ proto/dfu.ts                 dfuサブシステムのencode/decode          │
│                                   （src/proto/ble.ts と同パターン）      │
│  AppHeader.tsx                   ← MenuItem「ファームウェア更新」1行追加 │
│  rpc/useCustomSubsystem("dfu")   ← 既存フック流用（変更なし）            │
├──────────────────────────────────────────────────────────────────────────┤
│ Rust (src-tauri)                                                          │
│  src/flash/                      ← 全て新規・自己完結モジュール          │
│   ├ mod.rs        コマンド公開・共通型                                    │
│   ├ volume.rs     UF2ボリューム検出（mac: /Volumes 走査 / win: A:..Z:）   │
│   ├ uf2.rs        UF2ヘッダ/familyID検証・チャンク書込・進捗Channel       │
│   ├ download.rs   manifest取得・uf2ダウンロード・SHA-256検証              │
│   └ error.rs      FlashError（serdeタグ付きenum）                         │
│  main.rs                         ← invoke_handler に7コマンド追記のみ     │
│  ※ transport/（gatt.rs, serial.rs, commands.rs）には一切触れない          │
├──────────────────────────────────────────────────────────────────────────┤
│ 外部                                                                      │
│  GitHub Releases (hyhy-masa/minimal-keys-farmware, 公開リポ)              │
│   └ manifest.json + minimal-keys_R.uf2 / minimal-keys_L.uf2 /             │
│     settings_reset.uf2（CI がtagから生成）                                │
└──────────────────────────────────────────────────────────────────────────┘
FW側（Phase 2）: zmk-module-dfu-rpc（新規westモジュール。zmk fork本体は変更不要）
```

重要な分離: **「RPCチャネル（設定接続）」と「書き込みチャネル（USBマスストレージ）」は完全に別物**。書き込み自体はRPCに一切依存しないので、Track1（有線設定接続バグ）が未修正でも **Phase 1 のMVPは成立する**。Phase 2 のワンクリック化もBLE接続のRPC経由で成立する（有線RPCの修正を待たない）。

### 3.2 新規 Tauri Rust コマンド一覧

方針: **カスタムコマンドとして実装**（fsプラグインは使わない）。根拠: 既存の6コマンド（`serial_connect` 等）は capabilities に個別権限の記載なしで動いている実績があり、アプリ自身のコマンドはfsプラグインのACLスコープ管理外。パス制限はRust側で自前実装する（§3.3）。

```rust
// ---- error.rs ----
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", content = "detail", rename_all = "snake_case")]
pub enum FlashError {
    NoBootloaderVolume,                       // タイムアウトまでに出現せず
    MultipleBootloaderVolumes(Vec<String>),   // 2個以上 → R/L取り違え防止で中断
    NotUf2Volume { path: String },            // INFO_UF2.TXT なし/Board-ID不一致
    InvalidUf2 { reason: String },            // magic/familyID/サイズ不正
    WriteFailed { io: String },               // 早期の書込失敗（リトライ後）
    UnmountTimeout { path: String },          // 書けたのに再起動しない
    DownloadFailed { status: u16, url: String },
    ChecksumMismatch { expected: String, actual: String },
    ManifestInvalid { reason: String },
    Cancelled,
    PermissionDenied { hint: String },        // macOS TCC 拒否など
    Io { message: String },
}

// ---- volume.rs ----
#[derive(Serialize, Clone)]
pub struct Uf2Volume {
    pub path: String,          // "/Volumes/XIAO-SENSE" | "E:\\"
    pub label: String,         // ボリューム名（mac=ディレクトリ名 / win=INFO_UF2から補完）
    pub board_id: String,      // INFO_UF2.TXT の Board-ID 行
    pub info_text: String,     // INFO_UF2.TXT 全文（ログ・サポート用）
}

/// 現在マウント中のUF2ブートローダーボリュームを列挙（検証済みのもののみ返す）
#[tauri::command]
async fn flash_scan_bootloader_volumes() -> Result<Vec<Uf2Volume>, FlashError>;

/// baseline に無い「新しく出現した」UF2ボリュームを1つ待つ。
/// 2つ以上出現したら MultipleBootloaderVolumes。500ms周期ポーリング。
/// キャンセルは CancellationToken(state) 経由。
#[tauri::command]
async fn flash_wait_for_bootloader(
    baseline: Vec<String>, timeout_ms: u64,
) -> Result<Uf2Volume, FlashError>;

/// ボリュームが消える（=ボード再起動=書込成功）のを待つ
#[tauri::command]
async fn flash_wait_for_unmount(volume_path: String, timeout_ms: u64) -> Result<(), FlashError>;

// ---- uf2.rs ----
#[derive(Serialize)]
pub struct Uf2Info {
    pub family_id: u32,        // 0xADA52840 を要求
    pub num_blocks: u32,
    pub size: u64,
    pub sha256: String,
}

/// ローカルuf2ファイルの構造検証（全512Bブロックの magic0/1・familyID・サイズ整合）
#[tauri::command]
async fn flash_validate_uf2(file_path: String) -> Result<Uf2Info, FlashError>;

#[derive(Serialize, Clone)]
pub struct FlashProgress { pub written: u64, pub total: u64, pub phase: String } // phase: "writing"|"waiting_reboot"

/// 検証済みuf2をボリュームへ書く。64KBチャンク・Channelで進捗通知。
/// flash-farmware.sh 準拠: 書込末期のI/Oエラーは正常系として無視し、
/// 成否判定は呼び出し側の flash_wait_for_unmount に委ねる。
/// 内部で書込前に再度ボリューム検証（TOCTOU対策）。
#[tauri::command]
async fn flash_write_uf2(
    volume_path: String, file_path: String,
    on_progress: tauri::ipc::Channel<FlashProgress>,
) -> Result<(), FlashError>;

// ---- download.rs ----
#[derive(Serialize, Deserialize, Clone)]
pub struct FwAsset { pub role: String,  // "central" | "peripheral" | "settings_reset"
                     pub name: String, pub url: String, pub sha256: String, pub size: u64 }
#[derive(Serialize, Deserialize, Clone)]
pub struct FwManifest {
    pub schema: u32,                     // 互換性ゲート（=1）
    pub version: String,                 // "v1.4.0"
    pub released_at: String,
    pub requires_settings_reset: bool,   // GATT変更フラグ（§3.7）
    pub min_studio_version: String,      // これ未満のStudioには更新を促す
    pub notes_ja: String,
    pub assets: Vec<FwAsset>,
}

/// GitHub Releases の固定URL（…/releases/latest/download/manifest.json）から取得。
/// Rust側HTTP（tauri_plugin_http::reqwest 再利用。webviewのCSP/HTTPスコープは変更不要）
#[tauri::command]
async fn fw_fetch_manifest() -> Result<FwManifest, FlashError>;

/// appキャッシュdir（tauri::Manager::path().app_cache_dir()/firmware/<version>/）へDL。
/// SHA-256照合＋flash_validate_uf2 相当の構造検証をパスしたらローカルパスを返す
#[tauri::command]
async fn fw_download_asset(url: String, sha256: String, version: String)
    -> Result<String, FlashError>;
```

Cargo追加依存: `sha2`（SHA-256）のみ。HTTPは既存 `tauri-plugin-http` が内包する reqwest を再利用（`tauri_plugin_http::reqwest` はpublic re-export。万一版差で使えなければ `reqwest` を直接追加＝影響はビルド時間のみ）。

**Mac/Win分岐の置き場**: `volume.rs` 内の `#[cfg(target_os)]` に閉じ込める（詳細は§4）。他ファイルはOS非依存。

### 3.3 安全不変条件（この5つを破る書き込みは実行不能にする）

1. **書き込み先はUF2ブートローダーボリュームのみ**: 書込直前に `INFO_UF2.TXT` を再読取し、`Board-ID` が `nRF52840-SeeedXiao` 前方一致であること（ボリューム名は偽装/変更可能なので判定に使わない。ラベルは表示用）。ユーザーのUSBメモリに書く事故を構造的に排除
2. **uf2はfamilyID検証済みのみ**: 全ブロックで magic0=0x0A324655 / magic1=0x9E5D5157 / familyID=0xADA52840（実機uf2で実測済み）・ファイルサイズ512の倍数。manifest の SHA-256 とも一致
3. **同時に見えるブートローダーは1つだけ**: 2つ以上出現したら中断してガイド（R/L取り違えの構造的防止）。`baseline` 差分方式なので「元から刺さっていた別のUF2デバイス」も除外できる
4. **順序はステートマシンが強制**: R完了（アンマウント＋可能なら再接続検証）まで Lステップに遷移できない
5. **書き込み中のキャンセルは「コピー開始前」のみ有効**: コピー開始後はキャンセル不可（中途半端なイメージで再起動させない。UF2の性質上ブロック単位で安全だが、方針として最後まで書く）

### 3.4 フロントUI/UXフロー

#### 入口と現バージョン表示

- `AppHeader` のメニューに「ファームウェア更新」を追加（既存の「設定を初期化」MenuItemと同列）
- 接続中デバイスがあれば: `get_device_info().name`（="minimal-keys_R"）＋ Phase 2 では `dfu.GetFirmwareInfo` で R/L の現バージョン表示。**dfuサブシステムが存在しない（`CustomSubsystemsContext` に "dfu" が無い）＝旧FW＝「更新推奨（バージョン不明）」表示**
- 未接続でも起動可（リカバリ用途）。その場合バージョン比較はスキップし「最新を書き込む」だけを提供
- `fw_fetch_manifest()` と比較して「最新です / 更新があります (v1.3→v1.4)」を表示。`min_studio_version` を満たさない場合は先にStudio更新を案内

#### 更新ウィザード状態機械（useFirmwareUpdate.ts）

```
idle → fetching_manifest → downloading(3 assets) → ready
 ready → [requires_settings_reset ? full_flow : normal_flow]

normal_flow:
  r_enter_bootloader   … Phase2: RPC自動 / Phase1・失敗時: 手動ガイド(§2.5)
  r_flashing           … write → wait_unmount（進捗バー）
  r_verify             … serial/BLE再接続 → get_device_info.name=="minimal-keys_R"
                          ＋(Phase2) version==target。失敗しても警告付きで続行可
  swap_cable_to_l      … 「ケーブルをL側に差し替えてください」（イラスト）
                          Phase2: 差し替え前に dfu RPC で L を bootloader へ落としておく
  l_enter_bootloader   … ボリューム出現待ち（Phase2は自動落下済みなので即出現）
  l_flashing           … write → wait_unmount
  l_verify             … 「ケーブルをRに戻す」→ 再接続 → ble_management.GetSplitInfo
                          .peripheral_connected==true ＋(Phase2) L version確認
  done                 … 完了画面（変更点 notes_ja 表示）

full_flow（requires_settings_reset=true のときのみ）:
  R: settings_reset → R本体 → L: settings_reset → L本体 の4回書き込み
  （flash-farmware.sh と同順序）。settings_reset 書込後は
  「多くの場合そのままブートローダーに戻る」（実運用知見）を前提に
  ボリューム再出現を待ち、45秒出なければ「もう一度リセット2回」ガイドへ。
  最後に「PC/スマホと再ペアリングしてください」画面（BT設定の開き方リンク付き）
  ＋ ble_management.ForgetSplitBond / UnpairProfile は使わない（正本はsettings_reset。
    二重の状態遷移を作らない）
```

分岐原則: **各自動ステップは失敗したら必ず同じ内容の手動ガイドに落ちる**（自動遷移失敗→手動リセット2回、自動検証失敗→目視チェックリスト）。行き止まりを作らない。

#### リカバリモード（独立画面・常設）

- 「うまく動かないとき」から入る。接続状態・バージョン検出に一切依存しない
- 半分（R/L/settings_reset）と書くuf2を選び、手動フロー（リセット2回→検出→書込）を1回分だけ実行
- ここが「文鎮化しない」最後の砦: **ブートローダーが生きている限り（=UF2書き込みでは死なない）、この画面だけで工場出荷相当まで戻せる**

#### 進捗と文言

- 書込進捗は `Channel<FlashProgress>` でバー表示。`waiting_reboot` フェーズは「キーボードが再起動しています…」
- 文言は全て日本語・非技術者向け（「ブートローダー」は「書き込みモード」と言い換え、初出のみ併記）
- 全ステップのログ（検出ボリューム・INFO_UF2全文・ハッシュ・所要時間）を既存 `src/telemetry` の枠組みでローカル保存 → サポート問い合わせ時に添付してもらう

### 3.5 FW側: zmk-module-dfu-rpc（Phase 2・新規westモジュール）

- 置き場: `hyhy-masa/zmk-module-dfu-rpc`（settings-rpc と同一構造: `proto/zmk/dfu/dfu.proto`, `src/studio/dfu_handler.c`, `src/events/…`, `Kconfig`, `zephyr/module.yml`）
- proto:

```proto
package zmk.dfu;
message GetFirmwareInfoRequest { bool include_peripherals = 1; }
message FirmwareInfo { uint32 source = 1; string version = 2; string git_rev = 3;
                       string build_date = 4; bool is_central = 5; }
message GetFirmwareInfoResponse { FirmwareInfo local = 1; bool peripheral_request_sent = 2; }
message FirmwareInfoNotification { FirmwareInfo info = 1; }   // ペリフェラル分はリレーで回収
message EnterBootloaderRequest { uint32 target = 1; }          // 0=central, 1+=peripheral index
message EnterBootloaderResponse { bool acknowledged = 1; }
message Request  { oneof request_type { GetFirmwareInfoRequest get_firmware_info = 1;
                                        EnterBootloaderRequest enter_bootloader = 2; } }
message Response { oneof response_type { /* error + 上記2つ */ } }
message Notification { oneof notification_type { FirmwareInfoNotification firmware_info = 1; } }
```

- 実装要点:
  - central向け EnterBootloader: 応答送信 → `k_work_schedule`（約200ms）→ `sys_reboot(RST_UF2)`
  - peripheral向け: `zmk_split_central_invoke_behavior(idx, &binding, event, true)`。binding の `behavior_dev` はリセットビヘイビアのデバイス名（reset.dtsi のノード名 `bootload`。**実文字列は実装時に `zmk_behavior_get_binding()` で解決確認する**＝未確定点U-1）
  - GetFirmwareInfo のペリフェラル回収: `ZMK_RELAY_EVENT_HANDLE`（central→peripheral リクエスト）＋ `ZMK_RELAY_EVENT_PERIPHERAL_TO_CENTRAL`（report）— settings-rpc の request_id 方式をそのまま踏襲
  - バージョン文字列: `CONFIG_MK_FW_VERSION`（string, default "dev"）。CI が tag から `-DCONFIG_MK_FW_VERSION="v1.4.0"` を注入
- 配線: farmware/dev 両リポの west.yml に1エントリ追加＋ `minimal-keys_R.conf` に `CONFIG_MK_DFU_RPC=y`（Lにも入れる: version報告のリレー応答はL側で動く必要がある。dfuのRPCハンドラ自体はcentralのみで有効化される—settings-rpcと同じKconfigゲート）
- **zmk fork本体への変更: 不要**（必要なマクロ・APIは全て既存）

### 3.6 capabilities / entitlements / OS権限の追加内容

| ファイル | 変更 | 理由 |
|---|---|---|
| `src-tauri/capabilities/default.json` | **変更なし** | flash系はカスタムコマンド。既存6コマンドが権限記載なしで動作している実績と同じ扱い。fsプラグインのスコープは広げない（テキストI/O `**` の既存許可もそのまま。むしろ将来Track外で狭めたい） |
| `src-tauri/tauri.conf.json` CSP | **変更なし** | ダウンロードはRust側reqwest（webview CSPの管轄外）。`connect-src` にGitHubを足す必要がない |
| `src-tauri/Info.plist`（新規作成） | `NSRemovableVolumesUsageDescription = "キーボードにファームウェアを書き込むため、書き込みモードのキーボード（リムーバブルボリューム）へアクセスします"` | macOS Catalina+ のTCC。非sandboxアプリでもリムーバブルボリューム初回アクセス時にOSがプロンプトを出す。説明文が無いと無言拒否UXになる |
| `entitlements.plist` | **変更なし**（sandbox=false のまま） | 非sandboxのためUSB/removable系entitlementは不要。※Mac App Store配布に切り替える場合のみ `com.apple.security.files.user-selected...` 等の再設計が必要（現時点で計画なし） |
| Windows | **権限追加なし** | リムーバブルFATドライブへのファイル書込は標準ユーザー権限で可能。管理者昇格・ドライバ・WinUSBは一切不要（MSC書込のみのため） |

書込先の最小化はOS権限でなく**Rust側ガード（§3.3-1）**で担保する: 受け付けるパスは mac=`/Volumes/<name>`直下・win=`X:\` ルートのみ＋INFO_UF2.TXT検証必須。ダウンロード先は app_cache_dir 固定。フロントから任意パスを渡されても他所には書けない。

### 3.7 FW配布・バージョン管理

**現状**: 配布の実体は GitHub Actions の artifacts（gh CLI認証必須）で顧客配布不可。Releasesは0件（タグ運用のみ）。リポは既に**公開**（=Releases化しても新たな露出はない）。

- **配布チャネル**: `hyhy-masa/minimal-keys-farmware` の GitHub Releases
  - 固定URL `https://github.com/hyhy-masa/minimal-keys-farmware/releases/latest/download/manifest.json` → 未認証・リダイレクト追従のみで取得可能（公開リポで実証済みのGitHub仕様）
  - CI追加: tagプッシュ（`v*`）→ 既存ビルド → **asset改名**（現行の `minimal-keys_R rgbled_adapter-…uf2` は空白入りでURL/照合が事故りやすい → `minimal-keys_R.uf2` / `minimal-keys_L.uf2` / `settings_reset.uf2` に正規化）→ sha256計算 → manifest.json 生成 → `gh release create`
- **manifest.json**（スキーマは§3.2の `FwManifest`）
  - `requires_settings_reset`: リリース作業者がGATT/ペアリング影響の有無で設定（現行運用のコミットメッセージ `[GATT-RESET]` 検知を`flash.sh`が既にやっている→CIで `git log prev_tag..tag` を同じ規則で走査し自動設定＋手動上書き可）
  - `min_studio_version`: RPC/プロトコル互換が切れる時にStudio更新を強制するゲート
- **現FWバージョンの検出**: §3.5 の GetFirmwareInfo（R直接＋Lリレー）。旧FW（dfuサブシステム不在）は「不明＝更新対象」として扱う。**更新後の検証にも同じRPCを使う**ので、検出と検証が一本化される
- **更新要否判定**: semver比較（manifest.version vs 検出version）。「不明」は常に更新提案
- **ロールバック**: `GET /repos/…/releases` 一覧（Rust側）→「以前のバージョンに戻す」上級メニュー。フローは同一（manifestは各Releaseに同梱されているので過去版もrequires_settings_reset情報を持つ）。直前バージョンのuf2はapp_cache_dirに残す（即時ロールバックはネット不要）
- **整合性**: TLS＋manifest内SHA-256照合＋uf2構造検証の3段。任意で将来: manifestへのed25519署名（公開鍵をStudioに同梱）。公開リポのRelease改ざんはGitHubアカウント侵害と等価なので、初期リリースではSHA-256照合までとする（根拠: 攻撃コストと保護資産の釣り合い）

---

## 4. クロスプラットフォーム計画

| 項目 | macOS | Windows | 実装の置き場 |
|---|---|---|---|
| ボリューム検出 | `read_dir("/Volumes")` → 各エントリの `INFO_UF2.TXT` 存在＋Board-ID検証 | `'A'..='Z'` の `X:\INFO_UF2.TXT` を `fs::metadata` で走査（エラー=不在扱い。カードリーダの not-ready も同じ経路で吸収） | `volume.rs` `#[cfg]` |
| ボリューム名 | ディレクトリ名（`XIAO-SENSE`。同名多重マウント時の `XIAO-SENSE 1` も拾える） | ドライブレターのみで動作（ラベル取得のwinapiは使わない。表示はINFO_UF2から） | 同上 |
| 書き込み | `File::create`→64KBチャンク`write_all`→`sync_all`。末期I/Oエラーは正常系 | 同一コード。`sync_all` のエラーも同様に無視 | `uf2.rs`（共通） |
| アンマウント判定 | `/Volumes/XIAO-SENSE` の消失 | `X:\` 直下 `INFO_UF2.TXT` の消失（レター再利用対策でファイル基準） | `volume.rs` |
| 権限 | TCCプロンプト（§3.6）。拒否検出→システム設定への導線 | なし | — |
| 想定固有リスク | 多重マウント名 / Spotlightの一時アクセス | AVによる書込ブロック・遅延 / Explorerのオートプレイ表示 | §8 リスク登録簿 |
| タイミング定数 | マウント安定待ち2s / アンマウント30s（シェル実証値を初期値に） | 初期値は同じ、**実機で再計測して調整**（M3） | 定数モジュール |

**段階リリース提案**: M2完了時点で **Mac版を先行リリース**（社内＋協力顧客βに配布）→ M3でWin版。理由: (1) 書込ロジックの実証はOS非依存部分が9割で、Macで先に顧客導線全体（DL→焼き→検証→サポートログ）を磨く方が手戻りが少ない (2) Winは署名なしSmartScreen問題（§5）が絡むため、警告文言込みの配布手順を整えてから出す方が事故らない。

---

## 5. 顧客配布の署名・安全

**現状の事実**: mac は ad-hoc署名（`signingIdentity: "-"`）＝notarizationなし → 初回起動はGatekeeperの回避操作（右クリック→開く等）が必要。Win は NSIS 無署名 → SmartScreen警告。**これは本機能で新たに生じる問題ではなく、Studio配布全体の既存課題**。ただし「顧客セルフ更新」を売りにする以上、悪化要因（“怪しいアプリがキーボードを書き換える”体験）になるため併走で解消を推奨。

| 項目 | 要否 | 推奨 |
|---|---|---|
| mac Developer ID＋notarization | 本機能の動作には**不要**（TCCプロンプトは署名有無に関係なく出る）。配布UXには**強く推奨** | Apple Developer Program（$99/年）→ `tauri.conf.json` のsigningIdentity差し替え＋`notarytool`をCIへ。工数1〜2人日 |
| Win コード署名 | 動作には不要。SmartScreen警告の回避に推奨 | 短期: 配布ページに「詳細情報→実行」の手順明記。中期: Azure Trusted Signing（月額小）or OV証明書 |
| FWバイナリの完全性 | 必須 | §3.7の3段検証（TLS＋SHA-256＋UF2構造） |
| BLE既存課題との関係 | 独立 | 本機能はBLE権限を新規要求しない（書込はMSC、RPCは既存接続を使うだけ）。既存entitlementsの bluetooth=true のままで完結 |

**文鎮化防止の設計原則（本設計の憲法）**
1. ブートローダー領域には何も書かない（UF2の仕組み上書けない＋familyID検証で他ボード用イメージを遮断）
2. 成否判定は「アンマウント」という物理挙動で行い、アプリの内部状態を信用しない
3. 全自動パスの裏に必ず等価な手動パスを常設する（リカバリモード）
4. ペアリング系の破壊的変更（GATT）は manifest フラグで宣言的に管理し、フラグ付きリリースは settings_reset を強制する
5. 順序（R→L）と単一ボリューム制約はUIでなく状態機械とRustガードの両方で強制する

---

## 6. 他機能への影響（blast radius）

| 領域 | 変更 | 影響 |
|---|---|---|
| `src-tauri/src/transport/*`（BLE/serial RPC） | **ゼロ** | 接続機能に回帰リスクなし。flashモジュールはActiveConnection stateに触れない |
| proto / ts-client フォーク | **ゼロ**（Phase 2のdfuも「カスタムサブシステム」なので ts-client 本体・既存protoは不変。dfu.ts はStudio内 `src/proto/` に追加） | 既存キーマップ/コンボ/トラックボール設定UIに影響なし |
| `main.rs` | invoke_handler に7コマンド追記＋ `flash::init(app)`（状態登録） | 追記のみ。既存コマンド不変 |
| `AppHeader.tsx` | MenuItem 1行＋モーダル起動 | 表示のみ |
| capabilities / CSP | 変更なし（§3.6） | セキュリティ境界の変化なし |
| ビルド・配布 | Cargo依存+1（sha2）、`Info.plist` 新規 | ビルド時間微増のみ |
| FWリポ | CIにReleaseジョブ追加（既存ビルドジョブは不変）＋west.ymlに1モジュール | 既存の出荷スクリプト（flash.sh等）はそのまま動く（asset名変更はRelease側のみ。artifacts名は不変） |
| 失敗時の切り戻し | メニュー項目を隠すfeature flag（`VITE_FEATURE_FW_UPDATE`）で機能ごと無効化可能 | リリース判断を可逆にする |

---

## 7. 実装ロードマップ（依存順）

```
M0 ─→ M1 ─→ M2 ─→ M3
       └──────→ M4 ─→ M5      （M4はM1完了後に並行着手可）
```

| 段 | 内容 | 工数 | 完了条件（検証） |
|---|---|---|---|
| **M0** リリースパイプライン | tag→Release（asset改名・sha256・manifest.json） | 1人日 | tagを打つと未認証curlで manifest.json と3つのuf2が落とせる。sha256一致 |
| **M1** Rust flashコア | volume/uf2/download/error 4ファイル＋単体テスト | 3人日 | (a) 単体: 偽ボリュームdir＋実uf2ファイルでテスト緑（familyID改ざん検出含む） (b) **実機**: Macで手動リセット→CLIハーネス（`cargo test -- --ignored` の実機テスト）でR/L書込成功・アンマウント判定・二重ボリューム拒否を確認 |
| **M2** ウィザードUI（手動遷移版）＝**顧客に出せる最小** | 状態機械＋画面＋リカバリモード＋telemetryログ | 3人日 | **実機必須**: 旧FWの実機1台を「非開発者の手順書なし操作」で最新化できる（社内ユーザビリティテスト）。故意の失敗3種（途中でケーブル抜く/違う半分をリセット/タイムアウト）から全て復帰できる |
| **M3** Windows対応 | ドライブ走査・タイミング再計測・NSIS配布確認 | 2人日 | **実機必須**: Win10/11実機でM2と同じテストが通る。AV有効環境（Defender標準）で書込成功 |
| **M4** dfu RPC（ワンクリック化） | FWモジュール＋Studio dfuクライアント＋自動遷移 | 3人日 | **実機必須**: (a) 新FW同士: メニューから完了まで手動リセット0回（ケーブル差し替えのみ） (b) 旧L×新R混在: L自動遷移が動く (c) splitリンク断でも手動フォールバックに落ちる |
| **M5** settings_resetフロー＋ロールバック | full_flow実装・manifest駆動・旧版へ戻す | 2人日 | **実機必須**: requires_settings_reset=true のリリースで4段フロー完走→ホスト再ペアリング成功。1つ前のバージョンへ戻せる |
| （並走）署名整備 | mac notarization（Win署名は後続） | 1〜2人日 | 新規Macで警告なし起動 |

- **MVPの線引き**: **M0+M1+M2（Mac先行・手動リセット2回あり）＝約7人日**。「顧客が自分で最新FWにできる」という当初ゴールはここで達成。M3で対象OSが揃い（約9人日）、M4以降は体験の質（リセット2回→ゼロ回）の話
- 各実機テストは `keyboard-flash-test` スキルのチェックリスト（R→L順・GATTリセット・検証項目）を流用して手順書化する

---

## 8. 批判的レビュー

### 8.1 この設計が失敗する理由3つ（と対策）

**① 「顧客は指示通りに操作しない」— R/L取り違え・手順飛ばしで壊れた状態になる**
- 現実: リセット2回のタイミングが掴めない、Rを焼くべき場面でLを挿す、途中でウィンドウを閉じる
- 対策: (a) 単一ボリューム制約＋baseline差分で「想定外のデバイス」を機械的に拒否 (b) 書込後の**実機検証**（get_device_info.name照合）で取り違えを事後検出→「L用をRに焼いたようです。このボタンで焼き直せます」と自己修復導線 (c) 各ステップはボリューム出現/消失という物理イベントでしか進まないため、「手順飛ばし」が構造的に起きない (d) 中断→再開はリカバリモードで任意の半分からやり直せる（冪等: 同じuf2を何度焼いても安全）

**② 「OSの個体差で最初の一撃が失敗する」— macOS TCC拒否・WinのAV/ドライブ割当で初回体験が壊れる**
- 現実: TCCプロンプトで「許可しない」を押す／企業PCのAVがuf2書込をブロック／ネットワークドライブがレター占有
- 対策: (a) TCC: usage description整備＋書込前のアクセス試験（INFO_UF2読取）で拒否を検出し、システム設定の該当画面への導線を出す (b) Win: 書込失敗の分類ロジック（PermissionDenied vs WriteFailed）＋「ウイルス対策ソフトの一時停止」ガイド (c) β段階（M2/M3の段階リリース）で環境差を回収してから一般配布 (d) telemetryログで再現不能報告を潰す

**③ 「混在バージョンのsplitが想定外の状態になる」— 新R×旧Lでリンクが張れず、L自動化もL検証も効かない**
- 現実: splitプロトコルが将来のZMK更新で変わると、R更新直後にL側と通信不能→GetSplitInfo検証が偽陰性→ユーザーが「壊れた」と感じる
- 対策: (a) L検証失敗は「エラー」でなく「Lの更新に進んでください」に文言設計（R→L更新中の一時的な混在は正常状態と定義する） (b) リリースQAに「新R×旧Lのリンク試験」を必須項目化（manifest作成時のチェックリスト） (c) リンク不能でもLの書込自体はMSC直接なので完遂できる（自動遷移だけ手動に落ちる） (d) splitプロトコル互換が切れるリリースは requires_settings_reset=true＋notes_jaで明示

### 8.2 リスク登録簿

| # | リスク | 影響 | 対策 | 状態 |
|---|---|---|---|---|
| R1 | R/L取り違え書込 | 中（両手が親機化等。焼き直しで復旧） | 単一ボリューム制約＋事後name検証＋自己修復UI | 設計済み |
| R2 | GATT変更リリースでsettings_reset飛ばし | 高（ペアリング不整合＝機能的文鎮） | manifestフラグで宣言→full_flow強制。フラグ設定はCI自動判定＋人手確認の二重 | 設計済み |
| R3 | macOS TCC拒否 | 中（書込不能） | usage description＋拒否検出＋設定導線 | 設計済み・実機検証待ち |
| R4 | Win AV/SmartScreen | 中（初回体験悪化） | エラー分類＋ガイド＋（中期）コード署名 | 設計済み・M3で計測 |
| R5 | settings_reset後にbootloaderへ自動で戻らない個体/タイミング | 低（1操作増えるだけ） | 45sタイムアウト→手動ガイド。挙動は経験則であり保証なしとして扱う | 設計済み |
| R6 | 書込成功判定（アンマウント）の偽陽性/偽陰性 | 中 | 判定はシェル運用で実績のある方式を踏襲＋事後のRPC検証で二重化。タイムアウト時は1回だけ自動リトライ（シェル同等） | 設計済み |
| R7 | GitHub Releases依存（障害・仕様変更） | 低（更新が一時不能なだけ。使用中FWは無傷） | キャッシュ済みuf2で再試行可。将来ミラー（BASEサーバ等）をmanifest URLの抽象化で許容 | 受容 |
| R8 | Studio自体の配布/更新経路が未整備 | 中（min_studio_versionゲートが機能しない） | 別トラック課題として明示（本設計の範囲外。§9 U-6） | **未解決・要判断** |
| R9 | 電池切れのLが自動遷移に応答しない | 低 | GetSplitInfo.peripheral_connected==false 検出→「Lにケーブルを挿して手動で」ガイド（挿せば給電される） | 設計済み |
| R10 | invoke_behavior のデバイス名解決ミス（"bootload"文字列） | 低（Phase 2の自動化が動かないだけ。手動で回る） | 実装時に実機で最初に検証する項目に指定（M4冒頭） | 未確定 U-1 |

### 8.3 未確定点（実機・実ビルドでしか確定できないもの）

| # | 未確定点 | 確定に要るもの | 影響範囲 |
|---|---|---|---|
| U-1 | peripheral invoke時の `behavior_dev` 実文字列（"bootload"想定） | M4実装時の実機テスト（数分） | Phase 2のL自動遷移のみ |
| U-2 | 出荷済み個体のINFO_UF2.TXTのBoard-ID実値（Seeed工場版bootloaderがAdafruit上流定義 `nRF52840-SeeedXiaoSense-v1` と一致するか） | 手元実機でINFO_UF2.TXTを1回catする（M1初日に実施） | §3.3ガードの前方一致文字列 |
| U-3 | macOS TCCプロンプトの発火条件・拒否後の挙動（バンドル版/dev版の差） | M1実機テスト | 初回UX |
| U-4 | Winでのマウント/アンマウントのタイミング定数 | M3実機計測 | タイムアウト値 |
| U-5 | settings_reset後の「bootloaderに自動で戻る」再現率 | M5実機計測（10回試行） | full_flowの文言と待ち時間 |
| U-6 | 顧客へのStudio配布・更新チャネル（現状どう配っているか） | まさかずへのヒアリング | min_studio_versionゲートの実効性・署名優先度 |
| U-7 | 製品ケースでのリセットボタン/L側USBポートのアクセス性（ship-flash.shが組立済み実機で双方使用している事実から「可能」と推定） | 実機写真1枚で確定 | 手動ガイドのイラスト・文言 |

---

## 9. 事実の出典（主要なもの）

| 事実 | 出典 |
|---|---|
| 書き込み手順の正本（R→L・settings_reset・アンマウント判定・リトライ1回） | `farmware/minimal-keys-trackball-test/scripts/flash-farmware.sh:47-98`, `flash.sh:57-119` |
| &bootloader = sys_reboot(0x57)・EVENT_SOURCE locality | `farmware/zmk/app/src/behaviors/behavior_reset.c:33,39`, `app/dts/behaviors/reset.dtsi:19-24`, `app/include/dt-bindings/zmk/reset.h:13` |
| nRF52 GPREGRET書込 | zmkfirmware/zephyr `soc/arm/nordic_nrf/nrf52/soc.c` sys_arch_reboot（GitHub API取得） |
| XIAO Sense bootloader識別子（XIAO-SENSE / nRF52840-SeeedXiaoSense-v1 / 2886:0045） | adafruit/Adafruit_nRF52_Bootloader `src/boards/xiao_nrf52840_ble_sense/board.h`（GitHub API取得） |
| UF2 familyID=0xADA52840・targetAddr=0x27000（実測） | `firmware/minimal-keys_L rgbled_adapter-…uf2` 先頭32B xxd |
| split越しbehavior起動API | `zmk/app/src/split/central.c:91-121`, `peripheral.c:35-44` |
| 汎用イベントリレー（peripheral↔central） | `scratchpad/mod-settings-rpc/src/events/activity_settings_report.c`（ZMK_RELAY_EVENT_*） |
| ble-managementの既存RPC（GetSplitInfo/ForgetSplitBond等） | `scratchpad/mod-ble-mgmt/proto/zmk/ble_management/ble_management.proto` |
| core RPCにreboot系なし・reset_settingsの実体 | `zmk/app/src/studio/core_subsystem.c:47-81` |
| 1200baudタッチ不在 | `grep -rn "1200\|dte_rate" zmk/app/src` → 無関係1件のみ |
| Studioの現状（transport実装済み・flashコード皆無・capabilities・カスタムサブシステム基盤） | 現状把握ブリーフ全文＋ `src/rpc/useCustomSubsystem.tsx`, `src/AppHeader.tsx:61-118`, `src-tauri/tauri.conf.json` |
| 出荷FW＝同一構成・keymapの&bootloader位置（layer_4・右半分のみ） | GitHub API: hyhy-masa/minimal-keys-farmware `config/west.yml`, `config/minimal-keys.keymap:135-139`（公開リポ・未認証200） |
| 配布リポ公開・Releases 0件・タグ運用 | GitHub API: `/repos/hyhy-masa/minimal-keys-farmware`(200), `/releases`(空), `/tags` |
| Studio署名状態（ad-hoc "-"・NSIS） | `src-tauri/tauri.conf.json` bundle.macOS.signingIdentity / targets |
