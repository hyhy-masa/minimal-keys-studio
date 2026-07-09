# minimal-keys-flash 静的解析レポート（Fable5デバッガ）

- 対象: `/Users/masakazuhayata/farmware/minimal-keys-flash` branch `feature/mvp-flasher` (HEAD b99aa5d)
- 実行検証: `cargo test -p mk-flash-core` 24件緑 / `cargo build --workspace` 緑 / `cargo clippy` スタイル警告2件のみ / `npm test` (vitest) 10件緑 / `npx tsc --noEmit` クリーン / `src-tauri` は icons 欠落で compile 不能 → スクラッチパッドにコピー＋ダミーicon注入で `cargo check` 緑（commands.rs 自体の型エラー無しを確認）
- 方針: 捏造禁止。実機・実リリースが無いと確認できない事項は「未確認」と明記。

## 結論

**バグ: 有り（Critical 0 / High 5 / Med 5 / Low 8）**

「文鎮に直結する単独欠陥」は無し（アンマウント裁定＋DL時SHA-256が最後の砦として機能している）。ただし **計画書(docs/PLAN.md)に明記された安全ゲート3つ（GUI書込前のUF2検証・Board-IDプリフライト・min_tool_versionゲート）が全て未実装**で、多層防御の設計が1層（DL時SHAのみ）に痩せている。加えて macOS 本番配布では **GUIのダウンロードが確定的に失敗する**パスバグ、リトライ時に**必ずリカバリ袋小路に落ちる**フロー欠陥がある。

---

## High（5件）

### H1: GUI書込経路に UF2 検証が一切ない（計画の整合性3段の第3層欠落）
- **場所**: `src-tauri/src/commands.rs:65-92`（`flash_write_uf2`）、呼び出し側 `src/useFirmwareUpdate.ts:97-102`
- **症状**: `flash_write_uf2` は `std::fs::read(uf2_path)`（:73）の内容をそのまま `flash_uf2`（:78）へ渡す。`validate_uf2` / `Uf2Limits`（構造・familyID・アドレス窓・SHA再照合）を一度も通らない。CLI の `guided_flash`（`crates/mk-flash-cli/src/main.rs:180`）は書込直前に検証しており、**顧客が触るGUIだけ検証が無い**という逆転になっている。
- **再現条件（入力→誤結果）**: `firmware-cache/minimal-keys_R.uf2` がDL後〜書込前にディスク上で破損/改変される、またはmanifestのSHAが「間違った成果物」（release.ymlのNormalize last-win混入 = M5(c)）に対して正しく計算されている → GUIは無検証でそのままキーボードへ書く。CLIなら `InvalidUf2` / アドレス窓違反で止まるケース。
- **深刻度**: High（単独では文鎮化しないが、PLAN.md:125 の「TLS+SHA-256+UF2構造の3段」の第3層が顧客経路に無い。ブートローダ領域宛イメージをAdafruitブートローダが自衛拒否するかは**未確認**のため、文鎮可能性を否定できない）
- **修正方針**: `flash_write_uf2` に asset（または `Uf2Limits`＋expected sha）を渡し、読み込み直後に `validate_uf2(&data, &limits)` を実行してから `flash_uf2` へ。フロントは `pathsRef` と一緒に asset 情報を保持しているので配線のみ。

### H2: GUIウィザードに settings_reset の書込ステップが存在しない（DLだけして未使用）
- **場所**: `src/wizard/machine.ts:16-33`（step一覧に reset 書込が無い）、`src/useFirmwareUpdate.ts:58-66`（settings_reset をDLして `pathsRef` に入れるが以後未参照）、`src/App.tsx:84-96`（backup_gate文言「この更新はキーボードの設定を初期化します」）
- **症状**: PLAN.md:22/73 は「`requires_settings_reset=true` は R:reset→R本体→L:reset→L本体 の**4回書込**を自動オーケストレーション」と規定。CLI `flow --reset`（main.rs:148-164）は4回書くが、GUIは R本体→L本体 の2回のみ。ユーザーには「初期化します」と表示し、backup→restore まで誘導するのに、初期化自体を実行しない。
- **再現条件**: `requires_settings_reset=true` のmanifestでGUI更新を完走 → 新FW＋旧設定/旧ボンドが残置。GATT変更リリースでは新FWと旧設定の不整合（動作不良・再ペアリング不全）に直行する。
- **深刻度**: High（BUILD_STATE.md R2' の運用回避「reset必須リリースはStudio backup完成まで出さない」があるため即時被害は無いが、ツールの契約としては壊れており、フラグを立てた瞬間に顧客全員が踏む）
- **修正方針**: machine.ts に `r_reset_flashing` / `l_reset_flashing`（と各bootloader_guide）を追加し、hook で `pathsRef["settings_reset"]` を書く。または v1 では `requires_settings_reset=true` のmanifestを検出したらGUIが更新を**拒否**して案内を出す（暫定ガードとして最小）。

### H3: DL先 `destDir: "firmware-cache"` が相対パス — Finder起動のmacOSアプリでは確定的に失敗
- **場所**: `src/useFirmwareUpdate.ts:63`、受け側 `src-tauri/src/commands.rs:29-36` → `download.rs:29`（`create_dir_all(dest_dir)`）
- **症状**: 相対パスはプロセスCWD基準。Finder/Dock/Applications から起動した .app のCWDは `/` のため `/firmware-cache` の作成となり、読み取り専用システムボリュームで EROFS/EACCES → 毎回 `DOWNLOAD_ERR`。`npm run tauri dev`（CWD=src-tauri）でだけ動くため開発中は隠れる。WindowsもEXE設置場所依存（Program Files配置なら失敗）。
- **再現条件**: macOSで通常インストール（.app をFinderから起動）→「更新をはじめる」→ ダウンロード段で必ずエラー画面。
- **深刻度**: High（文鎮ではないが、本番配布形態でツールが機能しない。テスト緑のまま出荷し得る）
- **修正方針**: Rust側で `tauri::Manager::path().app_cache_dir()`（または `std::env::temp_dir()`）へ解決し、フロントから相対パスを渡さない。`fw_download_asset` の `dest_dir` 引数自体を廃止するのが安全（任意パス書込プリミティブの縮小にもなる＝L7と同根）。

### H4: リトライ経路の恒久トラップ — baseline差分が「同一パス再マウント」を検出できない
- **場所**: `src/useFirmwareUpdate.ts:73-87`（step入場時にbaseline採取）、`crates/mk-flash-core/src/volume.rs:22-54`（パス文字列の差分のみ）、`src/App.tsx:106-108`（guide画面に脱出ボタン無し）
- **症状**: `wait_for_new_volume` は「baselineに無いパス」だけを新規と見なす。ボリュームが既にマウントされた状態で guide step に入ると、そのパス（例 `/Volumes/XIAO-SENSE`）がbaseline入りし、以後**アンマウント→再マウントしても同一パスなので永遠に検出されない**。
- **再現条件（典型2つ）**:
  1. 書込エラー後（ボードはbootloaderのまま）→「最初に戻る」→ 再走 → `r_bootloader_guide` 入場時にbaselineへ取り込まれる → ユーザーが何度ダブルタップしても検出0 → 60秒後 `ENTER_RECOVERY`（リカバリUIは未実装スタブ）で袋小路。
  2. せっかちなユーザーが guide 画面表示前（r_confirm中）にダブルタップ → 同上。
- **深刻度**: High（顧客の失敗リトライという最頻シナリオで、必ずサポート行きになる。CLIも同構造だがコマンド再実行で回避可のためMed相当）
- **修正方針**: guide step入場時に「既にUF2ボリュームが1個だけ存在し、Board-IDが一致する」場合はそれを候補として明示確認して採用する／または「一度外して挿し直してください」の誘導＋ボリューム数が減った時点でbaselineを再採取する。core側なら `wait_for_new_volume` にmount世代（消えて再出現）の追跡を足す。

### H5: Board-ID プリフライトゲート未実装 — INFO_UF2.TXT を持つ他ボードにそのまま書く
- **場所**: `crates/mk-flash-core/src/volume.rs:22-54`（検査なし）、`fsops.rs:39`（`read_info_uf2` はトレイト定義のみで**全経路から未呼出**）、`error.rs:21-23`（`NotUf2Volume` は**一度も構築されないデッド変種**）、CLIは表示のみ（main.rs:70-73）
- **症状**: PLAN.md:90/131 が「Preflight(INFO_UF2再読・Board-ID前方一致)＝USBメモリ誤書込排除」を防御3号として明記し、BUILD_STATE.md R1' も実装済み前提のmitigationに挙げるが、コードに存在しない。待機中に現れた「INFO_UF2.TXTを持つ任意のボリューム」（RPi Pico の RPI-RP2、nice!nano、Adafruit系）へ minimal-keys FW を書く。
- **再現条件**: 更新待機中にユーザーが別のUF2デバイスをBOOTSEL/bootloaderで接続（キーボードユーザーには現実的）→ それが「唯一の新規ボリューム」なら無確認で書込。nRF52840系ボードならfamilyID一致でイメージを受理し、その機器は動作不能（要再書込。恒久文鎮ではないが誤書込そのもの）。RP2040系はfamily不一致で無視→UnmountTimeoutエラー。
- **深刻度**: High（「誤書込」最優先観点に直撃。ドキュメント化された防御の未実装）
- **修正方針**: `wait_for_new_volume` 返却後・`flash_uf2` 前に `read_info_uf2` を再読し `Board-ID` が `nRF52840-SeeedXiao` 前方一致でなければ `NotUf2Volume` で拒否（U-2実測後に定数確定）。デッドコード2つがそのまま使える。

---

## Med（5件）

### M1: ダウンロードに read/全体タイムアウトとサイズ上限が無く、GUIに脱出手段も無い
- **場所**: `crates/mk-flash-core/src/download.rs:39-62`、`src/App.tsx:66-68`（fetching/downloading画面はボタン無し）
- **確認**: ureq 2.12.1 実ソース（vendored `agent.rs:256-259`）で `timeout_connect=30s` 以外は **read/write/全体すべて None** を確認。「requests may block forever on reads by default」。
- **再現条件**: DL中にネットワークが無応答化（RSTなしの切断・キャプティブポータル）→ `spawn_blocking` スレッドが永久ブロック → UIは「ダウンロード中…」のまま。キャンセルコマンドは存在せず強制終了しか無い。`asset.size` は算出・配布されるのに未照合で、`read_to_end` は無上限（メモリ）。
- **修正方針**: `ureq::AgentBuilder::new().timeout(Duration::from_secs(120))` 等を明示。`bytes.len() != asset.size`（size>0時）で拒否。`Read::take(limit)` で上限。

### M2: `premature_slack`(256KB) ≥ ファイルサイズで早期リブート防御が完全無効（小さいUF2）
- **場所**: `crates/mk-flash-core/src/machine.rs:177`（`res.written >= total.saturating_sub(timings.premature_slack)`）
- **再現条件**: settings_reset.uf2 のような小型UF2（<256KB）の書込中に抜線等でRebootLikeエラー＋ボリューム消滅 → `total-slack=0` なので **written=0 でも成功候補** → `await_unmount` がボリューム不在で即true → **1バイトも書けていないのに `ProvisionalSuccess`**。同じ状況で大きいファイルなら `PrematureReboot` エラーになる（:196-199）非対称。CLI `flow --reset` では「reset成功」と偽装したままFW書込へ進む。
- **深刻度**: Med（ユーザー起因の抜線がトリガー。ただし顧客ツールの偽成功は怖い）
- **修正方針**: `slack = premature_slack.min(total/4)` のように比例上限を掛ける、または `total <= premature_slack` の場合は written==total を要求。

### M3: `raw_os_error()==None` のI/Oエラーが「クリーン完了」と混同される
- **場所**: `crates/mk-flash-core/src/fsops.rs:112-117`（`errno: e.raw_os_error()`）と `machine.rs:145-157`（`None` => 成功裁定パス）
- **再現条件**: `write_all` が `Ok(0)` を観測すると `ErrorKind::WriteZero`（raw_os_error=None）→ `WriteAttempt{written:部分, errno:None}` → 状態機械は「クリーン書込」と解釈。ボリュームが消えていれば premature ガードを踏まずに成功裁定へ。稀（通常はOSエラー番号が付く）だが、M2と同型の偽成功経路。
- **修正方針**: `errno: e.raw_os_error().or(Some(-1))` とし、-1 は `Other`（即失敗）に分類。

### M4: min_tool_version / schema ゲート未実装 ＋ デフォルト値がツール実バージョンと矛盾
- **場所**: 執行箇所ゼロ（`src/wizard/machine.ts:13` に型があるのみ）。`pipeline/generate_manifest.py:96` はデフォルト `--min-tool-version 1.0.0`、ツールは `src-tauri/tauri.conf.json:4` で `0.1.0`
- **症状**: PLAN.md:122「ツール版ゲート=manifest min_tool_version」が未配線。将来schema変更や危険な旧ツールを止められない。さらに、いざゲートを実装した日に、デフォルト生成のmanifest（1.0.0）が現行ツール（0.1.0）を**自分でブロック**する時限矛盾。`FwManifest.schema` も `>2` 拒否等が無い。
- **修正方針**: GUI/CLIの `fetch_manifest` 直後に semver 比較（不一致は更新拒否＋案内）。schema は `!=2` を明示拒否。generator のデフォルトをツール実バージョンに追従させる。

### M5: release.yml（テンプレ）の3点
- **場所**: `pipeline/release.yml`
  - (a) **:46** `version=${GITHUB_REF_NAME:-inputs.version}` — GitHub ActionsではGITHUB_REF_NAMEは常に非空（dispatchならブランチ名）。`workflow_dispatch` 時は入力を無視して **version="main"** のリリース/タグを作る。
  - (b) **:74-84** [GATT-RESET] 検出が `git log -1`（タグの最終コミットのみ・fetch-depth=1）。マーカーが最終コミットに無いと `requires_settings_reset` が**静かに欠落**したmanifestを配布（顧客はreset無しで更新）。コメントの「commit range」と実装が不一致。
  - (c) **:61-67** Normalize が複数マッチ時に **last-win で黙って上書き**（例: `minimal-keys_R*` に複数ビルド成果物が該当）。間違った成果物にSHAが付くとH1のGUI無検証と連鎖。
- **修正方針**: (a) `if push-tag then GITHUB_REF_NAME else inputs.version`。(b) 前回リリースタグ〜HEADの範囲grep＋fetch-depth:0、または検出失敗時はfail-close。(c) マッチ件数を数えて2件以上でエラー終了。

---

## Low（8件）

- **L1** `src/App.tsx:89` backup_gateのチェックボックスが**外せない**（ACK_BACKUPは常にacked=trueへ。UI上checkedのままロック）。誤操作時に取り消せない片方向ラッチ。
- **L2** `machine.rs:246` 再書込の進捗が `Retrying{attempt: u32::MAX}` — CLIは `4294967295` をそのまま印字（main.rs:208のDebug出力）。GUIは未表示だが進捗バーが0%に落ちる（App.tsx:26-30）。センチネル値をやめて別variantに。
- **L3** `machine.rs:87-93` macOSのTCC拒否は経験上 **EPERM(1)** で返ることが多く、`classify_errno` は EACCES(13) のみPermissionDenied扱い → TCC時にリトライ・案内文言が出ずに即 `WriteFailed` になる可能性。**実機未確認**（U-3で要実測。Windows表は「provisional」と自認済み・ERROR_GEN_FAILURE(31)等の欠落も同枠）。
- **L4** `src-tauri/icons/` が空でGUIビルド不能（BUILD_STATE.md:18に既知TODOとして明記あり）。ただし **ci.yml が src-tauri を一切コンパイルしない**ため、commands.rs の破壊もCIをすり抜ける（今回ダミーicon注入で緑は確認済み）。CIに `cargo check`（icon生成込み）を足すべき。
- **L5** `src/main.tsx:9` StrictMode有効 → dev限定でstep effectが二重発火（`flash_write_uf2` 二重呼び出しも起き得る。同一内容・512Bブロック整列のため実害はほぼ無いが、devとprodの挙動差の温床）。
- **L6** CLI `main.rs:142` `temp_dir/mk-flash-{version}` は予測可能な共有tmpパス（マルチユーザ環境でのsymlink/先取り。DL後にSHA検証済みバイトを書くので実害は書込先の乗っ取りのみ）。
- **L7** `download.rs:32` `dest_dir.join(&asset.name)` — manifest由来の `name` に `../` や絶対パスが入ると脱出可。加えて `fw_download_asset`（commands.rs:29）はWebViewから **任意URL＋自己申告SHA＋任意destDir** で呼べる=侵害時の任意ファイル書込プリミティブ。CSP('self')と最小capabilityで現状リスク低だが、name のbasename化＋destDir固定化が安価な防御。
- **L8** `uf2.rs` はUF2拡張フラグ 0x1（not-main-flash）ブロックを含む正規UF2を（アドレス窓違反として）拒否する厳格仕様。自前パイプライン産のみ扱う前提ではfail-safeで妥当（バグではなく仕様メモ）。

---

## 白判定（疑われたが問題なしと確認した箇所）

- **CLI `rest` 境界**（main.rs:24）: `args.len().min(1)` は len=0→`[0..]`空スライス、len≥1→`[1..]`。パニック不能。
- **flow の settings_reset 二重DL疑い**: 実際は1回DLして `reset_path` をR/L両方で再利用（main.rs:152-160）。二重DLなし。
- **EACCESリトライ**: attempt 0..=10 の有界ループ（最大11回試行・約20秒）。各リトライは `File::create` で全書き直し=安全。ボリューム消滅時は `NoBootloaderVolume` で脱出（machine.rs:163-174）。
- **`unmount_timeout=0`**: `await_unmount` は必ず1回presence確認後にfalse（machine.rs:267-276）。`poll=0` でも `max(1ms)` ガードで無限ループ不能。テスト `unmount_timeout_then_rewrite_succeeds` のモック消費順と実装の乖離なし（present系列の消費をトレースで照合済み）。
- **uf2.rs 検証**: targetAddr単調・非重複（prev_end比較）・checked_addでオーバーフロー検出・blockNo/numBlocks/payloadSize/flags/familyID全ブロック検査。テスト網羅も妥当。u32キャスト（>2TBファイル）のみ理論上の穴で実害なし。
- **generate_manifest.py 含意連鎖**: breaking_gatt→requires_settings_reset→requires_backup_restore は build 前に適用され整合（:103-106）。必須asset欠落は fail-close（:52, :67-68）。URL結合 `rstrip('/')+'/'+fname` 正常。
- **reducer**: 全dispatchイベントに受け手あり・取りこぼし遷移なし（hook/UIの全イベントを対応stepと突合）。R→L順序・backup_gateスキップ不可は構造的に成立（テスト10件も妥当）。`cancelled` フラグはstep遷移ごとのクリーンアップで正しく機能（ただしRust側キャンセルは存在しない=M1参照）。
- **classify_errno unix値**: EACCES=13/EIO=5/ENOENT=2/ENXIO=6/ENODEV=19/EPIPE=32 はmacOS/Linux共通で正値。WindowsのGetLastError系を `raw_os_error()` が返す前提も正しい。
- **Tauri設定**: CSP 'self'、capabilityは core:default+dialog:default の最小、Info.plist の NSRemovableVolumesUsageDescription あり。
- **written の過小計上**（fsops: 失敗チャンクの部分書込を数えない）: premature判定を厳しい側に倒すのみで安全方向。

## 検証ログ（実行事実）

- `cargo test -p mk-flash-core`: 24 passed（--features download でも追加failなし）
- `cargo build --workspace`: 成功 / `cargo clippy --workspace --all-features`: warning 2（too_many_arguments, manual is_multiple_of）のみ
- `npm test`: 10 passed / `npx tsc --noEmit`: エラーなし / `npm run build`: 成功（dist生成）
- `src-tauri cargo check`: 原本は icons/icon.png 欠落で proc-macro panic により失敗。scratchpadコピー＋32x32ダミーPNGで `Finished` （コード自体は型クリーン）
- ureq 2.12.1 デフォルト timeout: vendoredソース `agent.rs:256-259` で connect=30s / read=write=全体=None を実読確認

## 修正優先順位の提案

1. H3（macOSで即死・修正1行級）→ 2. H1（validate配線・半日）→ 3. H4（リトライトラップ・検出ロジック改修）→ 4. H5（Board-IDゲート・デッドコード接続）→ 5. H2（resetステップ追加 or フラグ拒否ガード）→ M群 → L群。
実機ゲート（U-2/U-3）前に H1/H3/H4 はハード無しで修正・単体テスト可能。
