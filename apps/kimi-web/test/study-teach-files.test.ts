/**
 * Scenario: teach-skill workspace file parsing for the Coursebox-style study
 * screens (TEACHING-MAP outline, MISSION title, course stages, lesson files).
 * Wiring: pure TypeScript module; no DOM, storage, network, or stubs.
 * Run: pnpm --filter @moonshot-ai/kimi-web test test/study-teach-files.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  courseDirName,
  deriveCourseStage,
  isStudyCourseCwd,
  lessonTitleFromFile,
  parseMissionTitle,
  parseTeachingMap,
  sortLessonFiles,
  resolveStudyWorkspaceRoot,
} from '../src/study/domain/teachFiles';
import { formatStudyRoute, parseStudyRoute } from '../src/study/domain/studyRoute';
const STUDY_ROOT = '/home/yuyu/kimi-study-workspace';


const SAMPLE_MAP = `# Teaching map

## Control
- Status: confirmed
- Blueprint revision: R3
- Mission SHA-256: deadbeef

## Mission link
帮助学习者用手机拍出清晰的家庭照片。

## Learning path
| Sequence | Slice ID | Primary capability slice | Source unit IDs and anchors | Prerequisites | Evidence of learning |
|---|---|---|---|---|---|
| 1 | S01.1 | 认识曝光三要素 | U1 pp.1-3 | 无 | 能解释曝光 |
| 2 | S01.2 | 控制曝光 | U1 pp.4-6 | S01.1 | 拍出清晰照片 |
| 3 | S02.1 | 构图 | U2 | S01.2 | 画面干净 |

## Deferred or out of scope
无。
`;

describe('isStudyCourseCwd', () => {
  it('accepts direct children of the study root', () => {
    expect(isStudyCourseCwd(`${resolveStudyWorkspaceRoot(STUDY_ROOT)}/photo-101`, STUDY_ROOT)).toBe(true);
  });

  it('rejects the root itself, other paths, and nested dirs', () => {
    expect(isStudyCourseCwd(resolveStudyWorkspaceRoot(STUDY_ROOT), STUDY_ROOT)).toBe(false);
    expect(isStudyCourseCwd('/home/yuyu/other', STUDY_ROOT)).toBe(false);
    expect(isStudyCourseCwd(`${resolveStudyWorkspaceRoot(STUDY_ROOT)}/a/b`, STUDY_ROOT)).toBe(false);
    expect(isStudyCourseCwd(undefined, STUDY_ROOT)).toBe(false);
  });
});

describe('courseDirName', () => {
  it('slugifies ASCII topics', () => {
    expect(courseDirName('Intro to Photography!')).toBe('intro-to-photography');
  });

  it('falls back for non-ASCII topics', () => {
    expect(courseDirName('手机拍照入门')).toBe('course');
  });
});

describe('parseTeachingMap', () => {
  it('parses the control status and blueprint revision', () => {
    const map = parseTeachingMap(SAMPLE_MAP);
    expect(map.status).toBe('confirmed');
    expect(map.blueprintRevision).toBe('R3');
  });

  it('parses learning-path rows and skips header/separator', () => {
    const map = parseTeachingMap(SAMPLE_MAP);
    expect(map.lessonCount).toBe(3);
    expect(map.rows[0]).toMatchObject({ sequence: '1', sliceId: 'S01.1', capability: '认识曝光三要素' });
  });

  it('groups rows into chapters by slice-id prefix', () => {
    const map = parseTeachingMap(SAMPLE_MAP);
    expect(map.chapters.map((c) => c.id)).toEqual(['S01', 'S02']);
    expect(map.chapters[0]?.lessons).toHaveLength(2);
    expect(map.chapters[1]?.lessons).toHaveLength(1);
  });

  it('tolerates a partial file without a learning path', () => {
    const map = parseTeachingMap('# Teaching map\n\n## Control\n- Status: draft\n');
    expect(map.status).toBe('draft');
    expect(map.lessonCount).toBe(0);
    expect(map.chapters).toEqual([]);
  });

  it('reports unknown status for unrecognized values', () => {
    const map = parseTeachingMap('## Control\n- Status: half-done\n');
    expect(map.status).toBe('unknown');
  });
});

describe('parseMissionTitle', () => {
  it('reads the first level-1 heading', () => {
    expect(parseMissionTitle('# 手机拍照入门\n\n## Why\n')).toBe('手机拍照入门');
  });

  it('returns undefined without a heading', () => {
    expect(parseMissionTitle('no heading here')).toBeUndefined();
  });
});

describe('deriveCourseStage', () => {
  it('walks the honest progression', () => {
    expect(deriveCourseStage({ hasMission: false, mapStatus: null, lessonCount: 0 })).toBe('interview');
    expect(deriveCourseStage({ hasMission: true, mapStatus: null, lessonCount: 0 })).toBe('reading');
    expect(deriveCourseStage({ hasMission: true, mapStatus: 'draft', lessonCount: 0 })).toBe('outline');
    expect(deriveCourseStage({ hasMission: true, mapStatus: 'ready for confirmation', lessonCount: 0 })).toBe('outline');
    expect(deriveCourseStage({ hasMission: true, mapStatus: 'confirmed', lessonCount: 0 })).toBe('ready');
    expect(deriveCourseStage({ hasMission: true, mapStatus: 'confirmed', lessonCount: 2 })).toBe('learning');
    expect(deriveCourseStage({ hasMission: true, mapStatus: 'stale', lessonCount: 2 })).toBe('stale');
  });
});

describe('lesson file helpers', () => {
  it('sorts by numeric prefix', () => {
    expect(sortLessonFiles(['0010-x.html', '0002-y.html', 'notes.html', '0001-z.html'])).toEqual([
      '0001-z.html',
      '0002-y.html',
      '0010-x.html',
      'notes.html',
    ]);
  });

  it('derives a readable title', () => {
    expect(lessonTitleFromFile('0001-why-photos-blur.html')).toBe('why photos blur');
  });
});

describe('studyRoute', () => {
  it('parses the home route', () => {
    expect(parseStudyRoute('')).toEqual({ name: 'home' });
    expect(parseStudyRoute('#/')).toEqual({ name: 'home' });
  });

  it('parses generator and learner routes', () => {
    expect(parseStudyRoute('#/c/session_1')).toEqual({ name: 'generator', sessionId: 'session_1' });
    expect(parseStudyRoute('#/c/session_1/l/0001-a.html')).toEqual({
      name: 'learner',
      sessionId: 'session_1',
      lessonFile: '0001-a.html',
    });
  });

  it('round-trips through format', () => {
    const route = { name: 'learner' as const, sessionId: 's 1', lessonFile: '0001-a b.html' };
    expect(parseStudyRoute(formatStudyRoute(route))).toEqual(route);
  });
});
