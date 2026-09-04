export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { console: 'readonly', document: 'readonly', window: 'readonly',
                 performance: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
                 process: 'readonly', URL: 'readonly', IntersectionObserver: 'readonly',
                 __DEBUG__: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
