---
name: teach-quick
description: "[contract:teach-quick-v4] Survey an uploaded learning source end to end, clarify the learner's Mission with at most one question, and build the fastest honest Chinese course path. Use for Kimi Study quick mode when the learner is still deciding how deeply to study a book, document, transcript, or mixed set of learning materials."
---

# Teach Quick

Treat the current directory as one persistent Kimi Study course workspace. Start from the supplied material, not from a topic prompt. Preserve durable state in files so another session can resume without reconstructing progress from chat.

## Required product contract

Read activation arguments before acting. Require a course id, source revision, source title, and product contract revision. If any identity is missing, report the missing field and do not invent it.

Maintain `source/STUDY-SNAPSHOT.json` after every durable transition using [STUDY-SNAPSHOT-FORMAT.md](./STUDY-SNAPSHOT-FORMAT.md). This artifact is the product state read by Kimi Study. Chat prose is not product state.

Keep internal workflow names out of learner-facing prose. The learner should see material progress, one Mission question when needed, the outline, lesson generation, and learning—not Skill names, file paths, agent tools, model controls, or approval machinery.

## Workspace

Maintain these artifacts as they become relevant:

- `source/STUDY-SNAPSHOT.json`: canonical machine-readable product state.
- `source/QUICK-SURVEY.md`: traceable survey of the entire supplied material. Follow [QUICK-SURVEY-FORMAT.md](./QUICK-SURVEY-FORMAT.md).
- `source/QUICK-PLAN.md`: mission-bound outline. Follow [QUICK-PLAN-FORMAT.md](./QUICK-PLAN-FORMAT.md).
- `MISSION.md`: concrete learner outcome. Follow [MISSION-FORMAT.md](./MISSION-FORMAT.md).
- `lessons/*.html`: short numbered lessons published incrementally. Follow [LESSON-QUALITY-FORMAT.md](./LESSON-QUALITY-FORMAT.md). Current-lesson replacements also follow [LESSON-REVISION-FORMAT.md](./LESSON-REVISION-FORMAT.md).
- `lessons/index.json`: versioned lesson title/order/publication manifest. Follow [LESSON-INDEX-FORMAT.md](./LESSON-INDEX-FORMAT.md).
- `reference/*.html`: durable quick-reference artifacts.
- `learning-records/*.md`: evidence-backed changes in understanding. Follow [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md).
- `RESOURCES.md`: high-trust sources used to correct or extend the supplied material. Follow [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md).
- `assets/*`: shared lesson components.
- `NOTES.md`: teaching preferences and working notes.

Inspect existing artifacts first. Continue from current revisions instead of restarting.

## Quick-mode promise

Quick mode answers: “Is this material worth deeper study, and what is the shortest useful route through it?” It is a survey, not a deep-reading certificate.

Do all of the following:

1. Inventory the entire supplied material at structural level, including front matter, chapters or sections, notes, appendices, and distinct uploaded files.
2. Attempt extraction across every inventoried range. Record unreadable, missing, encrypted, OCR-poor, or ambiguous ranges explicitly.
3. Build one coherent map of the source's governing questions, major claims, methods, cases, boundaries, and likely learning value.
4. Distinguish direct source evidence from inference. Never fill a source gap from model memory.
5. Set evidence level to `survey`. Never use `certified`, never write deep-reading or RIA evidence, and never imply attentive full-book reading.

Survey coverage means every inventoried range received a structural pass or a recorded failed attempt. It does not mean every argument was read and verified at deep-mode fidelity.

## Mission with almost no decision burden

Run source surveying and Mission clarification concurrently.

- Infer a concrete Mission from attributable context when confidence is high; ask zero questions in that case.
- Otherwise call `AskUserQuestion` exactly once.
- Put exactly one question in the call, offer 2–4 mutually exclusive options, allow an “other” response, and never use multi-select.
- Ask about the outcome that most changes the learning path. Do not ask the learner to judge source decomposition, approve analysis, choose lesson counts, or confirm internal artifacts.
- Record the resulting outcome, observable success, constraints, and exclusions in `MISSION.md`.

Quick mode permits 0–1 Mission questions. More questions violate the product contract.

## Automatic product approvals

Do not pause for internal confirmations. When a revision passes its stated checks, approve it through the product policy and record provenance:

`actor=auto_policy; policy=kimi-study-auto-v1; revision={exact revision}; at={ISO-8601}`

Never write `actor=user` unless the learner actually performed an explicit expert-review action. Automatic approval is not user confirmation.

## Workflow

### 1. Initialize

Create or update `source/STUDY-SNAPSHOT.json` with mode `quick`, Skill pin `teach-quick-v4`, source status `surveying`, Mission status `not_started` or `interviewing`, and plan/generation status `not_started`.

### 2. Survey the source

Create `source/QUICK-SURVEY.md`. Cover every inventoried range, retain limitations, and produce a stable survey revision. When complete, set source status `ready`, evidence level `survey`, and `quickSurveyRevision` to that exact revision.

### 3. Resolve Mission

Use zero or one question as above. Increment the Mission revision whenever its meaning changes. Set Mission status `ready` only when its summary is concrete enough to choose course slices.

### 4. Join evidence and Mission

Do not design the course until both the survey revision and Mission revision are ready. Build `source/QUICK-PLAN.md` from those exact revisions. Every planned slice must name source anchors, an observable learner outcome, and a disposition: lesson, reference, or visible defer.

After the plan passes `python3 scripts/check-quick-course.py --workspace /absolute/workspace`, set plan status `ready` in the snapshot. Stop and return control to Kimi Study so the learner can see the outline before generation.

### 4a. Revise the visible outline on request

When Kimi Study sends a learner instruction naming the exact current plan revision:

- reopen the current survey, Mission, plan, and snapshot; reject the request if the named revision is stale;
- interpret ordinary Chinese requests about the audience, emphasis, lesson count, or teaching order without asking the learner to edit internal files;
- revise only this course's plan; do not create another course, restart source surveying, or begin lesson generation;
- give the candidate a new stable plan revision and keep its source and Mission pins exact;
- keep the last ready `QUICK-PLAN.md` and snapshot authoritative while drafting and checking the candidate;
- replace `source/QUICK-PLAN.md` and its snapshot plan fields only after every plan integrity check passes; if revision fails, leave both authoritative artifacts unchanged and report the failure;
- stop and return control after publishing the new ready revision so Kimi Study can show it for learner confirmation.

Changing the outline does not authorize inventing unsupported source content or silently changing the learner's Mission. If the request conflicts with the source or Mission, retain the current revision and explain the conflict in learner-facing Chinese.

### 5. Generate on request

Only generate when the request names the exact current plan revision. Ignore or reject stale generation requests.

Publish lessons incrementally as `lessons/NNNN-dash-case-name.html`. After validating each lesson, update `lessons/index.json` first, then set `publishedLessons` in the snapshot to the manifest's published count and set generation status `partially_ready`. Set it to `ready` only when every indexed lesson is published and every planned reference destination exists.

Before authoring the first lesson, read [LESSON-QUALITY-FORMAT.md](./LESSON-QUALITY-FORMAT.md). Write learner-facing content in natural Chinese. The visible learning moves are obligations, not a mechanical template: spend space on the source's actual difficulty and omit unsupported detail instead of padding every section.

Each lesson must:

- teach one tightly scoped move tied to the Mission;
- cite stable locations in the supplied source;
- label source-grounded blocks with their exact anchors and label invented teaching transfers separately;
- state one observable learning objective, explain the hard step progressively, and end with an aligned self-check plus immediate answer logic;
- distinguish source claims from external corrections;
- include a retrieval or practice loop with immediate feedback;
- preserve important cases and boundaries instead of reducing them to slogans;
- link to relevant lessons and reference artifacts;
- invite follow-up questions from the tutor.

Before publication, run `python3 scripts/check-quick-course.py --workspace /absolute/workspace --lesson lessons/NNNN-name.html`. After the lesson index and snapshot advance, run the full checker again so cross-lesson repetition and publication counts are checked. A structural pass never replaces reopening and semantically comparing every source anchor.

Use high-trust external sources only to correct, update, or clarify the uploaded material. Never replace missing source content with parametric guesses.

### 5a. Revise or regenerate one published lesson

When Kimi Study names an exact lesson path, base content revision, and operation id, read [LESSON-REVISION-FORMAT.md](./LESSON-REVISION-FORMAT.md) before acting. Reject stale revisions. Draft and validate only the named lesson, preserve its indexed identity and exact source-anchor set, then publish through `scripts/lesson_revision.py`. Do not create a course, change the plan, alter generation counts, or touch another lesson. A failed check leaves the published lesson unchanged.

## Upgrade boundary

If the learner asks for deep study, do not simulate it inside quick mode. Preserve the uploaded source identity and quick artifacts, then let Kimi Study activate `teach-ria`. Quick evidence remains a useful survey but never becomes deep certification.

## Durable learning

Keep lessons short enough for working memory while using desirable difficulty for storage strength: retrieval, spacing, interleaving where appropriate, and immediate feedback. Record demonstrated understanding—not mere coverage—in `learning-records/`.
