# Track2土台レビュー（Fable5独立検証）

検証日: 2026-07-08 ／ 対象: studio-wired-current-state.md（Sonnetブリーフ）＋社長室の実現性・影響度評価
検証方法: Studio/FW実コード・FWバイナリ(strings)・Cargo/npm実体・GitHub API・cargo metadataで全主要主張を一次照合

---

## 検証サマリー

**土台の信頼性: ブリーフは高精度（主要主張ほぼ全CONFIRMED、軽微な誤り2件のみ）。一方、社長室の実現性・影響度評価には設計の前提を変える見落としが3つある。**

最重要の指摘3つ:

1. **「現バージョン検出」と「bootloader自動遷移」は、既出荷FWに対して現行プロトコルでは実装不可能（鶏と卵）**。
   - GetDeviceInfoResponse = `{name, serialNumber}` のみ、FWバージョンfieldなし（ts-client `lib/core.d.ts:21-24`）
   - reboot/bootloader系RPCはts-client全library・FW側custom subsystemともに存在しない（grep全滅を確認）
   - → 初回セルフ更新は必ず「バージョン不明前提」＋「キー操作 or 物理リセット2回でのbootloader遷移」の設計になる。新FWにversion/reboot custom subsystemを足して次回以降解消する2段構えが必須。②の評価文「現バージョン検出」はこのままでは成立しない。

2. **配布チャネルが存在せず、署名は「拡張」でなく「ゼロから」——ただし署名は本機能固有の要件ではない**。
   - FWリポ(hyhy-masa/minimal-keys-farmware, public)のGitHub Releasesは**0件**（API実測）。現行flash-farmware.shはCI artifacts経由=**要gh認証**で顧客は取得不能。配布チャネル自体を新設する必要がある（公開リポなのでReleases化は低コストだがリリース運用が新規発生）
   - Studio自体が**ad-hoc署名・notarizationなし**: `tauri.conf.json:36` `"signingIdentity": "-"`、`release.yml`に署名secrets皆無、`trusted-signing-metadata.json`は上流ZMK Studioの残骸（CodeSigningAccountName: "ZMKStudio"）で機能しない
   - ただし `docs/MACOS_INSTALL_GUIDE.md` でGatekeeper回避を顧客案内済み=未署名配布は既に運用中の製品全体ギャップ。Track2に署名を含めるかはスコープ判断であり、⑤の中身を分解すべき

3. **settings_resetを更新フローに含めると、顧客のStudio設定が消える——バックアップ機構はキーマップのみ**。
   - 現行手順（flash-farmware.sh:74-81）は R/L とも settings_reset→本体 の2段書き。settings_resetはキーマップ・コンボ・トラックボール・ホールドタップ・エンコーダ設定・**BLEボンド全部**を消す
   - Studioの既存エクスポート `src/keyboard/keymap-io.ts` はキーマップ（ExportLayer/ExportBinding）のみ。コンボ等の復元手段なし
   - 加えて **R/L側の判別が不可能**（両方 `/Volumes/XIAO-SENSE` で同名マウント、UF2ボリュームに側を示す情報なし。flash-farmware.sh:90にも「※左右ともXIAO-SENSEとしてマウント」と明記）→ 誤った側への誤書込は構造的に防げず、UI誘導で吸収するしかない
   - → ④「顧客UI/UX=中」は過小評価

---

## ① 現状把握ブリーフの検証結果

### CONFIRMED（実コードで裏取り済み）

| 主張 | 根拠 |
|---|---|
| flash/UF2/DFUコード皆無（Bootloaderキーコード名のみ） | grep再実行、ヒットは`src/behaviors/*`等のキーコード表示名のみ。`scripts/generate-release-data.js`もflash処理なし |
| capabilities=テキストI/Oのみ、path `**` | `src-tauri/capabilities/default.json:29-36`（fs:allow-write-text-file / read-text-file のみ。write-file/read-dirなし） |
| fs:default=アプリ専用Dir読取のみ | `~/.cargo/.../tauri-plugin-fs-2.5.1/permissions/default.toml` 実物確認: create-app-specific-dirs + read-app-specific-dirs-recursive + deny-default |
| shell/processプラグイン不在 | `Cargo.toml:17-31`（http/dialog/fs/cliのみ）、main.rs plugin登録4つ |
| serial transport実装済み・flashと独立 | `src-tauri/src/transport/serial.rs`（接続+RPC中継のみ、書込機能なし）。invoke_handler 6コマンドのみ（`main.rs:23-30`） |
| TRANSPORTS配列でBLE/USB並列（Tauri時はネイティブ固定） | `src/App.tsx:64-93` 実読で一致 |
| baudrate不一致 9600 vs 12500 | `serial.rs:19`=9600、ts-client `lib/transport/serial.js:4`=12500（ブリーフは:5と記載=1行ズレ、軽微） |
| serialport crate依存だが直接未使用 | `grep "serialport::"` 0件（tokio-serialの内部依存として実質重複） |
| tauri 2.11.3 | Cargo.lock実確認 |
| ts-client=自社fork `7c83338` 解決 | package-lock.json実確認 |
| build.yaml R/L両方に studio-rpc-usb-uart snippet | build.yaml実読 |
| snippet→chosen node→UART transport自動有効 | `zmk/app/snippets/studio-rpc-usb-uart/*.conf/.overlay`＋`app/src/studio/Kconfig`（default y if dt_chosen_enabled）実読 |
| R.confのみ STUDIO=y / TRANSPORT_BLE=y | minimal-keys_R.conf実読（+ LOCKING=n）。L.confにstudio/usb系なし（grep 0件） |
| entitlements: sandbox=false, BT, network.client のみ | entitlements.plist実読 |
| BLE/USBが同一ActiveConnection stateを共有 | `commands.rs:23-25`、`serial.rs:29`、`gatt.rs:115` 実読 |

### ブリーフの誤り・言い過ぎ（2件、いずれも軽微）

1. **B.5 `set_exclusive` panicの位置**: ブリーフは「この非同期タスク内でのpanic」と記述するが、実際は `serial.rs:21-23` で **spawn前のコマンド本体内**。panicはコマンドFutureを直撃するため、体感は「無応答」より「invoke失敗/アプリ巻き込み」に近い可能性。原因候補としての価値は変わらないが挙動の推定が変わる。
2. serial.jsの行番号 5→正しくは4（無害）。

### 「不明」4点の前進結果

1. **L側Studio有効可否 → 確定: L側FWにStudio RPCは入っていない**。
   - 三重の根拠: (a) snippet confは`CONFIG_ZMK_STUDIO`を設定しない（実読）、(b) L.confにも無い（grep 0件）、(c) KconfigはペリフェラルでZMK_STUDIO_RPCをselectしない（`select ZMK_STUDIO_RPC if !ZMK_SPLIT || ZMK_SPLIT_ROLE_CENTRAL`）
   - **バイナリ実証**: `firmware/minimal-keys_R...uf2` のstringsに `studio_rpc_thread`/`zmk_studio_*` あり、`minimal-keys_L...uf2` には `snippet_studio_rpc_usb_uart`（DTノード名）のみでRPCシンボルなし
   - 含意: **L側はUSB CDC ACMポートとして列挙される（snippetのUSB設定は入る）がRPC無応答** → 「認識されるが接続できない」の構造的原因として最有力・ほぼ確定。残る確認は実機1回（R側ポートで接続成功するか）のみ
2. **lib.rs → 確定: コンパイルはされるがデスクトップ実行では未使用**。
   - cargo metadata実行: lib(src/lib.rs)+bin(src/main.rs)の2ターゲット。binはmain.rs自己完結（`mod transport`直持ち）でlib::run()は呼ばれない
   - **実務上の罠**: 新Tauriコマンドは `main.rs:23-30` のinvoke_handlerに追加する必要がある。Tauri v2標準テンプレはlib.rs側に書くため、テンプレ準拠のコード生成が静かに無効になる事故が起きやすい
3. **macOS /Volumes書込 → ほぼ確定: entitlement不要だがTCC「リムーバブルボリューム」初回同意が出る**。
   - sandbox=falseなのでsandbox entitlementは無関係。ただしCatalina以降、リムーバブルボリュームへのアクセスはTCCプロンプト対象。`Info.plist` は現状 `NSBluetoothAlwaysUsageDescription` のみで **NSRemovableVolumesUsageDescription なし** → 追加推奨。顧客が拒否すると書込EPERMで失敗するため、UI側で拒否時の再許可導線（システム設定への案内）が必要
   - ad-hoc署名は更新のたびに署名同一性が変わり、TCC許可が引き継がれない可能性あり（実機確認1回で確定）
4. **不具合再現条件 → L側原因が最有力候補に昇格**（上記1）。9600ハードコード・set_exclusive panicは第2候補として残置。

### ブリーフが拾わなかった土台事実（追加発見）

- `scripts/generate-release-data.js` は**上流zmkfirmware/zmk-studioのreleasesを取得する死にコード**（src内でrelease-data.jsonの参照0件）。無害だが更新機能設計時に混同注意
- Studio配布はGitHub Releases公開済み（v0.3.0: dmg/exe/app.tar.gz、API実測）。FWリポ・Studioリポ・ts-clientリポは全てpublic（無認証200）
- 出荷キーマップに `&bootloader` 割当あり（`config/minimal-keys.keymap:139`、1箇所のみ）→ **片側はキー操作でbootloader遷移可能な可能性**（ZMKのreset系behaviorはキーの物理位置の側で実行される仕様のはず=要一次確認）。もう片側は物理リセット2回が必要。またこのキーはStudioで顧客が上書き可能なため、恒久的な依存先にはできない

---

## ② 実現性評価のレビュー

| 項目 | 社長室評価 | 判定 | 根拠 |
|---|---|---|---|
| ① UF2書込中核 | 中 | **条件付き妥当（「中」の上限）** | ロジック移植は素直だが、(a) R/L判別不能（下記）、(b) Windowsボリューム検出はドライブレター列挙+ラベル取得の別実装（std相当なし、windows-rs/sysinfo等の追加依存）、(c) 「書込中I/Oエラー=正常」ヒューリスティック（flash-farmware.sh:59-61）の顧客グレード頑健化、(d) macOS「ディスクの不正な取り出し」通知は抑制不能→UI文言で先回り必要 |
| ② FW取得・版管理 | 中 | **過小評価** | (a) 配布チャネル自体が不存在（Releases 0件・artifacts要認証）→リリースパイプライン新設、(b) **現バージョン検出はプロトコル上不可能**（DeviceInfoにversionなし・custom subsystemにもなし）→「不明前提」設計＋FW側version RPC追加の2段構え、(c) R/L/settings_resetの3ファイル同一ビルド整合の管理、(d) 「署名済みuf2」は不成立（UF2に署名機構なし、bootloaderは検証しない。HTTPS+ハッシュ検証が上限） |
| ③ Tauri権限追加 | 小 | **概ね妥当・分岐条件付き** | fs権限追加は小。ただしFWダウンロードをフロントfetchでやるなら http allowlist＋CSP connect-src（tauri.conf.json:64-67）にドメイン追加が波及。Rust側ダウンロードならCSP不要。ボリューム検出/書込は独自Rustコマンドの方が素直（fsプラグイン権限拡張では完結しない） |
| ④ 顧客UI/UX | 中 | **過小評価（本件の実質最大工数候補）** | (a) bootloader遷移ガイド（初回は必ず手動。キー割当は片側のみ＋顧客が上書き可能）、(b) settings_reset時の設定消失（バックアップはキーマップのみ、コンボ・トラックボール等は消える）→復元自動化 or settings_resetのリリース条件化の設計判断、(c) BLEボンド消失→全ホスト再ペアリング案内、(d) R/L判別不能のままR→L順序を顧客に守らせる誘導設計 |
| ⑤ Mac+Win検証+署名 | 中〜大 | **方向妥当・分解要** | 署名は本機能固有でなく製品全体の既存ギャップ（未署名配布をガイドで運用中）。Track2から署名を外せば⑤の実体は「Win実機検証」で中。含めるならApple Developer Program加入+notarization+Win署名をゼロからで大 |

**最大リスク3つの再評価**: 「bootloader自動遷移」はリスクでなく**不可能と確定した設計前提**。「Windows対応」は妥当。「署名・安全」は署名=既存ギャップ、安全の実体が別。言い直すと:
1. **既出荷FWとの互換性の崖**（version不明・reboot RPC不在→初回更新の体験が最悪ケース）
2. **R/L判別不能による誤書込**（機能的文鎮→サポートコール。真の文鎮化はUF2 bootloader不変のためほぼゼロ=ここは社長室評価より安全側に修正可）
3. **settings_reset起因の顧客設定・ボンド消失**（技術でなく製品体験の崖）

**総括の妥当性**: 「重さの正体はコア技術でなく製品要件」という骨子は正しい。ただしその製品要件の中身は「署名」ではなく「既出荷FWの制約・R/L誘導・設定保全」が主。

---

## ③ 影響度（blast radius）評価のレビュー

**「影響は低い」は方向として成立。ただし2つの但し書きと、共有リスクの中身の入れ替えが必要。**

- 「既存transport/RPC/proto層に触らない」→ **ほぼ成立するが「触らない」は言い過ぎ**。flash実行前にアクティブ接続の切断が必須で、ConnectionContext/connection_disconnectedのライフサイクルと必ず連動する（BLE/USBが単一の`ActiveConnection` stateを共有しているため、commands.rs:23-25）。更新後の自動再接続まで作るなら接続フローへの関与はさらに増える。改修は小さいが統合点はゼロではない
- 「唯一の共有リスク=Tauri権限拡張が配布審査/署名に効く」→ **この主張は不正確**。App Store配布ではなく「審査」は存在せず、capabilitiesは署名にも影響しない。**挙げた唯一の共有リスクが空振りで、実在する共有影響が漏れている**:
  1. Info.plist変更（NSRemovableVolumesUsageDescription追加）はバンドル全体に効く（害は無いが再配布必須）
  2. 将来正式署名を入れると署名IDが変わり、既存顧客のTCC許可（Bluetooth含む）が再プロンプトになる可能性
  3. フロントfetch方式を選ぶとCSP/http allowlistの拡張=webview全体のネットワーク境界変更
  4. 新規Rust依存（Winボリューム列挙等）でビルド時間・バイナリ微増（軽微）
- 反証探索の結果、無かったもの（根拠付き）: tauri-plugin-updater不使用（Cargo.toml/package.jsonに無し）→自動更新との干渉なし。release.ymlはタグ駆動でdmg/exe生成→機能追加そのものはビルド構成に影響なし。起動時初期化への追加はない設計が可能
- **見落とされた最大の波及は技術結合でなく運用**: FWリリースチャネル（Releases化・バージョニング規約・R/L/reset 3点セット整合・リリースノート）という**継続運用がStudioリポの外に新設される**こと。コードのblast radiusは小さいが、事業のblast radius（更新失敗=サポートコール直結）は「低い」と言い切れない

---

## 未確定と確定方法

| # | 未確定事項 | 確定方法 |
|---|---|---|
| 1 | ユーザー遭遇の「認識されるが接続できない」実因がL側か | R側USBポートで接続テスト1回（成功すればL側説ほぼ確定） |
| 2 | L側が実際にCDC ACMとして列挙されるか（バイナリ根拠から確度高） | L側を挿してStudioのUSB一覧確認1回 |
| 3 | TCCリムーバブルボリュームプロンプトの実挙動・拒否時エラー・ad-hoc署名更新後の許可持続 | クリーンなmacOSユーザーアカウントで/Volumes/XIAO-SENSE書込テスト |
| 4 | Windows: XIAO-SENSEのドライブ出現/ラベル/書込完了時のエラー様態/Defender干渉 | Win実機で手動UF2コピー1回 |
| 5 | settings_resetなしのFW更新でStudio設定（キーマップ・コンボ等）が保持されるか（ZMK設計上はYes） | 実機で本体FWのみ焼いて設定残存確認 |
| 6 | `&bootloader`キーの実行側（キーの物理位置の側で動くか）と、L側での利用可否 | ZMK behavior locality仕様の一次確認＋実機 |
| 7 | 9600/12500ボーレートがCDC ACMで実害あるか（多くは無視されるが） | R側実機接続テストに包含 |

---

## 結論

- **ブリーフ（①）は採用可**。修正2件（set_exclusiveの位置・行番号）は軽微。不明4点中3点は本検証で確定/ほぼ確定に前進済み
- **実現性評価（②）は骨子維持・前提修正が必須**: 「現バージョン検出」を前提から外し「既出荷FW互換の崖」を設計の第一制約に置く。②④を格上げ、⑤は署名を分離して再スコープ
- **影響度評価（③）は結論維持・根拠差し替え**: コード結合は小さい（確認済み）。ただし挙げられた「唯一の共有リスク」は実在せず、実在する波及（TCC/Info.plist/CSP分岐/接続ライフサイクル/FWリリース運用の新設）に差し替えること
