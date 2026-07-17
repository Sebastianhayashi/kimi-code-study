import { describe, expect, it, vi } from 'vitest';

import type { AppMessage, AppQuestionRequest, FsEntry, QuestionResponse } from '../src/api/types';
import { applyCourseEvent, createUploadCourse } from '../src/study/domain/courseState';
import type { CertifiedCatalogMaterial } from '../src/study/domain/catalogPackage';
import { StudyProductController } from '../src/study/product/studyProductController';
import { installedSkillMatches } from '../src/study/runtime/kimiStudyRuntime';
import {
  StudyCourseRegistry,
  type StudyCourseBinding,
  type StudyStorage,
} from '../src/study/runtime/courseRegistry';
import type {
  StartCourseInput,
  StudyRuntimePort,
  StudyRuntimeReadiness,
  StudyRuntimeSnapshotLoad,
  StudyRuntimeWatchHandlers,
  StudyTextLoad,
} from '../src/study/runtime/studyRuntime';
import { normalizeStudyQuestion } from '../src/study/runtime/studyRuntime';

const NOW = '2026-07-17T00:00:00.000Z';

class MemoryStorage implements StudyStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function binding(courseId: string): StudyCourseBinding {
  return {
    schemaVersion: 1,
    courseId,
    workspacePath: `/home/yuyu/kimi-study-workspace/${courseId}`,
    sessionId: 'session-1',
    title: 'Book.pdf',
    sourceKind: 'upload',
    operations: {},
    updatedAt: NOW,
  };
}

class FakeRuntime implements StudyRuntimePort {
  startCalls: StartCourseInput[] = [];
  handlers: StudyRuntimeWatchHandlers | undefined;
  currentBinding: StudyCourseBinding | undefined;
  loaded: StudyRuntimeSnapshotLoad = { status: 'missing' };
  uploaded = {
    fileId: 'file-1',
    name: 'Book.pdf',
    mediaType: 'application/pdf',
    size: 10,
    sourceRevision: 'file:file-1',
  };

  async checkReadiness(): Promise<StudyRuntimeReadiness> {
    return { api: 'ready', auth: 'ready', backend: 'v2', capabilities: {} };
  }
  async listCourses(): Promise<StudyCourseBinding[]> {
    return this.currentBinding === undefined ? [] : [this.currentBinding];
  }
  async uploadMaterial(): Promise<typeof this.uploaded> { return this.uploaded; }
  async startCourse(input: StartCourseInput): Promise<StudyCourseBinding> {
    this.startCalls.push(input);
    this.currentBinding = binding(input.snapshot.courseId);
    return this.currentBinding;
  }
  async resumeCourse(): Promise<StudyCourseBinding | undefined> { return this.currentBinding; }
  async loadSnapshot(): Promise<StudyRuntimeSnapshotLoad> { return this.loaded; }
  async watchCourse(_courseId: string, handlers: StudyRuntimeWatchHandlers): Promise<() => void> {
    this.handlers = handlers;
    return vi.fn();
  }
  async answerQuestion(_courseId: string, _questionId: string, _response: QuestionResponse): Promise<void> {}
  async dismissQuestion(): Promise<void> {}
  async requestGeneration(): Promise<void> {}
  async readCourseText(): Promise<StudyTextLoad> { return { status: 'missing' }; }
  async listCourseFiles(): Promise<readonly FsEntry[] | undefined> { return undefined; }
  async listCatalog(): Promise<readonly CertifiedCatalogMaterial[]> { return []; }
  async sendTutorMessage(): Promise<void> {}
  async listTutorMessages(): Promise<readonly AppMessage[]> { return []; }
  async requestPlanChange(): Promise<void> {}
}

describe('StudyCourseRegistry', () => {
  it('stores only resumable orchestration pointers and tolerates corruption', () => {
    const storage = new MemoryStorage();
    const registry = new StudyCourseRegistry(storage);
    registry.saveCourse(binding('course-12345678'));
    expect(registry.getCourse('course-12345678')?.sessionId).toBe('session-1');

    storage.values.set('kimi-study.course-bindings.v1', '{broken');
    expect(registry.listCourses()).toEqual([]);
  });

  it('keeps launcher identity separate from course truth', () => {
    const registry = new StudyCourseRegistry(new MemoryStorage());
    registry.saveLauncherSessionId('launcher-1');
    expect(registry.getLauncherSessionId()).toBe('launcher-1');
    expect(registry.listCourses()).toEqual([]);
  });
});

describe('Study question boundary', () => {
  const base: AppQuestionRequest = {
    questionId: 'question-1',
    sessionId: 'session-1',
    questions: [{
      id: 'goal',
      question: 'What matters most?',
      options: [{ id: 'a', label: 'Exam' }, { id: 'b', label: 'Practice' }],
    }],
    createdAt: NOW,
  };

  it('accepts exactly one 2-4 option question card', () => {
    expect(normalizeStudyQuestion(base).status).toBe('ready');
  });

  it('rejects chat-like batches and multi-select developer forms', () => {
    expect(normalizeStudyQuestion({ ...base, questions: [...base.questions, ...base.questions] }).status)
      .toBe('invalid');
    expect(normalizeStudyQuestion({
      ...base,
      questions: [{ ...base.questions[0]!, multiSelect: true }],
    }).status).toBe('invalid');
  });

  it('rejects structurally valid questions that leak internal workflow language', () => {
    const result = normalizeStudyQuestion({
      ...base,
      questions: [{
        ...base.questions[0]!,
        question: 'Should the RIA checker approve V2?',
      }],
    });
    expect(result).toEqual({
      status: 'invalid',
      message: 'Study question card exposes internal workflow language.',
    });
  });
});

describe('Study workflow pin', () => {
  it('requires both the Skill name and advertised contract revision', () => {
    expect(installedSkillMatches(
      { name: 'teach-quick', description: '[contract:teach-quick-v1] Quick', source: 'user' },
      { name: 'teach-quick', contractRevision: 'teach-quick-v1' },
    )).toBe(true);
    expect(installedSkillMatches(
      { name: 'teach-quick', description: 'legacy quick', source: 'user' },
      { name: 'teach-quick', contractRevision: 'teach-quick-v1' },
    )).toBe(false);
  });
});

describe('StudyProductController', () => {
  it('enforces material-first upload then one mode decision before runtime start', async () => {
    const runtime = new FakeRuntime();
    const controller = new StudyProductController(runtime, {
      createCourseId: () => 'course-12345678',
      now: () => NOW,
    });
    const file = new File(['book'], 'Book.pdf', { type: 'application/pdf' });

    await controller.upload(file);
    expect(controller.view.stage).toBe('mode_selection');
    expect(runtime.startCalls).toHaveLength(0);

    await controller.selectMode('quick');
    expect(runtime.startCalls).toHaveLength(1);
    expect(runtime.startCalls[0]?.snapshot.profile?.mode).toBe('quick');
    expect(controller.view.stage).toBe('working');
  });

  it('renders only validated native questions and records answers through the runtime', async () => {
    const runtime = new FakeRuntime();
    const controller = new StudyProductController(runtime, {
      createCourseId: () => 'course-12345678',
      now: () => NOW,
    });
    await controller.upload(new File(['book'], 'Book.pdf'));
    await controller.selectMode('quick');
    const request: AppQuestionRequest = {
      questionId: 'q-1',
      sessionId: 'session-1',
      questions: [{
        id: 'mission',
        question: '你的目标是什么？',
        options: [{ id: 'a', label: '快速了解' }, { id: 'b', label: '准备考试' }],
      }],
      createdAt: NOW,
    };
    const normalized = normalizeStudyQuestion(request);
    if (normalized.status !== 'ready') throw new Error('test fixture invalid');
    runtime.handlers?.onQuestion(normalized.question);
    expect(controller.view.stage).toBe('question');
    expect(controller.view.question?.questions).toHaveLength(1);
  });

  it('never replaces a valid local state with a missing artifact', async () => {
    const runtime = new FakeRuntime();
    const controller = new StudyProductController(runtime, {
      createCourseId: () => 'course-12345678',
      now: () => NOW,
    });
    await controller.upload(new File(['book'], 'Book.pdf'));
    const before = controller.view.snapshot;
    await controller.refresh('course-12345678');
    expect(controller.view.snapshot).toBe(before);
  });
});

describe('generation revision gate', () => {
  it('does not allow generation from a stale or absent plan', () => {
    const draft = createUploadCourse('course-12345678', {
      fileId: 'file-1',
      name: 'Book.pdf',
      mediaType: 'application/pdf',
      size: 10,
      sourceRevision: 'file:file-1',
    }, NOW);
    const quick = applyCourseEvent(draft, { type: 'mode_selected', mode: 'quick' }, NOW);
    expect(quick.canGenerate).toBe(false);
  });
});
