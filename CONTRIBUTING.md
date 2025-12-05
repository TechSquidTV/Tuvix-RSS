# Contributing to Tuvix

Thank you for your interest in contributing to Tuvix! We welcome contributions from the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)
- [Getting Help](#getting-help)

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to uphold this code. Please read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before contributing.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a branch** for your changes
4. **Make your changes** and test them
5. **Submit a pull request**

## Development Setup

### Prerequisites

- Node.js 20+ with pnpm
- SQLite3

### Quick Start

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/Tuvix-RSS.git
cd Tuvix-RSS

# Install dependencies
pnpm install

# Copy environment file
cp env.example .env

# Edit .env and set BETTER_AUTH_SECRET
# Generate with: openssl rand -base64 32

# Run database migrations
pnpm run db:migrate

# Start development servers
pnpm run dev
```

Visit:

- App: http://localhost:5173
- API: http://localhost:3001

### Project Structure

```
Tuvix-RSS/
├── packages/
│   ├── api/          # Backend (tRPC, Node.js/Cloudflare Workers)
│   └── app/          # Frontend (React, Vite)
├── docs/             # Documentation
└── .github/          # GitHub workflows and templates
```

See [Project Integration Guide](./docs/developer/project-integration.md) for detailed architecture.

## How to Contribute

### Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.yml) to report bugs. Include:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details

### Suggesting Features

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.yml) to suggest features. Include:

- Clear description of the feature
- Use case and benefits
- Possible implementation approach

### Asking Questions

Use the [Question template](.github/ISSUE_TEMPLATE/question.yml) for general questions or support.

## Coding Standards

### TypeScript

- Use TypeScript for all code
- Avoid `any` types - use proper typing
- Use interfaces for objects, types for unions
- Enable strict mode

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Lint code
pnpm run lint

# Format code
pnpm run format
```

### Best Practices

- **Keep it simple**: Don't over-engineer solutions
- **Type safety**: Leverage TypeScript's type system
- **Small PRs**: Break large changes into smaller, focused PRs
- **Test your changes**: Add tests for new features
- **Document**: Update docs for significant changes

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build process, dependencies, etc.

### Scopes

- `api`: Backend changes
- `app`: Frontend changes
- `db`: Database changes
- `docs`: Documentation
- `ci`: CI/CD changes

### Examples

```
feat(app): add dark mode toggle to settings
fix(api): resolve article polling rate limit issue
docs: update deployment guide for Cloudflare
chore(deps): update dependencies
```

## Pull Request Process

1. **Branch from `main`**: Always create your feature branch from `main`

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

2. **Make your changes**: Follow coding standards and add tests

3. **Test locally**: Ensure all tests pass

```bash
pnpm run test
pnpm run type-check
pnpm run lint
```

4. **Commit your changes**: Use conventional commit messages

5. **Push to your fork**:

```bash
git push origin feature/your-feature-name
```

6. **Open a Pull Request**: Target the `main` branch

7. **Fill out the PR template**: Provide clear description and context

8. **Wait for review**: Maintainers will review and may request changes

9. **Address feedback**: Make requested changes and push updates

10. **Merge**: Once approved, a maintainer will merge your PR

### PR Requirements

- Must target `main` branch
- All tests must pass
- No TypeScript errors
- Code follows style guidelines
- Documentation updated (if needed)
- Clear description of changes

## Testing

### Running Tests

```bash
# Run all tests
pnpm run test

# Run tests for specific package
pnpm --filter @tuvix/api test
pnpm --filter @tuvix/app test

# Run tests in watch mode
pnpm run test:watch
```

### Writing Tests

- Write tests for new features
- Update tests when modifying existing code
- Use descriptive test names
- Test edge cases and error conditions

## Documentation

### When to Update Docs

Update documentation when:

- Adding new features
- Changing API behavior
- Modifying configuration
- Adding new environment variables
- Changing deployment process

### Where to Document

- **README.md**: High-level project info, quick start
- **docs/**: Detailed guides and reference docs
- **Code comments**: Complex logic, non-obvious behavior
- **API docs**: tRPC procedures, types, endpoints

See [Documentation Standards](./docs/README.md#documentation-standards).

## Getting Help

- **Documentation**: Check [docs/](./docs/) for detailed guides
- **Issues**: Search existing issues or create a new one
- **Discussions**: Use GitHub Discussions for general questions
- **Discord**: Join our community Discord (link in README)

## Development Commands

```bash
# Development
pnpm dev              # Start both API and app
pnpm dev:api          # Start API only
pnpm dev:app          # Start app only

# Building
pnpm build            # Build both packages
pnpm build:api        # Build API only
pnpm build:app        # Build app only

# Testing
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode
pnpm type-check       # Check TypeScript types

# Code Quality
pnpm lint             # Lint code
pnpm format           # Format code

# Database
pnpm db:generate      # Generate migration from schema changes
pnpm db:migrate       # Run migrations
```

## License

By contributing to Tuvix, you agree that your contributions will be licensed under the AGPLv3 license. See [LICENSE](./LICENSE) for details.

---

Thank you for contributing to Tuvix! Your efforts help make RSS better for everyone.
