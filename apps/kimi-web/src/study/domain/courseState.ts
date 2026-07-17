import type {
  ApprovalProvenance,
  ContractIssue,
  CoursePhase,
  CourseSnapshot,
  CourseSourceState,
  GenerationState,
  MissionState,
  PlanState,
  StudyArtifactDocument,
  StudyMode,
  UploadedMaterial,
} from './courseContract';
import type { CertifiedCatalogMaterial } from './catalogPackage';
import {
  STUDY_ARTIFACT_SCHEMA_VERSION,
  STUDY_PRODUCT_CONTRACT_REVISION,
} from './courseContract';
import {
  missionQuestionPolicy,
  profileForCatalog,
  profileForUpload,
} from './studyPolicy';

export type CourseEvent =
  | { readonly type: 'mode_selected'; readonly mode: 'quick' | 'deep' }
  | {
      readonly type: 'source_updated';
      readonly source: CourseSourceState;
      readonly approval?: ApprovalProvenance;
    }
  | { readonly type: 'mission_updated'; readonly mission: MissionState }
  | { readonly type: 'plan_updated'; readonly plan: PlanState }
  | { readonly type: 'generation_updated'; readonly generation: GenerationState }
  | { readonly type: 'upgrade_requested' };

export class StudyContractError extends Error {
  constructor(readonly issues: readonly ContractIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.name = 'StudyContractError';
  }
}

const EMPTY_MISSION: MissionState = {
  status: 'not_started',
  revision: 0,
  questionsAsked: 0,
};

const EMPTY_PLAN: PlanState = { status: 'not_started' };
const EMPTY_GENERATION: GenerationState = {
  status: 'not_started',
  publishedLessons: 0,
};

function nowOrProvided(updatedAt?: string): string {
  return updatedAt ?? new Date().toISOString();
}

export function createUploadCourse(
  courseId: string,
  material: UploadedMaterial,
  updatedAt?: string,
): CourseSnapshot {
  return toCourseSnapshot({
    schemaVersion: STUDY_ARTIFACT_SCHEMA_VERSION,
    contractRevision: STUDY_PRODUCT_CONTRACT_REVISION,
    courseId,
    profile: null,
    source: {
      kind: 'upload',
      sourceId: material.fileId,
      title: material.name,
      revision: material.sourceRevision,
      status: 'selected',
      evidenceLevel: 'none',
    },
    mission: EMPTY_MISSION,
    plan: EMPTY_PLAN,
    generation: EMPTY_GENERATION,
    approvals: [],
    updatedAt: nowOrProvided(updatedAt),
  });
}

export function createCatalogCourse(
  courseId: string,
  material: CertifiedCatalogMaterial,
  updatedAt?: string,
): CourseSnapshot {
  return toCourseSnapshot({
    schemaVersion: STUDY_ARTIFACT_SCHEMA_VERSION,
    contractRevision: STUDY_PRODUCT_CONTRACT_REVISION,
    courseId,
    profile: profileForCatalog(material),
    source: {
      kind: 'catalog',
      sourceId: material.materialId,
      title: material.title,
      revision: material.sourceRevision,
      status: 'ready',
      evidenceLevel: 'certified',
      packageRef: material.packageRef,
      reading: {
        coveragePercent: 100,
        blockedRanges: [],
        certificateRevision: material.readingCertificateRevision,
      },
      ria: { status: 'ready', revision: material.riaRevision },
    },
    mission: { ...EMPTY_MISSION, status: 'interviewing' },
    plan: EMPTY_PLAN,
    generation: EMPTY_GENERATION,
    approvals: [],
    updatedAt: nowOrProvided(updatedAt),
  });
}

function issue(
  code: string,
  path: string,
  message: string,
  severity: 'warning' | 'error' = 'error',
): ContractIssue {
  return { code, path, message, severity };
}

function validateProfile(document: StudyArtifactDocument, issues: ContractIssue[]): void {
  const { profile, source } = document;
  if (profile === null) {
    if (source.kind !== 'upload' || source.status !== 'selected') {
      issues.push(issue('profile_missing', 'profile', 'Only a newly uploaded source may wait for mode selection.'));
    }
    return;
  }

  if (profile.sourceRevision !== source.revision) {
    issues.push(issue('profile_source_revision_mismatch', 'profile.sourceRevision', 'Profile and source revisions must match.'));
  }

  if (profile.mode === 'deep_preprocessed') {
    if (source.kind !== 'catalog' || profile.selectedBy !== 'catalog') {
      issues.push(issue('preprocessed_origin_invalid', 'profile', 'A preprocessed profile must originate from the catalog.'));
    }
    if (profile.packageRef === undefined || source.packageRef !== profile.packageRef) {
      issues.push(issue('preprocessed_package_missing', 'profile.packageRef', 'A preprocessed profile requires one immutable package reference.'));
    }
  } else if (source.kind !== 'upload') {
    issues.push(issue('upload_mode_origin_invalid', 'profile.mode', 'Quick and deep mode selection applies only to uploaded material.'));
  }
}

function validateEvidence(document: StudyArtifactDocument, issues: ContractIssue[]): void {
  const { profile, source } = document;
  if (profile === null) return;

  if (profile.mode === 'quick') {
    if (source.evidenceLevel === 'certification_pending' || source.evidenceLevel === 'certified') {
      issues.push(issue('quick_cannot_certify', 'source.evidenceLevel', 'Quick mode may report survey evidence only.'));
    }
    if (source.reading !== undefined || source.ria !== undefined) {
      issues.push(issue('quick_has_deep_evidence', 'source', 'Quick mode cannot carry deep-reading or distillation evidence.'));
    }
    if (source.status === 'ready' && source.quickSurveyRevision === undefined) {
      issues.push(issue('quick_survey_missing', 'source.quickSurveyRevision', 'A ready quick source requires a survey revision.'));
    }
    return;
  }

  if (source.quickSurveyRevision !== undefined) {
    issues.push(issue('deep_has_quick_evidence', 'source.quickSurveyRevision', 'Deep profiles cannot use quick-survey evidence as certification.'));
  }
  if (source.evidenceLevel !== 'certified') return;

  if (source.reading?.coveragePercent !== 100) {
    issues.push(issue('certification_coverage_incomplete', 'source.reading.coveragePercent', 'Certification requires 100% reading coverage.'));
  }
  if ((source.reading?.blockedRanges.length ?? 1) !== 0) {
    issues.push(issue('certification_has_blocked_ranges', 'source.reading.blockedRanges', 'Certification requires no blocked ranges.'));
  }
  if (source.reading?.certificateRevision === undefined) {
    issues.push(issue('certificate_revision_missing', 'source.reading.certificateRevision', 'Certification requires a certificate revision.'));
  }
  if (source.ria?.status !== 'ready' || source.ria.revision === undefined) {
    issues.push(issue('distillation_not_ready', 'source.ria', 'Certification requires a ready distillation revision.'));
  }
}

function validateMission(document: StudyArtifactDocument, issues: ContractIssue[]): void {
  const { profile, mission } = document;
  if (!Number.isInteger(mission.revision) || mission.revision < 0) {
    issues.push(issue('mission_revision_invalid', 'mission.revision', 'Mission revision must be a non-negative integer.'));
  }
  if (!Number.isInteger(mission.questionsAsked) || mission.questionsAsked < 0) {
    issues.push(issue('mission_question_count_invalid', 'mission.questionsAsked', 'Mission question count must be a non-negative integer.'));
    return;
  }
  if (profile === null) return;
  const policy = missionQuestionPolicy(profile.mode);
  if (mission.questionsAsked > policy.max) {
    issues.push(issue('mission_question_budget_exceeded', 'mission.questionsAsked', `This mode allows at most ${policy.max} Mission questions.`));
  }
  if (mission.status === 'ready' && mission.questionsAsked < policy.min) {
    issues.push(issue('mission_question_budget_incomplete', 'mission.questionsAsked', `This mode requires at least ${policy.min} Mission questions before readiness.`));
  }
  if (mission.status === 'ready' && (mission.summary?.trim().length ?? 0) === 0) {
    issues.push(issue('mission_summary_missing', 'mission.summary', 'A ready Mission requires an attributable summary.'));
  }
}

function sourceReady(document: StudyArtifactDocument): boolean {
  if (document.profile?.mode === 'quick') {
    return document.source.status === 'ready' && document.source.evidenceLevel === 'survey';
  }
  return document.source.status === 'ready' && document.source.evidenceLevel === 'certified';
}

export function canDesignCourse(document: StudyArtifactDocument): boolean {
  return sourceReady(document) && document.mission.status === 'ready';
}

export function canGenerateCourse(document: StudyArtifactDocument): boolean {
  return canDesignCourse(document)
    && document.plan.status === 'ready'
    && document.plan.revision !== undefined
    && document.plan.basedOnSourceRevision === document.source.revision
    && document.plan.basedOnMissionRevision === document.mission.revision;
}

function validatePlanAndGeneration(document: StudyArtifactDocument, issues: ContractIssue[]): void {
  const { plan, generation } = document;
  if (plan.status === 'ready') {
    if (!canDesignCourse(document)) {
      issues.push(issue('plan_join_gate_not_ready', 'plan.status', 'A plan cannot be ready before source evidence and Mission are ready.'));
    }
    if (plan.revision === undefined) {
      issues.push(issue('plan_revision_missing', 'plan.revision', 'A ready plan requires a revision.'));
    }
    if (plan.basedOnSourceRevision !== document.source.revision) {
      issues.push(issue('plan_source_revision_stale', 'plan.basedOnSourceRevision', 'The plan is based on a stale source revision.'));
    }
    if (plan.basedOnMissionRevision !== document.mission.revision) {
      issues.push(issue('plan_mission_revision_stale', 'plan.basedOnMissionRevision', 'The plan is based on a stale Mission revision.'));
    }
  }

  if (generation.status !== 'not_started') {
    if (!canGenerateCourse(document)) {
      issues.push(issue('generation_gate_not_ready', 'generation.status', 'Generation requires the current ready plan.'));
    }
    if (generation.planRevision !== plan.revision) {
      issues.push(issue('generation_plan_revision_stale', 'generation.planRevision', 'Generation must target the current plan revision.'));
    }
  }
  if (generation.publishedLessons < 0 || !Number.isInteger(generation.publishedLessons)) {
    issues.push(issue('published_lessons_invalid', 'generation.publishedLessons', 'Published lesson count must be a non-negative integer.'));
  }
  if (generation.totalLessons !== undefined && generation.publishedLessons > generation.totalLessons) {
    issues.push(issue('published_lessons_exceed_total', 'generation.publishedLessons', 'Published lessons cannot exceed total lessons.'));
  }
}

function validateApprovals(document: StudyArtifactDocument, issues: ContractIssue[]): void {
  for (const [index, approval] of document.approvals.entries()) {
    if (approval.actor === 'auto_policy' && approval.policyRevision.trim().length === 0) {
      issues.push(issue('auto_approval_policy_missing', `approvals.${index}.policyRevision`, 'Automatic approval must name the policy revision that made the decision.'));
    }
    if (approval.approvedRevision.trim().length === 0) {
      issues.push(issue('approval_revision_missing', `approvals.${index}.approvedRevision`, 'Approval provenance must point to an immutable revision.'));
    }
  }
}

export function validateCourseDocument(document: StudyArtifactDocument): ContractIssue[] {
  const issues: ContractIssue[] = [];
  if (document.schemaVersion !== STUDY_ARTIFACT_SCHEMA_VERSION) {
    issues.push(issue('schema_version_unsupported', 'schemaVersion', 'Unsupported Study artifact schema.'));
  }
  if (document.contractRevision !== STUDY_PRODUCT_CONTRACT_REVISION) {
    issues.push(issue('contract_revision_unsupported', 'contractRevision', 'Unsupported Study product contract.'));
  }
  if (document.courseId.trim().length === 0) {
    issues.push(issue('course_id_missing', 'courseId', 'Course id is required.'));
  }
  if (document.source.revision.trim().length === 0) {
    issues.push(issue('source_revision_missing', 'source.revision', 'Source revision is required.'));
  }
  validateProfile(document, issues);
  validateEvidence(document, issues);
  validateMission(document, issues);
  validatePlanAndGeneration(document, issues);
  validateApprovals(document, issues);
  return issues;
}

export function deriveCoursePhase(document: StudyArtifactDocument): CoursePhase {
  if (document.source.status === 'blocked' || document.mission.status === 'blocked'
    || document.plan.status === 'blocked' || document.generation.status === 'blocked') {
    return 'blocked';
  }
  if (document.profile === null) return 'mode_selection';
  if (document.profile.mode === 'deep' && document.source.evidenceLevel === 'survey') return 'upgrading';
  if (!sourceReady(document)) return 'preparing_material';
  if (document.mission.status !== 'ready') return 'clarifying_mission';
  if (document.plan.status !== 'ready') return 'designing_course';
  if (document.generation.status === 'not_started' || document.generation.status === 'generating') {
    return 'generating_lessons';
  }
  return 'learning_ready';
}

export function toCourseSnapshot(document: StudyArtifactDocument): CourseSnapshot {
  const issues = validateCourseDocument(document);
  return {
    ...document,
    phase: issues.some((candidate) => candidate.severity === 'error')
      ? 'blocked'
      : deriveCoursePhase(document),
    issues,
    canDesign: issues.length === 0 && canDesignCourse(document),
    canGenerate: issues.length === 0 && canGenerateCourse(document),
  };
}

function assertValid(snapshot: CourseSnapshot): CourseSnapshot {
  const errors = snapshot.issues.filter((candidate) => candidate.severity === 'error');
  if (errors.length > 0) throw new StudyContractError(errors);
  return snapshot;
}

export function applyCourseEvent(
  current: CourseSnapshot,
  event: CourseEvent,
  updatedAt?: string,
): CourseSnapshot {
  const base: StudyArtifactDocument = {
    schemaVersion: current.schemaVersion,
    contractRevision: current.contractRevision,
    courseId: current.courseId,
    profile: current.profile,
    source: current.source,
    mission: current.mission,
    plan: current.plan,
    generation: current.generation,
    approvals: current.approvals,
    updatedAt: nowOrProvided(updatedAt),
  };

  switch (event.type) {
    case 'mode_selected': {
      if (current.profile !== null || current.source.kind !== 'upload') {
        throw new StudyContractError([issue('mode_selection_not_allowed', 'profile.mode', 'Mode may be selected exactly once for newly uploaded material.')]);
      }
      return assertValid(toCourseSnapshot({
        ...base,
        profile: profileForUpload(event.mode, current.source.revision),
        source: {
          ...current.source,
          status: event.mode === 'quick' ? 'surveying' : 'deep_reading',
          evidenceLevel: event.mode === 'quick' ? 'none' : 'certification_pending',
        },
        mission: { ...current.mission, status: 'interviewing' },
      }));
    }
    case 'source_updated':
      return assertValid(toCourseSnapshot({
        ...base,
        source: event.source,
        approvals: event.approval === undefined
          ? current.approvals
          : [...current.approvals, event.approval],
      }));
    case 'mission_updated':
      return assertValid(toCourseSnapshot({ ...base, mission: event.mission }));
    case 'plan_updated':
      return assertValid(toCourseSnapshot({ ...base, plan: event.plan }));
    case 'generation_updated':
      return assertValid(toCourseSnapshot({ ...base, generation: event.generation }));
    case 'upgrade_requested': {
      if (current.profile?.mode !== 'quick') {
        throw new StudyContractError([issue('upgrade_not_allowed', 'profile.mode', 'Only a quick course may be upgraded to deep mode.')]);
      }
      return assertValid(toCourseSnapshot({
        ...base,
        profile: profileForUpload('deep', current.source.revision),
        source: {
          kind: current.source.kind,
          sourceId: current.source.sourceId,
          title: current.source.title,
          revision: current.source.revision,
          status: 'deep_reading',
          evidenceLevel: 'certification_pending',
        },
        mission: {
          status: 'interviewing',
          revision: current.mission.revision,
          questionsAsked: 0,
          summary: current.mission.summary,
        },
        plan: EMPTY_PLAN,
        generation: EMPTY_GENERATION,
      }));
    }
  }
}

export function isLearnerReady(snapshot: CourseSnapshot): boolean {
  return snapshot.generation.status === 'ready' || snapshot.generation.status === 'partially_ready';
}

export function studyModeLabel(mode: StudyMode): 'quick' | 'deep' {
  return mode === 'quick' ? 'quick' : 'deep';
}
