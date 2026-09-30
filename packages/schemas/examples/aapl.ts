/**
 * Representative AAPL examples of every major contract.
 *
 * ILLUSTRATIVE FIXTURES, NOT CANONICAL DATA. Figures are believed to match Apple's
 * fiscal 2024 Form 10-K (revenue, net income, diluted EPS, period dates, CIK,
 * accession number) but were written by hand for F01 and MUST NOT be treated as
 * sourced data. F02 ingestion replaces them with values retrieved from EDGAR.
 * Content hashes, acceptance time, IDs and the restatement scenario are fabricated
 * placeholders. The restatement is HYPOTHETICAL: Apple did not restate FY2024 revenue.
 */
import type { z } from "zod";
import type {
  Claim,
  DerivedMetricValue,
  Evidence,
  Filing,
  FinancialFact,
  InvestmentThesis,
  Issuer,
  Listing,
  Portfolio,
  PriceBar,
  Quote,
  ResearchBrief,
  Security,
  Watchlist,
} from "../src/index.js";

type In<T extends z.ZodTypeAny> = z.input<T>;

const HASH = "0".repeat(64);
const adapter = { kind: "source_adapter", adapter: "sec-edgar-xbrl", adapterVersion: "0.0.0-example" } as const;
const engine = { kind: "deterministic_engine", engine: "finance-math", engineVersion: "0.0.0-example" } as const;
const llm = { kind: "llm", model: "example-model", promptId: "research_brief", promptVersion: "0" } as const;

export const FY2024 = { kind: "duration", start: "2023-10-01", end: "2024-09-28", fiscalYear: 2024, fiscalLabel: "FY" } as const;
export const FY2023 = { kind: "duration", start: "2022-09-25", end: "2023-09-30", fiscalYear: 2023, fiscalLabel: "FY" } as const;

export const appleIssuer: In<typeof Issuer> = {
  id: "iss_apple",
  legalName: "Apple Inc.",
  formerNames: [{ name: "Apple Computer, Inc.", until: "2007-01-09" }],
  identifiers: { cik: "0000320193" },
  countryOfIncorporation: { status: "known", value: "US" },
  fiscalYearEnd: { status: "known", value: "09-28" },
  reportingCurrency: { status: "known", value: "USD" },
  sicCode: { status: "known", value: "3571" },
};

export const appleCommon: In<typeof Security> = {
  id: "sec_apple_common",
  issuerId: "iss_apple",
  type: "common_equity",
  description: "Common Stock",
  identifiers: {},
};

export const aaplNasdaq: In<typeof Listing> = {
  id: "lst_aapl_xnas",
  securityId: "sec_apple_common",
  mic: "XNAS",
  ticker: "AAPL",
  tradingCurrency: "USD",
  exchangeTimeZone: "America/New_York",
  isPrimaryListing: true,
  validFrom: "1980-12-12",
};

export const tenK2024: In<typeof Filing> = {
  id: "fil_aapl_10k_2024",
  issuerId: "iss_apple",
  accessionNumber: "0000320193-24-000123",
  formType: "10-K",
  rawFormType: "10-K",
  filedOn: "2024-11-01",
  acceptedAt: "2024-11-01T10:00:00Z",
  periodOfReport: "2024-09-28",
  reportedPeriod: FY2024,
  primaryDocumentUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm",
  hasXbrl: true,
  retrievedAt: "2026-09-30T12:00:00Z",
};

export const revenueFy2024Evidence: In<typeof Evidence> = {
  id: "ev_aapl_rev_fy2024",
  sourceType: "sec_xbrl_fact",
  authority: "regulatory_primary",
  title: "Apple Inc. Form 10-K, fiscal year ended 2024-09-28, total net sales",
  publisher: "U.S. Securities and Exchange Commission (EDGAR)",
  sourceUri: "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm",
  filedOn: "2024-11-01",
  filingId: "fil_aapl_10k_2024",
  retrievedAt: "2026-09-30T12:00:00Z",
  period: FY2024,
  subject: { issuerIds: ["iss_apple"] },
  locator: { kind: "xbrl_fact", concept: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", contextRef: "c-1", unitRef: "usd" },
  contentSha256: HASH,
  backs: { factIds: ["fact_aapl_rev_fy2024"] },
  producedBy: adapter,
};

export const revenueFy2024: In<typeof FinancialFact> = {
  id: "fact_aapl_rev_fy2024",
  issuerId: "iss_apple",
  concept: "revenue",
  scope: { kind: "consolidated" },
  period: FY2024,
  value: { status: "known", value: { kind: "money", amount: "391035000000", currency: "USD" } },
  origin: { kind: "as_reported", filingId: "fil_aapl_10k_2024", reportedDecimals: -6 },
  evidenceIds: ["ev_aapl_rev_fy2024"],
  knownSince: "2024-11-01T10:00:00Z",
  recordedAt: "2026-09-30T12:00:00Z",
  producedBy: adapter,
};

export const revenueFy2023: In<typeof FinancialFact> = {
  ...revenueFy2024,
  id: "fact_aapl_rev_fy2023",
  period: FY2023,
  value: { status: "known", value: { kind: "money", amount: "383285000000", currency: "USD" } },
  evidenceIds: ["ev_aapl_rev_fy2023"],
};

/** Diluted EPS that the source did not report for some period: explicit unknown, never 0. */
export const epsDilutedUnknown: In<typeof FinancialFact> = {
  id: "fact_aapl_eps_dil_example_unknown",
  issuerId: "iss_apple",
  securityId: "sec_apple_common",
  concept: "eps_diluted",
  scope: { kind: "consolidated" },
  period: FY2024,
  value: { status: "unknown", reason: "not_reported", detail: "illustrative: concept absent from the filing's XBRL" },
  origin: { kind: "as_reported", filingId: "fil_aapl_10k_2024" },
  evidenceIds: [],
  knownSince: "2024-11-01T10:00:00Z",
  recordedAt: "2026-09-30T12:00:00Z",
  producedBy: adapter,
};

/** HYPOTHETICAL restatement of FY2024 revenue via a 10-K/A. Demonstrates supersession only. */
export const revenueFy2024Restated: In<typeof FinancialFact> = {
  ...revenueFy2024,
  id: "fact_aapl_rev_fy2024_restated",
  value: { status: "known", value: { kind: "money", amount: "390000000000", currency: "USD" } },
  origin: { kind: "as_reported", filingId: "fil_aapl_10ka_hypothetical", reportedDecimals: -6 },
  evidenceIds: ["ev_aapl_rev_fy2024_restated"],
  knownSince: "2025-03-01T21:00:00Z",
  recordedAt: "2026-09-30T12:05:00Z",
  supersedes: "fact_aapl_rev_fy2024",
  supersessionReason: "restatement",
};

export const revenueGrowthFy2024: In<typeof DerivedMetricValue> = {
  id: "mv_aapl_revgrowth_fy2024_yoy",
  metricId: "revenue_growth",
  metricVersion: 1,
  subject: { issuerId: "iss_apple" },
  basis: { type: "growth", comparison: "year_over_year", granularity: "fiscal_year" },
  period: FY2024,
  comparisonPeriod: FY2023,
  value: { status: "known", value: { kind: "ratio", value: "0.0202199407751412" } },
  inputs: [
    { kind: "fact", factId: "fact_aapl_rev_fy2024" },
    { kind: "fact", factId: "fact_aapl_rev_fy2023" },
  ],
  computedAt: "2026-09-30T12:10:00Z",
  producedBy: engine,
  evidenceId: "ev_mv_aapl_revgrowth_fy2024",
};

export const aaplQuote: In<typeof Quote> = {
  listingId: "lst_aapl_xnas",
  price: { kind: "money_per_share", amount: "227.52", currency: "USD" },
  priceTime: "2026-09-30T15:45:00Z",
  timeliness: "delayed",
  delayMinutes: 15,
  session: "regular",
  provider: "example_provider",
  retrievedAt: "2026-09-30T16:00:03Z",
};

export const aaplBar: In<typeof PriceBar> = {
  listingId: "lst_aapl_xnas",
  interval: "1d",
  sessionDate: "2026-09-29",
  open: { kind: "money_per_share", amount: "225.10", currency: "USD" },
  high: { kind: "money_per_share", amount: "228.00", currency: "USD" },
  low: { kind: "money_per_share", amount: "224.50", currency: "USD" },
  close: { kind: "money_per_share", amount: "227.00", currency: "USD" },
  volume: { kind: "shares", amount: "41000000" },
  adjustment: "splits",
  adjustedAsOf: "2026-09-29",
  provider: "example_provider",
  retrievedAt: "2026-09-30T12:00:00Z",
};

export const revenueClaim: In<typeof Claim> = {
  id: "clm_rev_fy2024",
  type: "quantitative_fact",
  materiality: "material",
  text: "Apple's revenue for fiscal 2024 (ended September 28, 2024) was $391.0 billion.",
  subject: { issuerId: "iss_apple" },
  asOf: "2026-09-30T12:00:00Z",
  factIds: ["fact_aapl_rev_fy2024"],
  evidence: [{ evidenceId: "ev_aapl_rev_fy2024", relation: "supports" }],
  verification: {
    status: "verified",
    method: "deterministic_match",
    verifiedAt: "2026-09-30T12:11:00Z",
    verifiedBy: engine,
    freshness: "current",
    strength: "strong",
  },
  producedBy: llm,
};

export const growthInterpretationClaim: In<typeof Claim> = {
  id: "clm_growth_slow",
  type: "interpretation",
  materiality: "material",
  text: "Revenue growth in fiscal 2024 was low single digits year-over-year, which suggests the business is mature rather than expanding rapidly.",
  subject: { issuerId: "iss_apple" },
  asOf: "2026-09-30T12:00:00Z",
  metricValueIds: ["mv_aapl_revgrowth_fy2024_yoy"],
  evidence: [{ evidenceId: "ev_mv_aapl_revgrowth_fy2024", relation: "supports" }],
  verification: {
    status: "supported",
    method: "llm_verifier",
    verifiedAt: "2026-09-30T12:11:00Z",
    verifiedBy: { kind: "llm", model: "example-verifier", promptId: "claim_verifier", promptVersion: "0" },
    freshness: "current",
    strength: "limited",
  },
  producedBy: llm,
};

export const noContradictionClaim: In<typeof Claim> = {
  id: "clm_no_contra",
  type: "qualitative_fact",
  materiality: "supporting",
  text: "No evidence contradicting the revenue figure was found among the sources consulted.",
  subject: { issuerId: "iss_apple" },
  asOf: "2026-09-30T12:00:00Z",
  verification: { status: "insufficient_evidence", method: "llm_verifier", verifiedAt: "2026-09-30T12:11:00Z", verifiedBy: llm, freshness: "unknown", strength: "none" },
  producedBy: llm,
};

export const brief: In<typeof ResearchBrief> = {
  id: "rb_aapl_example",
  subject: { issuerId: "iss_apple", securityId: "sec_apple_common", listingId: "lst_aapl_xnas" },
  question: "How did Apple's business perform in fiscal 2024?",
  dataAsOf: "2026-09-30T12:00:00Z",
  createdAt: "2026-09-30T12:12:00Z",
  producedBy: llm,
  sections: [
    { kind: "business_overview", title: "How Apple makes money", claimIds: [], emptyReason: "Example fixture: omitted for brevity." },
    { kind: "financial_summary", title: "Fiscal 2024 results", claimIds: ["clm_rev_fy2024", "clm_growth_slow"] },
    { kind: "supporting_evidence", title: "Evidence for", claimIds: ["clm_rev_fy2024"] },
    { kind: "contradicting_evidence", title: "Evidence against", claimIds: ["clm_no_contra"] },
    { kind: "risks", title: "Risks", claimIds: [], emptyReason: "Example fixture: risk claims omitted for brevity." },
  ],
  claims: [revenueClaim, growthInterpretationClaim, noContradictionClaim],
  metricValueIds: ["mv_aapl_revgrowth_fy2024_yoy"],
  evidenceConsulted: ["ev_aapl_rev_fy2024", "ev_mv_aapl_revgrowth_fy2024"],
  overallEvidenceStrength: "limited",
  limitations: ["Example fixture; not generated from live data."],
  status: "verification_complete",
  framing: "research_and_education_not_advice",
};

export const thesis: In<typeof InvestmentThesis> = {
  id: "th_aapl_services",
  revision: 1,
  createdAt: "2026-09-30T13:00:00Z",
  ownerUserId: "usr_max",
  securityId: "sec_apple_common",
  title: "Services growth offsets hardware maturity",
  stance: "positive",
  statement: "Services revenue keeps growing faster than hardware, lifting overall margins over the next three years.",
  horizon: { start: "2026-09-30", reviewBy: "2027-09-30" },
  assumptions: [
    {
      id: "as_1",
      statement: "Total revenue keeps growing year-over-year at the fiscal-year level.",
      category: "growth",
      measurable: {
        metricId: "revenue_growth",
        basisDescription: "annual year-over-year",
        comparator: ">",
        threshold: { kind: "ratio", value: "0" },
        evaluateBy: "2027-11-15",
      },
      evidence: [{ evidenceId: "ev_mv_aapl_revgrowth_fy2024", relation: "supports" }],
      evidenceStrength: "limited",
      status: "holding",
      origin: "user",
    },
  ],
  risks: [
    {
      id: "rk_1",
      title: "Regulatory pressure on App Store economics",
      description: "Regulators could force changes to App Store fees, reducing services revenue.",
      category: "regulatory_legal",
      severity: "high",
      likelihood: "medium",
      origin: "ai_suggested_user_accepted",
    },
  ],
  invalidationConditions: [
    { id: "inv_1", description: "Annual revenue declines year-over-year in fiscal 2026.", status: "not_triggered" },
  ],
  supportingEvidence: [{ evidenceId: "ev_mv_aapl_revgrowth_fy2024", relation: "supports" }],
  contradictoryEvidence: [{ evidenceId: "ev_example_regulatory_news", relation: "contradicts", note: "Illustrative: a news item about fee rulings." }],
  contradictionSearch: { performedAt: "2026-09-30T13:00:00Z", result: "found", scope: "10-K risk factors; recent 8-Ks; news (example)" },
  status: "active",
};

export const portfolio: In<typeof Portfolio> = {
  id: "pf_max",
  ownerUserId: "usr_max",
  name: "Main",
  baseCurrency: "USD",
  positions: [
    {
      securityId: "sec_apple_common",
      quantity: { kind: "shares", amount: "10" },
      costBasisTotal: { status: "unknown", reason: "not_reported", detail: "user did not enter cost basis" },
      thesisId: "th_aapl_services",
    },
  ],
  cash: [{ kind: "money", amount: "1500.00", currency: "USD" }],
  holdingsAsOf: "2026-09-30T13:00:00Z",
  source: "manual_entry",
};

export const watchlist: In<typeof Watchlist> = {
  id: "wl_max",
  ownerUserId: "usr_max",
  name: "Researching",
  items: [{ securityId: "sec_apple_common", addedAt: "2026-09-30T13:00:00Z", thesisId: "th_aapl_services" }],
};
