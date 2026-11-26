import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'dist/',
    'src-tauri/',
    'node_modules/',
    'test-results/',
    'playwright-report/',
    'blob-report/',
    // Git-ignored local output, and the assistant worktrees that live under .claude/
    // in the main checkout (each has its own dist/ and src/).
    'release/',
    'tmp/',
    'artifacts/qa/',
    '.claude/',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh.plugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Vite's React plugin hot-reloads modules that export constants next to components.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Build tooling runs in Node, not in the webview.
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright specs run in Node; the callbacks they pass to page.evaluate run in the page.
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]);
