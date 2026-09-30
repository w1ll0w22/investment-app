/**
 * Identity: Issuer (the company) → Security (the instrument) → Listing (where it trades, under what ticker).
 *
 *   Issuer    Apple Inc. — the legal entity that files with the SEC and reports
 *             financial statements. Financial FACTS attach here.
 *   Security  Apple Inc. common stock — a specific instrument issued by the issuer.
 *             Share counts, EPS class, corporate actions and positions attach here.
 *             One issuer can have many securities (GOOGL vs GOOG, preferreds, notes).
 *   Listing   AAPL on NASDAQ, quoted in USD — a venue + symbol for the security.
 *             QUOTES and PRICE BARS attach here. Tickers are listing attributes,
 *             can change over time, and can be reused by unrelated companies, so a
 *             ticker is never an identity key.
 */
import { z } from "zod";
import { CalendarDate, CurrencyCode, IssuerId, ListingId, SecurityId, TimeZone, maybeKnown } from "./primitives";

/** External identifiers. Values are stored exactly as issued (CIK zero-padded to 10 digits). */
export const IssuerIdentifiers = z
  .object({
    /** SEC Central Index Key, 10 digits zero-padded. Required for SEC-reporting issuers in V0. */
    cik: z.string().regex(/^\d{10}$/).optional(),
    /** ISO 17442 Legal Entity Identifier. */
    lei: z.string().regex(/^[A-Z0-9]{18}\d{2}$/).optional(),
  })
  .strict();

export const Issuer = z
  .object({
    id: IssuerId,
    legalName: z.string().min(1),
    /** Historical names, most recent first. Names change; identity does not. */
    formerNames: z.array(z.object({ name: z.string().min(1), until: CalendarDate }).strict()).default([]),
    identifiers: IssuerIdentifiers,
    /** ISO 3166-1 alpha-2 country of incorporation. */
    countryOfIncorporation: maybeKnown(z.string().regex(/^[A-Z]{2}$/)),
    /**
     * Fiscal year end as MM-DD as declared by the issuer (dei:CurrentFiscalYearEndDate),
     * e.g. "09-28" for Apple FY2024. Some issuers (including Apple) use a 52/53-week
     * year so the actual period end varies; always use FinancialPeriod dates, never
     * this field, to date a fact.
     */
    fiscalYearEnd: maybeKnown(z.string().regex(/^\d{2}-\d{2}$/)),
    /** Presentation currency of the issuer's financial statements. */
    reportingCurrency: maybeKnown(CurrencyCode),
    /** Standard Industrial Classification code as assigned by the SEC. */
    sicCode: maybeKnown(z.string().regex(/^\d{4}$/)),
  })
  .strict();
export type Issuer = z.infer<typeof Issuer>;

export const SecurityType = z.enum([
  "common_equity",
  "preferred_equity",
  "adr",
  "etf",
  "mutual_fund",
  "debt",
  "other",
]);
export type SecurityType = z.infer<typeof SecurityType>;

export const Security = z
  .object({
    id: SecurityId,
    /** Null only for funds or instruments with no SEC-reporting issuer in our model. */
    issuerId: IssuerId.nullable(),
    type: SecurityType,
    /** e.g. "Common Stock", "Class A Common Stock". */
    description: z.string().min(1),
    /** Share class label when an issuer has several (e.g. "A", "C"). */
    shareClass: z.string().min(1).optional(),
    identifiers: z
      .object({
        /** OpenFIGI share-class level FIGI (freely licensed). Preferred internal cross-reference. */
        shareClassFigi: z.string().regex(/^[A-Z0-9]{12}$/).optional(),
        /** ISIN / CUSIP are license-restricted; store only if our data license permits. */
        isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/).optional(),
        cusip: z.string().regex(/^[A-Z0-9]{9}$/).optional(),
      })
      .strict(),
    /** Date the security ceased to exist (delisting alone does not end a security). */
    terminatedOn: CalendarDate.optional(),
  })
  .strict();
export type Security = z.infer<typeof Security>;

export const Listing = z
  .object({
    id: ListingId,
    securityId: SecurityId,
    /** ISO 10383 Market Identifier Code of the exchange, e.g. "XNAS". */
    mic: z.string().regex(/^[A-Z0-9]{4}$/),
    /** Symbol on that venue. Upper-case, as displayed by the exchange. */
    ticker: z.string().min(1).max(12),
    tradingCurrency: CurrencyCode,
    /** Exchange's local time zone, which defines the "session date" of daily bars. */
    exchangeTimeZone: TimeZone,
    isPrimaryListing: z.boolean(),
    /** Symbol validity window. A ticker change creates a new validity window, not a new security. */
    validFrom: CalendarDate,
    validTo: CalendarDate.optional(),
  })
  .strict();
export type Listing = z.infer<typeof Listing>;

/** Result of resolving free text such as "AAPL" or "apple" to our identities. */
export const SecurityResolution = z
  .object({
    query: z.string(),
    candidates: z.array(
      z
        .object({
          issuerId: IssuerId.nullable(),
          securityId: SecurityId,
          listingId: ListingId,
          ticker: z.string(),
          name: z.string(),
          matchType: z.enum(["exact_ticker", "exact_name", "fuzzy", "former_name", "former_ticker"]),
        })
        .strict(),
    ),
  })
  .strict();
export type SecurityResolution = z.infer<typeof SecurityResolution>;
