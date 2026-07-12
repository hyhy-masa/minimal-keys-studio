# Step 6 CI テストゲート実装報告

対象ブランチ: `feature/fw-update-integration`  
Step 6 基点: `c1d0381`  
Step 6 コミット: `8b2a5f9 ci(fw): run mk-flash-core/cli/tauri cargo tests in build-tauri (clamp gate)`

## 追加 YAML

`build-tauri` job の `npm ci` 後、`tauri-apps/tauri-action` 前に、以下を追加した。

```diff
       - run: npm ci

+      - run: npm run build
+      - run: cargo test --manifest-path crates/mk-flash-core/Cargo.toml
+      - run: cargo test --manifest-path crates/mk-flash-cli/Cargo.toml
+      - run: cargo test --manifest-path src-tauri/Cargo.toml
+
       - uses: tauri-apps/tauri-action@v0
```

`test` job（ubuntu）の変更はない。ubuntu の reqwest/TLS ビルド不確実性を避け、Rust テストを reqwest のビルド実績がある `build-tauri`（macOS / Windows）へ集約した。`npm run build` を cargo test より先に置き、`src-tauri` の `generate_context!` が要求する `dist/` を生成する。

## YAML parse 確認

- `python3 -c "import yaml; yaml.safe_load(...)"`: **未検証**。環境に PyYAML がなく、`ModuleNotFoundError: No module named 'yaml'` となった。
- 代替として Ruby Psych で同じ YAML を parse: **PASS**（exit 0）。
- 目視確認: 追加4 step は `npm ci`（55行）の直後、`tauri-apps/tauri-action`（62行）の直前にあり、manifest path は正本どおり。
- `git diff --check c1d0381..HEAD`: **PASS**（出力なし）。

## 履歴確認

`git log --oneline -3` 実測:

```text
8b2a5f9 ci(fw): run mk-flash-core/cli/tauri cargo tests in build-tauri (clamp gate)
c1d0381 feat(fw): confirm screens + version display + recovery/error text (Step 5b)
99ed818 refactor(fw): extract WizardBody from modal/stories (Step 5a)
```

Step 1〜5 の既存ハッシュは不変。確認したハッシュは次のとおり。

```text
642f616 Step 1+2
76135ff Step 2
38aaae7 Step 3
6b81cab Step 4
99ed818 Step 5a
c1d0381 Step 5b
```

rebase / amend / squash / reset / force-push は実行していない。`CLAUDE.md` は変更していない。

## 基点からの差分

`git diff --stat c1d0381..HEAD` 実測:

```text
 .github/workflows/release.yml | 5 +++++
 1 file changed, 5 insertions(+)
```

`release.yml` は指定どおり1ファイル・1コミットで変更した。本レポートはそのコミット後に作成したため、コミット範囲の差分統計には含めていない。

## CI 実行について

この workflow は tag push でのみ起動し、ローカル dry-run はできないため、CI が緑とは報告しない。`npm run build` および3つの `cargo test` は、CI の実行を偽装しないため、この Step では実行していない。

## 逸脱・迷った点

- 正本 §5 Step 6 には ubuntu 側へ core / CLI test を置く案もあるが、詳細指示どおり reqwest/TLS の不確実性を避けて4 stepすべてを `build-tauri` に集約した。
- Python の YAML parse は PyYAML 不在のため未検証と明記し、Ruby Psych の parse 結果を代替確認として記録した。
- 既存の `M CLAUDE.md` と未コミットの `STEP5-REPORT.md` は保持し、変更・コミットしていない。
