import { describe, expect, it, vi } from 'vitest';

import type {
  AppMessage,
  AppQuestionRequest,
  AppSession,
  FsEntry,
  KimiWebApi,
  QuestionResponse,
} from '../src/api/types';
import { resolveStudyWorkspaceRoot } from '../src/study/composables/useStudyProduct';
import { applyCourseEvent, createUploadCourse } from '../src/study/domain/courseState';
import type { CertifiedCatalogMaterial } from '../src/study/domain/catalogPackage';
import type { CourseSnapshot } from '../src/study/domain/courseContract';
import { StudyProductController } from '../src/study/product/studyProductController';
import { installedSkillMatches, KimiStudyRuntime } from '../src/study/runtime/kimiStudyRuntime';
import {
  StudyCourseRegistry,
  type StudyCourseBinding,
  type StudyStorage,
} from '../src/study/runtime/courseRegistry';
import type {
  StartCourseInput,
  StudyQuestion,
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
    workspacePath: `/workspace/${courseId}`,
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
  readonly handlersByCourse = new Map<string, StudyRuntimeWatchHandlers>();
  readonly watchStops: Array<ReturnType<typeof vi.fn>> = [];
  readonly watchCalls: string[] = [];
  readonly loadCalls: string[] = [];
  readonly snapshots = new Map<string, CourseSnapshot>();
  readonly postStartSnapshots = new Map<string, CourseSnapshot>();
  currentBinding: StudyCourseBinding | undefined;
  resumeImpl: ((courseId: string) => Promise<StudyCourseBinding | undefined>) | undefined;
  watchDelay: Promise<void> | undefined;
  answerDelay: Promise<void> | undefined;
  generateError: Error | undefined;
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
    // The teaching engine writes its first artifacts asynchronously; by the
    // time the controller refreshes, the authoritative snapshot is readable.
    const authoritative = this.postStartSnapshots.get(input.snapshot.courseId) ?? input.snapshot;
    this.snapshots.set(input.snapshot.courseId, authoritative);
    return this.currentBinding;
  }
  async resumeCourse(courseId: string): Promise<StudyCourseBinding | undefined> {
    return this.resumeImpl === undefined ? this.currentBinding : this.resumeImpl(courseId);
  }
  async loadSnapshot(courseId: string): Promise<StudyRuntimeSnapshotLoad> {
    this.loadCalls.push(courseId);
    const snapshot = this.snapshots.get(courseId);
    return snapshot === undefined ? { status: 'missing' } : { status: 'ready', snapshot };
  }
  async watchCourse(courseId: string, handlers: StudyRuntimeWatchHandlers): Promise<() => void> {
    this.watchCalls.push(courseId);
    if (this.watchDelay !== undefined) await this.watchDelay;
    this.handlers = handlers;
    this.handlersByCourse.set(courseId, handlers);
    const stop = vi.fn();
    this.watchStops.push(stop);
    return stop;
  }
  async answerQuestion(_courseId: string, _questionId: string, _response: QuestionResponse): Promise<void> {
    if (this.answerDelay !== undefined) await this.answerDelay;
  }
  async dismissQuestion(): Promise<void> {}
  async requestGeneration(): Promise<void> {
    if (this.generateError !== undefined) throw this.generateError;
  }
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

describe('Study workspace configuration', () => {
  it('normalizes an explicit absolute workspace root', () => {
    expect(resolveStudyWorkspaceRoot('  /workspace/study///  ')).toBe('/workspace/study');
  });

  it('rejects missing, relative, and filesystem-root values', () => {
    expect(() => resolveStudyWorkspaceRoot(' ')).toThrow('VITE_STUDY_WORKSPACE_ROOT');
    expect(() => resolveStudyWorkspaceRoot('relative/path')).toThrow('absolute directory');
    expect(() => resolveStudyWorkspaceRoot('/')).toThrow('filesystem root');
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

describe('KimiStudyRuntime pagination', () => {
  function session(id: string, cwd = `/workspace/${id}`): AppSession {
    return {
      id,
      title: id,
      createdAt: NOW,
      updatedAt: NOW,
      status: 'idle',
      archived: false,
      cwd,
      model: 'default',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalCostUsd: 0,
        contextTokens: 0,
        contextLimit: 0,
        turnCount: 0,
      },
      messageCount: 0,
      lastSeq: 0,
    };
  }

  function message(id: string, metadata?: Record<string, unknown>): AppMessage {
    return {
      id,
      sessionId: 'session-1',
      role: 'user',
      content: [{ type: 'text', text: id }],
      createdAt: NOW,
      ...(metadata === undefined ? {} : { metadata }),
    };
  }

  function runtimeWith(api: Partial<KimiWebApi>, withBinding = false): KimiStudyRuntime {
    const registry = new StudyCourseRegistry(new MemoryStorage());
    if (withBinding) registry.saveCourse(binding('course-12345678'));
    return new KimiStudyRuntime(
      api as KimiWebApi,
      registry,
      { workspaceRoot: '/workspace' },
    );
  }

  it('finds a session on a later page and forwards the cursor', async () => {
    const listSessions: KimiWebApi['listSessions'] = vi.fn(async (input) =>
      input?.beforeId === undefined
        ? { items: [session('session-new')], hasMore: true }
        : { items: [session('session-target', '/workspace/target')], hasMore: false });
    const runtime = runtimeWith({ listSessions });
    const access = runtime as unknown as {
      findSession(match: (candidate: AppSession) => boolean): Promise<AppSession | undefined>;
    };

    await expect(access.findSession((candidate) => candidate.cwd === '/workspace/target'))
      .resolves.toMatchObject({ id: 'session-target' });
    expect(listSessions).toHaveBeenNthCalledWith(1, {
      pageSize: 100,
      beforeId: undefined,
      includeArchive: true,
    });
    expect(listSessions).toHaveBeenNthCalledWith(2, {
      pageSize: 100,
      beforeId: 'session-new',
      includeArchive: true,
    });
  });

  it('drains all tutor message pages without truncating history', async () => {
    const listMessages: KimiWebApi['listMessages'] = vi.fn(async (_sessionId, input) =>
      input?.beforeId === undefined
        ? { items: [message('message-3'), message('message-2')], hasMore: true }
        : { items: [message('message-1')], hasMore: false });
    const runtime = runtimeWith({ listMessages }, true);

    await expect(runtime.listTutorMessages('course-12345678')).resolves.toEqual([
      message('message-3'),
      message('message-2'),
      message('message-1'),
    ]);
    expect(listMessages).toHaveBeenNthCalledWith(2, 'session-1', {
      pageSize: 100,
      beforeId: 'message-2',
    });
  });

  it('stops paging messages as soon as an operation marker is found', async () => {
    const listMessages: KimiWebApi['listMessages'] = vi.fn(async (_sessionId, input) =>
      input?.beforeId === undefined
        ? { items: [message('message-2')], hasMore: true }
        : {
            items: [message('message-1', { kimiStudyOperationId: 'operation-1' })],
            hasMore: true,
          });
    const runtime = runtimeWith({ listMessages });
    const access = runtime as unknown as {
      findMessage(
        sessionId: string,
        input: { readonly role?: AppMessage['role'] },
        match: (candidate: AppMessage) => boolean,
      ): Promise<AppMessage | undefined>;
    };

    await expect(access.findMessage(
      'session-1',
      { role: 'user' },
      (candidate) => candidate.metadata?.['kimiStudyOperationId'] === 'operation-1',
    )).resolves.toMatchObject({ id: 'message-1' });
    expect(listMessages).toHaveBeenCalledTimes(2);
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

describe('StudyProductController concurrency guards', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  function quickSnapshot(courseId: string): CourseSnapshot {
    const draft = createUploadCourse(courseId, {
      fileId: 'file-1',
      name: 'Book.pdf',
      mediaType: 'application/pdf',
      size: 10,
      sourceRevision: 'file:file-1',
    }, NOW);
    return applyCourseEvent(draft, { type: 'mode_selected', mode: 'quick' }, NOW);
  }

  function readyQuestion(questionId: string): StudyQuestion {
    const normalized = normalizeStudyQuestion({
      questionId,
      sessionId: 'session-1',
      questions: [{
        id: 'mission',
        question: '你的目标是什么？',
        options: [{ id: 'a', label: '快速了解' }, { id: 'b', label: '准备考试' }],
      }],
      createdAt: NOW,
    });
    if (normalized.status !== 'ready') throw new Error('test fixture invalid');
    return normalized.question;
  }

  function makeController(runtime: FakeRuntime): StudyProductController {
    return new StudyProductController(runtime, {
      createCourseId: () => 'course-12345678',
      now: () => NOW,
      missingRetryDelays: [],
    });
  }

  it('keeps the newest course when an older open resolves late', async () => {
    const runtime = new FakeRuntime();
    runtime.snapshots.set('course-a', quickSnapshot('course-a'));
    runtime.snapshots.set('course-b', quickSnapshot('course-b'));
    const gateA = deferred<StudyCourseBinding | undefined>();
    const gateB = deferred<StudyCourseBinding | undefined>();
    runtime.resumeImpl = (courseId) => (courseId === 'course-a' ? gateA.promise : gateB.promise);
    const controller = makeController(runtime);

    const slowA = controller.open('course-a');
    const fastB = controller.open('course-b');
    gateB.resolve(binding('course-b'));
    await expect(fastB).resolves.toBe(true);
    gateA.resolve(binding('course-a'));
    await expect(slowA).resolves.toBe(false);

    expect(controller.view.binding?.courseId).toBe('course-b');
    expect(controller.view.snapshot?.courseId).toBe('course-b');
  });

  it('stops a watcher that resolves after its context was superseded', async () => {
    const runtime = new FakeRuntime();
    runtime.snapshots.set('course-a', quickSnapshot('course-a'));
    runtime.snapshots.set('course-b', quickSnapshot('course-b'));
    runtime.resumeImpl = async (courseId) => binding(courseId);
    const gate = deferred<void>();
    runtime.watchDelay = gate.promise;
    const controller = makeController(runtime);

    const openA = controller.open('course-a');
    await vi.waitFor(() => expect(runtime.watchCalls).toEqual(['course-a']));
    const openB = controller.open('course-b');
    gate.resolve();
    await openA;
    await openB;

    expect(runtime.watchCalls).toEqual(['course-a', 'course-b']);
    expect(runtime.watchStops).toHaveLength(2);
    // The superseded course-a watcher is stopped immediately; the live
    // course-b watcher is stored and stays running.
    expect(runtime.watchStops[0]).toHaveBeenCalled();
    expect(runtime.watchStops[1]).not.toHaveBeenCalled();
    expect(controller.view.binding?.courseId).toBe('course-b');
  });

  it('ignores artifact events from a superseded course watcher', async () => {
    const runtime = new FakeRuntime();
    runtime.snapshots.set('course-a', quickSnapshot('course-a'));
    runtime.snapshots.set('course-b', quickSnapshot('course-b'));
    runtime.resumeImpl = async (courseId) => binding(courseId);
    const controller = makeController(runtime);

    await controller.open('course-a');
    await controller.open('course-b');
    const loadsAfterOpen = runtime.loadCalls.length;

    runtime.handlersByCourse.get('course-a')?.onArtifactChanged();
    await Promise.resolve();
    expect(runtime.loadCalls).toHaveLength(loadsAfterOpen);

    runtime.handlersByCourse.get('course-b')?.onArtifactChanged();
    await vi.waitFor(() => expect(runtime.loadCalls).toHaveLength(loadsAfterOpen + 1));
    expect(runtime.loadCalls.at(-1)).toBe('course-b');
  });

  it('keeps a newer question that arrived while an answer was in flight', async () => {
    const runtime = new FakeRuntime();
    const controller = makeController(runtime);
    await controller.upload(new File(['book'], 'Book.pdf'));
    await controller.selectMode('quick');

    runtime.handlers?.onQuestion(readyQuestion('q-1'));
    expect(controller.view.question?.questionId).toBe('q-1');

    const gate = deferred<void>();
    runtime.answerDelay = gate.promise;
    const answered = controller.answerQuestion({
      answers: { mission: { kind: 'skipped' } },
      method: 'click',
    });
    runtime.handlers?.onQuestion(readyQuestion('q-2'));
    gate.resolve();
    await answered;

    expect(controller.view.question?.questionId).toBe('q-2');
    expect(controller.view.stage).toBe('question');
  });

  it('surfaces a visible error and rolls back when generation submit fails', async () => {
    const runtime = new FakeRuntime();
    const controller = makeController(runtime);
    await controller.upload(new File(['book'], 'Book.pdf'));
    await controller.selectMode('quick');

    // Evolve the authoritative artifact into a generation-ready plan.
    let ready = runtime.snapshots.get('course-12345678');
    if (ready === undefined) throw new Error('course fixture missing');
    ready = applyCourseEvent(ready, {
      type: 'source_updated',
      source: {
        ...ready.source,
        status: 'ready',
        evidenceLevel: 'survey',
        quickSurveyRevision: 'survey-1',
      },
      approval: {
        actor: 'auto_policy',
        policyRevision: 'auto-v1',
        approvedRevision: 'survey-1',
        approvedAt: NOW,
      },
    }, NOW);
    ready = applyCourseEvent(ready, {
      type: 'mission_updated',
      mission: { status: 'ready', revision: 1, questionsAsked: 1, summary: 'Pass the exam.' },
    }, NOW);
    ready = applyCourseEvent(ready, {
      type: 'plan_updated',
      plan: {
        status: 'ready',
        revision: 'plan-1',
        basedOnSourceRevision: ready.source.revision,
        basedOnMissionRevision: ready.mission.revision,
        chapterCount: 4,
        pageCount: 12,
        quizCount: 2,
      },
    }, NOW);
    runtime.snapshots.set('course-12345678', ready);
    await controller.refresh('course-12345678');
    expect(controller.view.snapshot?.canGenerate).toBe(true);

    runtime.generateError = new Error('generation endpoint down');
    await expect(controller.generate()).rejects.toThrow('generation endpoint down');

    expect(controller.view.stage).toBe('error');
    expect(controller.view.issues[0]?.code).toBe('generation_submit_failed');
    expect(controller.view.snapshot?.generation.status).not.toBe('generating');
  });

  it('refreshes the authoritative snapshot after upgrade without a watcher event', async () => {
    const runtime = new FakeRuntime();
    const controller = makeController(runtime);
    await controller.upload(new File(['book'], 'Book.pdf'));
    await controller.selectMode('quick');

    const current = controller.view.snapshot;
    if (current === null) throw new Error('snapshot missing');
    const requested = applyCourseEvent(current, { type: 'upgrade_requested' }, NOW);
    const evolved = applyCourseEvent(requested, {
      type: 'mission_updated',
      mission: { status: 'ready', revision: 1, questionsAsked: 2, summary: 'Go deep.' },
    }, NOW);
    // The teaching engine moves the artifact forward right after the restart.
    runtime.postStartSnapshots.set('course-12345678', evolved);
    const loadsBefore = runtime.loadCalls.length;

    await controller.upgradeToDeep();

    expect(runtime.loadCalls.length).toBeGreaterThan(loadsBefore);
    expect(controller.view.snapshot?.mission.summary).toBe('Go deep.');
    expect(controller.view.stage).toBe('working');
  });

  it('shows a recoverable error when the snapshot stays missing after start', async () => {
    const runtime = new FakeRuntime();
    runtime.resumeImpl = async (courseId) => binding(courseId);
    const controller = makeController(runtime);

    await expect(controller.open('course-lost')).resolves.toBe(true);
    expect(controller.view.stage).toBe('error');
    expect(controller.view.issues[0]?.code).toBe('artifact_not_found');
  });
});
