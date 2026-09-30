/**
 * Derived financial metrics: definitions (what a metric means) and values (one computed result).
 *
 * Every metric value carries a BASIS that removes ambiguity about what was compared.
 * "Revenue growth: 12%" is not representable; "Revenue growth, FY2024 vs FY2023,
 * annual year-over-year: 0.12" is. The schemas validate that the periods actually
 * match the stated basis, so quarterly YoY cannot masquerade as annual YoY.
 *
 * Metric VALUES are produced only by the deterministic finance-math engine (F06).
 * This file defines the contract and the catalog of definitions; it computes nothing.
 */
import { z } from "zod";
import {
  CalendarDate,
  EvidenceId,
  FactId,
  IssuerId,
  ListingId,
  MetricValueId,
  Producer,
  SecurityId,
  Timestamp,
  maybeKnown,
  Money,
  MoneyPerShare,
  Ratio,
} from "./primitives.js";
import { DurationPeriod, FinancialPeriod, type FiscalLabel } from "./periods.js";
import type { FinancialConceptId } from "./financials.js";

// ---------------------------------------------------------------------------
// Basis
// ---------------------------------------------------------------------------

/**
 * Granularity of the measured period.
 *   quarter      a discrete fiscal quarter (Q1..Q4)
 *   fiscal_year  a full fiscal year (FY)
 *   ttm          trailing twelve months (sum of last four discrete quarters)
 */
export const Granularity = z.enum(["quarter", "fiscal_year", "ttm"]);
export type Granularity = z.infer<typeof Granularity>;

export const MetricBasis = z.discriminatedUnion("type", [
  /** Value over a single period, e.g. operating margin or free cash flow for FY2024. */
  z.object({ type: z.literal("single_period"), granularity: Granularity }).strict(),
  /**
   * Growth between two like periods.
   *   year_over_year  same fiscal period, prior fiscal year (Q3 FY24 vs Q3 FY23; FY24 vs FY23; TTM vs TTM one year earlier)
   *   sequential      immediately preceding period of the same granularity (Q3 FY24 vs Q2 FY24). Quarter only.
   */
  z.object({ type: z.literal("growth"), comparison: z.enum(["year_over_year", "sequential"]), granularity: Granularity }).strict(),
  /** Compound annual growth over N fiscal years. */
  z.object({ type: z.literal("cagr"), years: z.number().int().min(2).max(30), granularity: z.enum(["fiscal_year", "ttm"]) }).strict(),
  /** Balance-sheet derived value at an instant (e.g. net debt). */
  z.object({ type: z.literal("instant") }).strict(),
  /**
   * Market price combined with fundamentals (P/E, P/S, EV/EBITDA, FCF yield).
   * `fundamentalGranularity` says which earnings/revenue window is in the denominator.
   * Forward (estimate-based) multiples are not supported in V0: we have no estimates source.
   */
  z.object({ type: z.literal("valuation"), priceTime: Timestamp, fundamentalGranularity: z.enum(["ttm", "fiscal_year"]) }).strict(),
  /** Statistic over a price-return series (volatility, max drawdown, beta, correlation). */
  z
    .object({
      type: z.literal("return_series"),
      windowStart: CalendarDate,
      windowEnd: CalendarDate,
      frequency: z.enum(["daily", "weekly", "monthly"]),
      annualized: z.boolean(),
      priceAdjustment: z.enum(["splits", "splits_and_dividends"]),
      benchmarkListingId: ListingId.optional(),
    })
    .strict(),
]);
export type MetricBasis = z.infer<typeof MetricBasis>;

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export const MetricId = z.enum([
  "revenue_growth",
  "eps_diluted_growth",
  "free_cash_flow_growth",
  "revenue_cagr",
  "free_cash_flow",
  "gross_margin",
  "operating_margin",
  "net_margin",
  "fcf_margin",
  "return_on_equity",
  "return_on_invested_capital",
  "total_debt",
  "net_debt",
  "market_capitalization",
  "price_to_earnings",
  "price_to_sales",
  "ev_to_ebitda",
  "fcf_yield",
  "volatility",
  "beta",
  "max_drawdown",
]);
export type MetricId = z.infer<typeof MetricId>;

export type MetricDefinition = {
  id: MetricId;
  /** Bumped whenever the formula or edge-case policy changes. Values record the version used. */
  version: number;
  label: string;
  output: "ratio" | "money" | "money_per_share";
  basisType: MetricBasis["type"];
  /** Exact formula in terms of canonical concept IDs / other metrics. */
  formula: string;
  inputs: readonly (FinancialConceptId | MetricId | "price" | "shares_outstanding")[];
  /** When the result is unknown rather than a number. */
  undefinedWhen: string;
};

/**
 * V0 metric catalog. Formulas are specifications for F06; nothing here computes.
 * Growth = (current − prior) / |prior| is NOT used: growth from a negative or zero
 * base is `unknown(undefined_result)`, because "growth" from a loss is meaningless and
 * the |prior| convention produces misleading signs.
 */
export const METRIC_DEFINITIONS: Record<MetricId, MetricDefinition> = {
  revenue_growth: { id: "revenue_growth", version: 1, label: "Revenue growth", output: "ratio", basisType: "growth", formula: "revenue[current] / revenue[prior] − 1", inputs: ["revenue"], undefinedWhen: "revenue[prior] <= 0 or either input unknown" },
  eps_diluted_growth: { id: "eps_diluted_growth", version: 1, label: "Diluted EPS growth", output: "ratio", basisType: "growth", formula: "eps_diluted[current] / eps_diluted[prior] − 1", inputs: ["eps_diluted"], undefinedWhen: "eps_diluted[prior] <= 0 or either input unknown" },
  free_cash_flow_growth: { id: "free_cash_flow_growth", version: 1, label: "Free cash flow growth", output: "ratio", basisType: "growth", formula: "free_cash_flow[current] / free_cash_flow[prior] − 1", inputs: ["free_cash_flow"], undefinedWhen: "free_cash_flow[prior] <= 0 or either input unknown" },
  revenue_cagr: { id: "revenue_cagr", version: 1, label: "Revenue CAGR", output: "ratio", basisType: "cagr", formula: "(revenue[end] / revenue[start]) ^ (1 / years) − 1", inputs: ["revenue"], undefinedWhen: "revenue[start] <= 0 or revenue[end] < 0 or either input unknown" },
  free_cash_flow: { id: "free_cash_flow", version: 1, label: "Free cash flow", output: "money", basisType: "single_period", formula: "operating_cash_flow − capital_expenditures", inputs: ["operating_cash_flow", "capital_expenditures"], undefinedWhen: "either input unknown" },
  gross_margin: { id: "gross_margin", version: 1, label: "Gross margin", output: "ratio", basisType: "single_period", formula: "(revenue − cost_of_revenue) / revenue", inputs: ["revenue", "cost_of_revenue"], undefinedWhen: "revenue <= 0 or either input unknown; not_applicable for issuers without cost of revenue (e.g. banks)" },
  operating_margin: { id: "operating_margin", version: 1, label: "Operating margin", output: "ratio", basisType: "single_period", formula: "operating_income / revenue", inputs: ["operating_income", "revenue"], undefinedWhen: "revenue <= 0 or either input unknown" },
  net_margin: { id: "net_margin", version: 1, label: "Net margin", output: "ratio", basisType: "single_period", formula: "net_income / revenue", inputs: ["net_income", "revenue"], undefinedWhen: "revenue <= 0 or either input unknown" },
  fcf_margin: { id: "fcf_margin", version: 1, label: "FCF margin", output: "ratio", basisType: "single_period", formula: "free_cash_flow / revenue", inputs: ["free_cash_flow", "revenue"], undefinedWhen: "revenue <= 0 or either input unknown" },
  return_on_equity: { id: "return_on_equity", version: 1, label: "Return on equity", output: "ratio", basisType: "single_period", formula: "net_income[period] / average(stockholders_equity[period start], stockholders_equity[period end])", inputs: ["net_income", "stockholders_equity"], undefinedWhen: "average equity <= 0 or any input unknown" },
  return_on_invested_capital: { id: "return_on_invested_capital", version: 1, label: "ROIC", output: "ratio", basisType: "single_period", formula: "operating_income × (1 − income_tax_expense / pretax_income) / average(total_debt + stockholders_equity − cash_and_cash_equivalents) over period start/end", inputs: ["operating_income", "income_tax_expense", "pretax_income", "total_debt", "stockholders_equity", "cash_and_cash_equivalents"], undefinedWhen: "pretax_income <= 0, average invested capital <= 0, or any input unknown. Definition is a documented convention; alternatives exist." },
  total_debt: { id: "total_debt", version: 1, label: "Total debt", output: "money", basisType: "instant", formula: "commercial_paper + short_term_borrowings_other + long_term_debt_current + long_term_debt_noncurrent (excludes operating leases)", inputs: ["commercial_paper", "short_term_borrowings_other", "long_term_debt_current", "long_term_debt_noncurrent"], undefinedWhen: "any component unknown, except a component the issuer does not report is treated as not_applicable only when the adapter asserts not_applicable explicitly" },
  net_debt: { id: "net_debt", version: 1, label: "Net debt", output: "money", basisType: "instant", formula: "total_debt − cash_and_cash_equivalents − marketable_securities_current − marketable_securities_noncurrent", inputs: ["total_debt", "cash_and_cash_equivalents", "marketable_securities_current", "marketable_securities_noncurrent"], undefinedWhen: "any input unknown. Negative = net cash." },
  market_capitalization: { id: "market_capitalization", version: 1, label: "Market cap", output: "money", basisType: "valuation", formula: "Σ over share classes (price × shares_outstanding)", inputs: ["price", "shares_outstanding"], undefinedWhen: "any class price or share count unknown" },
  price_to_earnings: { id: "price_to_earnings", version: 1, label: "P/E", output: "ratio", basisType: "valuation", formula: "price / eps_diluted[window]", inputs: ["price", "eps_diluted"], undefinedWhen: "eps_diluted <= 0 (shown as 'n/m', not negative P/E) or any input unknown" },
  price_to_sales: { id: "price_to_sales", version: 1, label: "P/S", output: "ratio", basisType: "valuation", formula: "market_capitalization / revenue[window]", inputs: ["market_capitalization", "revenue"], undefinedWhen: "revenue <= 0 or any input unknown" },
  ev_to_ebitda: { id: "ev_to_ebitda", version: 1, label: "EV/EBITDA", output: "ratio", basisType: "valuation", formula: "(market_capitalization + net_debt[latest instant]) / (operating_income + depreciation_and_amortization)[window]", inputs: ["market_capitalization", "net_debt", "operating_income", "depreciation_and_amortization"], undefinedWhen: "EBITDA <= 0 or any input unknown" },
  fcf_yield: { id: "fcf_yield", version: 1, label: "FCF yield", output: "ratio", basisType: "valuation", formula: "free_cash_flow[window] / market_capitalization", inputs: ["free_cash_flow", "market_capitalization"], undefinedWhen: "market_capitalization <= 0 or any input unknown" },
  volatility: { id: "volatility", version: 1, label: "Volatility", output: "ratio", basisType: "return_series", formula: "sample standard deviation of log returns; × sqrt(periods per year) when annualized", inputs: ["price"], undefinedWhen: "fewer than 20 return observations" },
  beta: { id: "beta", version: 1, label: "Beta", output: "ratio", basisType: "return_series", formula: "cov(r_security, r_benchmark) / var(r_benchmark), simple returns, aligned session dates", inputs: ["price"], undefinedWhen: "no benchmark, fewer than 20 aligned observations, or zero benchmark variance" },
  max_drawdown: { id: "max_drawdown", version: 1, label: "Max drawdown", output: "ratio", basisType: "return_series", formula: "min over t of (P_t / max_{s<=t} P_s − 1); reported as a negative ratio", inputs: ["price"], undefinedWhen: "fewer than 2 observations" },
};

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export const MetricInputRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fact"), factId: FactId }).strict(),
  z.object({ kind: z.literal("metric"), metricValueId: MetricValueId }).strict(),
  z.object({ kind: z.literal("quote"), listingId: ListingId, priceTime: Timestamp }).strict(),
  z.object({ kind: z.literal("price_series"), listingId: ListingId, from: CalendarDate, to: CalendarDate }).strict(),
]);
export type MetricInputRef = z.infer<typeof MetricInputRef>;

export const DerivedMetricValue = z
  .object({
    id: MetricValueId,
    metricId: MetricId,
    metricVersion: z.number().int().positive(),
    subject: z.object({ issuerId: IssuerId.optional(), securityId: SecurityId.optional(), listingId: ListingId.optional() }).strict(),
    basis: MetricBasis,
    /** The measured period (the later one, for growth). Absent for pure market statistics. */
    period: FinancialPeriod.optional(),
    /** For growth/CAGR: the base period. */
    comparisonPeriod: DurationPeriod.optional(),
    value: maybeKnown(z.discriminatedUnion("kind", [Ratio, Money, MoneyPerShare])),
    /** Every input used, so the number can be traced to facts and then to evidence. */
    inputs: z.array(MetricInputRef),
    computedAt: Timestamp,
    /** Always the deterministic engine; enforced below. */
    producedBy: Producer,
    /** Internal-derived evidence record for citing this value in claims. */
    evidenceId: EvidenceId.optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    const def = METRIC_DEFINITIONS[m.metricId];
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    if (m.producedBy.kind !== "deterministic_engine") issue(["producedBy"], "metric values are computed only by the deterministic engine");
    if (m.metricVersion !== def.version) issue(["metricVersion"], `current definition of ${m.metricId} is v${def.version}`);
    if (m.basis.type !== def.basisType) issue(["basis", "type"], `${m.metricId} requires a ${def.basisType} basis`);
    if (m.value.status === "known") {
      if (m.value.value.kind !== def.output) issue(["value"], `${m.metricId} output is ${def.output}`);
      if (m.inputs.length === 0) issue(["inputs"], "a known metric value must list its inputs");
    }
    const b = m.basis;
    if (b.type === "growth" || b.type === "cagr" || b.type === "single_period") {
      if (!m.period || m.period.kind !== "duration") return issue(["period"], `${b.type} metrics require a duration period`);
      if (!matchesGranularity(m.period.fiscalLabel, b.granularity)) issue(["period", "fiscalLabel"], `period ${m.period.fiscalLabel} does not match granularity ${b.granularity}`);
    }
    if (b.type === "growth" || b.type === "cagr") {
      const cur = m.period;
      const prior = m.comparisonPeriod;
      if (!cur || cur.kind !== "duration" || !prior) return issue(["comparisonPeriod"], "growth metrics require a comparisonPeriod");
      if (!matchesGranularity(prior.fiscalLabel, b.granularity)) issue(["comparisonPeriod", "fiscalLabel"], "comparison period granularity differs");
      if (b.type === "growth" && b.comparison === "year_over_year") {
        if (prior.fiscalLabel !== cur.fiscalLabel || prior.fiscalYear !== cur.fiscalYear - 1) {
          issue(["comparisonPeriod"], "year_over_year compares the same fiscal period one fiscal year earlier");
        }
      }
      if (b.type === "growth" && b.comparison === "sequential") {
        if (b.granularity !== "quarter") issue(["basis", "granularity"], "sequential growth is defined for quarters only");
        else if (!isPrecedingQuarter(prior, cur)) issue(["comparisonPeriod"], "sequential compares the immediately preceding fiscal quarter");
      }
      if (b.type === "cagr" && (prior.fiscalYear !== cur.fiscalYear - b.years || prior.fiscalLabel !== cur.fiscalLabel)) {
        issue(["comparisonPeriod"], `cagr over ${b.years} years needs a base period ${b.years} fiscal years earlier`);
      }
    } else if (m.comparisonPeriod) {
      issue(["comparisonPeriod"], "only growth/cagr metrics have a comparison period");
    }
    if (b.type === "instant" && m.period?.kind !== "instant") issue(["period"], "instant metrics require an instant period");
  });
export type DerivedMetricValue = z.infer<typeof DerivedMetricValue>;

function matchesGranularity(label: FiscalLabel, g: Granularity): boolean {
  if (g === "quarter") return label === "Q1" || label === "Q2" || label === "Q3" || label === "Q4";
  if (g === "fiscal_year") return label === "FY";
  return label === "TTM";
}

function isPrecedingQuarter(prior: DurationPeriod, cur: DurationPeriod): boolean {
  const q = (l: FiscalLabel) => Number(l.slice(1));
  const idx = (p: DurationPeriod) => p.fiscalYear * 4 + q(p.fiscalLabel) - 1;
  return idx(cur) - idx(prior) === 1;
}

/**
 * Unambiguous human label for a metric value. The UI must use this (or an equivalent
 * rendering of the same fields); a bare metric name with a number is not allowed.
 */
export function describeMetric(m: Pick<DerivedMetricValue, "metricId" | "basis" | "period" | "comparisonPeriod">): string {
  const name = METRIC_DEFINITIONS[m.metricId].label;
  const p = (x: FinancialPeriod | undefined) =>
    !x ? "?" : x.kind === "instant" ? `as of ${x.date}` : x.fiscalLabel === "FY" ? `FY${x.fiscalYear}` : x.fiscalLabel === "TTM" ? `TTM to ${x.end}` : `${x.fiscalLabel} FY${x.fiscalYear}`;
  const b = m.basis;
  switch (b.type) {
    case "growth": {
      const kind = b.comparison === "sequential" ? "sequential (quarter-over-quarter)" : `${b.granularity === "quarter" ? "quarterly" : b.granularity === "fiscal_year" ? "annual" : "TTM"} year-over-year`;
      return `${name}, ${p(m.period)} vs ${p(m.comparisonPeriod)}, ${kind}`;
    }
    case "cagr":
      return `${name}, ${b.years}-year CAGR, ${p(m.comparisonPeriod)} to ${p(m.period)}`;
    case "single_period":
      return `${name}, ${p(m.period)}`;
    case "instant":
      return `${name}, ${p(m.period)}`;
    case "valuation":
      return `${name}, price at ${b.priceTime}, ${b.fundamentalGranularity === "ttm" ? "trailing twelve months" : "last fiscal year"} fundamentals`;
    case "return_series":
      return `${name}, ${b.frequency} returns ${b.windowStart} to ${b.windowEnd}${b.annualized ? ", annualized" : ""}`;
  }
}
