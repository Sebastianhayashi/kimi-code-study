import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  canonicalCatalogPackageJson,
  parseCatalogIndex,
  parseCatalogPackageManifest,
  type CatalogPackageFile,
} from '../src/study/domain/catalogPackage';

const DIGEST = 'a'.repeat(64);

function file(path: string, role: string, digit: string): CatalogPackageFile {
  return { path, role, size: 10, sha256: digit.repeat(64), mediaType: 'text/markdown' };
}

function v2Manifest(): Record<string, unknown> {
  const source = file('source/original/book.pdf', 'original-source', '1');
  const metadata = file('source/CATALOG-METADATA.json', 'catalog-metadata', '2');
  const rights = file('source/RIGHTS.json', 'rights', '3');
  const inventory = [
    metadata,
    rights,
    file('source/BOOK-READING-STATE.md', 'reading-state', '4'),
    file('source/BOOK-OVERVIEW.md', 'reading-overview', '5'),
    file('source/RIA-DISTILLATION.md', 'ria-distillation', '6'),
    file('source/ria/INDEX.md', 'ria-artifact', '7'),
    source,
  ];
  return {
    schemaVersion: 2,
    contractRevision: 'kimi-study-package-v2',
    packageRef: `catalog://physics/common-v2@sha256:${DIGEST}`,
    packageRevision: `sha256:${DIGEST}`,
    materialId: 'physics/common-v2',
    materialKind: 'textbook',
    title: 'Common Physics',
    authors: ['Example Author'],
    language: 'en',
    publisher: 'Example Publisher',
    edition: '2',
    topics: ['physics'],
    source,
    metadata,
    rights,
    reading: { coveragePercent: 100, blockedRanges: [], certificateRevision: 'read-v2' },
    ria: { status: 'complete', revision: 'ria-v2' },
    approvals: [
      { actor: 'auto_policy', policyRevision: 'policy-v1', approvedRevision: 'read-v2', approvedAt: '2026-07-18T00:00:00Z' },
      { actor: 'auto_policy', policyRevision: 'policy-v1', approvedRevision: 'ria-v2', approvedAt: '2026-07-18T00:00:00Z' },
    ],
    files: inventory,
    builtAt: '2026-07-18T00:00:00Z',
  };
}

describe('installable Catalog package v2 parser', () => {
  it('accepts a complete textbook manifest while preserving v1 compatibility', () => {
    const loaded = parseCatalogPackageManifest(JSON.stringify(v2Manifest()));
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') return;
    expect(loaded.material).toMatchObject({
      packageVersion: 2,
      materialKind: 'textbook',
      authors: ['Example Author'],
      sourceRevision: `sha256:${'1'.repeat(64)}`,
      readingCertificateRevision: 'read-v2',
      riaRevision: 'ria-v2',
    });
  });

  it('rejects an incomplete inventory before branding the material', () => {
    const manifest = v2Manifest();
    manifest.files = (manifest.files as CatalogPackageFile[]).filter((item) => item.path !== 'source/ria/INDEX.md');
    expect(parseCatalogPackageManifest(JSON.stringify(manifest))).toMatchObject({
      status: 'unsafe',
      issues: [expect.objectContaining({ code: 'package_inventory_incomplete' })],
    });
  });

  it('matches the Python canonical digest fixture byte-for-byte', async () => {
    const fixture = JSON.parse(await readFile(
      new URL('../study-skills/teach-ria/tests/fixtures/canonical-manifest-input.json', import.meta.url),
      'utf8',
    )) as Record<string, unknown>;
    expect(`sha256:${createHash('sha256').update(canonicalCatalogPackageJson(fixture)).digest('hex')}`)
      .toBe('sha256:08705a8a405636f09003f644c923110b1ae9763fc6c16ae392524656de1ed3de');
  });

  it('certifies a derived index and preserves book/textbook presentation fields', () => {
    const base = {
      packageVersion: 2,
      packageRef: `catalog://physics/common-v2@sha256:${DIGEST}`,
      packageRevision: `sha256:${DIGEST}`,
      materialId: 'physics/common-v2',
      materialKind: 'textbook',
      title: 'Common Physics',
      authors: ['Example Author'],
      language: 'en',
      publisher: 'Example Publisher',
      topics: ['physics'],
      sourceRevision: `sha256:${'1'.repeat(64)}`,
      readingCertificateRevision: 'read-v2',
      riaRevision: 'ria-v2',
      installDirectory: 'physics--aaaaaaaaaaaaaaaa',
      installedAt: '2026-07-18T00:00:00Z',
      education: { grade: '10', subject: 'physics' },
    };
    const loaded = parseCatalogIndex({
      schemaVersion: 1,
      generatedAt: '2026-07-18T00:00:00Z',
      entries: [
        base,
        {
          ...base,
          packageRef: `catalog://books/learning@sha256:${'b'.repeat(64)}`,
          packageRevision: `sha256:${'b'.repeat(64)}`,
          materialId: 'books/learning',
          materialKind: 'book',
          title: 'Learning',
          education: undefined,
        },
      ],
    });
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') return;
    expect(loaded.materials.map((item) => item.materialKind)).toEqual(['textbook', 'book']);
    expect(loaded.materials[0]?.education).toMatchObject({ grade: '10', subject: 'physics' });
    expect(loaded.materials[1]?.cover).toBeUndefined();
  });
});
