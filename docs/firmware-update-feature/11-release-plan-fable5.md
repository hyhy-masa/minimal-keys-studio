# 11. 顧客リリース設計書（Fable 5 / 2026-07-11）

- 対象: `minimal-keys-studio` branch `feature/fw-update-integration` HEAD `5d48146`（origin push済み・mainとの差分48ファイル/+6669行）
- 方針: 憶測ゼロ。全主張は本日の実コードRead / 実コマンド実行で確認。確認できないものは「未確認」と明記
- 本日の実測: vitest **253/253緑**・mk-flash-core cargo test **35/35緑**・`npm run lint` 緑・`npm run build` 緑・src-tauri `cargo check` 緑（警告6のみ）・公開manifest.json実在確認（curl取得成功）

---

## (1) 結論サマリ — まさかず向け

### ひとことで
**リリースを止める欠陥はコード上ゼロです。** 以前の監査（05/06）で挙がった重大バグは、現在のコードで全部塞がっていることを1件ずつ実コードで確認しました。残っている関門は「実機での非開発者テスト」だけです。

### 文鎮（キーボードが二度と動かなくなる）リスク
**極めて低い**と判断します。理由は三重の防御が顧客の通り道に全部入っているから：
1. ダウンロード時に「中身が本物か」を照合（SHA-256＋サイズ）
2. 書き込み直前にもう一度、ファイルの構造・宛先アドレス・本物照合を検査 — ブートローダー（復旧の要）がある領域には書けない仕組み（デフォルト窓 0x27000〜0xF4000）
3. 書く相手が本当にminimal-keysのキーボードかを照合（Board-ID検査）
さらに書き込みに失敗しても、ボードは「リセット2回押し」でいつでも書き込みモードに戻れて、アプリ内の「片方だけ書き直す」で復帰できます。

### 最短スケジュール（品質ゲートは削らない）
| 日 | やること | 誰が |
|----|---------|------|
| 今日 | この設計書の承認 → バージョン番号上げ → テスト版を手元でビルド → **まさかず自身が自分の実機で1周完走** | まさかず＋Claude |
| 明日 | **非開発者テスト**（家族・知人1名に手順書なしでやってもらう＋わざと失敗3種） | まさかず観察 |
| 翌日 | mainマージ → タグ打ち → CIがアプリを自動ビルド → 下書きリリースを確認 → **publish判断** | まさかず承認＋CI |

実働2〜3日。修正が出たらその分だけ後ろにずれます。

### まさかずがやること（3つだけ）
1. **自分の実機で更新を1周やってみる**（テスト版アプリ・約10分）
2. **1人に手順書なしでやらせて、横で黙って見る**（口出し禁止・約1時間）
3. **下書きリリースを見てpublishボタンを押すか決める**

### GO/NO-GO判断ポイント（4箇所）
- **GO-1（今日）**: この設計書でOK → 準備コミット承認
- **GO-2（自分で完走後）**: 詰まらず完了できた → 非開発者テストへ
- **GO-3（非開発者テスト後）**: 合格基準クリア → mainマージ＋タグ承認
- **GO-4（下書きリリース確認後）**: ファイル4点が揃い・DLして起動できた → publish（顧客案内）へ

### 先に決めてほしいこと（2点）
- **Mac先行でよいか**: 設計書03の既定はMac先行→Win後追い（§402）。WinはWin実機テスト（Defender有効）をやるまで正式案内しないのが安全。→ Winテスト機の有無を教えてください
- **初回起動の案内文**: Macは署名が簡易（ad-hoc）のため初回起動に一手間必要。**v0.3.0で既に2回、同じ形で配布済み＝顧客は通過できている前例あり**。案内文案は本書B-6にあります

---

## (2) A. 現状分析 — 05/06指摘の現HEAD判定表

判定は全件、本日実コードをReadして確認。「解消済み」の根拠は現リポのファイル:行。

### 指定確認3件（ブリーフ筆頭）

| # | 指摘（旧リポでの症状） | 現HEED判定 | 根拠 |
|---|---|---|---|
| 1 | **macOS DL失敗パスバグ**（相対パス`firmware-cache`→Finder起動で全滅）〔05-H3/06-C4〕 | **解消済み** | `src-tauri/src/flash/mod.rs:76-85` — `app.path().app_cache_dir()?.join("firmware")` でRust側解決。フロントはパスを渡さない（`useFirmwareUpdate.ts:127-133`） |
| 2 | **リトライ時リカバリ袋小路**（マウント済みボードがbaselineに食われ永久検出不能→スタブrecovery行き）〔05-H4/06-W4/06-C6〕 | **解消済み** | ①`crates/mk-flash-core/src/volume.rs:64-95` `acquire_bootloader` がマウント済み・Board-ID一致の単一ボリュームを養子縁組（回帰テスト `volume.rs:217-234` 「H4/W4 regression」）②recovery側は `useRecoveryActions.ts:64-67` で `baseline: []` 指定＝常に既存ボリューム採用可 ③recovery自体が3モード実装済み（下記#10） |
| 3 | **DL無限ブロック**（timeoutなし・キャンセル不可・サイズ未照合）〔05-M1/06-W6/W7〕 | **解消済み** | `download.rs:20-26`（connect 15s/read 60s/write 60s明示）・`:16`＋`:74-83`（16MB上限）・`:40-44`（manifestサイズ照合）・`mod.rs:168-171` `flash_cancel`コマンド＋DL/待機画面に「中止」ボタン（`FirmwareUpdateModal.tsx:263,301`）。書込中の中止はdisabled（正しい方向） |

### その他の05/06指摘

| # | 指摘 | 現HEAD判定 | 根拠 |
|---|---|---|---|
| 4 | GUI書込前のUF2検証ゼロ〔05-H1/06-C1〕 | **解消済み** | `mod.rs:134-149` — 読込直後に `validate_uf2`（構造＋familyID＋アドレス窓＋SHA）。SHA・窓はmanifest値をフロントが渡し（`useFirmwareUpdate.ts:174-176`）、無指定時もデフォルト窓 0x27000〜0xF4000＋nRF52840 familyID（`uf2.rs:29,36-37`）で防御 |
| 5 | settings_reset 4段書込がGUIに無い〔05-H2/06-C3〕 | **解消済み（ブロック方式）** | `machine.ts:161-166` — `requires_settings_reset=true` は in-app ハードブロック→`blocked`画面＋LINE/Discord誘導文言（`ja.ts:27-28`）。テスト有（`machine.test.ts:44`）。現行公開manifestは `false`（本日curlで確認）なので発火しない |
| 6 | Board-IDプリフライト未実装〔05-H5/06-C2〕 | **解消済み** | 検出時: `mod.rs:108` prefix指定。書込直前（TOCTOU-safe）: `machine.rs:171-173` `preflight_board_id` → 不一致は `NotUf2Volume`。定数 `Seeed_XIAO_nRF52840` は**実機実測値**（2026-07-09 U-2、`machine.rs:69-75`）。テスト `machine.rs:573-589` |
| 7 | 小型UF2で早期リブート防御無効〔05-M2〕 | **解消済み** | `machine.rs:147-150` — slackを `total/4` でクランプ |
| 8 | errno=NoneのIOエラーがクリーン完了と混同〔05-M3〕 | **解消済み** | `fsops.rs:102-105` — `raw_os_error().or(Some(-1))` |
| 9 | min_tool_versionゲート未実装〔05-M4/06-C5〕 | **解消済み（＋残留ドリフト1点）** | `machine.ts:151-155` semver比較→`blocked`。テスト有（machine.test.ts:50,56）。公開manifestに `min_tool_version` フィールド**無し**＝ゲート素通り（ブロック事故なし・本日確認）。残留: `TOOL_VERSION="0.1.0"`（machine.ts:11）とアプリ版0.3.0の不一致 → リリース準備で同期（B-1） |
| 10 | リカバリがスタブ「UI準備中」〔06-C6〕 | **解消済み** | `RecoveryPanel.tsx` 3モード実装（①今の手順を再試行 ②片側書き直し ③サポートログ保存）＋常設「最初からやり直す」。ログ保存は実物（`supportLog.ts` → 既存 `downloadJson`、fs capability確認済み `capabilities/default.json`）。片側書き直しは正規コマンド経由＝全安全ゲート通過（`useRecoveryActions.ts:8-10,73-81`） |
| 11 | single-instance未導入〔06-C7〕 | **半分解消（非ブロッカー）** | プロセス内single-flight実装（`mod.rs:44-60` BusyGuard＋cancel）。`tauri-plugin-single-instance` は**未導入**（Cargo.toml確認）→ アプリを2重起動すると2プロセスが並行書込可能。発生条件が不自然（顧客が同アプリを2つ起動し両方で同時更新）なのでリスク表C-5で管理 |
| 12 | 先待ち偽成功の窓〔06-W1〕 | **解消済み** | `machine.rs:228-240,311-357` — 部分書込→ボリューム消滅は `PrematureReboot`（失敗）。rewrite前のアンマウントを成功と数えない |
| 13 | [object Object]エラー表示〔06-W3〕 | **解消済み** | `ja.ts:38-65` `formatError` — kind別の日本語＋次の行動 |
| 14 | manifest schema未検証〔06-W8〕 | **解消済み** | `manifest.rs:89-93` schema≠2拒否＋テスト（:187） |
| 15 | GUIバイナリ未コンパイル・icon欠落〔06-W2/05-L4〕 | **解消済み** | icons実在（`src-tauri/icons/`）・`cargo check` 本日緑・release.ymlのtauri-actionがCIでmac/win両方コンパイル。**残留**: CIにRustユニットテスト（35件）が無い（workflows内にcargoコマンドゼロ＝本日grep確認）→ 非ブロッカー、C-7 |
| 16 | FW側release.ymlのGATT検知漏れ等〔05-M5/06-W5〕 | **対象外（別リポ・未確認）** | 指摘先は `minimal-keys-farmware` リポのパイプライン。今回のStudioリリースには無関係（現manifest `requires_settings_reset=false` は正しい値）。**次回FWリリース時の課題**として残る（今回は未調査＝未確認）。最後の砦の in-app ブロック（#5）は実装済み |

### 環境・配布面の確認（その他ブロッカー探索）

- **manifest取得先の実在**: `https://github.com/hyhy-masa/minimal-keys-farmware/releases/latest/download/manifest.json` → 本日curlで取得成功。schema 2 / v1.0.0 / R・L・settings_reset の3アセット（SHA・サイズ付き）/ `requires_settings_reset: false`
- **manifestにtarget_addr_min/maxフィールド無し** → デフォルト窓（=nRF52840のアプリ領域のみ）が適用される。**ブートローダー領域は書けない**＝文鎮防御は生きている
- **署名（mac）**: `tauri.conf.json:36` `signingIdentity:"-"`（ad-hoc・notarizationなし）。**前例あり**: v0.3.0（2026-07-05公開・同一設定＝git showで確認）と v0.2.0 の2回、.dmgを既に顧客配布済み → 初回起動関門は既存顧客が現に通過している
- **署名（win）**: `trusted-signing-metadata.json` は存在するが**未配線**（release.ymlにAZURE系env無し・tauri.conf.jsonにsignCommand無し・中身のアカウント名は"ZMKStudio"＝上流の残骸）→ **win .exeは無署名**＝SmartScreen警告が出る。これも前例2回あり
- **Web版への影響**: `isTauri.ts` の2重ゲート（Tauri内 AND `VITE_FEATURE_FW_UPDATE==="1"`）。mainマージ→Pages再デプロイでもWeb版にflasherは出ない
- **フラグ**: `6ef4e36`（vite.config.ts define）で prodビルド=1 / dev=0 を確認
- **リリースCIのゲート**: release.ymlのtestジョブ＝`npm run lint`＋`npm test`＋`npm run build` → 3つとも現HEADで本日実測緑＝タグを打てばCIは通る見込み
- **旧FWでの表示**: 現行出荷FWは `zmk__fwinfo` 非対応（`useFirmwareVersion.ts:25`）→ 「最新版を書き込めます」経路で更新可能（バージョン不明でも動線が閉じない設計を確認）

### 「今このままタグを打って配ったら」（性悪説）

1. タグpush → CIビルド → **下書き（draft）リリース**ができるだけ。**顧客には何も届かない**（publishが最終スイッチ）
2. publishまでした場合に顧客側で起きうる最悪ケースの列挙:
   - mac初回起動で「開発元を確認できない」→ 案内文が無いと問い合わせ多発（→B-6で対処）
   - 更新中にケーブルを抜く→エラー→recoveryで復帰（実装済み・ただし**実機での復帰実証が未実施**→B-4で回収）
   - 違う半分をリセット→反対側イメージが書かれるが、旧FWの反対側が残るだけで**危険域には書かれない**。recoveryの片側書き直しで復帰（詳細はB-4故意失敗②）
   - **文鎮直結の単独欠陥: 見つからず**（06の判定「文鎮直結欠陥なし」が現HEADでも維持、かつ当時の未配線ゲートが配線済み）
3. 未実施なのは「実機での通しE2E」と「非開発者テスト」のみ。**私が本日確認したのはコード・テスト・ビルドまで**（実機通しは前セッションの申告のみ＝本設計書では未確認扱い）。これを飛ばしてpublishするのは禁じ手 — M2受け入れ基準（03-design:452）が未達のまま出荷になる

---

## (3) B. クリティカルパス＆テスト設計

### B-1. クリティカルパス（順序付き）

| Step | 何を | 誰が | 所要 | 完了判定 |
|------|------|------|------|---------|
| 0 | 本設計書の承認（**GO-1**） | まさかず | 15分 | 「進めて」の一言 |
| 1 | リリース準備コミット: ①version 0.3.0→0.4.0（tauri.conf.json＋package.json）②`TOOL_VERSION` 0.1.0→0.4.0（machine.ts:11）③リリースノート文案 | Claude | 30分 | lint/test/build緑（3コマンド再実行） |
| 2 | テスト版ビルド `npm run tauri build`（ローカル・下記B-2） | Claude実行/まさかずのMac | 15〜30分 | .app/.dmg生成・起動してモーダルが出る |
| 3 | **ドッグフーディング**: まさかず自身が旧FW実機1台を更新完走 | まさかず | 30分 | 完走＋チェックリスト2項目OK（**GO-2**） |
| 4 | **非開発者テスト**（B-4の台本） | テスター1名＋まさかず観察 | 1〜2時間 | B-4合格基準（**GO-3**） |
| 5 | テスト結果の反映: 文言・写真の微修正のみ→続行／フロー欠陥→修正してStep 2へ戻る | Claude | 0〜半日 | 修正時はStep 3から再走 |
| 6 | mainへPR→マージ: `gh pr create --base main --head feature/fw-update-integration`（まさかず承認後マージ） | Claude提案/まさかず承認 | 30分＋CI | deploy.yml緑・Web版Studioに変化なし（minimalkeys.jp側は無関係） |
| 7 | タグ打ち: `git checkout main && git pull && git tag v0.4.0 && git push origin v0.4.0` | Claude（まさかず承認後） | 5分＋CI 30〜60分 | Actions「Build & Release」緑（testジョブ→mac/winビルド） |
| 8 | **draft検証**: GitHub Releasesの下書きにアセット実在（dmg / app.tar.gz / exe）→ dmgを実際にDL→**初回起動関門込みで**起動スモーク＋B-6案内文の実地確認 | まさかず＋Claude | 30分 | 起動して更新モーダルまで到達（**GO-4**） |
| 9 | （ここまでが本計画のスコープ）publish＋顧客案内はGO-4後に別途 | — | — | — |

**合計: 実働1.5〜2日＋CI約1時間。カレンダー2〜3日。**

### B-2. テスト版アプリの渡し方 — **ローカルビルドに決定**

- **決定**: Step 2〜4は `npm run tauri build`（ローカル）の.appを使う。タグ経由は使わない
- **理由**: ①タグ経由はCI 30〜60分×修正のたびに往復 ②draftリリースのアセットはリポ権限がないとDLできず、結局手渡しになる＝ローカルと配布の手間が同じ ③Rustは既にローカルでビルド済み（キャッシュ有・cargo check 0.49s）で速い
- **注意**: ローカル版はarm64のみ／本番はuniversal。flashロジックに差はないが、「本番と同一物」の確認はGO-4のdraft版スモーク（Step 8）で必ず担保する

### B-3. 非開発者テスト（MVP完了条件）の最小実施設計

**受け入れ基準（03-design:452 M2）**: 旧FWの実機1台を非開発者が**手順書なしで**最新化でき、故意の失敗3種から**全て復帰**できる。

**準備（まさかず）**: 旧FW実機1台／テスト版アプリ入りMac／USBケーブル1本／この観察表を印刷かメモ。

**観察ルール（重要）**:
- 手順書は渡さない。「キーボードのアプリでファームウェアを最新にしてみて」とだけ言う
- 口出し禁止。質問されたら「画面に書いてあることだけでやってみて」と返す
- 30秒以上詰まって進めない場合のみ介入し、**その箇所を記録**（＝改善対象）

**観察表（正常系1周）**:

| 画面 | 見るポイント | 詰まり(秒) | 発話・迷いメモ |
|------|-------------|-----------|---------------|
| 更新ボタンを見つける | ヘッダから発見できるか | | |
| 「更新する」を押す | 所要5分・USB必要の理解 | | |
| 右だけUSB接続 | 「右半分だけ」を守れるか | | |
| リセット2回押し（写真画面） | 写真だけで場所と速さが分かるか | | |
| 書込中 | 警告文言（抜かない）を守るか | | |
| ケーブル左差し替え（図） | 図だけで行動できるか | | |
| 左のリセット→書込 | 右との差で迷わないか | | |
| 動作確認チェック | 2項目を実際に確かめるか | | |
| 完了 | 完了と分かるか・所要時間合計 | | |

**故意失敗3種の台本と期待挙動**（正常1周の後に実施。テスターには「わざと失敗してもらう実験」と説明してよい）:

| # | 仕込み | 期待する挙動（コード上の設計） | 復帰の合格ライン |
|---|--------|------------------------------|----------------|
| ① 途中でケーブル抜く | R書込中（進捗30%前後）でUSBを抜く | エラー画面（「書き込みが最後まで完了しませんでした」）→「うまくいかないとき」→②片側書き直し（R）→リセット2回→書込→復帰 | テスターがアプリ内の案内だけで右半分を復活させられる |
| ② 違う半分をリセット | 「右側を書き込みモードに」の画面で**左**をリセット2回 | 左がminimal-keysなので検出は通り、**Rイメージが左に書かれる**（Board-IDでは左右を区別できない＝既知の設計限界）。その後のL工程で左に正しいLイメージが上書きされ、**右が旧FWのまま残る**。危険域への書込は無し | 動作確認チェックか違和感→「うまくいかないとき」→片側書き直し（R）で右を最新化できる。※ここが一番回りくどい復帰経路なので観察を厚めに |
| ③ タイムアウト | 「リセット2回押し」画面で60秒何もしない | `NoBootloaderVolume` → recovery画面へ自動遷移（「もう一度試す」ボタンが出る） | 「①いまの手順をもう一度試す」→リセット2回→続行できる |

**合格基準（GO-3）**: 正常系を介入なしで完走／故意失敗3種すべてアプリ内の案内だけで復帰／30秒詰まり（要介入）ゼロ。文言・写真の分かりにくさは「修正リストに載せて続行」でよい（フロー自体の欠陥のみStep 2へ差し戻し）。

### B-4. 品質を落とさず省略・後回しにできる項目（根拠つき）

**後回しOK（機能は写真＋テキストで既に成立、根拠=実装確認済み）**:
- A4「リセット2回押しGIF」→ 実物写真（`fw-reset-right/left.webp`・オレンジ丸マーキング済み）＋文言で機能する。非開発者テストで写真だけで通るかを実証し、通れば正式に後日強化へ
- Windows正式案内 → **Mac先行**（設計03 §402の既定通り）。release.ymlは両OSビルドするのでwinバイナリ自体はdraftにできる。M3受け入れ基準（Win10/11実機＋Defender有効）が未実施のため、**winを正式案内するのはwin実機テスト後**。→ まさかずのwinテスト機の有無で判断
- macOS notarization（Apple Developer Program加入・年99ドル）→ 当座は案内文で回避（前例2回）。問い合わせが目立てばv0.5で整備
- single-instanceプラグイン／CIへのcargo test追加／TOOL_VERSION自動同期 → 次版の改善タスク（リスク表C-5/C-7）
- fwinfoバージョン表示の充実 → 現行FWが非対応でも動線が閉じない設計を確認済み

**削らない（品質ゲート）**:
- 非開発者テスト＋故意失敗3種（M2受け入れ基準そのもの）
- draft版のDL→初回起動込みスモーク（配布物そのものの検証）
- 書込前検証・Board-ID照合などのコード側ゲート（全部実装済み・触らない）

### B-5. デプロイ直前までの具体手順（コマンド・CI名）

```bash
# Step 6: PR→マージ（まさかず承認後）
cd ~/claude-code/minimal-keys-studio
gh pr create --base main --head feature/fw-update-integration \
  --title "feat: firmware-update wizard (flasher) for desktop" 
# マージはGitHub UI（まさかずの目視）を推奨

# Step 7: タグ打ち → 「Build & Release」ワークフローが自動起動
git checkout main && git pull
git tag v0.4.0
git push origin v0.4.0
# 監視: GitHub Actions「Build & Release」（testジョブ→build-tauri mac/win）
# 注: sandbox内ではgh CLIがTLSエラーになる既知事象あり→curlのREST APIか実Terminalで

# Step 8: draft確認（publishはしない）
# GitHub → Releases → 「minimal-keys カスタマイズ v0.4.0」(Draft)
# アセット: *_universal.dmg / *_universal.app.tar.gz / *_x64-setup.exe の実在を確認
# dmgをDL→初回起動関門込みでスモーク → GO-4
```

- 「mainマージ」はWeb版Pagesの再デプロイ（deploy.yml）を起こすだけで、flasherは出ない（isTauriゲート・確認済み）。**顧客にflasherが届く唯一の経路はタグ→release.yml→publish**
- publish（draftの公開ボタン）と顧客案内文の送信は**GO-4の後**。本計画のスコープ外

### B-6. 署名/Gatekeeperの当座対処 — 案内文で回避（notarizationは後日）

**判断**: 最短優先の今回は**案内文で回避**。根拠: ①v0.2.0/v0.3.0で同一設定（ad-hoc署名）のdmgを既に配布済みで顧客は通過できている ②小規模直販でLINE/Discordの直接案内が届く ③notarization整備は年99ドル＋証明書手続きで数日を要する。

**案内文案（mac・リリース案内に同梱）**:

> 【はじめてアプリを開くとき】
> ダウンロードした「minimal-keys カスタマイズ」を最初に開くとき、macOSの確認画面が出ることがあります。
> 1. アプリをダブルクリック →「開発元を確認できないため開けません」と出たら、いったん「完了」を押す
> 2. アップルメニュー →「システム設定」→「プライバシーとセキュリティ」を開き、下にスクロール
> 3. 「"minimal-keys カスタマイズ"は…」の右にある**「このまま開く」**を押す
> 4. もう一度確認が出たら「開く」を押す（この操作は最初の1回だけです）
> ※ 少し古いmacOSでは、アプリを**右クリック→「開く」**だけで開ける場合もあります。

**未確認事項（Step 8で実地確認して文面確定）**: macOS 15（Sequoia）以降は右クリック→開くのバイパスが効かず「システム設定→このまま開く」が必須になった、というのが私の知識ベースの理解（Apple 2024年発表）だが、**実機未確認**。Step 8でまさかずのMacで実際にDL→初回起動し、実際に出たダイアログ通りに文面を直す。

**win**: 無署名のためSmartScreen「WindowsによってPCが保護されました」→「詳細情報」→「実行」の案内が必要（前例2回あり）。ただしMac先行方針のため、win案内はwin実機テスト後に整備。

---

## (4) C. リスク表（重要度順・各件に当座策）

| # | リスク | 起きること | 可能性 | 当座策 | 恒久策（後日） |
|---|--------|-----------|--------|--------|---------------|
| C-1 | **R/L取り違え書込**はコードで防げない（左右が同一ボードID・同一ボリューム名） | 反対側イメージが書かれ、片側が旧FWのまま／入れ替わる。危険域への書込は無し（窓検証） | 中（せっかちな顧客） | 画面文言「右半分**だけ**をつないで」＋動作確認チェック＋recovery片側書き直し（実装済み）。**故意失敗②で復帰経路を必ず実証** | FW側にside識別RPC（fwinfo拡張）→ツールで照合 |
| C-2 | **実機E2E通しが本設計書時点で未確認**（前セッション申告のみ。本日確認したのはコード・テスト・ビルドまで） | 想定外の実機挙動（TCC権限ダイアログ、マウント遅延等） | 低〜中 | Step 3（まさかず自身）＋Step 4（非開発者）で必ず回収。**ここを飛ばすルートは無し** | — |
| C-3 | mac初回起動関門で「開けない」問い合わせ | サポートコスト・不安 | 中 | B-6案内文＋Step 8で実地確認した文面に更新。既存顧客は通過済みの前例 | notarization整備（v0.5判断） |
| C-4 | win無署名（SmartScreen）＋Defender環境未検証 | win顧客の書込失敗・警告への不安 | 中（win利用者数は未把握） | **Mac先行**。winバイナリはdraftに置くが正式案内しない。win実機テスト（M3基準）後に案内 | Azure Trusted Signing自前契約（残骸ファイルは上流の物・流用不可） |
| C-5 | アプリ2重起動で並行書込（single-instanceプラグイン未導入） | 同一ボリュームへ2プロセスが交錯書込→書込失敗→recovery行き | 低（意図的な操作が必要） | 発生してもrecoveryで復帰可。既知事項としてメモ | `tauri-plugin-single-instance` 追加（1コミット） |
| C-6 | FW側リポのmanifest生成パイプライン（GATT検知1コミットのみ等・05-M5/06-W5） | 将来のFWリリースで `requires_settings_reset` 欠落のmanifestを配布 | 今回ゼロ／将来中 | 今回のFW v1.0.0は値が正しいことを確認済み。**次回FWリリース時はmanifestを目視確認**する運用ルール。in-appブロック（実装済み）が最後の砦 | farmwareリポのrelease.yml修正（fetch-depth:0＋範囲grep）— 別リポ課題・今回未調査 |
| C-7 | CIにRustユニットテスト無し（release.ymlはnpm系のみ） | 将来のcore改修でregressionがCIをすり抜け | 今回ゼロ／将来中 | 今回は本日ローカル35/35緑を確認済み | release.yml testジョブに `cargo test -p mk-flash-core --features download` を1行追加 |
| C-8 | manifest URLが `releases/latest` 固定 → FW側で新Release をpublishした瞬間、全顧客の「最新」が切り替わる | 未検証FWが即日全顧客に露出 | 運用次第 | **FWリリース運用ルール**: farmware側のpublishは「Studio側での更新テスト完走後」に限る（draft運用） | manifestにstaging用チャネル導入 |
| C-9 | DLの「中止」はUI復帰のみ（Rust側DLは最大60sで自然終了・その間busyではない） | 連打で多重DLが並ぶ理論上の窓（fw_download_assetはBusyGuard外） | 極低 | timeouts＋16MB上限＋SHA照合で実害なし。既知事項メモ | DLにもcancelトークン配線 |
| C-10 | TOOL_VERSION（0.1.0）とアプリ版のドリフト | 将来manifestに `min_tool_version` を入れた日に不整合 | 今回ゼロ | Step 1で0.4.0に同期＋「リリース時に両方上げる」をリリース手順に明記 | version単一ソース化（build時注入） |

---

## 付記: 本設計書の検証ログ（実行事実）

- `npm test` → Test Files 38 passed / **Tests 253 passed**（本日実行）
- `cargo test --features download`（crates/mk-flash-core）→ **35 passed**（本日実行）
- `npm run lint` → 緑 ／ `npm run build` → 緑（chunk size警告のみ）／ src-tauri `cargo check` → 緑（警告6・transport系）
- 公開manifest.json → curl取得成功（v1.0.0・3アセット・requires_settings_reset=false・min_tool_version無し）
- GitHub Releases（Studio）→ v0.3.0（2026-07-05）と v0.2.0 にdmg/exe配布実績、v0.3.0の署名設定は現行と同一（`git show v0.3.0:src-tauri/tauri.conf.json`）
- origin/feature/fw-update-integration == ローカルHEAD（5d48146・push済み）／未コミットは CLAUDE.md 1件のみ（リリース対象外）
- 実機通しE2E・Sequoia Gatekeeper実挙動・win Defender挙動・farmwareリポのパイプライン現状 → **未確認**（本文の該当箇所に明記）
