/**
 * Scenario: Kimi Study controlled demo state machine.
 * Responsibilities: product-mode resolution, initial demo state, and state transitions.
 * Wiring: pure TypeScript module; no DOM, storage, network, or stubs.
 * Run: pnpm --filter @moonshot-ai/kimi-web test test/study-demo.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  createStudyDemoState,
  MISSION_ROUNDS,
  resolveKimiProductMode,
  selectCurrentLessonSource,
  transitionStudyDemo,
} from '../src/study/domain/studyDemo';

describe('resolveKimiProductMode', () => {
  it('returns code when the env value is missing', () => {
    expect(resolveKimiProductMode(undefined)).toBe('code');
  });

  it('returns code for unknown product values', () => {
    expect(resolveKimiProductMode('')).toBe('code');
    expect(resolveKimiProductMode('code')).toBe('code');
    expect(resolveKimiProductMode('unknown')).toBe('code');
    expect(resolveKimiProductMode('STUDY')).toBe('code');
  });

  it('returns study only for the exact study value', () => {
    expect(resolveKimiProductMode('study')).toBe('study');
  });
});

describe('createStudyDemoState', () => {
  it('starts on the home view', () => {
    const state = createStudyDemoState();
    expect(state.view).toBe('home');
  });

  it('surfaces the controlled learner name', () => {
    const state = createStudyDemoState();
    expect(state.learnerName).toBe('家人');
  });

  it('shows the demo-space notice instead of real progress', () => {
    const state = createStudyDemoState();
    expect(state.demoNotice).toContain('演示');
    expect(state.demoNotice).not.toContain('已连接');
  });

  it('loads mock studies and picks an active study', () => {
    const state = createStudyDemoState();
    expect(state.studies.length).toBeGreaterThanOrEqual(2);
    expect(state.activeStudyId).toBeDefined();
  });

  it('does not claim persistence, mastery, or progress fields', () => {
    const state = createStudyDemoState();
    expect(state).not.toHaveProperty('percent');
    expect(state).not.toHaveProperty('mastery');
    expect(state).not.toHaveProperty('streak');
    expect(state).not.toHaveProperty('progress');
    expect(state).not.toHaveProperty('persisted');
  });

  it('provides a ready lesson source for the active study', () => {
    const state = createStudyDemoState();
    const source = selectCurrentLessonSource(state);
    expect(source).toBeDefined();
    expect(source!.state).toBe('ok');
    expect(source!.html.length).toBeGreaterThan(0);
  });
});

describe('transitionStudyDemo', () => {
  it('selects a study and opens its detail view', () => {
    const home = createStudyDemoState();
    const targetId = home.studies[0]!.id;
    const detail = transitionStudyDemo(home, { type: 'select-study', studyId: targetId });
    expect(detail.view).toBe('detail');
    expect(detail.activeStudyId).toBe(targetId);
  });

  it('continues the active study and opens the lesson reader', () => {
    const home = createStudyDemoState();
    const targetId = home.studies[0]!.id;
    const lesson = transitionStudyDemo(home, { type: 'continue-study', studyId: targetId });
    expect(lesson.view).toBe('lesson');
    expect(lesson.activeStudyId).toBe(targetId);
    expect(lesson.lessonId).toBeDefined();
  });

  it('navigates prev and next between lessons', () => {
    const home = createStudyDemoState();
    const targetId = home.studies[0]!.id;
    const lesson = transitionStudyDemo(home, { type: 'continue-study', studyId: targetId });
    const firstLessonId = lesson.lessonId;
    expect(firstLessonId).toBeDefined();

    const next = transitionStudyDemo(lesson, { type: 'next-lesson' });
    if (home.studies[0]!.lessons.length > 1) {
      expect(next.lessonId).not.toBe(firstLessonId);
    }

    const prev = transitionStudyDemo(next, { type: 'prev-lesson' });
    expect(prev.lessonId).toBe(firstLessonId);
  });

  it('opens and closes the quickref', () => {
    const home = createStudyDemoState();
    const open = transitionStudyDemo(home, { type: 'open-quickref' });
    expect(open.quickrefOpen).toBe(true);

    const close = transitionStudyDemo(open, { type: 'close-quickref' });
    expect(close.quickrefOpen).toBe(false);
  });

  it('starts the new-study flow on the upload step', () => {
    const home = createStudyDemoState();
    const next = transitionStudyDemo(home, { type: 'go-new-study' });
    expect(next.view).toBe('new');
    expect(next.newFlow).toBeDefined();
    expect(next.newFlow!.step).toBe('upload');
  });

  it('moves from upload to mission conversation after upload-complete', () => {
    const home = createStudyDemoState();
    const upload = transitionStudyDemo(home, { type: 'go-new-study' });
    const mission = transitionStudyDemo(upload, { type: 'upload-complete', material: '拍照入门' });
    expect(mission.newFlow!.step).toBe('mission');
    expect(mission.newFlow!.material).toBe('拍照入门');
  });

  it('advances through mission rounds and lands on preview', () => {
    let state = createStudyDemoState();
    state = transitionStudyDemo(state, { type: 'go-new-study' });
    state = transitionStudyDemo(state, { type: 'upload-complete', material: '拍照入门' });

    for (let i = 0; i < MISSION_ROUNDS.length; i++) {
      expect(state.newFlow!.step).toBe('mission');
      state = transitionStudyDemo(state, { type: 'mission-next', answer: `answer ${i}` });
    }

    expect(state.newFlow!.step).toBe('preview');
    expect(state.newFlow!.generatedMission).toBeDefined();
    expect(state.newFlow!.previewLesson).toBeDefined();
  });

  it('creates a new in-memory study and opens the first lesson on mission-done', () => {
    let state = createStudyDemoState();
    const initialCount = state.studies.length;
    state = transitionStudyDemo(state, { type: 'go-new-study' });
    state = transitionStudyDemo(state, { type: 'upload-complete', material: '拍照入门' });
    for (let i = 0; i < MISSION_ROUNDS.length; i++) {
      state = transitionStudyDemo(state, { type: 'mission-next', answer: `answer ${i}` });
    }

    state = transitionStudyDemo(state, { type: 'mission-done' });
    expect(state.view).toBe('lesson');
    expect(state.studies.length).toBe(initialCount + 1);
    expect(state.activeStudyId).toBe(state.studies[0]!.id);
    expect(state.newFlow).toBeNull();
  });

  it('returns home and keeps studies in memory', () => {
    const home = createStudyDemoState();
    const detail = transitionStudyDemo(home, { type: 'select-study', studyId: home.studies[0]!.id });
    const back = transitionStudyDemo(detail, { type: 'go-home' });
    expect(back.view).toBe('home');
    expect(back.studies.length).toBe(home.studies.length);
  });
});
