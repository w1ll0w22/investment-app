/**
 * Evidence: an immutable, provenance-carrying record of something a source said.
 *
 * Evidence answers: where did this come from, what kind of source, when was it
 * published/filed, what period does it describe, when did we retrieve it,
 * which entity does it concern, how authoritative is it, and has it been superseded.
 *
 * Evidence records are append-only. Supersession is expressed by a NEWER record
 * pointing back at the older one (`supersedes`), never by editing the older one.
 * Whether evidence is "stale" is not stored on the record: staleness depends on
 * the question being asked and the time it is asked, and is computed into an
 * EvidenceAssessment (see below and docs/DATA_PROVENANCE.md).
 */
import { z } from "zod";
import {
  CalendarDate,
  EvidenceId,
  FactId,
  FilingId,
  IssuerId,
  ListingId,
  MetricValueId,
  Producer,
  SecurityId,
  Timestamp,
} from "./primitives";
import { FinancialPeriod } from "./periods";

/**
 * Source authority tiers, highest first. Precedence rules in DATA_PROVENANCE.md.
 *   regulatory_primary    filed with a regulator under legal liability (SEC 10-K, 10-Q, 8-K, XBRL)
 *   issuer_primary        issuer-published but not filed (IR press release, earnings deck, transcript)
 *   market_data_licensed  licensed market data from a contracted provider (quotes, bars, corporate actions)
 *   secondary_reputable   established journalism / reference data aggregators
 *   secondary_unverified  blogs, social media, unknown provenance
 *   internal_derived      produced by our deterministic engine from other evidence
 *   user_provided         entered by the user (their notes, their positions)
 * LLM output is NEVER an evidence source tier. An LLM can cite evidence; it cannot be evidence.
 */
export const AuthorityTier = z.enum([
  "regulatory_primary",
  "issuer_primary",
  "market_data_licensed",
  "secondary_reputable",
  "secondary_unverified",
  "internal_derived",
  "user_provided",
]);
export type AuthorityTier = z.infer<typeof AuthorityTier>;

export const EvidenceSourceType = z.enum([
  "sec_filing_document", // a section/passage of a filed document
  "sec_xbrl_fact", // a tagged XBRL fact from a filing
  "issuer_press_release",
  "issuer_presentation",
  "earnings_call_transcript",
  "market_data", // quote, bar, corporate action from a provider
  "news_article",
  "reference_data", // identifier/classification data
  "derived_calculation", // our finance-math output
  "user_note",
]);
export type EvidenceSourceType = z.infer<typeof EvidenceSourceType>;

/** Default tier implied by a source type. Adapters may downgrade, never upgrade. */
export const DEFAULT_AUTHORITY: Record<EvidenceSourceType, AuthorityTier> = {
  sec_filing_document: "regulatory_primary",
  sec_xbrl_fact: "regulatory_primary",
  issuer_press_release: "issuer_primary",
  issuer_presentation: "issuer_primary",
  earnings_call_transcript: "issuer_primary",
  market_data: "market_data_licensed",
  news_article: "secondary_reputable",
  reference_data: "secondary_reputable",
  derived_calculation: "internal_derived",
  user_note: "user_provided",
};

/** Primary evidence = the originator of the information, filed or published by the issuer itself. */
export const PRIMARY_TIERS: ReadonlySet<AuthorityTier> = new Set(["regulatory_primary", "issuer_primary"]);

/** Where inside a source the relevant content sits. */
export const EvidenceLocator = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("document_section"), section: z.string().min(1), page: z.number().int().positive().optional() }).strict(),
  z.object({ kind: z.literal("text_span"), start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict(),
  z
    .object({
      kind: z.literal("xbrl_fact"),
      /** Full concept QName as filed, e.g. "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax". */
      concept: z.string().min(1),
      contextRef: z.string().min(1),
      unitRef: z.string().min(1),
    })
    .strict(),
  z.object({ kind: z.literal("market_data_record"), dataset: z.enum(["quote", "price_bar", "corporate_action"]), recordKey: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("whole_source") }).strict(),
]);
export type EvidenceLocator = z.infer<typeof EvidenceLocator>;

export const EvidenceSubject = z
  .object({
    issuerIds: z.array(IssuerId).default([]),
    securityIds: z.array(SecurityId).default([]),
    listingIds: z.array(ListingId).default([]),
  })
  .strict();

export const Evidence = z
  .object({
    id: EvidenceId,
    sourceType: EvidenceSourceType,
    authority: AuthorityTier,
    /** Human-readable source name, e.g. "Apple Inc. Form 10-K for fiscal year ended 2024-09-28". */
    title: z.string().min(1),
    publisher: z.string().min(1),
    /** Canonical URL of the source document, when one exists. */
    sourceUri: z.string().url().optional(),
    /** When the source made the information public (press release time, article time). */
    publishedAt: Timestamp.optional(),
    /** For SEC filings: the filing date (EDGAR "filed as of" date). */
    filedOn: CalendarDate.optional(),
    /** Link to our Filing record for SEC-sourced evidence. */
    filingId: FilingId.optional(),
    /** When WE retrieved it. Always required. Never confused with publication. */
    retrievedAt: Timestamp,
    /** Financial period the content describes, when it describes one. */
    period: FinancialPeriod.optional(),
    /** Which entities the content concerns. Empty only for market-wide evidence (e.g. a macro news article). */
    subject: EvidenceSubject,
    locator: EvidenceLocator,
    /** Short verbatim excerpt, subject to licensing. Never paraphrased by an LLM. */
    excerpt: z.string().max(4000).optional(),
    /** SHA-256 of the retrieved raw content, so we can prove what we saw. */
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    /** Links from this evidence record to the canonical records it backs. */
    backs: z
      .object({
        factIds: z.array(FactId).default([]),
        metricValueIds: z.array(MetricValueId).default([]),
      })
      .strict()
      .default({ factIds: [], metricValueIds: [] }),
    /** A newer evidence record may supersede an older one (amended filing, corrected article). */
    supersedes: EvidenceId.optional(),
    supersessionReason: z.enum(["amendment", "restatement", "correction", "retraction", "updated_data"]).optional(),
    producedBy: Producer,
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.supersedes && !e.supersessionReason) {
      ctx.addIssue({ code: "custom", path: ["supersessionReason"], message: "supersedes requires supersessionReason" });
    }
    if (e.producedBy.kind === "llm") {
      ctx.addIssue({ code: "custom", path: ["producedBy"], message: "LLM output cannot be evidence" });
    }
    if (e.sourceType === "derived_calculation" && e.producedBy.kind !== "deterministic_engine") {
      ctx.addIssue({ code: "custom", path: ["producedBy"], message: "derived_calculation evidence must come from the deterministic engine" });
    }
    if ((e.sourceType === "sec_filing_document" || e.sourceType === "sec_xbrl_fact") && !e.filingId) {
      ctx.addIssue({ code: "custom", path: ["filingId"], message: "SEC evidence must reference its Filing" });
    }
    const tierRank = AuthorityTier.options.indexOf(e.authority);
    const defaultRank = AuthorityTier.options.indexOf(DEFAULT_AUTHORITY[e.sourceType]);
    if (tierRank < defaultRank) {
      ctx.addIssue({ code: "custom", path: ["authority"], message: "authority may not exceed the source type's default tier" });
    }
  });
export type Evidence = z.infer<typeof Evidence>;

/**
 * How a piece of evidence bears on a claim, assumption, risk or thesis.
 *   supports     evidence is consistent with and tends to establish the statement
 *   contradicts  evidence is inconsistent with the statement
 *   context      relevant background that neither supports nor contradicts
 */
export const EvidenceRelation = z.enum(["supports", "contradicts", "context"]);
export type EvidenceRelation = z.infer<typeof EvidenceRelation>;

export const EvidenceReference = z
  .object({
    evidenceId: EvidenceId,
    relation: EvidenceRelation,
    /** Narrower locator than the evidence record's own, if the citation is to a sub-part. */
    locator: EvidenceLocator.optional(),
    /** One sentence on why this evidence bears on the statement. May be LLM-written; it is commentary, not evidence. */
    note: z.string().max(1000).optional(),
  })
  .strict();
export type EvidenceReference = z.infer<typeof EvidenceReference>;

/**
 * Freshness of evidence FOR A GIVEN USE at a given time.
 *   current     newest available evidence for the question, within the freshness policy
 *   stale       older than the policy allows (e.g. a quote from yesterday used as "current price",
 *               or a 10-Q superseded in relevance by a newer 10-Q/10-K for "latest quarter")
 *   superseded  an amendment/restatement/correction replaced this evidence
 *   unknown     we cannot determine freshness (e.g. publication date unknown)
 */
export const EvidenceFreshness = z.enum(["current", "stale", "superseded", "unknown"]);
export type EvidenceFreshness = z.infer<typeof EvidenceFreshness>;

/** A point-in-time judgment about a piece of evidence for a particular use. Computed, not stored on Evidence. */
export const EvidenceAssessment = z
  .object({
    evidenceId: EvidenceId,
    assessedAt: Timestamp,
    /** Name + version of the freshness policy applied, e.g. "quote_intraday@1". */
    freshnessPolicy: z.string().min(1),
    freshness: EvidenceFreshness,
    supersededBy: EvidenceId.optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.freshness === "superseded" && !a.supersededBy) {
      ctx.addIssue({ code: "custom", path: ["supersededBy"], message: "superseded evidence must name its successor" });
    }
  });
export type EvidenceAssessment = z.infer<typeof EvidenceAssessment>;
