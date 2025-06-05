# ESLint v9 Configuration Setup Guide

This document outlines the ESLint v9 configuration setup and fixes applied to
the String VS Code Extension project.

## Summary of Changes

### 1. Configuration Issues Resolved

#### Primary Issue

- **Problem**: `@typescript-eslint/prefer-const` rule doesn't exist in
  TypeScript ESLint v8+
- **Solution**: Removed the non-existent rule and used the built-in ESLint
  `prefer-const` rule instead

#### Package.json Updates

- Added `"type": "module"` to package.json for proper ES module support
- Updated dependencies to compatible versions:
  - `@typescript-eslint/eslint-plugin: ^8.31.1`
  - `@typescript-eslint/parser: ^8.31.1`
  - `eslint: ^9.28.0`

### 2. ESLint Configuration (eslint.config.js)

#### Modern Flat Config Structure

```javascript
export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      // Updated rules configuration
    }
  }
];
```

#### Key Rule Changes

- **Removed**: `'@typescript-eslint/prefer-const': 'error'` (non-existent)
- **Added**: `'prefer-const': 'error'` (built-in ESLint rule)
- **Disabled**: `'linebreak-style': 'off'` for cross-platform compatibility
- **Relaxed**: `'no-restricted-imports': 'off'` for VS Code extension imports

#### Global Definitions

- Added `NodeJS: 'readonly'` to globals for Node.js types
- Added `vscode: 'readonly'` for VS Code extension development

### 3. TypeScript Configuration

#### tsconfig.json Updates

```json
{
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out"]
}
```

- **Removed**: `"**/*.test.ts"` from exclude to allow linting test files
- **Simplified**: Exclude patterns for better test file inclusion

### 4. File Cleanup

#### Removed Deprecated Files

- Deleted `.eslintignore` (replaced with `ignores` in flat config)

#### Code Quality Fixes

- Fixed unused variable warnings by prefixing with underscores
- Updated import statements for better organization
- Resolved type issues (`Thenable` → `Promise`)

### 5. VS Code Extension Specific Rules

#### Test File Configuration

```javascript
{
  files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-unused-expressions': 'off'
  }
}
```

#### Ignore Patterns

```javascript
{
  ignores: [
    'out/**/*',
    'dist/**/*',
    'node_modules/**/*',
    '*.vsix',
    '.vscode-test/**/*',
    'coverage/**/*',
    '**/*.d.ts'
  ];
}
```

## Results

### Before Fix

- ❌ ESLint failed with configuration errors
- ❌ `@typescript-eslint/prefer-const` rule not found
- ❌ 4900+ line ending errors (CRLF vs LF)

### After Fix

- ✅ ESLint v9 running successfully
- ✅ Cross-platform compatibility (Windows/Unix)
- ✅ Reduced to ~57 actionable issues (mostly warnings)
- ✅ Auto-fix working properly
- ✅ Test files included in linting

## Running Linting

```bash
# Check for issues
npm run lint:check

# Auto-fix issues
npm run lint

# Run tests with linting
npm run pretest
```

## Remaining Improvements

The following are minor improvements that can be addressed as needed:

1. **Type Safety**: Replace remaining `any` types with specific interfaces
2. **Test Files**: Remove `require()` statements in favor of ES6 imports
3. **Code Quality**: Address unused variables in test files
4. **Non-null Assertions**: Replace `!` operators with safer alternatives

## Best Practices Applied

1. **Modern ESLint**: Using flat config format (eslint.config.js)
2. **Cross-platform**: Disabled line-ending rules for Windows/Unix compatibility
3. **Incremental**: Fixed critical errors first, warnings can be addressed
   iteratively
4. **Type Safety**: Maintained TypeScript strict mode compliance
5. **Extensibility**: Configuration supports both main code and test files

This setup provides a solid foundation for maintaining code quality while being
practical for development across different operating systems.
