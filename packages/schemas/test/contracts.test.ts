import { describe, expect, it } from "vitest";
import {
  Claim,
  DerivedMetricValue,
  Evidence,
  EvidenceAssessment,
  Filing,
  FinancialFact,
  FinancialPeriod,
  InvestmentThesis,
  Issuer,
  Listing,
  Money,
  Portfolio,
  Position,
  PriceBar,
  Quote,
  Ratio,
  ResearchBrief,
  Security,
  Timestamp,
  Watchlist,
  checkClaimEvidence,
  compareDecimal,
  describeMetric,
  maybeKnown,
  resolveCurrentFact,
  type Evidence as EvidenceT,
} from "../src/index.js";
import * as ex from "../examples/aapl.js";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, v: unknown) => {
  const r = schema.safeParse(v);
  if (!r.success) throw new Error(JSON.stringify(r.error, null, 2));
  return r;
};
const bad = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => expect(schema.safeParse(v).success).toBe(false);
const clone = <T>(v: T): T => structuredClone(v);

describe("AAPL examples are valid instances of every contract", () => {
  it.each([
    ["Issuer", Issuer, ex.appleIssuer],
    ["Security", Security, ex.appleCommon],
    ["Listing", Listing, ex.aaplNasdaq],
    ["Filing", Filing, ex.tenK2024],
    ["Evidence", Evidence, ex.revenueFy2024Evidence],
    ["FinancialFact (known)", FinancialFact, ex.revenueFy2024],
    ["FinancialFact (unknown EPS)", FinancialFact, ex.epsDilutedUnknown],
    ["FinancialFact (restated)", FinancialFact, ex.revenueFy2024Restated],
    ["DerivedMetricValue", DerivedMetricValue, ex.revenueGrowthFy2024],
    ["Quote", Quote, ex.aaplQuote],
    ["PriceBar", PriceBar, ex.aaplBar],
    ["Claim (verified)", Claim, ex.revenueClaim],
    ["Claim (interpretation)", Claim, ex.growthInterpretationClaim],
    ["ResearchBrief", ResearchBrief, ex.brief],
    ["InvestmentThesis", InvestmentThesis, ex.thesis],
    ["Portfolio", Portfolio, ex.portfolio],
    ["Watchlist", Watchlist, ex.watchlist],
  ] as const)("%s", (_name, schema, value) => {
    ok(schema, value);
  });
});

describe("Unknown is not zero", () => {
  it("an unreported EPS is an explicit unknown with a reason, not 0 or null", () => {
    const f = FinancialFact.parse(ex.epsDilutedUnknown);
    expect(f.value).toEqual({ status: "unknown", reason: "not_reported", detail: expect.any(String) });
    expect("value" in f.value).toBe(false);
  });
  it("null, undefined, 0-as-placeholder shapes are rejected", () => {
    const Mk = maybeKnown(Money);
    bad(Mk, null);
    bad(Mk, undefined);
    bad(Mk, { status: "known" });
    bad(Mk, { status: "unknown" }); // reason required
    bad(Mk, { status: "unknown", reason: "not_reported", value: { kind: "money", amount: "0", currency: "USD" } });
    bad(FinancialFact, { ...clone(ex.epsDilutedUnknown), value: null });
  });
  it("unknown cost basis stays unknown in a position", () => {
    const p = Position.parse(ex.portfolio.positions[0]);
    expect(p.costBasisTotal.status).toBe("unknown");
  });
  it("a derived metric with a missing input is unknown(insufficient_inputs), and may have no numeric value", () => {
    const m = { ...clone(ex.revenueGrowthFy2024), value: { status: "unknown", reason: "insufficient_inputs" }, inputs: [] };
    ok(DerivedMetricValue, m);
  });
});

describe("Ratio / percentage representation", () => {
  it("0.2 means 20% and is a decimal string with kind ratio", () => {
    ok(Ratio, { kind: "ratio", value: "0.2" });
    ok(Ratio, { kind: "ratio", value: "-0.05" });
    ok(Ratio, { kind: "ratio", value: "30" }); // a 30x multiple
  });
  it("percent strings, JS numbers and a percent unit are rejected", () => {
    bad(Ratio, { kind: "ratio", value: "20%" });
    bad(Ratio, { kind: "ratio", value: 0.2 });
    bad(Ratio, { kind: "percent", value: "20" });
    bad(Ratio, { kind: "ratio", value: "2e-1" });
    bad(Ratio, { kind: "ratio", value: "-0" });
  });
  it("a growth metric must output a ratio, not money", () => {
    bad(DerivedMetricValue, { ...clone(ex.revenueGrowthFy2024), value: { status: "known", value: { kind: "money", amount: "0.02", currency: "USD" } } });
  });
});

describe("Money has explicit currency", () => {
  it("requires an ISO 4217 currency and a decimal-string amount", () => {
    ok(Money, { kind: "money", amount: "391035000000", currency: "USD" });
    bad(Money, { kind: "money", amount: "391035000000" });
    bad(Money, { kind: "money", amount: "100", currency: "usd" });
    bad(Money, { kind: "money", amount: "100", currency: "$" });
    bad(Money, { kind: "money", amount: 100, currency: "USD" });
    bad(Money, { kind: "money", amount: "1,000", currency: "USD" });
  });
  it("quote bid/ask must share the price currency", () => {
    bad(Quote, { ...clone(ex.aaplQuote), bid: { kind: "money_per_share", amount: "227.50", currency: "EUR" } });
  });
});

describe("Financial period and basis are explicit", () => {
  it("a six-month span cannot be labelled a quarter (YTD vs discrete)", () => {
    bad(FinancialPeriod, { kind: "duration", start: "2023-10-01", end: "2024-03-30", fiscalYear: 2024, fiscalLabel: "Q2" });
    ok(FinancialPeriod, { kind: "duration", start: "2023-10-01", end: "2024-03-30", fiscalYear: 2024, fiscalLabel: "YTD6" });
    ok(FinancialPeriod, { kind: "duration", start: "2023-12-31", end: "2024-03-30", fiscalYear: 2024, fiscalLabel: "Q2" });
  });
  it("flow concepts need durations; stock concepts need instants", () => {
    bad(FinancialFact, { ...clone(ex.revenueFy2024), period: { kind: "instant", date: "2024-09-28" } });
  });
  it("a metric value without a basis is rejected", () => {
    const { basis: _b, ...noBasis } = clone(ex.revenueGrowthFy2024);
    bad(DerivedMetricValue, noBasis);
  });
  it("annual YoY cannot be computed from quarterly periods", () => {
    const q = { kind: "duration", start: "2024-06-30", end: "2024-09-28", fiscalYear: 2024, fiscalLabel: "Q4" } as const;
    const qPrior = { kind: "duration", start: "2023-07-02", end: "2023-09-30", fiscalYear: 2023, fiscalLabel: "Q4" } as const;
    bad(DerivedMetricValue, { ...clone(ex.revenueGrowthFy2024), period: q, comparisonPeriod: qPrior });
    ok(DerivedMetricValue, { ...clone(ex.revenueGrowthFy2024), basis: { type: "growth", comparison: "year_over_year", granularity: "quarter" }, period: q, comparisonPeriod: qPrior });
  });
  it("YoY requires the same fiscal period one year earlier; sequential requires the prior quarter", () => {
    const q3 = { kind: "duration", start: "2024-03-31", end: "2024-06-29", fiscalYear: 2024, fiscalLabel: "Q3" } as const;
    const q4 = { kind: "duration", start: "2024-06-30", end: "2024-09-28", fiscalYear: 2024, fiscalLabel: "Q4" } as const;
    const q1Next = { kind: "duration", start: "2024-09-29", end: "2024-12-28", fiscalYear: 2025, fiscalLabel: "Q1" } as const;
    bad(DerivedMetricValue, { ...clone(ex.revenueGrowthFy2024), basis: { type: "growth", comparison: "year_over_year", granularity: "quarter" }, period: q4, comparisonPeriod: q3 });
    ok(DerivedMetricValue, { ...clone(ex.revenueGrowthFy2024), basis: { type: "growth", comparison: "sequential", granularity: "quarter" }, period: q4, comparisonPeriod: q3 });
    ok(DerivedMetricValue, { ...clone(ex.revenueGrowthFy2024), basis: { type: "growth", comparison: "sequential", granularity: "quarter" }, period: q1Next, comparisonPeriod: q4 });
  });
  it("describeMetric renders an unambiguous label", () => {
    const m = DerivedMetricValue.parse(ex.revenueGrowthFy2024);
    expect(describeMetric(m)).toBe("Revenue growth, FY2024 vs FY2023, annual year-over-year");
  });
});

describe("Calculation ownership and AI boundaries", () => {
  it("LLM-produced metric values are rejected", () => {
    bad(DerivedMetricValue, { ...clone(ex.revenueGrowthFy2024), producedBy: { kind: "llm", model: "m", promptId: "p", promptVersion: "1" } });
  });
  it("LLM- or user-produced financial facts are rejected", () => {
    bad(FinancialFact, { ...clone(ex.revenueFy2024), producedBy: { kind: "llm", model: "m", promptId: "p", promptVersion: "1" } });
    bad(FinancialFact, { ...clone(ex.revenueFy2024), producedBy: { kind: "user", userId: "usr_max" } });
  });
  it("LLM output cannot be registered as evidence", () => {
    bad(Evidence, { ...clone(ex.revenueFy2024Evidence), producedBy: { kind: "llm", model: "m", promptId: "p", promptVersion: "1" } });
  });
  it("evidence cannot claim more authority than its source type allows", () => {
    bad(Evidence, { ...clone(ex.revenueFy2024Evidence), sourceType: "news_article", authority: "regulatory_primary", filingId: undefined });
  });
  it("a research brief cannot carry a BUY/SELL rating or price target", () => {
    bad(ResearchBrief, { ...clone(ex.brief), rating: "BUY" });
    bad(ResearchBrief, { ...clone(ex.brief), recommendation: "STRONG BUY" });
    bad(ResearchBrief, { ...clone(ex.brief), priceTarget: { kind: "money_per_share", amount: "300", currency: "USD" } });
  });
  it("a research brief must include risks and contradicting-evidence sections", () => {
    const b = clone(ex.brief);
    b.sections = b.sections.filter((s) => s.kind !== "risks");
    bad(ResearchBrief, b);
  });
});

describe("Claim verification", () => {
  const evidenceIndex = new Map<string, EvidenceT>([[ex.revenueFy2024Evidence.id, Evidence.parse(ex.revenueFy2024Evidence)]]);

  it("a verified factual claim requires supporting evidence", () => {
    bad(Claim, { ...clone(ex.revenueClaim), evidence: [] });
  });
  it("a verified claim's support must be primary evidence (cross-record check)", () => {
    const c = Claim.parse(ex.revenueClaim);
    expect(checkClaimEvidence(c, evidenceIndex)).toEqual([]);
    const news = Evidence.parse({ ...clone(ex.revenueFy2024Evidence), id: "ev_news", sourceType: "news_article", authority: "secondary_reputable", filingId: undefined });
    const c2 = Claim.parse({ ...clone(ex.revenueClaim), evidence: [{ evidenceId: "ev_news", relation: "supports" }] });
    expect(checkClaimEvidence(c2, new Map([["ev_news", news]]))).toContain("verified claim lacks supporting primary evidence");
  });
  it("an LLM verifier cannot mark a claim verified", () => {
    bad(Claim, { ...clone(ex.revenueClaim), verification: { ...clone(ex.revenueClaim.verification), method: "llm_verifier" } });
  });
  it("interpretations cannot be verified, only supported", () => {
    bad(Claim, { ...clone(ex.growthInterpretationClaim), verification: { ...clone(ex.revenueClaim.verification) } });
  });
  it("a quantitative claim must reference the canonical number it states", () => {
    bad(Claim, { ...clone(ex.revenueClaim), factIds: [] });
  });
  it("conflicting evidence is representable and requires both sides", () => {
    const base = clone(ex.revenueClaim);
    const conflicting = {
      ...base,
      evidence: [
        { evidenceId: "ev_a", relation: "supports" },
        { evidenceId: "ev_b", relation: "contradicts" },
      ],
      verification: { ...base.verification, status: "conflicting", strength: "mixed" },
    };
    ok(Claim, conflicting);
    bad(Claim, { ...conflicting, evidence: [{ evidenceId: "ev_a", relation: "supports" }] });
    bad(Claim, { ...conflicting, verification: { ...base.verification, status: "verified" } });
  });
  it("stale evidence is representable without losing the verified status", () => {
    ok(Claim, { ...clone(ex.revenueClaim), verification: { ...clone(ex.revenueClaim.verification), freshness: "stale" } });
    ok(EvidenceAssessment, { evidenceId: "ev_aapl_rev_fy2024", assessedAt: "2026-09-30T12:00:00Z", freshnessPolicy: "latest_fiscal_year@1", freshness: "stale" });
  });
  it("superseded evidence forces re-verification", () => {
    bad(Claim, { ...clone(ex.revenueClaim), verification: { ...clone(ex.revenueClaim.verification), freshness: "superseded" } });
    bad(EvidenceAssessment, { evidenceId: "ev_x", assessedAt: "2026-09-30T12:00:00Z", freshnessPolicy: "p@1", freshness: "superseded" });
  });
  it("insufficient evidence is representable with no evidence at all", () => {
    ok(Claim, ex.noContradictionClaim);
    bad(Claim, { ...clone(ex.noContradictionClaim), verification: { ...clone(ex.noContradictionClaim.verification), strength: "strong" } });
  });
  it("a brief cannot be verification_complete with unverified material claims", () => {
    const b = clone(ex.brief);
    b.claims = b.claims.map((c) => (c.id === "clm_rev_fy2024" ? { ...c, verification: { status: "unverified", freshness: "unknown", strength: "none" } } : c));
    bad(ResearchBrief, b);
    ok(ResearchBrief, { ...b, status: "draft" });
  });
});

describe("Verification method and verifier consistency", () => {
  const engine = { kind: "deterministic_engine", engine: "finance-math", engineVersion: "1" } as const;
  const human = { kind: "user", userId: "usr_reviewer" } as const;
  const llm = { kind: "llm", model: "m", promptId: "claim_verifier", promptVersion: "1" } as const;
  const adapter = { kind: "source_adapter", adapter: "a", adapterVersion: "1" } as const;
  const verified = (method: string, verifiedBy: unknown) => ({
    ...clone(ex.revenueClaim),
    verification: { ...clone(ex.revenueClaim.verification), method, verifiedBy },
  });
  const supported = (method: string, verifiedBy: unknown) => ({
    ...clone(ex.growthInterpretationClaim),
    verification: { ...clone(ex.growthInterpretationClaim.verification), method, verifiedBy },
  });

  it("each method requires its matching verifier kind", () => {
    bad(Claim, verified("deterministic_match", llm));
    bad(Claim, verified("deterministic_match", human));
    bad(Claim, verified("deterministic_match", adapter));
    bad(Claim, verified("human_review", engine));
    bad(Claim, verified("human_review", llm));
    bad(Claim, supported("llm_verifier", engine));
    bad(Claim, supported("llm_verifier", human));
  });
  it("a verified claim never has an LLM verifier, whatever the method says", () => {
    bad(Claim, verified("deterministic_match", llm));
    bad(Claim, verified("human_review", llm));
    bad(Claim, verified("llm_verifier", llm));
  });
  it("an LLM-authored claim verified by code or a person remains valid", () => {
    expect(ex.revenueClaim.producedBy.kind).toBe("llm");
    ok(Claim, verified("deterministic_match", engine));
    ok(Claim, verified("human_review", human));
  });
  it("an LLM verifier can still mark a claim supported or insufficient_evidence", () => {
    ok(Claim, supported("llm_verifier", llm));
    ok(Claim, ex.noContradictionClaim);
  });
});

describe("Contradicted vs conflicting", () => {
  const base = clone(ex.revenueClaim);
  const both = [
    { evidenceId: "ev_a", relation: "supports" },
    { evidenceId: "ev_b", relation: "contradicts" },
  ];
  it("contradicted is rejected when supporting evidence also exists", () => {
    bad(Claim, { ...base, evidence: both, verification: { ...base.verification, status: "contradicted", strength: "limited" } });
    bad(Claim, { ...base, evidence: both, verification: { ...base.verification, status: "contradicted", strength: "mixed" } });
  });
  it("the same evidence is valid as conflicting with mixed strength", () => {
    ok(Claim, { ...base, evidence: both, verification: { ...base.verification, status: "conflicting", strength: "mixed" } });
  });
  it("contradicted with only contradicting evidence remains valid", () => {
    ok(Claim, { ...base, evidence: [{ evidenceId: "ev_b", relation: "contradicts" }], verification: { ...base.verification, status: "contradicted", strength: "strong" } });
    ok(Claim, { ...base, evidence: [{ evidenceId: "ev_b", relation: "contradicts" }, { evidenceId: "ev_c", relation: "context" }], verification: { ...base.verification, status: "contradicted", strength: "limited" } });
  });
});

describe("Investment thesis evidence", () => {
  it("an active thesis requires supporting evidence", () => {
    bad(InvestmentThesis, { ...clone(ex.thesis), supportingEvidence: [] });
  });
  it("an active thesis requires contradictory evidence, or a recorded search that found none", () => {
    bad(InvestmentThesis, { ...clone(ex.thesis), contradictoryEvidence: [], contradictionSearch: undefined });
    bad(InvestmentThesis, { ...clone(ex.thesis), contradictoryEvidence: [] }); // search says "found" but lists none
    ok(InvestmentThesis, {
      ...clone(ex.thesis),
      contradictoryEvidence: [],
      contradictionSearch: { performedAt: "2026-09-30T13:00:00Z", result: "none_found", scope: "10-K risk factors, 8-Ks since FY2024" },
    });
  });
  it("evidence relations must match the list they are in", () => {
    bad(InvestmentThesis, { ...clone(ex.thesis), contradictoryEvidence: [{ evidenceId: "ev_x", relation: "supports" }] });
  });
  it("a draft thesis may be incomplete", () => {
    ok(InvestmentThesis, { ...clone(ex.thesis), status: "draft", supportingEvidence: [], contradictoryEvidence: [], contradictionSearch: undefined, assumptions: [], risks: [], invalidationConditions: [] });
  });
  it("an active thesis must say what would invalidate it", () => {
    bad(InvestmentThesis, { ...clone(ex.thesis), invalidationConditions: [] });
  });
});

describe("Corrections and restatements preserve history", () => {
  const original = FinancialFact.parse(ex.revenueFy2024);
  const restated = FinancialFact.parse(ex.revenueFy2024Restated);

  it("the restated fact supersedes the original; the original remains", () => {
    const r = resolveCurrentFact([original, restated]);
    expect(r.kind).toBe("current");
    expect(r.kind === "current" && r.fact.id).toBe(restated.id);
  });
  it("point-in-time resolution before the restatement returns the original", () => {
    const r = resolveCurrentFact([original, restated], "2025-01-01T00:00:00Z");
    expect(r.kind === "current" && r.fact.id).toBe(original.id);
  });
  it("recorded-time axis answers 'what did our system hold then'", () => {
    const r = resolveCurrentFact([original, restated], "2026-09-30T12:01:00Z", "recorded");
    expect(r.kind === "current" && r.fact.id).toBe(original.id);
  });
  it("two current facts for one key surface as a conflict instead of picking one", () => {
    const rival = FinancialFact.parse({ ...clone(ex.revenueFy2024), id: "fact_rival", value: { status: "known", value: { kind: "money", amount: "391000000000", currency: "USD" } } });
    expect(resolveCurrentFact([original, rival]).kind).toBe("conflict");
  });
  it("supersession requires a reason", () => {
    bad(FinancialFact, { ...clone(ex.revenueFy2024Restated), supersessionReason: undefined });
  });
});

describe("Primitives", () => {
  it("timestamps must carry an explicit offset", () => {
    ok(Timestamp, "2026-09-30T12:00:00Z");
    bad(Timestamp, "2026-09-30T12:00:00");
    bad(Timestamp, "2026-09-30");
  });
  it("compareDecimal is exact", () => {
    expect(compareDecimal("0.1", "0.10")).toBe(0);
    expect(compareDecimal("-1.5", "-1.25")).toBe(-1);
    expect(compareDecimal("10", "9.999")).toBe(1);
    expect(compareDecimal("0", "-0.0")).toBe(0);
    expect(compareDecimal("9007199254740993", "9007199254740992")).toBe(1);
  });
  it("price bars enforce low <= open/close <= high", () => {
    bad(PriceBar, { ...clone(ex.aaplBar), high: { kind: "money_per_share", amount: "224.00", currency: "USD" } });
  });
  it("capex is stored as a positive outflow", () => {
    const capex = { ...clone(ex.revenueFy2024), id: "fact_capex", concept: "capital_expenditures", value: { status: "known", value: { kind: "money", amount: "-9447000000", currency: "USD" } } };
    bad(FinancialFact, capex);
  });
  it("EPS facts must name the share class security", () => {
    const eps = { ...clone(ex.epsDilutedUnknown), securityId: undefined };
    bad(FinancialFact, eps);
  });
});
