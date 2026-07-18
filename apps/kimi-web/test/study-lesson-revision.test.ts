import { describe, expect, it } from 'vitest';

import {
  isLessonArtifactPath,
  lessonArtifactRevision,
} from '../src/study/domain/lessonRevision';

describe('lesson artifact revision', () => {
  it('produces the same documented UTF-8 FNV identity for Chinese HTML', () => {
    expect(lessonArtifactRevision('<h1>第一课</h1>')).toBe('fnv1a32:7735397a');
    expect(lessonArtifactRevision('<h1>第一课</h1>')).toBe(
      lessonArtifactRevision('<h1>第一课</h1>'),
    );
    expect(lessonArtifactRevision('<h1>第二课</h1>')).not.toBe(
      lessonArtifactRevision('<h1>第一课</h1>'),
    );
  });

  it('accepts only published lesson artifact paths', () => {
    expect(isLessonArtifactPath('lessons/0001-feedback-loops.html')).toBe(true);
    expect(isLessonArtifactPath('lessons/../source/secret.html')).toBe(false);
    expect(isLessonArtifactPath('/lessons/0001.html')).toBe(false);
    expect(isLessonArtifactPath('reference/0001.html')).toBe(false);
  });
});
