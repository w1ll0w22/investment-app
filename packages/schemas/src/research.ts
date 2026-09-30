/**
 * ResearchBrief: a structured, evidence-linked research output about one security.
 *
 * A brief is a container of Claims organized into sections. It has no free-floating
 * prose that escapes verification: every statement a user reads is a Claim (or an
 * explicitly labelled open question / limitation).
 *
 * Regulatory boundary: the schema is `.strict()` and has no recommendation, rating,
 * price target or action field. A brief that tries to carry `rating: "BUY"` fails
 * validation. Risks and contradicting evidence are REQUIRED sections, so downside is
 * structurally as prominent as upside.
 */
import { z } from "zod";
import { ClaimId, EvidenceId, EvidenceStrength, IssuerId, ListingId, MetricValueId, Producer, ResearchBriefId, SecurityId, Timestamp } from "./primitives";
import { Claim } from "./claims";

export const ResearchSectionKind = z.enum([
  "business_overview", // how the company makes money
  "financial_summary", // what the numbers say
  "recent_developments", // what is changing
  "valuation_context", // what expectations the price appears to embed
  "supporting_evidence", // evidence for the bull case
  "contradicting_evidence", // evidence against it
  "risks",
  "catalysts",
  "open_questions",
]);
export type ResearchSectionKind = z.infer<typeof ResearchSectionKind>;

export const REQUIRED_SECTIONS: readonly ResearchSectionKind[] = [
  "business_overview",
  "financial_summary",
  "supporting_evidence",
  "contradicting_evidence",
  "risks",
];

export const ResearchSection = z
  .object({
    kind: ResearchSectionKind,
    title: z.string().min(1),
    /** Ordered claim ids from `ResearchBrief.claims`. */
    claimIds: z.array(ClaimId),
    /** When a section is empty, say why ("No contradicting evidence found in sources X, Y"). Empty sections are never silently dropped. */
    emptyReason: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.claimIds.length === 0 && !s.emptyReason) ctx.addIssue({ code: "custom", path: ["emptyReason"], message: "an empty section must state why it is empty" });
  });
export type ResearchSection = z.infer<typeof ResearchSection>;

/**
 * draft                 generated, not yet checked
 * verification_complete every material claim has a status other than unverified
 * Additional statuses (withdrawn, superseded) are expressed by `supersededBy`.
 */
export const ResearchBriefStatus = z.enum(["draft", "verification_complete"]);

export const ResearchBrief = z
  .object({
    id: ResearchBriefId,
    subject: z.object({ issuerId: IssuerId, securityId: SecurityId, listingId: ListingId.optional() }).strict(),
    /** The user's question that prompted the brief, if any. */
    question: z.string().max(2000).optional(),
    /** Data cutoff: nothing knowable after this time was used. */
    dataAsOf: Timestamp,
    createdAt: Timestamp,
    producedBy: Producer,
    sections: z.array(ResearchSection).min(1),
    claims: z.array(Claim),
    /** Deterministic metric values the brief relied on. */
    metricValueIds: z.array(MetricValueId).default([]),
    /** All evidence consulted, including evidence not cited in a claim. */
    evidenceConsulted: z.array(EvidenceId).default([]),
    /** Overall qualitative strength; derived from claim strengths, never a percentage. */
    overallEvidenceStrength: EvidenceStrength,
    /** Known gaps: unknown data, stale inputs, sources not consulted. */
    limitations: z.array(z.string().min(1)).default([]),
    status: ResearchBriefStatus,
    /** Framing is fixed in V0. */
    framing: z.literal("research_and_education_not_advice"),
    supersededBy: ResearchBriefId.optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const ids = new Set(b.claims.map((c) => c.id));
    if (ids.size !== b.claims.length) issue(["claims"], "duplicate claim ids");
    const kinds = new Set(b.sections.map((s) => s.kind));
    for (const k of REQUIRED_SECTIONS) if (!kinds.has(k)) issue(["sections"], `missing required section ${k}`);
    b.sections.forEach((s, i) =>
      s.claimIds.forEach((id, j) => {
        if (!ids.has(id)) issue(["sections", i, "claimIds", j], `unknown claim ${id}`);
      }),
    );
    if (b.status === "verification_complete") {
      b.claims.forEach((c, i) => {
        if (c.materiality === "material" && c.verification.status === "unverified") issue(["claims", i], "material claim still unverified");
      });
    }
    if (Date.parse(b.dataAsOf) > Date.parse(b.createdAt)) issue(["dataAsOf"], "data cutoff cannot be after creation");
  });
export type ResearchBrief = z.infer<typeof ResearchBrief>;
