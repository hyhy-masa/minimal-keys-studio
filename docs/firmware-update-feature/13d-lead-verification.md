# メイン統括による実コード一次検証（Fable5仲裁の入力）

対象: code-reviewer（Opus4.8）の findings（`13c-code-reviewer-findings.md`・Critical 0 / Major 4 / Minor 9）のうち Major 4件を、メイン統括が実コード Read で一次判定。Codex R1/R2（GPT-5.6）の独立結論とは別に保持（出所分離）。

## Major 判定表

| # | 指摘 | 判定 | 根拠（file:line） |
|---|------|------|------------------|
| MAJ-1 | `machine.ts` blocked/error がUIデッドエンド | **誤検出（設計意図の誤解）** | `FirmwareUpdateModal.tsx:376-384` — blocked は「閉じる」ボタン＋`blockReasonText`（`ja.ts:27-28`「公式LINE/Discordの案内に従って」）。blocked は**更新を始める前に弾く意図的終端**（settings_reset必須 or tool古い）＝まだ何も書いていないので recovery 不要。error 状態は `:386-400` で「うまくいかないとき」→ENTER_RECOVERY のボタン有り。詰みではない。かつ現行 manifest `requires_settings_reset=false`＝blocked 非発火 |
| MAJ-2 | fail-open（sha256空文字でSHA検証スキップ） | **正当（防御的改善・現行非発火）** | `flash/mod.rs:141` `if !sha256.is_empty()`／呼び出し元 `useFirmwareUpdate.ts:174`・`useRecoveryActions.ts:77` は `asset?.sha256 ?? ""`。manifest構造上 asset.sha256 は常に有る（doc11 curl確認）ので**現状発火ゼロ**。防御的には fail-closed（空なら書込拒否）が望ましい → Minor〜Major |
| MAJ-3 | `download.rs` リダイレクト検証なし | **要Codex確認（実害限定）** | download.rs 未読（Codex R1 の Rust安全層レビュー担当）。DL後SHA-256照合があるため改竄取得先でも書込前に弾ける。https スキーム固定の確認を推奨 |
| MAJ-4 | RecoveryPanel 片側書き直しで進捗未配線 | **誤検出** | `useRecoveryActions.ts:71-80` — `new Channel<Progress>()`→`ch.onmessage=setProgress`→`flash_write_uf2({onProgress: ch})` で配線済み。安全ゲート（validate_uf2/SHA/Board-ID）も同じRustコマンド経由（`:8-10` コメント）で通る |

## 結論

- **Critical ゼロ・文鎮直結欠陥なし**（code-reviewer と一致）。
- Major 4件のうち **2件（MAJ-1/MAJ-4）は誤検出**、1件（MAJ-3）は SHA照合で実害限定、**実質的な改善余地は MAJ-2 fail-open（防御的・現行非発火）と MAJ-3 の https 固定のみ**。
- **いずれもリリースをブロックしない**。fail-closed 化と https 固定は「入れておくと堅い」防御的修正（GO-3 前に入れる価値はあるが必須ではない）。

## Codex R1/R2 との突き合わせ待ち
Codex（GPT-5.6・出所分離）の R1（Rust安全層・fail-open評価含む）/ R2（TSウィザード）着地後、Fable5 が [code-reviewer 13c + 本メモ 13d + Codex 13/13b] を統合判定表へ。GO-R（Critical残ゼロ）材料とする。

## 前セッションからの揮発について
前セッションで scratchpad に置いた code-reviewer findings・C1判定・リリースノート・テスターキットは**新セッションで揮発**（scratchpad はセッション間で消える）。以後、成果は docs/Obsidian に永続化する。C1判定＝本メモ MAJ-2 と同一（書込前SHA検証は配線済み・fail-openのみ論点）。
