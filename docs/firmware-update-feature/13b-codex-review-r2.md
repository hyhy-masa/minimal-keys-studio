# R2: TSウィザード/UI（Codex GPT-5.6）

対象: `feature/fw-update-integration` / `5d48146`。R2のTS/UI範囲だけを静的レビューした。ビルド・テストは実行していない。

## 結論

| severity | 件数 |
|---|---:|
| Critical | 0 |
| Major | 3 |
| Minor | 3 |
| Deferred | 4 |

GO-R前に優先して扱うべきものは、(1) Escapeで書込み画面を閉じた後も書込みが進む経路、(2) `ManifestInvalid` / `Io` の誤った再試行案内、(3) Studio接続を保持したまま更新を始めた際の二重モーダルである。

## Findings

### R2-M1: 書込み中でもEscapeでモーダルを閉じられ、非表示のまま書込みが続く

- file:line: `src/firmware-update/FirmwareUpdateModal.tsx:158-182`, `src/firmware-update/FirmwareUpdateModal.tsx:289-302`, `src/firmware-update/FirmwareUpdateModal.tsx:419-430`, `src/misc/useModalRef.ts:15-21`, `src/GenericModal.tsx:9-14`, `src/firmware-update/useFirmwareUpdate.ts:144-158`, `src/firmware-update/useFirmwareUpdate.ts:188-211`
- failure scenario: 待機画面から `r_flashing` / `l_flashing` へ遷移 → `allowCancel` はfalseへ変わるが、dialogは既にopenなので `useModalRef` はcancel listenerを追加しない → ユーザーがEscapeを押すとnative dialogが閉じ、`GenericModal` の `onClose` は親の表示フラグだけを落として `cancel()` を呼ばない → `flash_write_uf2` は非表示のまま継続する。待機中もcancelが許可され、同様にwait処理が表示なしで続き得る。
- severity: **Major**。更新失敗・表示消失・ユーザーが認識しない書込み開始につながる。
- 書込み中はXが非表示で中止ボタンもdisabledになるが（`src/firmware-update/FirmwareUpdateModal.tsx:307-320`, `src/firmware-update/FirmwareUpdateModal.tsx:423-430`）、これはアプリ終了（Cmd-Q、OSのウィンドウ終了）を阻止しない。TS/UI範囲にはアプリ終了イベントのガードがなく、実際の終了時挙動は実機確認が必要である。

### R2-M2: `ManifestInvalid` と `Io` が `formatError` のdefaultへ落ち、再試行では解決しないケースにも「もう一度」を案内する

- file:line: `crates/mk-flash-core/src/error.rs:10-64`, `crates/mk-flash-core/src/manifest.rs:84-105`, `src/firmware-update/ja.ts:38-64`, `src/firmware-update/useFirmwareUpdate.ts:82-96`
- failure scenario: schema不一致・必須asset欠落などで `ManifestInvalid`、またはキャッシュ/ファイルI/Oで `Io` を受信 → `kind` は取得できるが対応caseがない → 「予期しないエラーが発生しました。もう一度お試しください。」になる。永続的なmanifest不整合では同じ操作を繰り返しても解決せず、正しい次の行動が示されない。
- severity: **Major**。クラッシュはしないが、更新不能時の案内が不正確である。

### R2-M3: 既存GATT/serial接続を切断せず更新でき、切断時に接続モーダルと更新モーダルが競合する

- file:line: `src/AppHeader.tsx:47-63`, `src/AppHeader.tsx:106-110`, `src/AppHeader.tsx:206-214`, `src/App.tsx:176-187`, `src/App.tsx:398-402`, `src/firmware-update/FirmwareUpdateModal.tsx:268-302`
- failure scenario: Studioが同じキーボードへGATT/serial接続中 → 接続状態に関係なく有効な「ファーム更新」を押す → 明示的な切断や切断確認なしで、ウィザードがリセット2回を要求する → RPC transportが切断して `conn=null` になるとStudio本体の `ConnectModal` が開く一方、`FirmwareUpdateModal` の表示状態は接続喪失で閉じない → 2つのモーダルが同時に開き、更新案内が隠れる/操作焦点が競合する。
- severity: **Major**。Studio統合で新たに生じた更新フロー妨害である。OSレベルでGATT/serialハンドルとUF2ボリュームが直接競合するかはTSコードだけでは確定できないが、少なくとも接続解放の配線と切断誘導はない。

### R2-D4: 未保存のStudio編集を確認せず、キーボードの再起動を伴う更新へ進める

- file:line: `src/AppHeader.tsx:66-72`, `src/AppHeader.tsx:186-214`, `src/firmware-update/FirmwareUpdateModal.tsx:268-302`
- failure scenario: キーマップ等に未保存変更があり `unsaved=true` → ユーザーが保存せず「ファーム更新」を開始 → 更新ボタンは `unsaved` を参照せず、確認画面も未保存変更に触れない → bootloader案内どおりリセットして接続を切る。確認欠落は静的に確定するが、未保存状態が再起動後に失われるかはdevice/backend semanticsまたは実機証拠がなく、本レビューではUNKNOWNである。
- severity: **Deferred**。データ消失は断定せず、更新開始前に保存・破棄・中止を求めるべき統合リスクとして実機確認へ残す。

### R2-m1: fwinfoのゴミ/部分応答はクラッシュしないが、期待するfallback文言にならない

- file:line: `src/firmware-update/useFirmwareVersion.ts:31-65`, `src/firmware-update/proto/fwinfo.ts:66-109`, `src/firmware-update/proto/fwinfo.ts:138-144`, `src/firmware-update/FirmwareUpdateModal.tsx:211-247`
- failure scenario: subsystemは見つかるが応答が壊れてdecode例外、firmware側error、またはversionなしの部分応答 → hookは `version=null` にする一方、`supported` はsubsystemの有無のままtrue → リリース画面は「最新版を書き込めます」ではなく「新しいバージョンがあります」と断定する。decode例外自体はcatchされるためクラッシュしない。
- severity: **Minor**。書込み導線は残るが、バージョン不明時の表示が不正確である。

### R2-m2: AppHeader統合のテストが追加UIを一切検証していない

- file:line: `src/AppHeader.test.tsx:21-26`, `src/AppHeader.test.tsx:30-44`, `src/AppHeader.tsx:106-110`, `src/AppHeader.tsx:206-214`
- failure scenario: feature flag判定、ボタン表示、クリックによるmodal open、接続中/切断時の相互作用が回帰 → テストは `FirmwareUpdateModal` を常にnullへmockし、既存のヘルプボタン2ケースだけを確認するため検出できない。
- severity: **Minor**。現時点で既存ヘッダー機能を壊す直接の差分は見つからないが、統合部分の回帰検出がない。

### R2-m3: ファーム更新dialogにアクセシブルネームがない

- file:line: `src/GenericModal.tsx:9-14`, `src/firmware-update/FirmwareUpdateModal.tsx:419-430`
- failure scenario: スクリーンリーダー利用者がファーム更新modalを開く → `<dialog>` に `aria-label` / `aria-labelledby` がなく、画面見出しにも関連付け用idがない → dialogへフォーカスが移っても何のdialogか名前で識別できない。
- severity: **Minor**。操作不能とは限らないが、更新という高リスク操作の文脈が支援技術へ明示されない。

### R2-D1: recovery片側書き直しはBoard-IDだけではR/L取り違えを識別できない

- file:line: `src/firmware-update/RecoveryPanel.tsx:118-138`, `src/firmware-update/RecoveryPanel.tsx:175-187`, `src/firmware-update/useRecoveryActions.ts:19-20`, `src/firmware-update/useRecoveryActions.ts:60-80`
- failure scenario: ユーザーがUIでRを選ぶ一方、実際にはLをbootloaderにする（または既にLだけがmount済み）→ `baseline: []` は単一のminimal-keys volumeを採用できるがside情報を持たない → UI選択だけで決まるR用filename/assetをLへ書き得る。案内は選択sideのリセットを求めるため通常操作では回避できるが、Board-ID安全ゲート自体は左右を区別しない。
- severity: **Deferred**。既知のハードウェア識別限界であり、現行UI案内で軽減されるがコードでは完全防止できない。実機の故意失敗試験に残す。

### R2-D2: `semverGe` は完全なsemverではなく、pre-releaseや`v`付きminimumを安全側に扱わない

- file:line: `src/firmware-update/machine.ts:21-39`, `src/firmware-update/machine.ts:150-155`, `src/firmware-update/machine.test.ts:190-196`
- failure scenario: `have="1.2.3-beta"`, `need="1.2.3"` → betaを同等として許可する。または `need="v1.0.0"` → minimum側の数値配列が空になり、古いtoolでも許可され得る。テストもbetaをrelease以上として固定している。
- severity: **Deferred**。manifest契約が「先頭vなし・数値dotのみ」を保証するなら仕様内だが、その契約はTS型では表現されていない。

### R2-D3: Web版は通常UI非露出だが、featureコード/写真までbundleから除外する保証はない

- file:line: `vite.config.ts:23-33`, `src/firmware-update/isTauri.ts:1-20`, `src/AppHeader.tsx:19-20`, `src/AppHeader.tsx:106-110`, `src/AppHeader.tsx:206-214`
- failure scenario: production Web build → feature flag自体は既定で`"1"`、`FirmwareUpdateModal` は静的import → 通常ブラウザでは `__TAURI_INTERNALS__` がなくUIは非表示だが、コードをWeb artifactから消すcompile-time gateにはならない。`window.__TAURI_INTERNALS__` が注入/偽装された場合はボタンが露出し、Tauri invokeは失敗する。
- severity: **Deferred**。「ユーザーにボタンを見せない」という意味ではPASS。「Web bundleに一切含めない」という厳密なゼロ露出はFAIL。

## 1. machine.ts 全状態遷移

共通遷移は次の2つで、各state固有switchより先に評価される。

- 全state + `RESET` → `idle`（`src/firmware-update/machine.ts:141-143`）。
- 全state + `ENTER_RECOVERY` → `recovery`。`recovery`自身は不変、`recovery_waiting` / `recovery_flashing` は`from`保持、`recovery_done`は`from:null`、その他は再実行可能originだけを保持する（`src/firmware-update/machine.ts:111-138`, `src/firmware-update/machine.ts:141-144`）。

固有遷移は以下のとおり。表にないeventは同じstateを返す（`src/firmware-update/machine.ts:145-234`）。

| from | event / condition | to | evidence |
|---|---|---|---|
| `idle` | `START` | `fetching_manifest` | `machine.ts:146-148` |
| `fetching_manifest` | `FETCH_OK` + tool不足 | `blocked(tool_too_old)` | `machine.ts:150-155` |
| `fetching_manifest` | `FETCH_OK` + tool条件OK | `show_release` | `machine.ts:151-157` |
| `fetching_manifest` | `FETCH_ERR` | `error` | `machine.ts:158-159` |
| `show_release` | `PROCEED` + settings reset必須 | `blocked(settings_reset_unsupported)` | `machine.ts:161-166` |
| `show_release` | `PROCEED` + reset不要 | `downloading` | `machine.ts:161-167` |
| `downloading` | `DOWNLOAD_OK` | `r_confirm` | `machine.ts:170-173` |
| `downloading` | `DOWNLOAD_ERR` | `error` | `machine.ts:170-173` |
| `r_confirm` | `CONFIRM_R` | `r_bootloader_guide` | `machine.ts:175-177` |
| `r_bootloader_guide` | `BOOTLOADER_R` | `r_flashing` | `machine.ts:179-181` |
| `r_flashing` | `FLASH_R_OK` | `swap_to_l` | `machine.ts:183-186` |
| `r_flashing` | `FLASH_R_ERR` | `error` | `machine.ts:183-186` |
| `swap_to_l` | `SWAP_DONE` | `l_confirm` | `machine.ts:188-190` |
| `l_confirm` | `CONFIRM_L` | `l_bootloader_guide` | `machine.ts:192-194` |
| `l_bootloader_guide` | `BOOTLOADER_L` | `l_flashing` | `machine.ts:196-198` |
| `l_flashing` | `FLASH_L_OK` | `verify_checklist` | `machine.ts:200-203` |
| `l_flashing` | `FLASH_L_ERR` | `error` | `machine.ts:200-203` |
| `verify_checklist` | `CHECKLIST_OK` | `done` | `machine.ts:205-208` |
| `verify_checklist` | `CHECKLIST_FAIL` | `recovery(from=verify_checklist)` | `machine.ts:205-208` |
| `recovery` | `RECOVERY_FLASH_SIDE(side)` | `recovery_waiting` | `machine.ts:210-214` |
| `recovery` | `RETRY_CURRENT_STEP` + `from`あり | 保存したorigin | `machine.ts:210-214` |
| `recovery` | `RETRY_CURRENT_STEP` + `from=null` | `recovery` | `machine.ts:210-214` |
| `recovery_waiting` | `RECOVERY_VOLUME_OK` | `recovery_flashing` | `machine.ts:216-221` |
| `recovery_waiting` | `RECOVERY_FLASH_ERR` | `recovery` | `machine.ts:216-221` |
| `recovery_flashing` | `RECOVERY_FLASH_OK` | `recovery_done` | `machine.ts:223-227` |
| `recovery_flashing` | `RECOVERY_FLASH_ERR` | `recovery` | `machine.ts:223-227` |
| `done` / `blocked` / `error` / `recovery_done` | 固有eventなし | 同state | `machine.ts:229-233` |

**行き止まり判定: 該当なし＝安全。** terminalを含む全stateが共通`RESET`で`idle`へ、共通`ENTER_RECOVERY`でrecoveryへ出られる（`src/firmware-update/machine.ts:141-144`）。UI上もerrorは「最初に戻る」「うまくいかないとき」を持ち（`src/firmware-update/FirmwareUpdateModal.tsx:386-399`）、recoveryは常にRESETを持つ（`src/firmware-update/RecoveryPanel.tsx:164-171`）。ただし、modal dismissの非同期継続はR2-M1の別問題である。

## 2. FlashError variant 対応表

source enumは13 variant（`crates/mk-flash-core/src/error.rs:10-64`）。

| FlashError | formatError | 判定 / evidence |
|---|---|---|
| `NoBootloaderVolume` | 専用 | PASS — `ja.ts:42-43` |
| `MultipleBootloaderVolumes` | 専用 | PASS — `ja.ts:44-45` |
| `NotUf2Volume` | 専用 | PASS — `ja.ts:46-47` |
| `InvalidUf2` | `ChecksumMismatch`と共通 | PASS — `ja.ts:48-50` |
| `WriteFailed` | 書込み未完了群 | PASS — `ja.ts:51-54` |
| `PrematureReboot` | 書込み未完了群 | PASS — `ja.ts:51-54` |
| `UnmountTimeout` | 書込み未完了群 | PASS — `ja.ts:51-54` |
| `DownloadFailed` | 専用 | PASS — `ja.ts:57-58` |
| `ChecksumMismatch` | `InvalidUf2`と共通 | PASS — `ja.ts:48-50` |
| `ManifestInvalid` | default unknown | **FAIL** — `ja.ts:61-63` |
| `Cancelled` | 専用 | PASS — `ja.ts:59-60` |
| `PermissionDenied` | 専用 | PASS — `ja.ts:55-56` |
| `Io` | default unknown | **FAIL** — `ja.ts:61-63` |

疑義どおり `ManifestInvalid` と `Io` は欠落している。未知shapeでも文字列化事故やクラッシュにはならない点は安全（`src/firmware-update/ja.ts:38-40`, `src/firmware-update/ja.ts:61-63`）。

## 3. recovery 3経路と安全ゲート

| 経路 | 判定 | evidence |
|---|---|---|
| ① 現在手順を再試行 | **PASS**。`RETRY_CURRENT_STEP`は保存originへ戻るだけで、以後は通常flowのeffectを再利用する。書込みを直接行わないoriginでは書込み安全ゲートは**該当なし＝安全**。 | `machine.ts:111-123`, `machine.ts:210-214`, `useRecoveryActions.ts:41-43`, `useFirmwareUpdate.ts:188-203` |
| ② 片側を書き直す | **TS配線PASS**。assetを取得し、bootloader volumeを再取得してから、通常flowと同じ `flash_write_uf2` にvolume / side別filename / UF2 path / SHA / address min-maxを渡す。 | `useRecoveryActions.ts:45-85`, 通常flow `useFirmwareUpdate.ts:161-185` |
| ③ support log保存 | firmwareを書かずJSON保存だけなので、UF2/SHA/address/Board-IDゲートは**該当なし＝安全**。保存例外はpanel内でcatchされ、失敗表示とRESET導線が残る。 | `supportLog.ts:81-97`, `RecoveryPanel.tsx:86-94`, `RecoveryPanel.tsx:141-171` |

`baseline: []` はTSから明示的に渡される（`src/firmware-update/useRecoveryActions.ts:60-67`）。TSは返されたvolumeをそのままnative writeへ渡すため（`src/firmware-update/useRecoveryActions.ts:68-80`）、他USBメモリをBoard-IDで拒否できるかという実ゲートの証明はR1所有である。R2ではnative commandを迂回する書込み経路は見つからず、他機種への誤書込みについては**該当なし＝安全**。ただし同一Board-IDのR/L取り違えはR2-D1の制約として残る。

## 4. fwinfo後方互換

- 旧FW/subsystem非対応: discovery結果に対象IDがなければhookは `supported=false`, `version=null` となり（`src/rpc/useCustomSubsystem.tsx:14-17`, `src/firmware-update/useFirmwareVersion.ts:31-44`）、「最新版を書き込めます」へ落ちる（`src/firmware-update/FirmwareUpdateModal.tsx:223-226`）。**該当なし＝安全**。
- 空応答: decoderは空配列を返し、central versionはnullになる（`src/firmware-update/proto/fwinfo.ts:83-109`, `src/firmware-update/proto/fwinfo.ts:138-144`）。クラッシュなし。
- ゴミ/切れたprotobuf: decoder例外はhookでcatchされ、version/infosはclearされる（`src/firmware-update/useFirmwareVersion.ts:47-64`）。クラッシュなし。
- firmware error / versionなし部分応答: versionはnullになるが `supported=true` のためfallback文言が誤る。R2-m1のとおり**FAIL（Minor）**（`src/firmware-update/FirmwareUpdateModal.tsx:211-226`）。

## 5. Web版の二重ゲート

通常のWeb実行では `isTauri()` がfalseとなり、modalとbuttonの両方がrenderされない（`src/firmware-update/isTauri.ts:1-20`, `src/AppHeader.tsx:106-110`, `src/AppHeader.tsx:206-214`）。したがって**通常ユーザーへのUI露出は該当なし＝安全**。

ただしproduction modeではflagがWeb/Tauri共通で既定`"1"`になり（`vite.config.ts:31-33`）、modalは静的importされる（`src/AppHeader.tsx:19-20`）。bundleからの完全排除までを「ゼロ露出」と定義するなら保証しない（R2-D3）。

## 6. Studio接続中flashの資源競合と表示

接続中でも更新ボタンは無条件に有効で、`onDisconnect` は接続メニューにしか使われない（`src/AppHeader.tsx:123-135`, `src/AppHeader.tsx:206-214`）。更新開始時にtransportを解放する処理はない。リセットで接続streamが閉じるとStudioは`conn=null`へ更新し（`src/App.tsx:176-187`）、接続モーダルを開く（`src/App.tsx:398-402`）一方、更新モーダルは接続状態を監視しない（`src/AppHeader.tsx:47-63`, `src/AppHeader.tsx:106-110`）。したがってUI上はR2-M3の二重モーダルが発生し得る。GATT/serialとUF2 mass-storageのOS資源競合そのものはTSだけでは確定不能で、実機項目として残す。

## 7. docs/12 §4-2 チェックリスト

| checklist item | pass/fail | evidence |
|---|---|---|
| machine.ts全遷移・行き止まり | **PASS — 該当なし＝安全**。全遷移は本書§1。 | `machine.ts:111-144`, `machine.ts:145-234` |
| min_tool_version / settings_reset / schema順序・文言 | **PARTIAL FAIL**。schema≠2はmanifest取得時にnative parserが先に`ManifestInvalid`として拒否する。schema通過後、tool不足はFETCH_OK時、settings resetはrelease表示後のPROCEED時にblockされ、各文言もある。semver-liteの境界はR2-D2、`ManifestInvalid`の表示欠落はR2-M2。 | `crates/mk-flash-core/src/manifest.rs:84-106`, `src-tauri/src/flash/mod.rs:68-72`, `machine.ts:150-167`, `ja.ts:26-31`, `machine.ts:21-39` |
| モーダルclose / アプリ終了 | **FAIL（Major）**。書込みボタン/Xは抑止するが、open済みdialogへcancel listenerが追加されず書込み中もEscapeで閉じられる。アプリ終了ガードもない。 | `FirmwareUpdateModal.tsx:158-182`, `FirmwareUpdateModal.tsx:307-320`, `useModalRef.ts:15-21`, `GenericModal.tsx:9-14` |
| FlashError全variant | **FAIL（Major）**。13中11対応、`ManifestInvalid` / `Io` 欠落。 | `error.rs:10-64`, `ja.ts:41-63` |
| recovery `baseline: []` | **TS配線PASS**。native command迂回なし。Board-ID実装自体はR1確認事項。 | `useRecoveryActions.ts:60-80` |
| supportLog保存失敗 | **PASS — 該当なし＝安全**。例外をcatchし、失敗表示後もrecovery/RESETに留まる。 | `RecoveryPanel.tsx:86-94`, `RecoveryPanel.tsx:141-171` |
| fwinfo後方互換 | **PARTIAL FAIL（Minor）**。旧FW・例外でクラッシュしないが、subsystemあり/version不明時の文言がfallbackにならない。 | `useFirmwareVersion.ts:39-64`, `FirmwareUpdateModal.tsx:211-226` |
| isTauri × feature flag | **PASS（通常UI）— 該当なし＝安全**。厳密なbundle排除はR2-D3。 | `isTauri.ts:1-20`, `vite.config.ts:23-33`, `AppHeader.tsx:106-110`, `AppHeader.tsx:206-214` |
| GATT/serial接続中flash | **FAIL（Major）**。切断誘導なし、切断後にConnectModalと更新modalが競合する。 | `AppHeader.tsx:47-63`, `AppHeader.tsx:206-214`, `App.tsx:176-187`, `App.tsx:398-402` |
| 未保存のStudio編集 | **UNKNOWN（Deferred）**。既存の`unsaved`状態を更新ボタンが参照せず、保存確認なしにリセットへ進めることは確定。変更消失の有無はdevice/backendまたは実機証拠が必要。 | `AppHeader.tsx:66-72`, `AppHeader.tsx:186-214`, `FirmwareUpdateModal.tsx:268-302` |
| AppHeader既存機能回帰 | **静的差分は該当なし＝安全**。ただしintegration testはFAIL（Minor）で、追加UIを検証しない。 | `AppHeader.tsx:106-110`, `AppHeader.tsx:206-214`, `AppHeader.test.tsx:21-44` |
| アクセシビリティ | **FAIL（Minor）**。dialogと見出しが`aria-labelledby`等で関連付けられず、accessible nameがない。 | `GenericModal.tsx:9-14`, `FirmwareUpdateModal.tsx:419-430` |
| 写真のlight/dark視認性 | **コード配線PASS、実見えはDeferred**。左右assetを明示importし、theme tokenのcontainer内で通常画像として表示する。画像自体のdark variant/filterはないため実機確認が必要。 | `FirmwareUpdateModal.tsx:12-13`, `FirmwareUpdateModal.tsx:68-80` |

## 最終安全確認

- Critical相当（TSからnative writeを迂回、通常フローのR→L順序を構造的に飛ばす、行き止まりで復旧不能）は**該当なし＝安全**（`src/firmware-update/machine.ts:141-144`, `src/firmware-update/machine.ts:183-203`, `src/firmware-update/useRecoveryActions.ts:71-82`）。recoveryでのR/L物理識別限界はR2-D1に分離した。
- 本レビューはR2限定であり、native側のBoard-ID / UF2 / SHA / address-windowの実装正否は判定していない。TS側からは通常・recoveryとも同じwrite commandへ必要値を渡している（`src/firmware-update/useFirmwareUpdate.ts:161-178`, `src/firmware-update/useRecoveryActions.ts:71-80`）。
