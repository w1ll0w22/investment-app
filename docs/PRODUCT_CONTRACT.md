# Product Contract (V0)

Status: F01 draft for lead review. Owner: Max. Contracts referenced here live in `packages/schemas/src`.

## 1. North star

The Bloomberg Terminal for ordinary people: an AI-native research and decision-support platform that gives a self-directed investor the equivalent of a personal research department. The loop the product serves is:

Research → Understand → Compare → Challenge → Simulate → Decide → Monitor → Review → Learn

## 2. Target V0 user

A U.S.-based, self-directed retail investor who:

- already buys individual U.S.-listed stocks through their own broker;
- makes their own decisions and wants better reasoning, not a tip;
- can read a headline number but cannot efficiently read a 10-K, reconcile sources, or tell quarterly growth from annual growth;
- holds a small number of positions (roughly 1 to 30) and a watchlist.

Not the V0 user: professionals needing real-time trading tools, options traders, people wanting someone to decide for them, non-U.S. issuers.

## 3. User problem

Ordinary investors decide on low-quality inputs: unsourced numbers, ambiguous metrics ("growth 12%" of what, versus when?), narratives without counter-evidence, and no record of why they bought. They rarely write down what would prove them wrong and never check later whether their reasoning was right.

## 4. Product promise

For any covered U.S. stock, the product will:

1. show authoritative, sourced numbers whose meaning (period, basis, units, origin) is always inspectable;
2. explain how the business makes money and what is changing, with every material factual claim traceable to evidence;
3. present the case against as prominently as the case for;
4. challenge the user's thesis and its own conclusions;
5. remember the user's thesis, assumptions, risks, invalidation conditions and decisions, and later help them review whether the reasoning held.

It will not tell the user what to buy or sell.

## 5. Primary AAPL workflow (V0 target)

| Step | User sees | System does | Contracts |
|---|---|---|---|
| 1. Search "AAPL" or "apple" | Apple Inc. / Common Stock / NASDAQ: AAPL | Resolve text to Issuer → Security → Listing | `SecurityResolution`, `Issuer`, `Security`, `Listing` |
| 2. Open the security page | Price, day change, delay label, as-of time | Fetch quote via `MarketDataProvider` | `Quote` |
| 3. Financials | Revenue, operating income, net income, EPS, OCF, capex, FCF, cash, debt, shares for recent FYs and quarters | Ingest 10-K/10-Q XBRL into facts; compute metrics | `Filing`, `Evidence`, `FinancialFact`, `DerivedMetricValue` |
| 4. Inspect any number | Period, basis ("FY2024 vs FY2023, annual YoY"), source filing, retrieval time, formula and inputs | Traverse metric → facts → evidence → filing | `describeMetric`, `MetricInputRef`, `EvidenceReference` |
| 5. Filings and developments | Recent 10-K/10-Q/8-K list with dates | Ingest EDGAR index | `Filing` |
| 6. Research brief | Business explanation, financial summary, valuation context, evidence for, evidence against, risks, catalysts, open questions | Bounded LLM analysis over evidence package; verifier pass | `ResearchBrief`, `Claim`, `ClaimVerification` |
| 7. Challenge My Thesis | The user's thesis with contradicting evidence, weak assumptions, missing invalidation conditions | Skeptic analysis; claims verified | `InvestmentThesis`, `Assumption`, `Risk`, `InvalidationCondition`, `Claim` |
| 8. Save | Thesis revision stored; optional watchlist add; optional recorded decision | Append thesis revision, decision record | `InvestmentThesis`, `DecisionRecord`, `Watchlist` |
| 9. Later: review | Which assumptions held; was the reasoning right independent of price | Evaluate measurable conditions against new metrics | `ThesisReview` |

## 6. V0 capabilities

Identity and search; current/recent quote; historical daily prices; revenue, operating income, net income, EPS (basic and diluted), operating cash flow, capex, free cash flow, cash, debt, shares; margins; growth; valuation multiples (trailing only); SEC filings list; material developments (8-K); AI company explanation; sourced research brief; risks; catalysts; supporting and contradicting evidence; Challenge My Thesis; citations and provenance on every material claim; claim verification; watchlist; thesis memory; portfolio context (manual entry) later in V0.

## 7. Explicit V0 exclusions

- Brokerage execution, order routing, account linking for trading, automated trading.
- Personalized BUY / SELL / HOLD / STRONG BUY outputs, ratings, price targets, or position sizing instructions. (Enforced structurally: `ResearchBrief` has no such field and is `.strict()`.)
- Options, futures, crypto, FX trading, fixed income analytics; non-U.S. issuers.
- Forward (estimate-based) valuation multiples: no estimates source in V0.
- Premature microservices; training a proprietary foundation model.
- A "terminal-looking" UI ahead of the data, math and evidence layers.

## 8. Product principles

1. Optimize decision quality, not trading volume.
2. Calibrated confidence: never manufacture certainty; no fake percentages.
3. Risk is presented as prominently as upside.
4. AI challenges the user's thesis and its own conclusions.
5. Material factual claims are traceable to evidence.
6. Models reason; code calculates.
7. Unknown means unknown.
8. Build order: TRUTH → MATH → EVIDENCE → INTELLIGENCE → UI.

## 9. Product invariants (testable)

| # | Invariant | Where enforced |
|---|---|---|
| P1 | No displayed number without period, basis, units and origin available on inspection | `FinancialFact`, `DerivedMetricValue`, `describeMetric` |
| P2 | Unknown is never rendered as 0 or blank; it is rendered with its reason | `maybeKnown`, `UnknownReason` |
| P3 | Every canonical financial number was produced by a source adapter or the deterministic engine, never an LLM or user | `Producer` refinements on facts/metrics |
| P4 | Every material factual claim shows its verification status and evidence | `Claim`, `ClaimVerification` |
| P5 | A research brief always contains risks and contradicting-evidence sections, even if empty with a stated reason | `ResearchBrief`, `REQUIRED_SECTIONS` |
| P6 | Research output contains no buy/sell rating, price target, or instruction | `ResearchBrief` is strict, `framing` literal |
| P7 | An active thesis names assumptions, risks, what would invalidate it, supporting evidence, and either contradicting evidence or a recorded search that found none | `InvestmentThesis` |
| P8 | History is never destroyed: facts, evidence and theses are append-only | supersession on `FinancialFact`/`Evidence`, `revision` on thesis |

## 10. Key terminology

| Term | Meaning |
|---|---|
| Issuer | The legal entity (Apple Inc.) that files with the SEC. Financial facts belong to it. |
| Security | An instrument issued by an issuer (Apple common stock). Share counts, EPS, positions belong to it. |
| Listing | A security on a venue under a ticker (AAPL on NASDAQ). Quotes and bars belong to it. Tickers are not identities. |
| Financial fact | One canonical value for issuer × concept × period × scope, as reported or arithmetically derived. Immutable. |
| Derived metric | A value computed by finance-math from facts/prices under a versioned definition and explicit basis (e.g. revenue growth, annual YoY). |
| Basis | What was compared or measured: granularity (quarter/FY/TTM) and comparison (YoY/sequential/CAGR). |
| Evidence | An immutable record of what a source said, with provenance. |
| Claim | One atomic statement shown to the user, typed (quantitative fact, qualitative fact, interpretation, forward-looking), with evidence references and verification. |
| Verification status | What evidence says about a claim: unverified, verified, supported, conflicting, contradicted, insufficient_evidence. |
| Freshness | Whether evidence is current for a use: current, stale, superseded, unknown. Orthogonal to status. |
| Evidence strength | Qualitative: strong, mixed, limited, none. Never a percentage. |
| Research brief | Structured, sectioned collection of claims about one security as of a data cutoff. |
| Investment thesis | The user's own reasoning about a security, with assumptions, risks, invalidation conditions and evidence. Revisioned. |
| Ratio | Decimal fraction: 0.2 = 20%. |

## 11. Product-level regulatory boundary

V0 is research, education, analysis and decision-support software. It:

- does not provide personalized recommendations to buy, sell or hold a security;
- does not execute, route or facilitate transactions;
- does not manage money or hold custody;
- presents analysis as research framed identically for any user viewing the same security (personal context such as portfolio concentration may be shown as facts about the user's own holdings, not as instructions).

We do not assume that disclaimers settle investment-adviser or broker-dealer status. Features that move toward personalization (tailoring conclusions to a user's objectives, risk tolerance, or holdings), suitability, or any transactional capability require an explicit product and legal decision before implementation. Portfolio-context features planned for later in V0 are flagged for that review. This document is a product boundary, not legal advice.
