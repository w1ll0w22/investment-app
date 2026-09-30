# Intelligence Doctrine

Status: F01 draft for lead review. Defines how deterministic software, retrieval, evidence, LLM reasoning and verification divide responsibility. No LLM calls exist yet; this is the contract future layers must satisfy.

## 1. Division of labor: models reason, code calculates

| Responsibility | Owner | May an LLM do it? |
|---|---|---|
| Fetching source data (filings, XBRL, quotes, bars) | Source adapters | No |
| Normalizing vendor/XBRL fields into canonical facts | Source adapters | No |
| Producing `FinancialFact` values | Adapters (as reported), finance-math (arithmetic identities such as Q4 = FY − YTD9) | No. Enforced: `producedBy.kind` must be `source_adapter` or `deterministic_engine`. |
| Producing `DerivedMetricValue` values (growth, margins, multiples, risk stats) | finance-math (F06) | No. Enforced: `producedBy.kind === "deterministic_engine"`. |
| Registering `Evidence` | Adapters, finance-math (derived evidence), users (their notes) | No. Enforced: LLM-produced evidence is rejected. An LLM can cite evidence; it can never be evidence. |
| Choosing which facts/metrics/evidence are relevant to a question | Retrieval + LLM | Yes, within the evidence package |
| Explaining, interpreting, comparing, questioning | LLM | Yes, as typed `Claim`s |
| Deciding a claim is `verified` | Deterministic check or human review | No. An LLM verifier can at most mark `supported`. |
| Arithmetic of any kind shown to a user | finance-math | No. If an explanation needs a number that does not exist as a fact or metric value, the pipeline requests it from finance-math or states it is unavailable. |

LLM-generated arithmetic never overrides canonical calculations. If an LLM output contains a number that differs from the canonical fact/metric it references, the canonical value wins and the claim fails verification.

## 2. Pipeline and responsibilities

```
question → intent/entity resolution → retrieval → normalization → deterministic calculation
        → evidence package → bounded analysis → adversarial challenge → claim verification
        → synthesis → explanation → memory
```

- **Retrieval** returns canonical records only (facts, metric values, filings, evidence with excerpts), each with IDs. It never returns vendor payloads. It records everything consulted (`ResearchBrief.evidenceConsulted`) so absence of contradicting evidence can be qualified by what was searched.
- **Evidence** is immutable and provenance-complete (see DATA_PROVENANCE.md). The evidence package handed to a model is a closed set: the model may cite only IDs in the package.
- **Reasoning** (bounded analysis) produces structured `Claim`s. It may not introduce entities, numbers or sources absent from the package.
- **Adversarial challenge** (Skeptic) receives the same package plus draft claims and must produce contradicting claims, weak-assumption findings and missing-invalidation findings, or state that none were found and what was searched.
- **Verification** assigns `ClaimVerification` to every material claim before a brief can be `verification_complete`.
- **Synthesis/explanation** assembles sections; it may reword claims for readability but not change their factual content, and numbers are rendered from canonical records, not from model text.

## 3. Material-claim grounding rule

A claim is *material* if it would change an investor's understanding of the company, its financials, valuation or risks if it were wrong. Rules:

1. Every material claim goes through verification and displays its status.
2. A `quantitative_fact` claim must reference the `FinancialFact` or `DerivedMetricValue` it states (`factIds` / `metricValueIds`); the number displayed is rendered from that record.
3. A factual claim can be `verified` only with at least one supporting reference to primary evidence (`regulatory_primary` or `issuer_primary`; `internal_derived` is acceptable for a claim that states a metric value, because the metric's inputs trace to primary facts) and no contradicting reference. Cross-record check: `checkClaimEvidence`.
4. Interpretations and forward-looking claims are never `verified`; they are at most `supported`, and must cite the facts they rest on.
5. A material claim with no usable evidence is shown as `insufficient_evidence`, not dropped and not asserted.

## 4. Verification model

The proposed enumeration VERIFIED / SUPPORTED / CONFLICTING / INSUFFICIENT_EVIDENCE / STALE / UNSUPPORTED was normalized into two orthogonal axes.

**Status** — what the evidence says:

| Status | Meaning | Required shape |
|---|---|---|
| `unverified` | Not yet checked. Default for generated claims. | — |
| `verified` | Factual claim matched against authoritative primary evidence by a deterministic check (number equals canonical fact; quote appears verbatim) or human review. | ≥1 supporting ref, 0 contradicting, method ≠ `llm_verifier`, strength `strong`, freshness ≠ `superseded`, type is a fact |
| `supported` | Evidence supports, below the verified standard (secondary sources, interpretation, LLM verifier). | ≥1 supporting, 0 contradicting |
| `conflicting` | Credible evidence on both sides. | ≥1 supporting and ≥1 contradicting; strength `mixed` |
| `contradicted` | Evidence contradicts and nothing credible supports. | ≥1 contradicting, 0 supporting (both present → `conflicting`) |
| `insufficient_evidence` | Checked; nothing or too little bears on it. | strength ≠ `strong` |

**Verifier consistency** — `verification.method` fixes who may perform it: `deterministic_match` → `deterministic_engine`, `human_review` → `user`, `llm_verifier` → `llm`. A `verified` claim never has an LLM verifier. The claim's author (`producedBy`) is independent, so an LLM-written claim can be verified by code or a person.

**Freshness** — whether that evidence is still current for this use: `current`, `stale`, `superseded`, `unknown`.

Why split: "stale" is not an alternative to "verified". "Apple's latest annual revenue was $391.0B" was verified against the FY2024 10-K and becomes stale when the FY2025 10-K is filed; a single enum forces us to lose one of the two facts. "UNSUPPORTED" was ambiguous between "no evidence" (now `insufficient_evidence`) and "evidence says otherwise" (now `contradicted`). `superseded` evidence (amendment/restatement) forces re-verification: a claim cannot remain `verified` against it.

## 5. Uncertainty representation

No numeric confidence (e.g. "87.42%") anywhere in the model. Uncertainty is expressed by:

- **Unknown values** with reasons (`UnknownReason`), never zeros.
- **Verification status** and **freshness** per claim.
- **Evidence strength**: `strong` / `mixed` / `limited` / `none`, derived by rule:
  - `strong`: primary (or deterministic-from-primary) evidence directly establishes it; nothing credible contradicts.
  - `mixed`: credible evidence on both sides.
  - `limited`: only secondary evidence, indirect evidence, or an interpretation resting on few facts.
  - `none`: no bearing evidence.
- **Qualitative levels** (`low` / `medium` / `high` / `unknown`) for risk severity and likelihood.
- **Brief limitations**: every brief lists unknown inputs, stale data and sources not consulted.

A numeric probability may be introduced later only where it is the output of a documented statistical model (e.g. a simulated distribution in scenario math), carries its method, and is produced by finance-math.

## 6. How AI interprets metrics without inventing them

- The model receives metric values with their `describeMetric` label, basis, period, inputs and unknown reasons.
- It may compare, contextualize and explain (e.g. "operating margin, FY2024, is higher than FY2023").
- It may not compute new values (no mental growth rates, no "roughly 2x"), change a basis, or restate a number in different units unless the renderer does it from the canonical record.
- If a metric is `unknown`, the model must say it is unknown and why; it must not estimate it.
- If a needed metric is absent, the model emits an explicit gap (open question / limitation), and the orchestrator may request finance-math to compute it.
- Structured claims carry the metric/fact IDs; a verifier deterministically checks that every number in claim text matches a referenced record after canonical formatting.

## 7. Adversarial / skeptic principle

- Every brief contains `contradicting_evidence` and `risks` sections. If empty, they state why and what was searched.
- Challenge My Thesis runs a skeptic analysis whose job is to find contradicting evidence, fragile assumptions, missing invalidation conditions, and concentration/personal-context risks (when available).
- The skeptic also reviews the system's own brief: claims the skeptic contradicts become `conflicting` or `contradicted`, not silently removed.
- An active thesis must record a contradiction search (`contradictionSearch`), making "I found nothing against this" an explicit, reviewable assertion rather than an omission.

## 8. Structured-output principle

- LLM outputs are parsed into the Zod contracts in `packages/schemas` and rejected if invalid; there is no free-form path to the user for research content.
- Enumerations, not prose, carry states (status, freshness, strength, claim type, section kind).
- IDs, not text, carry references (evidence, facts, metrics).
- Every LLM-produced record records `producedBy: { kind: "llm", model, promptId, promptVersion }` for audit and evaluation.
- Schemas are `.strict()`: unexpected fields (e.g. `rating: "BUY"`) are rejected rather than ignored.

## 9. Future specialist analysts (not implemented in F01)

Specialists are prompt/role configurations over the same contracts, not separate services: Fundamental Analyst, Valuation Analyst, Risk Analyst, Portfolio Analyst, Skeptic, Research Verifier. Each consumes an evidence package and emits `Claim`s tagged by its `promptId`. They share the grounding, verification and structured-output rules above. Orchestration design is deferred until the single-pass pipeline works end to end for AAPL.

## 10. Evaluation philosophy

- **Deterministic first**: finance-math has golden tests against hand-verified filings (AAPL first).
- **Factuality evals**: every number in generated text must match a referenced canonical record; every citation must resolve and support its claim; unsupported-claim rate is tracked per prompt version.
- **Adversarial evals**: seeded theses with known flaws; measure whether the skeptic finds them.
- **Refusal/boundary evals**: prompts that solicit BUY/SELL, price targets or personalized sizing must produce research framing only.
- **Unknown-handling evals**: inputs with missing data must yield explicit unknowns, not estimates.
- **Regression gating**: prompt or model changes ship only if factuality and boundary evals do not regress.
- Evals measure decision-support quality (grounding, balance, calibration), not engagement.
