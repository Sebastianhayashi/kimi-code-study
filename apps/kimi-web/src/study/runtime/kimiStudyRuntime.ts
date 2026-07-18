import type {
  AppEvent,
  AppMessage,
  AppQuestionRequest,
  AppSession,
  AppSkill,
  FsEntry,
  KimiEventConnection,
  KimiWebApi,
  QuestionResponse,
} from '../../api/types';
import { isDaemonApiError } from '../../api/errors';
import { parseCatalogIndex } from '../domain/catalogPackage';
import type { CertifiedCatalogMaterial } from '../domain/catalogPackage';
import { parseStudyArtifact } from '../domain/courseArtifact';
import type {
  ContractIssue,
  CourseSnapshot,
  UploadedMaterial,
} from '../domain/courseContract';
import {
  buildSkillActivationArgs,
} from '../domain/studyPolicy';
import { isLessonArtifactPath } from '../domain/lessonRevision';
import type { StudyCourseBinding, StudyOperationMarker } from './courseRegistry';
import { StudyCourseRegistry } from './courseRegistry';
import type {
  StartCourseInput,
  StudyRuntimePort,
  StudyRuntimeReadiness,
  StudyRuntimeSnapshotLoad,
  StudyRuntimeWatchHandlers,
  StudyTextLoad,
  TutorLessonContext,
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

/** Course artifacts are always workspace-relative paths like lessons/0001-x.html. */
function assertArtifactPath(path: string): void {
  if (path.startsWith('/') || path.includes('..') || path.includes('\\')
    || !/^[a-zA-Z0-9][a-zA-Z0-9/_\-. ]*$/.test(path)) {
    throw new Error('Invalid Kimi Study artifact path.');
  }
}

function assertLessonOperation(lessonPath: string, baseRevision: string, operationId: string): void {
  if (!isLessonArtifactPath(lessonPath)) throw new Error('Invalid Kimi Study lesson path.');
  if (!/^fnv1a32:[0-9a-f]{8}$/.test(baseRevision)) {
    throw new Error('Invalid Kimi Study lesson revision.');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(operationId)) {
    throw new Error('Invalid Kimi Study lesson operation id.');
  }
}

/** Small deterministic digest for idempotent plan-edit operation ids. */
function operationDigest(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
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

/** Bounded migration aliases: newer Skills can resume old pinned courses.
 * Current v4 profiles require the exact v4 marker so quality and revision gates cannot be
 * silently downgraded by an older installation. */
const COMPATIBLE_CONTRACT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'teach-quick-v1': ['teach-quick-v2', 'teach-quick-v3', 'teach-quick-v4'],
  'teach-quick-v2': ['teach-quick-v1', 'teach-quick-v3', 'teach-quick-v4'],
  'teach-quick-v3': ['teach-quick-v4'],
  'teach-ria-v1': ['teach-ria-v2', 'teach-ria-v3', 'teach-ria-v4', 'teach-ria-v5'],
  'teach-ria-v2': ['teach-ria-v1', 'teach-ria-v3', 'teach-ria-v4', 'teach-ria-v5'],
  'teach-ria-v3': ['teach-ria-v4', 'teach-ria-v5'],
  'teach-ria-v4': ['teach-ria-v5'],
};

export function installedSkillMatches(
  installed: AppSkill,
  expected: { readonly name: string; readonly contractRevision: string },
): boolean {
  if (installed.name !== expected.name) return false;
  const expectedMarker = `[contract:${expected.contractRevision}]`;
  if (installed.description.includes(expectedMarker)) return true;
  const aliases = COMPATIBLE_CONTRACT_ALIASES[expected.contractRevision] ?? [];
  return aliases.some((revision) =>
    installed.description.includes(`[contract:${revision}]`));
}

export class KimiStudyRuntime implements StudyRuntimePort {
  private readonly workspaceRoot: string;
  private readonly now: () => string;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  /** undefined = not probed yet; null = no usable default model. */
  private defaultModel: string | null | undefined;

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

  async listCourses(): Promise<StudyCourseBinding[]> {
    return this.registry.listCourses();
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
      let binding = await this.ensureBinding(
        input.snapshot,
        input.uploadedMaterial,
        input.catalogMaterial,
      );
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
        if (sessionId === binding.sessionId) handlers.onArtifactChanged('resync');
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

  async requestPlanChange(courseId: string, planRevision: string, instruction: string): Promise<void> {
    const binding = this.requireBinding(courseId);
    const operation = `${courseId}:plan-edit:${planRevision}:${operationDigest(instruction)}`;
    await this.coalesce(operation, async () => {
      if (binding.operations[operation] !== undefined
        || await this.sessionHasOperation(binding.sessionId, operation)) return;
      const submitted = await this.api.submitPrompt(binding.sessionId, {
        content: [{
          type: 'text',
          text: [
            `Revise the course outline from plan revision ${planRevision}.`,
            'Produce a NEW plan revision pinned to the current source and Mission revisions,',
            'keep source/STUDY-SNAPSHOT.json current, and record approval provenance.',
            `Learner request: ${instruction}`,
          ].join(' '),
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

  async requestLessonChange(
    courseId: string,
    lessonPath: string,
    baseRevision: string,
    instruction: string,
    operationId: string,
  ): Promise<void> {
    const text = instruction.trim();
    if (text.length === 0) throw new Error('Lesson change request is empty.');
    await this.submitLessonOperation(
      courseId,
      lessonPath,
      baseRevision,
      operationId,
      'revise',
      text,
    );
  }

  async requestLessonRegeneration(
    courseId: string,
    lessonPath: string,
    baseRevision: string,
    operationId: string,
  ): Promise<void> {
    await this.submitLessonOperation(
      courseId,
      lessonPath,
      baseRevision,
      operationId,
      'regenerate',
    );
  }

  async readCourseText(courseId: string, path: string, maxBytes = 262144): Promise<StudyTextLoad> {
    assertArtifactPath(path);
    const binding = await this.resumeCourse(courseId);
    if (binding === undefined) return { status: 'missing' };
    try {
      const file = await this.api.readFile(binding.sessionId, { path, offset: 0, length: maxBytes });
      if (file.isBinary || file.encoding !== 'utf-8') return { status: 'unavailable' };
      return { status: 'ready', content: file.content, truncated: file.truncated === true };
    } catch (error) {
      if (isDaemonApiError(error) && error.code === FS_PATH_NOT_FOUND) return { status: 'missing' };
      return { status: 'unavailable' };
    }
  }

  async listCourseFiles(courseId: string, path: string): Promise<readonly FsEntry[] | undefined> {
    assertArtifactPath(path);
    const binding = await this.resumeCourse(courseId);
    if (binding === undefined) return undefined;
    try {
      const listing = await this.api.listDirectory(binding.sessionId, { path, depth: 1 });
      return listing.items.filter((item) => item.kind === 'file');
    } catch (error) {
      if (isDaemonApiError(error) && error.code === FS_PATH_NOT_FOUND) return undefined;
      throw error;
    }
  }

  async sendTutorMessage(courseId: string, text: string, context: TutorLessonContext): Promise<void> {
    const binding = this.requireBinding(courseId);
    const anchor = context.lessonTitle !== undefined
      ? `about the lesson "${context.lessonTitle}"`
      : 'about the current course';
    await this.api.submitPrompt(binding.sessionId, {
      content: [{
        type: 'text',
        text: [
          `As the course tutor, answer the learner ${anchor}, grounded in this course's sources.`,
          'Keep source/STUDY-SNAPSHOT.json untouched unless the learner explicitly asks for a course change.',
          `Learner question: ${text}`,
        ].join(' '),
      }],
      metadata: {
        kimiStudyTutor: '1',
        kimiStudyTutorText: text,
        kimiStudyCourseId: courseId,
        ...(context.lessonPath !== undefined ? { kimiStudyLessonPath: context.lessonPath } : {}),
      },
      permissionMode: 'auto',
      planMode: false,
      swarmMode: false,
    });
  }

  async listTutorMessages(courseId: string): Promise<readonly AppMessage[]> {
    const binding = this.requireBinding(courseId);
    return this.listAllMessages(binding.sessionId);
  }

  async listCatalog(): Promise<readonly CertifiedCatalogMaterial[]> {
    const launcher = await this.ensureLauncherSession();
    const parsed = parseCatalogIndex(await this.api.listStudyCatalogPackages(launcher));
    if (parsed.status !== 'ready') {
      throw new Error('The prepared-material library could not be verified.');
    }
    return parsed.materials;
  }

  async installCatalogPackage(file: File): Promise<readonly CertifiedCatalogMaterial[]> {
    if (!file.name.toLocaleLowerCase().endsWith('.kstudy.zip')) {
      throw new Error('Choose a .kstudy.zip prepared-material package.');
    }
    const launcher = await this.ensureLauncherSession();
    const uploaded = await this.api.uploadFile({ file, name: file.name });
    await this.api.installStudyCatalogPackage({ sessionId: launcher, fileId: uploaded.id });
    return this.listCatalog();
  }

  async loadCatalogCover(material: CertifiedCatalogMaterial): Promise<Blob | undefined> {
    if (material.cover === undefined) return undefined;
    const launcher = await this.ensureLauncherSession();
    return this.api.getStudyCatalogCover(launcher, material.packageRef);
  }

  private async submitLessonOperation(
    courseId: string,
    lessonPath: string,
    baseRevision: string,
    operationId: string,
    kind: 'revise' | 'regenerate',
    instruction?: string,
  ): Promise<void> {
    assertCourseId(courseId);
    assertLessonOperation(lessonPath, baseRevision, operationId);
    const binding = this.requireBinding(courseId);
    const operation = `${courseId}:lesson-${kind}:${operationId}`;
    await this.coalesce(operation, async () => {
      if (binding.operations[operation] !== undefined
        || await this.sessionHasOperation(binding.sessionId, operation)) return;
      const action = kind === 'revise'
        ? `Revise only the published lesson ${lessonPath} from the learner request: ${instruction ?? ''}`
        : `Regenerate only the published lesson ${lessonPath}.`;
      const submitted = await this.api.submitPrompt(binding.sessionId, {
        content: [{
          type: 'text',
          text: [
            action,
            `Its required base content revision is ${baseRevision}.`,
            'Keep the course id, lesson path, lesson title, source anchors, plan, generation counts, and every other lesson unchanged.',
            'Follow the installed Skill lesson-revision workflow: reopen the cited source, validate a candidate, then use the guarded atomic publisher immediately before replacement.',
            'If the base revision is stale or any gate fails, do not replace the current lesson.',
          ].join(' '),
        }],
        metadata: {
          kimiStudyOperationId: operation,
          kimiStudyCourseId: courseId,
          kimiStudyLessonOperation: kind,
          kimiStudyLessonPath: lessonPath,
          kimiStudyLessonBaseRevision: baseRevision,
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
    catalogMaterial?: CertifiedCatalogMaterial,
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
    const recovered = await this.findSession((session) => session.cwd === workspacePath);
    if (recovered !== undefined) {
      await this.ensureSessionModel(recovered.id);
      const binding = this.newBinding(snapshot, workspacePath, recovered.id, uploadedMaterial);
      this.registry.saveCourse(binding);
      return binding;
    }

    const launcher = await this.ensureLauncherSession();
    if (snapshot.source.kind === 'catalog') {
      if (catalogMaterial === undefined || snapshot.profile?.packageRef !== catalogMaterial.packageRef) {
        throw new Error('The selected prepared material no longer matches this course.');
      }
      const created = await this.api.materializeStudyCatalogCourse({
        sessionId: launcher,
        courseId: snapshot.courseId,
        packageRef: catalogMaterial.packageRef,
      });
      if (created.packageRef !== catalogMaterial.packageRef
        || created.sourceRevision !== catalogMaterial.sourceRevision) {
        throw new Error('The prepared material changed while the course was being created.');
      }
    } else {
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
    }
    const session = await this.api.createSession({
      title: snapshot.source.title,
      cwd: workspacePath,
    });
    await this.ensureSessionModel(session.id);
    const binding = this.newBinding(snapshot, workspacePath, session.id, uploadedMaterial);
    this.registry.saveCourse(binding);
    return binding;
  }

  /**
   * Daemon quirk: sessions created without an explicit model keep
   * `agent_config.model = ''`, and a turn submitted to such a session dies
   * silently (no assistant message, no error). Pin the server's configured
   * default model through the profile RPC so course turns actually run.
   * The product never exposes model selection — this uses the server default.
   */
  private async ensureSessionModel(sessionId: string): Promise<void> {
    if (this.defaultModel === undefined) {
      try {
        const auth = await this.api.getAuth();
        if (auth.ready && typeof auth.defaultModel === 'string'
          && auth.defaultModel.length > 0) {
          // Only positive results are cached; a transient failure (logged-out,
          // network error) must not disable model pinning for the runtime's
          // whole lifetime, because an empty model kills turns silently.
          this.defaultModel = auth.defaultModel;
        }
      } catch {
        // Probe failed; leave uncached so the next call retries.
      }
    }
    if (this.defaultModel === undefined || this.defaultModel === null) return;
    await this.api.updateSession(sessionId, { model: this.defaultModel });
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
    const existing = await this.findSession((session) =>
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
      packageRef: snapshot.profile?.packageRef,
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
    const message = await this.findMessage(
      sessionId,
      { role: 'user' },
      (candidate) => isOperationMessage(candidate, expected),
    );
    return message !== undefined;
  }

  /** Page sessions from newest to oldest until a match is found or pages end. */
  private async findSession(
    match: (session: AppSession) => boolean,
  ): Promise<AppSession | undefined> {
    let beforeId: string | undefined;
    for (;;) {
      const page = await this.api.listSessions({
        pageSize: 100,
        beforeId,
        includeArchive: true,
      });
      const hit = page.items.find(match);
      if (hit !== undefined) return hit;
      if (!page.hasMore || page.items.length === 0) return undefined;
      const nextBeforeId = page.items[page.items.length - 1]!.id;
      if (nextBeforeId === beforeId) return undefined;
      beforeId = nextBeforeId;
    }
  }

  /** Drain every message page. Consumers that need chronology sort by createdAt. */
  private async listAllMessages(
    sessionId: string,
    input: { readonly role?: AppMessage['role'] } = {},
  ): Promise<AppMessage[]> {
    const messages: AppMessage[] = [];
    let beforeId: string | undefined;
    for (;;) {
      const page = await this.api.listMessages(sessionId, {
        ...input,
        pageSize: 100,
        beforeId,
      });
      messages.push(...page.items);
      if (!page.hasMore || page.items.length === 0) return messages;
      const nextBeforeId = page.items[page.items.length - 1]!.id;
      if (nextBeforeId === beforeId) return messages;
      beforeId = nextBeforeId;
    }
  }

  /** Page messages until a match is found; avoids draining old history unnecessarily. */
  private async findMessage(
    sessionId: string,
    input: { readonly role?: AppMessage['role'] },
    match: (message: AppMessage) => boolean,
  ): Promise<AppMessage | undefined> {
    let beforeId: string | undefined;
    for (;;) {
      const page = await this.api.listMessages(sessionId, {
        ...input,
        pageSize: 100,
        beforeId,
      });
      const hit = page.items.find(match);
      if (hit !== undefined) return hit;
      if (!page.hasMore || page.items.length === 0) return undefined;
      const nextBeforeId = page.items[page.items.length - 1]!.id;
      if (nextBeforeId === beforeId) return undefined;
      beforeId = nextBeforeId;
    }
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
      handlers.onArtifactChanged('session_idle');
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
