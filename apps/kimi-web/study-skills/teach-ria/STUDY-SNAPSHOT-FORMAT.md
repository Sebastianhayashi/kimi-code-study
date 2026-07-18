# Kimi Study snapshot contract

Keep `source/STUDY-SNAPSHOT.json` valid after every durable transition. Write JSON only—no comments or Markdown fences.

Required identity for a fresh upload:

```json
{
  "schemaVersion": 1,
  "contractRevision": "kimi-study-foundation-v1",
  "courseId": "course-from-activation-args",
  "profile": {
    "mode": "deep",
    "skill": { "name": "teach-ria", "contractRevision": "teach-ria-v5" },
    "sourceRevision": "exact-source-revision",
    "selectedBy": "user"
  }
}
```

For a catalog package use mode `deep_preprocessed`, selectedBy `catalog`, and the exact same immutable `packageRef` in both `profile` and `source`.

Also include:

- `source`: `kind`, `sourceId`, `title`, `revision`, `status`, `evidenceLevel`; deep certification adds `reading` with `coveragePercent`, `blockedRanges`, `certificateRevision` and `ria` with `status`, `revision`.
- `mission`: `status`, integer `revision`, integer `questionsAsked`, and `summary` when ready.
- `plan`: `status`; when ready add `revision`, `basedOnSourceRevision`, `basedOnMissionRevision`, and course statistics.
- `generation`: `status`, integer `publishedLessons`; add `planRevision` when generation begins and `totalLessons` when known.
- `approvals`: provenance objects with `actor`, `policyRevision`, `approvedRevision`, `approvedAt`, and optional `reason`.
- `updatedAt`: ISO-8601 timestamp.

Deep gates:

- source evidence begins `certification_pending` and becomes `certified` only at 100% coverage, zero blocked ranges, a certificate revision, and ready RIA revision;
- Mission ready requires 2–4 questions and a non-empty summary;
- a ready plan points to exact current source and Mission revisions;
- generation points to exact current plan revision;
- automatic work records actor `auto_policy`, never `user`;
- malformed, missing, or stale evidence becomes an explicit blocked state, never inferred readiness.

Before setting source and plan ready, run `python3 scripts/check-book-course.py --workspace /absolute/workspace`.
