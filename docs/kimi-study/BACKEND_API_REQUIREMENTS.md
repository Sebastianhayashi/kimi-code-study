# Kimi Study Backend API Requirements

> This document is written for the backend owner (Grok). It describes the data model and HTTP/API surface that the Kimi Study frontend expects, so the backend can be wired up incrementally.
>
> The source of truth for learning content is the **Teach Skill file tree** inside the active workspace:
> - `MISSION.md` → one or more `StudyMission`
> - `RESOURCES.md` → `StudyResource` library
> - `learning-records/*.md` → `LearningRecord`
> - `NOTES.md` → free-form learner notes (future)

---

## 1. Data model

The frontend already owns these TypeScript types in `apps/kimi-web/src/types/study.ts`. The backend should return JSON that matches these shapes exactly.

### `StudyMission`

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | `string` | `MISSION.md` front-matter `id` or slugified title | Stable identifier. |
| `title` | `string` | `MISSION.md` H1 or front-matter `title` | |
| `description` | `string` | `MISSION.md` first paragraph or front-matter `description` | |
| `duration` | `string` | front-matter `duration` | Human-readable, e.g. `"30 分钟"`. |
| `tags` | `string[]` | front-matter `tags` | |
| `order` | `number` | front-matter `order` or file sort order | Determines display order. |
| `started` | `boolean` | `learning-records/` + `MISSION.md` | True if any step has a non-superseded record. |
| `completed` | `boolean` | `learning-records/` + `MISSION.md` | True if `completedSteps === totalSteps`. |
| `totalSteps` | `number` | count of H2/H3 sections or checklist items in `MISSION.md` | |
| `completedSteps` | `number` | count of steps with a non-superseded record | |

### `StudyResource`

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | `string` | `RESOURCES.md` front-matter or slugified title | |
| `missionId` | `string?` | `RESOURCES.md` front-matter `mission` or inline tag | Optional. If set, the resource is shown on that mission card. |
| `title` | `string` | `RESOURCES.md` entry title | |
| `type` | `"article" \| "video" \| "epub" \| "pdf" \| "exercise" \| "link"` | front-matter `type` or inferred from URL/file ext | |
| `source` | `string` | front-matter `source` or URL host / filename | |
| `consumed` | `boolean` | learner action or record evidence | Future: can be toggled by the learner. |

### `LearningRecord`

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | `string` | filename stem or UUID | |
| `missionId` | `string` | extracted from record front-matter `mission` | |
| `prompt` | `string` | the question / capability being demonstrated | |
| `response` | `string` | the learner's answer / work product | Can contain markdown. |
| `createdAt` | `ISO 8601 string` | file mtime or front-matter `createdAt` | |
| `superseded` | `boolean` | front-matter `superseded` or newer record exists for same capability | |

### `StudyProgress`

Derived by the backend, not stored as a file. The frontend currently computes this itself; the backend may optionally provide it pre-computed.

| Field | Type | Derived from |
|-------|------|--------------|
| `totalMissions` | `number` | `missions.length` |
| `completedMissions` | `number` | missions where `completed === true` |
| `inProgressMissions` | `number` | missions where `started && !completed` |
| `totalResources` | `number` | `resources.length` |
| `consumedResources` | `number` | resources where `consumed === true` |
| `totalRecords` | `number` | `records.length` |

### `StudyContext`

Top-level container returned by the main read endpoint.

| Field | Type | Source |
|-------|------|--------|
| `workspaceName` | `string` | workspace folder name or `teach-skill.yaml` config |
| `learnerName` | `string` | `teach-skill.yaml` config or user profile; default `"学习者"` |
| `missions` | `StudyMission[]` | all `MISSION.md` files in the workspace |
| `resources` | `StudyResource[]` | `RESOURCES.md` |
| `records` | `LearningRecord[]` | all `learning-records/*.md` files |

---

## 2. Required API surface

The frontend is currently implemented in `apps/kimi-web/src/composables/useStudyData.ts` with mock data. Replace the mock refs/computed with calls to these endpoints.

### `GET /api/study/context`

Returns the full `StudyContext` for the active workspace.

```jsonc
{
  "workspaceName": "家庭学习空间",
  "learnerName": "学习者",
  "missions": [ /* StudyMission[] */ ],
  "resources": [ /* StudyResource[] */ ],
  "records": [ /* LearningRecord[] */ ]
}
```

Frontend usage: replace `context` ref in `useStudyData.ts`.

### `GET /api/study/progress`

Returns `StudyProgress`.

```jsonc
{
  "totalMissions": 3,
  "completedMissions": 0,
  "inProgressMissions": 1,
  "totalResources": 3,
  "consumedResources": 1,
  "totalRecords": 1
}
```

Frontend usage: replace `progress` computed, or derive it from `/api/study/context`.

### `GET /api/study/missions/:missionId/resources`

Returns `StudyResource[]` filtered by `missionId`.

Frontend usage: replace `resourcesForMission(missionId)`.

### `GET /api/study/missions/:missionId/records`

Returns non-superseded `LearningRecord[]` filtered by `missionId`.

Frontend usage: replace `recordsForMission(missionId)`.

### `POST /api/study/missions/:missionId/start` *(future)*

Marks a mission as `started`. Not required for the first static-read version, but the "开始学习" button on `StudyHomeView.vue` is already wired to call it later.

### `POST /api/study/missions/:missionId/complete-step` *(future)*

Records progress for a step. Body should include the step identifier and optionally a learner response.

### `POST /api/study/resources/:resourceId/consume` *(future)*

Toggles `consumed` on a resource.

---

## 3. File parser requirements

### `MISSION.md` format (one per mission)

```markdown
---
id: mission-1
title: 了解 Kimi Code 能做什么
description: 通过几个简单例子，认识 Kimi Code 如何帮助你学习、写笔记和整理资料。
duration: 20 分钟
tags: [入门, 工具介绍]
order: 1
---

# 了解 Kimi Code 能做什么

## 步骤 1：打开 Kimi Code
...

## 步骤 2：发出第一个请求
...
```

Backend should:
1. Parse YAML front-matter.
2. Fall back to H1 for title and first paragraph for description.
3. Count top-level sections (H2) as `totalSteps`.
4. Cross-reference `learning-records/` to compute `completedSteps`, `started`, and `completed`.

### `RESOURCES.md` format (single file)

```markdown
---
---

## 资源 1：Kimi Code 快速上手

- type: article
- source: 官方文档
- mission: mission-1

## 资源 2：三分钟认识界面

- type: video
- source: 教学视频
- mission: mission-1
```

Backend should parse each H2 entry into a `StudyResource`, reading attributes from the bullet list or YAML front-matter per entry.

### `learning-records/YYYY-MM-DD-mission-id-slug.md`

```markdown
---
mission: mission-1
capability: 了解界面布局
superseded: false
---

## Prompt
Kimi Code 和学习工具最大的区别是什么？

## Response
它可以直接读取我本地的文件，并陪我一步一步学习。
```

Backend should:
1. Parse front-matter `mission` and `superseded`.
2. Use `capability` or the first H2/H3 as `prompt`.
3. Use the content under the response heading as `response`.
4. Set `createdAt` from file mtime or front-matter.

---

## 4. Suggested implementation path

### Phase 1 — read-only (unblocks the current frontend)
1. Add an API route `/api/study/context` that walks the active workspace and parses the files above.
2. Return JSON matching the TypeScript types.
3. Update `useStudyData.ts` to fetch from this endpoint instead of using mock data.
4. Keep `progress`, `currentMission`, `resourcesForMission`, and `recordsForMission` as frontend computed helpers derived from the fetched context.

### Phase 2 — mutations
1. Implement `POST /api/study/missions/:missionId/start`.
2. Implement step completion/recording endpoints.
3. Implement resource consumption toggle.
4. Wire the "开始学习 / 继续学习" button in `StudyHomeView.vue`.

### Phase 3 — persistence & sync
1. Store progress in a small JSON/ SQLite file inside the workspace or user config dir.
2. Handle workspace switches by invalidating the context cache.

---

## 5. Open questions for Grok

1. **Active workspace resolution**: should the backend derive the active workspace from the existing Kimi Code workspace API, or should Kimi Study have its own workspace selector?
2. **File watcher**: should the backend watch `MISSION.md`/`RESOURCES.md`/`learning-records/` for changes and push updates, or should the frontend poll `GET /api/study/context`?
3. **Resource content delivery**: for EPUB/PDF resources, should the backend stream the file bytes, or just return a local file URL that the frontend opens?
4. **Learner identity**: is `learnerName` per workspace, per user profile, or global?

Please align these with the existing Kimi Code backend conventions before implementing Phase 2.

---

## 6. Frontend integration points

- `apps/kimi-web/src/types/study.ts` — canonical data shapes; do not change without frontend review.
- `apps/kimi-web/src/composables/useStudyData.ts` — replace mock data with API calls here.
- `apps/kimi-web/src/views/StudyHomeView.vue` — the main Study UI; later it will call mutation endpoints from event handlers.
- `apps/kimi-web/src/i18n/locales/{en,zh}/study.ts` — UI copy; new backend-facing labels should be added here first.
