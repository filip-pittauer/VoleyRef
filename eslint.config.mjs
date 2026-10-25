// ESLint – automatická kontrola kódu (něco jako analyzéry/warnings v C#).
// Spuštění: npm install (jednou), pak npm run lint.
import js from '@eslint/js';
import globals from 'globals';

export default [
  // private/ = soukromé repo s vlastními nástroji, js/vendor/ = cizí knihovna
  { ignores: ['private/**', 'js/vendor/**', 'node_modules/**', '.playwright-mcp/**'] },

  js.configs.recommended,

  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      // `x == null` je záměrný idiom: null i undefined (jako `x is null` v C#)
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-shadow': 'error',
      // složitost a délka: zatím jen varování, přepis funkcí je další krok
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 60, skipComments: true, skipBlankLines: true }],
    },
  },

  // service worker má jiné globální objekty (self, caches, clients)
  { files: ['sw.js'], languageOptions: { sourceType: 'script', globals: globals.serviceworker } },

  // Node skripty (tools/, tento soubor)
  { files: ['tools/**', 'eslint.config.mjs'], languageOptions: { globals: globals.node } },

  // klasický skript (ne modul) – vložený přes <script src>
  { files: ['js/stats-redirect.js'], languageOptions: { sourceType: 'script' } },
];
