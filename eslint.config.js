const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['coverage/**', '.expo/**'],
    rules: {
      'import/order': [
        'error',
        { 'newlines-between': 'always', alphabetize: { order: 'asc' } },
      ],
    },
  },
]);
