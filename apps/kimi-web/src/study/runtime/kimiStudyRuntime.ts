import type {
  AppEvent,
  AppMessage,
  AppQuestionRequest,
  AppSkill,
  KimiEventConnection,
  KimiWebApi,
  QuestionResponse,
} from '../../api/types';
import { isDaemonApiError } from '../../api/errors';
import { parseStudyArtifact } from '../domain/courseArtifact';
import type {
  ContractIssue,
  CourseSnapshot,
  UploadedMaterial,
} from '../domain/courseContract';
import {
  buildSkillActivationArgs,
} from '../domain/studyPolicy';
import type { StudyCourseBinding, StudyOperationMarker } from './courseRegistry';
import { StudyCourseRegistry } from './courseRegistry';
import type {
  StartCourseInput,
  StudyRuntimePort,
  StudyRuntimeReadiness,
  StudyRuntimeSnapshotLoad,
  StudyRuntimeWatchHandlers,
} from './studyRuntime';
import { normalizeStudyQuestion } from './studyRuntime';

const SNAPSHOT_PATH = 'source/STUDY-SNAPSHOT.json';
const LAUNCHER_TITLE = '[Kimi Study] workspace launcher';
const SESSION_NOT_FOUND = 40401;
const FS_PATH_NOT_FOUND = 40409;
const FS_ALREADY_EXISTS = 40919;

export interface KimiStudyRuntimeConfig {
  readonly workspaceRoot: string;
  readonly now?: () => string;
}

function normalizeWorkspaceRoot(root: string): string {
  const normalized = root.replace(/\/+$/, '');
  if (!normalized.startsWith('/') || normalized === '') {
    throw new Error('Kimi Study workspace root must be an absolute directory.');
  }
  if (normalized === '/') throw new Error('Kimi Study workspace root cannot be the filesystem root.');
  return normalized;
}

function assertCourseId(courseId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(courseId)) {
    throw new Error('Invalid Kimi Study course id.');
  }
}

function runtimeIssue(code: string, message: string): ContractIssue {
  return { code, path: '', message, severity: 'error' };
}

function operationId(snapshot: CourseSnapshot, kind: 'start' | 'generate'): string {
  const revision = kind === 'start'
    ? snapshot.profile?.skill.contractRevision ?? 'mode-pending'
    : snapshot.plan.revision ?? 'plan-pending';
  return `${snapshot.courseId}:${kind}:${snapshot.source.revision}:${revision}`;
}

function isOperationMessage(message: AppMessage, expected: string): boolean {
  return message.metadata?.['kimiStudyOperationId'] === expected;
}

export function installedSkillMatches(
  installed: AppSkill,
  expected: { readonly name: string; readonly contractRevision: string },
): boolean {
  return installed.name === expected.name
    && installed.description.includes(`[contract:${expected.contractRevision}]`);
}

export class KimiStudyRuntime implements StudyRuntimePort {
  private readonly workspaceRoot: string;
  private readonly now: () => string;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly api: KimiWebApi,
    private readonly registry: StudyCourseRegistry,
    config: KimiStudyRuntimeConfig,
  ) {
    this.workspaceRoot = normalizeWorkspaceRoot(config.workspaceRoot);
    this.now = config.now ?? (() => new Date().toISOString());
  }

  async checkReadiness(): Promise<StudyRuntimeReadiness> {
    try {
      const [health, meta, auth] = await Promise.all([
        this.api.getHealth(),
        this.api.getMeta(),
        this.api.getAuth(),
      ]);
      return {
        api: health.status === 'ok' ? 'ready' : 'unreachable',
        auth: auth.ready ? 'ready' : 'required',
        backend: meta.backend,
        capabilities: meta.capabilities,
        message: auth.ready ? undefined : 'Kimi provider login is required before course generation.',
      };
    } catch (error) {
      return {
        api: 'unreachable',
        auth: 'required',
        backend: 'unknown',
        capabilities: {},
        message: error instanceof Error ? error.message : 'Kimi server is unavailable.',
      };
    }
  }

  async uploadMaterial(file: File): Promise<UploadedMaterial> {
    const uploaded = await this.api.uploadFile({ file, name: file.name });
    return {
      fileId: uploaded.id,
      name: uploaded.name,
      mediaType: uploaded.mediaType,
      size: uploaded.size,
      sourceRevision: `file:${uploaded.id}`,
    };
  }

  async startCourse(input: StartCourseInput): Promise<StudyCourseBinding> {
    const profile = input.snapshot.profile;
    if (profile === null) throw new Error('Study mode must be selected before starting a course.');
    return this.coalesce(`start:${input.snapshot.courseId}:${profile.skill.contractRevision}`, async () => {
      let binding = await this.ensureBinding(input.snapshot, input.uploadedMaterial);
      const operation = operationId(input.snapshot, 'start');
      if (binding.operations[operation] !== undefined
        || await this.sessionHasOperation(binding.sessionId, operation)) return binding;

      const skills = await this.api.listSkills(binding.sessionId);
      const installed = skills.find((skill) => skill.name === profile.skill.name);
      if (installed === undefined) {
        throw new Error(`Required Kimi Study workflow is not installed: ${profile.skill.name}`);
      }
      if (!installedSkillMatches(installed, profile.skill)) {
        throw new Error(`Installed Kimi Study workflow has the wrong contract revision: ${profile.skill.name}`);
      }
      await this.api.activateSkill(
        binding.sessionId,
        profile.skill.name,
        buildSkillActivationArgs({
          courseId: input.snapshot.courseId,
          profile,
          sourceTitle: input.snapshot.source.title,
        }),
      );

      const text = this.startPrompt(input);
      const content: Parameters<KimiWebApi['submitPrompt']>[1]['content'] = [{ type: 'text', text }];
      if (input.snapshot.source.kind === 'upload') {
        const material = input.uploadedMaterial ?? binding.uploadedMaterial;
        if (material === undefined) throw new Error('Uploaded source metadata is unavailable.');
        content.push({
          type: 'file',
          fileId: material.fileId,
          name: material.name,
          mediaType: material.mediaType,
          size: material.size,
        });
      }
      const submitted = await this.api.submitPrompt(binding.sessionId, {
        content,
        metadata: {
          kimiStudyOperationId: operation,
          kimiStudyCourseId: input.snapshot.courseId,
          kimiStudyContractRevision: profile.skill.contractRevision,
        },
        permissionMode: 'auto',
        planMode: false,
        swarmMode: false,
      });
      const marker: StudyOperationMarker = {
        operationId: operation,
        promptId: submitted.promptId,
        startedAt: this.now(),
      };
      binding = {
        ...binding,
        operations: { ...binding.operations, [operation]: marker },
        updatedAt: this.now(),
      };
      this.registry.saveCourse(binding);
      return binding;
    });
  }

  async resumeCourse(courseId: string): Promise<StudyCourseBinding | undefined> {
    assertCourseId(courseId);
    const binding = this.registry.getCourse(courseId);
    if (binding === undefined) return undefined;
    try {
      const session = await this.api.getSession(binding.sessionId);
      return session.cwd === binding.workspacePath ? binding : undefined;
    } catch (error) {
      if (isDaemonApiError(error) && error.code === SESSION_NOT_FOUND) return undefined;
      throw error;
    }
  }

  async loadSnapshot(courseId: string): Promise<StudyRuntimeSnapshotLoad> {
    const binding = await this.resumeCourse(courseId);
    if (binding === undefined) return { status: 'missing' };
    try {
      const file = await this.api.readFile(binding.sessionId, { path: SNAPSHOT_PATH });
      if (file.isBinary || file.encoding !== 'utf-8' || file.truncated) {
        return {
          status: 'unavailable',
          issues: [runtimeIssue('artifact_unreadable', 'Study artifact is binary or truncated.')],
        };
      }
      const parsed = parseStudyArtifact(file.content);
      if (parsed.status === 'ready' && parsed.snapshot.courseId !== courseId) {
        return {
          status: 'unavailable',
          issues: [runtimeIssue('artifact_course_mismatch', 'Study artifact belongs to a different course.')],
        };
      }
      return parsed;
    } catch (error) {
      if (isDaemonApiError(error) && error.code === FS_PATH_NOT_FOUND) return { status: 'missing' };
      return {
        status: 'unavailable',
        issues: [runtimeIssue('artifact_read_failed', error instanceof Error ? error.message : 'Unable to read Study artifact.')],
      };
    }
  }

  async watchCourse(courseId: string, handlers: StudyRuntimeWatchHandlers): Promise<() => void> {
    const binding = await this.resumeCourse(courseId);
    if (binding === undefined) throw new Error('Kimi Study course session is unavailable.');
    let connection: KimiEventConnection;
    connection = this.api.connectEvents({
      onEvent: (event) => this.handleEvent(event, binding.sessionId, handlers),
      onResync: (sessionId) => {
        if (sessionId === binding.sessionId) handlers.onArtifactChanged();
      },
      onError: (_code, message, fatal) => {
        if (fatal) handlers.onPolicyViolation(message);
      },
      onConnectionChange: handlers.onConnectionChange,
    });
    const snapshot = await this.api.getSessionSnapshot(binding.sessionId);
    for (const pending of snapshot.pendingQuestions) this.deliverQuestion(pending, handlers);
    connection.seedSnapshot(binding.sessionId, snapshot);
    connection.subscribe(binding.sessionId, { seq: snapshot.asOfSeq, epoch: snapshot.epoch });
    return () => connection.close();
  }

  async answerQuestion(
    courseId: string,
    questionId: string,
    response: QuestionResponse,
  ): Promise<void> {
    const binding = this.requireBinding(courseId);
    await this.api.respondQuestion(binding.sessionId, questionId, response);
  }

  async dismissQuestion(courseId: string, questionId: string): Promise<void> {
    const binding = this.requireBinding(courseId);
    await this.api.dismissQuestion(binding.sessionId, questionId);
  }

  async requestGeneration(courseId: string, planRevision: string): Promise<void> {
    const binding = this.requireBinding(courseId);
    const operation = `${courseId}:generate:${planRevision}`;
    await this.coalesce(operation, async () => {
      if (binding.operations[operation] !== undefined
        || await this.sessionHasOperation(binding.sessionId, operation)) return;
      const submitted = await this.api.submitPrompt(binding.sessionId, {
        content: [{
          type: 'text',
          text: `Generate the approved course from plan revision ${planRevision}. Keep source/STUDY-SNAPSHOT.json current and publish lessons incrementally.`,
        }],
        metadata: {
          kimiStudyOperationId: operation,
          kimiStudyCourseId: courseId,
          kimiStudyPlanRevision: planRevision,
        },
        permissionMode: 'auto',
        planMode: false,
        swarmMode: false,
      });
      this.registry.saveCourse({
        ...binding,
        operations: {
          ...binding.operations,
          [operation]: {
            operationId: operation,
            promptId: submitted.promptId,
            startedAt: this.now(),
          },
        },
        updatedAt: this.now(),
      });
    });
  }

  private async ensureBinding(
    snapshot: CourseSnapshot,
    uploadedMaterial?: UploadedMaterial,
  ): Promise<StudyCourseBinding> {
    assertCourseId(snapshot.courseId);
    const existing = await this.resumeCourse(snapshot.courseId);
    if (existing !== undefined) {
      if (uploadedMaterial !== undefined && existing.uploadedMaterial === undefined) {
        const upgraded = { ...existing, uploadedMaterial, updatedAt: this.now() };
        this.registry.saveCourse(upgraded);
        return upgraded;
      }
      return existing;
    }

    const workspacePath = `${this.workspaceRoot}/${snapshot.courseId}`;
    const sessions = await this.api.listSessions({ pageSize: 100, includeArchive: true });
    const recovered = sessions.items.find((session) => session.cwd === workspacePath);
    if (recovered !== undefined) {
      const binding = this.newBinding(snapshot, workspacePath, recovered.id, uploadedMaterial);
      this.registry.saveCourse(binding);
      return binding;
    }

    const launcher = await this.ensureLauncherSession();
    const listing = await this.api.listDirectory(launcher, { path: '.', depth: 1 });
    const directoryExists = listing.items.some((entry) =>
      entry.kind === 'directory' && entry.name === snapshot.courseId);
    if (!directoryExists) {
      try {
        await this.api.makeDirectory(launcher, { path: snapshot.courseId });
      } catch (error) {
        if (!isDaemonApiError(error) || error.code !== FS_ALREADY_EXISTS) throw error;
      }
    }
    const session = await this.api.createSession({
      title: snapshot.source.title,
      cwd: workspacePath,
    });
    const binding = this.newBinding(snapshot, workspacePath, session.id, uploadedMaterial);
    this.registry.saveCourse(binding);
    return binding;
  }

  private async ensureLauncherSession(): Promise<string> {
    const remembered = this.registry.getLauncherSessionId();
    if (remembered !== undefined) {
      try {
        const session = await this.api.getSession(remembered);
        if (session.cwd === this.workspaceRoot) return session.id;
      } catch (error) {
        if (!isDaemonApiError(error) || error.code !== SESSION_NOT_FOUND) throw error;
      }
    }
    const sessions = await this.api.listSessions({ pageSize: 100, includeArchive: true });
    const existing = sessions.items.find((session) =>
      session.cwd === this.workspaceRoot && session.title === LAUNCHER_TITLE);
    if (existing !== undefined) {
      this.registry.saveLauncherSessionId(existing.id);
      return existing.id;
    }
    const created = await this.api.createSession({ title: LAUNCHER_TITLE, cwd: this.workspaceRoot });
    this.registry.saveLauncherSessionId(created.id);
    return created.id;
  }

  private newBinding(
    snapshot: CourseSnapshot,
    workspacePath: string,
    sessionId: string,
    uploadedMaterial?: UploadedMaterial,
  ): StudyCourseBinding {
    return {
      schemaVersion: 1,
      courseId: snapshot.courseId,
      workspacePath,
      sessionId,
      title: snapshot.source.title,
      sourceKind: snapshot.source.kind,
      uploadedMaterial,
      operations: {},
      updatedAt: this.now(),
    };
  }

  private requireBinding(courseId: string): StudyCourseBinding {
    assertCourseId(courseId);
    const binding = this.registry.getCourse(courseId);
    if (binding === undefined) throw new Error('Kimi Study course binding is unavailable.');
    return binding;
  }

  private async sessionHasOperation(sessionId: string, expected: string): Promise<boolean> {
    const page = await this.api.listMessages(sessionId, { role: 'user', pageSize: 100 });
    return page.items.some((message) => isOperationMessage(message, expected));
  }

  private startPrompt(input: StartCourseInput): string {
    const profile = input.snapshot.profile!;
    if (profile.mode === 'deep_preprocessed') {
      return `Start Kimi Study from certified package ${input.catalogMaterial?.packageRef ?? profile.packageRef ?? ''}. Interview the learner for Mission while mounting the package; do not repeat source reading.`;
    }
    if (profile.mode === 'quick') {
      return 'Start the material-first quick survey. Cover the entire source at survey depth, ask at most one Mission question, then create the fastest honest learning route.';
    }
    return 'Start full source reading and RIA distillation. Run the 2-4 question Mission interview concurrently, then join both revisions before course design.';
  }

  private handleEvent(
    event: AppEvent,
    sessionId: string,
    handlers: StudyRuntimeWatchHandlers,
  ): void {
    if ('sessionId' in event && event.sessionId !== sessionId) return;
    if (event.type === 'questionRequested') this.deliverQuestion(event.question, handlers);
    if (event.type === 'questionAnswered' || event.type === 'questionDismissed') {
      handlers.onQuestionClosed(event.questionId);
    }
    if (event.type === 'sessionStatusChanged' && event.status === 'idle') {
      handlers.onArtifactChanged();
    }
    if (event.type === 'approvalRequested') {
      handlers.onPolicyViolation('A developer approval escaped automatic Study policy.');
    }
  }

  private deliverQuestion(
    request: AppQuestionRequest,
    handlers: StudyRuntimeWatchHandlers,
  ): void {
    const normalized = normalizeStudyQuestion(request);
    if (normalized.status === 'invalid') handlers.onPolicyViolation(normalized.message);
    else handlers.onQuestion(normalized.question);
  }

  private coalesce<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing !== undefined) return existing;
    const running = task().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, running);
    return running;
  }
}
