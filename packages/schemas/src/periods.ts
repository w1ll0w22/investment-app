/**
 * Financial periods.
 *
 * Two fundamentally different kinds of financial fact exist and must never be mixed:
 *   duration  flow measured over a span (revenue, net income, operating cash flow, capex)
 *   instant   stock measured at a point in time (cash, debt, shares outstanding)
 *
 * `fiscalYear` is the issuer's own fiscal-year label. Apple's fiscal 2024 is the
 * 52-week period ended 2024-09-28; it is NOT calendar 2024. Cross-company
 * comparisons must align on dates, not labels.
 *
 * `fiscalLabel` says what span a duration covers relative to the issuer's fiscal year:
 *   Q1..Q4  a single discrete fiscal quarter (~13 weeks)
 *   H1, H2  a fiscal half
 *   YTD6, YTD9  six / nine month year-to-date spans (10-Q cash-flow statements are YTD!)
 *   FY      the full fiscal year
 *   TTM     trailing twelve months ending at `end` (always derived)
 * The span length is validated against the label so a six-month YTD figure cannot be
 * mislabelled as a quarter.
 */
import { z } from "zod";
import { CalendarDate } from "./primitives.js";

export const FiscalLabel = z.enum(["Q1", "Q2", "Q3", "Q4", "H1", "H2", "YTD6", "YTD9", "FY", "TTM"]);
export type FiscalLabel = z.infer<typeof FiscalLabel>;

/** Inclusive day-count bounds per label. Wide enough for 52/53-week calendars and 4-4-5 quarters. */
export const LABEL_DAY_BOUNDS: Record<FiscalLabel, readonly [number, number]> = {
  Q1: [80, 105],
  Q2: [80, 105],
  Q3: [80, 105],
  Q4: [80, 105],
  H1: [175, 190],
  H2: [175, 190],
  YTD6: [175, 190],
  YTD9: [265, 280],
  FY: [357, 378],
  TTM: [357, 378],
};

const FiscalYear = z.number().int().min(1900).max(2200);

/** Inclusive length in days of [start, end]. */
export function spanDays(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export const DurationPeriod = z
  .object({
    kind: z.literal("duration"),
    /** First day of the period, inclusive. */
    start: CalendarDate,
    /** Last day of the period, inclusive. */
    end: CalendarDate,
    fiscalYear: FiscalYear,
    fiscalLabel: FiscalLabel,
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.end < p.start) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "end must be on or after start" });
      return;
    }
    const days = spanDays(p.start, p.end);
    const [min, max] = LABEL_DAY_BOUNDS[p.fiscalLabel];
    if (days < min || days > max) {
      ctx.addIssue({
        code: "custom",
        path: ["fiscalLabel"],
        message: `${p.fiscalLabel} must span ${min}-${max} days; got ${days}`,
      });
    }
  });
export type DurationPeriod = z.infer<typeof DurationPeriod>;

export const InstantPeriod = z
  .object({
    kind: z.literal("instant"),
    /** The as-of date (end of day). */
    date: CalendarDate,
    /**
     * Fiscal alignment, when the instant is a fiscal period end (balance-sheet date).
     * Omitted for instants that are not period ends, such as a cover-page share count
     * "as of" a date weeks after the fiscal period closed.
     */
    fiscalYear: FiscalYear.optional(),
    fiscalLabel: z.enum(["Q1", "Q2", "Q3", "Q4", "FY"]).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if ((p.fiscalYear === undefined) !== (p.fiscalLabel === undefined)) {
      ctx.addIssue({ code: "custom", path: ["fiscalLabel"], message: "fiscalYear and fiscalLabel must be given together" });
    }
  });
export type InstantPeriod = z.infer<typeof InstantPeriod>;

export const FinancialPeriod = z.discriminatedUnion("kind", [DurationPeriod, InstantPeriod]);
export type FinancialPeriod = z.infer<typeof FinancialPeriod>;
