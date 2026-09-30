# Data Provenance

Status: F01 draft for lead review. Defines how data enters, how it is identified and dated, what wins when sources disagree, and how history is preserved.

## 1. Source-authority hierarchy

Highest first (`AuthorityTier`):

| Tier | Examples | Use |
|---|---|---|
| `regulatory_primary` | SEC 10-K, 10-Q, 8-K, amendments, XBRL facts | Canonical source for U.S. issuer financial facts |
| `issuer_primary` | Press releases, earnings decks, call transcripts | Timely but unaudited; superseded by filings for the same fact |
| `market_data_licensed` | Contracted provider quotes, bars, corporate actions | Canonical for prices; never for financial statement facts |
| `secondary_reputable` | Established news, reference-data aggregators | Context, developments; never canonical for filed numbers |
| `secondary_unverified` | Blogs, social, unknown origin | Can be shown only as unverified; never supports `verified` |
| `internal_derived` | finance-math outputs | Authoritative as to arithmetic; provenance flows through inputs |
| `user_provided` | User notes, holdings | Authoritative only about the user's own records |

Each `EvidenceSourceType` has a default tier (`DEFAULT_AUTHORITY`); adapters may downgrade a record, never upgrade it (schema-enforced). LLM output has no tier: it is never evidence.

## 2. Primary vs secondary evidence

**Primary** = originated by the issuer: `regulatory_primary` and `issuer_primary`. **Secondary** = reporting about the issuer by others. A factual claim can be `verified` only with supporting primary evidence (or `internal_derived` evidence for a stated metric value, whose inputs are themselves primary). Market data is its own category: canonical for prices, irrelevant for financial statements.

## 3. Evidence identity and provenance

Every `Evidence` record carries:

| Question | Field |
|---|---|
| Where did this come from? | `publisher`, `sourceUri`, `filingId`, `locator` (section, text span, XBRL concept+context+unit, market record) |
| What source type? | `sourceType`, `authority` |
| When published/filed? | `publishedAt` (instant), `filedOn` (EDGAR filing date) |
| What period does it describe? | `period` (`FinancialPeriod`) |
| When did we retrieve it? | `retrievedAt` (required) |
| Which entity? | `subject.issuerIds / securityIds / listingIds` |
| How authoritative? | `authority` |
| Superseded? | Newer record's `supersedes` + `supersessionReason`; computed `EvidenceAssessment.freshness = "superseded"` |
| Can we prove what we saw? | `contentSha256` of the raw retrieved content |
| What does it back? | `backs.factIds`, `backs.metricValueIds` |

Evidence is append-only. It is never edited after write.

## 4. Numeric representation

- Canonical numbers are **decimal strings** (`"391035000000"`, `"0.0202"`), not JS numbers. Reasons: exactness for currency, no silent precision loss above 2^53 (share counts × prices, large aggregates), and faithful storage of reported values. finance-math (F06) will use a decimal library; the database (F02) should use `NUMERIC`.
- **Ratios are decimal fractions: `0.2` = 20%.** The canonical model has no "percent" unit. Multiples are ratios (`"30"` = 30x). Percent formatting is UI-only.
- Every quantity has a `kind` tag: `money`, `money_per_share`, `shares`, `ratio`, `count`. Units are never inferred from context.
- Money is in whole currency units with explicit ISO 4217 `currency`. No scale factors ("in millions") are stored; adapters apply scale.
- Reported precision is preserved: `FactOrigin.reportedDecimals` stores the XBRL `decimals` attribute (−6 = rounded to millions).

## 5. Financial-period semantics

- **Duration vs instant.** Flow concepts (revenue, net income, cash flows) are `duration`; stock concepts (cash, debt, equity, shares outstanding) are `instant`. The concept catalog fixes which, and facts are rejected if they mismatch.
- **Fiscal labels are the issuer's.** Apple FY2024 = 2023-10-01 to 2024-09-28 (52 weeks). Cross-company alignment uses dates, not labels.
- **Discrete vs YTD.** 10-Q cash-flow statements are year-to-date. A six-month span is `YTD6`, never `Q2`; label/length consistency is schema-enforced (`LABEL_DAY_BOUNDS`).
- **Derived periods.** Q4 is typically not filed; it is derived as FY − YTD9 by finance-math with `origin.kind = "derived_arithmetic"` and input fact IDs. TTM is always derived.
- **Instants that are not period ends** (cover-page shares outstanding dated weeks after period end) carry their true date and no fiscal alignment.
- **Metric basis.** Every metric value states its basis. "Revenue growth" alone is not representable; the contract requires granularity (`quarter`, `fiscal_year`, `ttm`) and comparison (`year_over_year`, `sequential`, or CAGR years), and validates that the two periods match that basis. Answer to "what does revenue growth mean?": `revenue[current] / revenue[prior] − 1` where current and prior are the periods named on the value, rendered e.g. "Revenue growth, FY2024 vs FY2023, annual year-over-year". The product default for "revenue growth" with no qualifier is annual year-over-year on the latest fiscal year; any other basis is shown with its label.

## 6. Timestamps and dates

| Field kind | Type | Example |
|---|---|---|
| Fiscal period boundaries | `CalendarDate` (no zone) | `2024-09-28` |
| EDGAR filing date | `CalendarDate` (`filedOn`) | `2024-11-01` |
| EDGAR acceptance | `Timestamp` (`acceptedAt`, UTC) | `2024-11-01T10:00:00Z` |
| Publication of non-filed sources | `Timestamp` (`publishedAt`) | |
| When the public could know a fact | `Timestamp` (`FinancialFact.knownSince`) | = acceptance time |
| When we retrieved | `Timestamp` (`retrievedAt`) | |
| When we recorded a fact | `Timestamp` (`recordedAt`) | |
| Quote price time | `Timestamp` (`priceTime`, exchange time of trade) | |
| Daily bar | `CalendarDate` (`sessionDate`, exchange-local) | |

Timestamps must include an explicit offset (schema rejects naive datetimes). Adapters normalize to `Z`. **Retrieval time is never used as publication time**, and **period end is never used as knowledge time**: FY2024 revenue describes a period ending 2024-09-28 but was not knowable until the 10-K was accepted on 2024-11-01.

## 7. Missing-data semantics

`MaybeKnown<T>` = `{status:"known", value}` or `{status:"unknown", reason, detail?}`. There is no null shortcut.

| Reason | Meaning | Display |
|---|---|---|
| `not_reported` | Source checked; value absent | "Not reported" |
| `not_applicable` | Concept does not apply (gross margin for a bank) | "N/A" |
| `not_yet_available` | Period not yet reported | "Not yet reported" |
| `not_retrieved` | Out of ingestion scope | "Not available" |
| `source_unavailable` | Retrieval failed | "Temporarily unavailable" |
| `insufficient_inputs` | A derived value lacks inputs | "Cannot compute: missing X" |
| `undefined_result` | Math undefined (growth from ≤0 base, P/E with negative EPS) | "n/m" |
| `conflicting_sources` | Unresolved disagreement | "Sources disagree" + link |
| `withheld` | License forbids display | "Restricted" |

Missing EPS for a period is a `FinancialFact` with `value: {status:"unknown", reason:"not_reported"}`, linked to the filing that was checked. Derived metrics propagate unknown inputs as `insufficient_inputs`; they never substitute zero.

## 8. Stale-data semantics

Staleness is relative to a use and a time, so it is computed, not stored on evidence. An `EvidenceAssessment` records `freshness` under a named, versioned policy. Initial policies (to be tuned in F02+):

| Policy | Current when |
|---|---|
| `quote_intraday@1` | Regular session open and `priceTime` within delay + 5 minutes; otherwise stale (outside session: last close is current until next open) |
| `latest_quarter@1` | No 10-Q/10-K for a later period has been accepted |
| `latest_fiscal_year@1` | No 10-K for a later fiscal year has been accepted |
| `historical_period@1` | Always current unless superseded (FY2022 revenue does not go stale) |
| `news@1` | Published within 30 days for "recent developments" |

Stale evidence remains valid for what it says; claims based on it keep their status and show freshness (e.g. "Verified — newer data available").

## 9. Conflicting-evidence semantics

1. **Same fact slot, different values** (`factKey` equal, both current): `resolveCurrentFact` returns `conflict`. The system never silently picks one. Precedence then applies:
   - higher authority tier wins (filing beats press release beats vendor);
   - within the same tier, the later-knowable filing wins only via explicit supersession (amendment/restatement/recast);
   - otherwise the value is shown as `unknown(conflicting_sources)` with both sources linked, and flagged for review.
2. **Vendor vs filing** for financial statement values: filing wins; vendor disagreement is logged as a data-quality signal.
3. **Claims**: evidence on both sides yields `conflicting` with strength `mixed`; both sides are shown.
4. **Tolerance**: values equal after applying reported precision (e.g. both round to the same millions) are not a conflict.

## 10. Corrections, restatements, amendments

- Facts and evidence are append-only. A changed value is a new record with `supersedes` + `supersessionReason`: `amendment` (10-K/A, 10-Q/A), `restatement` (error correction by the issuer), `recast` (re-presentation without error: accounting change, discontinued operations, stock split), `ingestion_correction` (our bug).
- Current value is computed by `resolveCurrentFact`, bitemporally:
  - `knowable` axis (`knownSince`): what the public record said at time T (backtests, thesis reviews).
  - `recorded` axis (`recordedAt`): what our system held at time T (audit of what we displayed).
- Metrics computed from a superseded fact are not edited; finance-math computes a new value, and claims citing the old one move to freshness `superseded` and must be re-verified.
- Stock splits: per-share and share-count facts from older filings are not rewritten; later filings' recast comparatives arrive as `recast` facts. Price series carry `adjustment` and `adjustedAsOf`.

## 11. Provenance for deterministic derived metrics

Every `DerivedMetricValue` records: `metricId` + `metricVersion` (formula spec in `METRIC_DEFINITIONS`), `basis`, `period`/`comparisonPeriod`, every input (`MetricInputRef`: fact IDs, metric value IDs, quote, price series window), `computedAt`, `producedBy` (engine + version), and optionally an `internal_derived` `evidenceId` so claims can cite it. Chain: displayed number → metric value → input facts → evidence → filing → EDGAR URL + content hash.

Changing a formula or edge-case policy bumps `version`; values are never recomputed in place.

## 12. Vendor normalization rules

1. Vendor field names, IDs, enums and payload shapes exist only inside adapters.
2. Adapters output canonical contracts validated by their Zod schemas; invalid output is an adapter error, not data.
3. Adapters convert units, scale, sign convention (capex, dividends, buybacks as positive outflows), and time zones.
4. Adapters never fill gaps: missing → `unknown(reason)`; failures → `ProviderResult` errors.
5. Our `ProviderKey` identifies the provider; vendor names do not appear in core code.
6. XBRL concept → canonical concept mapping lives in the SEC adapter (F02+), with a per-issuer override table for custom extensions; the mapping is versioned via `adapterVersion`.
7. Licensed identifiers (CUSIP, ISIN) are stored only when the data license permits; FIGI is the preferred cross-reference.
