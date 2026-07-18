# Kimi Study approved UI baselines

Approved on 2026-07-18. These self-contained HTML prototypes are immutable visual and interaction acceptance references. They are not production component source and must not be copied wholesale into Vue. Production work must use the repository's existing design tokens, icon registry, shared components, accessibility rules, and Study architecture. Any visual change to these references requires explicit user approval.

## Reference files

| Reference | Approved source | SHA-256 |
| --- | --- | --- |
| [`home-approved.html`](./home-approved.html) | `kimi-study-notebooklm-bookshelf-a-catalog (1).html` | `6fc04ce62182f887bf9525f3ac76fc573b283e1f7c0f95adf74c86f4f16897da` |
| [`course-workspace-approved.html`](./course-workspace-approved.html) | `kimi-study-course-workspace-v5-teach-visible.html` | `5dd273c91ffe7be28396c7c08595bfa381cfe683c5ff100fc480a5156b38304f` |

Verify the stored bytes with:

```sh
sha256sum docs/study-ui-baselines/home-approved.html \
  docs/study-ui-baselines/course-workspace-approved.html
```

## Approved home decisions

- Use the light NotebookLM-style visual direction.
- Keep three primary destinations: 我的学习, 教材库, and 图书馆.
- Prefer real covers; use the approved consistent system cover when none exists.
- Support continue learning, recent courses, search, filters, and grid/list views.
- New course creation offers three entry points: 教材库, 图书馆, and 上传材料.
- Prepared material cards show learner-facing book or textbook metadata, never package, checksum, RIA, or revision terminology.

Production mapping:

- App routing and page selection: `apps/kimi-web/src/study/StudyApp.vue`
- Home orchestration and creation entry points: `apps/kimi-web/src/study/components/product/StudyProductHome.vue`
- Resumable course display: `apps/kimi-web/src/study/components/StudyCourseList.vue`
- Catalog discovery and course creation: `apps/kimi-web/src/study/composables/useStudyProduct.ts`, `apps/kimi-web/src/study/product/studyProductController.ts`, and `apps/kimi-web/src/study/runtime/kimiStudyRuntime.ts`

## Approved course-workspace decisions

- Use three rounded NotebookLM-style modules: learning context on the left, authoritative course content in the middle, and Kimi assistant on the right.
- Left and right modules are resizable and independently collapsible.
- Support focus mode and course fullscreen.
- The left module contains 学习概览, 学习地图, and 课程目录.
- Never expose raw Teach files directly to learners.
- Convert Mission, material understanding, core methods, applicability boundaries, learning path, deferred content, learning records, and trusted sources into learner-facing language.
- Render authoritative lesson HTML in the center module.
- Bind Kimi assistant to the current lesson and let citations navigate to supporting course evidence.

Production mapping:

- Workspace shell and current lesson/tutor orchestration: `apps/kimi-web/src/study/components/product/StudyLearning.vue`
- Sandboxed authoritative lesson rendering: `apps/kimi-web/src/study/components/StudyLessonReader.vue`
- Outline and preparation states: `apps/kimi-web/src/study/components/product/StudyOutline.vue` and `apps/kimi-web/src/study/components/product/StudyPreparing.vue`
- Learner-facing artifact projection and policy: `apps/kimi-web/src/study/domain/lessonDocument.ts`, `apps/kimi-web/src/study/domain/courseOutline.ts`, and `apps/kimi-web/src/study/domain/studyPolicy.ts`
- Tutor context and thread projection: `apps/kimi-web/src/study/domain/tutorThread.ts` and `apps/kimi-web/src/study/product/studyProductController.ts`

## Acceptance use

Future Vue integration should compare hierarchy, density, responsive behavior, visible labels, and interaction outcomes against these files. The prototypes may contain standalone CSS, inline SVG, mock data, and demonstration JavaScript that do not satisfy production architecture; those are reference implementations only.
