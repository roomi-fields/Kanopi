import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' }
    },
    plugins: { '@typescript-eslint': ts },
    rules: { ...ts.configs.recommended.rules }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tsParser }
    },
    plugins: { svelte },
    rules: { ...svelte.configs.recommended.rules }
  },
  { ignores: ['node_modules', 'dist', '.vite'] }
];
