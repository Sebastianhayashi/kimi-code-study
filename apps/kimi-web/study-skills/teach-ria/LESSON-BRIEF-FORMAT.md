# Book-derived lesson brief format

Create one brief at `source/lesson-briefs/NNNN-dash-case-name.md` before writing the matching `lessons/NNNN-dash-case-name.html`.

The brief is a source-grounded publication contract. It prevents a lesson from inheriting only the overview's compressed summary.

```md
# Lesson brief: {lesson title}

## Control
- Status: {draft | ready | published | stale}
- Lesson: lessons/NNNN-dash-case-name.html
- Blueprint revision: {exact CURRICULUM-BLUEPRINT.md revision}
- Mission SHA-256: {must match the blueprint and current MISSION.md}
- Slice ID: {one ID from the lesson slice register}
- RIA Unit IDs: {comma-separated verified RIA IDs, or `none` for meaningful non-RIA source content}

## Primary capability slice
{One observable move the learner will understand or perform. Do not join adjacent slices.}

## Source anchors
- {source file, chapter, page or stable location, and source unit ID}
- {additional exact location needed for the case or boundary}

## RIA grounding
{For each RIA Unit ID, state how R, I, A1, A2/E, and B reach this slice. If `none`, explain why this source-grounded slice is not a reusable method and cite its blueprint disposition.}

## Core concept
{The concept in the author's sense, including enough surrounding logic to avoid a slogan.}

## Original source case
{At least one complete case from the book. Name the actors, situation, decision, and outcome. A quotation or case name is not enough.}

## Reasoning chain
- Situation and facts:
- Diagnosis:
- Crux or mechanism:
- Action or choice:
- Result:
- Limits or boundary:

## Transfer example
{A fresh example in the learner's mission context, mapped step by step to the source reasoning.}

## Boundary or misconception
{A plausible misuse, overgeneralization, counterexample, or condition under which the concept changes.}

## Practice and feedback
- Task:
- Observable response:
- Evaluation criteria:
- Immediate feedback or answer logic:

## Retrieval connection
{What earlier knowledge is retrieved, when this slice should be revisited, and what later slice will build on it.}

## Explicit exclusions
- {Related material deliberately moved to another slice, reference artifact, or deferred row, with destination}

## Publication check
- [ ] I reopened and reread every source anchor above.
- [ ] Every named RIA unit is verified, pressure-tested, and represented without losing its boundary.
- [ ] The lesson teaches only the primary capability slice.
- [ ] The original case retains the complete reasoning chain.
- [ ] The transfer example is tied to the current mission.
- [ ] Practice includes evaluation criteria and immediate feedback.
- [ ] Every exclusion has a visible destination.
- [ ] The lesson will cite its stable source anchors.
```

If the time budget cannot hold this brief, split the slice or create a continuation lesson. Do not shorten the lesson by deleting the required case, reasoning chain, boundary, or feedback.

The matching HTML must include visible sections for every part of the contract:

- `id="core-concept"`
- `id="ria-connection"`
- `id="original-case"`
- `id="reasoning-chain"`
- `id="transfer-example"`
- `id="boundary-misconception"`
- `id="practice-feedback"`
- `id="retrieval-connection"`
- `id="explicit-exclusions"`
- `id="source-anchors"`

These IDs let the structural check verify that the brief reached the lesson. They do not replace the final semantic comparison against the reopened source.
