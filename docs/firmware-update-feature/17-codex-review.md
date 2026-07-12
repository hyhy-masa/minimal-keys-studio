# 17 — 実機異常系3問題 修正計画レビュー

## 総評

**条件付きGO**

7件の修正方針のうち、C-fix-1、C-fix-3、A-fix-2、A-3の文言改名、B-fix-1/B-fix-2は方向として妥当であり、提案どおり `flash_write_uf2` を経由する限り、アドレス窓クランプを弱める変更もない。ただし、実装開始前に次の2点を計画へ反映することを条件とする。

1. C-fix-2の単発scanを安全境界にしない。現案は一時的なscan漏れで確認画面を迂回でき、`CONFIRM_PRESENT` 後の非同期取得と状態遷移も未定義である。少なくとも「検出したボリュームを取得し終える前に `r_flashing` / `l_flashing` へ入らない」契約が必要である。より確実なのは、既存・新規を問わず検出後に側別の最終確認を必須にする方式である。
2. A-fix-1のリトライ順序と最終エラー分類を再定義する。現案の「読めないままなら `NotUf2Volume`」と「`NotUf2Volume` は読めたBoard-ID不一致だけ」は両立せず、`volume_present` も `read_info_uf2` も同じ `INFO_UF2.TXT` に依存するため、最初のpresence判定だけでは一過性未準備と抜線を分離できない。

なお、依頼文にある `crates/mk-flash-core/src/mod.rs` はこのcheckoutには存在しない。対象のブリック防止ゲートは実際には `src-tauri/src/flash/mod.rs:133-160` の `build_limits` と、同 `:181-204` の「検証後に書く」経路にある。今回の計画はこの範囲を変更せず、通常・recovery・既存ボリューム採用の全経路も `flash_write_uf2` を使うため、計画どおり実装されればクランプを迂回しない。

### 7修正の個別判定

| 修正 | 判定 | 実コードとの照合結果 |
|---|---|---|
| C-fix-1 | **妥当** | `volume.rs:80-94` の既存採用を明示opt-inに分離する方針は正しい。全呼出元とテストの署名追随が条件 |
| C-fix-2 | **要修正** | dead-endを閉じる目的は正しいが、単発scan競合と確認後の取得stateが未定義。Critical C-1を解消してから実装する |
| C-fix-3 | **妥当** | `volume.rs:34-38` の新規待ちだけBoard-ID filterがない非対称は実在する。Windows同一path問題は別途解く必要がある |
| A-fix-1 | **要修正** | `machine.rs:257-268` のNone誤分類修正は必須。ただしretry順序と最終variantはMajor M-1のとおり再定義する |
| A-fix-2 | **妥当** | `RecoveryPanel.tsx:175-189` はreset案内のみであり、ケーブル確認を先に加える提案はConnectionLost後の復帰手順と整合する |
| A-3 文言改名 | **妥当** | `ja.ts:20` のrecoveryタイトルと `FirmwareUpdateModal.tsx:413-415` のerrorボタンが同文言なのは事実。実際の変更・test箇所はMinor m-2を反映する |
| B-fix-1 / B-fix-2 | **B-fix-1は妥当、B-fix-2は小修正要** | doneは `machine.ts:59` でmanifestを保持するためmanifest版表示は成立する。show_releaseは表示fallbackと比較値を分離する |

## 重大度別の指摘

### Critical

#### C-1. C-fix-2の単発scanでは「確認なしの書き込み」を構造的に防げない

- **file:line**: `crates/mk-flash-core/src/fsops.rs:172-187`、`crates/mk-flash-core/src/volume.rs:34-41`、`src/firmware-update/useFirmwareUpdate.ts:144-159`、`docs/firmware-update-feature/16-fix-plan-fable5.md:84-92`
- **懸念**: Windowsの `flash_scan_volumes` は、各ドライブの `INFO_UF2.TXT` をその瞬間に `read_to_string` できた場合だけ候補を返す。一方、`wait_for_new_volume` はbaselineにないpathが1個見えた時点で返す。したがって、guide進入時の単発scanで残留bootloaderの `INFO_UF2.TXT` が一時的に読めず候補0となり、その直後のwaitで読めるようになると、「既存」なのに「新規」として自動採用され、C-fix-2の確認画面を通らない可能性がある。これはコードからの**推論**だが、現行の列挙条件と計画の二段階処理から直接成立する競合である。
- **懸念**: 計画のTSテストは `CONFIRM_PRESENT → r_flashing` を期待しているが、現在の `r_flashing` / `l_flashing` effectは直ちに `volumeRef.current` を使って書き込みを始める。確認ボタン押下後に `flash_wait_for_bootloader(adoptPresent:true)` が完了し、`volumeRef` に格納される前にflashingへ遷移すると、空または古いpathで `flash_write_uf2` を呼ぶ。計画本文の「wait成功後に `BOOTLOADER_R/L`」と、テスト記述の「`CONFIRM_PRESENT` でflashing」は実行契約が一致していない。
- **推奨**: 最も強い設計は、新規・既存を問わずBoard-ID一致ボリュームを取得した後に「右/左側を検出しました。この側を書き込みます」の最終確認を必須にし、確認後だけ `r_flashing` / `l_flashing` へ遷移させること。これなら単発scan、ドライブレター、既存/新規判定に安全性を依存しない。既存だけを確認するUXを維持するなら、少なくとも `*_bootloader_adopting` のような取得中状態を追加し、`CONFIRM_PRESENT` はその状態へ遷移、effectで `adoptPresent:true` の取得成功後にだけ `BOOTLOADER_R/L` をdispatchすること。scan漏れを防ぐ安定化規則とテストも必要である。

### Major

#### M-1. A-fix-1のpresence判定、リトライ、最終分類が自己矛盾している

- **file:line**: `crates/mk-flash-core/src/machine.rs:253-270`、`crates/mk-flash-core/src/fsops.rs:78-86`、`docs/firmware-update-feature/16-fix-plan-fable5.md:36-44`
- **懸念**: 現行の `preflight_board_id` が `read_info_uf2=None` を直ちに `NotUf2Volume` にするという診断は正しい。しかし計画は、(a) `volume_present=false` なら即 `ConnectionLost`、(b) present=trueなら3回リトライ後 `NotUf2Volume`、(c) `NotUf2Volume` はBoard-IDを読めた不一致だけ、と同時に規定しており、(b)と(c)が矛盾する。またRealEnvの `volume_present` はmount rootではなく `INFO_UF2.TXT.exists()`、`read_info_uf2` も同じファイルのreadである。FSKit/OSの一過性未準備では両方がfalse/Noneになり得るため、最初に `volume_present=false` を見て即 `ConnectionLost` にすると、計画が意図する有限リトライに入れない。
- **推奨**: `None` はpresence値にかかわらず短い有限リトライへ入れ、各試行でreadとpresenceを観測する。途中で読めたらBoard-IDを判定し、リトライ終了時に消失が確定した場合は `ConnectionLost`、読めないが存在する場合は `NotUf2Volume` 以外の `Io` / `PermissionDenied` 相当へ分類する。少なくとも `NotUf2Volume` は「Board-IDを読めたがprefix不一致（またはBoard-ID欠落）」に限定する。retry途中の抜線も最終 `NotUf2Volume` へ落とさない。

#### M-2. C-fix-2の複数台・Board-ID・キャンセル・同一path再列挙の契約が不足している

- **file:line**: `crates/mk-flash-core/src/machine.rs:69-75`、`crates/mk-flash-core/src/volume.rs:22-54,72-94`、`src-tauri/src/flash/mod.rs:88-117`、`src/firmware-update/useFirmwareUpdate.ts:120-159,188-211`
- **懸念**: `flash_scan_volumes` は全UF2候補の `Vec<VolumeEntry>` を返すだけで、複数台エラーやminimal-keys用filterを実行しない。canonicalなprefixはRustの `MINIMAL_KEYS_BOARD_ID_PREFIX` にしかなく、TS側に文字列を複製すると、現行コメントが意図する単一ソース契約を壊す。計画は「一致2個以上なら既存 `MultipleBootloaderVolumes` 文言」とするが、誰が件数を分類し、scan失敗・foreign only・確認中のdetach・確認後の再取得失敗をどのevent/stateへ送るかを規定していない。
- **懸念**: baselineはpath文字列だけである。たとえばWindowsでbaselineに `E:\` が入り、そのドライブが一度消えて同じ `E:\` に対象ボードが再列挙されても、現行filterは同じpathとして除外し続ける。C-fix-3でBoard-ID filterを足しても、pathによるbaseline除外自体は解消しない。計画のC-fix-2は「guide進入時から残留ボリュームが読める」ケースを閉じるが、baseline取得後の同一path再利用一般までは閉じない。
- **推奨**: Board-ID一致候補の分類はRust側に置き、TSへprefixを複製しない。新状態ごとに、0/1/2+候補、scan error、confirm、cancel、detach、late promiseの遷移を定義する。同一path再列挙は、baseline pathが一度消えたことを観測したら再出現をnewとして扱うedge-based方式、またはCritical C-1の「検出後は常に最終確認」方式でpath identityへの依存をなくす。

#### M-3. テストコマンドがこのリポジトリ構成では成立せず、安全ゲートのテストも実行対象から漏れる

- **file:line**: `docs/firmware-update-feature/16-fix-plan-fable5.md:184-202`、`src-tauri/src/flash/mod.rs:243-309`、`.github/workflows/release.yml:15-28,30-64`
- **懸念**: repository rootにCargo workspaceの `Cargo.toml` はなく、core、CLI、Tauriは別manifestである。このため§6のroot実行を想定した `cargo test -p mk-flash-core` は失敗する。さらに、ブリック防止の `build_limits` / `widen_clamp_blocks_bootloader_region_write` はcoreではなくTauri crate内にあり、core testだけでは実行されない。release workflowのtest jobもnpm lint/test/buildだけで、Tauri buildはコンパイルするがRust unit testは実行しない。
- **推奨**: 少なくとも次を明示する。
  - `cargo test --manifest-path crates/mk-flash-core/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path crates/mk-flash-cli/Cargo.toml`（またはCLIの `cargo check`）
  - `npm test`、`npm run build`、`npm run lint`
  - CIにもcore/Tauri/CLIのRust testを追加し、クランプテストをrelease前の必須ゲートにする。

#### M-4. 新しいfrontend stateの波及先と、確認後の非同期処理が計画に揃っていない

- **file:line**: `src/firmware-update/machine.ts:46-98,113-145,181-239`、`src/firmware-update/ja.ts:4-24`、`src/firmware-update/FirmwareUpdateModal.tsx:174-200,204-435`、`src/firmware-update/FirmwareUpdateModal.stories.tsx:189-200,199-415`
- **懸念**: state追加はunion/reducerだけでは完結しない。`stepTitle` は全stepの `Record`、modalとstoryはstepのswitch、modal/storyの `canClose` も明示列挙である。新しい確認/取得中状態を `redrivableOrigin` に含めるか、Escape/X/中止を許すか、recoveryへ入ったとき何を保持するかも決める必要がある。計画はmachine、hook、modal、storiesには触れるが、この網羅契約を明文化していない。
- **推奨**: stateごとに「表示」「許可event」「effect」「close/cancel可否」「recovery origin」「late async無視」を表にしてから実装する。特に確認状態から直接flashingへ進めず、取得完了eventを分ける。R/L両側で同一の遷移テストを置く。

#### M-5. Windows同一ドライブレター再利用を明示的に再現するテストがない

- **file:line**: `crates/mk-flash-core/src/volume.rs:24-52`、`docs/firmware-update-feature/16-fix-plan-fable5.md:186-213`
- **懸念**: 計画はWindowsのドライブレター再利用をC-fix-2必須化の根拠にしているが、§6には `baseline=["E:\\"] → 一度非表示 → Board-ID一致の "E:\\" が再出現` を再現するunit testがない。E3も「開始時から残留」だけで、baseline取得後の同一path再列挙を確認しない。
- **推奨**: 上記snapshot列をRust unit testへ追加し、期待仕様を固定する。Windows E2Eにも、Explorerで同じドライブレターが再利用されたことを記録するケースを追加する。foreign UF2が先に同じletterを使うケースも含める。

### Minor

#### m-1. B-fix-2は表示文言と判定値を分離しないと文字列sentinelが壊れる

- **file:line**: `src/firmware-update/FirmwareUpdateModal.tsx:202,229-251`、`src/firmware-update/versions.ts:8-15`
- **懸念**: 現行は表示用 `currentVersion = fw.version ?? "不明"` と、`currentVersion === "不明"` という判定が結合している。文言だけを「確認できません（更新には支障ありません）」へ変え、計画どおり判定行を触らないと、非semverの表示文言を比較関数へ渡す。
- **推奨**: 判定には `fw.version` を直接使い、表示だけ別変数でfallbackする。`fw.version=null` の表示と更新可否をテストする。

#### m-2. A-3の改名箇所とテスト先が不正確である

- **file:line**: `src/firmware-update/ja.ts:4-24`、`src/firmware-update/FirmwareUpdateModal.tsx:404-415`、`src/firmware-update/FirmwareUpdateModal.stories.tsx:387-397`、`docs/firmware-update-feature/16-fix-plan-fable5.md:200-202`
- **懸念**: recovery画面のタイトルは `ja.ts` だが、error画面の「うまくいかないとき」ボタンはmodalにhard-codeされ、storyにも複製されている。計画は `ja.test.ts` の追随を挙げるが、ボタン文字列をmodalのまま変更するなら `ja.test.ts` では検証できない。また依頼の「A-3（曖昧ラベル改名）」と計画内の「A-fix-3（失敗側side事前選択）」は別項目である。
- **推奨**: errorボタンを「対処方法を見る」等へ変更し、storyも更新する。自動検証するならUI component testを追加するか、copyを `ja.ts` の定数へ集約してtestする。名称の混同を避けるため、計画内でも「A-3文言修正」と「A-fix-3 side hint」を分ける。

#### m-3. B-fix-1は正しいがstoryだけでは回帰テストにならない

- **file:line**: `src/firmware-update/machine.ts:58-59`、`src/firmware-update/FirmwareUpdateModal.tsx:379-391`、`src/firmware-update/FirmwareUpdateModal.stories.tsx:362-375`
- **懸念**: done stateがmanifestを保持し、`state.manifest.version` を表示できることは確認できるため、B-fix-1は技術的に妥当である。ただしstory追加だけでは「`fw.version=null` でもmanifest.versionがDOMに出る」を自動assertしない。
- **推奨**: done×未接続のcomponent testを追加し、ライブversionがnullでもmanifest versionが表示されることをassertする。表示が「現在接続中の版」ではなく「今回書き込んだmanifest版」であることが分かる文言にする。

## 波及範囲の検証結果

### `acquire_bootloader(adopt_present)` の実呼出元

| 箇所 | 現状の役割 | 計画のカバー状況 | 判定 |
|---|---|---|---|
| `crates/mk-flash-core/src/volume.rs:64-95` | 関数定義と `wait_for_new_volume` 接続 | C-fix-1で明示 | **カバー済み**。boolがfalseのときpresent分岐全体を通らないことを固定する |
| `src-tauri/src/flash/mod.rs:96-117`（core callは`:106`） | Tauri commandからcoreへ伝播 | C-fix-1で明示 | **カバー済み**。Rustの `adopt_present` とTSの `adoptPresent` のinterface test/compile確認が必要 |
| `crates/mk-flash-cli/src/main.rs:125` | `write` command | C-fix-1で `true` と明示 | **カバー済み**。明示opt-inとして現挙動維持。ただしpromptはdouble-tapを要求するため、将来はCLI flag化を検討可能 |
| `crates/mk-flash-cli/src/main.rs:189` | `flow` / `guided_flash` | C-fix-1で `true` と明示 | **カバー済み**。上記と同じ |
| `crates/mk-flash-core/src/volume.rs:224` | already-present採用test | §3/§6でtrue版維持を明示 | **カバー済み** |
| `crates/mk-flash-core/src/volume.rs:251` | foreignを無視して待つtest | 個別記載なし | **漏れ**。新しいbool引数を追加し、どのモードを検証するか明記する |

### Tauri commandのfrontend呼出元

| 箇所 | 計画の指定 | 判定 |
|---|---|---|
| `src/firmware-update/useFirmwareUpdate.ts:148-151` | `adoptPresent:false` | **カバー済み**。C-fix-2のscan/confirm経路と二重scan raceを解消すること |
| `src/firmware-update/useRecoveryActions.ts:64-67` | `adoptPresent:true` | **カバー済み**。現行 `baseline:[]` を維持するため、残留bootloaderのdead-endは作らない |
| `src-tauri/src/main.rs:35` | command登録 | 計画に明示なし | **変更不要・確認済み**。command名は変わらず、引数追加だけなので登録変更は不要 |

### 関連する非呼出箇所

- `crates/mk-flash-core/src/lib.rs:31` はre-exportであり呼出元ではない。署名変更に伴う編集は通常不要。
- C-fix-3で `wait_for_new_volume` にprefix引数を追加するなら、内部呼出 `crates/mk-flash-core/src/volume.rs:94` に加え、同ファイルの直接test呼出 `:151`、`:170`、`:191`、`:207` を全て更新する必要がある。計画はテスト内容には触れるが、これら全呼出の署名追随を列挙していない。
- repository内のproduction callは上表で全てであり、他の `acquire_bootloader` / `flash_wait_for_bootloader` 呼出は検出しなかった（docsとbuild artifactを除外）。

## テスト方針への指摘

### Rust coreに追加すべきケース

1. A-fix-1:
   - `None → 一過性None → Some(Board-ID一致)` は成功する。
   - retry途中でvolumeが消失したら `ConnectionLost`。
   - 終始unreadableだがpresence観測ありの場合の最終variant。
   - `Some` だがBoard-ID欠落、およびprefix不一致は `NotUf2Volume`。
   - retry回数・sleep回数・総待ち時間が有限。
2. C-fix-1/C-fix-3:
   - `adopt=false/true × matching/foreign/multiple` の表を埋める。
   - foreignが先に出現しても待機継続し、その後matchingを取得する。
   - matching 2個は `MultipleBootloaderVolumes`。
   - Windows同一path: `baseline=["E:\\"] → [] → matching "E:\\"`。
   - scan時unreadable、直後readableとなる残留volumeが確認を迂回しない。

### Tauri/Rust境界に追加すべきケース

- `adopt_present` がcommandからcoreへそのまま伝播すること。
- 通常、recovery、既存ボリューム確認の3経路が全て `flash_write_uf2` に到達し、`build_limits → validate_uf2 → flash_uf2` の順を変えないこと。
- `src-tauri/src/flash/mod.rs:243-309` のempty SHA、壊れたwindow、widen clamp、bootloader領域拒否テストを必須で維持する。今回の修正でこの範囲に差分がないこともレビュー条件にする。
- core/Tauri/CLIは別manifestの正しいコマンドで実行する。release CIにもRust unit testを追加する。

### TypeScript/UIに追加すべきケース

- R/Lそれぞれについて、scan 0/1/2+、foreign only、scan error、confirm、取得成功、取得失敗、cancel、late promiseを検証する。
- `CONFIRM_PRESENT` だけではflashingへ入らず、volume取得成功後にのみ入ること。
- 新状態の `stepTitle`、modal/story switch、`canClose`、Escape、中止ボタン、`ENTER_RECOVERY` / `RETRY_CURRENT_STEP` を検証する。
- `ConnectionLost` がfallbackではない案内へ変換され、A-3のerrorボタンとrecoveryタイトルが異なること。
- done画面は `fw.version=null` でも `manifest.version` を表示すること。show_releaseは表示fallbackとversion判定を分離すること。
- storyは視覚確認用として残し、重要文言と遷移はVitest/Testing Libraryでassertする。

### Windows実機E2Eに追加すべきケース

- E3をRだけでなくL残留でも実施し、対象側の文言・画像・書込assetが一致することを確認する。
- baseline取得後に抜き差しし、同じドライブレターへ再マウントするケースを独立追加する。実際のletterをログへ記録する。
- 確認画面表示後に抜線してから「このまま進める」、確認待ち中に2台接続、foreign UF2併用を追加する。
- A-fix-1はpreflight 0%帯の抜線に加え、一過性のINFO_UF2未準備でも誤って `ConnectionLost` / `NotUf2Volume` にしないことを確認する。
- アドレス窓の破壊的な実機試験は不要であり、clampのRust unit testを出荷ゲートとする。

## 代替案

### C-fix-2: 「既存だけ確認」ではなく「検出後は常に最終確認」

本レビューではこちらを推奨する。`acquire_bootloader` はボリュームを検出・取得するだけにし、既存採用か新規検出かにかかわらず、書き込み直前に「右（R）/左（L）へ書き込みます」の確認を1回要求する。1クリック増える代わりに、単発scan漏れ、Windowsの同一ドライブレター、既存/新規の誤分類が「無確認書き込み」へ直結しない。R/LをBoard-IDで区別できない現行ハードウェアでは、側をユーザーに最終確認させることにも意味がある。

### C-fix-1: boolより意図型を使う案

Rust内部では裸のboolより `AdoptPresent::Allow` / `AdoptPresent::Forbid` のenumの方がCLI/Tauri call siteで意図を読み違えにくい。ただしTauri境界はnamed booleanでも十分であり、これは必須条件ではない。

上記以外は、各修正方針を置き換えるほど明確に優れた代替案はない。A-fix-1は方式変更より、リトライと分類契約の矛盾解消が先である。
