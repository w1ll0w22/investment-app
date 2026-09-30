# F01 Completion Report — Product & Domain Contracts

Prepared for: Max (project owner) and the lead (product architecture / quality gates)
Prepared by: principal implementation engineer (Claude)
Date: 2026-09-30
Recommendation: **READY FOR LEAD REVIEW** (see §8). I do not have authority to mark F01 PASS.

This report is self-contained. It quotes the essential contract excerpts so it can be reviewed without the repository. Full sources are listed in §2.

---

## 0. Decisions needed from Max / the lead

None block F01. The items below are choices I made where the spec left room or where I refined it; each is reversible and explained in §3–§4. Please confirm or overrule:

1. **Repository.** No "Investment App" GitHub repository exists (visible repos: amazen-operations, maxwellcooper-landingpage, Meridian_Project, Meridian-Intelligence; I did not open or modify any of them). F01 was built as a local git repo and copied to the project's shared files. To get a pull request, create an empty GitHub repo (e.g. `w1ll0w22/investment-app`) and I will push the existing commit and open a PR.
2. **Numbers as decimal strings** rather than JS numbers (§3.1, §4.1).
3. **Verification enum split into two axes**: status × freshness (§3.6, §4.2).
4. **Thesis contradictory evidence** may be satisfied by a recorded search that found none (§3.8, §4.3).
5. **Identity has three levels**: Issuer → Security → Listing (§3.2, §4.4).
6. **Default meaning of an unqualified "revenue growth"** = annual year-over-year on the latest fiscal year (§3.4). Every stored value still carries its explicit basis.

---

## 1. F01 Execution Summary

- Inspected the environment: empty workspace, empty shared folder, no project repository, no prior code. Node 22, pnpm 10 available; npm registry reachable.
- Determined there is **no blocking/material challenge** to the F01 spec or the proposed architecture (TypeScript modular monolith, Next.js/React/PostgreSQL later). I made several refinements the spec explicitly invited (verification semantics, taxonomy) and a few engineering decisions with financial-semantics impact that I am surfacing for confirmation (§0).
- Created a minimal pnpm monorepo containing **only** `packages/schemas` (no web app, no database, no providers, no AI calls, no finance engine).
- Wrote TypeScript domain contracts with **Zod runtime validation** for every required object, plus a metric-definition catalog (specifications only, no computation), a provider port interface, and two small semantic helpers (`resolveCurrentFact` for supersession, `describeMetric` for unambiguous labels).
- Wrote illustrative AAPL instances of every contract.
- Wrote 63 contract tests covering every representative test the spec listed, plus AI-boundary and data-integrity checks. All pass; strict typecheck is clean.
- Wrote the three required docs plus a one-row-per-object contract index.

## 2. Files Created / Changed

Everything is new. Local repo: `/home/claude/investment-app` (commit `dd4f34e`, branch `main`). Copied to project files at `/mnt/project-files/investment-app/` with a git bundle `investment-app.bundle` that preserves history.

```
.gitignore
README.md
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
tsconfig.base.json
docs/PRODUCT_CONTRACT.md
docs/INTELLIGENCE_DOCTRINE.md
docs/DATA_PROVENANCE.md
docs/DOMAIN_CONTRACTS.md
docs/reports/F01_COMPLETION_REPORT.md        (this file)
packages/schemas/package.json                 (@investment-app/schemas; deps: zod 4.6.5; dev: typescript 7.0.2, vitest 5.0.3)
packages/schemas/tsconfig.json
packages/schemas/src/index.ts
packages/schemas/src/primitives.ts            IDs, Decimal, Money, MoneyPerShare, ShareCount, Ratio, Count, Quantity,
                                              CalendarDate, Timestamp, MaybeKnown/UnknownReason, EvidenceStrength,
                                              QualitativeLevel, Producer, compareDecimal
packages/schemas/src/periods.ts               DurationPeriod, InstantPeriod, FinancialPeriod, FiscalLabel
packages/schemas/src/identity.ts              Issuer, Security, Listing, SecurityResolution
packages/schemas/src/filings.ts               Filing, FormType
packages/schemas/src/financials.ts            FinancialConceptId + FINANCIAL_CONCEPTS catalog, FinancialFact,
                                              ReportingScope, FactOrigin, SupersessionReason, factKey, resolveCurrentFact
packages/schemas/src/metrics.ts               MetricBasis, MetricId + METRIC_DEFINITIONS catalog, DerivedMetricValue,
                                              MetricInputRef, describeMetric
packages/schemas/src/market.ts                Quote, PriceBar, PriceAdjustment, CorporateAction
packages/schemas/src/evidence.ts              AuthorityTier, EvidenceSourceType, Evidence, EvidenceLocator,
                                              EvidenceReference, EvidenceRelation, EvidenceFreshness, EvidenceAssessment
packages/schemas/src/claims.ts                ClaimType, ClaimVerificationStatus, ClaimVerification, Claim, checkClaimEvidence
packages/schemas/src/research.ts              ResearchBrief, ResearchSection, REQUIRED_SECTIONS
packages/schemas/src/thesis.ts                InvestmentThesis, Assumption, Risk, InvalidationCondition,
                                              MeasurableCondition, DecisionRecord, ThesisReview
packages/schemas/src/portfolio.ts             Portfolio, Position, TaxLot, Watchlist, WatchlistItem
packages/schemas/src/providers.ts             MarketDataProvider interface, ProviderResult
packages/schemas/examples/aapl.ts             illustrative AAPL fixtures
packages/schemas/test/contracts.test.ts       63 contract tests
```

Taxonomy deviation from the suggested `security.ts / financials.ts / market.ts / evidence.ts / research.ts / thesis.ts / portfolio.ts`: I split `primitives`, `periods`, `filings`, `metrics`, `claims`, `providers` into their own files and named `security.ts` as `identity.ts` (it holds three identity levels). Not material: same concepts, finer files, one package.

## 3. Key Domain Decisions

### 3.1 Numeric representation

- Canonical numbers are **decimal strings**: `"391035000000"`, `"0.0202"`. Never JS `number`.
- **Ratios are decimal fractions: `0.2` = 20%.** I agree with the proposed convention. There is no "percent" unit anywhere in the model; percent is formatting.
- Every quantity is tagged with `kind` so units are never inferred from context.

```ts
export const Decimal = z.string().regex(/^-?(0|[1-9]\d*)(\.\d+)?$/) /* + no negative zero */ .brand<"Decimal">();
export const Money         = z.object({ kind: z.literal("money"),           amount: Decimal, currency: CurrencyCode }).strict();
export const MoneyPerShare = z.object({ kind: z.literal("money_per_share"), amount: Decimal, currency: CurrencyCode }).strict();
export const ShareCount    = z.object({ kind: z.literal("shares"),          amount: NonNegativeDecimal }).strict();
export const Ratio         = z.object({ kind: z.literal("ratio"),           value: Decimal }).strict();   // 0.2 == 20%, "30" == 30x
```

Money is in whole currency units; scale ("in millions") is never stored. XBRL reported precision is preserved separately (`reportedDecimals`, e.g. −6).

### 3.2 Identity: Issuer → Security → Listing

- **Issuer** (Apple Inc., CIK 0000320193): legal entity; financial facts attach here.
- **Security** (Apple common stock): instrument; EPS, share counts, corporate actions, positions attach here. One issuer can have several (GOOGL/GOOG).
- **Listing** (AAPL on XNAS, USD, America/New_York, validity window): quotes and bars attach here. Tickers change and get reused, so a ticker is never an identity key.

### 3.3 Financial periods

```ts
DurationPeriod = { kind: "duration", start: CalendarDate, end: CalendarDate, fiscalYear: int,
                   fiscalLabel: "Q1"|"Q2"|"Q3"|"Q4"|"H1"|"H2"|"YTD6"|"YTD9"|"FY"|"TTM" }
InstantPeriod  = { kind: "instant", date: CalendarDate, fiscalYear?, fiscalLabel?: "Q1".."Q4"|"FY" }
```

- Flow concepts are durations, balance-sheet concepts instants; the concept catalog fixes which and facts that mismatch are rejected.
- Label/length consistency is validated (a quarter is 80–105 days, FY/TTM 357–378, YTD6 175–190, YTD9 265–280), so 10-Q year-to-date cash-flow figures cannot be mislabelled as a discrete quarter.
- Fiscal labels are the issuer's own (Apple FY2024 = 2023-10-01 to 2024-09-28).
- Q4 and TTM are derived by finance-math (`origin: derived_arithmetic` with input fact IDs), never assumed to be filed.

### 3.4 Derived metrics and "what does revenue growth mean?"

Every metric value carries an explicit basis, and the schema checks the periods against it:

```ts
MetricBasis =
  | { type: "single_period", granularity: "quarter"|"fiscal_year"|"ttm" }
  | { type: "growth", comparison: "year_over_year"|"sequential", granularity: "quarter"|"fiscal_year"|"ttm" }
  | { type: "cagr", years: 2..30, granularity: "fiscal_year"|"ttm" }
  | { type: "instant" }
  | { type: "valuation", priceTime: Timestamp, fundamentalGranularity: "ttm"|"fiscal_year" }
  | { type: "return_series", windowStart, windowEnd, frequency, annualized, priceAdjustment, benchmarkListingId? }
```

Enforced: YoY compares the same fiscal label one fiscal year earlier; sequential is quarter-only and compares the immediately preceding quarter (including Q4→Q1 across years); annual granularity requires FY periods; CAGR base is N years earlier. Result must be the definition's output kind (ratio for growth). Producer must be the deterministic engine. `describeMetric` renders e.g. **"Revenue growth, FY2024 vs FY2023, annual year-over-year"**.

`revenue_growth` v1 = `revenue[current] / revenue[prior] − 1`; **unknown (`undefined_result`) when prior ≤ 0**. I deliberately rejected the common `(cur − prior)/|prior|` convention because it produces misleading "growth" from losses. The same rule applies to EPS and FCF growth, and P/E with negative EPS is "n/m", not a negative multiple.

The catalog (`METRIC_DEFINITIONS`) specifies formula, inputs, output kind and undefined conditions for 21 V0 metrics (growth ×3, CAGR, FCF, 4 margins, ROE, ROIC, total/net debt, market cap, P/E, P/S, EV/EBITDA, FCF yield, volatility, beta, max drawdown). These are specifications for F06; nothing computes them yet. Conventions that are genuinely debatable (ROIC definition, total debt excluding operating leases, average vs ending equity for ROE) are stated explicitly so they can be changed deliberately with a version bump.

Unqualified "revenue growth" in product copy means annual YoY on the latest fiscal year (confirm, §0.6).

### 3.5 Unknown is not zero

```ts
MaybeKnown<T> = { status: "known", value: T }
              | { status: "unknown", reason: UnknownReason, detail?: string }
UnknownReason = not_reported | not_applicable | not_yet_available | not_retrieved | source_unavailable
              | insufficient_inputs | undefined_result | conflicting_sources | withheld
```

No nullable shortcut exists, so every consumer must branch. **Missing EPS** is a `FinancialFact` for `eps_diluted` with `value: {status:"unknown", reason:"not_reported"}` linked to the filing that was checked. Unknown cost basis in a position stays unknown. `not_applicable` (gross margin for a bank) is distinguished from missing.

### 3.6 Evidence, claims and verification

Evidence is immutable, append-only, and carries: source type, authority tier, publisher, URI, `publishedAt`, `filedOn`, `filingId`, **`retrievedAt` (required)**, period, subjects, locator (document section, text span, XBRL concept + context + unit, market record), verbatim excerpt, **SHA-256 of retrieved content**, which facts/metrics it backs, and `supersedes` + reason.

Authority tiers (highest first): `regulatory_primary` > `issuer_primary` > `market_data_licensed` > `secondary_reputable` > `secondary_unverified` > `internal_derived` > `user_provided`. Each source type has a default tier that adapters may downgrade but not upgrade. **LLM output is rejected as evidence.**

Claims are typed: `quantitative_fact`, `qualitative_fact`, `interpretation`, `forward_looking`; materiality `material`/`supporting`. Verification has two orthogonal axes (my normalization of the proposed enum):

| Status | Rule enforced |
|---|---|
| `unverified` | default |
| `verified` | fact claims only; ≥1 supporting ref; 0 contradicting; method is `deterministic_match` or `human_review` (**an LLM verifier cannot verify**); strength `strong`; freshness not `superseded`; cross-record: at least one supporting ref is primary evidence (`checkClaimEvidence`) |
| `supported` | ≥1 supporting, 0 contradicting |
| `conflicting` | ≥1 supporting and ≥1 contradicting; strength `mixed` |
| `contradicted` | ≥1 contradicting |
| `insufficient_evidence` | may have no evidence; strength not `strong` |

Freshness: `current | stale | superseded | unknown`, computed per use by `EvidenceAssessment` under a named, versioned policy (e.g. `latest_fiscal_year@1`), not stored on evidence.

Quantitative claims must reference the canonical fact/metric they state; the displayed number is rendered from that record, not from model text.

Uncertainty is qualitative: `EvidenceStrength = strong | mixed | limited | none`, `QualitativeLevel = low | medium | high | unknown`. There is no numeric confidence field anywhere.

### 3.7 Research brief

Sections: business_overview, financial_summary, recent_developments, valuation_context, supporting_evidence, contradicting_evidence, risks, catalysts, open_questions. **Required**: business_overview, financial_summary, supporting_evidence, **contradicting_evidence, risks**. An empty section must state why. The schema is `.strict()` and has **no rating, recommendation or price-target field**; `framing` is the literal `"research_and_education_not_advice"`. A brief can be `verification_complete` only when no material claim is `unverified`. The brief records `dataAsOf` (cutoff), `evidenceConsulted`, and `limitations`.

### 3.8 Investment thesis and memory

The thesis belongs to the user (`stance` is the user's view, never assigned by the product). It is revisioned (`id` + `revision`); decisions and reviews reference the exact revision. A non-draft thesis must have: ≥1 supporting evidence ref (relation `supports`), ≥1 assumption, ≥1 risk, ≥1 invalidation condition, a recorded `contradictionSearch`, and either ≥1 contradictory evidence ref (relation `contradicts`) or a search result of `none_found`. Assumptions and invalidation conditions can be measurable (`metricId`, basis description, comparator, threshold, evaluate-by date) so a later review is deterministic. `DecisionRecord` actions are user-recorded (`recorded_buy`, etc.), never executed. `ThesisReview` separates "was the reasoning right" from "did the price go up".

### 3.9 Corrections and restatements

Facts are immutable. A change is a new fact with `supersedes` + `supersessionReason` (`amendment | restatement | recast | ingestion_correction`). The current value is computed, bitemporally:

```ts
resolveCurrentFact(facts, asOf?, axis: "knowable" | "recorded" = "knowable")
  → { kind: "current", fact } | { kind: "conflict", facts } | { kind: "none" }
```

- `knowable` uses `knownSince` (filing acceptance time): what the public record said at T. Used for backtests and thesis reviews.
- `recorded` uses `recordedAt`: what our system held at T. Used for audit.
- Two current facts for one slot return `conflict`; the system never silently picks.

### 3.10 Calculation ownership / AI boundaries

`Producer` is a discriminated union: `source_adapter | deterministic_engine | llm | user`. Schemas reject: LLM- or user-produced facts, non-engine metric values, LLM evidence, LLM-verified "verified" claims, unknown fields on research briefs. Sign conventions are canonical (capex, dividends, buybacks stored as positive outflows; FCF = OCF − capex).

### 3.11 Portfolio and watchlist

Positions store only user-provided facts (quantity, cost basis `MaybeKnown`, lots, account label, linked thesis). Market value, weights, P&L and concentration are derived at read time and never stored, so they cannot drift from prices. One position per security/account; one cash balance per currency; one watchlist entry per security.

### 3.12 Provider port

`MarketDataProvider { searchSecurities, getQuote, getHistoricalPrices, getCorporateActions }` returns canonical types wrapped in `ProviderResult` (explicit error codes; failures are never empty success). Interface only; no vendor integrated.

### 3.13 Runtime validation: why Zod

The spec asked me to justify it. Contracts here are consumed at trust boundaries (vendor payloads, XBRL, LLM structured output, database rows), where static types alone guarantee nothing. Zod gives one definition for both the TypeScript type and the runtime check, supports the cross-field refinements this domain needs (period/basis consistency, verification rules), and can emit JSON Schema for LLM structured-output constraints later. It has a single dependency footprint and no build step.

## 4. Engineering Challenges

**No blocking or material challenge to the F01 specification or the proposed architecture.** The following are refinements, each implemented because the spec invited it or because it is the safer financial interpretation. All are easy to reverse if overruled.

### 4.1 Decimal strings instead of JS numbers (financial-semantics refinement)
- **Specified:** ratios as `0.20`; representation otherwise unspecified.
- **Concern:** JS numbers are binary floats. They cannot represent many decimal amounts exactly, lose integer precision above 2^53 (share counts × prices, aggregates), and drop reported precision.
- **Alternative (implemented):** decimal strings with `kind` tags; ratio semantics unchanged (`"0.2"` = 20%).
- **Advantages:** exactness; lossless round-trip from XBRL and to PostgreSQL `NUMERIC`; impossible to mix units silently.
- **Tradeoffs:** less ergonomic; finance-math (F06) must use a decimal library; UI must format.
- **Scope impact:** none now; shapes F02 (use `NUMERIC`) and F06 (decimal library).
- **Recommendation:** keep.

### 4.2 Verification enumeration normalized into status × freshness
- **Specified:** VERIFIED, SUPPORTED, CONFLICTING, INSUFFICIENT_EVIDENCE, STALE, UNSUPPORTED (with an explicit invitation to improve).
- **Concern:** STALE is a different axis (time) from the others (support), so a claim verified against a now-outdated filing cannot be represented. UNSUPPORTED is ambiguous between "no evidence" and "evidence says otherwise".
- **Alternative (implemented):** status `unverified | verified | supported | conflicting | contradicted | insufficient_evidence`, plus freshness `current | stale | superseded | unknown`.
- **Advantages:** every combination is representable; superseded evidence forces re-verification; UI can show "Verified, newer data available".
- **Tradeoffs:** two fields to display instead of one.
- **Recommendation:** keep.

### 4.3 Thesis contradictory evidence can be an explicit "none found"
- **Specified:** theses reference contradictory evidence.
- **Concern:** requiring at least one contradicting reference would push users or AI to cite weak or irrelevant evidence to pass validation, which is worse than an honest "none found".
- **Alternative (implemented):** a non-draft thesis must record `contradictionSearch { performedAt, result, scope }`, and must list contradicting evidence unless the result is `none_found`. Drafts are exempt.
- **Tradeoffs:** a lazy search could claim none found; mitigated because the scope is recorded and the skeptic re-runs it.
- **Recommendation:** keep.

### 4.4 Listing as a third identity level
- **Specified:** Security and Company/Issuer.
- **Concern:** quotes belong to a ticker on a venue, not an instrument; tickers change and are reused.
- **Alternative (implemented):** Issuer → Security → Listing.
- **Tradeoffs:** one more join. **Recommendation:** keep.

### 4.5 Architecture notes (not challenges)
- The modular monolith and TypeScript stack are sound for V0. Keep domain packages framework-agnostic (no Next.js imports in `packages/*`) so ingestion workers can run outside the web runtime.
- I recommend PostgreSQL tables for facts/evidence be append-only with the bitemporal columns defined here (`knownSince`, `recordedAt`, `supersedes`).

## 5. Validation

Commands run from the repository root after a clean install (`rm -rf node_modules && pnpm install`):

```
$ pnpm typecheck
> @investment-app/schemas@0.1.0 typecheck
> tsc -p tsconfig.json
(exit 0, no diagnostics)

$ pnpm test
 RUN  v5.0.3 packages/schemas
 Test Files  1 passed (1)
      Tests  63 passed (63)
```

Typecheck settings: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. I confirmed the typechecker actually fails on an injected type error (exit 1), then removed it.

Coverage of the spec's required representative tests:

| Required test | Tests |
|---|---|
| Unknown values not coerced to zero | unreported EPS is explicit unknown; null/undefined/`{status:"known"}`/unknown-with-value rejected; unknown cost basis preserved; metric with missing inputs is `insufficient_inputs` |
| Percentage representation consistent | `"0.2"`, `"-0.05"`, `"30"` accepted; `"20%"`, `0.2` (number), `kind:"percent"`, `"2e-1"`, `"-0"` rejected; growth must output a ratio |
| Fully verified claim requires evidence | verified with no evidence rejected; cross-record primary-evidence check; LLM verifier cannot verify; interpretations cannot be verified; quantitative claims must reference a fact/metric |
| Financial period/basis explicit | six-month span cannot be Q2; flow concept with instant period rejected; metric without basis rejected; annual YoY from quarters rejected; YoY and sequential period rules; `describeMetric` label |
| Money carries currency | missing/lowercase/symbol currency rejected; numeric and comma-formatted amounts rejected; quote bid/ask currency mismatch rejected |
| Thesis references supporting evidence | active thesis without supporting evidence rejected |
| Thesis references contradictory evidence | missing both evidence and search rejected; "found" with none listed rejected; `none_found` accepted; relation mismatch rejected |
| Conflicting evidence representable | conflicting claim accepted; requires both sides; cannot be `verified`; two current facts yield `conflict` |
| Stale evidence representable | verified claim with stale freshness accepted; stale `EvidenceAssessment` accepted |
| Insufficient evidence representable | claim with no evidence and `insufficient_evidence` accepted; cannot be strong |
| Corrections/restatements without erasing history | restated fact is current; point-in-time resolution before restatement returns original; recorded-axis audit; supersession requires a reason |

Additional checks: every AAPL example parses (17 objects); LLM/user-produced facts, LLM metric values and LLM evidence rejected; evidence cannot exceed its source type's authority; briefs reject `rating`, `recommendation`, `priceTarget`; briefs require risks and contradicting-evidence sections; timestamps require an offset; exact decimal comparison (including values above 2^53); OHLC bounds; capex positive-outflow convention; EPS facts must name the share-class security.

## 6. Known Limitations

- **No GitHub repository or PR** yet (§0.1).
- **AAPL fixtures are illustrative.** Revenue (FY2024 $391.035B, FY2023 $383.285B), period dates, CIK and accession number are from my knowledge of Apple's FY2024 10-K and were not retrieved from EDGAR in this task; hashes, IDs, acceptance time, the quote/bar values and the restatement are fabricated placeholders, and the restatement is hypothetical. F02 must replace them with retrieved data.
- **Awaits F02 (not validated now):** database schema and migrations mirroring these contracts (append-only facts/evidence, `NUMERIC` columns, bitemporal indexes); referential integrity across records (e.g. a fact's `evidenceIds` resolving, quote currency matching the listing's trading currency, thesis evidence IDs existing) — only `checkClaimEvidence` checks cross-record rules today; actual XBRL → concept mapping and its tests; real provider adapters conforming to `MarketDataProvider`.
- **Awaits F06:** all metric computation; the catalog is specification only. Rounding/precision policy for derived values is not yet defined.
- **Deferred by design:** personal context (objectives, horizon, liquidity, risk capacity/tolerance, experience) has no contract yet; it should be designed together with the regulatory review in PRODUCT_CONTRACT §11. Segment-level facts are modeled (`ReportingScope`) but not in scope for V0 ingestion. FX conversion for multi-currency portfolios is described as derived but not specified. Evidence-strength derivation is defined as rules in prose, not code.
- **Authority tiers are a single ordered list.** `internal_derived` and `user_provided` are not really "less authoritative" than unverified secondary sources; they are different kinds. The ordering is only used to stop adapters upgrading a tier, so it is safe today, but the lead may prefer a partial order.
- **Freshness policies** in DATA_PROVENANCE §8 are initial proposals with guessed thresholds.
- **Toolchain:** TypeScript 7.0.2 (latest) is used; if the later Next.js toolchain requires TS 5.x, pin down — the contracts use no TS 7-specific features.

## 7. Definition-of-Done Assessment

| Category | Item | Status | Where |
|---|---|---|---|
| Product | V0 scope documented | Met | PRODUCT_CONTRACT §6 |
| | V0 exclusions explicit | Met | PRODUCT_CONTRACT §7 (+ schema-enforced no rating) |
| | Primary user defined | Met | PRODUCT_CONTRACT §2 |
| | Primary AAPL workflow defined | Met | PRODUCT_CONTRACT §5, mapped to contracts |
| Financial domain | Security/company relationship | Met | identity.ts; §3.2 |
| | Market-data contracts | Met | market.ts, providers.ts |
| | Period/fact/metric contracts | Met | periods.ts, financials.ts, metrics.ts |
| | Filing contract | Met | filings.ts |
| | Portfolio/position model | Met | portfolio.ts |
| Intelligence | Evidence contract | Met | evidence.ts |
| | Claim/verification contract | Met | claims.ts |
| | ResearchBrief contract | Met | research.ts |
| | InvestmentThesis contract | Met | thesis.ts |
| | Risk/assumption representation | Met | thesis.ts |
| | Evidence-quality/uncertainty representation | Met | EvidenceStrength, QualitativeLevel, verification axes; DOCTRINE §5 |
| Rules | Source precedence | Met | DATA_PROVENANCE §1, §9 |
| | Missing-data handling | Met | DATA_PROVENANCE §7; MaybeKnown |
| | Stale-data handling | Met (policies are initial) | DATA_PROVENANCE §8; EvidenceAssessment |
| | Conflicting-evidence handling | Met | DATA_PROVENANCE §9; resolveCurrentFact; claim status |
| | Calculation ownership | Met | DOCTRINE §1; Producer refinements |
| | AI boundaries | Met | DOCTRINE §1, §6, §8; schema rejections |
| | Citation/provenance requirements | Met | DOCTRINE §3; DATA_PROVENANCE §3, §11 |
| Engineering | Contracts internally coherent | Met, to the extent tests and typecheck can show | 63 tests; strict typecheck |
| | Representative examples exist | Met (illustrative) | examples/aapl.ts |
| | Critical validation/tests run | Met | §5 |
| | No obvious contradictory definitions | Met; I found none on final review | DOMAIN_CONTRACTS.md cross-index |

The "not ready if ambiguous" questions each have a one-line answer in DOMAIN_CONTRACTS.md and in §3 above (revenue growth §3.4; period §3.3; origin §3.6/§3.10; AI vs deterministic §3.10; issuer vs security §3.2; disagreement §3.9 and DATA_PROVENANCE §9; missing EPS §3.5; thesis ↔ evidence §3.8; restatement §3.9).

## 8. Recommendation

**READY FOR LEAD REVIEW**

F02 has not been started and will not be without explicit authorization.
