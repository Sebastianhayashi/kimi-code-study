import { describe, expect, it, vi } from 'vitest';

import type { AppSession, KimiWebApi } from '../src/api/types';
import { parseCatalogIndex, type CertifiedCatalogMaterial } from '../src/study/domain/catalogPackage';
import { createCatalogCourse } from '../src/study/domain/courseState';
import { StudyCourseRegistry, type StudyStorage } from '../src/study/runtime/courseRegistry';
import { KimiStudyRuntime } from '../src/study/runtime/kimiStudyRuntime';

const NOW = '2026-07-18T00:00:00Z';
const PACKAGE_REVISION = `sha256:${'a'.repeat(64)}`;
const PACKAGE_REF = `catalog://books/example@${PACKAGE_REVISION}`;
const SOURCE_REVISION = `sha256:${'b'.repeat(64)}`;

class MemoryStorage implements StudyStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function session(id: string, cwd: string, title = id): AppSession {
  return {
    id,
    title,
    createdAt: NOW,
    updatedAt: NOW,
    status: 'idle',
    archived: false,
    cwd,
    model: 'default',
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalCostUsd: 0,
      contextTokens: 0,
      contextLimit: 0,
      turnCount: 0,
    },
    messageCount: 0,
    lastSeq: 0,
  };
}

function indexDocument(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    generatedAt: NOW,
    entries: [{
      packageVersion: 2,
      packageRef: PACKAGE_REF,
      packageRevision: PACKAGE_REVISION,
      materialId: 'books/example',
      materialKind: 'book',
      title: 'Example Book',
      authors: ['Example Author'],
      language: 'en',
      topics: ['learning'],
      description: 'Prepared example.',
      sourceRevision: SOURCE_REVISION,
      readingCertificateRevision: 'read-v1',
      riaRevision: 'ria-v1',
      installDirectory: 'books-example--aaaaaaaaaaaaaaaa',
      installedAt: NOW,
    }],
  };
}

function material(): CertifiedCatalogMaterial {
  const parsed = parseCatalogIndex(indexDocument());
  if (parsed.status !== 'ready' || parsed.materials[0] === undefined) throw new Error('invalid fixture');
  return parsed.materials[0];
}

function emptySessionPage() {
  return { items: [], hasMore: false } as const;
}

describe('Kimi Study installable Catalog runtime', () => {
  it('lists through the server index without opening package directories or manifests', async () => {
    const listDirectory = vi.fn();
    const listStudyCatalogPackages = vi.fn(async () => indexDocument());
    const createSession = vi.fn(async () => session('launcher-1', '/workspace', '[Kimi Study] workspace launcher'));
    const api = {
      listSessions: vi.fn(async () => emptySessionPage()),
      createSession,
      listStudyCatalogPackages,
      listDirectory,
    } as unknown as KimiWebApi;
    const runtime = new KimiStudyRuntime(api, new StudyCourseRegistry(new MemoryStorage()), { workspaceRoot: '/workspace' });

    await expect(runtime.listCatalog()).resolves.toMatchObject([{ title: 'Example Book', materialKind: 'book' }]);
    expect(listStudyCatalogPackages).toHaveBeenCalledWith('launcher-1');
    expect(listDirectory).not.toHaveBeenCalled();
  });

  it('uploads a .kstudy.zip, asks the server to install it, and immediately refreshes Catalog', async () => {
    const uploadFile = vi.fn(async () => ({ id: 'file-1', name: 'example.kstudy.zip', mediaType: 'application/zip', size: 10 }));
    const installStudyCatalogPackage = vi.fn(async () => ({ status: 'installed' }));
    const launcher = session('launcher-1', '/workspace', '[Kimi Study] workspace launcher');
    const api = {
      listSessions: vi.fn(async () => emptySessionPage()),
      createSession: vi.fn(async () => launcher),
      getSession: vi.fn(async () => launcher),
      uploadFile,
      installStudyCatalogPackage,
      listStudyCatalogPackages: vi.fn(async () => indexDocument()),
    } as unknown as KimiWebApi;
    const runtime = new KimiStudyRuntime(api, new StudyCourseRegistry(new MemoryStorage()), { workspaceRoot: '/workspace' });

    const result = await runtime.installCatalogPackage(new File(['zip'], 'example.kstudy.zip', { type: 'application/zip' }));
    expect(result).toMatchObject([{ packageRef: PACKAGE_REF }]);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(installStudyCatalogPackage).toHaveBeenCalledWith({ sessionId: 'launcher-1', fileId: 'file-1' });
  });

  it('materializes an isolated package copy before creating and activating the personal course session', async () => {
    const selected = material();
    const snapshot = createCatalogCourse('course-a1234567', selected, NOW);
    const materializeStudyCatalogCourse = vi.fn(async () => ({
      courseId: snapshot.courseId,
      packageRef: selected.packageRef,
      sourceRevision: selected.sourceRevision,
    }));
    const createSessionMock = vi.fn(async (input: Parameters<KimiWebApi['createSession']>[0]) =>
      input.cwd === '/workspace'
        ? session('launcher-1', '/workspace', '[Kimi Study] workspace launcher')
        : session('course-session-1', input.cwd ?? '', input.title ?? 'course'));
    const createSession = createSessionMock as KimiWebApi['createSession'];
    const submitPrompt: KimiWebApi['submitPrompt'] = vi.fn(async () => ({ promptId: 'prompt-1', userMessageId: 'message-1' }));
    const api = {
      listSessions: vi.fn(async () => emptySessionPage()),
      createSession,
      materializeStudyCatalogCourse,
      getAuth: vi.fn(async () => ({ ready: true, providersCount: 1, defaultModel: 'kimi', managedProvider: null })),
      updateSession: vi.fn(async (id: string) => session(id, '/workspace/course-a1234567')),
      listSkills: vi.fn(async () => [{ name: 'teach-ria', description: '[contract:teach-ria-v5] Deep', source: 'user' }]),
      activateSkill: vi.fn(async () => ({ activated: true as const, skillName: 'teach-ria' })),
      listMessages: vi.fn(async () => emptySessionPage()),
      submitPrompt,
    } as unknown as KimiWebApi;
    const runtime = new KimiStudyRuntime(api, new StudyCourseRegistry(new MemoryStorage()), { workspaceRoot: '/workspace' });

    const binding = await runtime.startCourse({ snapshot, catalogMaterial: selected });
    expect(binding).toMatchObject({
      workspacePath: '/workspace/course-a1234567',
      sourceKind: 'catalog',
      packageRef: PACKAGE_REF,
    });
    expect(materializeStudyCatalogCourse).toHaveBeenCalledWith({
      sessionId: 'launcher-1',
      courseId: 'course-a1234567',
      packageRef: PACKAGE_REF,
    });
    expect(materializeStudyCatalogCourse.mock.invocationCallOrder[0])
      .toBeLessThan(createSessionMock.mock.invocationCallOrder.at(-1)!);
    expect(submitPrompt).toHaveBeenCalledWith('course-session-1', expect.objectContaining({
      content: [expect.objectContaining({
        type: 'text',
        text: expect.stringMatching(/Mission.*do not repeat source reading/i),
      })],
    }));
  });
});
