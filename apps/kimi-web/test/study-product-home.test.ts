import { renderToString } from '@vue/server-renderer';
import { createSSRApp } from 'vue';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';

import StudyProductHome from '../src/study/components/product/StudyProductHome.vue';
import { parseCatalogIndex, type CertifiedCatalogMaterial } from '../src/study/domain/catalogPackage';
import enStudy from '../src/i18n/locales/en/study';

function materials(): readonly CertifiedCatalogMaterial[] {
  const common = {
    packageVersion: 2,
    authors: ['Example Author'],
    language: 'en',
    topics: ['learning'],
    description: 'A prepared source for learning.',
    sourceRevision: `sha256:${'c'.repeat(64)}`,
    readingCertificateRevision: 'read-v1',
    riaRevision: 'ria-v1',
    installedAt: '2026-07-18T00:00:00Z',
  };
  const parsed = parseCatalogIndex({
    schemaVersion: 1,
    generatedAt: '2026-07-18T00:00:00Z',
    entries: [
      {
        ...common,
        packageRef: `catalog://textbooks/physics@sha256:${'a'.repeat(64)}`,
        packageRevision: `sha256:${'a'.repeat(64)}`,
        materialId: 'textbooks/physics',
        materialKind: 'textbook',
        title: 'Example Physics',
        publisher: 'Example Publisher',
        education: { grade: '10', subject: 'physics' },
        installDirectory: 'physics--aaaaaaaaaaaaaaaa',
      },
      {
        ...common,
        packageRef: `catalog://books/learning@sha256:${'b'.repeat(64)}`,
        packageRevision: `sha256:${'b'.repeat(64)}`,
        materialId: 'books/learning',
        materialKind: 'book',
        title: 'Example Learning',
        installDirectory: 'learning--bbbbbbbbbbbbbbbb',
      },
    ],
  });
  if (parsed.status !== 'ready') throw new Error('invalid fixture');
  return parsed.materials;
}

async function renderHome(input: {
  section: 'courses' | 'textbooks' | 'books';
  catalog?: readonly CertifiedCatalogMaterial[];
  coverUrls?: Readonly<Record<string, string>>;
  importState?: 'idle' | 'installing' | 'succeeded' | 'failed';
  importMessage?: string;
}): Promise<string> {
  const app = createSSRApp(StudyProductHome, {
    courses: [{
      schemaVersion: 1,
      courseId: 'course-12345678',
      workspacePath: '/workspace/course-12345678',
      sessionId: 'session-1',
      title: 'Prepared Course',
      sourceKind: 'catalog',
      operations: {},
      updatedAt: '2026-07-18T00:00:00Z',
    }],
    catalog: input.catalog ?? materials(),
    coverUrls: input.coverUrls ?? {},
    busy: false,
    catalogBusy: false,
    authRequired: false,
    importState: input.importState ?? 'idle',
    importMessage: input.importMessage,
    initialSection: input.section,
  });
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en: { study: enStudy } } }));
  return renderToString(app);
}

describe('StudyProductHome Catalog slice', () => {
  it('routes textbooks and books into separate learner-facing libraries', async () => {
    const textbook = await renderHome({ section: 'textbooks' });
    expect(textbook).toContain('Example Physics');
    expect(textbook).not.toContain('Example Learning');
    const book = await renderHome({ section: 'books' });
    expect(book).toContain('Example Learning');
    expect(book).not.toContain('Example Physics');
  });

  it('shows the approved fallback cover and uses a real verified cover when available', async () => {
    const fallback = await renderHome({ section: 'textbooks' });
    expect(fallback).toContain('study-cover--fallback');
    const selected = materials()[0]!;
    const real = await renderHome({ section: 'textbooks', coverUrls: { [selected.packageRef]: 'blob:verified-cover' } });
    expect(real).toContain('blob:verified-cover');
    expect(real).not.toContain('study-cover--fallback');
  });

  it('renders stable import success/failure feedback without protocol internals', async () => {
    const success = await renderHome({
      section: 'textbooks',
      importState: 'succeeded',
      importMessage: 'Material added. It is ready to choose.',
    });
    expect(success).toContain('Material added. It is ready to choose.');
    expect(success).not.toMatch(/\b(?:manifest|checksum|revision|RIA)\b/i);
    const failed = await renderHome({
      section: 'books',
      importState: 'failed',
      importMessage: 'This package is incomplete or was changed after it was built.',
    });
    expect(failed).toContain('This package is incomplete or was changed after it was built.');
    expect(failed).not.toMatch(/\b(?:manifest|checksum|revision|RIA)\b/i);
  });

  it('labels resumed Catalog courses as prepared instead of upload', async () => {
    const home = await renderHome({ section: 'courses' });
    expect(home).toContain('Prepared Course');
    expect(home).toContain('Prepared');
    expect(home).not.toContain('&gt;Upload&lt;');
  });
});
