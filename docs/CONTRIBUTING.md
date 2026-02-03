# Contributing to Bria

Thank you for your interest in contributing to Bria! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect different viewpoints and experiences

## Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/Bria.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Set up the development environment (see README.md)
5. Make your changes
6. Test your changes
7. Commit with clear messages
8. Push to your fork: `git push origin feature/your-feature-name`
9. Create a Pull Request

## Coding Standards

### Python
- Follow PEP 8 style guide
- Use type hints where possible
- Write docstrings for functions and classes
- Keep functions focused and small
- Use async/await for I/O operations

### TypeScript/React
- Use TypeScript for type safety
- Follow React best practices
- Use functional components with hooks
- Keep components small and focused
- Use Material-UI components consistently

### Git Commit Messages
- Use clear, descriptive messages
- Start with a verb (Add, Fix, Update, Remove)
- Reference issues when applicable
- Keep the first line under 50 characters
- Add detailed description if needed

Example:
```
Fix: Resolve SQL injection vulnerability in user queries

- Use parameterized queries for all database operations
- Add input validation for user-provided data
- Update tests to verify security fixes

Fixes #123
```

## Testing

- Write tests for new features
- Ensure all tests pass before submitting PR
- Add integration tests for API endpoints
- Test error cases and edge cases

## Pull Request Process

1. Update documentation if needed
2. Add tests for new functionality
3. Ensure all tests pass
4. Update CHANGELOG.md if applicable
5. Request review from maintainers
6. Address review comments
7. Wait for approval before merging

## Security

- Never commit secrets or API keys
- Report security vulnerabilities privately
- Follow security best practices
- Review code for security implications

## Questions?

Open an issue or contact the maintainers for help.

