# Contributing to rodo-spec

Thank you for your interest in contributing to `rodo-spec`! This document provides guidelines and instructions for setting up your local environment, understanding the repository architecture, and contributing changes.

---

## License

By contributing to `rodo-spec`, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).

---

## Workspace Architecture

`rodo-spec` is structured as a monorepo managed with `pnpm` workspaces. The codebase is organized into four core packages under `packages/`:

- **`packages/protocol` (`@rodo/protocol`)**: Wire contract defining the sync API schemas and card lifecycle statuses shared between the RODO CLI and board server implementations.
- **`packages/card-format` (`@rodo/card-format`)**: Core parsing, validation, serialization, secret scanning, and 3-way merge conflict resolution logic for RODO card files.
- **`packages/rodo-kit` (`@rodo/rodo-kit`)**: The RODO method kit, containing AI skill definitions, bilingual project templates (English and Persian), and kit manifests.
- **`packages/cli` (`rodo-spec`)**: The executable `rodo` CLI binary. It bundles `@rodo/protocol`, `@rodo/card-format`, and `yaml`, while copying `rodo-kit` assets directly into `dist/kit/`.

---

## Prerequisites

- **Node.js**: `>= 20.0.0`
- **Corepack**: Enabled to manage `pnpm`

---

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/rodo-spec.git
   cd rodo-spec
   ```

2. **Enable Corepack and install dependencies:**
   ```bash
   corepack enable
   pnpm install
   ```

3. **Build all packages:**
   ```bash
   pnpm build
   ```

---

## Quality Checks & Testing

Before submitting a pull request, ensure all tests, types, and builds pass cleanly across the monorepo:

- **Run unit and integration tests:**
  ```bash
  pnpm test
  ```

- **Run TypeScript type checking:**
  ```bash
  pnpm typecheck
  ```

- **Verify a production build:**
  ```bash
  pnpm build
  ```

---

## Packaging the CLI

To test or verify the standalone distribution tarball for the CLI binary:

```bash
cd packages/cli
npm pack
```

This creates an installable `.tgz` package containing the compiled binary, bundled dependencies, and the `dist/kit/` assets.

---

## Pull Request Guidelines

1. **Create a branch**: Use descriptive branch names (e.g., `feat/card-conflict-resolution` or `fix/protocol-status-enum`).
2. **Commit hygiene**: Keep commits focused and provide clear, descriptive commit messages.
3. **Keep documentation updated**: If adding or altering protocol types, card formats, or kit templates, update the corresponding documentation and typings.
4. **Test coverage**: Add automated tests for any bug fixes or new features in the relevant package.
