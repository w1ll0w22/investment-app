# Investment App (Atlas)

Research, education and decision-support software for self-directed investors. See `docs/PRODUCT_CONTRACT.md`.

Current stage: **F02 — application and repository foundation.** There is a minimal Next.js app, but no database, SEC ingestion, market data, finance math or AI yet.

```
apps/
  web/                      @investment-app/web: Next.js (App Router) + React
    src/app/                routes: / (placeholder page), /api/health (JSON health check)
    src/env.schema.ts       declared environment variables, validated with Zod
    src/env.ts              server-only accessor for validated env
    .env.example            every variable with a safe placeholder
docs/
  PRODUCT_CONTRACT.md       target user, workflow, scope, exclusions, invariants, regulatory boundary
  INTELLIGENCE_DOCTRINE.md  what code vs models do, grounding, verification, uncertainty, evals
  DATA_PROVENANCE.md        source hierarchy, dates, missing/stale/conflicting data, restatements
  DOMAIN_CONTRACTS.md       one-row-per-object index of the contracts
  reports/                  stage completion reports
packages/
  schemas/                  @investment-app/schemas: framework-independent TypeScript + Zod domain contracts
scripts/
  check-boundaries.mjs      fails if packages/schemas gains framework, Node or workspace imports
.github/workflows/ci.yml    CI: install, boundary check, typecheck, test, production build
```

## Prerequisites

- Node.js 22 (see `.nvmrc`; `engines` requires >= 22.12)
- pnpm 10.33.0. The simplest way to get the pinned version is `corepack enable`, which reads `packageManager` in `package.json`.

## Setup

These commands work in any shell (macOS/Linux terminals, Windows PowerShell, Git Bash):

```
git clone https://github.com/w1ll0w22/investment-app.git
cd investment-app
corepack enable              # once per machine; provides the pinned pnpm (on Windows, may need an elevated terminal)
pnpm install --frozen-lockfile
pnpm dev                     # http://localhost:3000, health check at /api/health
```

Optional: create a local env file. Every variable has a default, so this is only needed to override one.

| Shell | Command (from the repository root) |
|---|---|
| macOS / Linux / Git Bash | `cp apps/web/.env.example apps/web/.env.local` |
| Windows PowerShell | `Copy-Item apps\web\.env.example apps\web\.env.local` |
| Windows Command Prompt | `copy apps\web\.env.example apps\web\.env.local` |

Then run `pnpm validate` to confirm your setup matches CI.

## Commands

Run from the repository root:

| Command | What it does |
|---|---|
| `pnpm dev` | Starts the web app in development mode |
| `pnpm check:boundaries` | Checks that `packages/schemas` depends only on `zod` and imports no framework or Node modules |
| `pnpm typecheck` | Typechecks every workspace package (the web app generates Next route types first) |
| `pnpm test` | Runs every package's tests (Vitest) |
| `pnpm build` | Production build of every package that has a build (currently the web app) |
| `pnpm validate` | Runs all four checks in the same order as CI |

CI (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main`. The main job, on Linux, does a frozen-lockfile install, then the boundary check, typecheck, test and build. A second job runs the boundary check on Windows, so path handling in repository scripts stays portable. A PR is mergeable only when CI is green.

## Environment variables

- Every variable the app reads is declared in `apps/web/src/env.schema.ts` and validated with Zod the first time it is used. An invalid value fails with a message naming the variable.
- Server code reads variables only through `getServerEnv()` in `apps/web/src/env.ts`. That module imports `server-only`, so importing it from a client component fails the build.
- Only variables prefixed `NEXT_PUBLIC_` reach the browser. Never put secrets in them.
- Real values go in `apps/web/.env.local`, which is git-ignored along with every other `.env*` file except `.env.example`.
- Adding a variable means updating `env.schema.ts` and `.env.example` together.

Current variables:

| Variable | Scope | Default | Purpose |
|---|---|---|---|
| `APP_ENV` | server | `development` | Deployment environment: `development`, `test`, `preview` or `production`. This is separate from `NODE_ENV`, which Next sets to `production` for every build. |

No secrets are required at this stage.

## Workspace rules

- `packages/schemas` is the shared financial language. It must stay framework-independent, and the boundary check enforces this in CI. Apps consume it as TypeScript source (`transpilePackages` in `apps/web/next.config.ts`).
- Relative imports inside workspace packages are written without file extensions, so any bundler (Next/Turbopack, Vitest) can resolve them.
