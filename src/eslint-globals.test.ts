import { describe, expect, it } from "vitest";

type LintMessage = { ruleId?: string };
type LintResult = { errorCount: number; messages: LintMessage[] };
type ESLintInstance = {
  lintText(source: string, options: { filePath: string }): Promise<LintResult[]>;
};
type ESLintConstructor = new (options: { cwd: string; useEslintrc: boolean }) => ESLintInstance;
const eslintModuleName = "eslint";

async function lint(source: string) {
  const { ESLint } = await import(eslintModuleName) as { ESLint: ESLintConstructor };
  const eslint = new ESLint({ cwd: process.cwd(), useEslintrc: true });
  return eslint.lintText(source, { filePath: "src/confirm-probe.ts" });
}

describe("confirmation lint rules", () => {
  it.each([
    ["bare confirm", "confirm('continue?');"],
    ["window.confirm", "window.confirm('continue?');"],
    ["globalThis.confirm", "globalThis.confirm('continue?');"],
  ])("rejects %s", async (_name, source) => {
    const [result] = await lint(source);

    expect(result.messages.some((message) => message.ruleId?.startsWith("no-restricted-"))).toBe(true);
  });

  it("allows alert and prompt because they are outside this dialog-specific regression", async () => {
    const [result] = await lint("alert('notice'); prompt('name?');");

    expect(result.errorCount).toBe(0);
  });
});
