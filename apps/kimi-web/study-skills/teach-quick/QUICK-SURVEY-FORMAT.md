# Quick source survey format

Create `source/QUICK-SURVEY.md` to record an end-to-end structural survey. It is evidence for a fast learning route, not a deep-reading certificate.

```md
# Quick source survey

## Control
- Status: {surveying | complete | stale | blocked}
- Revision: {stable revision identifier}
- Source revision: {exact activation source revision}
- Survey coverage: {0-100}%
- Unresolved ranges: {none, or exact ranges and extraction problem}
- Evidence level: survey
- Approval provenance: {actor=auto_policy; policy=kimi-study-auto-v1; revision=...; at=ISO-8601}

## Source inventory
| Range | Structural role | Survey status | What is attributable | Limitation |
|---|---|---|---|---|
| {chapter/page/file range} | {front matter/chapter/appendix/etc.} | {surveyed | blocked} | {claims, method, case, or role visible at survey depth} | {none or exact uncertainty} |

## Coherent source map
### Governing questions
{What the material is trying to answer.}

### Structure and dependencies
{How its major parts fit together.}

### High-value claims and methods
{Source-grounded list with stable anchors.}

### Cases, counterexamples, and boundaries
{What must not disappear from a fast path.}

### Confidence and limitations
{What quick mode cannot honestly establish.}

## Fast-path candidates
| Candidate | Source anchors | Learner value | Confidence | Suggested disposition |
|---|---|---|---|---|
| {...} | {...} | {...} | {high | medium | low} | {lesson | reference | defer} |
```

Rules:

- Build inventory from the actual supplied material, not only its table of contents.
- Survey every inventoried range or record a failed attempt. Coverage reaches 100% only when all rows are `surveyed` or explicitly `blocked`.
- Keep blocked rows in the denominator and limitations. Do not silently lower scope.
- Never use `certified`, “fully read,” or equivalent deep-mode claims.
- Mark the survey complete only after the coherent source map and fast-path candidates are populated without placeholders.
