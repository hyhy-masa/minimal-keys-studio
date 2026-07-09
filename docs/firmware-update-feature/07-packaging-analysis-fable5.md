# 07 パッケージ形態の最終判断: flasher を Studio に統合するか、分けたままにするか

- 作成日: 2026-07-09
- 作成: Fable 5（デスクトップアプリ・アーキテクトロール／read-only調査）
- 前提資料: `00-decisions.md`（まさかず判断: 案A＋実現性スパイク条件）、`03-design-fable5.md`（統合設計）、flasherリポ `docs/PLAN.md` / `docs/BUILD_STATE.md`
- 調査方法: 両リポの実コード・設定・CIを直接読んで裏取り（推測は「確認できなかった前提」に隔離）

---

## 要約

> **推奨 = 案A（Studioネイティブ統合）。単独flasherは「実現性スパイク」としての役目を終えた。
> コア(mk-flash-core)はtauri非依存で作られているので、移植は2〜4人日の機械的作業。
> 分けたまま(C)にすると、署名・配布・案内・バージョン整合の「2倍税」を永久に払い続ける。**

一言でいうと: **今のflasherは「別アプリとして完成させた」のではなく「別リポで検証しきった」状態**。検証は終わったので、本体（Studio）に持ち帰るのが一番安い。これは2026-07-09にまさかずが決めた方針（00-decisions: 案A＋スパイク先行）そのものであり、方針変更ではない。

---

## 1. まず前提の整理（実コードで確認した事実）

### Studio側（`~/claude-code/minimal-keys-studio`）
| 項目 | 事実 | 出典 |
|---|---|---|
| 技術スタック | Tauri 2（ロック実体 **2.11.3**）＋ React 18.2 ＋ Vite 5 | `src-tauri/Cargo.lock`, `package.json` |
| Rust側の規模 | 薄い。transport層 約380行＋コマンド6個のみ | `src-tauri/src/main.rs`, `transport/` |
| プラグイン | cli / http / dialog / **fs** | `src-tauri/Cargo.toml` |
| webview権限 | **既に広い**: `fs:allow-write-text-file` path `**`（任意パスへのテキスト書込を既に許可済み） | `capabilities/default.json` |
| 配布形態が2つ | デスクトップ（tag→tauri-action→dmg＋NSIS）**と** Web版（main→GitHub Pages。Web Serial/Web Bluetoothで動く） | `.github/workflows/release.yml`, `deploy.yml`, `src/App.tsx:60-91` |
| macOS署名 | **ad-hoc（`signingIdentity: "-"`）＝Apple公証なし**。顧客には「右クリック→開く」等の回避手順を案内する運用。Apple Developer Program は**2026-07-02に「加入しない」判断済み** | `tauri.conf.json`, `docs/MACOS_INSTALL_GUIDE.md:49-51` |
| Windows署名 | NSIS無署名。`trusted-signing-metadata.json` は存在するが**Azure Trusted Signingのアカウント名が "ZMKStudio"**＝上流ZMK Studio由来の残骸の可能性が高く、release.ymlからも参照されていない（未使用） | `src-tauri/trusted-signing-metadata.json`, `release.yml` |
| macOS権限 | Info.plist=Bluetooth説明のみ。entitlements=sandbox無効＋BT＋network。**リムーバブルボリューム関連の記述なし** | `Info.plist`, `entitlements.plist` |
| リリース自動化 | release-please＋tauri-action（tagを打てばdraft releaseまで自動） | `release-please-config.json`, `release.yml` |

### flasher側（`~/farmware/minimal-keys-flash`, branch `feature/mvp-flasher`）
| 項目 | 事実 | 出典 |
|---|---|---|
| 構成 | **3層きれいに分離**: `mk-flash-core`（純Rust・tauri非依存・`unsafe`ゼロ・単体テスト35本）／`mk-flash-cli`（救出用CLI）／`src-tauri`＋React GUI（薄いラッパ175行＋フロント約600行） | `Cargo.toml`, `crates/`, `src-tauri/src/commands.rs` |
| コアの依存 | serde / serde_json / sha2 / thiserror ＋ downloadフィーチャ時のみ ureq。**ネットワークなしでテスト可** | `crates/mk-flash-core/Cargo.toml` |
| Tauri版 | ロック実体 **2.11.5**（Studioの2.11.3とほぼ同世代。統合時の版衝突リスクは実質なし） | `src-tauri/Cargo.lock` |
| webview権限 | **意図的に最小**: `core:default`＋`dialog:default`のみ。fsプラグイン不使用、書込はRust側ガード付きカスタムコマンド | `src-tauri/capabilities/default.json` |
| 特殊権限 | macOSは `NSRemovableVolumesUsageDescription`（書き込みモードのキーボード＝USBメモリ扱いのボリュームへ書くための、初回許可ダイアログの説明文）**だけ**。管理者権限・ドライバ・特殊entitlement不要。Windowsは追加権限ゼロ | `src-tauri/Info.plist`, 03-design §3.6 |
| 安全ゲート | 書込前UF2検証（構造＋familyID＋アドレス窓＋SHA-256）／Board-ID実測値ゲート（`Seeed_XIAO_nRF52840`）／単一ボリューム制約／単一実行ガード／キャンセル | `commands.rs`, `machine.rs`（実機E2Eで通し済み） |
| 実績 | **CLI・GUIとも実機でR→L更新を完走**（2026-07-09）。macOS TCC（許可ダイアログ）はブロックせず | `docs/BUILD_STATE.md` |
| **未完了の出荷作業** | アプリ自体の**リリースworkflowが存在しない**（ci.ymlのみ。`pipeline/release.yml`はFWリポ用テンプレで別物）／アイコンがプレースホルダ／署名未着手／リカバリUI簡易版／Windows(M3)未着手 | `.github/workflows/`, `BUILD_STATE.md` |
| 別リポになった経緯の一部 | 開発サンドボックスで `~/claude-code` 配下に書けなかったため `~/farmware` に配置（純粋なアーキテクチャ判断だけではない） | `BUILD_STATE.md` Step0 |
| manifest設計 | `min_tool_version` と `min_studio_version` の**両方**を既に持つ＝どのパッケージ形態でも配布側は変更不要 | `manifest.rs:58-60`, `generate_manifest.py:77-78` |

### 判断に効く構造的事実（3つ）
1. **文鎮化はUF2の仕組み上起きない**。ブートローダー領域はUF2書込で上書きされない → 途中でアプリが落ちても「リセット2回→焼き直し」で必ず復旧できる（03-design §2.6）。→「flasherが落ちたらどうする」の恐怖の大半は設計で既に消えている。これが「プロセス分離（B/C）の価値」を大きく割り引く。
2. **最悪ケースの更新（settings_reset＝GATT変更）はStudioが必須**。設定のバックアップ→復元はStudioのRPCでしかできない（flasher側はハードブロック中）。C案だと顧客は「Studioでバックアップ→flasherで4回書く→Studioで復元」と**2つのアプリを行き来する**（BUILD_STATE リスクR2'）。
3. **将来のワンクリック化（dfu RPC）はStudioのtransport層が必要**。C案でこれをやるにはflasherにBLE/シリアルRPCを複製することになり、03-design比較表で既に棄却済み（「結局Studio相当のtransport実装が要る」）。

---

## 2. 7軸 × 3案 比較

凡例: ◎=最良 ○=良 △=条件付き ×=劣る

| 軸 | A: Studioネイティブ統合 | B: Studioからsidecar呼び出し | C: 完全独立アプリ（現状） |
|---|---|---|---|
| ①実現性・工数 | ◎ **2〜4人日＋実機再検証0.5日**。コアはtauri非依存＝Cargo依存1行、コマンド層175行＋フロント約600行の移植。Tauri/React版はほぼ同一 | △ 3〜5人日＋**IPC設計が新規発生**（進捗・キャンセルをstdio経由で流す規約、OS別バイナリ命名、NSIS/dmgへの同梱） | ◎ 追加ゼロ…に見えるが、**出荷までの残作業（リリースworkflow新規作成・アイコン・署名方針・配布ページ・案内文）はA移植と同規模** |
| ②保守性 | ◎ 1リポ・1リリース列車（release-please＋tauri-action既存）。ウィザードもコアも一箇所 | △ 配布1つだがコード2系統＋**アプリ内IPC契約という第3の保守対象**が増える | × リリース2列車・アイコン2種・案内文2種・**min_tool_version×min_studio_versionの整合マトリクス**を恒久管理 |
| ③アプリ安定性 | ○ flashコードはStudioと同一プロセス。ただしコアは`unsafe`ゼロ・純同期ファイルI/Oのみ・blockingスレッド実行で、クラッシュ源になりにくい。**万一書込中に落ちても復旧可能（事実1）** | ◎ プロセス分離でクラッシュ相互波及なし。ただしその価値は事実1で割引 | ◎ 完全分離＋「Studioが壊れていても焼ける」。ただしこの救出役は**mk-flash-cliが既に担える**（A/B案でも残せる） |
| ④権限分離・セキュリティ | ○ StudioのInfo.plistにリムーバブルボリューム許可の説明文を1键追加。webview権限は**広げない**（カスタムコマンド＋Rust側Board-IDガード方式をそのまま移植）。なおStudioは既に`fs:write-text-file **`を持っており、「Studioに書込権限を持たせない」という建前は現状でも成立していない | △ TCCの許可は**親であるStudioに帰属**するため権限面はAと同じ。加えてsidecar起動権限（shell系）が**追加で**必要になり、webview脱出経路として攻撃面はAより広い | ◎ 最もクリーン: Studioはボリューム書込に一切触れない、flasherはBLE/telemetryなし。ただし差分は「Board-IDゲート＋UF2非文鎮性」により実害ベースでは小さい |
| ⑤署名・notarization（Apple公証） | ◎ 1バンドル。顧客のGatekeeper回避操作は**Studioで済ませた1回のまま**。将来Developer ID加入時も公証は1本 | ○ 1バンドルだが同梱バイナリごとに署名対象が増える（tauriがexternalBinを署名対象に含める。Win NSISは各exe個別） | × **回避操作×2・SmartScreen警告×2・（将来）公証パイプライン×2**。flasher自身のPLANが認めている: 「ad-hocだと『怪しいアプリがキーボードを書き換える』体験で**単独ツールでは統合案より痛い**」（PLAN.md:76） |
| ⑥顧客導線（低頻度更新） | ◎ 年1〜2回の作業のために**既に持っているアプリのメニュー1項目**。「更新があります」を受動的に出せる。LINE/Discord案内（決定2）は「Studioを開いて更新→FW更新」の1本道 | △ DLは1つだが、GUI同梱なら2ウィンドウUX、CLI同梱ならUIをStudioに作り直し＝実質A | × 年1〜2回しか使わないアプリを**探す→落とす→回避操作**からやり直し。どちらのアプリにも自動更新機構がない（tauri-plugin-updater不使用）ため、**古いflasher問題**はmin_tool_versionゲート＋人手案内で捌き続ける。settings_reset時は2アプリ往復（事実2） |
| ⑦Windows将来コスト | ◎ M3の中身（ドライブ走査・Win32エラー表・Defender）は共通だが、**ビルド/配布はStudioの既存windows-latestジョブに同乗** | △ sidecarのターゲット別命名＋NSISへの同梱検証が追加 | × インストール検証・SmartScreen・配布手順を**2アプリ分** |

**採点の含意**: Cが勝つのは④（と③の一部）だけで、その優位も「Board-IDゲート＋UF2非文鎮性＋CLI救出ツールの存続」で実害ベースでは薄い。①②⑤⑥⑦はAの圧勝。Bは「Aの権限面の懸念を解消しないまま、IPCという保守対象だけ増える」中間案で、**積極的に選ぶ理由が見つからなかった**。

---

## 3. 推奨案と根拠

### 推奨: 案A（Studioネイティブ統合）。flasherリポの成果はほぼ全量持ち帰る

理由は4つ。

1. **経済性が逆転している**。Cを「出荷できる状態」にする残作業（リリースworkflow新規・アイコン・署名方針・配布ページ・案内文・リカバリUI）は、A移植（2〜4人日）と同規模。つまり**今からCに投資しても安くならず、そのうえ2倍税（軸②⑤⑥⑦）が永久に残る**。
2. **最悪ケースがCでは製品にならない**。GATT変更を伴う更新はStudioバックアップ→flasher→Studio復元の2アプリ往復（事実2）。顧客セルフ更新の売りが一番大事な場面で崩れる。Aなら1つのウィザードで完結する。
3. **将来の伸びしろがStudio側にある**。ワンクリック化（dfu RPC・03-design Phase 2）はStudioのtransport層に1フック足すだけ。Cでは transport の複製が必要（設計時に棄却済みの袋小路）。
4. **統合コストは実測済みに近い**。mk-flash-coreは最初から切り出せる形（tauri非依存・unsafeゼロ・35テスト）で書かれ、Tauri版もほぼ同一（2.11.3/2.11.5）。単独MVPのハード実機E2E完走は、00-decisionsが要求した「実現性スパイク」の完了証明と読むのが正確。

### なぜBではないか（明示的に棄却）
- macOSの許可ダイアログ（TCC）は子プロセスでも**親のStudioに帰属**する。つまり「Studio本体に書込権限を持たせたくない」というBの動機は、macOSでは達成されない。
- 達成されない動機のために、sidecar起動権限（攻撃面の拡大）・stdio越しの進捗/キャンセル規約・OS別バイナリ同梱という保守対象だけが増える。
- プロセス分離によるクラッシュ隔離は本物の利点だが、UF2の非文鎮性（事実1）とCLI救出ツールの存続で十分カバーされる。

### 判断が変わる分岐条件（正直に）
- **「今週中に顧客へFW更新を届けなければならない」場合のみ、Cを1回だけ出荷**（ただしリリースworkflowとアイコンは作る必要があり、実はさほど速くない）→ 次サイクルでAへ移行。現時点でFWリリースの差し迫った予定が確認できなかったため、既定はA直行。
- **Studioのデスクトップ配布をやめてWeb版に一本化する構想があるなら、Cが唯一の選択肢**になる（ブラウザからはボリューム書込ができない）。現状その兆候はない（release.yml現役・0.3.0リリース直近）が、まさかずの構想確認は必要（後述の前提1）。

---

## 4. 推奨案（A）の背反・残リスク

「いいことばかり」で選ばないための正直な代償リスト。

| # | 背反・リスク | 重さ | 対策 |
|---|---|---|---|
| A-1 | **リリース列車の結合**: flashのバグ修正は「Studioの次リリース」でしか届かない。逆にStudio側の回帰がflash出荷を止める | 中 | 03-design §6 のfeature flag（`VITE_FEATURE_FW_UPDATE`）で機能単位の無効化を可逆に。release-pleaseでリリース自体は安価 |
| A-2 | **プロセス共有**: 書込中にStudioの他機能（BLE接続処理等）がパニックすると書込プロセスごと落ちる | 低〜中 | 実害は事実1で回復可能。運用対策としてウィザード中はRPC切断状態で走らせる（flashはRPC非依存＝03-design §3.1の分離を維持） |
| A-3 | **TCC再検証が必須**: 実機E2EはflasherのバンドルID（com.minimalkeys.flash）で通したもの。**StudioのバンドルIDで許可ダイアログが同様に出るか・拒否後の導線は未検証**（U-3の再走） | 中 | 移行パスStep 7に組込み。万一挙動差があっても説明文＋設定画面への導線で吸収可能な種類の問題 |
| A-4 | **Studioの攻撃面は微増する**: webview権限は広げないが、Rustプロセスに「manifest取得→ダウンロード→/Volumes配下へ書込」の経路が加わる | 低 | Board-IDゲート・SHA-256・app_cache_dir固定・単一実行ガードを移植でそのまま維持。むしろ既存の`fs:write-text-file **`の方が広く、**別課題として将来狭める**（03-design §3.6の注記と同じ） |
| A-5 | **Web版ユーザーはFW更新できない**: GitHub PagesのStudioからはボリューム書込不可。デスクトップ版の導入が必須 | 低 | メニューを `window.__TAURI_INTERNALS__` でゲート（判定パターンは`App.tsx`に既存）＋LINE/Discord案内に「デスクトップ版で」を明記。※Cでも別アプリDLが必要なので条件は同じ |
| A-6 | **単一実行ガードの意味変化**: flasherのsingle-instanceプラグイン（多重起動→同一ボードへ二重書込の防止）はStudio全体の起動挙動を変えるため、そのままは持ち込めない | 低 | プロセス内はBusyGuard（移植）で担保。Studio多重起動時の書込競合はガード済みボリューム占有＋単一ボリューム制約で実害限定。必要なら書込中ロックファイルを追加 |
| A-7 | **捨てるものがゼロではない**: flasherのGUI外殻（App.tsx等 約600行のうちTauri設定・アイコン・単独アプリ導線ぶん）は破棄。心理的サンクコスト | 低 | コア・状態機械・テスト・実機知見（Board-ID実測値・タイミング定数）は全部生きる。GUI外殻は最小構成なので損失は小さい |

---

## 5. 移行パス（現状C → A）

**総工数目安: 2〜4人日＋実機再検証0.5日。** 00-decisionsの「branch＋git worktreeで作業」に従う。

### Step 1: リポ形態の決定（0.5日・まさかず判断が1つ）
- **推奨: コアをStudioリポへ移設（vendoring）**。`minimal-keys-studio/crates/mk-flash-core`（＋`mk-flash-cli`）を置き、`src-tauri/Cargo.toml` に `mk-flash-core = { path = "../crates/mk-flash-core", features = ["download"] }` を1行追加。
  - 理由: 1人運用では「1リリース＝1リポ」の原子性が事故を減らす。コアのCIテスト（35本）もStudio CIへ移す。
  - 代替: flasherリポを「コア＋CLIの家」として残しgit依存（rev固定）。リポ手術は不要だが、2リポ更新の手順が恒久化するため次点。
- flasherリポ自体は**削除しない**（アーカイブ化 or コア置き場として存続。処遇はまさかず判断）。

### Step 2: Rustコマンド層の移植（0.5日）
- `commands.rs`（175行）→ `src-tauri/src/flash/mod.rs` へ。`main.rs` の `invoke_handler` に6コマンド追記＋ `.manage(FlashState::new())`。既存transport 6コマンドと名前衝突なし（確認済み）。
- single-instanceプラグインは持ち込まない（A-6）。BusyGuardはそのまま。

### Step 3: OS権限の追記（0.25日）
- Studioの既存 `Info.plist` に `NSRemovableVolumesUsageDescription` キーを**追記**（flasherの文言をコピー。置換ではなくマージ—Bluetooth説明は残す）。
- `capabilities/default.json`・CSP・entitlements は**変更なし**（03-design §3.6の結論どおり。flasherの実装が「webview権限を広げない」方式であることを確認済み）。

### Step 4: フロント移植（1日）
- `machine.ts`＋`machine.test.ts`＋`useFirmwareUpdate.ts`＋画面＋`i18n/ja.ts` → `src/firmware-update/` へ。AppHeaderにメニュー1項目。
- ゲート2枚: `window.__TAURI_INTERNALS__`（Web版で非表示）＋ `VITE_FEATURE_FW_UPDATE`（リリース判断の可逆化）。
- manifest URLは本番既定＋`VITE_MK_MANIFEST_URL`上書き（flasherの方式を踏襲）。

### Step 5: CI統合（0.25日）
- Studio `release.yml` のtestジョブに `cargo test -p mk-flash-core` を追加（現状npmテストのみ）。ビルドはtauri-actionが同一バイナリに含めるので**リリース側の変更は不要**。

### Step 6: FW配布側（変更なし・確認のみ）
- `pipeline/release.yml`テンプレ＋`generate_manifest.py` を `minimal-keys-farmware` リポへ配置する作業は**パッケージ形態と無関係に必要**（未実施のまま）。manifestは`min_studio_version`を既に持つため、A化での配布側変更はゼロ。

### Step 7: 実機再検証（0.5日・ハードウェアゲート）
1. StudioバンドルIDでのTCCダイアログ発火・拒否→復帰導線（**U-3再走。A-3の解消**）
2. Studio内ウィザードでR→L実機E2E（flasher版と同項目）
3. BUILD_STATEで未了のまま残っている「非開発者ユーザビリティテスト＋故意の失敗3種からの復帰」（これはC継続でもどのみち必要だった作業）

### Step 8: 後始末
- flasherリポのREADMEに「GUIはStudioへ統合済み。本リポはコア＋救出CLI（or アーカイブ）」と明記し、`00-decisions.md` に本判断を1行追記。

---

## 6. 確認できなかった前提（まさかずへの確認事項）

1. **Studioデスクトップ配布の継続意思**: Web版（GitHub Pages）とデスクトップ版の二本立てが今後も続く前提で分析した。デスクトップ廃止・Web一本化の構想があるなら結論はCに反転する。
2. **FWリリースの差し迫った予定**: 「今週中に顧客へ更新を出す」等の締切があるかは両リポから読み取れない。あるなら分岐条件（§3）どおりC一回出荷→A移行も許容。
3. **`trusted-signing-metadata.json` の帰属（U-12）**: アカウント名"ZMKStudio"は上流由来の未使用ファイルと推定したが、Azureポータルでの実確認はしていない。Windows署名を将来やる場合は自前のTrusted Signingアカウントが別途必要になる前提で見積もった。
4. **Studioリポの未push作業との衝突**: Studio側に未pushコミット・実機確認待ちがある記録（メモリ）があり、ブランチの切り出し基点はまさかずと合意してから決める。
5. **Apple Developer Program非加入の継続**: 2026-07-02判断を前提に「回避手順×1 vs ×2」で比較した。加入方針に変われば⑤のA優位はさらに拡大する（公証1本 vs 2本）。
6. **TCC挙動のStudioバンドルIDでの再現**（A-3）: 実機でしか確定しない。移行パスStep 7で最初に潰す。
