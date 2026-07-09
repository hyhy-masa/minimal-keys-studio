# minimal-keys-flash 敵対的レビュー（Fable 5 / 2026-07-09）

対象: `/Users/masakazuhayata/farmware/minimal-keys-flash` branch `feature/mvp-flasher`（HEAD b99aa5d・working tree clean）
照合正本: `docs/PLAN.md`（承認済み設計）／ `minimal-keys-studio/docs/firmware-update-feature/04-codex-review.md`
実測: `cargo test -p mk-flash-core` **24 passed** ／ `npm test` **10 passed** ／ `tsc --noEmit` clean ／ `cargo check`（src-tauri）**コンパイル不能**（icons欠落、下記W2）

---

## airtight判定: **NO（顧客に出す手前として不十分）— 総合評価 C**

コア（Rust状態機械・UF2全ブロック検証・reducer順序強制）は良質で設計どおり。しかし**安全装置が顧客の通る経路（Tauriコマンド）にだけ配線されていない**。現状は「開発者用CLIは検証付き、顧客用GUIは検証なし」という、ミッションと真逆の非対称になっている。さらに顧客用GUIバイナリは一度もコンパイルされておらず（CI対象外＋icon欠落でビルド不能）、ダウンロード先の相対パスバグで本番では更新が開始すらできない可能性が高い。

### 最重要3件
1. **C1: 顧客経路 `flash_write_uf2` に書込前検証がゼロ**（UF2構造・SHA・Board-ID・単一ボリューム再確認のいずれも無し）。PLANが「RPC検証なしの代償としてUF2入口検証を厚くする」と定めた核心が、顧客経路で丸ごと未配線。
2. **C3: settings_reset 4段書込（R:reset→R本体→L:reset→L本体）がGUIに存在しない**。reducerに状態がなく、driverはsettings_reset.uf2をダウンロードするだけで一度も焼かない。GATT変更リリースを流すと、設定退避ゲートだけ通過して本体のみ書込→NVS不整合のまま「更新が完了しました🎉」。
3. **C4: ダウンロード先が相対パス `"firmware-cache"`**。Finder起動のTauriアプリはCWD=`/`のため`/firmware-cache`作成に失敗し、**本番では全顧客の更新が最初のダウンロードで必ず失敗**する見込み。PLANの「app_cache_dir固定」にも違反。

---

## Critical（必須修正 — 「決めたのに実装されていない」を含む）

### C1. 顧客経路の書込前UF2検証が完全欠落
- `src-tauri/src/commands.rs:66-92` — `flash_write_uf2` は `std::fs::read` した bytes をそのまま `flash_uf2` に渡す。`validate_uf2` 呼出なし。SHA再照合なし。
- `src/useFirmwareUpdate.ts:97-102` — フロントも validate を呼ばない（validate系コマンド自体が未登録: `src-tauri/src/main.rs:9-15` は5コマンドのみ）。
- 対比: CLIは検証している（`crates/mk-flash-cli/src/main.rs:112`（構造）, `:180`（manifest limits＝SHA+アドレス窓付き））。**開発者向けの方が顧客向けより安全**という逆転。
- なぜ危険か: ダウンロード時にはSHA照合がある（download.rs:22-27）が、その後キャッシュファイルは無検証で信頼される。ディスク上の部分書込・破損・ユーザーによる差替え・将来のローカルuf2リカバリ（PLANは「構造+familyID+範囲」検証を明記）に対してゲートがない。machine.rsのdoc（:111「a validated UF2」）は呼び手検証を前提にしており、その前提が破れている。
- 対策: `flash_write_uf2` に `expected_sha256` / `target_addr_min/max` を必須引数で追加し、コマンド内で `validate_uf2` を必ず通す（デフォルト窓へのフォールバック付き）。「検証なしで書ける経路」をIPC面から消す。

### C2. Board-ID プリフライトゲートが全経路で未実装（PLAN状態機械のPreflight段が欠落）
- PLAN §A 状態機械: `Preflight(INFO_UF2再読・Board-ID前方一致・bootloader版記録)`、§D 層3「INFO_UF2 Board-ID前方一致ゲート」。
- 実測: `machine.rs::flash_uf2`（:113-226）に Preflight 段が存在しない（Stabilize→即Writing）。`fsops.rs:39` に「TOCTOU-safe preflight」用 `read_info_uf2` が定義されているが、**呼び出し箇所ゼロ**（grep確認: 収集のみ。fsops.rs:155/174でVolumeEntryに格納、CLI表示のみ）。フロント（useFirmwareUpdate.ts:75-81）も `vol.path` だけ保存し `board_id` を捨てている。
- なぜ危険か: INFO_UF2.TXTを持つ別デバイス（RP2040等の他UF2ブートローダー、UF2ファイル置き場のUSBメモリ）が「新ボリューム」として検出されると、そのままnRF52840イメージを書き込む。また検出時→書込開始まで（確認画面で放置可能＝無制限時間）にボリュームが入れ替わっても気づかない。書込直前の単一ボリューム再確認もない。
- 対策: `flash_uf2` 冒頭（Stabilize後）で `read_info_uf2` を再読→ `parse_board_id` → 前方一致（`nRF52840-SeeedXiao`、実機実測U-2で確定）不一致なら `NotUf2Volume` を返す。**`NotUf2Volume` エラー variantは定義済み（error.rs:22）だが構築箇所ゼロ＝このゲート用に用意して配線し忘れた形跡**。併せて `list_uf2_volumes` で候補が2個以上なら書込前拒否。

### C3. settings_reset 4段フローがGUIに欠落（CLIのみ実装）
- PLAN スコープ: 「R:reset→R本体→L:reset→L本体 の4回書込を自動オーケストレーション」「reset→45s自動再出現待ち→本体の2連」。
- 実測: `src/wizard/machine.ts` に reset書込状態が存在しない（r_flashing/l_flashingの2書込のみ）。`src/useFirmwareUpdate.ts:58` で settings_reset をダウンロードはするが、`flash()`（:89-107）は central/peripheral しか焼かない。45s自動再出現待ちも無い。
- CLI には実装がある（`mk-flash-cli/src/main.rs:148-164` cmd_flow --reset）。
- なぜ危険か: `requires_settings_reset=true` の最初のリリースで、顧客はbackup_gateを通り、**NVSが消去されないまま**GATT変更後のFWだけが書かれ、「完了」と表示される。ペアリング・設定不整合の不具合が「更新成功」の顔で出荷される。R2'（設定全損）を防ぐ仕組みが半分しか無い状態。
- 対策: 最低限、v1では `requires_settings_reset=true` のmanifestを **GUI側で拒否**（「このバージョンはまだツール未対応。サポートへ」）するガードを入れるか、4段フローを実装してから当該リリースを出す。黙って2段で流すのが最悪。

### C4. ダウンロード先が相対パス（本番全滅バグ＋PLAN違反）
- `src/useFirmwareUpdate.ts:63` — `destDir: "firmware-cache"`（相対）。`download.rs:29` の `create_dir_all` はプロセスCWD基準。Finder/Explorer起動のGUIアプリはCWDが `/` や `C:\Windows\System32` になり、書込不可 or 意図しない場所に書く。`npm run tauri dev` でのみ動く。
- PLAN §B: 「`fw_download_asset`(**app_cache_dir固定**)」— dest_dirをフロントから受け取る設計自体が違反。
- 対策: コマンド側で `tauri::Manager::path().app_cache_dir()` を解決し、dest_dir引数を廃止。asset.name はファイル名成分のみ許可（S1と併せて）。

### C5. min_tool_version ゲート未実装
- PLAN: 「ツール版ゲート=manifest `min_tool_version`」。実測: 全リポgrepで比較ロジックゼロ（machine.ts:13に型があるだけ）。
- なぜ危険か: R8'（2配布物のバージョン非互換）の唯一の防波堤が無い。しかも `pipeline/generate_manifest.py:97` は既定で `min_tool_version="1.0.0"` を書き、ツールは `0.1.0`（tauri.conf.json）——**ゲートを後から実装した瞬間、既発行manifestが全ツールを弾く**整合事故が仕込まれている。
- 対策: show_release 前に semver 比較→未満なら更新誘導画面。generator の既定値をツール実版と揃える運用ルールを release.yml に固定。

### C6. リカバリモードがスタブ＝全エラー経路の受け皿が機能しない
- `src/App.tsx:168-177` — recovery画面は「（UI準備中）」の文言と「最初に戻る」のみ。ローカルuf2選択（dialogプラグインは依存追加済みだがフロントで**未使用**・grep確認）、片側焼き直し、§D-5「取り違え疑い→両方を正しいuf2で焼き直し1クリック」、症状診断フロー、いずれも欠落。
- さらに同画面が「**ログを保存して**サポートにお送りください」と指示するが、`support_log_export` コマンドは未実装（PLAN §B明記）＝**存在しない操作を顧客に指示する文言**。
- なぜ危険か: 書込失敗・タイムアウト・取り違え・多重ボリューム、あらゆる異常系の終着点がこの画面。片側が旧FW/ブートローダーのまま取り残された顧客が、アプリ内で何もできない。PLANの「機能的文鎮の復旧導線」（Codex指摘5に対する回答）が実質不在。
- 対策: M2完了ゲート（「故意失敗3種から復帰」「R/L取り違え診断フロー動作」）はこの実装なしに通過できない。リリース前必須。最低限「オンラインDLで片側1回焼き」＋ログ保存だけでも先に。

### C7. single-instance プラグイン欠落（PLAN明記の二重起動書込防止）
- PLAN §技術スタック: 「Tauriプラグインは `dialog`＋**`single-instance`（二重起動書込防止）**のみ」。実測: `src-tauri/Cargo.toml` / `main.rs:7-8` に dialog のみ。
- 加えてアプリ内の単一飛行ガードもない: `flash_write_uf2` は再入可能（backend mutexなし）。React StrictMode（main.tsx:9、devのみ）や将来のUI変更で二重invokeされると、同一ボリュームへ2スレッドが `File::create`（=truncate）と書込を交錯させ、破損イメージ→誤った裁定に至り得る。
- 対策: `tauri-plugin-single-instance` 追加＋commands.rs に `Mutex<()>`（またはState管理のbusyフラグ）で flash/wait系を単一飛行化。

---

## Warning（推奨修正）

### W1. 失敗書込後の「先待ち」で偽成功の窓（PLANの裁定表から逸脱）
- `machine.rs:200-215` — RebootLike errno＋`written < total−slack`＋ボリューム残存の分岐が `await_or_rewrite` に入り、`:240-243` で**再書込より先に15秒アンマウント待ち**をする。この間にボリュームが消える（遅延リブート・**ケーブル抜去**・ユーザーの手動リセット）と `ProvisionalSuccess`。
- PLAN §Aは「同errno & written<total−256KiB＝PrematureReboot（失敗）」。実装は同じ物理状態を、消えるタイミング次第で成功/失敗どちらにも裁定する（:196のPrematureReboot分岐と非整合。Timings docコメント:42-44「この点より前のエラーは真の成功たり得ない」とも自己矛盾）。
- 影響: 部分イメージで「書込成功」を返す→ verify_checklist が人間バックストップだが、その先の受け皿がC6のスタブ。
- 対策: fail経路（written<threshold）では「クリーンな再書込が完了した後のアンマウント」のみ成功とする。最初のawaitでアンマウントを見たら `PrematureReboot` を返す。
- テスト欠落も同根: `await_or_rewrite` の失敗系（rewrite後もタイムアウト→fail_err返却）、EACCES→ボリューム消失→NoBootloaderVolume、PermissionDenied上限到達、ErrnoKind::Other、の4分岐にユニットテストがない（現24本は成功系中心）。

### W2. 顧客用GUIバイナリが一度もコンパイルされていない（CIの死角）
- src-tauri はルートworkspace除外（Cargo.toml:5コメント）で、CI（ci.yml）は `cargo test -p mk-flash-core` と `cargo build --workspace` のみ。**commands.rs はCIで一切コンパイルされない**。
- 実測: `cargo check`（src-tauri）→ `icons/icon.png` 不在で `generate_context!` がpanic＝**現状ビルド不能**（コマンド層の型自体は通ることを確認）。BUILD_STATEは自己申告済みだが、CIが緑のまま壊れ得る構造が問題。
- 対策: icons生成（`npm run tauri icon`）＋CIに `cargo check`（src-tauri、macOS/Windowsランナー）を追加。Windowsランナーが入れば `classify_errno` のcfg(windows)側も初めてコンパイル検証される（現状ubuntuのみ＝Windows分岐は未コンパイル領域）。

### W3. 顧客向けエラー表示が「[object Object]」になる
- FlashError はタグ付きJSON（error.rs:9）で reject される。`useFirmwareUpdate.ts:47,69,105` の `String(e)` はオブジェクトに対し `[object Object]` を生成。エラー画面（App.tsx:161）が意味不明になる。
- error.rs の意図（「二段マッピング不要でUIへ」）がUI側で壊れている。`e.kind` で分岐する日本語文言マップ（i18n/ja.ts拡張）が必要。`MultipleBootloaderVolumes`（両側挿し）と `NoBootloaderVolume`（タイムアウト）は顧客の次の行動が違うので特に区別必須。

### W4. 先にリセット済みのボードが baseline に食われて永久に検出不能
- `useFirmwareUpdate.ts:75-80` — ガイド画面表示時に scan→baseline化。**せっかちな顧客が画面より先にダブルタップしていると**、既にマウント済みのXIAO-SENSEがbaselineに入り、`wait_for_new_volume` は永遠に「新規」を見つけず60s→`console.error`→無言でrecovery（スタブ）へ。
- 対策: scan結果に既存UF2ボリュームが**ちょうど1個**あればそれを候補として採用（Board-IDゲート併用）。0個ならbaseline方式。CLI（cmd_write:115）も同じ癖あり。
- 併せてPLANの「60sで追込ガイド」（追加の誘導表示）も未実装で、タイムアウトが黙ってrecovery遷移になっている。

### W5. release.yml の GATT検知が「タグ付きコミット1件」しか見ない
- `pipeline/release.yml` — `git log -1 --format='%B' | grep '[GATT-RESET]'`。PLAN/flash.sh:58-64 の規則は**前回リリースからの範囲**。GATT変更がタグ直前以外のコミットにあると検知漏れ→ `requires_settings_reset=false` で配布＝R2'（設定全損・ペアリング破壊）への直通路。actions/checkout@v4 は既定 fetch-depth=1 で範囲検査自体が不可能。
- さらに `Resolve version`: workflow_dispatch 時 `GITHUB_REF_NAME` はブランチ名（例 "main"）で常に非空→ `inputs.version` に**決してフォールバックしない**。手動実行すると "main" タグのリリースを作ろうとする。
- 対策: fetch-depth: 0＋`git log <prev_tag>..HEAD` 走査。versionは `github.event_name` で分岐。テンプレートだが正本と明記されている以上、正本の欠陥。

### W6. ダウンロードにタイムアウト・サイズ上限なし
- `download.rs:39-62` — ureq 2 は既定タイムアウトなし。ネット断・ストールで `spawn_blocking` スレッドが永久ハング（キャンセル手段もない=W7）→「しばらくお待ちください…」で凍結。`read_to_end` は上限なし（validate通過上限は理論~430MB、ダウンロード自体は無制限）。
- 対策: Agentに connect/overall timeout（例 10s/120s）＋ Content-Length/累積 8MB程度の上限。

### W7. キャンセル導線が配線されていない（CancelFlagが死んでいる）
- `commands.rs:52,77` — CancelFlag はコマンド内で毎回 `new()` され、外部から `cancel()` を呼ぶ手段（flash_cancelコマンド）が存在しない。コアの協調キャンセル設計（書込前のみ中断可）がGUIでは完全に不使用。
- 影響: 60秒のブートローダー待ち・書込を顧客は中断できず、唯一の手段が**アプリ強制終了＝書込中断**という最悪の誘導。書込中画面に「ケーブルを抜かないで/アプリを閉じないで」の警告文言もない。
- 対策: cancel用StateとコマンドD追加＋flashing画面に警告文言。

### W8. manifest `schema` を検証していない
- `manifest.rs:85-100` — `schema: 2` を読むだけで値を確認しない。将来 schema=3（意味変更）が黙って通る。min_tool_version（C5）も無いため前方互換の防波堤がゼロ枚。`schema != 2 → ManifestInvalid` の1行を。

### W9. README が未実装の安全装置を実装済みと主張
- README「mitigated by … **a Board-ID gate**, and **a post-flash symptom-diagnosis recovery flow**」— どちらも未実装（C2/C6）。ドキュメントを信じた将来の自分・協力者が「もう有る」と誤認する汚染源。BUILD_STATE は概ね正直だが README の Safety model 節が先走っている。

---

## Suggestion（あれば良い）

- S1: `asset.name`/`dest_dir` のパス無害化（`../`拒否、ファイル名成分のみ）。manifest URLもフロント引数でなくRust側定数に（webview侵害時の多層防御）。fw_fetch_manifest/fw_download_assetがURL/宛先を自由に受ける現状は攻撃面として広め。
- S2: TCC拒否時は `INFO_UF2.TXT.exists()`=false → 「キーボードが見つかりません」と誤診断される（volume_present の副作用）。PermissionDenied系の文言と「システム設定→プライバシー」誘導を分ける（U-3実機時に確認）。
- S3: `premature_slack=256KiB` は典型イメージ(~600KB)の約4割。「total−256KiB」に加え比率下限（例 written≥90%）の併用を検討。
- S4: backup_gate のチェックボックスはACK後に外せない（reducerにUNACKなし・見た目のみの問題）。
- S5: verify_checklist が PLAN の3項目（両手/トラックボール/**reset時の再ペアリング**）のうち2項目のみ（App.tsx:135）。requires_settings_reset時は再ペアリング確認を追加。
- S6: `fw_list_releases`（ロールバック）未実装（PLAN §B）。v1後回しなら BUILD_STATE に明記を。
- S7: キャッシュ再利用（PLAN R7: Releases障害時）未実装——毎回強制DL。C4修正時に「同SHAファイルが既にあればDLスキップ」を足すと1行で済む。
- S8: 製品名「minimal-keys アップデーター」（非ASCII productName）はNSIS/署名で稀に問題を踏む。U-11（まさかず決裁）が未決のままの実装値である点も含め、リリース前に確定を。

---

## PLAN / Codex 突合表（決めたこと → 実装状態）

| 決定事項（出典） | 状態 |
|---|---|
| UF2全ブロック検証（PLAN §A・Codex 1(b)） | ✅ core実装済＋テスト良 / ❌ **顧客経路未配線（C1）** |
| 書込状態機械 errno×バイト×アンマウント3軸（PLAN §A・Codex提案5） | ✅ 実装済（⚠️ W1の裁定逸脱あり） |
| Preflight Board-ID前方一致（PLAN §A/§D-3） | ❌ **欠落（C2）**。read_info_uf2は定義のみ・NotUf2Volumeは未使用 |
| R→L順序強制（§D-1） | ✅ reducer構造で実装・テスト有 |
| 単一ボリューム＋baseline差分（§D-2・Codex 1(c)） | ✅ 検出時は実装 / ⚠️ 書込直前の再確認なし（C2に統合） |
| backup_gate強制（スキップ不可） | ✅ reducer実装・テスト有（UI文言も適切） |
| settings_reset 4回書込＋45s自動再出現（スコープ・§B） | ✅ CLIのみ / ❌ **GUI欠落（C3）** |
| 書込後 症状診断→焼き直し1クリック（§D-5） | ❌ **欠落**（CHECKLIST_FAIL→スタブrecoveryのみ）（C6） |
| リカバリモード常設（ローカルuf2＋構造検証） | ❌ **スタブ「UI準備中」**（C6）。dialogプラグイン未使用 |
| サポートログ export（§B） | ❌ 欠落。しかもUI文言は保存を指示（C6） |
| manifest v2 全フィールド（Codex追加提案） | ✅ schema/generator実装済 / ⚠️ 消費側で breaking_gatt・requires_backup_restore・min_* 全て未参照 |
| min_tool_version ゲート | ❌ **欠落（C5）** |
| single-instance プラグイン | ❌ **欠落（C7）** |
| fw_download_asset app_cache_dir固定 | ❌ **違反：フロント指定の相対パス（C4）** |
| EACCES 2s×10リトライ（Codex 1(d)） | ✅ 実装済＋テスト有 |
| AppleDouble非生成（cp -X相当） | ✅ std::fs直書きで構造的に達成 |
| Windows A..Z probe＋Win32分類（Codex 1(e)） | ⚠️ 暫定実装・**CIでコンパイルすらされない**（W2）。M3実測待ちは計画通り |
| 60s追込ガイド | ❌ 欠落（タイムアウト→無言recovery）（W4） |
| キャッシュ再利用（R7） | ❌ 欠落（S7） |
| [GATT-RESET] git log規則移植（M0） | ⚠️ 範囲でなく直近1コミットのみ＝検知漏れ（W5） |

## 良かった点（根拠付き・お世辞なし）
- 成否裁定を「アンマウントのみ」に統一しexit codeを信用しない不変条件が、コード・doc・テストで一貫（machine.rs冒頭doc、README）。
- UF2検証は全ブロック走査＋blockNo連番＋numBlocks一致＋アドレス窓＋単調非重複＋SHAで、切断・異種・混入をユニットテスト8本で網羅。空ファイル・非512倍数も拒否。
- reducerの「L系イベントはR完了前に構造的に無効」はテストで実証されており、順序強制の芯は堅い。
- BUILD_STATE がハードウェアゲート未達を正直に列挙している（README安全節W9を除く）。

## 結論
コアは出荷品質に近いが、**顧客が実際に通る一本道（GUI→Tauriコマンド→書込）に、設計で決めた安全装置がほぼ載っていない**。C1〜C7を潰しM2実機ゲート（非開発者テスト・故意失敗3種・取り違え診断）を通すまで、顧客配布はもちろん、社内ドッグフーディング配布も不可と判定する。修正順の推奨: C4（1行・全滅バグ）→C1/C2（コマンド層で検証+ゲート必須化）→C7→C6→C3（または settings_reset拒否ガード）→C5→W群。
