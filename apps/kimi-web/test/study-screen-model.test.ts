import { describe, expect, it } from 'vitest';

import type {
  CourseSnapshot,
  StudyArtifactDocument,
} from '../src/study/domain/courseContract';
import {
  STUDY_ARTIFACT_SCHEMA_VERSION,
  STUDY_PRODUCT_CONTRACT_REVISION,
} from '../src/study/domain/courseContract';
import { createUploadCourse, toCourseSnapshot } from '../src/study/domain/courseState';
import { profileForUpload } from '../src/study/domain/studyPolicy';
import type { StudyProductView } from '../src/study/product/studyProductController';
import { deriveStudyScreen } from '../src/study/product/studyScreenModel';
import type { StudyRuntimeReadiness } from '../src/study/runtime/studyRuntime';

const NOW = '2026-07-17T00:00:00.000Z';
const SOURCE_REVISION = 'file:file-1';

const READY: StudyRuntimeReadiness = {
  api: 'ready',
  auth: 'ready',
  backend: 'v2',
  capabilities: {},
};

function documentWith(patch: Partial<StudyArtifactDocument>): CourseSnapshot {
  return toCourseSnapshot({
    schemaVersion: STUDY_ARTIFACT_SCHEMA_VERSION,
    contractRevision: STUDY_PRODUCT_CONTRACT_REVISION,
    courseId: 'course-12345678',
    profile: profileForUpload('quick', SOURCE_REVISION),
    source: {
      kind: 'upload',
      sourceId: 'file-1',
      title: 'Physics.pdf',
      revision: SOURCE_REVISION,
      status: 'surveying',
      evidenceLevel: 'none',
    },
    mission: { status: 'interviewing', revision: 0, questionsAsked: 0 },
    plan: { status: 'not_started' },
    generation: { status: 'not_started', publishedLessons: 0 },
    approvals: [],
    updatedAt: NOW,
    ...patch,
  });
}

function readySnapshot(generation: Partial<StudyArtifactDocument['generation']> = {}): CourseSnapshot {
  return documentWith({
    source: {
      kind: 'upload',
      sourceId: 'file-1',
      title: 'Physics.pdf',
      revision: SOURCE_REVISION,
      status: 'ready',
      evidenceLevel: 'survey',
      quickSurveyRevision: 'survey-v1',
    },
    mission: { status: 'ready', revision: 0, questionsAsked: 0, summary: 'Pass the exam.' },
    plan: {
      status: 'ready',
      revision: 'plan-v1',
      basedOnSourceRevision: SOURCE_REVISION,
      basedOnMissionRevision: 0,
      chapterCount: 3,
      pageCount: 9,
      quizCount: 2,
    },
    generation: { status: 'not_started', publishedLessons: 0, ...generation },
  });
}

function view(patch: Partial<StudyProductView>): StudyProductView {
  return {
    stage: 'idle',
    snapshot: null,
    binding: null,
    question: null,
    readiness: READY,
    connected: true,
    issues: [],
    ...patch,
  };
}

describe('deriveStudyScreen', () => {
  it('waits for the first readiness check before showing anything else', () => {
    const model = deriveStudyScreen(view({ readiness: null }));
    expect(model.screen).toBe('loading');
    expect(model.authRequired).toBe(false);
  });

  it('shows the unavailable screen when the server cannot be reached', () => {
    const model = deriveStudyScreen(view({
      readiness: { api: 'unreachable', auth: 'required', backend: 'unknown', capabilities: {} },
    }));
    expect(model.screen).toBe('unavailable');
  });

  it('flags provider login as required without blocking the home screen', () => {
    const model = deriveStudyScreen(view({
      readiness: { ...READY, auth: 'required', message: 'login required' },
    }));
    expect(model.screen).toBe('home');
    expect(model.authRequired).toBe(true);
    expect(model.readinessMessage).toBe('login required');
  });

  it('keeps uploading on the home screen while busy', () => {
    const model = deriveStudyScreen(view({ stage: 'uploading' }));
    expect(model.screen).toBe('home');
    expect(model.busy).toBe(true);
  });

  it('shows the one-time mode decision after upload', () => {
    const draft = createUploadCourse('course-12345678', {
      fileId: 'file-1',
      name: 'Physics.pdf',
      mediaType: 'application/pdf',
      size: 1024,
      sourceRevision: SOURCE_REVISION,
    }, NOW);
    const model = deriveStudyScreen(view({
      stage: 'mode_selection',
      snapshot: draft,
    }));
    expect(model.screen).toBe('mode_select');
  });

  it('maps preparation, mission, and upgrading phases to the preparing surface', () => {
    expect(deriveStudyScreen(view({
      stage: 'working',
      snapshot: documentWith({}),
    })).screen).toBe('preparing');

    expect(deriveStudyScreen(view({
      stage: 'working',
      snapshot: documentWith({
        source: {
          kind: 'upload',
          sourceId: 'file-1',
          title: 'Physics.pdf',
          revision: SOURCE_REVISION,
          status: 'ready',
          evidenceLevel: 'survey',
          quickSurveyRevision: 'survey-v1',
        },
      }),
    })).screen).toBe('preparing');

    expect(deriveStudyScreen(view({
      stage: 'working',
      snapshot: documentWith({
        profile: profileForUpload('deep', SOURCE_REVISION),
        source: {
          kind: 'upload',
          sourceId: 'file-1',
          title: 'Physics.pdf',
          revision: SOURCE_REVISION,
          status: 'deep_reading',
          evidenceLevel: 'survey',
        },
      }),
    })).screen).toBe('preparing');
  });

  it('maps design and generation phases to the outline surface', () => {
    expect(deriveStudyScreen(view({
      stage: 'working',
      snapshot: readySnapshot(),
    })).screen).toBe('outline');

    expect(deriveStudyScreen(view({
      stage: 'working',
      snapshot: readySnapshot({ status: 'generating', planRevision: 'plan-v1', totalLessons: 9 }),
    })).screen).toBe('outline');
  });

  it('maps partial and full publication to the learning surface', () => {
    expect(deriveStudyScreen(view({
      stage: 'ready',
      snapshot: readySnapshot({ status: 'partially_ready', planRevision: 'plan-v1', publishedLessons: 2, totalLessons: 9 }),
    })).screen).toBe('learning');

    expect(deriveStudyScreen(view({
      stage: 'ready',
      snapshot: readySnapshot({ status: 'ready', planRevision: 'plan-v1', publishedLessons: 9, totalLessons: 9 }),
    })).screen).toBe('learning');
  });

  it('surfaces blocked courses and runtime errors honestly', () => {
    expect(deriveStudyScreen(view({
      stage: 'working',
      snapshot: documentWith({
        source: {
          kind: 'upload',
          sourceId: 'file-1',
          title: 'Physics.pdf',
          revision: SOURCE_REVISION,
          status: 'blocked',
          evidenceLevel: 'none',
          blocker: 'unsupported pages',
        },
      }),
    })).screen).toBe('blocked');

    expect(deriveStudyScreen(view({
      stage: 'error',
      issues: [{ code: 'upload_failed', path: '', message: 'nope', severity: 'error' }],
    })).screen).toBe('error');
  });

  it('reports a pending question card without changing the underlying screen', () => {
    const model = deriveStudyScreen(view({
      stage: 'question',
      snapshot: documentWith({}),
      question: {
        questionId: 'q-1',
        sessionId: 'session-1',
        questions: [{
          id: 'goal',
          question: 'What matters most?',
          options: [{ id: 'a', label: 'Exam' }, { id: 'b', label: 'Practice' }],
        }],
        createdAt: NOW,
      },
    }));
    expect(model.screen).toBe('preparing');
    expect(model.questionOpen).toBe(true);
  });
});
