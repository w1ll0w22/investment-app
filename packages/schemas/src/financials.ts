/**
 * Normalized financial facts.
 *
 * A FinancialFact is one canonical value for one issuer, one concept, one period and
 * one reporting scope, as reported in (or arithmetically derived from) primary sources.
 *
 * Facts are IMMUTABLE and APPEND-ONLY. When an amendment, restatement or recast
 * changes a value, a new fact is written that `supersedes` the old one. The old
 * fact remains queryable forever, so we can always answer "what did we show on
 * date X and why". Which fact is current is computed (see `resolveCurrentFact`),
 * never stored as a mutable flag.
 *
 * Facts are written only by source adapters (as reported) or the deterministic
 * engine (arithmetic derivations such as Q4 = FY − YTD9). LLMs and users cannot
 * produce or modify facts.
 */
import { z } from "zod";
import { EvidenceId, FactId, FilingId, IssuerId, Producer, SecurityId, Timestamp, maybeKnown, Money, MoneyPerShare, ShareCount } from "./primitives";
import { FinancialPeriod } from "./periods";

// ---------------------------------------------------------------------------
// Concept catalog
// ---------------------------------------------------------------------------

export const FinancialConceptId = z.enum([
  // Income statement (duration)
  "revenue",
  "cost_of_revenue",
  "gross_profit",
  "operating_expenses",
  "operating_income",
  "pretax_income",
  "income_tax_expense",
  "net_income",
  "eps_basic",
  "eps_diluted",
  "weighted_average_shares_basic",
  "weighted_average_shares_diluted",
  "depreciation_and_amortization",
  // Cash flow (duration)
  "operating_cash_flow",
  "capital_expenditures",
  "dividends_paid",
  "share_repurchases",
  // Balance sheet (instant)
  "cash_and_cash_equivalents",
  "marketable_securities_current",
  "marketable_securities_noncurrent",
  "commercial_paper",
  "short_term_borrowings_other",
  "long_term_debt_current",
  "long_term_debt_noncurrent",
  "total_assets",
  "total_liabilities",
  "stockholders_equity",
  // Share data (instant)
  "shares_outstanding",
]);
export type FinancialConceptId = z.infer<typeof FinancialConceptId>;

type ConceptSpec = {
  label: string;
  periodKind: "duration" | "instant";
  quantity: "money" | "money_per_share" | "shares";
  /** Whether the fact is per share class (attach securityId) or issuer-wide. */
  perSecurity: boolean;
  /** Canonical sign convention. Adapters convert source signs into this convention. */
  sign: "natural" | "positive_outflow";
  definition: string;
};

/**
 * Canonical semantics for each concept. The mapping from source taxonomies
 * (us-gaap XBRL concepts, vendor fields) to these IDs lives ONLY in adapters.
 */
export const FINANCIAL_CONCEPTS: Record<FinancialConceptId, ConceptSpec> = {
  revenue: { label: "Revenue", periodKind: "duration", quantity: "money", perSecurity: false, sign: "natural", definition: "Total net revenue/net sales recognized in the period, excluding taxes collected from customers." },
  cost_of_revenue: { label: "Cost of revenue", periodKind: "duration", quantity: "money", perSecurity: false, sign: "natural", definition: "Cost of sales for goods and services recognized as revenue; reported as a positive amount." },
  gross_profit: { label: "Gross profit", periodKind: "duration", quantity: "money", perSecurity: false, sign: "natural", definition: "Gross profit/margin as reported. If not reported, it is NOT silently computed into this fact; the gross-margin metric computes from revenue and cost_of_revenue." },
  operating_expenses: { label: "Operating expenses", periodKind: "duration", quantity: "money", perSecurity: false, sign: "natural", definition: "Total operating expenses as reported (excludes cost of revenue)." },
  operating_income: { label: "Operating income", periodKind: "duration", quantity: "money", perSecurity: false, sign: "natural", definition: "Operating income (loss) as reported under GAAP. Negative for an operating loss. Never an adjusted/non-GAAP figure." },
  pretax_income: { label: "Income before taxes", periodKind: "duration", quantity: "money", perSecurity: false, sign: "natural", definition: "Income (loss) from continuing operations before income taxes." },
  income_tax_expense: { label: "Income tax expense", periodKind: "duration", quantity: "money", perSecurity: false, sign: "natural", definition: "Provision for income taxes; negative for a benefit." },
  net_income: { label: "Net income", periodKind: "duration", quantity: "money", perSecurity: false, sign: "natural", definition: "Net income (loss) attributable to the parent's shareholders, GAAP." },
  eps_basic: { label: "EPS (basic)", periodKind: "duration", quantity: "money_per_share", perSecurity: true, sign: "natural", definition: "GAAP basic earnings per share for the security's class, as reported." },
  eps_diluted: { label: "EPS (diluted)", periodKind: "duration", quantity: "money_per_share", perSecurity: true, sign: "natural", definition: "GAAP diluted earnings per share for the security's class, as reported. The default 'EPS' in the product." },
  weighted_average_shares_basic: { label: "Weighted avg. shares (basic)", periodKind: "duration", quantity: "shares", perSecurity: true, sign: "natural", definition: "Weighted average shares outstanding used for basic EPS." },
  weighted_average_shares_diluted: { label: "Weighted avg. shares (diluted)", periodKind: "duration", quantity: "shares", perSecurity: true, sign: "natural", definition: "Weighted average shares used for diluted EPS." },
  depreciation_and_amortization: { label: "Depreciation & amortization", periodKind: "duration", quantity: "money", perSecurity: false, sign: "natural", definition: "D&A as reported in the cash flow statement." },
  operating_cash_flow: { label: "Operating cash flow", periodKind: "duration", quantity: "money", perSecurity: false, sign: "natural", definition: "Net cash provided by (used in) operating activities. Negative when cash is used." },
  capital_expenditures: { label: "Capital expenditures", periodKind: "duration", quantity: "money", perSecurity: false, sign: "positive_outflow", definition: "Payments for acquisition of property, plant and equipment, stored as a POSITIVE amount representing cash spent. Free cash flow = operating_cash_flow − capital_expenditures." },
  dividends_paid: { label: "Dividends paid", periodKind: "duration", quantity: "money", perSecurity: false, sign: "positive_outflow", definition: "Cash dividends paid to shareholders, stored as a positive outflow." },
  share_repurchases: { label: "Share repurchases", periodKind: "duration", quantity: "money", perSecurity: false, sign: "positive_outflow", definition: "Cash paid to repurchase common stock, stored as a positive outflow." },
  cash_and_cash_equivalents: { label: "Cash & equivalents", periodKind: "instant", quantity: "money", perSecurity: false, sign: "natural", definition: "Cash and cash equivalents as reported on the balance sheet. Excludes marketable securities." },
  marketable_securities_current: { label: "Marketable securities (current)", periodKind: "instant", quantity: "money", perSecurity: false, sign: "natural", definition: "Current marketable securities as reported." },
  marketable_securities_noncurrent: { label: "Marketable securities (non-current)", periodKind: "instant", quantity: "money", perSecurity: false, sign: "natural", definition: "Non-current marketable securities as reported." },
  commercial_paper: { label: "Commercial paper", periodKind: "instant", quantity: "money", perSecurity: false, sign: "natural", definition: "Commercial paper outstanding." },
  short_term_borrowings_other: { label: "Other short-term borrowings", periodKind: "instant", quantity: "money", perSecurity: false, sign: "natural", definition: "Short-term borrowings other than commercial paper and current portion of long-term debt." },
  long_term_debt_current: { label: "Term debt (current)", periodKind: "instant", quantity: "money", perSecurity: false, sign: "natural", definition: "Current portion of long-term debt." },
  long_term_debt_noncurrent: { label: "Term debt (non-current)", periodKind: "instant", quantity: "money", perSecurity: false, sign: "natural", definition: "Long-term debt excluding current portion. Excludes operating lease liabilities." },
  total_assets: { label: "Total assets", periodKind: "instant", quantity: "money", perSecurity: false, sign: "natural", definition: "Total assets." },
  total_liabilities: { label: "Total liabilities", periodKind: "instant", quantity: "money", perSecurity: false, sign: "natural", definition: "Total liabilities." },
  stockholders_equity: { label: "Shareholders' equity", periodKind: "instant", quantity: "money", perSecurity: false, sign: "natural", definition: "Total shareholders' equity attributable to the parent." },
  shares_outstanding: { label: "Shares outstanding", periodKind: "instant", quantity: "shares", perSecurity: true, sign: "natural", definition: "Shares of the class outstanding on the instant date. The cover-page count is typically dated weeks after period end; its instant date says so." },
};

// ---------------------------------------------------------------------------
// Fact
// ---------------------------------------------------------------------------

/** V0 facts are consolidated. Segment facts are modeled but not ingested in V0. */
export const ReportingScope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("consolidated") }).strict(),
  z.object({ kind: z.literal("segment"), axis: z.string().min(1), member: z.string().min(1) }).strict(),
]);
export type ReportingScope = z.infer<typeof ReportingScope>;

/**
 * as_reported       the value appears in a filing (possibly after sign/scale normalization)
 * derived_arithmetic the value is computed from other facts by a fixed identity
 *                   (Q4 = FY − YTD9; discrete Q2 cash flow = YTD6 − Q1). Not a "metric":
 *                   the result is the same concept for a different period.
 */
export const FactOrigin = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("as_reported"),
      filingId: FilingId,
      /** XBRL decimals attribute: -6 means the filed value was rounded to millions. INF = exact. */
      reportedDecimals: z.union([z.number().int(), z.literal("INF")]).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("derived_arithmetic"),
      identity: z.enum(["q4_from_fy_minus_ytd9", "discrete_quarter_from_ytd_difference", "sum_of_components"]),
      inputFactIds: z.array(FactId).min(1),
    })
    .strict(),
]);
export type FactOrigin = z.infer<typeof FactOrigin>;

export const SupersessionReason = z.enum([
  /** An amended filing (10-K/A, 10-Q/A) replaced the value. */
  "amendment",
  /** The issuer restated prior-period financials to correct an error. */
  "restatement",
  /** Prior-period value re-presented in a later filing without an error (accounting change, discontinued ops, stock split). */
  "recast",
  /** Our own ingestion/normalization error was corrected. */
  "ingestion_correction",
]);
export type SupersessionReason = z.infer<typeof SupersessionReason>;

const FactValue = maybeKnown(z.discriminatedUnion("kind", [Money, MoneyPerShare, ShareCount]));

export const FinancialFact = z
  .object({
    id: FactId,
    issuerId: IssuerId,
    /** Required for per-security concepts (EPS, share counts); forbidden otherwise. */
    securityId: SecurityId.optional(),
    concept: FinancialConceptId,
    scope: ReportingScope,
    period: FinancialPeriod,
    /** Unknown is explicit: a missing EPS is `{status:"unknown", reason:"not_reported"}`, never 0 and never absent. */
    value: FactValue,
    origin: FactOrigin,
    /** Evidence records backing this value (XBRL fact, filing passage). At least one for as_reported. */
    evidenceIds: z.array(EvidenceId),
    /**
     * Knowledge time: when this value became publicly knowable (filing acceptance time).
     * Distinct from the period it describes and from when we recorded it.
     */
    knownSince: Timestamp,
    /** When this row was written to our store. */
    recordedAt: Timestamp,
    supersedes: FactId.optional(),
    supersessionReason: SupersessionReason.optional(),
    producedBy: Producer,
  })
  .strict()
  .superRefine((f, ctx) => {
    const spec = FINANCIAL_CONCEPTS[f.concept];
    if (f.period.kind !== spec.periodKind) {
      ctx.addIssue({ code: "custom", path: ["period", "kind"], message: `${f.concept} is a ${spec.periodKind} concept` });
    }
    if (f.value.status === "known" && f.value.value.kind !== spec.quantity) {
      ctx.addIssue({ code: "custom", path: ["value"], message: `${f.concept} must be ${spec.quantity}` });
    }
    if (spec.perSecurity !== (f.securityId !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["securityId"], message: spec.perSecurity ? `${f.concept} requires securityId` : `${f.concept} is issuer-wide; securityId not allowed` });
    }
    if (spec.sign === "positive_outflow" && f.value.status === "known" && f.value.value.amount.startsWith("-")) {
      ctx.addIssue({ code: "custom", path: ["value"], message: `${f.concept} is stored as a positive outflow` });
    }
    if ((f.supersedes === undefined) !== (f.supersessionReason === undefined)) {
      ctx.addIssue({ code: "custom", path: ["supersessionReason"], message: "supersedes and supersessionReason go together" });
    }
    if (f.supersedes === f.id) {
      ctx.addIssue({ code: "custom", path: ["supersedes"], message: "a fact cannot supersede itself" });
    }
    if (f.origin.kind === "as_reported") {
      if (f.producedBy.kind !== "source_adapter") ctx.addIssue({ code: "custom", path: ["producedBy"], message: "as_reported facts come from source adapters" });
      if (f.value.status === "known" && f.evidenceIds.length === 0) ctx.addIssue({ code: "custom", path: ["evidenceIds"], message: "a known as_reported fact requires evidence" });
    } else if (f.producedBy.kind !== "deterministic_engine") {
      ctx.addIssue({ code: "custom", path: ["producedBy"], message: "derived facts come from the deterministic engine" });
    }
    if (Date.parse(f.recordedAt) < Date.parse(f.knownSince)) {
      ctx.addIssue({ code: "custom", path: ["recordedAt"], message: "cannot record a fact before it was knowable" });
    }
  });
export type FinancialFact = z.infer<typeof FinancialFact>;

/**
 * Identity of the "slot" a fact fills. Two facts with the same key describe the
 * same thing; if both are current, that is a conflict to resolve (see DATA_PROVENANCE).
 */
export function factKey(f: Pick<FinancialFact, "issuerId" | "securityId" | "concept" | "scope" | "period">): string {
  const scope = f.scope.kind === "consolidated" ? "consolidated" : `segment:${f.scope.axis}=${f.scope.member}`;
  const period = f.period.kind === "duration" ? `D:${f.period.start}..${f.period.end}` : `I:${f.period.date}`;
  return [f.issuerId, f.securityId ?? "-", f.concept, scope, period].join("|");
}

/**
 * Point-in-time resolution of the current fact for one key.
 *
 * Considers only facts visible at `asOf` (defaults to all). Visibility has two time axes:
 *   "knowable" (default) uses knownSince: what the public record said at asOf
 *                        (use for backtests and "was the thesis reasonable then").
 *   "recorded"           uses recordedAt: what OUR system held at asOf
 *                        (use for audit: "why did we display X on that date").
 * Among visible facts, a fact is
 * current if no other considered fact supersedes it. Returns:
 *   - { kind: "current", fact }         exactly one current fact
 *   - { kind: "conflict", facts }       several current facts (unresolved; surface, do not pick)
 *   - { kind: "none" }                  nothing known for this key at asOf
 * Superseded facts are never deleted, so resolving at an earlier asOf reproduces
 * what was believed at that time.
 */
export function resolveCurrentFact(
  facts: readonly FinancialFact[],
  asOf?: string,
  axis: "knowable" | "recorded" = "knowable",
): { kind: "current"; fact: FinancialFact } | { kind: "conflict"; facts: FinancialFact[] } | { kind: "none" } {
  const keys = new Set(facts.map(factKey));
  if (keys.size > 1) throw new Error("resolveCurrentFact expects facts that share one factKey");
  const visible = asOf === undefined ? facts : facts.filter((f) => Date.parse(axis === "knowable" ? f.knownSince : f.recordedAt) <= Date.parse(asOf));
  const superseded = new Set(visible.map((f) => f.supersedes).filter((id): id is FactId => id !== undefined));
  const current = visible.filter((f) => !superseded.has(f.id));
  if (current.length === 0) return { kind: "none" };
  if (current.length === 1) return { kind: "current", fact: current[0]! };
  return { kind: "conflict", facts: current };
}
