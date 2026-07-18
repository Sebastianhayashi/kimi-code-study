import type { UploadedMaterial } from '../domain/courseContract';

const REGISTRY_SCHEMA_VERSION = 1 as const;
const DEFAULT_STORAGE_KEY = 'kimi-study.course-bindings.v1';

export interface StudyOperationMarker {
  readonly operationId: string;
  readonly promptId: string;
  readonly startedAt: string;
}

/** Browser-local orchestration pointers. Learning truth never lives here. */
export interface StudyCourseBinding {
  readonly schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  readonly courseId: string;
  readonly workspacePath: string;
  readonly sessionId: string;
  readonly title: string;
  readonly sourceKind: 'upload' | 'catalog';
  readonly packageRef?: string;
  readonly uploadedMaterial?: UploadedMaterial;
  readonly operations: Readonly<Record<string, StudyOperationMarker>>;
  readonly updatedAt: string;
}

interface StudyRegistryDocument {
  readonly schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  readonly launcherSessionId?: string;
  readonly courses: Readonly<Record<string, StudyCourseBinding>>;
}

export interface StudyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emptyDocument(): StudyRegistryDocument {
  return { schemaVersion: REGISTRY_SCHEMA_VERSION, courses: {} };
}

function parseBinding(value: unknown): StudyCourseBinding | undefined {
  if (!isRecord(value) || value.schemaVersion !== REGISTRY_SCHEMA_VERSION) return undefined;
  for (const field of ['courseId', 'workspacePath', 'sessionId', 'title', 'sourceKind', 'updatedAt']) {
    if (typeof value[field] !== 'string') return undefined;
  }
  if (value.sourceKind !== 'upload' && value.sourceKind !== 'catalog') return undefined;
  if (!isRecord(value.operations)) return undefined;
  const operations: Record<string, StudyOperationMarker> = {};
  for (const [key, marker] of Object.entries(value.operations)) {
    if (!isRecord(marker) || typeof marker.operationId !== 'string'
      || typeof marker.promptId !== 'string' || typeof marker.startedAt !== 'string') return undefined;
    operations[key] = {
      operationId: marker.operationId,
      promptId: marker.promptId,
      startedAt: marker.startedAt,
    };
  }

  let uploadedMaterial: UploadedMaterial | undefined;
  if (value.uploadedMaterial !== undefined) {
    const material = value.uploadedMaterial;
    if (!isRecord(material) || typeof material.fileId !== 'string' || typeof material.name !== 'string'
      || typeof material.mediaType !== 'string' || typeof material.size !== 'number'
      || typeof material.sourceRevision !== 'string') return undefined;
    uploadedMaterial = {
      fileId: material.fileId,
      name: material.name,
      mediaType: material.mediaType,
      size: material.size,
      sourceRevision: material.sourceRevision,
    };
  }

  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    courseId: value.courseId as string,
    workspacePath: value.workspacePath as string,
    sessionId: value.sessionId as string,
    title: value.title as string,
    sourceKind: value.sourceKind,
    packageRef: typeof value.packageRef === 'string' ? value.packageRef : undefined,
    uploadedMaterial,
    operations,
    updatedAt: value.updatedAt as string,
  };
}

function parseDocument(raw: string | null): StudyRegistryDocument {
  if (raw === null) return emptyDocument();
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return emptyDocument();
  }
  if (!isRecord(value) || value.schemaVersion !== REGISTRY_SCHEMA_VERSION
    || !isRecord(value.courses)) return emptyDocument();
  const courses: Record<string, StudyCourseBinding> = {};
  for (const [courseId, candidate] of Object.entries(value.courses)) {
    const binding = parseBinding(candidate);
    if (binding !== undefined && binding.courseId === courseId) courses[courseId] = binding;
  }
  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    launcherSessionId: typeof value.launcherSessionId === 'string'
      ? value.launcherSessionId
      : undefined,
    courses,
  };
}

export class StudyCourseRegistry {
  constructor(
    private readonly storage: StudyStorage,
    private readonly storageKey = DEFAULT_STORAGE_KEY,
  ) {}

  private loadDocument(): StudyRegistryDocument {
    try {
      return parseDocument(this.storage.getItem(this.storageKey));
    } catch {
      return emptyDocument();
    }
  }

  private saveDocument(document: StudyRegistryDocument): void {
    this.storage.setItem(this.storageKey, JSON.stringify(document));
  }

  getCourse(courseId: string): StudyCourseBinding | undefined {
    return this.loadDocument().courses[courseId];
  }

  listCourses(): StudyCourseBinding[] {
    return Object.values(this.loadDocument().courses)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  saveCourse(binding: StudyCourseBinding): void {
    const current = this.loadDocument();
    this.saveDocument({
      ...current,
      courses: { ...current.courses, [binding.courseId]: binding },
    });
  }

  getLauncherSessionId(): string | undefined {
    return this.loadDocument().launcherSessionId;
  }

  saveLauncherSessionId(sessionId: string): void {
    const current = this.loadDocument();
    this.saveDocument({ ...current, launcherSessionId: sessionId });
  }
}
