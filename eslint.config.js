import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', '.local/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['extension/*.js'],
    languageOptions: { globals: { ...globals.browser, chrome: 'readonly' } },
  },
];
