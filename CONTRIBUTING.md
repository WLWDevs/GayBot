# Contributing Guidelines

Thank you for considering contributing!

## How to Contribute

- Fork the repository
- Create a new branch for your feature or fix
- Submit a pull request with a clear description

## Code Quality Standards

Before opening a pull request, **you must run `npm run format`.** It runs our formatter (`prettier --write`), and CI checks formatting against your branch. PRs that don't pass it will not be merged.

```bash
npm install     # if you haven't yet
npm run format  # format the whole codebase
```

You should also run `npm run test` before pushing — it type-checks the whole codebase via `tsc --noEmit` and catches broken imports, misused generics, and other type errors.

In short, before every PR:

```bash
npm run format && npm run test
```

If both commands exit 0 locally, CI will be happy too.

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Issues

- Please use issues for bug reports, feature requests, and questions.

## Commit Messages

- Use clear, descriptive commit messages.

## License

By contributing, you agree your contributions will be licensed under the repository's license.
