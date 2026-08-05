# minimal-keys-studio

Desktop app for configuring minimal-keys keyboard. Built with Tauri (Rust) + React + TypeScript.

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, React Aria
- **Desktop**: Tauri 2 (Rust backend)
- **Protocol**: Custom ZMK Studio protocol via `@zmkfirmware/zmk-studio-ts-client` (forked)
- **Transport**: Web Serial (browser) / BLE (Tauri, macOS)
- **Storybook**: Component catalog (port 6006)

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # tsc && vite build
npm run lint         # ESLint
npm run storybook    # Storybook dev
npm run tauri dev    # Tauri + Vite dev
npm run tauri build  # Production build
```

## Development Process

This project uses superpowers skills for structured development (TDD, planning, debugging, code review).

### テスト駆動開発（TDD）で開発する

コード変更はテスト駆動で行う。superpowersのtest-driven-developmentスキルに従う。

### What "done" means for Studio

1. **テストが書かれている**（テスト可能な変更の場合）
2. `npm test` passes（Vitest）
3. `npm run build` passes (TypeScript + Vite, no errors)
4. `npm run lint` passes
5. `npm run dev` works locally
6. If Tauri-affecting: `npm run tauri build` passes
7. If proto/RPC change: FW-side proto also updated (check minimal-keys2 repo)

### FW ↔ Studio boundary

Changes to RPC or proto require updates in BOTH repos:
- **Studio**: `@zmkfirmware/zmk-studio-ts-client` (TypeScript)
- **FW**: ZMK fork proto definitions (C)

Always verify both sides when touching the communication layer.

## 記憶（第二の脳）
- 運用知識・過去の学び・人物/競合/ツール: `~/.claude/projects/-Users-masakazuhayata-claude/memory/MEMORY.md`（索引→必要ページだけRead。人物・競合・ツールはまず `entities/INDEX.md`）
- 振り返り・セッション記録・判断: `~/Library/CloudStorage/Dropbox/memo/07-Claude/_index.md`
