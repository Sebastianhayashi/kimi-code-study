import { randomUUID } from 'node:crypto';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { z } from 'zod';

import { securelyExtractStudyPackage } from './archive';
import {
  CATALOG_INDEX_FILE,
  STUDY_PACKAGE_MANIFEST,
  StudyCatalogError,
  catalogIndexSchema,
  indexEntryFromPackage,
  isForbiddenPackagePath,
  sha256,
  validatePackagePath,
  verifyPackageV2,
  type CatalogIndex,
  type CatalogIndexEntry,
} from './contract';

const PACKAGES_DIRECTORY = 'packages';
const INCOMING_DIRECTORY = '.incoming';
const INSTALL_LOCK = '.install.lock';
const LOCK_STALE_MS = 10 * 60 * 1_000;
const COURSE_ID = /^[a-z0-9][a-z0-9-]{7,63}$/;
const processes = new Map<string, Promise<void>>();

const v1ApprovalSchema = z.object({
  actor: z.enum(['user', 'auto_policy', 'system']),
  policyRevision: z.string().min(1),
  approvedRevision: z.string().min(1),
  approvedAt: z.string().min(1),
  reason: z.string().optional(),
}).passthrough();

const v1ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  contractRevision: z.literal('kimi-study-package-v1'),
  packageRef: z.string().regex(/^catalog:\/\/.+@sha256:[a-f0-9]{64}$/),
  packageRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  materialId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().optional(),
  edition: z.string().optional(),
  sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  reading: z.object({
    coveragePercent: z.literal(100),
    blockedRanges: z.tuple([]),
    certificateRevision: z.string().min(1),
  }),
  ria: z.object({ status: z.literal('ready'), revision: z.string().min(1) }),
  artifacts: z.record(z.string(), z.string().regex(/^sha256:[a-f0-9]{64}$/)),
  approvals: z.array(v1ApprovalSchema).min(2),
  builtAt: z.string().min(1),
}).passthrough();

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw new StudyCatalogError(code, message, details);
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function packagesRoot(workspaceRoot: string): string {
  const root = resolve(workspaceRoot);
  if (root === resolve('/')) fail('install_failed', 'The filesystem root cannot be a Study workspace.');
  return join(root, PACKAGES_DIRECTORY);
}

function safeInstallKey(materialId: string, packageRevision: string): string {
  const slug = materialId.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'material';
  return `${slug.slice(0, 120)}--${packageRevision.slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

async function chmodTree(root: string, readOnly: boolean, includeRoot = true): Promise<void> {
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      await chmod(path, entry.isDirectory() ? (readOnly ? 0o555 : 0o700) : (readOnly ? 0o444 : 0o600));
    }
  };
  await walk(root);
  if (includeRoot) await chmod(root, readOnly ? 0o555 : 0o700);
}

async function atomicWriteIndex(root: string, entries: readonly CatalogIndexEntry[], now: string): Promise<CatalogIndex> {
  const index: CatalogIndex = { schemaVersion: 1, generatedAt: now, entries: [...entries] };
  const parsed = catalogIndexSchema.parse(index);
  const target = join(root, CATALOG_INDEX_FILE);
  const temporary = join(root, `.${CATALOG_INDEX_FILE}.tmp-${randomUUID()}`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
    try {
      const directory = await open(root, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch {
      // Directory fsync is not supported on every platform; the file itself is durable.
    }
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return parsed;
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function readHealthyIndex(root: string): Promise<CatalogIndex | undefined> {
  try {
    const parsed = catalogIndexSchema.safeParse(JSON.parse(await readFile(join(root, CATALOG_INDEX_FILE), 'utf8')) as unknown);
    if (!parsed.success) return undefined;
    for (const entry of parsed.data.entries) {
      if (!(await directoryExists(join(root, entry.installDirectory)))) return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
}

async function collectLegacyPaths(root: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) {
        fail('archive_entry_type_forbidden', 'Legacy package contains a link or special file.');
      }
      if (info.isDirectory()) {
        await walk(path);
        continue;
      }
      const rel = relative(root, path).split(sep).join('/');
      if (rel.includes('\\') || rel.startsWith('/') || rel.split('/').some((part) => part === '..') || isForbiddenPackagePath(rel)) {
        fail('archive_path_invalid', 'Legacy package contains an unsafe or course-specific path.');
      }
      files.set(rel, await readFile(path));
    }
  };
  await walk(root);
  return files;
}

async function indexLegacyV1(root: string, installDirectory: string, installedAt: string): Promise<CatalogIndexEntry> {
  const bytes = await readFile(join(root, STUDY_PACKAGE_MANIFEST));
  const parsed = v1ManifestSchema.safeParse(JSON.parse(bytes.toString('utf8')) as unknown);
  if (!parsed.success) fail('schema_unsupported', 'Legacy Catalog package manifest is invalid.');
  const manifest = parsed.data;
  if (manifest.packageRef !== `catalog://${manifest.materialId}@${manifest.packageRevision}`) {
    fail('package_identity_mismatch', 'Legacy package identity is inconsistent.');
  }
  if (!manifest.approvals.some((item) => item.approvedRevision === manifest.reading.certificateRevision)
    || !manifest.approvals.some((item) => item.approvedRevision === manifest.ria.revision)) {
    fail('manifest_invalid', 'Legacy package approvals are incomplete.');
  }
  const files = await collectLegacyPaths(root);
  for (const required of [
    'source/BOOK-READING-STATE.md',
    'source/BOOK-OVERVIEW.md',
    'source/RIA-DISTILLATION.md',
    'source/ria/INDEX.md',
  ]) {
    const actual = files.get(required);
    if (actual === undefined || manifest.artifacts[required] !== `sha256:${sha256(actual)}`) {
      fail('checksum_mismatch', 'Legacy package source certificate checksum is invalid.');
    }
  }
  return compact({
    packageVersion: 1,
    packageRef: manifest.packageRef,
    packageRevision: manifest.packageRevision,
    materialId: manifest.materialId,
    materialKind: 'book',
    title: manifest.title,
    authors: manifest.author ? [manifest.author] : [],
    language: 'und',
    edition: manifest.edition,
    topics: [],
    sourceRevision: manifest.sourceRevision,
    readingCertificateRevision: manifest.reading.certificateRevision,
    riaRevision: manifest.ria.revision,
    installDirectory,
    installedAt,
  }) as CatalogIndexEntry;
}

async function rebuildIndex(root: string, now: string): Promise<CatalogIndex> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const entries: CatalogIndexEntry[] = [];
  for (const directory of await readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory() || directory.name === INCOMING_DIRECTORY || directory.name.startsWith('.')) continue;
    if (directory.name.includes('/') || directory.name.includes('\\')) continue;
    const packageRoot = join(root, directory.name);
    try {
      const manifestRaw = JSON.parse(await readFile(join(packageRoot, STUDY_PACKAGE_MANIFEST), 'utf8')) as { schemaVersion?: unknown };
      const installedAt = (await stat(packageRoot)).mtime.toISOString();
      if (manifestRaw.schemaVersion === 2) {
        entries.push(indexEntryFromPackage(await verifyPackageV2(packageRoot), directory.name, installedAt));
      } else if (manifestRaw.schemaVersion === 1) {
        entries.push(await indexLegacyV1(packageRoot, directory.name, installedAt));
      }
    } catch {
      // Invalid directories are deliberately absent from the derived Catalog.
    }
  }
  entries.sort((left, right) => left.materialId.localeCompare(right.materialId) || left.packageRef.localeCompare(right.packageRef));
  return atomicWriteIndex(root, entries, now);
}

async function loadOrRebuildIndex(root: string, now: string): Promise<CatalogIndex> {
  return (await readHealthyIndex(root)) ?? rebuildIndex(root, now);
}

async function acquireFileLock(root: string): Promise<() => Promise<void>> {
  const path = join(root, INSTALL_LOCK);
  try {
    const handle = await open(path, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    return async () => {
      await handle.close();
      await rm(path, { force: true });
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const age = Date.now() - (await stat(path)).mtimeMs;
    if (age > LOCK_STALE_MS) {
      await rm(path, { force: true });
      return acquireFileLock(root);
    }
    fail('install_failed', 'Another package operation is already running.');
  }
}

async function withWorkspaceLock<T>(root: string, task: () => Promise<T>): Promise<T> {
  const previous = processes.get(root) ?? Promise.resolve();
  let releaseProcess!: () => void;
  const mine = new Promise<void>((resolveMine) => { releaseProcess = resolveMine; });
  const queued = previous.then(() => mine);
  processes.set(root, queued);
  await previous;
  const releaseFile = await acquireFileLock(root);
  try {
    return await task();
  } finally {
    await releaseFile();
    releaseProcess();
    if (processes.get(root) === queued) processes.delete(root);
  }
}

function latestEntries(entries: readonly CatalogIndexEntry[]): CatalogIndexEntry[] {
  const latest = new Map<string, CatalogIndexEntry>();
  for (const entry of entries) {
    const current = latest.get(entry.materialId);
    if (current === undefined || entry.installedAt > current.installedAt
      || (entry.installedAt === current.installedAt && entry.packageRef > current.packageRef)) {
      latest.set(entry.materialId, entry);
    }
  }
  return [...latest.values()].sort((left, right) => left.title.localeCompare(right.title));
}

export interface InstallStudyCatalogResult {
  readonly status: 'installed' | 'already_installed';
  readonly entry: CatalogIndexEntry;
}

export async function installStudyCatalogArchive(
  workspaceRoot: string,
  archive: Buffer,
  now = new Date().toISOString(),
): Promise<InstallStudyCatalogResult> {
  const root = packagesRoot(workspaceRoot);
  await mkdir(join(root, INCOMING_DIRECTORY), { recursive: true, mode: 0o700 });
  return withWorkspaceLock(root, async () => {
    const before = await loadOrRebuildIndex(root, now);
    const operationRoot = join(root, INCOMING_DIRECTORY, randomUUID());
    const staging = join(operationRoot, 'staging');
    let finalPath: string | undefined;
    let createdFinal = false;
    try {
      await mkdir(operationRoot, { recursive: true, mode: 0o700 });
      await securelyExtractStudyPackage(archive, staging);
      const verified = await verifyPackageV2(staging);
      const installDirectory = safeInstallKey(verified.manifest.materialId, verified.manifest.packageRevision);
      finalPath = join(root, installDirectory);
      const known = before.entries.find((entry) => entry.packageRef === verified.manifest.packageRef);
      if (await directoryExists(finalPath)) {
        const existing = await verifyPackageV2(finalPath);
        if (existing.manifest.packageRef !== verified.manifest.packageRef) {
          fail('package_conflict', 'The package destination already contains another revision.');
        }
        const entry = known ?? indexEntryFromPackage(existing, installDirectory, (await stat(finalPath)).mtime.toISOString());
        if (known === undefined) await atomicWriteIndex(root, [...before.entries, entry], now);
        return { status: 'already_installed', entry };
      }
      // Keep the staging root writable until rename: Linux rename requires
      // mutation permission on both parents. All descendants are already
      // read-only before the directory becomes visible at its final name.
      await chmodTree(staging, true, false);
      await rename(staging, finalPath);
      createdFinal = true;
      await chmod(finalPath, 0o555);
      const entry = indexEntryFromPackage(verified, installDirectory, now);
      await atomicWriteIndex(root, [...before.entries.filter((item) => item.packageRef !== entry.packageRef), entry], now);
      return { status: 'installed', entry };
    } catch (error) {
      if (createdFinal && finalPath !== undefined) {
        await chmodTree(finalPath, false).catch(() => undefined);
        await rm(finalPath, { recursive: true, force: true });
      }
      throw error;
    } finally {
      if (await directoryExists(staging)) await chmodTree(staging, false).catch(() => undefined);
      await rm(operationRoot, { recursive: true, force: true });
    }
  });
}

export async function listStudyCatalog(
  workspaceRoot: string,
  now = new Date().toISOString(),
): Promise<CatalogIndex> {
  const root = packagesRoot(workspaceRoot);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const index = await loadOrRebuildIndex(root, now);
  return { schemaVersion: 1, generatedAt: index.generatedAt, entries: latestEntries(index.entries) };
}

async function exactEntry(workspaceRoot: string, packageRef: string): Promise<{ root: string; entry: CatalogIndexEntry }> {
  const root = packagesRoot(workspaceRoot);
  const index = await loadOrRebuildIndex(root, new Date().toISOString());
  const entry = index.entries.find((item) => item.packageRef === packageRef);
  if (entry === undefined) fail('package_not_found', 'The selected material is no longer installed.');
  return { root, entry };
}

export async function materializeStudyCatalogCourse(
  workspaceRoot: string,
  courseId: string,
  packageRef: string,
): Promise<{ courseId: string; packageRef: string; sourceRevision: string }> {
  if (!COURSE_ID.test(courseId)) fail('course_invalid', 'The new course identifier is invalid.');
  const workspace = resolve(workspaceRoot);
  const { root, entry } = await exactEntry(workspaceRoot, packageRef);
  const installed = join(root, entry.installDirectory);
  if (entry.packageVersion === 2) await verifyPackageV2(installed);
  else await indexLegacyV1(installed, entry.installDirectory, entry.installedAt);
  const destination = join(workspace, courseId);
  if (!destination.startsWith(workspace + sep)) fail('course_invalid', 'The course destination escapes its workspace.');
  if (await directoryExists(destination)) {
    try {
      const existing = JSON.parse(await readFile(join(destination, STUDY_PACKAGE_MANIFEST), 'utf8')) as { packageRef?: unknown };
      if (existing.packageRef === packageRef) return { courseId, packageRef, sourceRevision: entry.sourceRevision };
    } catch {
      // A different existing directory is a conflict, never an overwrite target.
    }
    fail('course_conflict', 'A different course workspace already uses this identifier.');
  }
  const staging = join(workspace, `.${courseId}.incoming-${randomUUID()}`);
  try {
    await cp(installed, staging, { recursive: true, force: false, errorOnExist: true, dereference: false });
    await chmodTree(staging, false);
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return { courseId, packageRef, sourceRevision: entry.sourceRevision };
}

export async function readStudyCatalogCover(
  workspaceRoot: string,
  packageRef: string,
): Promise<{ data: Buffer; mediaType: string; etag: string }> {
  const { root, entry } = await exactEntry(workspaceRoot, packageRef);
  if (entry.cover === undefined) fail('cover_not_found', 'This material does not have a displayable cover.');
  if (!validatePackagePath(entry.cover.path)) fail('archive_path_invalid', 'The cover path is invalid.');
  const packageRoot = resolve(root, entry.installDirectory);
  const coverPath = resolve(packageRoot, entry.cover.path);
  if (!coverPath.startsWith(packageRoot + sep)) fail('archive_path_invalid', 'The cover path escapes its package.');
  const data = await readFile(coverPath);
  if (data.length !== entry.cover.size || sha256(data) !== entry.cover.sha256) {
    fail('checksum_mismatch', 'The installed cover no longer matches its package.');
  }
  return { data, mediaType: entry.cover.mediaType ?? 'application/octet-stream', etag: entry.cover.sha256 };
}
