# Kimi Study snapshot contract

Keep `source/STUDY-SNAPSHOT.json` valid after every durable transition. Write JSON only—no comments or Markdown fences.

Required identity:

```json
{
  "schemaVersion": 1,
  "contractRevision": "kimi-study-foundation-v1",
  "courseId": "course-from-activation-args",
  "profile": {
    "mode": "quick",
    "skill": { "name": "teach-quick", "contractRevision": "teach-quick-v1" },
    "sourceRevision": "exact-source-revision",
    "selectedBy": "user"
  }
}
```

Also include these complete objects:

- `source`: `kind`, `sourceId`, `title`, `revision`, `status`, `evidenceLevel`; add `quickSurveyRevision` only when ready. Quick mode must never add `reading` or `ria`.
- `mission`: `status`, integer `revision`, integer `questionsAsked`, and `summary` when ready.
- `plan`: `status`; when ready add `revision`, `basedOnSourceRevision`, `basedOnMissionRevision`, `chapterCount`, `pageCount`, and `quizCount`.
- `generation`: `status`, integer `publishedLessons`; add `planRevision` when generation begins and `totalLessons` when known.
- `approvals`: an array of `{ "actor", "policyRevision", "approvedRevision", "approvedAt", "reason"? }`.
- `updatedAt`: ISO-8601 timestamp.

Allowed values:

- source status: `selected | surveying | ready | blocked`
- quick evidence: `none | survey`
- Mission: `not_started | interviewing | ready | blocked`
- plan: `not_started | designing | ready | blocked`
- generation: `not_started | generating | partially_ready | ready | blocked`

Revision gates:

- source `revision` must equal profile `sourceRevision`;
- a ready source needs evidence `survey` and `quickSurveyRevision`;
- Mission ready permits 0–1 questions and requires a non-empty summary;
- a ready plan must point to the exact current source and Mission revisions;
- generation must point to the exact current plan revision;
- automatic approvals use actor `auto_policy`, never `user`.

Before declaring the plan ready, run `python3 scripts/check-quick-course.py --workspace /absolute/workspace`.
