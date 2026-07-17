import type { QuestionResponse } from '../../api/types';
import type {
  ContractIssue,
  CourseSnapshot,
  UploadedMaterial,
} from '../domain/courseContract';
import type { CertifiedCatalogMaterial } from '../domain/catalogPackage';
import {
  applyCourseEvent,
  createCatalogCourse,
  createUploadCourse,
} from '../domain/courseState';
import type { StudyCourseBinding } from '../runtime/courseRegistry';
import type {
  StudyQuestion,
  StudyRuntimePort,
  StudyRuntimeReadiness,
} from '../runtime/studyRuntime';

export type StudyProductStage =
  | 'idle'
  | 'uploading'
  | 'mode_selection'
  | 'starting'
  | 'working'
  | 'question'
  | 'ready'
  | 'error';

export interface StudyProductView {
  readonly stage: StudyProductStage;
  readonly snapshot: CourseSnapshot | null;
  readonly binding: StudyCourseBinding | null;
  readonly question: StudyQuestion | null;
  readonly readiness: StudyRuntimeReadiness | null;
  readonly connected: boolean;
  readonly issues: readonly ContractIssue[];
}

type Listener = (view: StudyProductView) => void;

export interface StudyProductControllerOptions {
  readonly createCourseId?: () => string;
  readonly now?: () => string;
}

function defaultCourseId(): string {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `course-${id}`.toLowerCase();
}

function toIssue(code: string, message: string): ContractIssue {
  return { code, path: '', message, severity: 'error' };
}

export class StudyProductController {
  private viewState: StudyProductView = {
    stage: 'idle',
    snapshot: null,
    binding: null,
    question: null,
    readiness: null,
    connected: false,
    issues: [],
  };
  private readonly listeners = new Set<Listener>();
  private readonly createCourseId: () => string;
  private readonly now: () => string;
  private uploadedMaterial: UploadedMaterial | undefined;
  private stopWatching: (() => void) | undefined;

  constructor(
    private readonly runtime: StudyRuntimePort,
    options: StudyProductControllerOptions = {},
  ) {
    this.createCourseId = options.createCourseId ?? defaultCourseId;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  get view(): StudyProductView {
    return this.viewState;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.viewState);
    return () => this.listeners.delete(listener);
  }

  async checkReadiness(): Promise<StudyRuntimeReadiness> {
    const readiness = await this.runtime.checkReadiness();
    this.update({ readiness });
    return readiness;
  }

  async upload(file: File): Promise<CourseSnapshot> {
    this.update({ stage: 'uploading', issues: [] });
    try {
      this.uploadedMaterial = await this.runtime.uploadMaterial(file);
      const snapshot = createUploadCourse(
        this.createCourseId(),
        this.uploadedMaterial,
        this.now(),
      );
      this.update({ stage: 'mode_selection', snapshot, binding: null, question: null });
      return snapshot;
    } catch (error) {
      this.fail('upload_failed', error);
      throw error;
    }
  }

  async selectMode(mode: 'quick' | 'deep'): Promise<void> {
    const current = this.requireSnapshot();
    if (this.uploadedMaterial === undefined) throw new Error('Uploaded material is unavailable.');
    const snapshot = applyCourseEvent(current, { type: 'mode_selected', mode }, this.now());
    this.update({ stage: 'starting', snapshot, issues: [] });
    try {
      const binding = await this.runtime.startCourse({
        snapshot,
        uploadedMaterial: this.uploadedMaterial,
      });
      this.update({ binding, stage: 'working' });
      await this.attachWatcher(snapshot.courseId);
      await this.refresh();
    } catch (error) {
      this.fail('course_start_failed', error);
      throw error;
    }
  }

  async startCatalog(material: CertifiedCatalogMaterial): Promise<void> {
    this.uploadedMaterial = undefined;
    const snapshot = createCatalogCourse(this.createCourseId(), material, this.now());
    this.update({ stage: 'starting', snapshot, question: null, issues: [] });
    try {
      const binding = await this.runtime.startCourse({ snapshot, catalogMaterial: material });
      this.update({ binding, stage: 'working' });
      await this.attachWatcher(snapshot.courseId);
      await this.refresh();
    } catch (error) {
      this.fail('catalog_start_failed', error);
      throw error;
    }
  }

  async open(courseId: string): Promise<boolean> {
    const binding = await this.runtime.resumeCourse(courseId);
    if (binding === undefined) return false;
    this.uploadedMaterial = binding.uploadedMaterial;
    this.update({ binding, stage: 'working', issues: [] });
    await this.attachWatcher(courseId);
    await this.refresh(courseId);
    return true;
  }

  async refresh(courseId = this.requireSnapshot().courseId): Promise<void> {
    const loaded = await this.runtime.loadSnapshot(courseId);
    if (loaded.status === 'ready') {
      this.update({
        snapshot: loaded.snapshot,
        stage: this.viewState.question === null
          ? (loaded.snapshot.generation.status === 'ready'
              || loaded.snapshot.generation.status === 'partially_ready' ? 'ready' : 'working')
          : 'question',
        issues: [],
      });
      return;
    }
    if (loaded.status === 'missing') return;
    this.update({ stage: 'error', issues: loaded.issues });
  }

  async answerQuestion(response: QuestionResponse): Promise<void> {
    const snapshot = this.requireSnapshot();
    const question = this.viewState.question;
    if (question === null) throw new Error('No Study question is pending.');
    await this.runtime.answerQuestion(snapshot.courseId, question.questionId, response);
    this.update({ question: null, stage: 'working' });
  }

  async skipQuestion(): Promise<void> {
    const question = this.viewState.question;
    if (question === null) throw new Error('No Study question is pending.');
    const item = question.questions[0];
    await this.answerQuestion({ answers: { [item.id]: { kind: 'skipped' } }, method: 'click' });
  }

  async dismissQuestion(): Promise<void> {
    const snapshot = this.requireSnapshot();
    const question = this.viewState.question;
    if (question === null) return;
    await this.runtime.dismissQuestion(snapshot.courseId, question.questionId);
    this.update({ question: null, stage: 'working' });
  }

  async generate(): Promise<void> {
    const snapshot = this.requireSnapshot();
    if (!snapshot.canGenerate || snapshot.plan.revision === undefined) {
      throw new Error('The current evidence and plan revisions are not ready for generation.');
    }
    const next = applyCourseEvent(snapshot, {
      type: 'generation_updated',
      generation: {
        status: 'generating',
        planRevision: snapshot.plan.revision,
        publishedLessons: snapshot.generation.publishedLessons,
        totalLessons: snapshot.generation.totalLessons,
      },
    }, this.now());
    this.update({ snapshot: next, stage: 'working' });
    await this.runtime.requestGeneration(snapshot.courseId, snapshot.plan.revision);
  }

  async upgradeToDeep(): Promise<void> {
    const current = this.requireSnapshot();
    const snapshot = applyCourseEvent(current, { type: 'upgrade_requested' }, this.now());
    this.update({ snapshot, stage: 'starting', issues: [] });
    try {
      const binding = await this.runtime.startCourse({
        snapshot,
        uploadedMaterial: this.uploadedMaterial ?? this.viewState.binding?.uploadedMaterial,
      });
      this.update({ binding, stage: 'working' });
      await this.attachWatcher(snapshot.courseId);
    } catch (error) {
      this.fail('upgrade_failed', error);
      throw error;
    }
  }

  dispose(): void {
    this.stopWatching?.();
    this.stopWatching = undefined;
    this.listeners.clear();
  }

  private async attachWatcher(courseId: string): Promise<void> {
    this.stopWatching?.();
    this.stopWatching = await this.runtime.watchCourse(courseId, {
      onQuestion: (question) => this.update({ question, stage: 'question' }),
      onQuestionClosed: (questionId) => {
        if (this.viewState.question?.questionId === questionId) {
          this.update({ question: null, stage: 'working' });
        }
      },
      onArtifactChanged: () => { void this.refresh(courseId); },
      onConnectionChange: (connected) => this.update({ connected }),
      onPolicyViolation: (message) => this.update({
        stage: 'error',
        issues: [toIssue('runtime_policy_violation', message)],
      }),
    });
  }

  private requireSnapshot(): CourseSnapshot {
    const snapshot = this.viewState.snapshot;
    if (snapshot === null) throw new Error('No Kimi Study course is active.');
    return snapshot;
  }

  private fail(code: string, error: unknown): void {
    this.update({
      stage: 'error',
      issues: [toIssue(code, error instanceof Error ? error.message : 'Unknown Kimi Study error.')],
    });
  }

  private update(patch: Partial<StudyProductView>): void {
    this.viewState = { ...this.viewState, ...patch };
    for (const listener of this.listeners) listener(this.viewState);
  }
}
