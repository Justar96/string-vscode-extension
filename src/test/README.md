# String Codebase Indexer Extension - Test Suite

This directory contains comprehensive tests for the String Codebase Indexer VS Code extension.

## 📁 Test Structure

```
src/test/
├── README.md                    # This file
├── extension.test.ts           # Main extension functionality tests
├── chunking.test.ts           # Chunking algorithm tests
├── treeDataProvider.test.ts   # Tree view data provider tests
├── runTest.ts                 # Test runner configuration
└── suite/
    └── index.ts              # Test suite discovery and execution
```

## 🧪 Test Categories

### 1. Main Extension Tests (`extension.test.ts`)
Comprehensive tests covering:
- **Utility Functions**: File language detection, file size formatting
- **Chunking Functionality**: Text splitting, size limits, edge cases
- **Configuration Management**: Settings validation, default values
- **File Processing**: Supported file types, exclusion patterns
- **Error Handling**: Network errors, validation failures
- **Status Management**: State tracking, UI updates
- **Tree Data Provider**: File tree construction, selection management
- **Integration Tests**: End-to-end workflows

### 2. Chunking Tests (`chunking.test.ts`)
Dedicated tests for text chunking logic:
- **Basic Chunking**: Size limits, line preservation
- **Edge Cases**: Unicode characters, very long lines, empty content
- **Chunk Validation**: Content validation, encoding issues
- **Performance Tests**: Large file handling, efficiency metrics
- **Hash Generation**: Consistency, uniqueness, format validation
- **Language Detection**: File extension mapping, edge cases

### 3. Tree Data Provider Tests (`treeDataProvider.test.ts`)
Tests for the file tree functionality:
- **Tree Construction**: Folder structure building, sorting
- **File Selection**: Individual and bulk selection operations
- **Folder Operations**: Nested folder selection, state management
- **Tree Item Creation**: Checkbox states, descriptions, context values
- **Node Navigation**: Path-based finding, parent-child relationships
- **Edge Cases**: Special characters, duplicate names, error handling

## 🚀 Running Tests

### Prerequisites
```bash
# Install dependencies
npm install

# Ensure TypeScript is compiled
npm run compile
```

### Run All Tests
```bash
# Using npm script (recommended)
npm test

# Or using VS Code Test Explorer
# 1. Open VS Code
# 2. Go to View > Test Explorer
# 3. Click "Run All Tests"
```

### Run Specific Test Files
```bash
# Run only extension tests
npm test -- --grep "String Codebase Indexer Extension Test Suite"

# Run only chunking tests
npm test -- --grep "Chunking Functionality Tests"

# Run only tree provider tests
npm test -- --grep "Tree Data Provider Tests"
```

### Debug Tests in VS Code
1. Set breakpoints in test files
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run `Test: Debug All Tests` or `Test: Debug Test at Cursor`

## 📊 Test Coverage Areas

### ✅ Covered Functionality
- [x] File scanning and filtering
- [x] Text chunking algorithms
- [x] Tree data structure management
- [x] File selection state management
- [x] Configuration validation
- [x] Language detection
- [x] Hash generation
- [x] Error handling scenarios
- [x] Unicode content support
- [x] Performance edge cases

### 🔄 Mock Components
The test suite includes comprehensive mocks for:
- **VS Code API**: Workspace, URI, TreeItem, Configuration
- **File System**: Temporary file creation and cleanup
- **Network Requests**: Simulated server responses
- **Configuration**: Extensible settings management

## 🎯 Test Principles

### 1. Comprehensive Coverage
Tests cover both happy path scenarios and edge cases:
- Normal operation flows
- Error conditions
- Boundary conditions
- Performance limits

### 2. Isolated Testing
Each test suite is independent:
- No shared state between tests
- Proper setup and teardown
- Mock external dependencies

### 3. Realistic Scenarios
Tests use realistic data:
- Real file structures
- Typical code content
- Common configuration scenarios
- Expected user workflows

### 4. Performance Awareness
Performance tests ensure:
- Large file handling efficiency
- Memory usage optimization
- Responsive user interactions
- Scalable operations

## 🔧 Test Configuration

### Test Environment
- **Framework**: Mocha with TDD interface
- **Assertions**: Node.js built-in `assert` module
- **Timeout**: 10 seconds for async operations
- **Reporter**: Spec reporter for detailed output

### Mock Strategy
- **Minimal Mocking**: Only mock external dependencies
- **Realistic Data**: Use representative test data
- **State Isolation**: Each test has independent state
- **Cleanup**: Proper resource cleanup after tests

## 📈 Adding New Tests

### Test File Structure
```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Feature Name Tests', () => {
  setup(() => {
    // Test setup
  });

  suite('Sub-feature Tests', () => {
    test('should do something specific', () => {
      // Test implementation
      assert.ok(condition, 'Description of what should be true');
    });

    test('should handle edge case', async () => {
      // Async test implementation
      const result = await someAsyncOperation();
      assert.strictEqual(result, expected, 'Description');
    });
  });

  teardown(() => {
    // Test cleanup
  });
});
```

### Best Practices
1. **Descriptive Names**: Use clear, descriptive test names
2. **Single Responsibility**: Each test should test one specific behavior
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Error Messages**: Provide meaningful assertion messages
5. **Async Handling**: Properly handle promises and async operations

## 🐛 Debugging Test Failures

### Common Issues
1. **Timeout Errors**: Increase timeout for slow operations
2. **Path Issues**: Check file path separators and resolution
3. **Mock Conflicts**: Ensure mocks don't interfere with each other
4. **Async Race Conditions**: Use proper async/await patterns

### Debugging Tools
- VS Code Test Explorer for visual debugging
- Console logs for tracing execution
- Breakpoints for step-by-step debugging
- Test isolation for identifying specific failures

## 📝 Test Maintenance

### Regular Updates
- Update tests when adding new features
- Maintain test data relevance
- Review and improve test coverage
- Optimize test performance

### Quality Checks
- All tests should pass consistently
- No flaky or intermittent failures
- Reasonable execution time
- Clear and maintainable test code

## 🤝 Contributing

When adding new functionality:
1. Write tests first (TDD approach when possible)
2. Ensure comprehensive coverage of new features
3. Include both positive and negative test cases
4. Update this README if adding new test categories
5. Follow existing test patterns and conventions

## 📋 Test Checklist

Before committing changes:
- [ ] All tests pass locally
- [ ] New features have corresponding tests
- [ ] Edge cases are covered
- [ ] Performance implications are tested
- [ ] Test documentation is updated
- [ ] No test code duplication
- [ ] Proper error handling is tested 