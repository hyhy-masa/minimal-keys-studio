# 14. 統合判定（GO-R材料）— Fable 5 最終裁定

対象: `feature/fw-update-integration` HEAD `5d48146`
入力: Codex R1(doc13)・Codex R2(doc13b)・code-reviewer要約(doc13d経由)・メイン一次検証(doc13d)・Fable 5実コード全精査（Rustコア5ファイル＋Tauri層＋TS 10ファイル）

---

## 1. まさかず向け結論

### GO-R判定: **YES（Critical残ゼロ）**

- 3系統レビュー＋私の独自精査を統合した結果、**Criticalは0件**です
- Codex R1が挙げたCritical 1件（SHA fail-open）は、実コード裏取りの結果**Majorに降格**しました（理由は§2の裁定1）
- **文鎮直結の欠陥はコード上ゼロ**を確認しました（唯一の理論経路も見つけたので2行で塞ぎます→F-3）

### ただし条件つき: rc.1タグは「必須修正6件」を入れてから

- 必須6件（F-1〜F-6）＋バージョンバンプ（B1）で**半日〜1日**（4点再実測込み）
- 特に**F-6（二重モーダル）は接続中に更新を始めた顧客がほぼ全員踏む**ので、実機テスト（GO-2）前に直す方が往復が減ります

### 一目サマリ

| 項目 | 結果 |
|------|------|
| Critical残 | **0件** |
| 今リリース必須（Major） | **6件**（F-1〜F-6・半日〜1日） |
| 同乗推奨（コスト≈0） | 3件（S-1〜S-3） |
| 次版でよい | 12件 |
| 誤検出として確定 | 2件（code-reviewer MAJ-1/MAJ-4） |
| リリース事務 | B1未実施（version 0.3.0のまま・TOOL_VERSION 0.1.0のまま）→ rc.1前に必要 |

### 補足（プロセス）

- `13c-code-reviewer-findings.md` は**実ファイルが存在しません**（前セッションのscratchpad揮発。Major 4件は13dに転記済みで裁定に使用。**Minor 9件は記録喪失**）。Minorは文言バッチ時に必要ならcode-reviewer再実行で回収してください
- doc12 Lane B1（version 0.3.0→0.4.0 ×2、TOOL_VERSION→0.4.0）が未実施です。`package.json:4` / `src-tauri/tauri.conf.json:11` = 0.3.0、`src/firmware-update/machine.ts:11` = "0.1.0" を確認しました

---

## 2. 統合判定表

主要争点の裁定（各指摘の出所・最終重要度・処理）:

### 裁定1: SHA検証 fail-open（`src-tauri/src/flash/mod.rs:140`）

- 出所: Codex R1=**Critical** / code-reviewer=Major / 13d=Minor〜Major
- **最終裁定: Major・今リリース必須（F-1）**
- Critical降格の根拠（実コードで裏取り）:
  - 現行の全経路で非発火: Rust `manifest.rs:96-100` が central/peripheral の存在を強制し、`FwAsset.sha256` は必須String（欠落するとparse自体が失敗）。TS側 `asset?.sha256 ?? ""` が空になるのは asset undefined の時だけで、通常フロー（`useFirmwareUpdate.ts:166-174`）では構造上不可能。recovery（`useRecoveryActions.ts:56`）は asset無しなら throw
  - 発火しても文鎮不可: SHAが素通りしても `validate_uf2` の構造・familyID・アドレス窓・全ブロック検証は生きる。窓 0x27000–0xF4000 がMBR/SoftDevice/bootloaderを保護し、最悪でも「動かないアプリFW」→ リセット2回でbootloader再進入→復旧可能
  - ただし defense-in-depth 原則違反＋将来のフロント回帰で静かに開く芽 → 3行で閉じるべき

### 裁定2: download https非固定・リダイレクト（code-reviewer MAJ-3 / `download.rs`）

- 出所: code-reviewer=Major / 13d=実害限定
- **最終裁定: Minor（防御的）・Rustバッチに同乗推奨（S-1）**
- 根拠: manifest URLは `useFirmwareUpdate.ts:14-16` でhttps GitHub固定（上書きはビルド時env=開発用のみ）。資産はDL時＋書込前の二重SHA照合で改竄が無効化される。manifest自体はSHA照合なしだが信頼根＝TLS+GitHubアカウントであり、httpsスキーム強制はその信頼根を守る3行の保険。ureqのリダイレクト先はGitHub管理下（残余リスク小）

### 裁定3〜: 全指摘の統合表

| # | 指摘 | 出所 | 最終裁定 | 処理 |
|---|------|------|---------|------|
| 1 | SHA fail-open（mod.rs:140） | R1-Crit/CR-Maj/13d | **Major** | **必須F-1** |
| 2 | アドレス窓parse失敗を黙殺（mod.rs:143-148） | R1-Major | **Major** | **必須F-2** |
| 3 | 【新規・Fable】manifest窓のwiden無制限＝供給網侵害時の唯一の文鎮経路 | Fable | **Major** | **必須F-3** |
| 4 | ManifestInvalid/Io がformatErrorのdefault落ち（ja.ts:61-63） | R2-M2 | **Major** | **必須F-4** |
| 5 | 書込中Escapeでモーダル消失＋close時にcancel未配線（Modal+useModalRef） | R2-M1＋Fable拡張 | **Major** | **必須F-5** |
| 6 | 切断時ConnectModalが更新ウィザードに覆い被さる（App.tsx:398） | R2-M3 | **Major**（全顧客が踏む） | **必須F-6** |
| 7 | https非固定（download.rs） | CR-MAJ3 | Minor防御 | 同乗S-1 |
| 8 | supportLogにscan結果未記録（useFirmwareUpdate.ts:146） | R1-Major | Minor診断 | 同乗S-2 |
| 9 | アプリ終了（Cmd-Q）ガードなし | R2-M1後段 | Minor | 同乗S-3（任意） |
| 10 | 開始直後cancel喪失→60秒busy残（mod.rs:102） | R1-Major | Minor（自己回復・窓ms級） | 次版 |
| 11 | 書込中もflash_cancel無条件受付（mod.rs:169） | R1-Major | Minor（UIで防御済・直invoke前提） | 次版 |
| 12 | fw_download_asset がBusyGuard外 | R1-Deferred | Deferred追認 | 次版 |
| 13 | machine.ts blocked/errorがデッドエンド | CR-MAJ1 | **誤検出**（13d＋Fable追認: 全terminalがRESET/ENTER_RECOVERY脱出可・UIボタン実在） | 却下 |
| 14 | Recovery片側書き直しの進捗未配線 | CR-MAJ4 | **誤検出**（useRecoveryActions.ts:71-80で配線実在） | 却下 |
| 15 | fwinfo部分応答時の文言不正確 | R2-m1 | Minor | 次版 |
| 16 | AppHeader統合テスト不在 | R2-m2 | Minor | 次版（F-6と同時に最低1本追加を推奨） |
| 17 | dialogのaria-labelなし | R2-m3 | Minor | 次版 |
| 18 | R/L取り違えはBoard-IDで識別不能 | R2-D1 | Deferred | 実機の故意失敗試験へ |
| 19 | semverGe pre-release/v付き非対応 | R2-D2 | Deferred | 次版（CI側のmanifest契約を明文化） |
| 20 | Webバンドルからのコード排除なし | R2-D3 | Deferred | 次版 |
| 21 | 未保存編集の確認なしで更新開始 | R2-D4 | Deferred | 実機確認へ |
| 22 | 【新規・Fable】wait_for_new_volumeがBoard-ID非フィルタ | Fable | Minor（書込側ゲートで安全担保・UXのみ） | 次版 |
| 23 | 【新規・Fable】filenameのpath traversal未サニタイズ（fsops.rs:97・直invokeのみ） | Fable | Deferred | 次版 |
| 24 | 【新規・Fable】premature_slack=75%閾値でunplugが暫定成功になり得る | Fable | Deferred（checklist+recoveryが後ろ盾＝設計内） | 次版（実機データで調整） |
| 25 | code-reviewer Minor 9件 | CR | 記録喪失 | 必要なら文言バッチ時に再実行 |
| 26 | 【事務】B1バンプ未実施（0.3.0 / TOOL_VERSION 0.1.0） | Fable | — | **rc.1前に必須** |

---

## 3. 追加デバッグ結果（Fable独自精査）

### 新規に見つけた欠陥（表の#3, #22, #23, #24＋F-5拡張）

- **N-1（=F-3・Major）manifest窓クランプなし**: `mod.rs:143-148`（と `manifest.rs:35-40` のCLI経路）はmanifest指定の窓で既定窓を**置換**する。`target_addr_max: "0xFF000"` のようなmanifestが来ると bootloader域(0xF4000+)への書込が検証を通る。発火条件はGitHubアカウント/CI侵害（manifestは信頼根）だが、**これが全コード中で唯一の文鎮到達経路**。uf2.rs:35 のコメント「Manifest assets may narrow this」の意図どおり「狭める方向のみ許可」のクランプ2行で構造的に遮断できる
- **N-2（=#22・Minor）**: 待機中に他のUF2機器（RPi Pico等）を挿すと `wait_for_new_volume` がそれを掴む（acquire側と違いBoard-IDフィルタなし）。書込直前のBoard-ID preflightが拒否するので**安全は保たれる**が、エラー文言が遠回りになる
- **N-3（F-5の拡張）**: Escape問題は書込中だけでなく**待機/DL画面でも** close時に `cancel()` が呼ばれない（`GenericModal onClose={onClose}` が親のフラグを落とすだけ）。60秒waitがBusyGuardを握ったまま残り、すぐ再開始すると「予期しないエラー」（Io→default文言）になる。F-5の修正で同時に解消する
- **N-4（=#24）**: `success_threshold` は実質75%floor。75%書込済みでケーブルを抜くと reboot-like errno＋volume消失で ProvisionalSuccess になり得る。verify_checklist→recovery が受け止める設計内だが、実機データで premature_slack を締める余地

### 問題なしを確認した項目（監査のgreen side）

- **validate_uf2**: 全ブロックの magic/familyID(nRF52840固定)/窓/blockNo連番/numBlocks照合/単調非重複/オーバーフロー検査 — 穴なし（uf2.rs:95-208）
- **Board-ID二重ゲート**: 定数一本化（machine.rs:75）＋acquire側フィルタ（volume.rs:72-79）＋書込直前preflight（machine.rs:171-174, 253-270）
- **状態機械の行き止まり**: 全terminal（done/blocked/error/recovery_done）がRESET/ENTER_RECOVERYで脱出可（machine.ts:141-144）。R2の遷移表と一致を独立確認
- **recovery 3経路**: ①は純dispatch（I/Oなし）②は通常と同一Rustコマンド＝全安全ゲート通過（useRecoveryActions.ts:71-81）③は書込なし
- **エラー網羅**: FlashError 13 variant中11がja.tsに対応。落ちる2件（ManifestInvalid/Io）がF-4
- **done画面のバージョン表示**: 切断中はnullで非表示、新FWで再接続すると実バージョン表示 — 正しい配線
- **StrictMode**: main.tsx:40で有効だがdev限定の二重effect＋devはフラグOFF（vite.config）なので実害なし

---

## 4. 修正指示

### 今リリース必須（rc.1タグ前・半日〜1日・最後に4点再実測）

**F-1: SHA fail-closed** — `src-tauri/src/flash/mod.rs:139-142`
```rust
// before: if !sha256.is_empty() { limits.expected_sha256 = Some(sha256); }
if sha256.trim().is_empty() {
    return Err(FlashError::ManifestInvalid {
        reason: "missing sha256 for flash target".into(),
    });
}
limits.expected_sha256 = Some(sha256);
```

**F-2: 窓parse失敗をエラーに** — 同ファイル `:143-148`
```rust
if let Some(s) = target_addr_min.as_deref() {
    let m = parse_hex_u32(s).ok_or_else(|| FlashError::ManifestInvalid {
        reason: format!("bad target_addr_min {s:?}"),
    })?;
    limits.target_addr_min = m.max(mk_flash_core::uf2::DEFAULT_TARGET_ADDR_MIN); // F-3
}
// target_addr_max も同型（ok_or_else + .min(DEFAULT_TARGET_ADDR_MAX)）
```

**F-3: 窓は狭める方向のみ許可（クランプ）** — 上記F-2内の `.max()` / `.min()`。横展開: `crates/mk-flash-core/src/manifest.rs:35-40` の `uf2_limits()`（CLI経路）にも同じクランプを適用。`DEFAULT_TARGET_ADDR_MIN/MAX` が lib.rs で re-export 済みか確認し、なければ `pub use uf2::{DEFAULT_TARGET_ADDR_MIN, DEFAULT_TARGET_ADDR_MAX};` を追加

**F-1〜F-3のテスト**: limits構築を `fn build_limits(sha256: &str, min: Option<&str>, max: Option<&str>) -> Result<Uf2Limits, FlashError>` に抽出し、`src-tauri/src/flash/mod.rs` の `#[cfg(test)]` に4本（空sha拒否 / 不正hex拒否 / widen試行がクランプされる / 正常narrow）。manifest.rs側にもwidenクランプのテスト1本

**F-4: formatErrorに2 case追加** — `src/firmware-update/ja.ts:60` 付近
```ts
case "ManifestInvalid":
  return "更新情報を正しく読み取れませんでした。アプリが古い可能性があります。最新のアプリをご確認ください（LINE / Discord に案内があります）。";
case "Io":
  return "パソコン側のファイル操作に失敗しました。アプリを再起動してもう一度お試しください（直らない場合はサポートへ）。";
```
テスト: `machine.test.ts` の隣に `ja.test.ts` を作り、13 variant全部がdefaultに落ちないことをtable-drivenで固定（回帰ロック）

**F-5: Escapeガード＋close時cancel配線** — `src/firmware-update/FirmwareUpdateModal.tsx`
1. `GenericModal onClose={onClose}` → `onClose={handleClose}`（:420。dialogがどう閉じても背景opをcancelする）
2. 書込中などcanClose=falseの間はEscapeで閉じない:
```tsx
const canCloseRef = useRef(canClose);
canCloseRef.current = canClose;
useEffect(() => {
  const el = ref.current;
  if (!el) return;
  const onCancel = (e: Event) => { if (!canCloseRef.current) e.preventDefault(); };
  el.addEventListener("cancel", onCancel);
  return () => el.removeEventListener("cancel", onCancel);
}, [ref]);
```
注意: 共有の `useModalRef` は触らない（他モーダルへの回帰リスク回避）。WKWebView（Tauri/mac）で `cancel` の preventDefault が効くかを**実機確認項目に追加**。効かない場合はuseModalRefの既存reopenパターン（setTimeout showModal）をローカルにフォールバック実装

**F-6: 二重モーダル抑制** — `src/App.tsx` + `src/AppHeader.tsx`
1. `showFirmwareUpdate` 状態をAppHeaderからApp.tsxへリフト（`const [fwUpdateOpen, setFwUpdateOpen] = useState(false)`）
2. `<ConnectModal open={!conn.conn && !fwUpdateOpen} ...>`（App.tsx:398）
3. AppHeaderへ `fwUpdateOpen` / `onFwUpdateOpenChange` をprops追加し、ローカルstateを撤去（AppHeader.tsx:48, 106-110, 206-214）
4. 副次効果: ウィザードを閉じた時にconn=nullならConnectModalが自然に出る＝更新後の再接続導線になる
5. AppHeader.test.tsx のmock/propsを更新し、「フラグONでボタンが出る」「押すとonFwUpdateOpenChange(true)」の2本を追加（R2-m2の最小回収）

**B1: バージョンバンプ**（doc12 Lane B1・未実施）: `package.json` / `src-tauri/tauri.conf.json` 0.3.0→0.4.0、`machine.ts TOOL_VERSION` "0.1.0"→"0.4.0"

### 同乗推奨（同じコミット群に混ぜてよい・単独ではブロッカーでない）

**S-1: httpsスキーム固定** — `crates/mk-flash-core/src/download.rs` `http_get_bytes` 冒頭
```rust
let is_local_dev = url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost");
if !url.starts_with("https://") && !is_local_dev {
    return Err(FlashError::DownloadFailed {
        reason: format!("insecure URL scheme rejected: {url}"),
    });
}
```

**S-2: scan結果をsupportLogへ** — `src/firmware-update/useFirmwareUpdate.ts:147` 直後に `vols.forEach(recordVolume);`（型はVolumeInfoで互換）

**S-3（任意）: アプリ終了ガード** — Tauri `onCloseRequested` でflashing中は確認ダイアログ（30〜60分。次版に回してもよい）

### 次版でよい（リリース後のバックログ）

- cancel設計の作り直し: per-operation cancel token化（表#10/#11を同時に解消）＋fw_download_assetのBusyGuard（#12）
- wait_for_new_volumeへのBoard-IDフィルタ適用（#22）
- filenameの `Path::file_name()` サニタイズ（#23）
- premature_slack調整（#24・実機の実測データ待ち）
- fwinfo部分応答時の文言（#15）、aria-label（#17）、Webバンドル排除（#20）、semver契約明文化（#19）
- 実機試験マトリクスへ: R/L取り違え故意失敗（#18）、未保存編集の挙動（#21）、写真のdark見え、TCC/SmartScreen

---

## 5. この判定の限界（正直な注記）

- code-reviewerのMinor 9件は原本喪失のため裁定不能（Major 4件は13d転記で裁定済み）
- F-5のpreventDefault挙動とF-6のモーダル前後関係は静的解析のみ。**GO-2の実機1周で必ず踏むこと**（Escape連打・接続状態からの更新開始の2シナリオを追加）
- Codex R1の「単独版とStudio版のdiff照合」「vendored core 8ファイル照合」は再実行せずR1の結論（実差分=Board-ID定数一本化のみ）を採用した（出所分離されたread-onlyレビューであり、私のコア全読の結果とも矛盾しないため）
