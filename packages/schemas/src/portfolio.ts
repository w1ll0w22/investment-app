/**
 * Portfolio, Position, Watchlist.
 *
 * These record what the USER holds or follows. Stored fields are user- or import-
 * provided facts (quantities, cost basis). Market value, weights, P&L, concentration
 * are DERIVED by finance-math at read time from positions + quotes and never stored
 * here, so they cannot drift from prices.
 */
import { z } from "zod";
import { CalendarDate, CurrencyCode, Money, PortfolioId, SecurityId, ShareCount, ThesisId, Timestamp, UserId, WatchlistId, maybeKnown } from "./primitives.js";

export const TaxLot = z
  .object({
    quantity: ShareCount,
    acquiredOn: maybeKnown(CalendarDate),
    /** Total cost for the lot including fees, in the lot's currency. */
    costBasis: maybeKnown(Money),
  })
  .strict();

export const Position = z
  .object({
    securityId: SecurityId,
    quantity: ShareCount,
    /** Unknown cost basis stays unknown; it is never assumed to be zero or the current price. */
    costBasisTotal: maybeKnown(Money),
    lots: z.array(TaxLot).default([]),
    /** Free-text label for the user's account ("Roth IRA"). No account numbers stored. */
    accountLabel: z.string().max(100).optional(),
    thesisId: ThesisId.optional(),
  })
  .strict();
export type Position = z.infer<typeof Position>;

export const Portfolio = z
  .object({
    id: PortfolioId,
    ownerUserId: UserId,
    name: z.string().min(1).max(100),
    /** Currency in which derived totals are expressed. FX conversion is explicit and derived. */
    baseCurrency: CurrencyCode,
    positions: z.array(Position),
    cash: z.array(Money).default([]),
    /** When the holdings snapshot was true, per the user or import. */
    holdingsAsOf: Timestamp,
    source: z.enum(["manual_entry", "file_import"]),
  })
  .strict()
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    p.positions.forEach((pos, i) => {
      const key = `${pos.securityId}|${pos.accountLabel ?? ""}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["positions", i], message: "duplicate position for security/account; merge lots instead" });
      seen.add(key);
    });
    const cur = new Set<string>();
    p.cash.forEach((m, i) => {
      if (cur.has(m.currency)) ctx.addIssue({ code: "custom", path: ["cash", i], message: "one cash balance per currency" });
      cur.add(m.currency);
    });
  });
export type Portfolio = z.infer<typeof Portfolio>;

export const WatchlistItem = z
  .object({
    securityId: SecurityId,
    addedAt: Timestamp,
    note: z.string().max(2000).optional(),
    thesisId: ThesisId.optional(),
  })
  .strict();
export type WatchlistItem = z.infer<typeof WatchlistItem>;

export const Watchlist = z
  .object({
    id: WatchlistId,
    ownerUserId: UserId,
    name: z.string().min(1).max(100),
    items: z.array(WatchlistItem),
  })
  .strict()
  .superRefine((w, ctx) => {
    const ids = w.items.map((i) => i.securityId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["items"], message: "a security appears at most once per watchlist" });
  });
export type Watchlist = z.infer<typeof Watchlist>;
