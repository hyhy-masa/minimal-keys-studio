module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "plugin:storybook/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "no-restricted-globals": [
      "error",
      {
        name: "confirm",
        message: "Use ConfirmDialog for destructive actions.",
      },
    ],
    "no-restricted-properties": [
      "error",
      {
        object: "window",
        property: "confirm",
        message: "Use ConfirmDialog for destructive actions.",
      },
      {
        object: "globalThis",
        property: "confirm",
        message: "Use ConfirmDialog for destructive actions.",
      },
    ],
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
  },
};
