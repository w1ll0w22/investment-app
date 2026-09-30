/**
 * Provider ports. Core code depends on these interfaces; vendor adapters implement them
 * and are the only code that sees vendor field names. Interfaces only: no provider is
 * integrated in F01.
 *
 * Contract every adapter must honor:
 *   - return canonical types from this package, validated with their Zod schemas
 *   - convert vendor units/scales/signs into canonical ones (whole currency units,
 *     decimal strings, ratios as fractions, positive-outflow capex)
 *   - never fill gaps with 0, "", or the previous value; return unknown(...) instead
 *   - stamp `provider` with our internal ProviderKey and `retrievedAt` with retrieval time
 *   - report failures as ProviderResult errors, never as empty successful data
 */
import type { CalendarDate, ListingId, SecurityId } from "./primitives";
import type { SecurityResolution } from "./identity";
import type { CorporateAction, PriceAdjustment, PriceBar, Quote } from "./market";

export type ProviderError = {
  code: "not_found" | "rate_limited" | "unauthorized" | "unavailable" | "invalid_response" | "unsupported";
  message: string;
  retryable: boolean;
};

export type ProviderResult<T> = { ok: true; data: T } | { ok: false; error: ProviderError };

export interface MarketDataProvider {
  readonly providerKey: string;
  searchSecurities(query: string): Promise<ProviderResult<SecurityResolution>>;
  getQuote(listingId: ListingId): Promise<ProviderResult<Quote>>;
  getHistoricalPrices(req: {
    listingId: ListingId;
    from: CalendarDate;
    to: CalendarDate;
    interval: PriceBar["interval"];
    adjustment: PriceAdjustment;
  }): Promise<ProviderResult<PriceBar[]>>;
  getCorporateActions(req: { securityId: SecurityId; from: CalendarDate; to: CalendarDate }): Promise<ProviderResult<CorporateAction[]>>;
}
