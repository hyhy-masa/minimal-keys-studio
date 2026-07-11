# code-reviewer findings — firmware-update Studio統合 (HEAD 5d48146)

対象: `src/firmware-update/` 全13 + `src-tauri/src/flash/mod.rs` + `crates/mk-flash-core/`。
安全性最優先（顧客KBを不可逆書換）。format=「file:line / 失敗シナリオ / 重要度」。

## 集計
Critical: 0 / Major: 2 / Minor: 6 / Info(Deferred): 6

---

## Major

### M-1 書込中に Escape でモーダルが閉じる（非dismissableガードが発火しない）
- file: `src/firmware-update/FirmwareUpdateModal.tsx:162` + `src/misc/useModalRef.ts:15-21`
- 失敗シナリオ: `useModalRef(open,false,!flashing)` の `cancel`(Escape)抑止リスナは、`useModalRef` 内で **ダイアログが閉→開に遷移する瞬間だけ** 装着される（`if (ref.current && !ref.current.open)` ブロック内）。モーダルは idle（flashing=false, allowCancel=true）で開くため、リスナは一度も装着されない。以降 r_flashing/l_flashing/recovery_flashing へ進んでも、ダイアログは既に open なので再装着ブロックを通らない。結果、書込中に Escape 押下でモーダルが閉じる。X非表示(canClose 174-182)・中止disabled(317)は迂回される。
- 影響: Rust書込は spawn_blocking で継続（ride-out設計で安全に完走）＝文鎮化はしない。だが顧客は「書き込み中… ケーブルを抜かないで」の最中に画面が消失→パニックでケーブル抜去→PrematureReboot誘発の二次リスク。「書込中は閉じられない」という設計意図が無効化されている。
- 補足: 仮にリスナが付いても既存 `reopen`（close後に再showModal）は preventDefault せず、close イベントが `GenericModal onClose`→親 `setShowFirmwareUpdate(false)` を叩くため親state矛盾を起こす。
- 推奨: `flashing` 中は `cancel` イベントで `e.preventDefault()` する（close自体を止める）。かつ allowCancel 変化時に装着/解除が反映されるよう `useModalRef` の effect を修正（open遷移条件の外でリスナを付け外し）。他モーダルは allowCancel 定数なので挙動不変。回帰: 書込中Escapeでモーダルが残ることをドッグフードで確認。

### M-2 min_tool_version ゲートが "v" 接頭辞で無音失効
- file: `src/firmware-update/machine.ts:153`（`semverGe(TOOL_VERSION, min)`）／`machine.ts:22-39`（`semverGe` の `parts()` は非数字segで break）
- 失敗シナリオ: `min_tool_version` に `"v1.0.0"` のように先頭 "v" が付くと、`parts("v1.0.0")` は先頭seg "v1" が `/^\d+$/` に不一致で即break→`[]`。`semverGe(have, [])` は常に true を返す＝**ゲートが「制約なし」として無音で素通り**。古いツールが対応外FWの書込へ進む。
- 一貫性欠落: 表示比較の `versions.ts:15` は `stripV()` で "v" を剥がすのに、min_tool_version比較は剥がさない。同一コードベース内で規約不一致。しかもmanifestの `version` は "v1.4.0" 形式（manifest.rs テスト値）＝ min_tool_version も "v" 付きで書かれる自然な蓋然性が高い。
- 現状の緩和: 公開manifestは今 min_tool_version 未設定＝ゲート未活性（docs 11 参照）。`generate_manifest.py` 既定は "1.0.0"（v無し）。よって**現時点では未発火（潜在）**。ただしエラー無しで安全ゲートが消える点が危険（§2-4-3 修正コスト<リスク）。
- 唯一のゲート: Rust `version_ge` は export済みだが書込経路で未呼出（grep確認）。min_tool_version強制はこのTS 1箇所のみ。
- 推奨: 比較両辺を `stripV`（`semverGe(stripV(TOOL_VERSION), stripV(min))`）。回帰テスト追加（"v1.0.0" で blocked になること）。`generate_manifest.py` 側でも "v" 無し規約を強制。

---

## Minor

### m-1 SHA 検証の fail-open（flash_write_uf2）
- file: `src-tauri/src/flash/mod.rs:140`（`if !sha256.is_empty()`）
- シナリオ: sha空文字時に validate_uf2 の SHA 照合をスキップ。構造/familyID/アドレス窓/Board-ID は残るため文鎮化はしない（窓 0x27000〜、bootloader域は不可侵）。**実経路では発火しない**: 正規経路は `download_asset`（download.rs:46）が DL 時に SHA を fail-closed で照合済み＝空shaのassetは書込到達前に落ちる。assetがundefinedなら uf2Path も "" で `fs::read("")` がIoエラー。
- 判定: **Minor**。現状到達不能＋到達しても再書込可能な「悪いイメージ」止まり（不可逆でない）。ただし将来 download を経由しない書込経路（ローカルファイル書込等）が足された瞬間に統合層の整合チェックが消える潜在トラップ。
- 推奨: 安全境界のコマンドとして fail-closed（sha空なら `ManifestInvalid`/`InvalidUf2` を返す）に寄せる。1行で守れる。

### m-2 formatError の ManifestInvalid / Io が default 落ち
- file: `src/firmware-update/ja.ts:61-64`（default）／未対応variant=`error.rs:51`(ManifestInvalid),`error.rs:64`(Io)
- シナリオ: `fw_fetch_manifest`→`parse_manifest` が返す `ManifestInvalid`（schema≠2・central/peripheral欠落・JSON不正）と `Io` が case一覧に無く、objectなので `default`→「予期しないエラーが発生しました」。**前方互換の穴**: 将来 schema=3 のmanifestを配ると、既存Studioは全て ManifestInvalid→汎用文言になり、「アプリを更新してください」に誘導できない（schema拒否の user-facing 文言が汎用）。書込前・非文鎮なので Minor。
- 推奨: `ManifestInvalid`→「配信データを解釈できませんでした。アプリを最新に更新してください（LINE/Discord案内）」、`Io`→操作可能な汎用文言を明示追加。加えて FlashError全variant網羅の formatError テストを新設（variant追加時のドリフト検知）。

### m-3 一部UI状態に可視の中止/閉じる導線が無い（Escapeのみ・非発見的）
- file: `FirmwareUpdateModal.tsx:203-209`(fetching_manifest), `268-287`(r/l_confirm), `325-340`(swap_to_l)／`canClose` 除外 `174-182`
- シナリオ: これらの状態は X 非表示かつ「中止」ボタンも無い。Escapeでは閉じられる（allowCancel=trueで backdropは closeOnOutsideClick=false のため不可）が非開発者には発見不能。downloading(263)/bootloader_guide(301)は「中止」を出しており不一致。fetching_manifestはネット無応答時 ureq timeout(最大~60s)まで無操作待ちになり得る（その後 FETCH_ERR→error でボタン復帰）。リデューサ的行き止まりではない（下記 該当なし参照）が、UX上の袋小路。
- 推奨: 少なくとも fetching_manifest / *_confirm / swap_to_l に「中止」(cancel) または X を出し、downloading/guide と統一。

### m-4 TOOL_VERSION が手管理でアプリ/Cargo版と分離（単一ソース化）
- file: `src/firmware-update/machine.ts:11`（`TOOL_VERSION="0.1.0"`）
- シナリオ: min_tool_version ゲートの `have` 値。アプリ版(0.3.0→0.4.0)/Cargo版と独立の手管理定数。低くドリフトすると誤ブロック（安全側）、**高くドリフトすると誤通過**（対応外FWを書込へ）。docs 11 C-10 が既知課題として「B-1でリリース時に同期」を明記済み＝運用でカバー中。手動同期はエラー源。
- 推奨: build時注入で version 単一ソース化（getVersion/env）。M-2 と同根なので併せて対処。

### m-5 Studio の GATT/serial セッションを flash 前に切断しない＋再接続案内なし
- file: `FirmwareUpdateModal.tsx`（onDisconnect未配線）／`AppHeader.tsx:107-110`（modalに接続協調なし）
- シナリオ: flash は USBマスストレージ経由で、GATT(BLE)/serial とは別チャネル＝**同一ハンドルの資源競合は無い**（そこは健全）。ただし bootloader投入でFWが再起動→BLE/serial接続が自然切断されるのに、Studioの `ConnectionContext.conn` は stale のまま。更新完了後の再接続導線も無い。serial(USB)接続中に同じ物理ポートを reset した場合、Studio側ハンドルは失効するが書込チャネルとは別なので競合しない。
- 判定: 安全上の競合は無く UX/統合ギャップ。**Studio統合固有の新面**。
- 推奨: 更新フロー開始時（modal open か PROCEED）に能動的に `onDisconnect` して stale セッションと半開ハンドルを畳む。done で再接続を案内。実機（ドッグフード）で「接続状態から更新開始」を1回試す（残リスクV2-3）。

### m-6 recovery の wait_for_new_volume(baseline=[]) が Board-ID非フィルタ
- file: `src/firmware-update/useRecoveryActions.ts:64-67`（baseline:[]）／`crates/mk-flash-core/src/volume.rs:22-54`（`wait_for_new_volume` は path差分のみ、board_id非考慮）
- シナリオ: recovery ② は baseline=[] で `acquire_bootloader`。present側は Board-ID フィルタ済み（`matches`）だが、present一致0で `wait_for_new_volume` に落ちると、そこは baseline差分のみで**foreign UF2（RPI-RP2 等）を「新規」として拾い得る**。ただし直後の `flash_write_uf2`→`preflight_board_id`(machine.rs:253) が foreign を `NotUf2Volume` で確実に弾く＝**書込前ゲートで安全**。R/L両挿しは present.len()==2→`MultipleBootloaderVolumes` で拒否（取り違えガード維持）。
- 判定: 安全は書込時ゲートで担保。foreign挿入時にやや不親切なエラーになるだけ。Minor（堅牢性）。
- 推奨: wait側にも board_id_prefix を渡して早期に絞る（任意）。

---

## Info / Deferred（設計・横連携）

- **I-1 FW署名なし（供給網）**: 完全性はmanifestのSHA-256（HTTPS GitHub取得）のみ。`download.rs`はSHA照合、`machine.rs`はBoard-ID照合だが、UF2自体の署名検証は無い（Adafruit bootloaderも署名非検証）。HTTPS/アドレス窓/familyID/Board-IDで**文鎮化は防止**するが、供給元汚染時は窓内の悪性FWを書込み得る。小規模事業では許容だが「不可逆書換」ゆえ将来的にmanifest署名 or 公開鍵検証を検討（docs 00 で署名優先度は別途判断）。Deferred。
- **I-2 min_studio_version 宣言のみ・未強制**: `manifest.rs:60` に存在するが TS/Rust いずれも未参照。設計(03/R8)で「範囲外・要判断」と明示済み。人手(LINE/Discord)誘導前提。意図的なら可。
- **I-3 R/L取り違えはコードで防げない**: `machine.rs:75` の Board-ID は R/L共通(Seeed_XIAO)。recovery ②で側を誤選択すると central FW を peripheral半分へ書込み得る（非機能・再書込可）。既知C-1、故意失敗②でテスト。設計限界。
- **I-4 supportLog に実PIIは無し（現状）**: `supportLog.ts` は userAgent(89)・full INFO_UF2.TXT/board_id(42-43,volumes)・manifest/steps/errors。macOSボリュームパスは `/Volumes/XIAO-SENSE`（/Users・ユーザー名を含まない）、board_idは機種prefixで**個体シリアル無し**。最も識別的なのは userAgent と INFO_UF2.TXT。将来 bootloader が INFO_UF2.TXT に個体シリアルを載せると自動で log に流入する点だけ注意（現行fixtureにシリアル無し）。**PII観点は該当なし**。
- **I-5 fwinfo 空応答時の文言**: `fwinfo.ts:83-109` は堅牢（未知field skip＝前方互換、ゴミ/切詰は throw→`useFirmwareVersion`try/catchで捕捉→「不明」）。ただし subsystem在＋空応答だと `FirmwareUpdateModal.tsx:225` が version不明でも「新しいバージョンがあります」表示。安全（書込は正）だが軽微に不正確。
- **I-6 fw_download_asset の多重呼出（C-9既知）**: BusyGuard非対象。normal download と recovery on-demand DL が同roleで競合すると同一ファイルへ並行書込→破損の可能性だが、書込時 validate_uf2 が構造/SHAで検知。実UIフロー上の競合窓は小。既知C-9。

---

## 該当なし（明示）

- **リデューサの行き止まり**: 無し。`reduce`(machine.ts:141-235)は全19 step を網羅（switch exhaustive）、`RESET`(142)と`ENTER_RECOVERY`(143)が**全状態から**idle/recoveryへ脱出可能。terminal群(done/blocked/error/recovery_done)も明示。UI側の m-3 は導線の非発見性であって遷移の袋小路ではない。
- **全書込経路の安全ゲート**: 通常R・通常L・recovery片側の**3経路すべて**が単一コマンド `flash_write_uf2`(mod.rs:120-166) を通り、書込前に `validate_uf2` 無条件実行(149)＋`flash_uf2`→`FlashConfig::default`のBoard-ID preflight(machine.rs:172-174,253)。単一チョークポイントで劣化なし。アドレス窓は asset無指定でも `Uf2Limits::default`=0x27000〜0xF4000 が生きる。
- **recovery 3経路のゲート**: ①retry=純dispatch(I/Oなし) ②片側書込=同コマンド経由で全ゲート通過 ③log保存=書込なし。バイパス無し。
- **パストラバーサル**: `download.rs:56` が `file_name()` で `../` を除去済み。
- **Web露出**: `isTauri()`×`VITE_FEATURE_FW_UPDATE` の二重ゲート(isTauri.ts:19-21)、AppHeaderも `fwUpdateEnabled` でボタン/モーダル両方ガード。露出ゼロ。
- **文鎮防止コア**: `machine.rs` の成功判定（partial+volume消失→PrematureReboot、閾値未達rewriteは成功にしない、errno None以外を成功と誤認しない）は M2/W1/M3 回帰テストで担保。健全。
- **cancelフラグの staleリスク**: `flash_wait_for_bootloader`/`flash_write_uf2` が各先頭で `cancel.reset()`(mod.rs:102,132)＝downloading中止で立てたフラグは次opで解除。BusyGuardで同時実行1本＝共有Arc安全。

---

## テスト不足（提案）
- M-2 を潰す "v"接頭辞 min_tool_version の回帰（machine.test.ts）。
- ja.ts の formatError テスト皆無（grep）。FlashError全13variant vs case網羅テストで m-2 と将来ドリフトを機械検知。
- Escape-during-flash はユニット困難＝ドッグフード観察項目に明記（書込中Escapeでモーダル残存）。

## 横連携（提案）
- **FW/キーボード部**: `fwinfo.ts` の FROZEN wire format はZMK subsystem実装が byte単位一致必須。不一致なら version「不明」に安全縮退（文鎮化しない）が、更新有無判定が常に不確定化。実装時に本schemaで突合を。
- **リリース/farmwareパイプライン**: schema=2 / Board-ID prefix "Seeed_XIAO_nRF52840" / 窓 0x27000-0xF4000 は `generate_manifest.py` と共有契約。bootloader差替・partition変更時は両側同時更新。M-2対応として min_tool_version は "v"無し規約を pipeline 側でも強制。
