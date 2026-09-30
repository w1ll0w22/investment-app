/**
 * Investment Memory: theses, assumptions, risks, invalidation conditions, decisions, reviews.
 *
 * An InvestmentThesis belongs to a USER. It is the user's reasoning, not the product's
 * recommendation. AI may draft or challenge parts of it; the user owns and accepts it.
 *
 * Theses are versioned by immutable revisions: editing a thesis creates revision n+1
 * pointing at revision n. Decisions reference the exact revision in force when made,
 * so a later review can ask "was the reasoning I actually had correct?".
 */
import { z } from "zod";
import { CalendarDate, EvidenceStrength, QualitativeLevel, Quantity, SecurityId, ThesisId, Timestamp, UserId, maybeKnown, MoneyPerShare } from "./primitives.js";
import { EvidenceReference } from "./evidence.js";
import { MetricId } from "./metrics.js";

/** A condition that can be evaluated deterministically against a future metric value. */
export const MeasurableCondition = z
  .object({
    metricId: MetricId,
    /** Plain-language basis, e.g. "quarterly year-over-year". Must match what the metric will be computed as. */
    basisDescription: z.string().min(1),
    comparator: z.enum([">", ">=", "<", "<="]),
    threshold: Quantity,
    /** Evaluate no later than this date. */
    evaluateBy: CalendarDate,
  })
  .strict();
export type MeasurableCondition = z.infer<typeof MeasurableCondition>;

const Origin = z.enum(["user", "ai_suggested_user_accepted", "filing_risk_factor"]);

export const Assumption = z
  .object({
    id: z.string().min(1),
    statement: z.string().min(1).max(1000),
    category: z.enum(["growth", "margins", "capital_allocation", "competition", "product", "regulation", "macro", "valuation", "management", "other"]),
    measurable: MeasurableCondition.optional(),
    evidence: z.array(EvidenceReference).default([]),
    evidenceStrength: EvidenceStrength,
    /** Status is updated by monitoring; each change is a new thesis revision. */
    status: z.enum(["untested", "holding", "weakening", "broken", "unknown"]),
    origin: Origin,
  })
  .strict();
export type Assumption = z.infer<typeof Assumption>;

export const Risk = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    category: z.enum(["business", "financial", "valuation", "competitive", "regulatory_legal", "macro", "concentration", "liquidity", "governance", "other"]),
    /** Qualitative only. No probability numbers. */
    severity: QualitativeLevel,
    likelihood: QualitativeLevel,
    evidence: z.array(EvidenceReference).default([]),
    /** What to watch that would show the risk materializing. */
    monitoringSignal: z.string().max(500).optional(),
    origin: Origin,
  })
  .strict();
export type Risk = z.infer<typeof Risk>;

export const InvalidationCondition = z
  .object({
    id: z.string().min(1),
    /** "If X happens, my thesis is wrong." */
    description: z.string().min(1).max(1000),
    measurable: MeasurableCondition.optional(),
    status: z.enum(["not_triggered", "triggered", "unknown"]),
  })
  .strict();
export type InvalidationCondition = z.infer<typeof InvalidationCondition>;

export const InvestmentThesis = z
  .object({
    /** Stable id of the thesis across revisions. */
    id: ThesisId,
    revision: z.number().int().positive(),
    createdAt: Timestamp,
    ownerUserId: UserId,
    securityId: SecurityId,
    title: z.string().min(1).max(200),
    /** The user's view. Describes the user's reasoning; the product never assigns one. */
    stance: z.enum(["positive", "negative", "neutral", "undecided"]),
    statement: z.string().min(1).max(5000),
    horizon: z.object({ start: CalendarDate, reviewBy: CalendarDate }).strict(),
    assumptions: z.array(Assumption),
    risks: z.array(Risk),
    invalidationConditions: z.array(InvalidationCondition),
    supportingEvidence: z.array(EvidenceReference),
    contradictoryEvidence: z.array(EvidenceReference),
    /**
     * Record that contradicting evidence was actively searched for. Lets a thesis be
     * active when an honest search found none, instead of forcing fake contradictions.
     */
    contradictionSearch: z
      .object({ performedAt: Timestamp, result: z.enum(["found", "none_found"]), scope: z.string().min(1) })
      .strict()
      .optional(),
    status: z.enum(["draft", "active", "invalidated", "closed"]),
  })
  .strict()
  .superRefine((t, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    t.supportingEvidence.forEach((r, i) => r.relation !== "supports" && issue(["supportingEvidence", i, "relation"], "supportingEvidence must have relation supports"));
    t.contradictoryEvidence.forEach((r, i) => r.relation !== "contradicts" && issue(["contradictoryEvidence", i, "relation"], "contradictoryEvidence must have relation contradicts"));
    if (t.horizon.reviewBy < t.horizon.start) issue(["horizon", "reviewBy"], "reviewBy before start");
    if (t.status !== "draft") {
      if (t.supportingEvidence.length === 0) issue(["supportingEvidence"], "a non-draft thesis requires supporting evidence");
      if (t.assumptions.length === 0) issue(["assumptions"], "a non-draft thesis must state its assumptions");
      if (t.risks.length === 0) issue(["risks"], "a non-draft thesis must state its risks");
      if (t.invalidationConditions.length === 0) issue(["invalidationConditions"], "a non-draft thesis must say what would prove it wrong");
      const searched = t.contradictionSearch !== undefined;
      if (t.contradictoryEvidence.length === 0 && t.contradictionSearch?.result !== "none_found") {
        issue(["contradictoryEvidence"], "a non-draft thesis requires contradictory evidence or a recorded search that found none");
      }
      if (!searched) issue(["contradictionSearch"], "a non-draft thesis must record the search for contradicting evidence");
      if (t.contradictoryEvidence.length > 0 && t.contradictionSearch?.result === "none_found") issue(["contradictionSearch", "result"], "search says none_found but contradictory evidence is listed");
    }
    if (t.status === "invalidated" && !t.invalidationConditions.some((c) => c.status === "triggered")) {
      issue(["status"], "an invalidated thesis must have a triggered invalidation condition");
    }
  });
export type InvestmentThesis = z.infer<typeof InvestmentThesis>;

/**
 * A decision the USER records. V0 never executes trades; "recorded_buy" means the user
 * says they bought elsewhere.
 */
export const DecisionRecord = z
  .object({
    id: z.string().min(1),
    thesisId: ThesisId,
    thesisRevision: z.number().int().positive(),
    userId: UserId,
    decidedAt: Timestamp,
    action: z.enum(["start_research", "add_to_watchlist", "remove_from_watchlist", "recorded_buy", "recorded_add", "recorded_trim", "recorded_sell", "hold", "pass"]),
    rationale: z.string().min(1).max(5000),
    priceAtDecision: maybeKnown(MoneyPerShare),
  })
  .strict();
export type DecisionRecord = z.infer<typeof DecisionRecord>;

/** Retrospective: was the reasoning right, independent of whether the price went up. */
export const ThesisReview = z
  .object({
    id: z.string().min(1),
    thesisId: ThesisId,
    thesisRevision: z.number().int().positive(),
    reviewedAt: Timestamp,
    assumptionOutcomes: z.array(z.object({ assumptionId: z.string().min(1), outcome: z.enum(["held", "partially_held", "failed", "unknown"]), note: z.string().max(1000).optional() }).strict()),
    thesisOutcome: z.enum(["reasoning_correct", "reasoning_partially_correct", "reasoning_incorrect", "too_early_to_tell"]),
    /** Separates luck from skill: a good price outcome with wrong reasoning is recorded as such. */
    priceOutcomeAlignedWithReasoning: maybeKnown(z.boolean()),
    lessons: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type ThesisReview = z.infer<typeof ThesisReview>;
