/**
 * Claims and claim verification.
 *
 * A Claim is one atomic statement shown to a user in research output. Claims are
 * where LLM reasoning meets evidence: the LLM may WRITE claims; it may not make a
 * claim "verified" on its own say-so.
 *
 * Verification status normalizes the originally proposed enumeration
 * (VERIFIED / SUPPORTED / CONFLICTING / INSUFFICIENT_EVIDENCE / STALE / UNSUPPORTED)
 * into two ORTHOGONAL axes:
 *
 *   status     what the evidence says about the claim
 *              unverified | verified | supported | conflicting | contradicted | insufficient_evidence
 *   freshness  whether that evidence is still current for the claim's use
 *              current | stale | superseded | unknown
 *
 * Why: "stale" is not an alternative to "verified". A claim can be verified against a
 * filing that has since become stale (e.g. "latest quarterly revenue" after a new 10-Q).
 * Mixing the axes into one enum forces a choice between losing "verified" or losing
 * "stale". "UNSUPPORTED" was ambiguous between "no evidence found" (now
 * insufficient_evidence) and "evidence says otherwise" (now contradicted).
 * See docs/INTELLIGENCE_DOCTRINE.md §"Verification".
 */
import { z } from "zod";
import { ClaimId, EvidenceStrength, FactId, IssuerId, MetricValueId, Producer, SecurityId, Timestamp } from "./primitives.js";
import { EvidenceFreshness, EvidenceReference, PRIMARY_TIERS, type AuthorityTier, type Evidence } from "./evidence.js";

/**
 * quantitative_fact  a specific number about the world ("FY2024 revenue was $391.0B").
 *                    MUST reference the canonical fact/metric it states; the displayed
 *                    number is rendered from that record, not typed by the LLM.
 * qualitative_fact   a checkable non-numeric statement ("Apple's 10-K lists supply-chain
 *                    concentration in Asia as a risk factor").
 * interpretation     analysis or judgment ("margins are high relative to hardware peers").
 *                    Can be supported or contradicted, never "verified".
 * forward_looking    expectation about the future. Never verified; can be supported or
 *                    contradicted by evidence about the present.
 */
export const ClaimType = z.enum(["quantitative_fact", "qualitative_fact", "interpretation", "forward_looking"]);
export type ClaimType = z.infer<typeof ClaimType>;

export const ClaimVerificationStatus = z.enum([
  "unverified", // not yet checked (default for newly generated claims)
  "verified", // factual claim matched against authoritative primary evidence by a deterministic check or human review
  "supported", // evidence supports it, but not to the standard of "verified" (secondary source, interpretation, LLM verifier)
  "conflicting", // credible evidence both supports and contradicts it
  "contradicted", // evidence contradicts it and nothing credible supports it
  "insufficient_evidence", // checked; no evidence, or evidence too weak to judge
]);
export type ClaimVerificationStatus = z.infer<typeof ClaimVerificationStatus>;

/**
 * deterministic_match  code compared the claim's value/quote to the evidence (numbers equal
 *                      the canonical fact; a quoted passage appears verbatim in the filing)
 * llm_verifier         a separate model judged support. Can never yield "verified".
 * human_review         a person checked it
 */
export const VerificationMethod = z.enum(["deterministic_match", "llm_verifier", "human_review"]);
export type VerificationMethod = z.infer<typeof VerificationMethod>;

/**
 * The only Producer kind that may perform each verification method. Who authored the
 * claim (`Claim.producedBy`) is independent: an LLM-written claim may be verified by
 * code or a person.
 */
export const VERIFIER_KIND_FOR_METHOD = {
  deterministic_match: "deterministic_engine",
  human_review: "user",
  llm_verifier: "llm",
} as const satisfies Record<VerificationMethod, Producer["kind"]>;

export const ClaimVerification = z
  .object({
    status: ClaimVerificationStatus,
    method: VerificationMethod.optional(),
    verifiedAt: Timestamp.optional(),
    verifiedBy: Producer.optional(),
    freshness: EvidenceFreshness,
    /** Qualitative strength of the bearing evidence. For unverified claims this is provisional ("none" until assessed). */
    strength: EvidenceStrength,
    /** Short explanation, e.g. which sources conflict and how. */
    note: z.string().max(2000).optional(),
  })
  .strict();
export type ClaimVerification = z.infer<typeof ClaimVerification>;

export const Claim = z
  .object({
    id: ClaimId,
    type: ClaimType,
    /** material = would change an investor's understanding if wrong. All material claims go through verification. */
    materiality: z.enum(["material", "supporting"]),
    text: z.string().min(1).max(2000),
    subject: z.object({ issuerId: IssuerId.optional(), securityId: SecurityId.optional() }).strict(),
    /** Time at which the claim is asserted to hold ("as of"). */
    asOf: Timestamp,
    /** Canonical numbers the claim states. Required for quantitative facts. */
    factIds: z.array(FactId).default([]),
    metricValueIds: z.array(MetricValueId).default([]),
    evidence: z.array(EvidenceReference).default([]),
    verification: ClaimVerification,
    producedBy: Producer,
  })
  .strict()
  .superRefine((c, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const supports = c.evidence.filter((e) => e.relation === "supports").length;
    const contradicts = c.evidence.filter((e) => e.relation === "contradicts").length;
    const v = c.verification;

    if (c.type === "quantitative_fact" && c.factIds.length + c.metricValueIds.length === 0) {
      issue(["factIds"], "a quantitative claim must reference the canonical fact or metric it states");
    }
    if (v.status !== "unverified" && (!v.method || !v.verifiedAt || !v.verifiedBy)) {
      issue(["verification"], "a checked claim must record method, time and verifier");
    }
    if (v.method && v.verifiedBy && v.verifiedBy.kind !== VERIFIER_KIND_FOR_METHOD[v.method]) {
      issue(["verification", "verifiedBy"], `${v.method} must be performed by ${VERIFIER_KIND_FOR_METHOD[v.method]}, not ${v.verifiedBy.kind}`);
    }
    switch (v.status) {
      case "verified":
        if (c.type !== "quantitative_fact" && c.type !== "qualitative_fact") issue(["verification", "status"], `${c.type} claims cannot be verified; at most supported`);
        if (supports === 0) issue(["evidence"], "a verified claim requires supporting evidence");
        if (contradicts > 0) issue(["verification", "status"], "a claim with contradicting evidence cannot be verified; use conflicting");
        if (v.method === "llm_verifier") issue(["verification", "method"], "an LLM verifier cannot mark a claim verified");
        if (v.verifiedBy?.kind === "llm") issue(["verification", "verifiedBy"], "an LLM verifier cannot mark a claim verified");
        if (v.freshness === "superseded") issue(["verification", "freshness"], "verification against superseded evidence must be redone");
        if (v.strength !== "strong") issue(["verification", "strength"], "verified implies strong evidence");
        break;
      case "supported":
        if (supports === 0) issue(["evidence"], "supported requires supporting evidence");
        if (contradicts > 0) issue(["verification", "status"], "supporting and contradicting evidence together is conflicting");
        break;
      case "conflicting":
        if (supports === 0 || contradicts === 0) issue(["evidence"], "conflicting requires both supporting and contradicting evidence");
        if (v.strength !== "mixed") issue(["verification", "strength"], "conflicting evidence is mixed by definition");
        break;
      case "contradicted":
        if (contradicts === 0) issue(["evidence"], "contradicted requires contradicting evidence");
        if (supports > 0) issue(["verification", "status"], "supporting and contradicting evidence together is conflicting (with mixed strength), not contradicted");
        break;
      case "insufficient_evidence":
        if (v.strength === "strong") issue(["verification", "strength"], "insufficient evidence cannot be strong");
        break;
      case "unverified":
        break;
    }
    if (v.status !== "unverified" && v.strength === "none" && supports + contradicts > 0) issue(["verification", "strength"], "strength none means no bearing evidence");
  });
export type Claim = z.infer<typeof Claim>;

/**
 * Cross-record invariants that need the Evidence records themselves (schema checks
 * above only see references). Returns a list of violations; empty means valid.
 *   - verified requires at least one supporting reference to PRIMARY evidence
 *     (regulatory_primary or issuer_primary), or to internal_derived evidence for a
 *     claim that states a metric value
 *   - every referenced evidence id must exist
 *   - LLM-produced records are never evidence (also enforced in the Evidence schema)
 */
export function checkClaimEvidence(claim: Claim, evidenceById: ReadonlyMap<string, Evidence>): string[] {
  const problems: string[] = [];
  for (const ref of claim.evidence) {
    if (!evidenceById.has(ref.evidenceId)) problems.push(`missing evidence ${ref.evidenceId}`);
  }
  if (claim.verification.status === "verified") {
    const okTiers: AuthorityTier[] = [...PRIMARY_TIERS];
    if (claim.metricValueIds.length > 0) okTiers.push("internal_derived");
    const hasAuthoritative = claim.evidence.some((ref) => {
      const e = evidenceById.get(ref.evidenceId);
      return ref.relation === "supports" && e !== undefined && okTiers.includes(e.authority);
    });
    if (!hasAuthoritative) problems.push("verified claim lacks supporting primary evidence");
  }
  return problems;
}
