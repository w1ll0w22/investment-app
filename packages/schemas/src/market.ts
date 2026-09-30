/**
 * Market data: quotes, daily price bars, corporate actions. Attached to a Listing
 * (quotes/bars) or Security (corporate actions). Produced only by market-data
 * adapters behind the MarketDataProvider port (see providers.ts).
 */
import { z } from "zod";
import { CalendarDate, EvidenceId, ListingId, MoneyPerShare, NonNegativeDecimal, SecurityId, ShareCount, Timestamp, compareDecimal } from "./primitives";

/** Our internal provider key (e.g. "provider_a"). Vendor names/field names never leave the adapter. */
export const ProviderKey = z.string().regex(/^[a-z][a-z0-9_]*$/);

/**
 * real_time     exchange-real-time last trade
 * delayed       delayed by `delayMinutes` (typically 15)
 * end_of_day    official close of the most recent completed session
 * indicative    not a trade (e.g. mid-quote); must be labelled as such
 */
export const QuoteTimeliness = z.enum(["real_time", "delayed", "end_of_day", "indicative"]);

export const Quote = z
  .object({
    listingId: ListingId,
    /** Last trade price (or official close for end_of_day). Currency must equal the listing's trading currency. */
    price: MoneyPerShare,
    /** Exchange time of the price, not our retrieval time. */
    priceTime: Timestamp,
    timeliness: QuoteTimeliness,
    delayMinutes: z.number().int().nonnegative().optional(),
    session: z.enum(["pre_market", "regular", "after_hours", "closed"]),
    /** Prior session official close, used for day change. Change is derived, never stored. */
    previousClose: MoneyPerShare.optional(),
    bid: MoneyPerShare.optional(),
    ask: MoneyPerShare.optional(),
    provider: ProviderKey,
    retrievedAt: Timestamp,
    evidenceId: EvidenceId.optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.price.amount.startsWith("-")) ctx.addIssue({ code: "custom", path: ["price"], message: "price must be >= 0" });
    if (q.timeliness === "delayed" && q.delayMinutes === undefined) ctx.addIssue({ code: "custom", path: ["delayMinutes"], message: "delayed quotes must state their delay" });
    for (const k of ["previousClose", "bid", "ask"] as const) {
      const m = q[k];
      if (m && m.currency !== q.price.currency) ctx.addIssue({ code: "custom", path: [k], message: "currency must match price currency" });
    }
  });
export type Quote = z.infer<typeof Quote>;

/**
 * none                  raw traded prices as they printed
 * splits                historical prices divided by subsequent split ratios
 * splits_and_dividends  total-return adjusted (dividends reinvested)
 * Adjusted series change retroactively when a new split/dividend occurs; `adjustedAsOf`
 * records the corporate-action horizon the adjustment reflects.
 */
export const PriceAdjustment = z.enum(["none", "splits", "splits_and_dividends"]);
export type PriceAdjustment = z.infer<typeof PriceAdjustment>;

export const PriceBar = z
  .object({
    listingId: ListingId,
    interval: z.enum(["1d", "1wk", "1mo"]),
    /** Exchange-local session date of the (first) session in the bar. */
    sessionDate: CalendarDate,
    open: MoneyPerShare,
    high: MoneyPerShare,
    low: MoneyPerShare,
    close: MoneyPerShare,
    /** Shares traded. Adjusted inversely with splits when price is split-adjusted. */
    volume: ShareCount,
    adjustment: PriceAdjustment,
    adjustedAsOf: CalendarDate.optional(),
    provider: ProviderKey,
    retrievedAt: Timestamp,
  })
  .strict()
  .superRefine((b, ctx) => {
    const cur = b.close.currency;
    for (const k of ["open", "high", "low"] as const) {
      if (b[k].currency !== cur) ctx.addIssue({ code: "custom", path: [k], message: "all OHLC fields share one currency" });
    }
    if (compareDecimal(b.high.amount, b.low.amount) < 0) ctx.addIssue({ code: "custom", path: ["high"], message: "high < low" });
    for (const k of ["open", "close"] as const) {
      if (compareDecimal(b[k].amount, b.high.amount) > 0 || compareDecimal(b[k].amount, b.low.amount) < 0) {
        ctx.addIssue({ code: "custom", path: [k], message: `${k} outside [low, high]` });
      }
    }
    if (b.adjustment !== "none" && !b.adjustedAsOf) ctx.addIssue({ code: "custom", path: ["adjustedAsOf"], message: "adjusted bars must state adjustedAsOf" });
  });
export type PriceBar = z.infer<typeof PriceBar>;

export const CorporateAction = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("split"),
      securityId: SecurityId,
      exDate: CalendarDate,
      /** A 4-for-1 split is numerator "4", denominator "1". Reverse splits invert. */
      numerator: NonNegativeDecimal,
      denominator: NonNegativeDecimal,
      provider: ProviderKey,
      retrievedAt: Timestamp,
    })
    .strict(),
  z
    .object({
      kind: z.literal("cash_dividend"),
      securityId: SecurityId,
      exDate: CalendarDate,
      recordDate: CalendarDate.optional(),
      payDate: CalendarDate.optional(),
      amountPerShare: MoneyPerShare,
      provider: ProviderKey,
      retrievedAt: Timestamp,
    })
    .strict(),
]);
export type CorporateAction = z.infer<typeof CorporateAction>;
