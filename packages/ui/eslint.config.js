import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';

// Svelte 5 runes are compiler-provided globals; eslint-plugin-svelte's
// recommended config still leaks `no-undef` on them when the file is `.svelte.ts`
// (only `.svelte` gets the implicit globals). List them explicitly so both file
// types lint cleanly.
const svelteRuneGlobals = {
  $state: 'readonly',
  $derived: 'readonly',
  $effect: 'readonly',
  $props: 'readonly',
  $bindable: 'readonly',
  $inspect: 'readonly',
  $host: 'readonly'
};

// Match the unused-vars convention used across the codebase: a leading
// underscore on an argument or local marks it as intentionally unused
// (e.g. `_log` for parameters required by an interface but not yet wired).
const unusedVarsOptions = {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_'
};

export default [
  js.configs.recommended,
  {
    // Build scripts run on Node — give them the node globals. `test/**` porte la mise en place
    // GLOBALE des bancs (`test/regime-voisins.globalSetup.mjs`), qui tourne dans le processus
    // principal de vitest, en Node : même environnement que les scripts, même déclaration.
    files: [
      'scripts/**/*.{js,mjs,cjs}',
      'test/**/*.{js,mjs,cjs}',
      '*.config.{js,ts,mjs}',
      '**/*.config.{js,ts,mjs}'
    ],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...svelteRuneGlobals
      }
    },
    plugins: { '@typescript-eslint': ts },
    rules: {
      ...ts.configs.recommended.rules,
      // The base `no-unused-vars` rule reports variables the TS plugin's version
      // also handles — keep only the TS-aware one so the underscore-prefix
      // convention applies uniformly.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', unusedVarsOptions],
      // TypeScript itself reports undefined identifiers via the compiler; the
      // ESLint rule duplicates that work and doesn't know about lib.dom types
      // like `AddEventListenerOptions`, `MediaStreamTrack`, etc. Disable it for
      // .ts so `svelte-check` / `tsc` stays the single source of truth.
      // See typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule
      'no-undef': 'off'
    }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tsParser },
      globals: {
        ...globals.browser,
        ...svelteRuneGlobals
      }
    },
    plugins: { svelte, '@typescript-eslint': ts },
    rules: {
      ...svelte.configs.recommended.rules,
      // Use the TS-aware unused-vars rule on `<script lang="ts">` blocks too —
      // the base rule flags parameter names inside TS callback type aliases
      // (`onChange: (text: string) => void`) as "unused", which they aren't.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', unusedVarsOptions],
      // TypeScript handles undefined-identifier detection for the script block;
      // same rationale as the .ts override above.
      'no-undef': 'off'
    }
  },
  {
    ignores: [
      'node_modules',
      'dist',
      '.vite',
      'test-results',
      'playwright-report',
      // Doc utilisateur EMBARQUÉE (MkDocs, artefact régénéré — cf. [446]) : JS minifié
      // (lunr, search worker), CSS et HTML statiques. Ce n'est PAS du code source Kanopi
      // → jamais lintée (sinon ~700 faux positifs no-undef sur le bundle mkdocs).
      'public/docs/**',
      // Vendored upstream from BPscript/public/timeline.js — kept verbatim
      // (integration rule: no edits to the logic), so it is not linted here.
      'src/lib/timeline/timeline.js'
    ]
  }
];
