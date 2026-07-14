/**
 * Pure, DOM-independent state machine for the Kimi Study controlled demo.
 *
 * This module drives the browser-visible Study vertical slice using local,
 * in-memory state only. It does not claim learning evidence, mastery, progress,
 * or persistence, and it does not touch storage or the network.
 */

import type { LessonSource } from './lessonDocument';
import type { Study, StudyLesson, StudyMissionFields, StudyStatus } from '../../types/study';
import { getInitialActiveStudyId, mockStudies } from '../data/mockStudies';

export type KimiProductMode = 'code' | 'study';

/** Demo views available in the Study shell. */
export type StudyView = 'home' | 'detail' | 'lesson' | 'new';

/** Steps inside the new-study flow. */
export type NewStudyStep = 'upload' | 'mission' | 'preview';

/** In-memory state of the "new study" onboarding flow. */
export interface NewStudyFlow {
  step: NewStudyStep;
  material: string;
  answers: string[];
  roundIndex: number;
  generatedMission?: StudyMissionFields;
  previewLesson?: StudyLesson;
  previewStudyTitle?: string;
}

/**
 * In-memory demo state. All values are controlled snapshot data; no field
 * implies real learning progress, persistence, or evidence.
 */
export interface StudyDemoState {
  readonly view: StudyView;
  readonly studies: Study[];
  readonly activeStudyId?: string;
  readonly lessonId?: string;
  readonly newFlow: NewStudyFlow | null;
  readonly quickrefOpen: boolean;
  readonly learnerName: string;
  readonly demoNotice: string;
}

/** Events that transition the demo state machine. */
export type StudyDemoEvent =
  | { type: 'select-study'; studyId: string }
  | { type: 'continue-study'; studyId: string }
  | { type: 'go-new-study' }
  | { type: 'upload-complete'; material: string }
  | { type: 'mission-next'; answer: string }
  | { type: 'mission-done' }
  | { type: 'open-lesson'; studyId: string; lessonId: string }
  | { type: 'prev-lesson' }
  | { type: 'next-lesson' }
  | { type: 'open-quickref' }
  | { type: 'close-quickref' }
  | { type: 'go-home' };

/** Resolve the active product mode from the Vite env / runtime value. */
export function resolveKimiProductMode(raw: unknown): KimiProductMode {
  if (raw === 'study') return 'study';
  return 'code';
}

/** Rounds of the mock Mission conversation. */
export const MISSION_ROUNDS: readonly string[] = [
  '你想学什么？用最简短的一句话说说你最想实现的学习结果。',
  '太棒了。你主要会在什么场景下用到它？比如给家人、工作、旅行。',
  '明白了。你现在遇到的具体困难是什么？',
  '如果我们把目标定为“能独立完成一个小成果”，你觉得合适吗？',
];

/** Derive a study status from its lessons and records. */
export function deriveStudyStatus(lessons: StudyLesson[]): StudyStatus {
  if (lessons.length === 0) return 'not-started';
  const completed = lessons.filter((l) => l.records.length > 0).length;
  if (completed === 0) return 'not-started';
  if (completed >= lessons.length) return 'completed';
  return 'in-progress';
}

/** Find the next lesson without a record, or the last lesson. */
export function deriveCurrentLessonId(lessons: StudyLesson[]): string {
  const next = lessons.find((l) => l.records.length === 0);
  return next?.id ?? lessons[lessons.length - 1]?.id ?? '';
}

function findStudy(state: StudyDemoState, studyId?: string): Study | undefined {
  const id = studyId ?? state.activeStudyId;
  if (!id) return undefined;
  return state.studies.find((s) => s.id === id);
}

function findLesson(study: Study, lessonId?: string): StudyLesson | undefined {
  if (lessonId) return study.lessons.find((l) => l.id === lessonId);
  return study.lessons.find((l) => l.id === study.currentLessonId) ?? study.lessons[0];
}

function buildLessonSource(lesson: StudyLesson): LessonSource {
  return {
    path: lesson.path,
    title: lesson.title,
    html: lesson.html,
    state: lesson.state,
    error: lesson.error,
  };
}

/** Expose the current lesson as a LessonSource for the reader. */
export function selectCurrentLessonSource(state: StudyDemoState): LessonSource | null {
  const study = findStudy(state);
  if (!study) return null;
  const lesson = findLesson(study, state.lessonId);
  if (!lesson) return null;
  return buildLessonSource(lesson);
}

/** Expose the current quickref as a LessonSource for the reader. */
export function selectCurrentQuickrefSource(state: StudyDemoState): LessonSource | null {
  const study = findStudy(state);
  if (!study) return null;
  const lesson = findLesson(study, state.lessonId);
  if (!lesson) return null;
  return {
    path: lesson.quickref.path,
    title: lesson.quickref.title,
    html: lesson.quickref.html,
    state: lesson.quickref.state ?? 'ok',
    error: lesson.quickref.error,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildPreviewHtml(title: string, summary: string): string {
  const safeTitle = escapeHtml(title);
  const safeSummary = escapeHtml(summary);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    body { margin: 0; padding: 2rem 1.5rem; font-family: system-ui, sans-serif; line-height: 1.7; }
    h1 { font-size: 1.5rem; margin: 0 0 1rem; }
    p { margin: 0 0 1rem; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>${safeSummary}</p>
  <p>这是根据你提供的材料生成的第一课预览。开始学习后，你会看到完整课程内容。</p>
</body>
</html>`;
}

function generateNewStudy(material: string, _answers: string[]): { study: Study; firstLesson: StudyLesson } {
  const isPhoto = material.includes('拍照') || material.includes('照片') || material.includes('摄影');
  const title = isPhoto ? '手机拍照入门' : '新学习主题';
  const studyId = `new-study-${Date.now()}`;
  const mission: StudyMissionFields = isPhoto
    ? {
        why: '想用手机给孙子拍出清晰、背景干净、表情自然的照片，留下值得回忆的瞬间。',
        successLooksLike: [
          '能根据光线和场景选择合适拍摄模式。',
          '拍出的照片不再发虚，主体清晰。',
          '能用简单构图让画面更干净、更有重点。',
        ],
        constraints: [
          '只使用手机自带相机，不买额外设备。',
          '每次练习控制在 10 分钟以内。',
          '以家人和日常生活场景为主要练习对象。',
        ],
        outOfScope: ['不学习专业后期修图。', '不购买相机、镜头、灯光等外部设备。'],
      }
    : {
        why: `基于你提供的材料，建立一个清晰、可执行的学习目标。`,
        successLooksLike: [
          '能理解材料中的核心概念。',
          '能在真实场景中独立完成一个小成果。',
          '能向他人简要说明学到的内容。',
        ],
        constraints: [
          '每次学习控制在 15 分钟以内。',
          '以材料本身为主，不引入过多外部理论。',
        ],
        outOfScope: ['不做学术研究式精读。', '不购买额外设备或软件。'],
      };

  const firstLesson: StudyLesson = {
    id: `${studyId}-l1`,
    studyId,
    order: 1,
    title: isPhoto ? '第一课：为什么照片会拍糊？' : '第一课：认识你的学习目标',
    summary: isPhoto ? '光线和手稳是清晰照片的关键。' : '先搞清楚为什么学、学成什么样。',
    path: 'lessons/new-0001.html',
    html: buildPreviewHtml(
      isPhoto ? '第一课：为什么照片会拍糊？' : '第一课：认识你的学习目标',
      isPhoto
        ? '拍糊通常只有两个原因：手抖，或者主体在动。光线越暗，快门越慢，越容易糊。'
        : '好的学习目标要回答三个问题：你想做什么？在什么场景下做？做到什么程度算成功？',
    ),
    state: 'ok',
    quickref: {
      id: `${studyId}-q1`,
      lessonId: `${studyId}-l1`,
      title: isPhoto ? '速查卡：清晰照片三要素' : '速查卡：学习目标自检',
      path: `reference/${studyId}-0001-quickref.html`,
      html: buildPreviewHtml(
        isPhoto ? '速查卡：清晰照片三要素' : '速查卡：学习目标自检',
        isPhoto
          ? '1. 光线充足；2. 按快门后稳住 1 秒；3. 让主体停下或连拍。'
          : '1. 目标具体；2. 场景明确；3. 成果可观察。',
      ),
    },
    records: [],
  };

  const study: Study = {
    id: studyId,
    title,
    emoji: isPhoto ? '📷' : '📚',
    mission,
    status: 'in-progress',
    resources: [
      {
        id: `${studyId}-res-1`,
        missionId: studyId,
        title: material || '上传的材料',
        type: 'epub',
        source: material || '上传的材料',
        consumed: false,
      },
    ],
    lessons: [firstLesson],
    records: [],
    currentLessonId: firstLesson.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { study, firstLesson };
}

/** Create the initial controlled demo state. */
export function createStudyDemoState(): StudyDemoState {
  const studies = mockStudies;
  const activeStudyId = getInitialActiveStudyId(studies);
  const activeStudy = studies.find((s) => s.id === activeStudyId);
  return {
    view: 'home',
    studies,
    activeStudyId,
    lessonId: activeStudy?.currentLessonId,
    newFlow: null,
    quickrefOpen: false,
    learnerName: '家人',
    demoNotice: '演示空间 / 所有数据仅保存在当前页面',
  };
}

/** Immutable state transition for the Study demo. */
export function transitionStudyDemo(state: StudyDemoState, event: StudyDemoEvent): StudyDemoState {
  switch (event.type) {
    case 'select-study': {
      const study = state.studies.find((s) => s.id === event.studyId);
      if (!study) return state;
      return {
        ...state,
        view: 'detail',
        activeStudyId: study.id,
        quickrefOpen: false,
      };
    }

    case 'continue-study': {
      const study = findStudy(state, event.studyId);
      if (!study) return state;
      const lesson = findLesson(study, study.currentLessonId);
      if (!lesson) {
        // No lessons yet: land on the detail screen instead of a blank lesson.
        return {
          ...state,
          view: 'detail',
          activeStudyId: study.id,
          quickrefOpen: false,
        };
      }
      return {
        ...state,
        view: 'lesson',
        activeStudyId: study.id,
        lessonId: lesson.id,
        quickrefOpen: false,
      };
    }

    case 'go-new-study':
      return {
        ...state,
        view: 'new',
        newFlow: { step: 'upload', material: '', answers: [], roundIndex: 0 },
        quickrefOpen: false,
      };

    case 'upload-complete': {
      if (!state.newFlow) return state;
      return {
        ...state,
        newFlow: {
          ...state.newFlow,
          step: 'mission',
          material: event.material || '未命名材料',
          roundIndex: 0,
          answers: [],
        },
      };
    }

    case 'mission-next': {
      if (!state.newFlow || state.newFlow.step !== 'mission') return state;
      const answer = event.answer.trim();
      if (!answer) return state;
      const answers = [...state.newFlow.answers, answer];
      if (state.newFlow.roundIndex < MISSION_ROUNDS.length - 1) {
        return {
          ...state,
          newFlow: {
            ...state.newFlow,
            answers,
            roundIndex: state.newFlow.roundIndex + 1,
          },
        };
      }
      // Last round answered: generate the preview.
      const material = state.newFlow.material;
      const { study, firstLesson } = generateNewStudy(material, answers);
      return {
        ...state,
        newFlow: {
          ...state.newFlow,
          step: 'preview',
          answers,
          generatedMission: study.mission,
          previewLesson: firstLesson,
          previewStudyTitle: study.title,
        },
      };
    }

    case 'mission-done': {
      if (!state.newFlow || state.newFlow.step !== 'preview') return state;
      const previewLesson = state.newFlow.previewLesson;
      const generatedMission = state.newFlow.generatedMission;
      if (!previewLesson || !generatedMission) return state;
      const studyId = `new-study-${Date.now()}`;
      const lesson: StudyLesson = {
        ...previewLesson,
        id: `${studyId}-l1`,
        studyId,
        quickref: {
          ...previewLesson.quickref,
          id: `${studyId}-q1`,
          lessonId: `${studyId}-l1`,
          path: `reference/${studyId}-0001-quickref.html`,
        },
      };
      const study: Study = {
        id: studyId,
        title: state.newFlow.previewStudyTitle || '新学习主题',
        emoji: '📚',
        mission: generatedMission,
        status: 'in-progress',
        resources: [
          {
            id: `${studyId}-res-1`,
            missionId: studyId,
            title: state.newFlow.material || '上传的材料',
            type: 'epub',
            source: state.newFlow.material || '上传的材料',
            consumed: false,
          },
        ],
        lessons: [lesson],
        records: [],
        currentLessonId: lesson.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const studies = [study, ...state.studies];
      return {
        ...state,
        view: 'lesson',
        studies,
        activeStudyId: study.id,
        lessonId: lesson.id,
        newFlow: null,
        quickrefOpen: false,
      };
    }

    case 'open-lesson': {
      const study = findStudy(state, event.studyId);
      if (!study) return state;
      const lesson = study.lessons.find((l) => l.id === event.lessonId);
      if (!lesson) return state;
      return {
        ...state,
        view: 'lesson',
        activeStudyId: study.id,
        lessonId: lesson.id,
        quickrefOpen: false,
      };
    }

    case 'prev-lesson': {
      const study = findStudy(state);
      if (!study || !state.lessonId) return state;
      const idx = study.lessons.findIndex((l) => l.id === state.lessonId);
      if (idx <= 0) return state;
      return { ...state, lessonId: study.lessons[idx - 1]!.id };
    }

    case 'next-lesson': {
      const study = findStudy(state);
      if (!study || !state.lessonId) return state;
      const idx = study.lessons.findIndex((l) => l.id === state.lessonId);
      if (idx < 0 || idx >= study.lessons.length - 1) return state;
      return { ...state, lessonId: study.lessons[idx + 1]!.id };
    }

    case 'open-quickref':
      return { ...state, quickrefOpen: true };

    case 'close-quickref':
      return { ...state, quickrefOpen: false };

    case 'go-home':
      return {
        ...state,
        view: 'home',
        quickrefOpen: false,
      };

    default:
      return state;
  }
}
