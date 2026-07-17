# RIA distillation gate

`teach` uses one continuous pipeline for a complete, supported book:

`read the whole source -> distill it with RIA-TV++ -> design the mission-bound course -> teach`

RIA distillation is not an optional summary and it is not a parallel product mode. It is the required bridge between whole-book understanding and curriculum design. No book-derived lesson may be designed until this gate is complete.

The learner's mission interview should run while the source is being read. The mission does not replace source analysis: source-grounded RIA artifacts remain reusable when the source is unchanged, while the curriculum blueprint decides how those artifacts serve the current mission.

## Workspace artifacts

Maintain this structure:

```text
source/
├── BOOK-READING-STATE.md
├── BOOK-OVERVIEW.md
├── RIA-DISTILLATION.md
└── ria/
    ├── candidates/
    │   ├── frameworks.md
    │   ├── principles.md
    │   ├── cases.md
    │   ├── counter-examples.md
    │   └── glossary.md
    ├── rejected/
    ├── units/
    ├── tests/
    ├── test-results/
    ├── INDEX.md
    └── GLOSSARY.md
```

Create `source/RIA-DISTILLATION.md` when the reading ledger is created so the workflow can resume without guessing:

```md
# RIA distillation

## Control
- Status: {pending | extracting | verifying | constructing | linking | testing | ready for approval | approved | stale}
- Revision: {stable revision identifier}
- Source identity: {title, edition, file, and source hash when available}
- Reading coverage: {must be 100% before extraction is finalized}
- Candidate extraction: {pending | complete}
- Triple verification: {pending | complete}
- RIA++ units: {pending | complete}
- Relationship index: {pending | complete}
- Pressure tests: {pending | passed | failed}
- Verified unit count: {integer, including 0 when every candidate was rejected}
- Unresolved distillation gaps: {none, or exact missing artifact/evidence}
- Approval provenance: {pending, or actor=...; policy=...; revision=...; at=ISO-8601}

## Verified unit register
| RIA Unit ID | Type | Source anchors | RIA++ file | Test file | Test result file | Result |
|---|---|---|---|---|---|---|
| RIA-F01 | framework | {two or more stable anchors} | source/ria/units/RIA-F01.md | source/ria/tests/RIA-F01.json | source/ria/test-results/RIA-F01.md | passed |

## Rejected candidate register
| Candidate ID | Source anchors | Failed check | Reason | Audit file |
|---|---|---|---|---|
| {id} | {anchors} | {V1/V2/V3} | {specific reason} | source/ria/rejected/{id}.md |

## Integrity audit
- [ ] Candidate extraction scanned every non-administrative reading-ledger range.
- [ ] Framework, principle, case, counterexample, and glossary passes are complete.
- [ ] Every candidate has stable source anchors and a bounded quotation.
- [ ] Every candidate was checked independently against V1, V2, and V3.
- [ ] Every rejection is retained with its evidence and reason.
- [ ] Every verified unit has complete R, I, A1, A2, E, and B sections.
- [ ] Every verified unit appears in the relationship index and shared glossary where relevant.
- [ ] Every verified unit has trigger, non-trigger, cross-unit confusion, and boundary tests.
- [ ] All pressure tests pass, including every non-trigger test.
- [ ] Approval provenance names the actor, policy, exact RIA revision, and timestamp.
```

## Stage 0: whole-source understanding

First complete the inventory and attentive chunk-by-chunk reading in `BOOK-READING-STATE.md`. Update the ledger after every chunk. Do not finalize extraction from sampled chapters, summaries, or model memory.

At 100% readable coverage, create `BOOK-OVERVIEW.md` with structural, interpretive, critical, and application-potential passes. Application potential is source-grounded and mission-neutral; the mission-specific disposition belongs in the curriculum blueprint.

Validate the overview against the source ledger and approve its exact revision through the declared policy. Do not interrupt the default learner journey with an internal overview review. The mission interview may continue in parallel with reading, but it must be concrete and ready before the curriculum blueprint is built.

## Stage 1: five independent extraction passes

Scan the complete source from five clean perspectives:

1. frameworks: transferable models, decision structures, and reasoning methods;
2. principles: rules, checklists, maxims, and action constraints;
3. cases: complete original cases tied to a method;
4. counterexamples: failure modes, mechanisms, warning signs, and limits;
5. glossary: terms in the author's specific sense.

Use parallel independent agents when available. Otherwise run the same passes serially with clean roles. For a source too large for one context, scan every stable reading chunk and merge only after all chunks are covered. Each candidate must include a stable source anchor, a bounded quotation (at most 150 Chinese characters or 100 English words per quoted passage), an interpretation in fresh language, and tags.

Candidate extraction is complete only when every non-administrative reading-ledger range was included in all relevant scans.

## Stage 1.5: triple verification

Deduplicate the candidate pool, then record all three decisions for each proposed reusable method:

- **V1 cross-context:** at least two independent source contexts support the same method. Rewordings of one case do not count.
- **V2 predictive power:** the method can derive a useful answer for a genuinely new situation not answered directly in the source.
- **V3 exclusivity:** the method preserves a distinctive, non-trivial insight rather than generic common sense.

Only candidates that pass all three become RIA units. Keep every rejection in `source/ria/rejected/` with the failed check and evidence. Rejection as a reusable RIA unit does **not** erase source content: meaningful rejected material must still receive a `teach`, `reference`, or `defer` disposition in the curriculum blueprint.

Record the verified titles and rejected count for audit. Under the default product policy, continue automatically only after V1/V2/V3 evidence is complete; do not ask the learner to judge internal candidates. In an explicitly requested expert-review workflow, let the learner rescue or remove candidates and record that exact user decision.

## Stage 2: construct RIA++ units

Create one atomic file per verified method at `source/ria/units/{RIA Unit ID}.md`. A unit is source-bound, not mission-bound, so it can be reused for another learner studying the exact same source.

Every unit must contain these exact level-two heading prefixes:

```md
# {Unit title}

## R — Reading
{Bounded quotation plus stable source anchors.}

## I — Interpretation
{The method's causal or decision structure in fresh language.}

## A1 — Past application
{At least one complete source case: problem -> use -> conclusion -> result.}

## A2 — Future trigger
{Recognizable future situations, user language signals, and distinctions from adjacent units.}

## E — Execution
{Numbered actions with observable completion and stop conditions.}

## B — Boundary
{Non-applicable situations, failure modes, blind spots, and neighboring methods.}
```

Do not collapse several methods into one unit. Do not omit A1 because the principle sounds self-evident. Do not write A2 as a broad topic label. Do not write E as philosophy without an observable action.

## Stage 3: link the units

Create `source/ria/INDEX.md` and describe only real relationships:

- `depends-on`: one unit requires another;
- `contrasts-with`: the learner must choose between neighboring methods;
- `composes-with`: the methods are commonly used together.

Promote the cleaned glossary to `source/ria/GLOSSARY.md`. Revisit each A2 and B after linking so neighboring units do not compete for the same situation.

## Stage 4: pressure-test selection and execution

Create a Darwin-compatible JSON file at `source/ria/tests/{RIA Unit ID}.json` for every unit. Include at least:

- three `should_trigger` situations;
- two `should_not_trigger` traps;
- one `edge_case`;
- one non-trigger case that should select a different unit from the same source, marked `"cross_unit_confusion": true`.

Prefer blind evaluation by an independent agent that sees the learner prompt and available unit descriptions but not the expected result. Record results in `source/ria/test-results/{RIA Unit ID}.md` with `- Status: passed` only when all non-trigger traps pass and the full suite has no unresolved failure. A failed unit returns to RIA construction; do not weaken the test merely to pass it.

## Handoff to mission-bound course design

After RIA approval, build `CURRICULUM-BLUEPRINT.md` from **both** the full source disposition ledger and the verified RIA unit register:

- every verified RIA unit gets a visible `teach`, `reference`, or `defer` destination;
- every meaningful non-RIA source unit also gets a disposition, so triple verification never becomes a silent deletion mechanism;
- each mission outcome maps to observable capabilities and lesson slices;
- lessons that use a RIA unit carry its ID into the lesson brief and expose its R, I, A1, A2/E transfer, and B logic in learner-appropriate form.

RIA distillation remains reusable if the source is byte-for-byte or edition-identical. A mission change makes the curriculum blueprint, teaching map, mission transfers, and unpublished briefs stale; it does not invalidate the reading ledger or source-bound RIA artifacts. A source or edition change makes the reading and RIA artifacts stale.

## Unlock check

Teaching remains locked until:

- reading coverage is 100% with no unresolved source gaps;
- RIA extraction, verification, construction, linking, and pressure testing are complete;
- every verified unit and rejection has an audit trail;
- overview and RIA approval provenance are current and attributable;
- the current Mission is ready;
- the mission-bound curriculum blueprint and teaching map are complete and approved.

If any condition fails, report the exact next action. Never generate a provisional book-derived lesson while waiting for distillation.

## Approval provenance

Default to `actor=auto_policy; policy=kimi-study-auto-v1; revision={exact revision}; at={ISO-8601}` only after all integrity and pressure-test gates pass. Use `actor=user` only for an actual expert-review decision. Do not weaken or skip a gate to avoid a learner-facing pause.
