# Contract Arbitrage Engine: rules and data fields

This is the exact specification the code in `src/engine/` implements. The tests in `src/engine/__tests__/` pin every rule below.
The same rules, generated from the live constants, are shown in the app at **/admin/rules**.

## The one design rule

> Never recommend a contract merely because the projected profit looks good.
> First **prove** that (1) the work can legally be subcontracted, (2) the prime (you) can meet the solicitation's requirements, and (3) the project can be financed without cash you don't have.

Every fact is **pass**, **fail** or **unknown**. *Unknown is never a pass.* A gate is `pass` only when the facts prove it and `fail` only when the facts prove it cannot work.

## Pipeline

```
Sources ─▶ normalize ─▶ read the clauses ─▶ gates ─▶ economics ─▶ rank ─▶ drafts ─▶ YOU decide
(SAM.gov,   (one Opportunity   (rule reader +        (6)        (3 scenarios,  (verdict    (quote request,   (approve, get
 manual)     shape)             optional AI,                      cash timeline) tier, score) inquiry, SOW,     quotes, bid)
                                verbatim evidence)                                          bid, call script)
```

## Data fields

All rates are fractions (0.38 = 38%). Dates are ISO. Money is US dollars. See `src/engine/types.ts`.

### Opportunity
`id`, `source` (sam.gov · fort-worth-bonfire · lamp-texas · texas-esbd · manual), `solicitationNumber`, `title`, `agency`, `scope`, `category` (supply · construction-general · construction-specialty · security-guard · facility-services · professional-services · other-services · unknown), `location{city,state}`, `postedDate`, `dueDate`, `durationDays`, `valueEstimate{low,high}`, `sourceUrl`, `documents[]`, `terms`, `provenance{verified, checkedOn, note}`.

### Terms (what the engine reads off the solicitation; each can carry quoted evidence)
| Field | Values |
| --- | --- |
| `subcontracting` | allowed · prohibited · limited · unknown |
| `subcontractShareCap` | max share of price payable to subs that are not "similarly situated" (fraction) or null |
| `setAside` | none · small-business · 8a · sdvosb · wosb · hubzone · unknown |
| `paymentKind` | net-after-invoice · progress · milestone · after-acceptance · unknown |
| `paymentNetDays`, `invoiceCycleDays`, `retainageRate`, `acceptanceDays` | numbers or null |
| `bidBond`, `performanceBond`, `paymentBond`, `insuranceRequired`, `licensingRequired`, `mandatoryPreBid`, `rapidTurnaround` | yes · no · unknown |
| `insuranceMinLimitUsd`, `minYearsExperience`, `preBidDate` | number / date or null |
| `pastPerformance` | required · scored · none · unknown |

### Inputs (what you enter per opportunity)
`marketPriceUsd` (expected customer price) · `plannedBidUsd` (blank = use market) · `subPriceEstimateUsd` · `subTerms` (pay-when-paid / deposit-balance / net / on-completion; null = unknown) · `costs` (bond premium, insurance premium, registrations, admin, financing, other) · `startLeadDays` (default 14) · `durationDays` (override).

### Settings (defaults; editable in Settings)
| | default |
| --- | --- |
| Available capital | **$300** (hard ceiling) |
| Walk-away margin / target margin | 10% / 20% |
| Minimum profit per job | $250 |
| Overrun cushion (on the sub price) | 5% |
| Max days to first / full payment (from award) | 90 / 150 |
| Minimum days before due date | 7 |

Plus a **company profile**: SAM registration, small business, certifications (8(a), SDVOSB, WOSB, HUBZone), licenses, insurance limit, bonding capacity, years in business, citable past projects. Requirements are checked against it. The defaults are deliberately honest for a new LLC (nothing held), so the engine does not flatter you.

## Gates

| # | Gate | Hard rule? | pass | fail | unknown |
| --- | --- | --- | --- | --- | --- |
| 1 | **Work may be subcontracted** | yes | allowed, or limited and the plan is within the cap | prohibited (incl. "intermediaries not permitted") | silent; limited with no cap; cap exceeded (depends on "similarly situated" subs) |
| 2 | **You can qualify as the prime** | yes | every requirement found is met by your profile | SAM registration missing for a federal award; set-aside you don't hold; insurance/bond/experience/past-performance requirement you can't meet; mandatory pre-bid meeting already past | any requirement not yet established (set-aside, insurance, bonds, license) |
| 3 | **Financeable without cash you don't have** | yes | peak cash needed ≤ capital **even under cautious sub terms** | peak cash > capital **even if the sub is paid only after you are** | between the two: depends on the sub's terms |
| 4 | Leaves enough margin | no | cautious case ≥ walk-away margin and ≥ minimum profit | best case still below | in between |
| 5 | Gets paid soon enough | no | first/full payment within limits | beyond limits | payment clause not found |
| 6 | Enough time to bid | no | ≥ 7 days to due date | passed, or < 7 days | no due date |

Small-business set-asides add a default subcontracting limit (13 CFR 125.6: about 50% services/supplies, 85% general construction, 75% specialty trades) when the clause isn't pasted. A plan above it is **unproven**, not failed, because subs that are "similarly situated" don't count. Confirm the clause in the solicitation; this is a prompt to check, not legal advice.

## Verdicts

| Verdict | Meaning |
| --- | --- |
| **Reject** | at least one gate is proven to fail |
| **Investigate** | nothing failed, but something can't be proven. **Never a bid recommendation.** |
| **Qualified** | all six gates pass, even under cautious assumptions. Get firm quotes next. |
| **Bid-ready** | all six pass on a **firm quote** from a sub who **confirmed they will subcontract under your agreement**, with known payment terms |

Subcontractor outreach drafts are **locked** while gate 1 or 2 is unproven: only the procurement inquiry is produced.

## Economics and the three prices

* `contractValue` = planned bid, else expected market price. `profit = value − sub − itemised costs − overrun cushion`.
* **Net margin** = profit ÷ price. **Markup** = profit ÷ cost. Both are shown; they are never mixed. (A 10% margin on $10,000 is $1,000 before overhead and tax.)
* Without a firm quote the sub price is a band: **optimistic** −15%, **base** = your estimate, **conservative** +25%. Unknown sub terms: optimistic = pay-when-paid, conservative = 30% deposit with the balance at completion. Gates compare the conservative and optimistic cases.
* **Walk-away price** = `max(cost ÷ (1 − walk-away margin), cost + minimum profit)` at the conservative cost.
* **Target bid** = the same at the target margin, capped at the market price, never below walk-away.
* **Max sub price** = the most you can pay at the working bid, limited by the tightest of: margin (`(bid − fixed − required profit) ÷ (1 + cushion)`), **cash** (found by search over the cash timeline against your capital), and any explicit subcontracting cap.

## Cash timeline (the "when do I get paid, and what do I need first" model)

Day 0 is the award. Costs at award go out first. The sub is paid on its terms (pay-when-paid pays at the same moment the customer's money lands; deposit-balance pays a deposit at mobilization and the rest at completion; net and on-completion follow their days). The customer pays on the solicitation's terms: one invoice, recurring invoices (default every 30 days), milestones, or only after acceptance, each plus net days, with retainage held until after completion. **Peak cash required** = the lowest running balance. **First/full payment day** come from the same timeline.

## Ranking

1. Tier: Bid-ready → Qualified → Investigate → Reject.
2. Within a tier: `score = expected profit ÷ (1 + days to first payment ÷ 90) ÷ (1 + peak cash ÷ capital)`, so profit counts for less the later it arrives and the more cash it ties up. Unscored items follow, by soonest due date.

**Expected profit** = win probability × profit if won − bid prep cost.
**Win probability** is a transparent heuristic, not a forecast: base 15% × visible factors (past performance scored with no references ×0.4; price vs market ×1.3 / 1.0 / 0.6 / 0.3, unknown ×0.85; no firm quote ×0.9; set-aside ×1.3; rapid turnaround ×0.7; under 10 days ×0.85), bounded 1% to 60%. Calibrate it from your own results.

## Subcontractor shortlist

Per opportunity each candidate is checked for service match, geography, similar projects, verified license (if required), insurance ≥ required limit with certificate (if required), bonding (if required), confirmed capacity, a firm quote for this scope, and confirmed willingness to subcontract under your agreement.

* **Verified**: every applicable check confirmed, including a firm quote and willingness.
* **Partially verified**: a firm quote, or confirmed willingness, or at least four checks confirmed.
* **Unverified**: anything less, including a directory listing alone.

Gaps are listed ("missing insurance certificate", "license not verified"). Candidates are sorted by label, then fit (0–100), then quote price.

## Reading the clauses

The **rule reader** (always on) finds subcontracting, set-aside, payment, retainage, bonds, insurance, licensing, experience, pre-bid and rapid-turnaround language and stores the sentence it came from. Silence means *unknown*, never *no*. The optional **AI reader** (`ANTHROPIC_API_KEY`) may only *propose* facts: each is accepted only if its supporting quote appears **verbatim** in the document, and conflicts resolve to the stricter reading and are shown to you.

## Drafts (never sent automatically)

Quote request and procurement inquiry use your wording, with the bracketed fields filled and extra lines added for requirements that apply; plus a scope-of-work package, a draft bid outline (with internal numbers kept in a separate "do not send" box), and a phone script. The app has no ability to send anything; it offers Copy and "open in my email app".

## Test results: the three live solicitations (as of 2026-10-25, default settings)

| Solicitation | Verdict | Why |
| --- | --- | --- |
| **Fort Worth 26-0268**, Seasonal and Event Supplies | **Reject** | Intermediaries not permitted (gate 1 fails); substantial insurance required and none held (gate 2 fails); due in 4 days (gate 6 fails). |
| **LAMP RFP-0003**, Site Clearing and Mass Grading | **Investigate** | Nothing fails. Cannot prove: subcontracting rules, prime qualification (set-aside, insurance, bonds, license), financing (no value stated), payment clause. Only the procurement inquiry is drafted. |
| **LAMP RFP-0005**, Construction-Phase Site Security | **Investigate** | Same, plus guard-licensing risk (Texas Occupations Code Ch. 1702): must the prime hold the license? Listed through 2026-12-31, which may not be the proposal deadline. |

Behaviour pinned by tests: excellent economics cannot rescue unknown or prohibited subcontracting; a $12,000 upfront obligation fails financing against $300 even at a 20% margin; a $4,000 pay-when-paid job outranks a $40,000 job that needs $12,000 up front; the owner's $10,000 / $5,700 / $500 example gives 38.0% margin and 57.0% sub share.

## What is not verified yet (be skeptical of these)

* The sandbox this was built in could not reach SAM.gov, LAMP, Fort Worth or Bonfire (egress blocked), so the **SAM.gov connector is written to the public API documentation but has not run against the live API**, and the three listings are marked **unverified**. A web search corroborated Fort Worth 26-0268 through an aggregator (which also mentioned a mandatory pre-submittal meeting on 2026-10-22 and a five-year experience requirement, both unconfirmed). It found nothing for LAMP RFP-0003/0005. Check each on the official portal and tick "confirmed" in the app.
* The AI reader has not been called against the live API (no key in the build environment); its accept/reject logic is unit-tested.
* Win probability multipliers are reasoned starting points, not fitted to data.
* Legal references (13 CFR 125.6, Texas Ch. 1702) flag questions to ask; they are not legal advice.
* Fort Worth (Bonfire), LAMP and Texas SmartBuy have no feed the engine uses: add their listings by hand and paste the text.
