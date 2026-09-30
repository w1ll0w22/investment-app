# Investment App

Research, education and decision-support software for self-directed investors. See `docs/PRODUCT_CONTRACT.md`.

Current stage: **F01 — product and domain contracts.** No UI, providers, database or AI calls yet.

```
docs/
  PRODUCT_CONTRACT.md       target user, workflow, scope, exclusions, invariants, regulatory boundary
  INTELLIGENCE_DOCTRINE.md  what code vs models do, grounding, verification, uncertainty, evals
  DATA_PROVENANCE.md        source hierarchy, dates, missing/stale/conflicting data, restatements
  DOMAIN_CONTRACTS.md       one-row-per-object index of the contracts
  reports/                  stage completion reports
packages/schemas/           @investment-app/schemas: TypeScript + Zod domain contracts
  src/                      primitives, periods, identity, filings, financials, metrics,
                            market, evidence, claims, research, thesis, portfolio, providers
  examples/aapl.ts          illustrative AAPL instances of every contract (not canonical data)
  test/                     contract tests
```

## Commands

Requires Node 22+ and pnpm 10.

```
pnpm install
pnpm typecheck
pnpm test
```
