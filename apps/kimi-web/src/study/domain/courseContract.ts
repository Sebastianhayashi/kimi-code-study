/**
 * Kimi Study's product contract.
 *
 * The learner UI consumes this state instead of deriving progress from chat
 * messages. Agent output is untrusted until it passes the artifact parser and
 * the invariants in courseState.ts.
 */

export const STUDY_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const STUDY_PRODUCT_CONTRACT_REVISION = 'kimi-study-foundation-v1';

export type StudyMode = 'quick' | 'deep' | 'deep_preprocessed';
export type StudySkillName = 'teach-quick' | 'teach-ria';
export type EvidenceLevel = 'none' | 'survey' | 'certification_pending' | 'certified';
export type SourceKind = 'upload' | 'catalog';

export interface StudySkillPin {
  readonly name: StudySkillName;
  /** Product contract revision, not a mutable display label. */
  readonly contractRevision: string;
}

export interface StudyProfile {
  readonly mode: StudyMode;
  readonly skill: StudySkillPin;
  readonly sourceRevision: string;
  readonly selectedBy: 'user' | 'catalog';
  readonly packageRef?: string;
}

export interface ApprovalProvenance {
  /** Never record auto approval as if the learner clicked a confirmation. */
  readonly actor: 'user' | 'auto_policy' | 'system';
  readonly policyRevision: string;
  readonly approvedRevision: string;
  readonly approvedAt: string;
  readonly reason?: string;
}

export interface ReadingEvidence {
  readonly coveragePercent: number;
  readonly blockedRanges: readonly string[];
  readonly certificateRevision?: string;
}

export interface RiaEvidence {
  readonly status: 'pending' | 'ready' | 'blocked';
  readonly revision?: string;
}

export interface CourseSourceState {
  readonly kind: SourceKind;
  readonly sourceId: string;
  readonly title: string;
  readonly revision: string;
  readonly status: 'selected' | 'surveying' | 'deep_reading' | 'ready' | 'blocked';
  readonly evidenceLevel: EvidenceLevel;
  readonly packageRef?: string;
  readonly quickSurveyRevision?: string;
  readonly reading?: ReadingEvidence;
  readonly ria?: RiaEvidence;
  readonly blocker?: string;
}

export interface MissionState {
  readonly status: 'not_started' | 'interviewing' | 'ready' | 'blocked';
  readonly revision: number;
  readonly questionsAsked: number;
  readonly summary?: string;
  readonly blocker?: string;
}

export interface PlanState {
  readonly status: 'not_started' | 'designing' | 'ready' | 'blocked';
  readonly revision?: string;
  readonly basedOnSourceRevision?: string;
  readonly basedOnMissionRevision?: number;
  readonly chapterCount?: number;
  readonly pageCount?: number;
  readonly quizCount?: number;
  readonly blocker?: string;
}

export interface GenerationState {
  readonly status: 'not_started' | 'generating' | 'partially_ready' | 'ready' | 'blocked';
  readonly planRevision?: string;
  readonly publishedLessons: number;
  readonly totalLessons?: number;
  readonly blocker?: string;
}

/**
 * Canonical product artifact written to source/STUDY-SNAPSHOT.json.
 * `phase` is intentionally absent: the client derives it from orthogonal facts.
 */
export interface StudyArtifactDocument {
  readonly schemaVersion: typeof STUDY_ARTIFACT_SCHEMA_VERSION;
  readonly contractRevision: typeof STUDY_PRODUCT_CONTRACT_REVISION;
  readonly courseId: string;
  readonly profile: StudyProfile | null;
  readonly source: CourseSourceState;
  readonly mission: MissionState;
  readonly plan: PlanState;
  readonly generation: GenerationState;
  readonly approvals: readonly ApprovalProvenance[];
  readonly updatedAt: string;
}

export type CoursePhase =
  | 'mode_selection'
  | 'preparing_material'
  | 'clarifying_mission'
  | 'designing_course'
  | 'generating_lessons'
  | 'learning_ready'
  | 'learning'
  | 'blocked'
  | 'upgrading';

export interface ContractIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly severity: 'warning' | 'error';
}

export interface CourseSnapshot extends StudyArtifactDocument {
  readonly phase: CoursePhase;
  readonly issues: readonly ContractIssue[];
  readonly canDesign: boolean;
  readonly canGenerate: boolean;
}

export type StudyArtifactLoad =
  | { readonly status: 'ready'; readonly snapshot: CourseSnapshot }
  | {
      readonly status: 'malformed' | 'unsupported' | 'unsafe';
      readonly issues: readonly ContractIssue[];
    };

export interface UploadedMaterial {
  readonly fileId: string;
  readonly name: string;
  readonly mediaType: string;
  readonly size: number;
  /** Stable content identity supplied by the upload layer. */
  readonly sourceRevision: string;
}

export interface CatalogMaterial {
  readonly materialId: string;
  readonly title: string;
  readonly sourceRevision: string;
  /** Immutable reference to a preprocessed deep package. */
  readonly packageRef: string;
}
