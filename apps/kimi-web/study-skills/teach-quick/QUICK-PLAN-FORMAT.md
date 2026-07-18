# Quick course plan format

Create `source/QUICK-PLAN.md` only after the source survey and Mission are ready.

```md
# Quick course plan

## Control
- Status: {designing | ready | stale | blocked}
- Revision: {stable revision identifier}
- Source revision: {exact source revision}
- Survey revision: {exact QUICK-SURVEY revision}
- Mission revision: {exact integer Mission revision from STUDY-SNAPSHOT.json}
- Approval provenance: {actor=auto_policy; policy=kimi-study-auto-v1; revision=...; at=ISO-8601}

## Course promise
{What the learner can honestly accomplish at survey depth and what remains unverified.}

## Statistics
- Chapters: {integer}
- Pages: {integer lesson/reference pages}
- Quizzes: {integer}

## Learning path
| Sequence | Slice ID | Title | Type | Source anchors | Observable outcome | Destination |
|---|---|---|---|---|---|---|
| 1 | Q01 | {...} | {lesson | reference | quiz} | {...} | {...} | {lessons/0001-name.html or reference/name.html} |

## Visible deferrals
| Material | Source anchors | Why deferred | When to upgrade or revisit |
|---|---|---|---|
| {...} | {...} | {...} | {...} |

## Integrity check
- [ ] Every planned item maps to current survey and Mission revisions.
- [ ] Every high-value survey candidate has a lesson, reference, or visible defer disposition.
- [ ] Important cases and boundaries remain visible.
- [ ] Limitations are learner-visible and do not masquerade as certification.
- [ ] The route is as short as possible without dropping required logic.
```

Do not ask the learner to approve the plan's internal decomposition. Automatic policy approval is valid only after all integrity items pass.
