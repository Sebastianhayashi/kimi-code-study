import type { FsEntry, QuestionResponse } from '../../api/types';
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
import { buildTutorThread, type TutorExchange } from '../domain/tutorThread';
import type { StudyCourseBinding } from '../runtime/courseRegistry';
import type {
  StudyQuestion,
  StudyRuntimePort,
  StudyRuntimeReadiness,
  StudyTextLoad,
  TutorLessonContext,
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
  /**
   * Backoff delays (ms) between snapshot reloads while a course artifact is
   * still pending. The number of entries bounds the retries; tests pass [].
   */
  readonly missingRetryDelays?: readonly number[];
}

const DEFAULT_MISSING_RETRY_DELAYS: readonly number[] = [300, 700];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
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
  private readonly missingRetryDelays: readonly number[];
  private uploadedMaterial: UploadedMaterial | undefined;
  private stopWatching: (() => void) | undefined;
  /**
   * Async context generation. Every course-switching entry point bumps it;
   * results arriving from an older context are dropped instead of committed.
   */
  private contextEpoch = 0;

  constructor(
    private readonly runtime: StudyRuntimePort,
    options: StudyProductControllerOptions = {},
  ) {
    this.createCourseId = options.createCourseId ?? defaultCourseId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.missingRetryDelays = options.missingRetryDelays ?? DEFAULT_MISSING_RETRY_DELAYS;
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

  /** Resumable course pointers for the home screen (registry order). */
  async listCourses(): Promise<StudyCourseBinding[]> {
    return this.runtime.listCourses();
  }

  /** Certified prepared-source packages offered on the home screen. */
  async listCatalog(): Promise<readonly CertifiedCatalogMaterial[]> {
    return this.runtime.listCatalog();
  }

  /** Leave the active course and return to the home screen. */
  showHome(): void {
    this.nextContext();
    this.stopWatching?.();
    this.stopWatching = undefined;
    this.uploadedMaterial = undefined;
    this.update({
      stage: 'idle',
      snapshot: null,
      binding: null,
      question: null,
      issues: [],
    });
  }

  async upload(file: File): Promise<CourseSnapshot> {
    const epoch = this.nextContext();
    this.update({ stage: 'uploading', issues: [] });
    try {
      const material = await this.runtime.uploadMaterial(file);
      if (!this.isCurrent(epoch)) throw new Error('Study upload was superseded.');
      this.uploadedMaterial = material;
      const snapshot = createUploadCourse(
        this.createCourseId(),
        this.uploadedMaterial,
        this.now(),
      );
      this.update({ stage: 'mode_selection', snapshot, binding: null, question: null });
      return snapshot;
    } catch (error) {
      if (this.isCurrent(epoch)) this.fail('upload_failed', error);
      throw error;
    }
  }

  async selectMode(mode: 'quick' | 'deep'): Promise<void> {
    const current = this.requireSnapshot();
    if (this.uploadedMaterial === undefined) throw new Error('Uploaded material is unavailable.');
    const epoch = this.contextEpoch;
    const snapshot = applyCourseEvent(current, { type: 'mode_selected', mode }, this.now());
    this.update({ stage: 'starting', snapshot, binding: null, issues: [] });
    try {
      const binding = await this.runtime.startCourse({
        snapshot,
        uploadedMaterial: this.uploadedMaterial,
      });
      if (!this.isCurrent(epoch, snapshot.courseId)) return;
      this.update({ binding, stage: 'working' });
      await this.attachWatcher(snapshot.courseId, epoch);
      await this.refreshUntilSettled(snapshot.courseId, epoch);
    } catch (error) {
      if (this.isCurrent(epoch, snapshot.courseId)) this.fail('course_start_failed', error);
      throw error;
    }
  }

  async startCatalog(material: CertifiedCatalogMaterial): Promise<void> {
    const epoch = this.nextContext();
    this.uploadedMaterial = undefined;
    const snapshot = createCatalogCourse(this.createCourseId(), material, this.now());
    this.update({ stage: 'starting', snapshot, binding: null, question: null, issues: [] });
    try {
      const binding = await this.runtime.startCourse({ snapshot, catalogMaterial: material });
      if (!this.isCurrent(epoch, snapshot.courseId)) return;
      this.update({ binding, stage: 'working' });
      await this.attachWatcher(snapshot.courseId, epoch);
      await this.refreshUntilSettled(snapshot.courseId, epoch);
    } catch (error) {
      if (this.isCurrent(epoch, snapshot.courseId)) this.fail('catalog_start_failed', error);
      throw error;
    }
  }

  async open(courseId: string): Promise<boolean> {
    const epoch = this.nextContext();
    const binding = await this.runtime.resumeCourse(courseId);
    if (binding === undefined) return false;
    if (!this.isCurrent(epoch)) return false;
    this.uploadedMaterial = binding.uploadedMaterial;
    this.update({ binding, stage: 'working', issues: [] });
    await this.attachWatcher(courseId, epoch);
    await this.refreshUntilSettled(courseId, epoch);
    return true;
  }

  async refresh(courseId = this.requireSnapshot().courseId): Promise<void> {
    await this.refreshSnapshot(courseId, this.contextEpoch);
  }

  /**
   * Apply one snapshot load to the view when it still belongs to the live
   * course context. Returns the load status; stale contexts return 'stale'
   * without touching the view.
   */
  private async refreshSnapshot(
    courseId: string,
    epoch: number,
  ): Promise<'ready' | 'missing' | 'invalid' | 'stale'> {
    const loaded = await this.runtime.loadSnapshot(courseId);
    if (!this.isCurrent(epoch, courseId)) return 'stale';
    if (loaded.status === 'ready') {
      this.update({
        snapshot: loaded.snapshot,
        stage: this.viewState.question === null
          ? (loaded.snapshot.generation.status === 'ready'
              || loaded.snapshot.generation.status === 'partially_ready' ? 'ready' : 'working')
          : 'question',
        issues: [],
      });
      return 'ready';
    }
    if (loaded.status === 'missing') return 'missing';
    this.update({ stage: 'error', issues: loaded.issues });
    return 'invalid';
  }

  /**
   * Refresh after a course (re)start. A briefly missing snapshot is expected
   * while the teaching engine writes its first artifacts, so retry a bounded
   * number of times; a snapshot that stays missing after that is a broken or
   * incompatible artifact and becomes a visible, recoverable error.
   */
  private async refreshUntilSettled(courseId: string, epoch: number): Promise<void> {
    let status = await this.refreshSnapshot(courseId, epoch);
    for (const wait of this.missingRetryDelays) {
      if (status !== 'missing') return;
      await delay(wait);
      status = await this.refreshSnapshot(courseId, epoch);
    }
    if (status === 'missing') {
      this.update({
        stage: 'error',
        issues: [toIssue(
          'artifact_not_found',
          'The course snapshot is missing. The course artifacts may be damaged — try reopening the course.',
        )],
      });
    }
  }

  async answerQuestion(response: QuestionResponse): Promise<void> {
    const snapshot = this.requireSnapshot();
    const question = this.viewState.question;
    if (question === null) throw new Error('No Study question is pending.');
    const epoch = this.contextEpoch;
    const submittedId = question.questionId;
    await this.runtime.answerQuestion(snapshot.courseId, submittedId, response);
    // Clear only the question that was actually submitted; a newer question
    // that arrived while the request was in flight must survive.
    if (this.isCurrent(epoch, snapshot.courseId)
      && this.viewState.question?.questionId === submittedId) {
      this.update({ question: null, stage: 'working' });
    }
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
    const epoch = this.contextEpoch;
    const dismissedId = question.questionId;
    await this.runtime.dismissQuestion(snapshot.courseId, dismissedId);
    if (this.isCurrent(epoch, snapshot.courseId)
      && this.viewState.question?.questionId === dismissedId) {
      this.update({ question: null, stage: 'working' });
    }
  }

  async generate(): Promise<void> {
    const snapshot = this.requireSnapshot();
    if (!snapshot.canGenerate || snapshot.plan.revision === undefined) {
      throw new Error('The current evidence and plan revisions are not ready for generation.');
    }
    const epoch = this.contextEpoch;
    const planRevision = snapshot.plan.revision;
    const next = applyCourseEvent(snapshot, {
      type: 'generation_updated',
      generation: {
        status: 'generating',
        planRevision,
        publishedLessons: snapshot.generation.publishedLessons,
        totalLessons: snapshot.generation.totalLessons,
      },
    }, this.now());
    this.update({ snapshot: next, stage: 'working' });
    try {
      await this.runtime.requestGeneration(snapshot.courseId, planRevision);
    } catch (error) {
      if (this.isCurrent(epoch, snapshot.courseId)) {
        // The optimistic 'generating' state must not survive a failed submit:
        // reload the authoritative artifact state, falling back to the
        // pre-submit snapshot when no authoritative state can be loaded.
        const status = await this.refreshSnapshot(snapshot.courseId, epoch)
          .catch(() => 'missing' as const);
        if (status === 'missing' && this.isCurrent(epoch, snapshot.courseId)) {
          this.update({ snapshot });
        }
        this.fail('generation_submit_failed', error);
      }
      throw error;
    }
  }

  async upgradeToDeep(): Promise<void> {
    const current = this.requireSnapshot();
    const epoch = this.nextContext();
    const snapshot = applyCourseEvent(current, { type: 'upgrade_requested' }, this.now());
    this.update({ snapshot, stage: 'starting', issues: [] });
    try {
      const binding = await this.runtime.startCourse({
        snapshot,
        uploadedMaterial: this.uploadedMaterial ?? this.viewState.binding?.uploadedMaterial,
      });
      if (!this.isCurrent(epoch, snapshot.courseId)) return;
      this.update({ binding, stage: 'working' });
      await this.attachWatcher(snapshot.courseId, epoch);
      await this.refreshUntilSettled(snapshot.courseId, epoch);
    } catch (error) {
      if (this.isCurrent(epoch, snapshot.courseId)) this.fail('upgrade_failed', error);
      throw error;
    }
  }

  /** Read one workspace artifact for the active course (plan, lesson, …). */
  async loadCourseText(path: string, maxBytes?: number): Promise<StudyTextLoad> {
    const snapshot = this.requireSnapshot();
    return this.runtime.readCourseText(snapshot.courseId, path, maxBytes);
  }

  /** List files directly inside one workspace directory of the active course. */
  async listCourseFiles(path: string): Promise<readonly FsEntry[] | undefined> {
    const snapshot = this.requireSnapshot();
    return this.runtime.listCourseFiles(snapshot.courseId, path);
  }

  /** Ask the course tutor; the current page context anchors the answer. */
  async sendTutorMessage(text: string, context: TutorLessonContext = {}): Promise<void> {
    const snapshot = this.requireSnapshot();
    const trimmed = text.trim();
    if (trimmed.length === 0) throw new Error('Tutor question is empty.');
    await this.runtime.sendTutorMessage(snapshot.courseId, trimmed, context);
  }

  /** Tutor thread for the active course, oldest exchange first. */
  async listTutorExchanges(): Promise<readonly TutorExchange[]> {
    const snapshot = this.requireSnapshot();
    const messages = await this.runtime.listTutorMessages(snapshot.courseId);
    return buildTutorThread(messages);
  }

  /**
   * Ask the teaching engine for a new outline revision from learner feedback.
   * The request always names the currently visible plan revision; the engine
   * (not the UI) produces the next revision through its quality gates.
   */
  async requestPlanChange(instruction: string): Promise<void> {
    const snapshot = this.requireSnapshot();
    const text = instruction.trim();
    if (snapshot.plan.status !== 'ready' || snapshot.plan.revision === undefined) {
      throw new Error('Only the current ready outline revision can be revised.');
    }
    if (text.length === 0) throw new Error('Outline change request is empty.');
    await this.runtime.requestPlanChange(snapshot.courseId, snapshot.plan.revision, text);
  }

  dispose(): void {
    this.nextContext();
    this.stopWatching?.();
    this.stopWatching = undefined;
    this.listeners.clear();
  }

  private async attachWatcher(courseId: string, epoch: number): Promise<void> {
    this.stopWatching?.();
    this.stopWatching = undefined;
    const stop = await this.runtime.watchCourse(courseId, {
      onQuestion: (question) => {
        if (!this.isCurrent(epoch, courseId)) return;
        this.update({ question, stage: 'question' });
      },
      onQuestionClosed: (questionId) => {
        if (!this.isCurrent(epoch, courseId)) return;
        if (this.viewState.question?.questionId === questionId) {
          this.update({ question: null, stage: 'working' });
        }
      },
      onArtifactChanged: () => {
        if (!this.isCurrent(epoch, courseId)) return;
        void this.refreshSnapshot(courseId, epoch);
      },
      onConnectionChange: (connected) => {
        if (!this.isCurrent(epoch, courseId)) return;
        this.update({ connected });
      },
      onPolicyViolation: (message) => {
        if (!this.isCurrent(epoch, courseId)) return;
        this.update({
          stage: 'error',
          issues: [toIssue('runtime_policy_violation', message)],
        });
      },
    });
    // A watcher that resolves after its context was superseded must not live.
    if (!this.isCurrent(epoch, courseId)) {
      stop();
      return;
    }
    this.stopWatching = stop;
  }

  /** Begin a new async context; results from older contexts get dropped. */
  private nextContext(): number {
    this.contextEpoch += 1;
    return this.contextEpoch;
  }

  /** True when an async result still belongs to the live course context. */
  private isCurrent(epoch: number, courseId?: string): boolean {
    if (epoch !== this.contextEpoch) return false;
    if (courseId === undefined) return true;
    return this.activeCourseId() === courseId;
  }

  private activeCourseId(): string | undefined {
    return this.viewState.binding?.courseId ?? this.viewState.snapshot?.courseId;
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
