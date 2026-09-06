const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  { ignores: ['coverage/**', '.expo/**'] },
  expoConfig,
  {
    rules: {
      'import/order': [
        'error',
        { 'newlines-between': 'always', alphabetize: { order: 'asc' } },
      ],
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/application/**',
                '@/infrastructure/**',
                '@/presentation/**',
              ],
              message: 'Domain code must remain independent of outer layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/infrastructure/**', '@/presentation/**'],
              message:
                'Application code may depend only on application/domain contracts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/presentation/**'],
              message: 'Infrastructure code must not depend on presentation.',
            },
          ],
        },
      ],
    },
  },
  {
    // Local Expo Config Plugins live outside `src` as plain Node/CommonJS
    // files and are tested with the same Jest runner used for `src`.
    files: ['plugins/**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
  {
    files: ['src/presentation/**/*.{ts,tsx}'],
    ignores: [
      'src/**/*.test.{ts,tsx}',
      'src/presentation/providers/app-providers.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/infrastructure/**'],
              message:
                'Presentation receives infrastructure through AppProviders.',
            },
          ],
        },
      ],
    },
  },
]);
