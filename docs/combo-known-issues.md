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

## バグC: そもそも実行時のコンボ処理に繋がっていない（2026-07-28 判明・最重要）

- **症状**: 設定の保存・読み出し・削除は動くが、**実際にキーを同時押ししても何も起きない**。
- **根拠（実コード）**: `~/farmware/zmk-module-runtime-combos/src/runtime_combos.c` の冒頭に
  `TODO: Hook into ZMK's combo event processing to activate runtime combos.` と明記されている。
  実装されている関数は `zmk_runtime_combos_get_all` / `_set` / `_delete` と settings の保存のみ。
  **キー入力を監視するコードが存在しない**（`ZMK_LISTENER` / `ZMK_SUBSCRIPTION` / `position_state_changed` の購読がゼロ）。
- **つまり**: `CONFIG_ZMK_RUNTIME_COMBOS=y` / `_STUDIO_RPC=y` が有効でも、**設定を保存できるだけの箱**。
  Studio 側のUIをどれだけ作り込んでも、この状態では機能しない。
- **判明の経緯**: コンボUIの再設計・実装をCodexへ発注したところ、実装前にこの契約不成立を検出して停止した
  （`layerMask` / `slowRelease` を「有効なレイヤー」「キーを離すタイミング」として画面に出す根拠が
  対象FWに存在しない、という理由）。
- **まさかず判断（2026-07-28）**: コンボは見送り、準備中のまま据え置く。FW実装は別プロジェクトとして切り出す。

### 参考: 標準ZMKの静的コンボの挙動（FW実装時の仕様の当たり）

`~/farmware/zmk/app/src/combo.c` の静的コンボ実装では:
- `layer_mask == 0` は全レイヤーで有効、非0なら `BIT(layer)` を検査（`combo_active_on_layer`, 150-155行）
- `slow_release=true` は最後のキーを離したときに終了、`false` は最初のキーを離したときに終了（55-57, 381-388行）

runtime-combos を実装するときは、この静的実装が最も近い参考になる。ただし**未接続なので、上記を
runtime-combos の契約として採用してよい根拠はまだない**（実装時に実機で実証すること）。

### 設計資産（実装再開時に使える）

2026-07-28 にUIの再設計まで完了している。FW実装が済んだらそのまま使える:
- `docs/combo-ui-design.md` — 画面設計（一覧・空状態・編集の構成、操作フロー、既存からの変更点と理由）
- `docs/combo-ui-mock.html` — ブラウザで開ける見た目のモック

あわせて既存 `ComboSettings.tsx` のバグ2件も特定済み（下記チェックリスト参照）。

---

## 誤診の訂正（重要）

- `PAYLOAD 25→128`（`minimal-keys2` `0c5590e`）は `CONFIG_ZMK_STUDIO_RPC_CUSTOM_SUBSYSTEM_REQUEST_PAYLOAD_MAX_BYTES` が **Kconfig 消費者ゼロの no-op**（custom payload は `pb_callback_t` ストリーム式）。前回「25B キャップが 3-4 キーコンボの decode を壊す」は**誤診の可能性が高い**。コンボ保存の真因はバグA（packed decode）。

---

## コンボ再開時のチェックリスト

**0 を解決しない限り、1以降をやっても機能しない。順序を守ること。**

0. **バグC（実行時処理へ未接続）を解消する** — `runtime_combos.c` を ZMK のキー入力処理に繋ぐ。
   これは Studio 側の作業ではなく**ファームウェア開発**であり、書き込みと実機検証を伴う。
   参考は `zmk/app/src/combo.c`（静的コンボの実装）。
1. バグB（接続固着）の真因を特定・修正（FW、再フラッシュを伴う）。
   ※ 2026-07-27 に Studio 側の接続固着（グローバルRPC mutex）は根治済みだが、
   バグBは「**キーボードの電源再投入で回復**」する別物であり、未解決の可能性が高い。
2. バグA（`combos.ts` の packed 対応）を**実機で検証**。
3. `docs/combo-ui-design.md` に沿って `ComboSettings.tsx` を作り直す（設計は承認済み）。
   あわせて既存バグ2件を直す:
   - 保存・削除の応答で `success` を確認していない（`resp.error` の有無だけで成功扱い）。
     FWは `success = (rc == 0)` を返す（`custom_handler.c:99-103, 112-115`）。
   - 新規IDを編集開始時に消費するため、キャンセルを繰り返すと欠番が増える
     （`nextIdRef.current++`）。保存直前に採番すること。
4. `src/App.tsx` の combo スロットを `ComboComingSoon` → `ComboSettings` に戻す。
5. `src/tour/steps.ts` のコンボステップから「（近日対応予定）」を外す。
6. 不要になれば `src/combos/ComboComingSoon.tsx` を削除。

詳細な調査経緯: Obsidian `07-Claude/sessions/2026-07-05_2007_コンボ保存バグ_packedデコード根本原因特定.md` と本日のセッション記録。
