# コンボ機能 既知の問題と再開手順

最終更新: 2026-07-05

コンボUIは v0.3.0 時点で「準備中」プレースホルダ（`ComboComingSoon`）に隔離している。
下記2つの未解決バグがあり、リリースをブロックしないための一時措置。本ドキュメントは**コンボ再開時の資産**。

## 現在の隔離状態

- `src/App.tsx` の combo スロットで `ComboSettings` の代わりに `ComboComingSoon` をマウント → `getAllCombos` RPC は発火しない。
- タブボタンは残す（見えるが中身が「準備中」）。
- `ComboSettings.tsx` / `combos.ts` / `combos.test.ts` は再開用に残置。
- 関連コミット: `8fa5083`（保存修正の保全）/ `346fc46`（構築中化）。

---

## バグA: コンボ保存が「1個OK・複数NG」（packed decode 不一致）

- **症状**: コンボを1個保存すると通るが、複数だと保存後の一覧取得で `invalid wire type 7` が出て崩れる。
- **真因**: FW（nanopb）は `repeated uint32 key_positions` を **PACKED**（wire type 2 = 長さ付きvarintブロック）で送る。Studio デコーダが **非packed 前提**で、length バイトをキー位置と誤読 → 以降タグ誤読のカスケード崩壊。combos が全カスタムサブシステム中で唯一の repeated スカラー保持者だったため、ここだけ壊れた。
- **対策**: `src/proto/combos.ts` の `decodeComboConfig` case 2 を両 wire type 対応（packed / 非packed 両受理）。回帰テスト `src/proto/combos.test.ts` 3件（packed / 非packed / 単体）。
- **状態**: ⚠️ **実機未検証**。コンボ再開時に必ず実機で検証すること（保存自体は FW 側で成功しており、壊れていたのは読み出し表示側）。
- 参照: `src/proto/combos.ts`, `src/proto/combos.test.ts`

---

## バグB: Studio RPC 接続固着（BLE・USB 両方）

- **症状**: キーボードの打鍵（HID）は BLE・USB 両方できる。だが Studio への RPC 接続が **BLE・USB 両方で失敗**（「接続に失敗しました」）。**電源再投入で回復**＝ RAM 上のランタイム状態の固着（コードの静的破壊ではない）。
- **切り分け**: HID 無傷で RPC だけ両トランスポートで死ぬ ＝ 両者が共有する RPC パイプラインが原因。FW 自体は起動している（ブート失敗・RAM オーバー系は却下）。
- **仮説（Fable5）**: zmk fork `97f5a5cf` で追加した abort パス `ring_buf_reset(tx_buf)`（`app/src/studio/gatt_rpc_transport.c`）が、producer の `ring_buf_put_claim`/`put_finish`（`app/src/studio/rpc.c`）と非同期に競合し、共有 TX リングを恒久「満杯」にして `rpc_main` が mutex 保持のまま無限スピン。
- **独立検証（Codex）→ REFUTE**: Zephyr v3.5.0 の ring_buf を照合した結果、競合が起きても `put_finish` が `-EINVAL` を返して**自己回復**するため、電源再投入必須の恒久ウェッジは構成できない。Fable5 仮説は支持されない。
- **真因: 未特定**。候補 = `rpc_main` 側の別ロック / BLE・USB 共有の別状態（グローバルフラグ・セマフォ等）。
- **Codex の留保**: west 管理下の Zephyr 実体をローカルで確認できず、GitHub 公式 v3.5.0 で代替検証した。ローカルに Zephyr のパッチ差異があれば再検証が必要。

### 次の調査手順（コンボ/接続を再開するとき）

1. west workspace の Zephyr 実体を特定して ring_buf 周りを再検証（留保点の解消）。
2. `rpc_main` 側の別ロック・BLE/USB 共有状態（グローバルフラグ・セマフォ）を洗い直す。
3. 実機ログを取得: `RPC indicate failed after retries; aborting response` / `RPC TX buffer full` / `Expected SOF, got`。1つ目が出ていれば abort パス発火の直接証拠。
- 参照 FW: `~/farmware/zmk` `app/src/studio/{rpc.c, gatt_rpc_transport.c}`（`97f5a5cf`）、`~/farmware/minimal-keys2`（`0c5590e`）。

### 接続固着の実機切り分け（隔離リリース後に観察）

コンボUI隔離を出した後、通常使用で接続固着が**再発するか**を見る:

- **再発しない** → 引き金はコンボタブの `getAllCombos` 関連だった。実用上は収束。FW 恒久修正の優先度を下げてよい。
- **再発する** → コンボ以外の引き金がある。上記「次の調査手順」で真因を固め、FW を恒久修正（再フラッシュ）。

---

## 誤診の訂正（重要）

- `PAYLOAD 25→128`（`minimal-keys2` `0c5590e`）は `CONFIG_ZMK_STUDIO_RPC_CUSTOM_SUBSYSTEM_REQUEST_PAYLOAD_MAX_BYTES` が **Kconfig 消費者ゼロの no-op**（custom payload は `pb_callback_t` ストリーム式）。前回「25B キャップが 3-4 キーコンボの decode を壊す」は**誤診の可能性が高い**。コンボ保存の真因はバグA（packed decode）。

---

## コンボ再開時のチェックリスト

1. バグB（接続固着）の真因を特定・修正（FW、再フラッシュを伴う）。
2. バグA（`combos.ts` の packed 対応）を**実機で検証**。
3. `src/App.tsx` の combo スロットを `ComboComingSoon` → `ComboSettings` に戻す。
4. `src/tour/steps.ts` のコンボステップから「（近日対応予定）」を外す。
5. 不要になれば `src/combos/ComboComingSoon.tsx` を削除。

詳細な調査経緯: Obsidian `07-Claude/sessions/2026-07-05_2007_コンボ保存バグ_packedデコード根本原因特定.md` と本日のセッション記録。
