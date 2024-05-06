import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint, { plugin as tsPlugin } from "typescript-eslint";
import typescriptParser from "@typescript-eslint/parser";

export default tseslint.config(
  // {languageOptions: { globals: {...globals.browser, ...globals.node} }},
  // pluginJs.configs.recommended,
  // ...tseslint.configs.recommended,
  {
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error"]
    },
    files: ["src/**/*.ts"],
  },
  {
    files: [
      '**/*.{js,cjs,mjs}',
      '**/*.d.ts',
      'dist/**/*',
      '.yarn/**/*',
      'demo/**/*',
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
