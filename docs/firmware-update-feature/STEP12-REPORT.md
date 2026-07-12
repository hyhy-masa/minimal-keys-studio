# Step 1 + Step 2 完了報告

## core テスト結果

実行コマンド:

```text
cargo test --manifest-path crates/mk-flash-core/Cargo.toml
```

結果末尾:

```text
test result: ok. 51 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

## 追加・変更したテスト

### Step 1: V-1〜V-9

- V-1: `acquire_adopts_already_present_matching_volume`
- V-2: `acquire_without_adoption_times_out_when_matching_volume_is_already_present`
- V-3: `acquire_without_adoption_waits_for_different_matching_path`
- V-4: `acquire_with_adoption_rejects_two_matching_present_volumes`
- V-5: `acquire_with_adoption_ignores_foreign_board_and_waits`
- V-5: `acquire_without_adoption_ignores_foreign_board_and_waits`
- V-6: `wait_with_prefix_ignores_foreign_new_volume_then_returns_matching_volume`
- V-7: `acquire_with_empty_baseline_detects_reappeared_windows_drive_as_new`
- V-8: `acquire_ignores_foreign_reuse_of_windows_drive_then_returns_matching_drive`
- V-9: `acquire_after_initial_unreadable_scan_returns_new_matching_volume`
- 既存追随: `detects_single_new_volume`
- 既存追随: `rejects_two_new_volumes`
- 既存追随: `ignores_baseline_volume`
- 既存追随: `times_out_when_nothing_appears`

V-2/V-3 は列挙回数、V-3 は sleep 回数も検証し、`adopt_present=false` が present scan を完全にスキップすることを固定した。

### Step 2: M-1〜M-6

- M-1: `preflight_retries_until_matching_info_is_read`
- M-2: `preflight_classifies_unreadable_missing_volume_as_connection_lost`
- M-3: `preflight_classifies_unreadable_present_volume_as_io`
- M-4: `preflight_rejects_missing_board_id_without_retry`
- M-5: `preflight_rejects_foreign_board_id_without_retry`
- M-6: `preflight_retry_count_is_bounded`

各ケースで INFO 読取回数、sleep 回数、最終 presence 判定回数を検証した。

## git log --oneline -3

```text
76135ff feat(fw-core): finite-retry preflight classification + ConnectionLost (A-fix-1)
ae455e6 feat(fw-core): add adopt_present + AcquiredVolume/VolumeOrigin, prefix-filter wait_for_new_volume (C-fix-1/C-fix-3)
6e9cd47 docs(fw-update): add fix plan 16-18 (Codex review + Fable5 final spec)
```

## ユーザー指定の参照行

以下は今回のリポジトリの `git log --oneline -3` には存在しないため、実際のログとは分けて原文どおり記録する。

```text
b7581ec x-article: 文体再現スキル確定＋Uuuk再現テストでpolish穴をhardening
1203094 env: 呼び出しエラー対策と全ドキュメント/パス健全化
a29e0fc memory: 永続メモリの二重ストア統合・規約フル整備・agent-memory最適化
```

## 差分ゼロ対象の確認

基準コミット `6e9cd47` から Step 2 完了コミット `76135ff` までの `machine.rs` 差分を `git diff --unified=0` で確認した。

- 書込ループ: 差分なし。許可された `preflight_board_id(..., &config.timings)` 呼出変更のみ。
- `finish_completed`: 差分なし。
- `rewrite_and_finish`: 差分なし。
- `await_unmount`: 差分なし。
- `classify_errno`: 差分なし。
- 変更コミットの対象は `crates/mk-flash-core/src/{volume.rs,lib.rs,machine.rs,error.rs}` のみ。
- 別件の `M CLAUDE.md` は未ステージのまま触らず、2コミットのいずれにも含めていない。

## 逸脱・判断に迷った点

- 設計・実装スコープからの逸脱なし。Step 3〜6、`src-tauri`、CLI、TS、CI は変更していない。
- 完了報告の直接指示に3つの別ハッシュが列挙されていた一方、詳細指示は実際の `git log --oneline -3` を要求していた。捏造を避けるため、実際のログとユーザー指定の参照行を分離して記載した。
- `cargo fmt --check` は既存の未整形箇所を検出して失敗した。保護対象へのスコープ外整形差分を避けるため、既存未整形箇所は変更していない。受入基準の core テストと `git diff --check` は成功した。
- Step 1 の署名変更により CLI/Tauri が未追随なのは正本どおりの想定内であり、修正・検証対象に含めていない。
- 指定どおり実装コミットは Step 単位の2本とし、本報告書は2コミット後に作成したため未コミットで保存している。
