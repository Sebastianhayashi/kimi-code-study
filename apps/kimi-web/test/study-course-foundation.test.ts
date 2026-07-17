import { describe, expect, it } from 'vitest';

import { parseCatalogPackageManifest } from '../src/study/domain/catalogPackage';
import { parseStudyArtifact, serializeStudyArtifact } from '../src/study/domain/courseArtifact';
import {
  applyCourseEvent,
  createCatalogCourse,
  createUploadCourse,
  StudyContractError,
} from '../src/study/domain/courseState';
import {
  buildSkillActivationArgs,
  profileForUpload,
  validatePublicCopy,
} from '../src/study/domain/studyPolicy';

const NOW = '2026-07-17T00:00:00.000Z';

function catalogMaterial() {
  const digest = `sha256:${'a'.repeat(64)}`;
  const sourceDigest = `sha256:${'b'.repeat(64)}`;
  const artifactDigest = `sha256:${'c'.repeat(64)}`;
  const loaded = parseCatalogPackageManifest(JSON.stringify({
    schemaVersion: 1,
    contractRevision: 'kimi-study-package-v1',
    packageRef: `catalog://physics/v3@${digest}`,
    packageRevision: digest,
    materialId: 'catalog-1',
    title: 'Common Physics Textbook',
    sourceRevision: sourceDigest,
    reading: { coveragePercent: 100, blockedRanges: [], certificateRevision: 'reading-v3' },
    ria: { status: 'ready', revision: 'ria-v3' },
    artifacts: {
      'source/BOOK-READING-STATE.md': artifactDigest,
      'source/BOOK-OVERVIEW.md': artifactDigest,
      'source/RIA-DISTILLATION.md': artifactDigest,
      'source/ria/INDEX.md': artifactDigest,
    },
    approvals: [
      { actor: 'auto_policy', policyRevision: 'policy-v1', approvedRevision: 'reading-v3', approvedAt: NOW },
      { actor: 'auto_policy', policyRevision: 'policy-v1', approvedRevision: 'ria-v3', approvedAt: NOW },
    ],
    builtAt: NOW,
  }));
  if (loaded.status !== 'ready') throw new Error('catalog fixture must be certified');
  return loaded.material;
}

function uploadDraft() {
  return createUploadCourse('course-1', {
    fileId: 'file-1',
    name: 'Physics.pdf',
    mediaType: 'application/pdf',
    size: 1024,
    sourceRevision: 'sha256:source-1',
  }, NOW);
}

describe('Kimi Study course contract', () => {
  it('starts an upload at the one-time mode decision and defaults routing separately', () => {
    const draft = uploadDraft();
    expect(draft.phase).toBe('mode_selection');
    expect(draft.profile).toBeNull();

    const quick = applyCourseEvent(draft, { type: 'mode_selected', mode: 'quick' }, NOW);
    expect(quick.profile).toEqual(profileForUpload('quick', 'sha256:source-1'));
    expect(quick.source.status).toBe('surveying');
    expect(quick.mission.status).toBe('interviewing');
    expect(quick.phase).toBe('preparing_material');
  });

  it('mounts a catalog package as already certified without a mode decision', () => {
    const course = createCatalogCourse('course-2', catalogMaterial(), NOW);

    expect(course.profile?.mode).toBe('deep_preprocessed');
    expect(course.profile?.selectedBy).toBe('catalog');
    expect(course.source.evidenceLevel).toBe('certified');
    expect(course.phase).toBe('clarifying_mission');
  });

  it('forbids a second mode decision', () => {
    const quick = applyCourseEvent(uploadDraft(), { type: 'mode_selected', mode: 'quick' }, NOW);
    expect(() => applyCourseEvent(quick, { type: 'mode_selected', mode: 'deep' }, NOW))
      .toThrow(StudyContractError);
  });

  it('prevents quick mode from masquerading as deep certification', () => {
    const quick = applyCourseEvent(uploadDraft(), { type: 'mode_selected', mode: 'quick' }, NOW);
    expect(() => applyCourseEvent(quick, {
      type: 'source_updated',
      source: {
        ...quick.source,
        status: 'ready',
        evidenceLevel: 'certified',
        reading: { coveragePercent: 100, blockedRanges: [], certificateRevision: 'cert-1' },
        ria: { status: 'ready', revision: 'ria-1' },
      },
    }, NOW)).toThrowError(/survey evidence only/);
  });

  it('enforces deep certification coverage and distillation gates', () => {
    const deep = applyCourseEvent(uploadDraft(), { type: 'mode_selected', mode: 'deep' }, NOW);
    expect(() => applyCourseEvent(deep, {
      type: 'source_updated',
      source: {
        ...deep.source,
        status: 'ready',
        evidenceLevel: 'certified',
        reading: { coveragePercent: 99, blockedRanges: ['p. 88'] },
        ria: { status: 'pending' },
      },
    }, NOW)).toThrowError(/100% reading coverage/);
  });

  it('joins source evidence and Mission before course design', () => {
    let quick = applyCourseEvent(uploadDraft(), { type: 'mode_selected', mode: 'quick' }, NOW);
    quick = applyCourseEvent(quick, {
      type: 'source_updated',
      source: {
        ...quick.source,
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
    expect(quick.canDesign).toBe(false);
    expect(quick.phase).toBe('clarifying_mission');

    quick = applyCourseEvent(quick, {
      type: 'mission_updated',
      mission: { status: 'ready', revision: 1, questionsAsked: 1, summary: 'Pass the exam.' },
    }, NOW);
    expect(quick.canDesign).toBe(true);
    expect(quick.phase).toBe('designing_course');

    quick = applyCourseEvent(quick, {
      type: 'plan_updated',
      plan: {
        status: 'ready',
        revision: 'plan-1',
        basedOnSourceRevision: quick.source.revision,
        basedOnMissionRevision: quick.mission.revision,
        chapterCount: 4,
        pageCount: 12,
        quizCount: 2,
      },
    }, NOW);
    expect(quick.canGenerate).toBe(true);
    expect(quick.phase).toBe('generating_lessons');
  });

  it('rejects a plan based on stale Mission state', () => {
    const catalog = createCatalogCourse('course-2', catalogMaterial(), NOW);
    const missionReady = applyCourseEvent(catalog, {
      type: 'mission_updated',
      mission: { status: 'ready', revision: 3, questionsAsked: 2, summary: 'Build durable mastery.' },
    }, NOW);
    expect(() => applyCourseEvent(missionReady, {
      type: 'plan_updated',
      plan: {
        status: 'ready',
        revision: 'plan-1',
        basedOnSourceRevision: catalog.source.revision,
        basedOnMissionRevision: 2,
      },
    }, NOW)).toThrowError(/stale Mission revision/);
  });

  it('upgrades quick to deep without re-uploading the source', () => {
    const quick = applyCourseEvent(uploadDraft(), { type: 'mode_selected', mode: 'quick' }, NOW);
    const deep = applyCourseEvent(quick, { type: 'upgrade_requested' }, NOW);
    expect(deep.profile?.mode).toBe('deep');
    expect(deep.source.sourceId).toBe('file-1');
    expect(deep.source.evidenceLevel).toBe('certification_pending');
    expect(deep.plan.status).toBe('not_started');
  });

  it('refuses to brand an incomplete catalog package as certified', () => {
    const digest = `sha256:${'a'.repeat(64)}`;
    const loaded = parseCatalogPackageManifest(JSON.stringify({
      schemaVersion: 1,
      contractRevision: 'kimi-study-package-v1',
      packageRef: `catalog://book/v1@${digest}`,
      packageRevision: digest,
      materialId: 'catalog-unsafe',
      title: 'Unsafe package',
      sourceRevision: `sha256:${'b'.repeat(64)}`,
      reading: { coveragePercent: 99, blockedRanges: ['p. 9'], certificateRevision: 'fake' },
      ria: { status: 'ready', revision: 'fake' },
      artifacts: {},
      approvals: [],
      builtAt: NOW,
    }));
    expect(loaded.status).toBe('unsafe');
  });
});

describe('Study artifact trust boundary', () => {
  it('round-trips a valid artifact into a derived snapshot', () => {
    const draft = uploadDraft();
    const loaded = parseStudyArtifact(serializeStudyArtifact(draft));
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') expect(loaded.snapshot.phase).toBe('mode_selection');
  });

  it('does not invent readiness from malformed or unsupported artifacts', () => {
    expect(parseStudyArtifact('{oops').status).toBe('malformed');
    expect(parseStudyArtifact(JSON.stringify({ schemaVersion: 99 })).status).toBe('unsupported');
  });

  it('rejects structurally valid but unsafe agent claims', () => {
    const quick = applyCourseEvent(uploadDraft(), { type: 'mode_selected', mode: 'quick' }, NOW);
    const forged = {
      ...quick,
      source: {
        ...quick.source,
        status: 'ready',
        evidenceLevel: 'certified',
        reading: { coveragePercent: 100, blockedRanges: [], certificateRevision: 'fake' },
        ria: { status: 'ready', revision: 'fake' },
      },
    };
    expect(parseStudyArtifact(JSON.stringify(forged)).status).toBe('unsafe');
  });
});

describe('Study product boundary', () => {
  it('keeps internal orchestration terms out of learner-facing copy', () => {
    expect(validatePublicCopy('你的课程已经准备好')).toEqual([]);
    expect(validatePublicCopy('RIA checker finished in Kimi Code')).toHaveLength(3);
  });

  it('builds mode-specific activation policy', () => {
    const args = buildSkillActivationArgs({
      courseId: 'course-1',
      profile: profileForUpload('quick', 'source-1'),
      sourceTitle: 'Book.pdf',
    });
    expect(args).toContain('zero or one Mission question');
    expect(args).toContain('actor=auto_policy');
    expect(args).toContain('Do not claim full-book coverage');
  });
});
