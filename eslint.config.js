// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Deliberately small.
 *
 * The brief asks for a linter, not for a style argument. Formatting is
 * Prettier's job and is not duplicated here; what is left is the handful of
 * rules that catch real defects — an unused variable that marks a half-finished
 * edit, a `case` that falls through by accident, a floating promise.
 *
 * Nothing here should require rewriting existing code to satisfy. If a rule
 * turns out to demand a repo-wide churn, it is the wrong rule for this project
 * and should be removed rather than worked around with suppressions.
 */
export default tseslint.config(
  {
    ignores: [
      // `dist/**` alone only matches the repository root. The web build emits
      // to apps/client/dist, so without the glob ESLint walks a minified
      // bundle and reports a couple of thousand problems in generated code —
      // which is how a lint run that had never been executed came back with
      // 2,280 errors, 2,199 of them in one file.
      '**/dist/**',
      '.build/**',
      'android/**',
      'data/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      // A scratch copy of the brand generator. tools/gen-brand.ts is the real
      // one; this is not shipped and is not held to the same bar.
      'scratch/**',
      // A stale duplicate of apps/, e2e/ and packages/ left in the tree. It is
      // not built, not imported and not tested, so linting it reports the same
      // problems twice under a second path.
      'color-clash-fixed-sources/**',
      // Generated: 40 base64 data URIs, and not worth linting.
      'apps/client/src/assets/assets.gen.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // An unused name is usually a rename that did not finish. The underscore
      // prefix is the escape hatch, and the codebase already uses it.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // The engine is written against exhaustive switches; a missing break is a
      // rules bug, not a style question.
      'no-fallthrough': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      // `any` appears in the hand-written type shims by necessity; flagging it
      // everywhere would be noise, so it is a warning, not an error.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Non-null assertions are load-bearing in the engine, where an invariant
      // has already guaranteed the value. Asserting is clearer than a throw.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    // Plain-JavaScript tooling runs in Node. Without this, `no-undef` reports
    // every `console` and `process` in tools/*.mjs as an undefined variable.
    // Declared by hand rather than pulling in the `globals` package, so the
    // repository keeps its very short dependency list.
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
      },
    },
  },

  {
    // The service worker is neither Node nor a page: it runs in the
    // ServiceWorkerGlobalScope, and `__PRECACHE__` is substituted at build
    // time by tools/build-pwa.ts.
    files: ['apps/client/pwa/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        fetch: 'readonly',
        location: 'readonly',
        URL: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        __PRECACHE__: 'readonly',
      },
    },
  },

  {
    // The ambient shims exist precisely to declare loose global types.
    files: ['types/**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },

  {
    files: ['**/*.test.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
