import type {
  ApprovalProvenance,
  ContractIssue,
  CourseSourceState,
  GenerationState,
  MissionState,
  PlanState,
  StudyArtifactDocument,
  StudyArtifactLoad,
  StudyProfile,
} from './courseContract';
import {
  STUDY_ARTIFACT_SCHEMA_VERSION,
  STUDY_PRODUCT_CONTRACT_REVISION,
} from './courseContract';
import { toCourseSnapshot } from './courseState';

const MAX_ARTIFACT_BYTES = 256 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(path: string, message: string): StudyArtifactLoad {
  return {
    status: 'malformed',
    issues: [{ code: 'artifact_malformed', path, message, severity: 'error' }],
  };
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function parseProfile(value: unknown): StudyProfile | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isRecord(value.skill)) return undefined;
  if (value.mode !== 'quick' && value.mode !== 'deep' && value.mode !== 'deep_preprocessed') return undefined;
  if (value.skill.name !== 'teach-quick' && value.skill.name !== 'teach-ria') return undefined;
  if (!isString(value.skill.contractRevision) || !isString(value.sourceRevision)) return undefined;
  if (value.selectedBy !== 'user' && value.selectedBy !== 'catalog') return undefined;
  if (!isOptionalString(value.packageRef)) return undefined;
  return {
    mode: value.mode,
    skill: { name: value.skill.name, contractRevision: value.skill.contractRevision },
    sourceRevision: value.sourceRevision,
    selectedBy: value.selectedBy,
    packageRef: value.packageRef,
  };
}

function parseSource(value: unknown): CourseSourceState | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind !== 'upload' && value.kind !== 'catalog') return undefined;
  if (!isString(value.sourceId) || !isString(value.title) || !isString(value.revision)) return undefined;
  if (!['selected', 'surveying', 'deep_reading', 'ready', 'blocked'].includes(String(value.status))) return undefined;
  if (!['none', 'survey', 'certification_pending', 'certified'].includes(String(value.evidenceLevel))) return undefined;
  if (!isOptionalString(value.packageRef) || !isOptionalString(value.quickSurveyRevision) || !isOptionalString(value.blocker)) return undefined;

  let reading: CourseSourceState['reading'];
  if (value.reading !== undefined) {
    if (!isRecord(value.reading) || typeof value.reading.coveragePercent !== 'number'
      || !Array.isArray(value.reading.blockedRanges)
      || !value.reading.blockedRanges.every(isString)
      || !isOptionalString(value.reading.certificateRevision)) return undefined;
    reading = {
      coveragePercent: value.reading.coveragePercent,
      blockedRanges: value.reading.blockedRanges,
      certificateRevision: value.reading.certificateRevision,
    };
  }

  let ria: CourseSourceState['ria'];
  if (value.ria !== undefined) {
    if (!isRecord(value.ria) || !['pending', 'ready', 'blocked'].includes(String(value.ria.status))
      || !isOptionalString(value.ria.revision)) return undefined;
    ria = { status: value.ria.status as 'pending' | 'ready' | 'blocked', revision: value.ria.revision };
  }

  return {
    kind: value.kind,
    sourceId: value.sourceId,
    title: value.title,
    revision: value.revision,
    status: value.status as CourseSourceState['status'],
    evidenceLevel: value.evidenceLevel as CourseSourceState['evidenceLevel'],
    packageRef: value.packageRef,
    quickSurveyRevision: value.quickSurveyRevision,
    reading,
    ria,
    blocker: value.blocker,
  };
}

function parseMission(value: unknown): MissionState | undefined {
  if (!isRecord(value) || !['not_started', 'interviewing', 'ready', 'blocked'].includes(String(value.status))) return undefined;
  if (!isNonNegativeInteger(value.revision) || !isNonNegativeInteger(value.questionsAsked)) return undefined;
  if (!isOptionalString(value.summary) || !isOptionalString(value.blocker)) return undefined;
  return {
    status: value.status as MissionState['status'],
    revision: value.revision,
    questionsAsked: value.questionsAsked,
    summary: value.summary,
    blocker: value.blocker,
  };
}

function parsePlan(value: unknown): PlanState | undefined {
  if (!isRecord(value) || !['not_started', 'designing', 'ready', 'blocked'].includes(String(value.status))) return undefined;
  if (!isOptionalString(value.revision) || !isOptionalString(value.basedOnSourceRevision)
    || !isOptionalString(value.blocker)) return undefined;
  if (value.basedOnMissionRevision !== undefined && !isNonNegativeInteger(value.basedOnMissionRevision)) return undefined;
  const chapterCount = value.chapterCount;
  const pageCount = value.pageCount;
  const quizCount = value.quizCount;
  if (chapterCount !== undefined && !isNonNegativeInteger(chapterCount)) return undefined;
  if (pageCount !== undefined && !isNonNegativeInteger(pageCount)) return undefined;
  if (quizCount !== undefined && !isNonNegativeInteger(quizCount)) return undefined;
  return {
    status: value.status as PlanState['status'],
    revision: value.revision,
    basedOnSourceRevision: value.basedOnSourceRevision,
    basedOnMissionRevision: value.basedOnMissionRevision,
    chapterCount,
    pageCount,
    quizCount,
    blocker: value.blocker,
  };
}

function parseGeneration(value: unknown): GenerationState | undefined {
  if (!isRecord(value) || !['not_started', 'generating', 'partially_ready', 'ready', 'blocked'].includes(String(value.status))) return undefined;
  if (!isOptionalString(value.planRevision) || !isOptionalString(value.blocker)) return undefined;
  if (!isNonNegativeInteger(value.publishedLessons)) return undefined;
  if (value.totalLessons !== undefined && !isNonNegativeInteger(value.totalLessons)) return undefined;
  return {
    status: value.status as GenerationState['status'],
    planRevision: value.planRevision,
    publishedLessons: value.publishedLessons,
    totalLessons: value.totalLessons,
    blocker: value.blocker,
  };
}

function parseApprovals(value: unknown): readonly ApprovalProvenance[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: ApprovalProvenance[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !['user', 'auto_policy', 'system'].includes(String(candidate.actor))) return undefined;
    if (!isString(candidate.policyRevision) || !isString(candidate.approvedRevision)
      || !isString(candidate.approvedAt) || !isOptionalString(candidate.reason)) return undefined;
    result.push({
      actor: candidate.actor as ApprovalProvenance['actor'],
      policyRevision: candidate.policyRevision,
      approvedRevision: candidate.approvedRevision,
      approvedAt: candidate.approvedAt,
      reason: candidate.reason,
    });
  }
  return result;
}

export function parseStudyArtifact(content: string): StudyArtifactLoad {
  if (new TextEncoder().encode(content).byteLength > MAX_ARTIFACT_BYTES) {
    return {
      status: 'unsafe',
      issues: [{ code: 'artifact_too_large', path: '', message: 'Study artifact exceeds the safe size limit.', severity: 'error' }],
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content) as unknown;
  } catch {
    return malformed('', 'Study artifact is not valid JSON.');
  }
  if (!isRecord(raw)) return malformed('', 'Study artifact must be an object.');
  if (raw.schemaVersion !== STUDY_ARTIFACT_SCHEMA_VERSION) {
    return {
      status: 'unsupported',
      issues: [{ code: 'schema_version_unsupported', path: 'schemaVersion', message: 'Study artifact schema is unsupported.', severity: 'error' }],
    };
  }
  if (raw.contractRevision !== STUDY_PRODUCT_CONTRACT_REVISION) {
    return {
      status: 'unsupported',
      issues: [{ code: 'contract_revision_unsupported', path: 'contractRevision', message: 'Study product contract is unsupported.', severity: 'error' }],
    };
  }

  const profile = parseProfile(raw.profile);
  const source = parseSource(raw.source);
  const mission = parseMission(raw.mission);
  const plan = parsePlan(raw.plan);
  const generation = parseGeneration(raw.generation);
  const approvals = parseApprovals(raw.approvals);
  if (!isString(raw.courseId) || profile === undefined || source === undefined
    || mission === undefined || plan === undefined || generation === undefined
    || approvals === undefined || !isString(raw.updatedAt)) {
    return malformed('', 'Study artifact is missing required fields or contains invalid field types.');
  }

  const document: StudyArtifactDocument = {
    schemaVersion: STUDY_ARTIFACT_SCHEMA_VERSION,
    contractRevision: STUDY_PRODUCT_CONTRACT_REVISION,
    courseId: raw.courseId,
    profile,
    source,
    mission,
    plan,
    generation,
    approvals,
    updatedAt: raw.updatedAt,
  };
  const snapshot = toCourseSnapshot(document);
  const errors: ContractIssue[] = snapshot.issues.filter((candidate) => candidate.severity === 'error');
  if (errors.length > 0) return { status: 'unsafe', issues: errors };
  return { status: 'ready', snapshot };
}

export function serializeStudyArtifact(document: StudyArtifactDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
