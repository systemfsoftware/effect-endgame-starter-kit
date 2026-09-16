# Contributing

Contributions are welcome. Follow these instructions to set up the development environment, run tests, and open pull requests.

## Prerequisites

- [Node.js](https://nodejs.org/) `>=24`
- [pnpm](https://pnpm.io/) `>=12.4.2` (the `packageManager` field pins the exact version; Corepack resolves it)

## Setup

Clone the repository and install dependencies:

```bash
git clone <your-repo-url>
cd <your-repo>
pnpm install
```

## Workflows and Commands

The project uses [Turbo](https://turbo.build/) to orchestrate tasks across workspaces:

```bash
# Build all packages
pnpm build

# Run unit and integration tests
pnpm test

# Typecheck workspace packages
pnpm typecheck

# Check code formatting with dprint
pnpm format:check

# Format files with dprint
pnpm format

# Run linter across packages
pnpm lint

# Run all CI gates locally
pnpm check:ci
```

## Pull Requests & Commits

- We follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(cli): ...`, `fix(core): ...`).
- Ensure all CI gates (`pnpm check:ci`) pass locally before opening a pull request.
