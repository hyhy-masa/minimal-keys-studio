# 12. 徹底レビュー×最短リリース実行プラン v2（Fable 5 / 2026-07-11）

- 対象: `minimal-keys-studio` branch `feature/fw-update-integration` HEAD `5d48146`（Mac + Win 同時リリース）
- 本書はv1実行プラン（`~/.claude/plans/zazzy-brewing-hellman.md`）を置き換える。監査結果（doc 11 / `11-release-plan-fable5.md` 配置予定）は証拠ベースとしてそのまま生きる
- 方針: 憶測ゼロ。新たな主張は全て本日の実コマンド・実コードReadで確認。未確認は「未確認」と明記

## 本日の追加実測（v2の根拠）

- `git log`: Codexレビュー格納コミット `44d5a6f` 以降の実装コミットは**正確には10本**（依頼文の8本＋`f70d70f` 定数公開＋UI 2本の個別カウント）。差分=**37ファイル・+4,290行**
- **Codex未レビューの新規コード実測**: `src/firmware-update/` 13ファイル 1,882行＋`src-tauri/src/flash/mod.rs` 171行＋設定面7ファイル（main.rs / Cargo.toml / Info.plist / vite.config.ts / tailwind.config.js / AppHeader / .gitignore）
- **vendoring移植差分は極小で健全**: `diff -u` 実測で単独ツール版とStudio版のcore差分は**定数抽出のみ**（`MINIMAL_KEYS_BOARD_ID_PREFIX` 一本化＝Codex 10レビューの提案の実装）。安全ゲートの劣化・欠落なし
- **逆移植漏れなし**: 単独リポの最終コード修正（`3b5be7a` Board-ID実測値修正 07-09 08:54）→ vendoring（07-09 21:01）の順。以後単独リポの変更はdocs/dev-harnessのみ（git日付実測）
- **10-codex-reviewの実態**: 設計docだけでなく単独リポの**実コードまでfile:line裏取り済み**。その「要修正」提案（定数一本化・RecoveryPanel 3モード・supportLog・cancel配線・Cargo standalone化）が**そのままStudio統合10コミットで実装されている**。構図＝「Codexが出した宿題をFableが解いた。**答案をCodexはまだ見ていない**」
- **rc先行タグが既存CIで成立**: `release.yml` は `tags: ['v*']` トリガー・`releaseDraft: true` 固定・`prerelease: contains(ref_name, '-')`。→ `v0.4.0-rc.1` を打てば**下書き＋prerelease扱いでmac/win両成果物がCIから出る**（顧客には何も届かない）
- **Info.plistに `NSRemovableVolumesUsageDescription` 追加済み**（統合コミット内・実測）→ macOS TCC許可ダイアログの実機確認が必要
- **`features = ["download"]` はsrc-tauri/Cargo.tomlに配線済み**（実測）
- **mainとの乖離ゼロ**: `origin/main..feature` = +11 / `feature..origin/main` = **0**。マージ結果はテスト済みHEADとバイト同一（リリース期間中mainに何も入れない前提）

---

## (1) 結論サマリ — まさかず向け

### ひとことで
コードの中身は監査済みで健全ですが、**「今のStudio統合版コードをCodex（GPT-5.6）が一度も見ていない」**という死角が確認できました。そこで v2 では、**Codexの徹底レビューを追加しつつ、レビューとビルド・実機準備を並行で走らせて、カレンダーは v1 と同じ（約3日）のまま**にします。

### v1からの主な変更（3点）
1. **Codex独立レビューを2本追加**（Rust安全層＋TSウィザード）。内部code-reviewer（Opus 4.8）も並走させ、Fable 5が突き合わせ・仲裁。→ 出所の分離が完成（Codex / Opus / Fable の3系統）
2. **rc先行タグ方式**: 本番と同じCIビルド（rc版）を先に作り、**非開発者テストを「本番と同一物」でやる**。v1の「ローカルビルドでテスト→最後にCI版確認」より品質が上がり、初回起動関門（Gatekeeper/SmartScreen）の確認も前倒しできる
3. **直列→3レーン並行**: レビュー（Claude+Codex）・ビルド準備（Claude）・人の手配（まさかず）を今日同時に開始。**一番遅いのはコードではなく「テスターの日程」**なので、声かけを初日に

### 最短スケジュール（依存関係込み）
| 日 | やること | 誰が |
|----|---------|------|
| **今日** | プラン承認（GO-1）→ 3レーン同時発進: ①Codexレビュー2本＋code-reviewer ②準備コミット＋macビルド ③**mac実機1周（自分で）＋テスター2名に声かけ＋win機確保** | まさかず＋Claude＋Codex |
| 今日夜 | 指摘を1枚に統合 → **GO-R判断** → OKなら rc.1 タグ → CIがmac/win版を自動生成 | Claude→まさかず |
| **明日** | （指摘修正があれば朝イチで反映）→ win実機1周（自分で・Defender有効）→ 午後: **非開発者テスト mac**（rc版・故意失敗3種込み） | まさかず |
| **明後日** | **非開発者テスト win** → 文言修正をまとめて反映 → mainマージ→本タグ→CI→下書き確認（**GO-4**） | まさかず＋Claude |

**カレンダー: 最短2.5日・現実3日・修正1往復で4日**（v1: 2.5〜4日と同等。Codexフルレビューを並行化で吸収）

### GO判断ポイント（5箇所・まさかずが押す）
- **GO-1（今日・15分）**: このプランでOK → 全レーン発進
- **GO-R（今日夜・新設）**: レビュー統合表を見る。**「Critical残ゼロ」だけ確認**すればOK（技術仲裁はFableが済ませた状態で出す）→ rc.1タグへ
- **GO-2（mac今日/win明日）**: 自分の実機で詰まらず完走 → 非開発者テストへ
- **GO-3（明後日）**: 非開発者テスト合格（mac M2＋win M3）→ mainマージ＋本タグへ
- **GO-4（明後日）**: 下書きリリースのファイルが揃い・DLして起動できた → publish判断へ（publishは本プラン外）

### まさかずが今日やること（4つ）
1. このプランの承認（15分）
2. **自分のMacで更新1周**（ローカルビルド版・約30分）
3. **テスター2名（mac用・win用）に声かけて明日明後日の枠を押さえる** ← これが一番カレンダーを決めます
4. win テスト機（Win10/11・Defender有効）の確保確認

### 先に決めてほしいこと（2点）
- **winテスターが遅れた場合**: Mac先行でpublishする分岐を許容するか（推奨: 許容。winは揃い次第の後追い案内）
- **Intel Macの顧客はいるか**: ビルドはuniversal（両対応）だが実機テストはApple Silicon のみ。いるなら1台スモーク追加、不明なら案内文に「M1以降で動作確認済み」と書く

---

## (2) 徹底レビュー体制プロトコル

### 2-1. レビューすべき対象（本日実測で確定）

**Codexが一度も見ていないもの（最優先）**:
- `src-tauri/src/flash/mod.rs`（171行）— Tauriコマンド層。**安全ゲートの配線が全部ここ**（validate_uf2呼び出し・SHA/窓の受け渡し・BusyGuard・cancel・DLパス解決）。単独版 `commands.rs`（175行）の**書き直し**であり移植ではない
- `src/firmware-update/`（13ファイル 1,882行）— wizardリデューサ machine.ts（240行・単独版168行から増補: min_tool_version/settings_resetゲート追加）・hooks 3本・RecoveryPanel・supportLog・ja.ts・Modal・fwinfo proto。**大半が新規書き下ろし**
- 設定面: main.rsへのコマンド登録・Cargo.toml standalone化・Info.plist（TCC文言）・vite.config.tsフラグ・AppHeader組み込み

**Codexがほぼ見ているもの（差分確認だけでよい）**:
- vendored core（1,789行）— 単独リポ版を10レビューでfile:line裏取り済み。Studio版との差分は定数抽出のみ（本日diff実測）→ **全文再レビュー不要、diffの確認のみ**

### 2-2. 三者構成と役割（出所の分離）

| 目 | 誰 | 見るもの | 出力 |
|----|-----|---------|------|
| 第1の目 | **Codex（GPT-5.6）** `codex:codex-rescue` | R1: Rust/Tauri安全層＋移植差分 ／ R2: TSウィザード/UI | 指摘リスト（file:line必須） |
| 第2の目 | **code-reviewer（Opus 4.8）** | `44d5a6f..5d48146` 全diff（エッジケース・セキュリティ・パターン一貫性） | 指摘リスト |
| 第3の目 | **Fable 5（本セッション）** | 両者の指摘の突き合わせ・実コードで裁定・統合表作成 | 統合判定表（GO-R材料） |

- 3系統が**互いの結論を見ずに**先に書く（Codexにcode-reviewerの結果を渡さない・逆も同じ）。統合はFableだけが行う
- reviewerエージェント（批判チェック）は本件では使わない: コード対象はcode-reviewerの領域、プロセス批判は本書§5で自己適用済み。二重にしない

### 2-3. Codexハンドオフ設計（何を読ませ・何を問うか）

**運用**: `codex:codex-rescue` 経由・1ハンドオフ=1タスク（メモリ規約）・read-onlyレビュー・**直列2本**（R1→R2。並列2セッションの可否は未確認のため設計は直列。各30〜60分、Lane B/Cと並行なのでカレンダー影響なし）

**R1（Rust/Tauri安全層・最優先）に渡すもの**:
- リポパス: `~/claude-code/minimal-keys-studio`（HEAD 5d48146）＋比較用に単独版 `~/farmware/minimal-keys-flash`（feature/mvp-flasher）
- 自分の過去レビュー `docs/firmware-update-feature/10-codex-review-of-detailed-design.md`
- 問い（要旨）: 「①君が10で出した要修正提案は、HEADで**正しく**実装されたか1件ずつ検証せよ（答案チェック）②単独版 `src-tauri/src/commands.rs` とStudio版 `src-tauri/src/flash/mod.rs` を突き合わせ、**書き直しで落ちた安全ゲート・挙動差**を全て挙げよ ③vendored coreのdiff（定数抽出）に副作用はないか ④§4-1のチェックリスト各項を裏取りせよ。全指摘にfile:line必須」

**R2（TSウィザード/UI）に渡すもの**:
- 同リポ・`src/firmware-update/` 全ファイル＋vite.config.ts＋AppHeader diff
- 問い（要旨）: 「①machine.tsの全状態遷移を列挙し**行き止まり**（どのボタンでも脱出できない状態）を探せ ②エラー種別の網羅（Rust `FlashError` 全variant vs `ja.ts formatError` の対応。ManifestInvalid/Ioのdefault落ち確認）③recovery 3経路が全安全ゲートを通るか ④fwinfo decodeの後方互換（旧FW・ゴミ応答）⑤§4-2のチェックリスト各項。全指摘にfile:line必須」

**出力先**: `docs/firmware-update-feature/13-codex-review-of-integration.md`（Codex指摘の生腸＋Fable統合判定表。実行フェーズで作成）

### 2-4. 突き合わせ・仲裁ルール（多数決でなく根拠の強さ）

1. **証拠必須**: file:line＋具体的な失敗シナリオ（入力→誤動作）が書けない指摘は「未検証」に降格。降格したものも表には残す（隠さない）
2. **裁定の優先順位**: ①ユニットテストで再現できるか（書けるなら書いて白黒＝最強の根拠）②実コードの読み合わせでFableが裁定 ③それでも不確定なら「実機確認項目」へ回す
3. **安全ゲート関連の食い違いは厳しい方を採る**: 「たぶん大丈夫」で流さない。修正コスト < 文鎮リスクなら直す
4. **UX/文言の食い違いは議論しない**: レビューで争わず「非開発者テストの観察項目」に回す（実物の顧客挙動が裁定者）
5. **分類と処理期限**:
   - **Critical**（文鎮・誤ボード書込・安全ゲート素通り・データ破壊）→ rc.1タグ**前**に修正＋テスト再実測
   - **Major**（更新失敗・復帰不能・誤案内）→ GO-3（非開発者テスト合格判定）前に修正
   - **Minor**（文言・見た目）→ Step「文言バッチ」で一括（明後日）
   - **Deferred**（次版）→ リスク表に記録して先送りを明示
6. 全裁定は統合判定表に「指摘・出所・裁定・根拠・処理」の5列で残す（GO-Rでまさかずが見るのはこの表の頭のサマリ行だけ）

### 2-5. レビューと実機の分離原則（二重に時間をかけない）

- **レビューで白黒つく項目は実機に持ち込まない**（例: SHA検証の配線はコードで確定。実機で「なんとなく安心」を再確認しない）
- **実機でしか分からない項目はレビューで議論しない**（例: TCCダイアログの出方・SmartScreen実挙動）
- 振り分けの正本は§4のマトリクス。レビュー中に新項目が出たら必ずどちらかに分類してから進む

---

## (3) 並行化クリティカルパス

### 3-1. 3レーン設計（今日、承認直後に同時発進）

**Lane A（レビュー）— Claude＋Codex**:
- A1: Codex R1起動（〜1h）→ A2: Codex R2起動（〜1h）
- A3: code-reviewer起動（全diff・A1と並行）
- A4: Fable仲裁・統合判定表 → **GO-R材料**（今日夕〜夜）

**Lane B（ビルド・準備）— Claude**:
- B1: リリース準備コミット（version 0.3.0→0.4.0 ×2 / TOOL_VERSION→0.4.0 / docs 11・12配置）
- B2: 4点再実測（lint / npm test 253 / build / cargo test 35）
- B3: macローカルビルド → まさかずへ渡す（Lane C3の入力）

**Lane C（人と実機）— まさかず**:
- C1: **テスター2名（mac/win各1）に声かけ・明日明後日の枠押さえ**（最重要・最初に）
- C2: winテスト機の確保確認（Win10/11・Defender有効）
- C3: mac実機ドッグフード1周（B3のビルドで・30分）→ **GO-2m**

### 3-2. 日程表（依存関係付き）

| # | 工程 | 誰 | 所要 | 依存（何待ちか） | 完了判定 |
|---|------|-----|------|----------------|---------|
| 0 | GO-1 プラン承認 | まさかず | 15分 | — | 「進めて」 |
| 1 | Lane A/B/C 同時発進 | 全員 | 半日 | GO-1 | 各レーン完了 |
| 2 | 指摘統合 → **GO-R** | Fable→まさかず | 30分 | A4完了 | Critical残ゼロ確認 |
| 3 | （Criticalあれば）修正→B2再実測 | Claude | 0〜半日 | GO-R | 4点緑・該当テスト追加 |
| 4 | **rc.1タグ** `v0.4.0-rc.1` push → CI | Claude(承認後) | 5分＋CI 30-60分 | #2(＋#3) ＋ B1 | draft(prerelease)にdmg/exe実在 |
| 5 | win実機ドッグフード（rc exe・SmartScreen/Defender込み）→ **GO-2w** | まさかず | 30分 | #4 ＋ C2 | 完走＋動作確認2項目 |
| 6 | **非開発者テスト mac**（rc dmg・初回起動関門込み・故意失敗3種） | テスター＋まさかず観察 | 1-2h | #4 ＋ GO-2m ＋ C1日程 | 合格基準（doc 11 B-3/B-4） |
| 7 | **非開発者テスト win**（同上＋Defender/SmartScreen実地） | テスター＋まさかず観察 | 1-2h | #4 ＋ GO-2w ＋ C1日程 | 同上＋M3基準 |
| 8 | 文言・写真修正バッチ → ローカル確認 → **GO-3** | Claude→まさかず | 半日以内 | #6 ＋ #7 | フロー欠陥ゼロ・修正一覧承認 |
| 9 | PR→mainマージ（FF相当・main乖離0確認済み） | Claude提案/まさかず | 30分＋CI | GO-3 | deploy.yml緑・Web版変化なし |
| 10 | 本タグ `v0.4.0` → CI → draft検証 → **GO-4** | まさかず＋Claude | 1h | #9 | アセット4点＋起動スモーク |
| 11 | rc掃除（rc draft削除・rcタグ削除） | Claude(承認後) | 10分 | #10 | Releasesにrc痕跡なし |

- **クリティカルパス**: GO-1 → A4(レビュー統合) → rc.1 → 非開発者テスト（人の日程）→ GO-3 → 本タグ → GO-4
- **カレンダー最大の変数はテスターの都合**。だからC1を今日の最初に置く。コード側は今日中にrc.1まで到達可能

### 3-3. rc先行タグ方式（v2の中核・本日実確認済み）

- 根拠: `release.yml` は `tags: ['v*']`・`releaseDraft: true`・`prerelease: contains(ref_name, '-')`（本日Read）。`v0.4.0-rc.1` はハイフン入り＝**prerelease markつき下書き**になり、顧客導線（`releases/latest`）に一切影響しない。タグはブランチ非依存＝feature HEADに打てる
- 効果: ①非開発者テストが**本番と同一のCI成果物**（universal dmg / win exe）で走る ②初回起動関門（Gatekeeper/SmartScreen）の実地確認がテスト当日にできる（v1はStep 8まで未確認だった）③win exeの入手問題（winビルド環境なし）が自動解決
- 修正が出た場合: 文言のみ→rc.2不要（本タグのGO-4スモークで確認）。**Rust/フロー変更→rc.2を打って実機再走**
- 掃除: 本タグpublish判断の後にrc draft＋rcタグを削除（#11）。手順書に明記し「下書きが2つ並んで混乱」を防ぐ
- **実行時確認1点（未確認）**: tauri.conf版数(0.4.0)とタグ名(v0.4.0-rc.1)の不一致でtauri-actionが成果物名をどう付けるか。CIログとdraftアセット名で確認。万一失敗する場合のfallback＝winテスター到着前に本タグ相当の検証をローカルmac＋（win機にツールチェーン導入 or 本タグ前倒し）で吸収

### 3-4. 手戻りループ最小化の順序原則

1. **コード欠陥はレビューで先に潰す**（今日）— 実機テスト後にCritical発覚が最悪の手戻り（テスター再招集）。だからレビュー完了＝GO-Rをrc.1と非開発者テストの前に置く
2. **自分ドッグフードはレビュー完了を待たない**（今日）— 30分と安く、環境系の初期発見（TCC・マウント遅延）が早いほど得。Codex指摘で直しても再走30分で済む
3. **非開発者テストは「レビュー済み・本番同一物」で1回で決める** — 一番高い工程（人の日程）を1回にする
4. **文言・写真はバッチ1回**（#8）— 逐次直すとビルド往復が増える。フロー欠陥のみ即時修正＋rc.2
5. **リリース期間中のフリーズ2点**: ①Studio mainに他の変更を入れない（乖離0を保ちマージ＝テスト済み同一物を維持）②farmwareリポのRelease publishをしない（`releases/latest` が切り替わり全顧客・全テストのDL対象が変わる。doc 11 C-8）

### 3-5. 分岐（うまくいかない場合）

- **CodexがCriticalを出した**: #3で修正→4点再実測→（安全ゲート関連なら）回帰テスト追加→rc.1が半日遅れ。スケジュール+0.5〜1日。ドッグフードやり直しは30分
- **winテスターが捕まらない**: mac側だけでGO-3m→**Mac先行publish**（v1の既定に縮退）。winはGO-3w成立後に案内追加。→ まさかず判断（§1の要判断1）
- **rcタグでCIが失敗**: fallback＝ローカルmacビルドでmacテスト続行＋win exeは本タグ前倒しで取得（draft運用なので顧客影響なし）
- **非開発者テストでフロー欠陥**: 修正→GO-2該当OSだけ再走→rc.2→そのOSのみ再テスト（両OS再走はフロー共通欠陥のときだけ）

---

## (4) レビュー観点チェックリスト＆マトリクス

### 4-1. R1: Rust/Tauri安全層（Codex＋code-reviewerで確認・実機に持ち込まない）

書込前ゲート:
- [ ] `validate_uf2`（構造・familyID・アドレス窓・SHA）が**全書込経路**で呼ばれる（通常R→L・recovery片側書き直しの両方）
- [ ] manifestのSHA・アドレス窓がフロント→Rustへ**欠落なく**届く。無指定時デフォルト窓（0x27000〜0xF4000）が生きる
- [ ] Board-IDプリフライトのTOCTOU安全性（書込直前照合）＋`MINIMAL_KEYS_BOARD_ID_PREFIX` 一本化の**両参照**（検出側/書込側）確認
- [ ] `acquire_bootloader` のbaseline/既存マウント養子縁組（H4/W4回帰）が通常・recovery両経路で正しい引数で呼ばれる

移植・書き直し差分（最優先）:
- [ ] 単独版 `commands.rs`(175行) vs Studio版 `flash/mod.rs`(171行) の全差分洗い出し — 落ちた安全ゲート・挙動差・エラー変換差
- [ ] vendored core diff（定数抽出のみ・本日実測）の副作用ゼロ確認
- [ ] Cargo.toml standalone化の副作用（`features=["download"]` 配線は本日確認済み。dev-dependencies・プロファイル差も見る）

資源・並行:
- [ ] BusyGuardが**全書込系コマンド**を覆う。`fw_download_asset` の多重呼び出し挙動（C-9既知）
- [ ] cancelの状態別挙動（DL中・待機中は可 / 書込中はdisabled）がRust側でも強制されるか
- [ ] fsopsのマウント直後Permission deniedリトライ・sync（Codex 04-1(d)由来）がvendored coreに残存し、Studio経路で有効

環境・エラー:
- [ ] `app_cache_dir` 解決失敗・ディスクフル・書込中アンマウントのエラー伝播（クラッシュせずFlashErrorへ）
- [ ] Info.plist `NSRemovableVolumesUsageDescription` — TCC**拒否**時にどのエラーになりja.tsで何と表示されるか（コード上の経路確認。実ダイアログは実機）
- [ ] main.rsコマンド登録6個の網羅・既存transport系6個との非干渉
- [ ] supportLogに書き出す内容のPII確認（顧客特定情報・シリアルの扱い）

### 4-2. R2: TSウィザード/UI（Codex＋code-reviewerで確認）

状態機械:
- [ ] machine.ts全遷移の列挙 — **行き止まり状態ゼロ**（全エラー状態からrecovery or 最初に戻るへ到達可能）
- [ ] `min_tool_version`（semver比較）・`requires_settings_reset`（ハードブロック）・schema≠2拒否の発火順序と文言
- [ ] 巻き戻し系: 書込中にモーダルを閉じる／アプリ終了の挙動（書込は続く？中断？表示は？）

エラー・復旧:
- [ ] `FlashError` 全variant vs `ja.ts formatError` の対応網羅（**ManifestInvalid / Io がcase一覧に見えない**＝本日grep。default fallbackの有無と文言を確認）
- [ ] useRecoveryActions `baseline: []` の安全性 — 誤ボリューム（他のUSBメモリ等）採用がBoard-ID照合で確実に止まるか
- [ ] supportLog保存失敗時の挙動（保存もできない時に詰まないか）

互換・ゲート:
- [ ] fwinfo decode の後方互換 — 旧FW（subsystem非対応）・ゴミ応答・部分応答で「最新版を書き込めます」経路に安全に落ちるか
- [ ] `isTauri()` × `VITE_FEATURE_FW_UPDATE` の2重ゲートでWeb版に露出ゼロ（vite.config.ts define実装）
- [ ] **Studio本体がGATT/serialで同キーボードに接続中のままflash開始**した場合の資源競合・表示（切断誘導はあるか）— 単独ツールには無かったStudio統合固有の新リスク
- [ ] AppHeader組み込みによる既存機能への回帰（AppHeader.test.tsx含む）
- [ ] 写真アセット（fw-reset-*.webp）のライト/ダーク両テーマでの視認性（コード上のクラス確認。実見えは実機）

### 4-3. 実機でしか確認できない項目（レビューで議論しない）

mac（ドッグフード＋非開発者テスト）:
- [ ] TCCリムーバブルボリューム許可ダイアログの実出現タイミング・**拒否→再許可**の復帰経路
- [ ] マウント遅延・抜き差し複数回での検出安定性
- [ ] Gatekeeper（Sequoia実挙動）— 初回起動ダイアログの実文言 → 案内文B-6の確定
- [ ] universal dmgがApple Siliconで起動（Intel実機は§1要判断2）

win（ドッグフード＋非開発者テスト）:
- [ ] SmartScreen「詳細情報→実行」の実地＋案内文確定
- [ ] **Defenderリアルタイム保護有効でUF2コピーが成功**するか・速度劣化・誤検知
- [ ] ドライブレター検出の安定性（他のUSBストレージ共存時含む）
- [ ] win環境でのTCC相当なし＝標準ユーザー権限で完走するか

共通（非開発者テスト・doc 11 B-3の台本をそのまま使用）:
- [ ] 正常系1周を手順書なし・介入なしで完走（写真だけでリセット2回押しが伝わるか）
- [ ] 故意失敗3種の復帰（①書込中ケーブル抜き ②逆側リセット ③60秒放置）
- [ ] 完了の実感（動作確認チェック2項目を実際にやるか）
- [ ] 2台目キーボード/USBメモリ共存時の挙動（余裕があれば）
- [ ] 二重起動（既知C-5・確認のみ・ブロッカーにしない）

### 4-4. 両方で見る項目（レビューで予測→実機で確証）

| 項目 | レビューで | 実機で |
|------|-----------|--------|
| 書込中ケーブル抜き | PrematureReboot判定ロジック確認 | 実際に抜いて復帰まで完走 |
| 逆側リセット | Board-ID同一のため防げない設計限界＋recovery経路確認 | 非開発者が案内だけで復帰できるか |
| 60秒タイムアウト | NoBootloaderVolume→recovery自動遷移の配線 | 実挙動＋文言の分かりやすさ |

---

## (5) リスクとトレードオフ（critical-thinking 7観点で自己批判）

### 徹底と最短が衝突する箇所と推奨

| 衝突点 | 徹底側 | 最短側 | 推奨と根拠 |
|--------|--------|--------|-----------|
| Codexレビューの深さ | 全1,882行＋coreも再読 | 新規コードのみ | **新規＋移植差分のみ**。coreは10レビューで裏取り済み＋diff極小を本日実測。再読は重複投資 |
| ドッグフードのタイミング | レビュー完了後 | 今日即 | **今日即**。30分と安く、環境系発見の価値がCritical時の再走コストを上回る |
| 非開発者テストの成果物 | 本番CIビルド | ローカルビルド | **rc先行タグで本番同一物**（v2の核）。カレンダー増ゼロで品質が上がる |
| winの扱い | mac/win両合格までpublishしない | Mac先行 | **両合格が既定**（まさかず指定）。ただしテスター遅延時のMac先行分岐を用意＝判断はまさかず |
| CIへのcargo test追加 | rc前に1行追加 | 次版送り | **次版送り**（v1判断維持）。今回はローカル35緑を毎回再実測で担保。リリース直前のCI定義変更はそれ自体がリスク |

### 7観点セルフチェック

1. **抜け漏れ**: Intel Mac未検証（§1要判断2で回収）／Codex並列2セッションの可否未確認（直列設計で吸収）／tauri-actionのrcタグ×版数不一致挙動未確認（§3-3で実行時確認＋fallback）
2. **背反**: rc先行タグの背反＝draft/タグの掃除が増える（#11で明記）。並行化の背反＝Codex Critical時にドッグフードが無駄になる（30分・許容）
3. **ハッピーストーリー**: 「Codex指摘ゼロ」を前提にしない — 修正0.5〜1日をスケジュール分岐に織込済み。「テスターすぐ捕まる」も前提にしない — C1を初日先頭に
4. **机上の空論**: rc方式はrelease.ymlの実Read（trigger/draft/prerelease）で成立確認済み。ただしCI実走は今日が初＝#4の完了判定（アセット実在）で現実照合
5. **根拠**: 本書の新主張は全て本日のgit log/diff/Read/grepの実測。doc 11の監査結果は流用（再実測4点はB2で毎回回す）
6. **事実確認**: 依頼文の「8コミット」は実測10（f70d70fとUI 2本の計上差）。結論への影響なし
7. **見過ごし**: farmware `releases/latest` フリーズ（§3-4）／main凍結（§3-4）／supportLogのPII（R1項目）／GATT接続中flash（R2項目・Studio統合で新たに生まれた面）を明示的に拾った

### 残リスク表（v1から引き継ぎ＋v2新規）

| # | リスク | 当座策 | 恒久策 |
|---|--------|--------|--------|
| 引継C-1 | R/L取り違えはコードで防げない | 故意失敗②で復帰経路を実証（両OS） | FW側side識別RPC |
| 引継C-5 | 二重起動（single-instance未導入） | recoveryで復帰可・実機で確認のみ | プラグイン追加（次版） |
| 引継C-8 | `releases/latest` 即時切替 | **リリース期間中farmware publish禁止**を運用ルール化 | stagingチャネル |
| 新規V2-1 | rcタグ×tauri-actionの未確認挙動 | #4完了判定で即検知・fallback有 | — |
| 新規V2-2 | レビュー3系統の指摘洪水で停滞 | 分類と処理期限（§2-4-5）で「今直す/後で直す/直さない」を即断 | — |
| 新規V2-3 | GATT接続中flashの資源競合（未確認） | R2レビュー項目＋ドッグフードで接続状態から更新を1回試す | 必要なら切断誘導を追加 |

### 省かないもの（品質ゲート・再掲）
- Codex統合レビューR1/R2＋code-reviewer＋Fable仲裁（今回の核心）
- 非開発者テストmac＋win・故意失敗3種（M2/M3受け入れ基準そのもの）
- rc成果物での初回起動実地確認・GO-4のdraft検証
- 書込前検証・Board-ID照合などコード側ゲート（実装済み・触らない）

---

## 付記: 本設計書の検証ログ（本日の実行事実）

- `git log feature/fw-update-integration`: 44d5a6f以降10コミット・HEAD 5d48146一致・未コミットはCLAUDE.mdのみ
- `git diff --stat 44d5a6f..5d48146`: 37ファイル・+4,290行/-7行。内訳ディレクトリ実測（src/firmware-update 12＋proto 2・crates 10・src-tauri 5・設定他）
- `diff -rq` 単独版 vs vendored core: 実質差分 lib.rs/machine.rs の定数抽出のみ（全文diffで内容確認）。mk-flash-cliはCargo.tomlのみ差
- 単独リポ全9コミットの日付実測: 全て2026-07-09。最終コード修正08:54 < vendoring 21:01 → 逆移植漏れなし
- `release.yml` Read: `tags:['v*']`・`releaseDraft: true`・`prerelease: contains(ref_name,'-')`・test job（lint/test/build）→ build-tauri matrix
- Info.plist diff: `NSRemovableVolumesUsageDescription` 追加を確認
- `src-tauri/Cargo.toml:32`: `mk-flash-core = { path = "../crates/mk-flash-core", features = ["download"] }`
- `ja.ts` grep: formatError実装のcase 11種を確認（ManifestInvalid/Io不在→R2確認項目化）
- `git rev-list`: feature..origin/main = 0（mainは1歩も先行していない）／逆方向 = 11
- 未確認（本文明記済み）: tauri-actionのrcタグ挙動・Codex並列可否・Sequoia Gatekeeper実挙動・win Defender実挙動・Intel Mac
