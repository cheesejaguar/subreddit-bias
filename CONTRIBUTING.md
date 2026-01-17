# Contributing to Subreddit Sentiment & Bias Signals Analyzer

First off, thank you for considering contributing to this project! It's people like you that make this tool better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Node.js](https://nodejs.org) >= 18
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/subreddit-bias.git
cd subreddit-bias
```

3. Add the upstream remote:

```bash
git remote add upstream https://github.com/ORIGINAL_OWNER/subreddit-bias.git
```

## Development Setup

### Install Dependencies

```bash
bun install
```

### Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

For local development, you can use the in-memory database and mock clients. For integration testing, you'll need:

- A Neon Postgres database
- An Upstash Redis instance
- An OpenRouter API key

### Running the Development Server

```bash
# Run all apps
bun dev

# Run specific app
bun run --filter public dev
bun run --filter admin dev
```

### Running Tests

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run specific package
bun test packages/core

# Run in watch mode
bun test --watch
```

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

When creating a bug report, include:

- **Clear title** describing the issue
- **Steps to reproduce** the behavior
- **Expected behavior** vs actual behavior
- **Environment details** (OS, Bun version, etc.)
- **Screenshots** if applicable
- **Error messages** or logs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md).

### Suggesting Enhancements

Enhancement suggestions are welcome! Please:

- Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md)
- Explain the use case clearly
- Consider if it aligns with project principles (objectivity, reproducibility, safety)

### Your First Code Contribution

Looking for a place to start? Check issues labeled:

- `good first issue` - Simple issues for newcomers
- `help wanted` - Issues where we need community help
- `documentation` - Documentation improvements

### Pull Requests

1. **Create a branch** from `main`:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

2. **Make your changes** following our style guidelines

3. **Write or update tests** for your changes

4. **Run the test suite** to ensure nothing is broken:

```bash
bun test
```

5. **Commit your changes** with a clear message:

```bash
git commit -m "feat: add support for custom frameworks"
```

6. **Push to your fork**:

```bash
git push origin feature/your-feature-name
```

7. **Open a Pull Request** using our PR template

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add yourself to CONTRIBUTORS.md (optional)
4. Request review from maintainers
5. Address any feedback
6. Squash commits if requested
7. Maintainer will merge when ready

### PR Title Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `style:` - Formatting, no code change
- `refactor:` - Code change that neither fixes a bug nor adds a feature
- `perf:` - Performance improvement
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:
- `feat: add baseline comparison for peer subreddits`
- `fix: correct Wilson score calculation for edge cases`
- `docs: update API reference for new endpoints`

## Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types for exported functions
- Avoid `any` - use `unknown` if type is truly unknown

```typescript
// Good
export function calculateScore(input: ScoringInput): ScoringResult {
  // ...
}

// Avoid
export function calculateScore(input: any) {
  // ...
}
```

### Code Formatting

We use consistent formatting. Before committing:

```bash
# Format code (if configured)
bun run format

# Check linting (if configured)
bun run lint
```

### File Organization

```
packages/
  core/
    src/
      feature.ts        # Implementation
      feature.test.ts   # Tests alongside implementation
      index.ts          # Public exports
```

### Naming Conventions

- **Files**: `kebab-case.ts` or `camelCase.ts`
- **Components**: `PascalCase.tsx`
- **Functions**: `camelCase`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`

### Comments

- Write self-documenting code when possible
- Add comments for non-obvious logic
- Use JSDoc for public APIs:

```typescript
/**
 * Calculate Wilson score confidence interval for a proportion
 * @param successes - Number of successes
 * @param total - Total sample size
 * @param confidence - Confidence level (default 0.95)
 * @returns Lower and upper bounds of the interval
 */
export function wilsonScoreInterval(
  successes: number,
  total: number,
  confidence?: number
): { lower: number; upper: number } {
  // ...
}
```

## Testing

### Test Requirements

- All new features must have tests
- Bug fixes should include regression tests
- Aim for high coverage (80%+)

### Test Structure

```typescript
import { describe, test, expect } from 'bun:test';

describe('featureName', () => {
  describe('specificBehavior', () => {
    test('does something expected', () => {
      // Arrange
      const input = createTestInput();

      // Act
      const result = featureFunction(input);

      // Assert
      expect(result).toEqual(expected);
    });

    test('handles edge case', () => {
      // ...
    });
  });
});
```

### Test Categories

1. **Unit tests** - Test individual functions
2. **Integration tests** - Test component interactions
3. **Mock tests** - Use mock clients for external services

## Documentation

### When to Update Docs

- Adding new features
- Changing APIs
- Fixing confusing behavior
- Adding configuration options

### Documentation Files

- `README.md` - Project overview and quick start
- `CONTRIBUTING.md` - This file
- `docs/` - Detailed documentation (if needed)
- Code comments and JSDoc

## Project Structure

Understanding the codebase:

```
packages/
├── core/           # Core business logic
│   ├── sampling    # Deterministic sampling
│   ├── heuristics  # Stage A classification
│   ├── scoring     # Result normalization
│   ├── aggregation # Statistical aggregation
│   ├── reddit      # Reddit API client
│   ├── pipeline    # Job execution
│   ├── baseline    # Comparison analysis
│   └── budget      # Cost enforcement
├── db/             # Data layer
│   ├── types       # Type definitions
│   ├── schema      # SQL schema
│   ├── client      # In-memory client
│   ├── neon        # Neon Postgres client
│   └── redis       # Upstash Redis client
└── llm/            # LLM integration
    ├── client      # OpenRouter client
    ├── prompts     # Prompt templates
    └── batching    # Request batching
```

## Ethical Guidelines

When contributing, please consider:

1. **Privacy**: Don't add features that enable individual targeting
2. **Accuracy**: Ensure statistical methods are sound
3. **Transparency**: Document methodology clearly
4. **Safety**: Include appropriate disclaimers

## Community

### Getting Help

- **GitHub Discussions** - For questions and ideas
- **GitHub Issues** - For bugs and feature requests

### Recognition

Contributors are recognized in:
- `CONTRIBUTORS.md`
- Release notes
- README acknowledgments

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! 🎉
