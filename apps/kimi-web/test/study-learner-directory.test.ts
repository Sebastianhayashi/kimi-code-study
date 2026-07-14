import { describe, expect, it } from 'vitest';
import {
  LEARNER_DIRECTORY_STORAGE_KEY,
  LEARNER_DIRECTORY_VERSION,
  addLearner,
  attachWorkspaceRoot,
  detachWorkspaceRoot,
  emptyLearnerDirectory,
  loadLearnerDirectory,
  persistLearnerDirectory,
  reconcileWorkspaceRoot,
  rememberLastWorkspaceRoot,
  removeLearner,
  renameLearner,
  selectLearner,
  type LearnerDirectoryDocument,
  type LocalLearner,
  type StorageLike,
} from '../src/study/domain/learnerDirectory';

function createMemoryStorage(initial?: Record<string, string>): StorageLike {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

function learner(partial: Partial<LocalLearner> & Pick<LocalLearner, 'id' | 'displayName'>): LocalLearner {
  return {
    workspaceRoots: partial.workspaceRoots ?? [],
    ...partial,
    displayName: partial.displayName,
    id: partial.id,
    lastWorkspaceRoot: partial.lastWorkspaceRoot,
  };
}

function directory(partial?: Partial<LearnerDirectoryDocument>): LearnerDirectoryDocument {
  return {
    version: LEARNER_DIRECTORY_VERSION,
    learners: partial?.learners ?? [],
    selectedLearnerId: partial?.selectedLearnerId,
  };
}

describe('loadLearnerDirectory — missing / empty', () => {
  it('returns an explicit empty directory when the key is missing (not an error)', () => {
    const storage = createMemoryStorage();
    const result = loadLearnerDirectory(storage);
    expect(result.status).toBe('empty');
    expect(result.directory).toEqual(emptyLearnerDirectory());
    expect(result.directory.learners).toEqual([]);
    expect(result.directory.selectedLearnerId).toBeUndefined();
    expect(result.issues).toEqual([]);
    expect(result.raw).toBeUndefined();
  });

  it('emptyLearnerDirectory is versioned and has no members', () => {
    const empty = emptyLearnerDirectory();
    expect(empty).toEqual({ version: 1, learners: [] });
    expect(empty).not.toHaveProperty('selectedLearnerId');
  });

  it('getItem exception returns unavailable with storage_unavailable issue (not empty)', () => {
    const storage: StorageLike = {
      getItem() {
        throw new Error('quota or security error');
      },
      setItem() {
        /* unused */
      },
    };
    const result = loadLearnerDirectory(storage);
    expect(result.status).toBe('unavailable');
    expect(result.status).not.toBe('empty');
    expect(result.issues.some((i) => i.code === 'storage_unavailable')).toBe(true);
    expect(result.directory.learners).toEqual([]);
    expect(result.raw).toBeUndefined();
  });
});

describe('loadLearnerDirectory / persist — round-trip', () => {
  it('round-trips valid v1 data and preserves learner order', () => {
    const storage = createMemoryStorage();
    const doc = directory({
      selectedLearnerId: 'b',
      learners: [
        learner({
          id: 'a',
          displayName: 'Ada',
          workspaceRoots: ['/ws/ada-guitar'],
          lastWorkspaceRoot: '/ws/ada-guitar',
        }),
        learner({
          id: 'b',
          displayName: 'Bea',
          workspaceRoots: ['/ws/bea-piano', '/ws/bea-math'],
        }),
        learner({ id: 'c', displayName: 'Cal', workspaceRoots: [] }),
      ],
    });

    persistLearnerDirectory(storage, doc);
    const raw = storage.getItem(LEARNER_DIRECTORY_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toMatchObject({ version: 1 });

    const loaded = loadLearnerDirectory(storage);
    expect(loaded.status).toBe('ok');
    expect(loaded.issues).toEqual([]);
    expect(loaded.directory.learners.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(loaded.directory).toEqual(doc);
    expect(loaded.raw).toBeUndefined();
  });

  it('uses the stable storage key kimi-study.learners.v1', () => {
    expect(LEARNER_DIRECTORY_STORAGE_KEY).toBe('kimi-study.learners.v1');
    const storage = createMemoryStorage();
    persistLearnerDirectory(storage, emptyLearnerDirectory());
    expect(storage.getItem('kimi-study.learners.v1')).toBeTruthy();
  });
});

describe('loadLearnerDirectory — corrupt / wrong version / invalid shape', () => {
  it('corrupt JSON returns a recovery result with raw preserved and no manufactured members', () => {
    const raw = '{not-json';
    const storage = createMemoryStorage({ [LEARNER_DIRECTORY_STORAGE_KEY]: raw });
    const result = loadLearnerDirectory(storage);
    expect(result.status).toBe('recovered');
    expect(result.raw).toBe(raw);
    expect(result.directory).toEqual(emptyLearnerDirectory());
    expect(result.directory.learners).toEqual([]);
    expect(result.issues.some((i) => i.code === 'corrupt_json')).toBe(true);
  });

  it('wrong version returns recovery with raw and empty directory', () => {
    const raw = JSON.stringify({ version: 2, learners: [{ id: 'x', displayName: 'X', workspaceRoots: [] }] });
    const storage = createMemoryStorage({ [LEARNER_DIRECTORY_STORAGE_KEY]: raw });
    const result = loadLearnerDirectory(storage);
    expect(result.status).toBe('recovered');
    expect(result.raw).toBe(raw);
    expect(result.directory.learners).toEqual([]);
    expect(result.issues.some((i) => i.code === 'wrong_version')).toBe(true);
  });

  it('invalid top-level shape returns recovery with raw and no members', () => {
    const raw = JSON.stringify([{ id: 'a' }]);
    const storage = createMemoryStorage({ [LEARNER_DIRECTORY_STORAGE_KEY]: raw });
    const result = loadLearnerDirectory(storage);
    expect(result.status).toBe('recovered');
    expect(result.raw).toBe(raw);
    expect(result.directory.learners).toEqual([]);
    expect(result.issues.some((i) => i.code === 'invalid_shape')).toBe(true);
  });

  it('learners not an array is invalid shape recovery', () => {
    const raw = JSON.stringify({ version: 1, learners: { id: 'a' } });
    const storage = createMemoryStorage({ [LEARNER_DIRECTORY_STORAGE_KEY]: raw });
    const result = loadLearnerDirectory(storage);
    expect(result.status).toBe('recovered');
    expect(result.raw).toBe(raw);
    expect(result.directory.learners).toEqual([]);
    expect(result.issues.some((i) => i.code === 'invalid_shape')).toBe(true);
  });
});

describe('loadLearnerDirectory — orphan selected and field recovery', () => {
  it('clears an orphan selectedLearnerId with a recovery issue', () => {
    const raw = JSON.stringify({
      version: 1,
      selectedLearnerId: 'ghost',
      learners: [learner({ id: 'a', displayName: 'Ada', workspaceRoots: ['/ws/a'] })],
    });
    const storage = createMemoryStorage({ [LEARNER_DIRECTORY_STORAGE_KEY]: raw });
    const result = loadLearnerDirectory(storage);
    expect(result.status).toBe('recovered');
    expect(result.directory.selectedLearnerId).toBeUndefined();
    expect(result.directory.learners).toHaveLength(1);
    expect(result.raw).toBe(raw);
    expect(result.issues.some((i) => i.code === 'orphan_selected_learner')).toBe(true);
  });

  it('drops duplicate learner ids (keeps first) with a recovery issue', () => {
    const raw = JSON.stringify({
      version: 1,
      learners: [
        learner({ id: 'a', displayName: 'First', workspaceRoots: ['/ws/1'] }),
        learner({ id: 'a', displayName: 'Second', workspaceRoots: ['/ws/2'] }),
        learner({ id: 'b', displayName: 'Bea', workspaceRoots: [] }),
      ],
    });
    const storage = createMemoryStorage({ [LEARNER_DIRECTORY_STORAGE_KEY]: raw });
    const result = loadLearnerDirectory(storage);
    expect(result.status).toBe('recovered');
    expect(result.directory.learners.map((l) => l.displayName)).toEqual(['First', 'Bea']);
    expect(result.issues.some((i) => i.code === 'duplicate_learner_id')).toBe(true);
    expect(result.raw).toBe(raw);
  });

  it('drops learners with blank display names after trim', () => {
    const raw = JSON.stringify({
      version: 1,
      learners: [
        learner({ id: 'a', displayName: '  ', workspaceRoots: ['/ws/a'] }),
        learner({ id: 'b', displayName: 'Bea', workspaceRoots: [] }),
      ],
    });
    const storage = createMemoryStorage({ [LEARNER_DIRECTORY_STORAGE_KEY]: raw });
    const result = loadLearnerDirectory(storage);
    expect(result.status).toBe('recovered');
    expect(result.directory.learners.map((l) => l.id)).toEqual(['b']);
    expect(result.issues.some((i) => i.code === 'blank_display_name')).toBe(true);
  });

  it('strips blank and duplicate workspace roots; clears invalid lastWorkspaceRoot', () => {
    const raw = JSON.stringify({
      version: 1,
      learners: [
        {
          id: 'a',
          displayName: ' Ada ',
          workspaceRoots: ['/ws/a', '', '  ', '/ws/a', '/ws/b'],
          lastWorkspaceRoot: '/ws/missing',
        },
      ],
    });
    const storage = createMemoryStorage({ [LEARNER_DIRECTORY_STORAGE_KEY]: raw });
    const result = loadLearnerDirectory(storage);
    expect(result.status).toBe('recovered');
    expect(result.directory.learners).toHaveLength(1);
    const a = result.directory.learners[0]!;
    expect(a.displayName).toBe('Ada');
    expect(a.workspaceRoots).toEqual(['/ws/a', '/ws/b']);
    expect(a.lastWorkspaceRoot).toBeUndefined();
    expect(result.issues.some((i) => i.code === 'blank_workspace_root')).toBe(true);
    expect(result.issues.some((i) => i.code === 'duplicate_workspace_root')).toBe(true);
    expect(result.issues.some((i) => i.code === 'invalid_last_workspace_root')).toBe(true);
  });

  it('strips a workspace root claimed by an earlier learner (cross-learner on load)', () => {
    const raw = JSON.stringify({
      version: 1,
      learners: [
        learner({ id: 'a', displayName: 'Ada', workspaceRoots: ['/ws/shared'] }),
        learner({ id: 'b', displayName: 'Bea', workspaceRoots: ['/ws/shared', '/ws/bea'] }),
      ],
    });
    const storage = createMemoryStorage({ [LEARNER_DIRECTORY_STORAGE_KEY]: raw });
    const result = loadLearnerDirectory(storage);
    expect(result.status).toBe('recovered');
    expect(result.directory.learners[0]!.workspaceRoots).toEqual(['/ws/shared']);
    expect(result.directory.learners[1]!.workspaceRoots).toEqual(['/ws/bea']);
    expect(result.issues.some((i) => i.code === 'cross_learner_workspace_root')).toBe(true);
  });
});

describe('mutations — add / rename / select / remove', () => {
  it('adds a learner with trimmed displayName, opaque id, and no identity fields', () => {
    const base = emptyLearnerDirectory();
    const result = addLearner(base, { displayName: '  Ada  ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.directory.learners).toHaveLength(1);
    const created = result.directory.learners[0]!;
    expect(created.displayName).toBe('Ada');
    expect(typeof created.id).toBe('string');
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.workspaceRoots).toEqual([]);
    expect(created).not.toHaveProperty('email');
    expect(created).not.toHaveProperty('birthday');
    expect(created).not.toHaveProperty('password');
    expect(created).not.toHaveProperty('role');
    // input shape must not accept auth/identity fields in the public contract
    expect(Object.keys({ displayName: 'Ada' }).sort()).toEqual(['displayName']);
  });

  it('rejects blank display names on add and rename', () => {
    const base = emptyLearnerDirectory();
    expect(addLearner(base, { displayName: '   ' }).ok).toBe(false);

    const withOne = addLearner(base, { displayName: 'Ada' });
    expect(withOne.ok).toBe(true);
    if (!withOne.ok) return;
    const id = withOne.directory.learners[0]!.id;
    expect(renameLearner(withOne.directory, id, '  ').ok).toBe(false);
  });

  it('rejects blank explicit id with typed invalid_learner_id', () => {
    const base = emptyLearnerDirectory();
    const result = addLearner(base, { displayName: 'Ada', id: '   ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_learner_id');
    expect(result.error.code).not.toBe('invalid_display_name');
    expect(base.learners).toEqual([]);
  });

  it('rejects duplicate explicit id with typed duplicate_learner_id', () => {
    let doc = emptyLearnerDirectory();
    const first = addLearner(doc, { displayName: 'Ada', id: 'learner-a' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    doc = first.directory;

    const dup = addLearner(doc, { displayName: 'Other', id: 'learner-a' });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.code).toBe('duplicate_learner_id');
    expect(dup.error.code).not.toBe('learner_not_found');
    if (dup.error.code === 'duplicate_learner_id') {
      expect(dup.error.learnerId).toBe('learner-a');
    }
    expect(doc.learners).toHaveLength(1);
    expect(doc.learners[0]!.displayName).toBe('Ada');
  });

  it('renames a learner with trim', () => {
    let doc = emptyLearnerDirectory();
    const added = addLearner(doc, { displayName: 'Ada' });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    doc = added.directory;
    const id = doc.learners[0]!.id;
    const renamed = renameLearner(doc, id, '  Ada Lovelace  ');
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.directory.learners[0]!.displayName).toBe('Ada Lovelace');
  });

  it('selects an existing learner and rejects unknown ids', () => {
    let doc = emptyLearnerDirectory();
    const a = addLearner(doc, { displayName: 'Ada' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    doc = a.directory;
    const id = doc.learners[0]!.id;

    const selected = selectLearner(doc, id);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(selected.directory.selectedLearnerId).toBe(id);

    const clear = selectLearner(selected.directory, null);
    expect(clear.ok).toBe(true);
    if (!clear.ok) return;
    expect(clear.directory.selectedLearnerId).toBeUndefined();

    const missing = selectLearner(doc, 'nope');
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.code).toBe('learner_not_found');
  });

  it('removes a learner without implying workspace/Teach deletion and clears selection', () => {
    let doc = emptyLearnerDirectory();
    const a = addLearner(doc, { displayName: 'Ada' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    doc = a.directory;
    const id = doc.learners[0]!.id;
    const attached = attachWorkspaceRoot(doc, id, '/ws/ada');
    expect(attached.ok).toBe(true);
    if (!attached.ok) return;
    doc = attached.directory;
    const selected = selectLearner(doc, id);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    doc = selected.directory;

    const removed = removeLearner(doc, id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.directory.learners).toEqual([]);
    expect(removed.directory.selectedLearnerId).toBeUndefined();
    // Pure directory mutation only — no workspace/Teach side effects exist to assert;
    // the operation returns only a new directory document.
    expect(Object.keys(removed)).toEqual(expect.arrayContaining(['ok', 'directory']));
  });
});

describe('mutations — attach / detach / remember last root', () => {
  it('attaches a workspace root (canonical path string, not daemon id)', () => {
    let doc = emptyLearnerDirectory();
    const a = addLearner(doc, { displayName: 'Ada' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    doc = a.directory;
    const id = doc.learners[0]!.id;

    const attached = attachWorkspaceRoot(doc, id, '  /ws/ada-guitar  ');
    expect(attached.ok).toBe(true);
    if (!attached.ok) return;
    expect(attached.directory.learners[0]!.workspaceRoots).toEqual(['/ws/ada-guitar']);
  });

  it('rejects blank workspace roots and duplicate roots on the same learner', () => {
    let doc = emptyLearnerDirectory();
    const a = addLearner(doc, { displayName: 'Ada' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    doc = a.directory;
    const id = doc.learners[0]!.id;

    expect(attachWorkspaceRoot(doc, id, '  ').ok).toBe(false);
    const first = attachWorkspaceRoot(doc, id, '/ws/a');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const dup = attachWorkspaceRoot(first.directory, id, '/ws/a');
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.code).toBe('duplicate_workspace_root');
  });

  it('returns a typed conflict when a root already belongs to another learner; directory unchanged', () => {
    let doc = emptyLearnerDirectory();
    const a = addLearner(doc, { displayName: 'Ada' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    doc = a.directory;
    const b = addLearner(doc, { displayName: 'Bea' });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    doc = b.directory;
    const adaId = doc.learners[0]!.id;
    const beaId = doc.learners[1]!.id;

    const attached = attachWorkspaceRoot(doc, adaId, '/ws/shared');
    expect(attached.ok).toBe(true);
    if (!attached.ok) return;
    const before = attached.directory;

    const conflict = attachWorkspaceRoot(before, beaId, '/ws/shared');
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.error.code).toBe('workspace_root_owned');
    if (conflict.error.code === 'workspace_root_owned') {
      expect(conflict.error.root).toBe('/ws/shared');
      expect(conflict.error.ownerLearnerId).toBe(adaId);
    }
    // Directory unchanged on conflict
    expect(before.learners[1]!.workspaceRoots).toEqual([]);
  });

  it('detaches a root and clears lastWorkspaceRoot when it was that root', () => {
    let doc = emptyLearnerDirectory();
    const a = addLearner(doc, { displayName: 'Ada' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    doc = a.directory;
    const id = doc.learners[0]!.id;
    doc = (attachWorkspaceRoot(doc, id, '/ws/a') as { ok: true; directory: LearnerDirectoryDocument }).directory;
    doc = (attachWorkspaceRoot(doc, id, '/ws/b') as { ok: true; directory: LearnerDirectoryDocument }).directory;
    doc = (rememberLastWorkspaceRoot(doc, id, '/ws/a') as { ok: true; directory: LearnerDirectoryDocument }).directory;
    expect(doc.learners[0]!.lastWorkspaceRoot).toBe('/ws/a');

    const detached = detachWorkspaceRoot(doc, id, '/ws/a');
    expect(detached.ok).toBe(true);
    if (!detached.ok) return;
    expect(detached.directory.learners[0]!.workspaceRoots).toEqual(['/ws/b']);
    expect(detached.directory.learners[0]!.lastWorkspaceRoot).toBeUndefined();
  });

  it('rememberLastWorkspaceRoot only accepts roots already attached to the learner', () => {
    let doc = emptyLearnerDirectory();
    const a = addLearner(doc, { displayName: 'Ada' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    doc = a.directory;
    const id = doc.learners[0]!.id;
    doc = (attachWorkspaceRoot(doc, id, '/ws/a') as { ok: true; directory: LearnerDirectoryDocument }).directory;

    const ok = rememberLastWorkspaceRoot(doc, id, '/ws/a');
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.directory.learners[0]!.lastWorkspaceRoot).toBe('/ws/a');

    const bad = rememberLastWorkspaceRoot(doc, id, '/ws/other');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe('last_root_not_attached');
  });
});

describe('reconcileWorkspaceRoot', () => {
  const workspaces = [
    { id: 'daemon-1', root: '/ws/a', name: 'A' },
    { id: 'daemon-2', root: '/ws/b', name: 'B' },
  ];

  it('matches persisted root to the current workspace root string', () => {
    const result = reconcileWorkspaceRoot('/ws/b', workspaces);
    expect(result).toEqual({
      status: 'matched',
      root: '/ws/b',
      workspace: workspaces[1],
    });
  });

  it('returns unavailable when no root matches and never falls back to the first workspace', () => {
    const result = reconcileWorkspaceRoot('/ws/missing', workspaces);
    expect(result).toEqual({ status: 'unavailable', root: '/ws/missing' });
    expect(result).not.toMatchObject({ workspace: workspaces[0] });
  });

  it('matches by root only — never by daemon workspace id', () => {
    const byId = reconcileWorkspaceRoot('daemon-1', workspaces);
    expect(byId).toEqual({ status: 'unavailable', root: 'daemon-1' });
  });
});

describe('persist is pure storage write of the directory document', () => {
  it('writes only the versioned document shape', () => {
    const storage = createMemoryStorage();
    const doc = directory({
      learners: [
        learner({
          id: 'a',
          displayName: 'Ada',
          workspaceRoots: ['/ws/a'],
          lastWorkspaceRoot: '/ws/a',
        }),
      ],
      selectedLearnerId: 'a',
    });
    persistLearnerDirectory(storage, doc);
    const parsed = JSON.parse(storage.getItem(LEARNER_DIRECTORY_STORAGE_KEY)!);
    expect(parsed).toEqual({
      version: 1,
      selectedLearnerId: 'a',
      learners: [
        {
          id: 'a',
          displayName: 'Ada',
          workspaceRoots: ['/ws/a'],
          lastWorkspaceRoot: '/ws/a',
        },
      ],
    });
  });
});
