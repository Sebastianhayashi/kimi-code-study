import type {
  CatalogMaterial,
  ContractIssue,
  StudyMode,
  StudyProfile,
  StudySkillPin,
} from './courseContract';
import { STUDY_PRODUCT_CONTRACT_REVISION } from './courseContract';

export const STUDY_SKILL_PINS: Readonly<Record<'quick' | 'deep', StudySkillPin>> = {
  quick: {
    name: 'teach-quick',
    contractRevision: 'teach-quick-v2',
  },
  deep: {
    name: 'teach-ria',
    contractRevision: 'teach-ria-v2',
  },
};

export interface MissionQuestionPolicy {
  readonly min: number;
  readonly max: number;
}

export function missionQuestionPolicy(mode: StudyMode): MissionQuestionPolicy {
  return mode === 'quick' ? { min: 0, max: 1 } : { min: 2, max: 4 };
}

export function profileForUpload(mode: 'quick' | 'deep', sourceRevision: string): StudyProfile {
  return {
    mode,
    skill: mode === 'quick' ? STUDY_SKILL_PINS.quick : STUDY_SKILL_PINS.deep,
    sourceRevision,
    selectedBy: 'user',
  };
}

export function profileForCatalog(material: CatalogMaterial): StudyProfile {
  return {
    mode: 'deep_preprocessed',
    skill: STUDY_SKILL_PINS.deep,
    sourceRevision: material.sourceRevision,
    selectedBy: 'catalog',
    packageRef: material.packageRef,
  };
}

const PUBLIC_COPY_FORBIDDEN = [
  /\bKimi Code\b/i,
  /\bpermission mode\b/i,
  /\bmodel selector\b/i,
  /\bteach-(?:quick|ria)\b/i,
  /\bskill\s+(?:pin|activation|directory)\b/i,
  /\bactivateSkill\b/i,
  /\bRIA\b/i,
  /\bV[123]\b/i,
  /\bA[12]\b/i,
  /\bchecker\b/i,
  /\bBOOK-READING-STATE\b/i,
  /\bSTUDY-SNAPSHOT\.json\b/i,
];

/** Guardrail for copy shown outside developer-only diagnostics. */
export function validatePublicCopy(text: string): ContractIssue[] {
  const issues: ContractIssue[] = [];
  for (const pattern of PUBLIC_COPY_FORBIDDEN) {
    if (!pattern.test(text)) continue;
    issues.push({
      code: 'public_copy_internal_term',
      path: 'copy',
      message: `Public copy exposes internal term matched by ${pattern.source}`,
      severity: 'error',
    });
  }
  return issues;
}

export interface SkillActivationContext {
  readonly courseId: string;
  readonly profile: StudyProfile;
  readonly sourceTitle: string;
}

/**
 * Runtime args make product policy explicit even if a skill is installed by a
 * different environment. The bundled skill remains the primary implementation.
 */
export function buildSkillActivationArgs(context: SkillActivationContext): string {
  const common = [
    `Kimi Study product contract: ${STUDY_PRODUCT_CONTRACT_REVISION}.`,
    `Course id: ${context.courseId}.`,
    `Source title: ${context.sourceTitle}.`,
    `Source revision: ${context.profile.sourceRevision}.`,
    'Keep source/STUDY-SNAPSHOT.json current after every durable state transition.',
    'Never ask the learner to approve internal analysis; record automatic approvals with actor=auto_policy.',
    'Use AskUserQuestion for learner questions, exactly one question per card, with 2-4 options.',
  ];

  if (context.profile.mode === 'quick') {
    return [
      ...common,
      'Run the quick survey workflow only.',
      'Ask zero or one Mission question. Do not claim full-book coverage or deep certification.',
      'Produce a complete survey path through the material as quickly as evidence allows.',
    ].join('\n');
  }

  return [
    ...common,
    context.profile.mode === 'deep_preprocessed'
      ? `Mount the certified package ${context.profile.packageRef ?? ''}; do not repeat book reading.`
      : 'Run full reading and RIA distillation before course design.',
    'Ask 2-4 adaptive Mission questions while source work proceeds.',
    'Do not mark evidence certified unless coverage is 100%, blocked ranges are empty, and distillation is ready.',
  ].join('\n');
}
