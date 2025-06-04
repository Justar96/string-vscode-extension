# Contributing to String VS Code Extension

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ 
- VS Code
- Git
- TypeScript knowledge

### Development Setup
1. **Fork and Clone**:
   ```bash
   git clone https://github.com/your-username/your-repo-name.git
   cd your-repo-name
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build**:
   ```bash
   npm run compile
   ```

4. **Run Tests**:
   ```bash
   npm test
   ```

5. **Start Development**:
   - Press `F5` in VS Code to launch Extension Development Host
   - Or run `npm run watch` for continuous compilation

## 📝 Development Guidelines

### Code Style
- Use TypeScript strict mode
- Follow existing code formatting (Prettier configuration included)
- Add JSDoc comments for public methods
- Use meaningful variable and function names
- Keep functions focused and small

### Project Structure
```
src/
├── extension.ts          # Main extension entry point
├── types/               # TypeScript type definitions
├── utils/               # Utility functions
├── providers/           # Tree data providers
├── services/            # Business logic services
└── test/                # Test files

out/                     # Compiled JavaScript (generated)
package.json            # Extension manifest
```

### Key Components
1. **TreeDataProvider**: Manages file selection UI
2. **WebhookServer**: Handles real-time notifications
3. **IndexingEngine**: Processes and submits files
4. **DashboardProvider**: Real-time status display

## 🛠️ Making Changes

### Types of Contributions
- 🐛 **Bug Fixes**: Fix issues in existing functionality
- ✨ **Features**: Add new capabilities
- 📚 **Documentation**: Improve docs and examples
- 🎨 **UI/UX**: Enhance user interface
- ⚡ **Performance**: Optimize code performance
- 🧪 **Tests**: Add or improve test coverage

### Branch Naming
- `feature/description` - New features
- `fix/issue-description` - Bug fixes
- `docs/update-description` - Documentation updates
- `refactor/component-name` - Code refactoring

### Commit Messages
Use conventional commits format:
```
type(scope): description

Examples:
feat(tree): add bulk file selection
fix(webhook): handle connection timeout
docs(readme): update configuration examples
```

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test -- --grep "TreeDataProvider"

# Run tests with coverage
npm run test:coverage
```

### Writing Tests
- Place tests in `src/test/` directory
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies

Example test structure:
```typescript
import * as assert from 'assert';
import { describe, it, beforeEach } from 'mocha';

describe('MyComponent', () => {
  beforeEach(() => {
    // Setup
  });

  it('should handle valid input correctly', () => {
    // Test implementation
  });

  it('should throw error for invalid input', () => {
    // Error case test
  });
});
```

## 📋 Pull Request Process

### Before Submitting
1. **Update Documentation**: Update README, CHANGELOG, or JSDoc as needed
2. **Run Tests**: Ensure all tests pass
3. **Check Linting**: Run `npm run lint`
4. **Test Extension**: Verify changes work in VS Code
5. **Update Version**: Bump version if needed

### PR Template
When creating a PR, include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement

## Testing
- [ ] Unit tests pass
- [ ] Manual testing completed
- [ ] Extension loads correctly

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
```

### Review Process
1. Maintainers will review PRs within 48 hours
2. Address feedback and update PR
3. Ensure CI checks pass
4. Maintainer will merge approved PRs

## 🐛 Bug Reports

### Before Reporting
1. Check existing issues
2. Update to latest version
3. Reproduce the issue
4. Gather relevant information

### Bug Report Template
```markdown
**Bug Description**
Clear description of the bug

**Steps to Reproduce**
1. Step 1
2. Step 2
3. Step 3

**Expected Behavior**
What should happen

**Actual Behavior**
What actually happens

**Environment**
- VS Code version:
- Extension version:
- OS:
- Server URL:

**Logs**
Include relevant console logs or error messages
```

## 💡 Feature Requests

### Proposing Features
1. Check if feature already exists
2. Open issue with detailed description
3. Discuss implementation approach
4. Wait for maintainer approval before coding

### Feature Request Template
```markdown
**Feature Description**
Clear description of the proposed feature

**Use Case**
Why is this feature needed?

**Proposed Solution**
How would you implement this?

**Alternatives Considered**
Other approaches you've considered

**Additional Context**
Screenshots, mockups, or examples
```

## 🏗️ Architecture Guidelines

### Adding New Settings
1. Add to `package.json` configuration
2. Add TypeScript interface
3. Update documentation
4. Add validation if needed

### Adding New Commands
1. Register in `package.json` contributes.commands
2. Implement command handler
3. Add to menu/toolbar if needed
4. Document usage

### Adding New Views
1. Define view in `package.json`
2. Create provider class
3. Register in extension activation
4. Style consistently with VS Code

### Webhook Integration
- Follow existing webhook patterns
- Handle errors gracefully
- Add proper logging
- Test with mock servers

## 📚 Documentation

### Types of Documentation
- **Code Comments**: Explain complex logic
- **JSDoc**: Document public APIs
- **README**: User-facing documentation
- **Developer Guide**: Setup and architecture
- **Changelog**: Track changes

### Documentation Standards
- Use clear, concise language
- Include code examples
- Keep documentation up-to-date
- Use proper markdown formatting

## 🔄 Release Process

### Version Numbers
Follow semantic versioning (semver):
- `MAJOR.MINOR.PATCH`
- Major: Breaking changes
- Minor: New features (backward compatible)
- Patch: Bug fixes

### Release Steps
1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag
4. Build extension package
5. Publish to marketplace
6. Create GitHub release

## 🤝 Community

### Getting Help
- Open GitHub issue for bugs/features
- Check existing documentation
- Review closed issues for solutions

### Code of Conduct
- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow GitHub community guidelines

## 📞 Contact

- **Issues**: Use GitHub Issues
- **Discussions**: Use GitHub Discussions
- **Security**: Email security issues privately

Thank you for contributing to the String VS Code Extension! 🎉 