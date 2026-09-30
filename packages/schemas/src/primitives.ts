/**
 * Common primitives shared by every domain contract.
 *
 * Numeric representation (see docs/DATA_PROVENANCE.md §"Numeric representation"):
 *   - Canonical numeric values are DECIMAL STRINGS, never JS numbers.
 *     "391035000000" not 391035000000. Binary floats cannot represent many
 *     decimal amounts exactly, silently lose precision above 2^53, and
 *     provide no way to preserve the reported precision of a filed value.
 *   - Ratios are decimal fractions: "0.2" means 20%. There is no "percent"
 *     unit anywhere in the canonical model; percent is a display concern.
 *
 * Temporal representation:
 *   - CalendarDate: "YYYY-MM-DD", a civil date with NO time zone. Used for
 *     fiscal period boundaries, filing dates, exchange session dates.
 *   - Timestamp: ISO-8601 instant that MUST carry an explicit UTC offset
 *     (normalized to "Z" by adapters). Used for retrieval, acceptance,
 *     quote times, and anything that is a point on the global timeline.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Opaque internal identifiers. Branded so an IssuerId cannot be passed where a SecurityId is expected. */
export const IssuerId = z.string().min(1).brand<"IssuerId">();
export type IssuerId = z.infer<typeof IssuerId>;
export const SecurityId = z.string().min(1).brand<"SecurityId">();
export type SecurityId = z.infer<typeof SecurityId>;
export const ListingId = z.string().min(1).brand<"ListingId">();
export type ListingId = z.infer<typeof ListingId>;
export const FilingId = z.string().min(1).brand<"FilingId">();
export type FilingId = z.infer<typeof FilingId>;
export const FactId = z.string().min(1).brand<"FactId">();
export type FactId = z.infer<typeof FactId>;
export const MetricValueId = z.string().min(1).brand<"MetricValueId">();
export type MetricValueId = z.infer<typeof MetricValueId>;
export const EvidenceId = z.string().min(1).brand<"EvidenceId">();
export type EvidenceId = z.infer<typeof EvidenceId>;
export const ClaimId = z.string().min(1).brand<"ClaimId">();
export type ClaimId = z.infer<typeof ClaimId>;
export const ResearchBriefId = z.string().min(1).brand<"ResearchBriefId">();
export type ResearchBriefId = z.infer<typeof ResearchBriefId>;
export const ThesisId = z.string().min(1).brand<"ThesisId">();
export type ThesisId = z.infer<typeof ThesisId>;
export const UserId = z.string().min(1).brand<"UserId">();
export type UserId = z.infer<typeof UserId>;
export const PortfolioId = z.string().min(1).brand<"PortfolioId">();
export type PortfolioId = z.infer<typeof PortfolioId>;
export const WatchlistId = z.string().min(1).brand<"WatchlistId">();
export type WatchlistId = z.infer<typeof WatchlistId>;

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * A base-10 decimal number as a string. Optional leading minus, no exponent,
 * no thousands separators, no percent sign, no currency symbol.
 */
export const Decimal = z
  .string()
  .regex(/^-?(0|[1-9]\d*)(\.\d+)?$/, "must be a plain decimal string such as \"-12.50\"")
  .refine((s) => s !== "-0" && !/^-0(\.0+)?$/.test(s), "negative zero is not allowed")
  .brand<"Decimal">();
export type Decimal = z.infer<typeof Decimal>;

/** Decimal that must be >= 0 (prices, counts, magnitudes). */
export const NonNegativeDecimal = Decimal.refine((s) => !s.startsWith("-"), "must be >= 0");
export type NonNegativeDecimal = z.infer<typeof NonNegativeDecimal>;

/** ISO 4217 alphabetic currency code. */
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, "must be an ISO 4217 code such as USD");
export type CurrencyCode = z.infer<typeof CurrencyCode>;

/**
 * A monetary amount. Currency is mandatory; there is no implicit USD.
 * `amount` is expressed in whole currency units (dollars, not cents, not millions).
 * Scaling such as "in millions" is an adapter/display concern and never stored.
 */
export const Money = z
  .object({
    kind: z.literal("money"),
    amount: Decimal,
    currency: CurrencyCode,
  })
  .strict();
export type Money = z.infer<typeof Money>;

/** A monetary amount per share (EPS, dividend per share, share price). */
export const MoneyPerShare = z
  .object({
    kind: z.literal("money_per_share"),
    amount: Decimal,
    currency: CurrencyCode,
  })
  .strict();
export type MoneyPerShare = z.infer<typeof MoneyPerShare>;

/** A count of shares. May be fractional only where a source reports it so (e.g. fractional brokerage positions). */
export const ShareCount = z
  .object({
    kind: z.literal("shares"),
    amount: NonNegativeDecimal,
  })
  .strict();
export type ShareCount = z.infer<typeof ShareCount>;

/**
 * A dimensionless ratio as a decimal fraction. 0.2 == 20%. 1.5 == 150%. -0.05 == -5%.
 * Multiples (P/E of 30x) are also ratios: value "30".
 */
export const Ratio = z
  .object({
    kind: z.literal("ratio"),
    value: Decimal,
  })
  .strict();
export type Ratio = z.infer<typeof Ratio>;

/** A plain count or volume (e.g. traded volume in shares is a ShareCount; this is for other counts). */
export const Count = z
  .object({
    kind: z.literal("count"),
    amount: NonNegativeDecimal,
  })
  .strict();
export type Count = z.infer<typeof Count>;

/** Every canonical quantity carries a `kind` tag so a unit can never be inferred from context. */
export const Quantity = z.discriminatedUnion("kind", [Money, MoneyPerShare, ShareCount, Ratio, Count]);
export type Quantity = z.infer<typeof Quantity>;

// ---------------------------------------------------------------------------
// Dates and times
// ---------------------------------------------------------------------------

/** Civil date "YYYY-MM-DD" with no time zone. */
export const CalendarDate = z.iso.date();
export type CalendarDate = z.infer<typeof CalendarDate>;

/** An instant with an explicit offset. Adapters normalize to UTC ("Z"). */
export const Timestamp = z.iso.datetime({ offset: true });
export type Timestamp = z.infer<typeof Timestamp>;

/** IANA time zone name, e.g. "America/New_York". */
export const TimeZone = z.string().min(1);

// ---------------------------------------------------------------------------
// Unknown is not zero
// ---------------------------------------------------------------------------

/**
 * Why a value is not known. Each reason implies different downstream behavior:
 *   not_reported         the source was consulted and does not report the value
 *   not_applicable       the concept does not apply (e.g. gross margin for a bank);
 *                        do NOT display as missing data, display as N/A
 *   not_yet_available    the period has not been reported yet
 *   not_retrieved        we have not attempted retrieval (e.g. out of ingestion scope)
 *   source_unavailable   retrieval was attempted and failed
 *   insufficient_inputs  a derived value lacks one or more required inputs
 *   undefined_result     math is undefined or meaningless (division by zero,
 *                        growth from a negative or zero base, P/E with negative EPS)
 *   conflicting_sources  sources disagree and precedence rules could not resolve it
 *   withheld             value exists but we may not display it (licensing)
 */
export const UnknownReason = z.enum([
  "not_reported",
  "not_applicable",
  "not_yet_available",
  "not_retrieved",
  "source_unavailable",
  "insufficient_inputs",
  "undefined_result",
  "conflicting_sources",
  "withheld",
]);
export type UnknownReason = z.infer<typeof UnknownReason>;

export const UnknownValue = z
  .object({
    status: z.literal("unknown"),
    reason: UnknownReason,
    detail: z.string().optional(),
  })
  .strict();
export type UnknownValue = z.infer<typeof UnknownValue>;

/**
 * Wraps a value that may be unknown. There is deliberately no nullable/undefined
 * shortcut: every consumer must branch on `status`, so "unknown" cannot silently
 * become 0, "", or a missing table cell.
 */
export function maybeKnown<T extends z.ZodTypeAny>(inner: T) {
  return z.discriminatedUnion("status", [
    z.object({ status: z.literal("known"), value: inner }).strict(),
    UnknownValue,
  ]);
}
export type MaybeKnown<T> = { status: "known"; value: T } | UnknownValue;

export const known = <T>(value: T): MaybeKnown<T> => ({ status: "known", value });
export const unknown = (reason: UnknownReason, detail?: string): UnknownValue =>
  detail === undefined ? { status: "unknown", reason } : { status: "unknown", reason, detail };

// ---------------------------------------------------------------------------
// Qualitative uncertainty (no fake numeric confidence)
// ---------------------------------------------------------------------------

/**
 * Qualitative strength of the evidence behind a claim, assumption or brief.
 * Never displayed or stored as a percentage. Derivation rules live in
 * docs/INTELLIGENCE_DOCTRINE.md §"Uncertainty representation".
 */
export const EvidenceStrength = z.enum(["strong", "mixed", "limited", "none"]);
export type EvidenceStrength = z.infer<typeof EvidenceStrength>;

/** Coarse qualitative levels for user-facing judgments (risk severity/likelihood). */
export const QualitativeLevel = z.enum(["low", "medium", "high", "unknown"]);
export type QualitativeLevel = z.infer<typeof QualitativeLevel>;

// ---------------------------------------------------------------------------
// Authorship: who produced a record
// ---------------------------------------------------------------------------

/**
 * Who produced a record. Discriminated so that code can refuse LLM-authored
 * records where only deterministic or source-reported values are allowed.
 */
export const Producer = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("source_adapter"), adapter: z.string().min(1), adapterVersion: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("deterministic_engine"), engine: z.string().min(1), engineVersion: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("llm"), model: z.string().min(1), promptId: z.string().min(1), promptVersion: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("user"), userId: UserId }).strict(),
]);
export type Producer = z.infer<typeof Producer>;

// ---------------------------------------------------------------------------
// Decimal comparison (validation only; arithmetic belongs to finance-math)
// ---------------------------------------------------------------------------

/**
 * Exact comparison of two decimal strings. Returns -1, 0 or 1.
 * Used by schema refinements (e.g. high >= low). This is deliberately the only
 * numeric operation in the schemas package: arithmetic is owned by finance-math.
 */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const neg = (s: string) => s.startsWith("-");
  const abs = (s: string) => (neg(s) ? s.slice(1) : s);
  const isZero = (s: string) => /^-?0(\.0+)?$/.test(s);
  if (isZero(a) && isZero(b)) return 0;
  if (neg(a) !== neg(b)) return neg(a) ? -1 : 1;
  const [ai = "0", af = ""] = abs(a).split(".");
  const [bi = "0", bf = ""] = abs(b).split(".");
  let cmp: -1 | 0 | 1 = 0;
  if (ai.length !== bi.length) cmp = ai.length > bi.length ? 1 : -1;
  else if (ai !== bi) cmp = ai > bi ? 1 : -1;
  else {
    const len = Math.max(af.length, bf.length);
    const ap = af.padEnd(len, "0");
    const bp = bf.padEnd(len, "0");
    if (ap !== bp) cmp = ap > bp ? 1 : -1;
  }
  return neg(a) ? ((-cmp || 0) as -1 | 0 | 1) : cmp;
}
