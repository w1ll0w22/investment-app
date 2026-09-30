# Domain Contracts Index

One row per V0 domain object, answering the F01 target questions. Source of truth is the Zod schema in `packages/schemas/src/<file>`; this index must be updated with any schema change.

Legend — **Origin**: who writes it. **AI may modify?**: whether LLM output can create or change it.

| Object (file) | What it is | Units / period | Origin | AI may modify? | Uncertainty | Evidence link | Relations |
|---|---|---|---|---|---|---|---|
| `Issuer` (identity.ts) | Legal entity filing with the SEC | n/a; `fiscalYearEnd` informational only | Reference/SEC adapter | No | `MaybeKnown` on country, FYE, currency, SIC | via Filing | 1 → many Security, Filing, FinancialFact |
| `Security` (identity.ts) | An instrument (common stock, share class) | n/a | Reference adapter | No | optional identifiers | — | many → 1 Issuer; 1 → many Listing |
| `Listing` (identity.ts) | Security on a venue under a ticker for a validity window | trading currency, exchange time zone | Reference adapter | No | `validTo` open-ended | — | Quote, PriceBar attach here |
| `Quote` (market.ts) | Latest price for a listing | `MoneyPerShare`; `priceTime` instant; `timeliness` + `delayMinutes` | Market adapter | No | freshness via `EvidenceAssessment` policy | optional `evidenceId` | → Listing |
| `PriceBar` (market.ts) | OHLCV for one exchange session / week / month | `MoneyPerShare`, `ShareCount`; `sessionDate` exchange-local; `adjustment` + `adjustedAsOf` | Market adapter | No | — | provider + retrievedAt | → Listing |
| `CorporateAction` (market.ts) | Split or cash dividend | ratio as numerator/denominator; `MoneyPerShare` | Market adapter | No | — | provider | → Security |
| `FinancialPeriod` (periods.ts) | Duration (start–end, fiscal year, label) or instant (date) | civil dates; label length validated | Adapters/engine | No | — | — | used by facts, metrics, evidence, filings |
| `Filing` (filings.ts) | One EDGAR submission | `filedOn` date, `acceptedAt` instant | SEC adapter | No | optional period/report date | is the anchor for SEC evidence | → Issuer; amends → Filing |
| `FinancialFact` (financials.ts) | Canonical value: issuer × concept × period × scope | kind fixed per concept (money / money_per_share / shares); duration vs instant fixed per concept; sign convention per concept | SEC adapter (as reported) or finance-math (arithmetic identities) | **No** (schema-enforced) | `MaybeKnown` value with reason; conflicts surfaced by `resolveCurrentFact` | `evidenceIds` (required when known & as reported) | → Issuer, Security (per-share), Filing; supersedes → FinancialFact |
| `DerivedMetricValue` (metrics.ts) | Computed metric under versioned definition + explicit basis | output kind per definition (ratio = fraction); period + comparisonPeriod validated against basis | finance-math only | **No** (schema-enforced) | `MaybeKnown` (`insufficient_inputs`, `undefined_result`) | `inputs` → facts/quotes; optional internal-derived `evidenceId` | → facts, metrics, listing |
| `Evidence` (evidence.ts) | Immutable record of what a source said | publishedAt / filedOn / retrievedAt / period | Adapters, engine, user | **No** (LLM evidence rejected) | freshness computed by `EvidenceAssessment` | is the evidence | → Filing, subjects, backs facts/metrics; supersedes → Evidence |
| `EvidenceReference` (evidence.ts) | Citation from a claim/thesis/assumption/risk to evidence | — | LLM or user | Yes (it's a citation, checked by verifier) | `relation`: supports / contradicts / context | → Evidence | embedded |
| `Claim` (claims.ts) | One atomic statement shown to users | `asOf` instant | LLM, user | LLM writes text; **cannot mark verified** | `ClaimVerification`: status × freshness × strength | `evidence[]`, `factIds`, `metricValueIds` | embedded in ResearchBrief |
| `ResearchBrief` (research.ts) | Sectioned claims about one security at a data cutoff | `dataAsOf`, `createdAt` | LLM pipeline | Yes, as structured claims only; no rating fields exist | `overallEvidenceStrength`, `limitations` | via claims; `evidenceConsulted` | → Issuer/Security/Listing; supersededBy → brief |
| `InvestmentThesis` (thesis.ts) | The user's reasoning, revisioned | `horizon` dates; `revision` | User (AI may suggest, user accepts) | Suggestions only (`origin: ai_suggested_user_accepted`) | assumption `evidenceStrength` + status; risk qualitative levels | `supportingEvidence`, `contradictoryEvidence`, `contradictionSearch` | → Security; DecisionRecord, ThesisReview → thesis revision |
| `Assumption` (thesis.ts) | Belief the thesis depends on, optionally measurable | `MeasurableCondition` (metric, comparator, threshold Quantity, evaluateBy) | User / AI-suggested | Suggest only | `evidenceStrength`, `status` | `evidence[]` | embedded in thesis |
| `Risk` (thesis.ts) | What could go wrong | qualitative severity/likelihood | User / AI-suggested / filing risk factor | Suggest only | `QualitativeLevel` incl. `unknown` | `evidence[]` | embedded in thesis |
| `InvalidationCondition` (thesis.ts) | What would prove the thesis wrong | optional measurable condition | User / AI-suggested | Suggest only | `status` incl. `unknown` | — | embedded in thesis |
| `DecisionRecord` / `ThesisReview` (thesis.ts) | User-recorded decision; retrospective | instants; price `MaybeKnown` | User | No | outcomes include `unknown` / `too_early_to_tell` | — | → thesis revision |
| `Portfolio` / `Position` (portfolio.ts) | User's holdings snapshot | `ShareCount`, `Money` with currency; `holdingsAsOf` | User (manual/file import) | No | cost basis / acquired date `MaybeKnown` | user_provided | → Security, Thesis; values/weights derived at read time |
| `Watchlist` / `WatchlistItem` (portfolio.ts) | Securities the user follows | `addedAt` | User | No | — | — | → Security, Thesis |
| `MarketDataProvider` (providers.ts) | Port that market adapters implement | canonical types only | Adapter implementations (F02+) | n/a | `ProviderResult` errors | — | returns Quote, PriceBar, CorporateAction, SecurityResolution |

## Answers to the F01 "not ready if ambiguous" questions

| Question | Answer |
|---|---|
| What does "revenue growth" mean? | `revenue[current]/revenue[prior] − 1`, with basis required on every value (granularity + YoY/sequential/CAGR) and periods validated against it. Default unqualified meaning: annual YoY on the latest fiscal year. Growth from a base ≤ 0 is `unknown(undefined_result)`. |
| What period does this number describe? | `period` (and `comparisonPeriod`) on every fact/metric, with fiscal label, dates, and duration/instant kind. `describeMetric` renders it. |
| Where did this number originate? | Metric → `inputs` → facts → `evidenceIds` → Evidence (`filingId`, `locator`, `sourceUri`, `contentSha256`, `retrievedAt`). |
| Did AI or deterministic software calculate it? | `producedBy`. Facts and metrics can only be `source_adapter` / `deterministic_engine`; schemas reject `llm`. |
| Company/Issuer vs Security? | Issuer = legal entity with financials; Security = instrument with share counts/EPS/positions; Listing = ticker on a venue with prices. |
| What happens when sources disagree? | `resolveCurrentFact` returns `conflict`; precedence by authority tier and explicit supersession; otherwise `unknown(conflicting_sources)` with both sources shown. Claims become `conflicting`. |
| How is missing EPS represented? | A `FinancialFact` for `eps_diluted` with `value: {status:"unknown", reason:"not_reported"}` linked to the checked filing. |
| How does InvestmentThesis connect to evidence? | `supportingEvidence` (relation `supports`), `contradictoryEvidence` (relation `contradicts`), `contradictionSearch`, plus evidence on each assumption and risk. |
| How does a restatement supersede a fact? | New `FinancialFact` with `supersedes` + `supersessionReason: "restatement"`; old fact retained; current value resolved bitemporally by `knownSince` / `recordedAt`. |
