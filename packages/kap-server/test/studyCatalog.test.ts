import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';

import { type RunningServer, startServer } from '../src/start';
import {
  ARCHIVE_LIMITS,
  STUDY_PACKAGE_MANIFEST,
  StudyCatalogError,
  canonicalManifestJson,
  installStudyCatalogArchive,
  listStudyCatalog,
  materializeStudyCatalogCourse,
  readStudyCatalogCover,
  sha256,
  validateStudyArchiveEntries,
  type PackageFile,
  type StudyArchiveEntrySummary,
} from '../src/services/studyCatalog';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  const makeWritable = async (path: string): Promise<void> => {
    try {
      const info = await lstat(path);
      if (!info.isDirectory()) {
        await chmod(path, 0o600);
        return;
      }
      await chmod(path, 0o700);
      for (const entry of await readdir(path)) await makeWritable(join(path, entry));
    } catch {
      // A failed test may have already removed part of the fixture.
    }
  };
  await Promise.all(roots.splice(0).map(async (root) => {
    await makeWritable(root);
    await rm(root, { recursive: true, force: true });
  }));
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kimi-study-catalog-'));
  roots.push(root);
  return root;
}

function descriptor(path: string, data: Buffer, role: string, mediaType?: string): PackageFile {
  return {
    path,
    size: data.length,
    sha256: sha256(data),
    role,
    ...(mediaType === undefined ? {} : { mediaType }),
  };
}

interface ArchiveOptions {
  readonly materialId?: string;
  readonly kind?: 'book' | 'textbook';
  readonly sourceText?: string;
  readonly withCover?: boolean;
  readonly rights?: Record<string, unknown>;
  readonly mutateManifest?: (manifest: Record<string, unknown>) => void;
  readonly breakIdentity?: boolean;
  readonly omitActual?: readonly string[];
  readonly extraEntries?: Readonly<Record<string, Buffer>>;
  readonly modes?: Readonly<Record<string, number>>;
}

async function zipEntries(entries: ReadonlyArray<{ path: string; data: Buffer; mode?: number }>): Promise<Buffer> {
  const archive = new ZipFile();
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.outputStream.on('error', reject);
    archive.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
  for (const entry of entries) archive.addBuffer(entry.data, entry.path, { mode: entry.mode ?? 0o100644, mtime: new Date(0) });
  archive.end();
  return complete;
}

async function packageArchive(options: ArchiveOptions = {}): Promise<Buffer> {
  const materialId = options.materialId ?? 'example/book-v1';
  const kind = options.kind ?? 'book';
  const source = Buffer.from(options.sourceText ?? 'source bytes');
  const metadataValue: Record<string, unknown> = {
    materialId,
    materialKind: kind,
    title: kind === 'textbook' ? 'Example Textbook' : 'Example Book',
    authors: ['Example Author'],
    language: 'en',
    topics: ['learning'],
    description: 'Prepared source for testing.',
    searchAliases: ['example'],
    ...(kind === 'textbook' ? { country: 'CN', educationStage: 'high-school', subject: 'physics' } : {}),
    ...(options.withCover ? { cover: { path: 'source/assets/cover.png', mediaType: 'image/png' } } : {}),
  };
  const rightsValue: Record<string, unknown> = {
    source: 'test grant',
    rightsHolder: 'Example Rights Holder',
    licenseType: 'licensed',
    allowedTerritories: ['*'],
    sourceBytesMayBeStored: true,
    sourceTextMayBeDisplayed: true,
    derivativeCoursesAllowed: true,
    coverMayBeDisplayed: true,
    attributionRequired: false,
    ...options.rights,
  };
  const metadata = Buffer.from(JSON.stringify(metadataValue));
  const rights = Buffer.from(JSON.stringify(rightsValue));
  const files = new Map<string, { data: Buffer; role: string; mediaType?: string }>([
    ['source/CATALOG-METADATA.json', { data: metadata, role: 'catalog-metadata', mediaType: 'application/json' }],
    ['source/RIGHTS.json', { data: rights, role: 'rights', mediaType: 'application/json' }],
    ['source/BOOK-READING-STATE.md', { data: Buffer.from('# State\n- Coverage: 100%\n'), role: 'reading-state', mediaType: 'text/markdown' }],
    ['source/BOOK-OVERVIEW.md', { data: Buffer.from('# Overview\n'), role: 'reading-overview', mediaType: 'text/markdown' }],
    ['source/RIA-DISTILLATION.md', { data: Buffer.from('# RIA\n'), role: 'ria-distillation', mediaType: 'text/markdown' }],
    ['source/ria/INDEX.md', { data: Buffer.from('# Index\n'), role: 'ria-artifact', mediaType: 'text/markdown' }],
    ['source/original/book.txt', { data: source, role: 'original-source', mediaType: 'text/plain' }],
  ]);
  if (options.withCover) files.set('source/assets/cover.png', { data: Buffer.from('png-cover'), role: 'cover', mediaType: 'image/png' });
  const inventory = [...files].map(([path, file]) => descriptor(path, file.data, file.role, file.mediaType))
    .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  const byPath = new Map(inventory.map((file) => [file.path, file]));
  const manifest: Record<string, unknown> = {
    schemaVersion: 2,
    contractRevision: 'kimi-study-package-v2',
    materialId,
    materialKind: kind,
    title: metadataValue['title'],
    authors: metadataValue['authors'],
    language: metadataValue['language'],
    topics: metadataValue['topics'],
    source: byPath.get('source/original/book.txt'),
    metadata: byPath.get('source/CATALOG-METADATA.json'),
    rights: byPath.get('source/RIGHTS.json'),
    ...(options.withCover ? { cover: byPath.get('source/assets/cover.png') } : {}),
    reading: { coveragePercent: 100, blockedRanges: [], certificateRevision: 'read-v1' },
    ria: { status: 'complete', revision: 'ria-v1' },
    approvals: [
      { actor: 'auto_policy', policyRevision: 'policy-v1', approvedRevision: 'read-v1', approvedAt: '2026-07-18T00:00:00Z' },
      { actor: 'auto_policy', policyRevision: 'policy-v1', approvedRevision: 'ria-v1', approvedAt: '2026-07-18T00:00:00Z' },
    ],
    files: inventory,
  };
  options.mutateManifest?.(manifest);
  const revision = `sha256:${sha256(canonicalManifestJson(manifest))}`;
  manifest['packageRevision'] = revision;
  manifest['packageRef'] = `catalog://${materialId}@${revision}`;
  manifest['builtAt'] = '2026-07-18T00:00:00Z';
  if (options.breakIdentity) manifest['packageRevision'] = `sha256:${'f'.repeat(64)}`;

  const omitted = new Set(options.omitActual ?? []);
  const entries = [
    { path: 'source/STUDY-PACKAGE.json', data: Buffer.from(JSON.stringify(manifest)), mode: options.modes?.['source/STUDY-PACKAGE.json'] },
    ...[...files].filter(([path]) => !omitted.has(path)).map(([path, file]) => ({ path, data: file.data, mode: options.modes?.[path] })),
    ...Object.entries(options.extraEntries ?? {}).map(([path, data]) => ({ path, data, mode: options.modes?.[path] })),
  ];
  return zipEntries(entries);
}

interface Envelope<T = unknown> {
  code: number;
  msg: string;
  data: T | null;
  details?: { study_error_code?: string };
}

interface InjectResponse {
  statusCode: number;
  rawPayload: Buffer;
  json: () => unknown;
}

function authenticatedApp(server: RunningServer): {
  inject: (request: unknown) => Promise<InjectResponse>;
} {
  const app = server.app as unknown as { inject: (request: unknown) => Promise<InjectResponse> };
  return {
    inject(request: unknown): Promise<InjectResponse> {
      const input = request as { headers?: Record<string, string> };
      return app.inject({
        ...input,
        headers: {
          ...input.headers,
          authorization: `Bearer ${server.authTokenService.getToken()}`,
        },
      });
    },
  };
}

function multipartArchive(data: Buffer): { body: Buffer; contentType: string } {
  const boundary = '------KimiStudyCatalogRouteTest';
  return {
    body: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="example.kstudy.zip"\r\nContent-Type: application/zip\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function errorCode(error: unknown): string | undefined {
  return error instanceof StudyCatalogError ? error.code : undefined;
}

async function rejectsWithCode(operation: Promise<unknown>, ...codes: string[]): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(codes).toContain(errorCode(error));
    return;
  }
  throw new Error(`Expected rejection with ${codes.join(' or ')}`);
}

function rewriteZipName(zip: Buffer, oldName: string, newName: string): Buffer {
  const oldBytes = Buffer.from(oldName);
  const newBytes = Buffer.from(newName);
  if (oldBytes.length !== newBytes.length) throw new Error('replacement must have equal UTF-8 length');
  const result = Buffer.from(zip);
  let offset = 0;
  let changes = 0;
  while ((offset = result.indexOf(oldBytes, offset)) !== -1) {
    newBytes.copy(result, offset);
    offset += newBytes.length;
    changes += 1;
  }
  if (changes < 2) throw new Error('ZIP name was not found in local and central records');
  return result;
}

function fakeEntry(input: Partial<StudyArchiveEntrySummary> & Pick<StudyArchiveEntrySummary, 'fileName'>): StudyArchiveEntrySummary {
  return {
    compressedSize: 1,
    uncompressedSize: 1,
    compressionMethod: 8,
    generalPurposeBitFlag: 0,
    externalFileAttributes: 0o100644 << 16,
    directory: false,
    ...input,
  };
}

describe('Study Catalog package installation', () => {
  it('installs a valid book and lists it from the derived index', async () => {
    const root = await workspace();
    const installed = await installStudyCatalogArchive(root, await packageArchive());
    expect(installed.status).toBe('installed');
    const catalog = await listStudyCatalog(root);
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0]).toMatchObject({ materialKind: 'book', title: 'Example Book', packageVersion: 2 });
  });

  it('treats an identical packageRef as an idempotent success', async () => {
    const root = await workspace();
    const archive = await packageArchive();
    const first = await installStudyCatalogArchive(root, archive);
    const second = await installStudyCatalogArchive(root, archive);
    expect(second.status).toBe('already_installed');
    expect(second.entry.packageRef).toBe(first.entry.packageRef);
    const directories = (await readdir(join(root, 'packages'), { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
    expect(directories).toHaveLength(1);
  });

  it('keeps multiple revisions and selects the latest for new learners', async () => {
    const root = await workspace();
    const first = await installStudyCatalogArchive(root, await packageArchive({ sourceText: 'first' }), '2026-07-18T00:00:00Z');
    const second = await installStudyCatalogArchive(root, await packageArchive({ sourceText: 'second' }), '2026-07-19T00:00:00Z');
    expect(second.entry.packageRef).not.toBe(first.entry.packageRef);
    const rawIndex = JSON.parse(await readFile(join(root, 'packages/CATALOG-INDEX.json'), 'utf8')) as { entries: unknown[] };
    expect(rawIndex.entries).toHaveLength(2);
    expect((await listStudyCatalog(root)).entries[0]?.packageRef).toBe(second.entry.packageRef);
  });

  it.each([
    ['path traversal', (name: string) => `../${'x'.repeat(Buffer.byteLength(name) - 3)}`, 'archive_path_invalid'],
    ['absolute path', (name: string) => `/${'x'.repeat(Buffer.byteLength(name) - 1)}`, 'archive_path_invalid'],
    ['backslash bypass', (name: string) => name.replace('/', '\\'), 'archive_invalid'],
  ])('rejects %s before extraction', async (_label, replacement, expected) => {
    expect.hasAssertions();
    const root = await workspace();
    const oldName = 'source/ria/escape.md';
    const archive = await packageArchive({ extraEntries: { [oldName]: Buffer.from('escape') } });
    await rejectsWithCode(
      installStudyCatalogArchive(root, rewriteZipName(archive, oldName, replacement(oldName))),
      expected,
      'archive_path_invalid',
      'archive_invalid',
    );
  });

  it.each([
    ['symlink', 0o120777],
    ['special file', 0o010644],
  ])('rejects %s-mode entries', async (_label, mode) => {
    expect.hasAssertions();
    const root = await workspace();
    const path = 'source/ria/link.md';
    await rejectsWithCode(installStudyCatalogArchive(root, await packageArchive({
      extraEntries: { [path]: Buffer.from('../outside') },
      modes: { [path]: mode },
    })), 'archive_entry_type_forbidden');
  });

  it('installs, lists, serves a cover, and materializes through the authenticated API', async () => {
    const serverHome = await workspace();
    const learnerWorkspace = await workspace();
    // Isolate project-local config discovery from any parent test-runner workspace.
    await mkdir(join(learnerWorkspace, '.git'));
    const server = await startServer({
      host: '127.0.0.1',
      port: 0,
      homeDir: serverHome,
      logLevel: 'silent',
    });
    try {
      const app = authenticatedApp(server);
      const sessionResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { metadata: { cwd: learnerWorkspace } },
      });
      expect(sessionResponse.statusCode).toBe(200);
      const sessionEnvelope = sessionResponse.json() as Envelope<{ id: string }>;
      expect(sessionEnvelope.code, JSON.stringify(sessionEnvelope)).toBe(0);
      const session = sessionEnvelope.data!;

      const upload = multipartArchive(await packageArchive({ kind: 'textbook', withCover: true }));
      const uploadResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/files',
        payload: upload.body,
        headers: { 'content-type': upload.contentType },
      });
      expect(uploadResponse.statusCode).toBe(200);
      const uploadEnvelope = uploadResponse.json() as Envelope<{ id: string }>;
      expect(uploadEnvelope.code, JSON.stringify(uploadEnvelope)).toBe(0);
      const uploaded = uploadEnvelope.data!;

      const installResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/study/catalog/packages:install',
        payload: { session_id: session.id, file_id: uploaded.id },
      });
      expect(installResponse.statusCode).toBe(200);
      const installed = (installResponse.json() as Envelope<{
        status: string;
        entry: { packageRef: string };
      }>).data!;
      expect(installed.status).toBe('installed');

      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/study/catalog/packages?session_id=${encodeURIComponent(session.id)}`,
      });
      expect(listResponse.statusCode).toBe(200);
      const catalog = (listResponse.json() as Envelope<{ entries: Array<{ packageRef: string; materialKind: string }> }>).data!;
      expect(catalog.entries).toEqual([
        expect.objectContaining({ packageRef: installed.entry.packageRef, materialKind: 'textbook' }),
      ]);

      const coverResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/study/catalog/cover?session_id=${encodeURIComponent(session.id)}&package_ref=${encodeURIComponent(installed.entry.packageRef)}`,
      });
      expect(coverResponse.statusCode).toBe(200);
      expect(coverResponse.rawPayload.toString()).toBe('png-cover');

      const materializeResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/study/catalog/courses:materialize',
        payload: {
          session_id: session.id,
          course_id: 'course-api1234567',
          package_ref: installed.entry.packageRef,
        },
      });
      expect(materializeResponse.statusCode).toBe(200);
      expect(await readFile(join(learnerWorkspace, 'course-api1234567/source/original/book.txt'), 'utf8')).toBe('source bytes');

      const consumedUpload = await app.inject({ method: 'GET', url: `/api/v1/files/${uploaded.id}` });
      expect(consumedUpload.statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('rejects duplicate, case-colliding, and Unicode-colliding paths', async () => {
    expect.hasAssertions();
    const root = await workspace();
    const duplicateA = 'source/ria/dup-a.md';
    const duplicateB = 'source/ria/dup-b.md';
    const duplicate = rewriteZipName(
      await packageArchive({ extraEntries: { [duplicateA]: Buffer.from('a'), [duplicateB]: Buffer.from('b') } }),
      duplicateB,
      duplicateA,
    );
    await rejectsWithCode(installStudyCatalogArchive(root, duplicate), 'archive_path_collision');
    await rejectsWithCode(installStudyCatalogArchive(root, await packageArchive({
      extraEntries: { 'source/ria/Case.md': Buffer.from('a'), 'source/ria/case.md': Buffer.from('b') },
    })), 'archive_path_collision', 'archive_path_invalid');
    await rejectsWithCode(installStudyCatalogArchive(root, await packageArchive({
      extraEntries: { 'source/ria/é.md': Buffer.from('a'), 'source/ria/é.md': Buffer.from('b') },
    })), 'archive_path_collision');
  });

  it('enforces per-file, total-byte, and compression-ratio limits from headers', () => {
    const manifest = fakeEntry({ fileName: 'source/STUDY-PACKAGE.json', uncompressedSize: 10, compressedSize: 10 });
    expect(() => validateStudyArchiveEntries([manifest, fakeEntry({ fileName: 'source/a', uncompressedSize: ARCHIVE_LIMITS.oneFileBytes + 1 })]))
      .toThrowError(expect.objectContaining({ code: 'archive_limit_exceeded' }));
    expect(() => validateStudyArchiveEntries([
      manifest,
      ...Array.from({ length: 5 }, (_, index) => fakeEntry({
        fileName: `source/${index}`,
        uncompressedSize: 110 * 1024 * 1024,
        compressedSize: 110 * 1024 * 1024,
      })),
    ])).toThrowError(expect.objectContaining({ code: 'archive_limit_exceeded' }));
    expect(() => validateStudyArchiveEntries([
      manifest,
      fakeEntry({ fileName: 'source/bomb', uncompressedSize: 2 * 1024 * 1024, compressedSize: 1 }),
    ])).toThrowError(expect.objectContaining({ code: 'archive_limit_exceeded' }));
  });

  it.each([
    ['undeclared file', { extraEntries: { 'source/ria/extra.md': Buffer.from('extra') } }, 'inventory_mismatch'],
    ['declared file missing', { omitActual: ['source/ria/INDEX.md'] }, 'inventory_mismatch'],
    ['size mismatch', { mutateManifest: (manifest: Record<string, unknown>) => { ((manifest['files'] as PackageFile[])[0]!).size += 1; } }, 'inventory_mismatch'],
    ['checksum mismatch', { mutateManifest: (manifest: Record<string, unknown>) => { ((manifest['files'] as PackageFile[])[0]!).sha256 = '0'.repeat(64); } }, 'checksum_mismatch'],
    ['package digest mismatch', { breakIdentity: true }, 'package_identity_mismatch'],
    ['unsupported schema', { mutateManifest: (manifest: Record<string, unknown>) => { manifest['schemaVersion'] = 3; manifest['contractRevision'] = 'kimi-study-package-v3'; } }, 'manifest_invalid'],
    ['invalid rights', { rights: { sourceBytesMayBeStored: false } }, 'rights_denied'],
  ])('rejects %s without publishing it', async (_label, options, expected) => {
    const root = await workspace();
    await rejectsWithCode(
      installStudyCatalogArchive(root, await packageArchive(options as ArchiveOptions)),
      expected,
    );
    const index = await listStudyCatalog(root);
    expect(index.entries).toHaveLength(0);
    const visible = (await readdir(join(root, 'packages'), { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
    expect(visible).toHaveLength(0);
  });

  it('reads a healthy index without opening each manifest and rebuilds a damaged index', async () => {
    const root = await workspace();
    const installed = await installStudyCatalogArchive(root, await packageArchive());
    const manifestPath = join(root, 'packages', installed.entry.installDirectory, 'source/STUDY-PACKAGE.json');
    await import('node:fs/promises').then(({ chmod }) => chmod(manifestPath, 0o600));
    await writeFile(manifestPath, '{ temporarily unreadable as a manifest }');
    expect((await listStudyCatalog(root)).entries).toHaveLength(1);
    await writeFile(join(root, 'packages/CATALOG-INDEX.json'), '{bad index');
    expect((await listStudyCatalog(root)).entries).toHaveLength(0);
  });

  it('creates isolated personal course workspaces without mutating the package', async () => {
    const root = await workspace();
    const installed = await installStudyCatalogArchive(root, await packageArchive());
    const sourcePath = join(root, 'packages', installed.entry.installDirectory, 'source/original/book.txt');
    const original = await readFile(sourcePath);
    await materializeStudyCatalogCourse(root, 'course-a1234567', installed.entry.packageRef);
    await materializeStudyCatalogCourse(root, 'course-b1234567', installed.entry.packageRef);
    await writeFile(join(root, 'course-a1234567/source/original/book.txt'), 'personal copy');
    expect(await readFile(sourcePath)).toEqual(original);
    expect(await readFile(join(root, 'course-b1234567/source/original/book.txt'))).toEqual(original);
    expect((await stat(sourcePath)).mode & 0o222).toBe(0);
  });

  it('serves a verified real cover and indexes textbook education metadata', async () => {
    const root = await workspace();
    const installed = await installStudyCatalogArchive(root, await packageArchive({ kind: 'textbook', withCover: true }));
    const cover = await readStudyCatalogCover(root, installed.entry.packageRef);
    expect(cover.data.toString()).toBe('png-cover');
    expect(cover.mediaType).toBe('image/png');
    expect((await listStudyCatalog(root)).entries[0]).toMatchObject({
      materialKind: 'textbook',
      education: { subject: 'physics', educationStage: 'high-school' },
    });
  });

  it('rebuilds an unpacked v1 package into a compatible Catalog entry', async () => {
    const root = await workspace();
    const legacy = join(root, 'packages/legacy_v1');
    await mkdir(join(legacy, 'source/ria'), { recursive: true });
    const artifacts: Record<string, Buffer> = {
      'source/BOOK-READING-STATE.md': Buffer.from('# state'),
      'source/BOOK-OVERVIEW.md': Buffer.from('# overview'),
      'source/RIA-DISTILLATION.md': Buffer.from('# ria'),
      'source/ria/INDEX.md': Buffer.from('# index'),
    };
    await Promise.all(Object.entries(artifacts).map(async ([path, data]) => writeFile(join(legacy, path), data)));
    const revision = `sha256:${'1'.repeat(64)}`;
    await writeFile(join(legacy, STUDY_PACKAGE_MANIFEST), JSON.stringify({
      schemaVersion: 1,
      contractRevision: 'kimi-study-package-v1',
      packageRef: `catalog://legacy/book@${revision}`,
      packageRevision: revision,
      materialId: 'legacy/book',
      title: 'Legacy Book',
      author: 'Legacy Author',
      sourceRevision: `sha256:${'2'.repeat(64)}`,
      reading: { coveragePercent: 100, blockedRanges: [], certificateRevision: 'read-v1' },
      ria: { status: 'ready', revision: 'ria-v1' },
      artifacts: Object.fromEntries(Object.entries(artifacts).map(([path, data]) => [path, `sha256:${sha256(data)}`])),
      approvals: [
        { actor: 'auto_policy', policyRevision: 'p', approvedRevision: 'read-v1', approvedAt: '2026-01-01' },
        { actor: 'auto_policy', policyRevision: 'p', approvedRevision: 'ria-v1', approvedAt: '2026-01-01' },
      ],
      builtAt: '2026-01-01T00:00:00Z',
    }));
    const catalog = await listStudyCatalog(root);
    expect(catalog.entries[0]).toMatchObject({ packageVersion: 1, title: 'Legacy Book', materialKind: 'book' });
  });
});
