# Contributing

## Prerequisites

- Node.js, at the major version in [`.nvmrc`](.nvmrc).
- [pnpm](https://pnpm.io/installation), which switches to the version `package.json` pins.
- Desktop Chrome or Firefox. The app runs programs in a [WebContainer](https://webcontainers.io/), which Safari and mobile browsers don't support: there it falls back to a read-only editor that can still run the examples.

## Setup

```sh
pnpm install
```

`pnpm install` also installs the git hooks (see [Commits](#commits)).

## Development

```sh
pnpm run dev
```

Before starting Vite, `dev` prepares three things the app loads at runtime:

- `copy:esbuild-wasm` copies esbuild's wasm binary into `public/`, where the editor uses it to compile programs in the browser.
- `build:runtime` bundles the instrumented runtime that programs run under, together with its type declarations for the editor.
- `build:effect-types` extracts Effect's `.d.ts` files into `public/effect-types.json`, which gives the read-only editor real types.

WebContainer needs cross-origin isolation, so both the dev and preview servers send the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers (`vite.config.ts`, and `vercel.json` for the deployed app).

To try a production build:

```sh
pnpm run build
pnpm run preview
```

## Checks

CI runs `lint`, `typecheck`, `test` and `build` on every push and pull request.

| Script | What it does |
| --- | --- |
| `pnpm run lint` | ESLint, with Prettier as a rule |
| `pnpm run lint:fix` | ESLint with autofix |
| `pnpm run typecheck` | Type checks the app, the Node config, the demo recorder and the e2e tests, then runs the Effect language service diagnostics |
| `pnpm run test` | Vitest, in jsdom |
| `pnpm run test:watch` | Vitest in watch mode |

## End-to-end tests

```sh
pnpm run playwright:install   # once per machine
pnpm run e2e
```

The e2e tests run the real app in Chromium, and in WebKit as a phone, against a production build. They need network access. CI runs them on a production deployment, on pull requests labeled `e2e` or whose base is not `master`, and on manual runs. See [`e2e/README.md`](e2e/README.md).

## Demo recording

`pnpm run demo:record` records the README video. See [`scripts/demo/README.md`](scripts/demo/README.md).

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), with body lines of at most 100 characters, enforced by commitlint in a `commit-msg` hook. A `pre-commit` hook runs on staged files, through lint-staged: `eslint --fix`, the full `typecheck`, and `vitest related`.
