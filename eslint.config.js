// ESLint flat config: real mistakes only (unused code, unsafe patterns);
// formatting is left alone on purpose, so there is no style churn. Runs
// without type information, to stay fast.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'parity/**', 'compare/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      // (a leading underscore marks a name unused on purpose)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  { files: ['scripts/**', 'test/**', '*.config.{js,ts}'], languageOptions: { globals: { ...globals.node } } },
  // (the check scripts poke at whatever a build returns)
  { files: ['scripts/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
