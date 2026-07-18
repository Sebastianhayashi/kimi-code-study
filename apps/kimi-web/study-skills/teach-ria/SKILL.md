---
name: teach-ria
description: "[contract:teach-ria-v3] Read an uploaded textbook or nonfiction source in full, distill it through verified RIA++ method units while interviewing the learner's Mission, and build a source-faithful Chinese course. Use for Kimi Study deep mode, upgrades from quick mode, and certified preprocessed textbook packages."
---

# Teach RIA

Treat the current directory as one persistent Kimi Study course workspace. Deep mode promises verified source understanding before course generation. Preserve durable state in files so another session resumes from exact revisions rather than chat memory.

## Product contract

Read activation arguments before acting. Require the Kimi Study contract revision, course id, source revision, source title, and whether the source is a fresh upload or a preprocessed package. If identity is missing, report the exact field and do not invent it.

Maintain `source/STUDY-SNAPSHOT.json` after every durable transition using [STUDY-SNAPSHOT-FORMAT.md](./STUDY-SNAPSHOT-FORMAT.md). It is the product state read by the UI. Chat messages are progress narration, never the state database.

Keep internal workflow terms out of learner-facing prose. The learner should see reading progress, meaningful source limitations, 2–4 Mission questions, the outline, generation, lessons, and the tutor—not RIA labels, V1/V2/V3, checker output, Skill names, model controls, or file paths.

## Workspace

Maintain these artifacts as relevant:

- `source/STUDY-SNAPSHOT.json`: canonical machine-readable product state.
- `source/BOOK-READING-STATE.md`: whole-source inventory and coverage. Follow [BOOK-READING-FORMAT.md](./BOOK-READING-FORMAT.md).
- `source/BOOK-OVERVIEW.md`: coherent model of the complete source.
- `source/RIA-DISTILLATION.md` and `source/ria/*`: verified RIA-TV++ pipeline. Follow [RIA-DISTILLATION-FORMAT.md](./RIA-DISTILLATION-FORMAT.md).
- `MISSION.md`: learner outcome. Follow [MISSION-FORMAT.md](./MISSION-FORMAT.md).
- `source/CURRICULUM-BLUEPRINT.md`: lossless source-to-course disposition. Follow [CURRICULUM-BLUEPRINT-FORMAT.md](./CURRICULUM-BLUEPRINT-FORMAT.md).
- `source/TEACHING-MAP.md`: ordered mission-bound slices.
- `source/lesson-briefs/*.md`: source-grounded publication contracts. Follow [LESSON-BRIEF-FORMAT.md](./LESSON-BRIEF-FORMAT.md).
- `source/STUDY-PACKAGE.json`: immutable source-only manifest when preparing a catalog textbook. Follow [CATALOG-PACKAGE-FORMAT.md](./CATALOG-PACKAGE-FORMAT.md).
- `lessons/*.html` and `lessons/index.json` (follow [LESSON-QUALITY-FORMAT.md](./LESSON-QUALITY-FORMAT.md) and [LESSON-INDEX-FORMAT.md](./LESSON-INDEX-FORMAT.md)), plus `reference/*.html`, `learning-records/*.md`, `RESOURCES.md`, `assets/*`, and `NOTES.md`.

Inspect current artifacts before acting. A valid source-bound reading/RIA revision survives a Mission change; mission-bound blueprint, map, and unpublished briefs do not.

## Approval policy and decision burden

The default Kimi Study policy is `auto_policy`. Do not ask the learner to approve the overview, source decomposition, verified unit register, blueprint rows, teaching map, lesson count, or other internal analysis.

After a revision passes its deterministic and semantic checks, record:

`actor=auto_policy; policy=kimi-study-auto-v1; revision={exact revision}; at={ISO-8601}`

Only use `actor=user` when activation arguments explicitly request an expert-review workflow and the learner actually approves that exact revision. Never write user confirmation for an automatic decision.

Approval removes UX interruptions, not quality gates. Coverage, retained gaps, independent extraction, V1/V2/V3 decisions, R/I/A1/A2/E/B completeness, pressure tests, lossless blueprint disposition, Mission hashes, lesson briefs, and source rereads remain mandatory.

## Mission runs during source work

Run the Mission interview while reading and distillation proceed.

- Call `AskUserQuestion` one question at a time.
- Put exactly one question in each call, with 2–4 mutually exclusive options and an “other” path; never use multi-select.
- Ask 2–4 adaptive questions total. Stop as soon as outcome, observable success, constraints, prior position, and exclusions are clear.
- Do not ask the learner to validate internal analysis.
- Record the resulting Mission and increment its revision whenever meaning changes.

A material Mission change locks mission-bound design and unpublished lessons. It does not force rereading or redistillation when the source identity is unchanged.

## Classify the source

Support complete textbooks, manuals, professional books, and nonfiction meant to convey knowledge, methods, or skills. For mixed, incomplete, or ambiguous material, retain exact boundaries and resolve only the question that changes whether deep mode is valid. Do not call an excerpt a complete book.

Do not silently apply this workflow to primarily literary fiction. Report that the deep nonfiction workflow is not adapted to that source and offer ordinary passage help or stop.

## Fresh-upload deep workflow

### 1. Inventory and read the whole source

Read [BOOK-READING-FORMAT.md](./BOOK-READING-FORMAT.md). Inventory front matter, every chapter or section, notes, and appendices from the source itself. Split large files into stable chunks and read every readable chunk attentively. Update the ledger after every chunk.

Coverage reaches 100% only when every inventoried range is read or verified blank. Failed OCR, encryption, extraction errors, missing pages, and unavailable ranges stay blocked. Never sample chapters, substitute summaries, or fill gaps from model memory.

At 100% coverage, build the structural, interpretive, critical, and source-grounded applied passes in `BOOK-OVERVIEW.md`. Approve its exact revision only after completeness and source limitations pass policy checks.

### 2. Distill with RIA-TV++

Read [RIA-DISTILLATION-FORMAT.md](./RIA-DISTILLATION-FORMAT.md) and complete all stages:

1. five independent extraction passes across every non-administrative range: frameworks, principles, cases, counterexamples, and glossary;
2. independent V1 cross-context, V2 predictive-power, and V3 exclusivity decisions for every candidate, retaining every rejection;
3. atomic RIA++ units with complete R, I, A1, A2, E, and B sections;
4. real depends-on, contrasts-with, and composes-with links plus a cleaned glossary;
5. trigger, non-trigger, cross-unit confusion, edge, and boundary pressure tests, with every non-trigger trap passing.

Approve the exact RIA revision only when the audit is complete and all pressure tests pass. Zero verified units is valid when every candidate was honestly rejected; source content still flows through the blueprint.

### 3. Join source evidence and Mission

Build `CURRICULUM-BLUEPRINT.md` from both the complete source ledger and approved RIA register. Every meaningful concept, method, reasoning chain, case, counterexample, and caveat gets one visible `teach`, `reference`, or `defer` disposition. Every verified RIA unit gets a destination. Every Mission success outcome gets observable capability and slice mappings.

Derive `TEACHING-MAP.md` from the lesson-slice register. A capability may require several slices. A short course target is a splitting constraint, never permission to delete source logic, cases, boundaries, or feedback.

Approve blueprint and map only when Mission hashes and source/RIA revisions match and all integrity checks pass. Run:

`python3 scripts/check-book-course.py --workspace /absolute/workspace`

When it passes, set source evidence to `certified`, source status to `ready`, Mission to `ready`, and plan to `ready` in the Study snapshot. Stop so Kimi Study can present the outline before generation.

## Preprocessed package workflow

A catalog package skips expensive reading only when it contains:

- immutable source identity and revision;
- 100% reading coverage with no blocked ranges;
- approved overview and RIA revisions with full audit artifacts;
- passing pressure-test results;
- source disposition ledger inputs;
- approval provenance that names policy and exact revision.

Verify the package reference and manifest before mounting it. Never trust a title match. Reuse source-bound reading, overview, and RIA artifacts, then run the learner's 2–4 question Mission interview and build a fresh mission-bound blueprint/map. If the package is incomplete or stale, mark the source blocked; do not silently redo or pretend certification.

To prepare a common textbook before any learner arrives, complete only the source-bound reading and RIA gates, then follow [CATALOG-PACKAGE-FORMAT.md](./CATALOG-PACKAGE-FORMAT.md) and run `scripts/build-catalog-package.py`. Do not invent a generic Mission, blueprint, teaching map, or lessons during preprocessing.

## Generate only from current revisions

Only respond to generation requests that name the exact approved plan revision. Reject stale requests.

Before each book-derived lesson:

1. read [LESSON-QUALITY-FORMAT.md](./LESSON-QUALITY-FORMAT.md) before the first lesson in this generation run;
2. create `source/lesson-briefs/NNNN-name.md` from the next unconsumed teaching-map slice;
3. reopen every original source anchor named in the brief;
4. run `python3 scripts/check-book-course.py --workspace /absolute/workspace --brief source/lesson-briefs/NNNN-name.md`;
5. create `lessons/NNNN-name.html` only after the brief passes;
6. compare the lesson line by line with the brief and reopened source;
7. mark the brief published and run the checker with `--lesson`;
8. atomically update `lessons/index.json` with the lesson title, order, and `published` status;
9. set `publishedLessons` to the manifest's published count, run the full checker to catch repetition and publication drift, and publish incrementally in the Study snapshot.

Each lesson teaches one primary capability slice in natural Chinese, retains a complete original case and reasoning chain, explains the difficult step progressively, transfers it to the Mission, shows a boundary or misconception, includes an objective-aligned self-check with immediate feedback, cites stable source locations, and connects retrieval across lessons. Mark source-grounded blocks with exact source anchors and mark invented teaching transfers separately; never let a fresh example masquerade as a book case. Do not reuse generic definitions, introductions, or summaries across lessons.

Reuse assets and build durable reference material. Treat parametric knowledge as untrusted; use high-trust external sources only to correct, update, or clarify the supplied source.

## Failure and repair

When blocked, update the Study snapshot with the exact source, Mission, plan, or generation blocker. Do not generate a provisional lesson.

If an audit finds a missing source unit, case, RIA relationship, Mission outcome, or lesson slice, lock generation, increment the affected revision, repair the ledger/blueprint/map, re-run checks, and approve the new revision through the same declared policy. Preserve existing lessons until a concrete audit identifies repair; never silently bless or delete them.

## Durable learning

Use retrieval practice, spacing, interleaving when appropriate, and immediate feedback. Keep knowledge acquisition easy enough for working memory and practice difficult enough to expose errors. Record demonstrated understanding—not exposure or activity—in `learning-records/`.
