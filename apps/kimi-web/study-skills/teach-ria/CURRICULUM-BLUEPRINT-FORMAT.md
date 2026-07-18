# Curriculum blueprint format

`source/CURRICULUM-BLUEPRINT.md` is the lossless bridge between whole-book understanding, verified RIA distillation, and course design. Create it after `BOOK-OVERVIEW.md` and approved `RIA-DISTILLATION.md`, and before `TEACHING-MAP.md`.

## Control block

Begin with:

```md
# Curriculum blueprint

## Control
- Status: {draft | ready for approval | approved | stale}
- Revision: {date or stable revision identifier}
- Mission SHA-256: {SHA-256 of the exact current MISSION.md bytes}
- RIA revision: {exact approved RIA-DISTILLATION.md revision}
- Source identity: {title, edition, and file}
- Reading coverage: {must be 100%}
- Unresolved source gaps: {must be none}
- Approval provenance: {pending, or actor=...; policy=...; revision=...; at=ISO-8601}
```

The mission hash binds the course design to the mission that produced it. If `MISSION.md` changes materially, mark this blueprint, the teaching map, and unpublished lesson briefs `stale`; lock teaching; rebuild and reapprove them.

The RIA revision binds course design to the exact verified method set. If the source or RIA register changes, mark the blueprint, map, and unpublished briefs stale. A mission-only change does not require reading or distilling the unchanged source again.

## RIA unit coverage

Copy every row from `RIA-DISTILLATION.md` → `Verified unit register` and give it a mission-bound course disposition:

```md
## RIA unit coverage
| RIA Unit ID | Disposition | Destination | Mission rationale |
|---|---|---|---|
| RIA-F01 | teach | S01.1, S03.2 | {why this method serves an exact mission outcome} |
| RIA-P02 | reference | reference/{name}.html | {why retrieval support is enough} |
| RIA-F03 | defer | deferred | {why now, and the observable revisit condition} |
```

Every verified RIA unit must appear exactly once. `teach`, `reference`, and `defer` have the same destination rules as the source disposition ledger. Triple-verification rejection is not permission to omit meaningful source material; rejected candidates still flow through the source disposition ledger when they matter to the book.

## Source disposition ledger

Create one row per meaningful source unit, not merely one row per chapter. A meaningful unit is any concept, method, claim, reasoning chain, case, counterexample, limitation, or caveat that materially supports the book's model or the learner's mission.

Every range in `BOOK-READING-STATE.md` must contribute at least one row unless it is verified blank or purely administrative. Split dense chapters into multiple rows.

```md
## Source disposition ledger
| ID | Reading-ledger range | Source anchor | Unit | Reasoning or case to preserve | Disposition | Destination | Rationale |
|---|---|---|---|---|---|---|---|
| CH01-C01 | Chapter 1 | Chapter 1, pp. 12–18 | {concept or claim} | {argument, case, boundary, or none} | teach | S01.1 | {why} |
| CH02-X01 | Chapter 2 | Chapter 2, pp. 31–36 | {supporting material} | {what must survive compression} | reference | reference/{name}.html | {why} |
| APP-A01 | Appendix A | Appendix A, pp. 240–252 | {advanced method} | {what it adds} | defer | deferred | {why now, and when to revisit} |
```

Copy `Reading-ledger range` exactly from `BOOK-READING-STATE.md`. Reuse it across several rows when a dense range contains several meaningful units.

Use only these dispositions:

- `teach`: preserve the unit in one or more lesson slices.
- `reference`: preserve it in a named, linked course artifact. Optional reading alone is not a destination.
- `defer`: make the omission visible and give a mission-based reason plus a revisit condition.

Never leave a row unclassified. Never make a concept disappear because it is difficult to fit into the desired lesson count.

## Mission outcome coverage

Copy every bullet under `MISSION.md` → `Success looks like` exactly and give it a course destination:

```md
## Mission outcome coverage
| Mission outcome | Capability IDs | Slice IDs | Evidence |
|---|---|---|---|
| {exact success bullet} | C01 | S01.1, S01.2 | {observable proof} |
```

Every mission outcome must map to at least one capability and lesson slice. If the book cannot support an outcome, state that gap to the learner instead of inventing coverage.

## Capability architecture

Group source units into learner capabilities without collapsing their internal logic:

```md
## Capability architecture
| Capability ID | Observable capability | Source unit IDs | Required original cases | Prerequisites | Evidence of learning |
|---|---|---|---|---|---|
| C01 | {what the learner can do} | CH01-C01, CH03-M02 | {named book cases} | {prior capability or knowledge} | {observable performance} |
```

A capability may need several lesson slices. Preserve distinct diagnoses, mechanisms, cases, or practice loops as separate slices.

## Lesson slice register

```md
## Lesson slice register
| Slice ID | Primary capability slice | Source unit IDs | Required original case | Mission transfer | Planned evidence |
|---|---|---|---|---|---|
| S01.1 | {one teachable move} | CH01-C01 | {case name} | {mission situation} | {exercise and criterion} |
```

Every `teach` row in the source disposition ledger must appear in at least one slice. Every slice must have one primary capability, stable source IDs, and a destination in the teaching map.

## Integrity audit

Finish with checked evidence, not a generic assurance:

```md
## Integrity audit
- [ ] Every verified RIA unit has one mission-bound disposition and destination.
- [ ] Every inventoried non-administrative source range contributes to the disposition ledger.
- [ ] Every meaningful concept, method, reasoning chain, case, counterexample, and caveat has one disposition.
- [ ] Every teach row maps to at least one lesson slice.
- [ ] Every reference row names a course artifact.
- [ ] Every defer row includes a reason and revisit condition.
- [ ] Every required case retains situation, diagnosis, mechanism or crux, action, result, and limits.
- [ ] No capability was merged or dropped merely to reduce lesson count or duration.
- [ ] The mission hash matches the current MISSION.md.
- [ ] Every mission success outcome maps to at least one capability, lesson slice, and observable evidence.
```

Do not mark the blueprint ready for approval until every item passes and its RIA revision matches the approved distillation register. Default product approval is `actor=auto_policy; policy=kimi-study-auto-v1; revision={exact blueprint revision}; at={ISO-8601}`. Use `actor=user` only after a real expert-review action.
