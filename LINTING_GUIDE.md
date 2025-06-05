# 🔍 ESLint Configuration Guide

This project uses **ESLint v9** with the new flat configuration format for
comprehensive code quality and consistency checks.

## 📋 Overview

The linting setup includes:

- **ESLint v9** with flat config (`eslint.config.js`)
- **TypeScript ESLint** for TypeScript-specific rules
- **Prettier** integration for code formatting
- **VS Code** integration for real-time linting
- **Test-specific** configurations for test files

## 🚀 Quick Start

### Install Dependencies

```bash
npm install
```

### Run Linting

```bash
# Lint and auto-fix issues
npm run lint

# Lint without fixing (check-only)
npm run lint:check

# Lint specific files
npx eslint src/extension.ts --fix
```

## 📁 Configuration Files

### `eslint.config.js`

Modern flat configuration supporting:

- **TypeScript files** (`.ts`, `.tsx`)
- **Test files** with relaxed rules
- **VS Code extension** specific globals
- **Performance optimized** rules

### `.eslintignore`

Excludes unnecessary files:

- Build outputs (`out/`, `dist/`)
- Dependencies (`node_modules/`)
- Test artifacts (`.vscode-test/`)
- Coverage reports

### `.prettierrc`

Code formatting rules:

- Single quotes
- Semicolons required
- 2-space indentation
- 100 character line width

### `.vscode/settings.json`

VS Code integration:

- Real-time linting
- Auto-fix on save
- Format on save
- TypeScript integration

## 🎯 Linting Rules

### TypeScript Rules

- ✅ **No unused variables** (with underscore prefix exceptions)
- ⚠️ **No explicit `any`** (warning)
- ❌ **No `var` statements** (use `const`/`let`)
- ✅ **Prefer const** when possible
- ❌ **No `require()`** in TypeScript (use ES6 imports)

### Code Quality Rules

- ✅ **Consistent quotes** (single quotes)
- ✅ **Semicolons required**
- ✅ **Consistent indentation** (2 spaces)
- ✅ **No trailing spaces**
- ✅ **Object shorthand** syntax
- ✅ **Template literals** preferred

### VS Code Extension Rules

- ✅ **Proper vscode imports** (`import * as vscode`)
- ✅ **Extension-specific globals** recognized
- ❌ **No console.log in production** (allowed in development)

### Test File Rules (Relaxed)

- ✅ **Allow `any` type** in tests
- ✅ **Allow non-null assertions** for test data
- ✅ **Mocha globals** recognized (`suite`, `test`, `setup`)

## 🔧 NPM Scripts

```json
{
  "lint": "eslint src --fix", // Lint and auto-fix
  "lint:check": "eslint src", // Check without fixing
  "test:unit": "mocha out/test/**/*.test.js", // Run unit tests
  "test:coverage": "nyc npm run test:unit", // Coverage report
  "test:watch": "npm run test:unit -- --watch" // Watch mode
}
```

## 🛠️ VS Code Integration

### Required Extensions

- **ESLint** (`dbaeumer.vscode-eslint`)
- **Prettier** (`esbenp.prettier-vscode`)
- **TypeScript** (built-in)

### Features

- **Real-time linting** with squiggly underlines
- **Auto-fix on save** for fixable issues
- **Format on save** with Prettier
- **Organize imports** automatically
- **Error highlighting** in Problems panel

## 🚨 Common Issues & Solutions

### Issue: "Couldn't find an eslint.config.js file"

**Solution**: Ensure you have the modern `eslint.config.js` (not `.eslintrc.*`)

### Issue: TypeScript parsing errors

**Solution**: Verify `tsconfig.json` exists and is properly configured

### Issue: VS Code not showing lint errors

**Solution**:

1. Install ESLint extension
2. Enable flat config in settings: `"eslint.experimental.useFlatConfig": true`
3. Restart VS Code

### Issue: Conflicting Prettier/ESLint rules

**Solution**: Rules are designed to work together. If conflicts occur:

1. Check `.prettierrc` configuration
2. Verify ESLint formatting rules alignment

## 📊 Pre-commit Workflow

The linting is integrated into the build process:

1. **`npm run pretest`** runs linting before tests
2. **VS Code saves** trigger auto-fix
3. **Build process** (`npm run compile`) includes linting
4. **CI/CD** should include lint checks

## 🎨 Customization

### Adding New Rules

Edit `eslint.config.js`:

```javascript
rules: {
  'your-new-rule': 'error'
}
```

### File-specific Overrides

```javascript
{
  files: ['src/specific-file.ts'],
  rules: {
    'some-rule': 'off'
  }
}
```

### Ignoring Files

Add to `.eslintignore` or use inline comments:

```typescript
/* eslint-disable-next-line rule-name */
const problematicCode = something;
```

## 📈 Performance

The configuration is optimized for:

- **Fast linting** with targeted file patterns
- **Incremental updates** in VS Code
- **Minimal memory usage** with appropriate ignores
- **Parallel processing** where possible

## 🔍 Debugging

### Verbose Linting

```bash
npx eslint src --debug
```

### Check Configuration

```bash
npx eslint --print-config src/extension.ts
```

### Validate Config File

```bash
npx eslint --validate-config
```

## 📚 Resources

- [ESLint v9 Migration Guide](https://eslint.org/docs/latest/use/configure/migration-guide)
- [TypeScript ESLint Rules](https://typescript-eslint.io/rules/)
- [Prettier Configuration](https://prettier.io/docs/en/configuration.html)
- [VS Code ESLint Extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

---

✨ **Happy Linting!** Your code quality is now automatically maintained with
industry best practices.
