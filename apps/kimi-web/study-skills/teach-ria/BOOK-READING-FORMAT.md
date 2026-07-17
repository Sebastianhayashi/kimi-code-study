# Whole-book reading gate

Use this workflow only for a complete, supported textbook or nonfiction book. It prevents teaching from a skim, a partial extraction, or model memory.

- [Source classification](#source-classification)
- [`BOOK-READING-STATE.md`](#sourcebook-reading-statemd)
- [`BOOK-OVERVIEW.md`](#sourcebook-overviewmd)
- [`RIA-DISTILLATION.md`](#sourceria-distillationmd)
- [`CURRICULUM-BLUEPRINT.md`](#sourcecurriculum-blueprintmd)
- [`TEACHING-MAP.md`](#sourceteaching-mapmd)
- [Unlock check](#unlock-check)

## Source classification

Before reading, classify the source and record the decision.

- Support textbooks, manuals, professional books, and nonfiction that teaches knowledge, methods, or skills.
- Do not apply this workflow to novels, short stories, poetry, drama, or primarily literary narratives. Tell the user that fiction is not yet adapted and ask whether they want ordinary passage-level help or want to stop.
- Ask about mixed or ambiguous forms. Treat excerpts as excerpts, never as complete books.

## `source/BOOK-READING-STATE.md`

Create this file before reading. Update it after every chunk so another session can resume without guessing.

```md
# Book reading state

## Source
- Title: {title}
- Author: {author}
- Edition/year: {edition or unknown}
- File: {path}
- Classification: {supported nonfiction/textbook | ambiguous | unsupported literary}
- Extent: {total pages, locations, chapters, or other stable denominator}

## Gate
- Status: {inventorying | reading | blocked | ready for approval | approved | stale}
- Coverage: {0-100}%
- Unresolved gaps: {none, or exact ranges and reason}
- Whole-book overview: {pending | complete}
- Reading certificate revision: {stable revision for the complete ledger + overview}
- RIA distillation: {pending | extracting | verifying | constructing | testing | complete | stale}
- Overview approval: {pending, or actor=...; policy=...; revision={reading certificate revision}; at=ISO-8601}
- RIA approval: {pending, or actor=...; policy=...; revision=...; at=ISO-8601}
- Curriculum blueprint: {pending | complete | stale}
- Teaching map: {pending | complete | stale}
- Course approval: {pending, or actor=...; policy=...; revision=...; at=ISO-8601}
- Teaching unlocked: {no | yes}

## Reading ledger
| Range | Structural role | Status | Notes and uncertainties |
|---|---|---|---|
| {pages/section/location} | {front matter/chapter/appendix/etc.} | {unread/read/blocked} | {brief traceable note} |

## Next action
{One exact action for the next session.}
```

Build the ledger from the source itself, not only from its table of contents. Include introductions, conclusions, notes, and appendices when present. Blank pages may be inventoried as blank; failed extraction, missing pages, and unreadable OCR remain blocked.

Coverage is `read ranges / inventoried ranges`. Reach 100% only when every inventoried range is either read or verified blank. Never hide a gap by changing the denominator.

For large books, choose chunks small enough to read attentively and large enough to preserve local argument. Give every chunk a stable range. After reading it, update the ledger before proceeding.

## `source/BOOK-OVERVIEW.md`

Create the overview only after the ledger reaches 100%. Synthesize across the whole source under these headings:

```md
# {Book title}: whole-book overview

## Structural pass
What problem the book addresses, its governing questions, major parts, and how those parts depend on each other.

## Interpretive pass
The author's key terms, central claims, methods, evidence, and reasoning chain. Define terms in the author's sense.

## Critical pass
What is well supported, what is uncertain, internal tensions, assumptions, blind spots, edition-sensitive material, and claims that need newer external evidence.

## Applied pass
Which kinds of real situations the source could change, kept source-grounded and mission-neutral. Separate understanding, practice, and judgment. Mission-specific choices belong in the curriculum blueprint.

## Source limitations
Extraction problems, ambiguous passages, or edition details that affect confidence. Write `None` only when checked.
```

Do not write a chapter-by-chapter summary dump. Build one coherent model that can explain how a lesson relates to the rest of the book. The overview is not a substitute for the curriculum coverage ledger.

## `source/RIA-DISTILLATION.md`

After 100% reading and approval of the exact overview revision, complete [RIA-DISTILLATION-FORMAT.md](./RIA-DISTILLATION-FORMAT.md). This is the required teardown layer, not optional enrichment: five independent extraction passes, triple verification with retained rejections, RIA++ units, relationships, and pressure tests.

Conduct the mission interview while chunk-by-chunk reading is in progress. Source-bound RIA artifacts remain reusable for another mission when the source is unchanged; the next blueprint is where they acquire a mission-specific teaching disposition.

## `source/CURRICULUM-BLUEPRINT.md`

Read [CURRICULUM-BLUEPRINT-FORMAT.md](./CURRICULUM-BLUEPRINT-FORMAT.md) and build the blueprint after the overview. It must:

- bind itself to the exact current `MISSION.md` and approved RIA revision;
- give every verified RIA unit a visible `teach`, `reference`, or `defer` destination;
- classify every meaningful concept, method, reasoning chain, case, counterexample, and caveat as `teach`, `reference`, or `defer`;
- give every disposition a visible destination or rationale;
- expand capabilities into as many lesson slices as their logic requires;
- preserve required original cases and their reasoning chains.

Every non-administrative range in the reading ledger must contribute at least one blueprint row. This is the explicit check against material disappearing between “the book was read” and “the course was designed.”

## `source/TEACHING-MAP.md`

Map the book to the learner rather than copying its contents page.

```md
# Teaching map

## Control
- Status: {draft | ready for approval | approved | stale}
- Blueprint revision: {exact blueprint revision}
- Mission SHA-256: {must match the blueprint and current MISSION.md}

## Mission link
{How this book serves the learner's concrete outcome.}

## Starting point
{Established prior knowledge, misconceptions, and missing prerequisites.}

## Learning path
| Sequence | Slice ID | Primary capability slice | Source unit IDs and anchors | Prerequisites | Evidence of learning |
|---|---|---|---|---|---|
| 1 | S01.1 | {...} | {blueprint IDs plus page/chapter/location} | {...} | {observable performance} |

## Deferred or out of scope
{Link to all blueprint defer rows and their revisit conditions. Nothing here is treated as unread.}
```

Derive the map from the blueprint's lesson slice register. One capability may occupy several rows. Do not merge adjacent slices to satisfy an arbitrary lesson count or time budget.

## Unlock check

Teaching remains locked until all are true:

- the source inventory is complete;
- coverage is 100%;
- unresolved gaps are `none`;
- `BOOK-OVERVIEW.md`, `CURRICULUM-BLUEPRINT.md`, and `TEACHING-MAP.md` are complete;
- `RIA-DISTILLATION.md` is approved, every verified unit has complete R/I/A1/A2/E/B, and all pressure tests pass;
- the blueprint accounts explicitly for every meaningful source unit;
- the blueprint and map carry the SHA-256 of the current `MISSION.md`;
- overview, RIA, and course approval provenance each name an actor, policy, exact revision, and timestamp.

After approval, set the blueprint and map to `Status: approved`, update the gate to `Status: approved`, record approval provenance, and set `Teaching unlocked: yes`. Only then create the first book-derived lesson.

If the mission changes materially, set the blueprint and map to `Status: stale`, set `Teaching unlocked: no`, and rebuild both against the new mission. The complete reading ledger, source-grounded overview, and RIA artifacts remain valid when the source itself has not changed. If the source or edition changes, mark both reading and RIA artifacts stale.

## Approval provenance

Use `actor=auto_policy; policy=kimi-study-auto-v1; revision={exact revision}; at={ISO-8601}` after the relevant checks pass. Use `actor=user` only after a real expert-review action. Automatic approval is never recorded as user confirmation. Changing an approved artifact invalidates approval until its new revision passes again.
