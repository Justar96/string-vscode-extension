import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  // Base JavaScript configuration
  js.configs.recommended,

  // TypeScript configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      // TypeScript-specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-var-requires': 'error',

      // General code quality rules
      'no-console': 'off', // Allow console for extension development
      'no-debugger': 'error',
      'no-unused-vars': 'off', // Use TypeScript version instead
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'template-curly-spacing': 'error',
      'array-bracket-spacing': ['error', 'never'],
      'object-curly-spacing': ['error', 'always'],
      'comma-dangle': ['error', 'never'],
      quotes: ['error', 'single', { allowTemplateLiterals: true }],
      semi: ['error', 'always'],
      indent: ['error', 2],
      'linebreak-style': 'off', // Disabled for cross-platform compatibility
      'eol-last': ['error', 'always'],
      'no-trailing-spaces': 'error',
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],

      // Import/export rules
      'sort-imports': [
        'error',
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single']
        }
      ]
    }
  },

  // Test files configuration
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        ...globals.node,
        ...globals.mocha,
        suite: 'readonly',
        test: 'readonly',
        setup: 'readonly',
        teardown: 'readonly'
      }
    },
    rules: {
      // Relax some rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'no-unused-expressions': 'off', // For chai assertions
      'prefer-const': 'off'
    }
  },

  // VS Code extension specific configuration
  {
    files: ['src/extension.ts', 'src/**/*.ts'],
    languageOptions: {
      globals: {
        // VS Code extension globals
        vscode: 'readonly',
        NodeJS: 'readonly'
      }
    },
    rules: {
      // VS Code extension specific rules - relaxed for proper imports
      'no-restricted-imports': 'off'
    }
  },

  // Configuration files
  {
    files: ['*.config.js', '*.config.ts', '.eslintrc.*'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      'no-undef': 'off'
    }
  },

  // Ignore patterns
  {
    ignores: [
      'out/**/*',
      'dist/**/*',
      'node_modules/**/*',
      '*.vsix',
      '.vscode-test/**/*',
      'coverage/**/*',
      '**/*.d.ts',
      'src.rar'
    ]
  }
];
