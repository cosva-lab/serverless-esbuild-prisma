import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import jest from 'eslint-plugin-jest';

export default [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      prettier: prettier,
    },
    rules: {
      'no-unused-vars': 'off', // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          args: 'none',
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // General rules
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',

      // Prettier integration
      'prettier/prettier': 'error',
    },
  },
  {
    files: ['__tests__/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    plugins: {
      jest: jest,
    },
    rules: {
      ...jest.configs.recommended.rules,
      'jest/expect-expect': 'error',
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'error',
      'jest/prefer-to-have-length': 'warn',
      'jest/valid-expect': 'error',
      'jest/no-identical-title': 'error',
      'jest/valid-describe-callback': 'error',
      'jest/valid-expect-in-promise': 'error',
      'jest/no-conditional-expect': 'error',
      'jest/no-deprecated-functions': 'error',
      'jest/no-done-callback': 'error',
      'jest/no-duplicate-hooks': 'error',
      'jest/no-export': 'error',
      'jest/no-standalone-expect': 'error',
      'jest/no-test-return-statement': 'error',
      'jest/prefer-expect-assertions': 'off',
      'jest/prefer-strict-equal': 'warn',
      'jest/prefer-to-be': 'warn',
      'jest/prefer-to-contain': 'warn',
      'jest/require-top-level-describe': 'off',
      'jest/valid-title': 'error',
    },
  },
  {
    ignores: ['lib/', 'node_modules/', '*.js', '*.d.ts'],
  },
];
