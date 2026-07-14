/**
 * Pure, versioned local learner directory for Kimi Study.
 *
 * Maps an opaque learner id to explicit workspace root strings for device
 * personalization only. Not authentication, not a learning fact, and never
 * deletes a workspace or Teach file.
 *
 * All I/O goes through an injected minimal StorageLike port so tests do not
 * require jsdom / global localStorage.
 */

export const LEARNER_DIRECTORY_STORAGE_KEY = 'kimi-study.learners.v1';
export const LEARNER_DIRECTORY_VERSION = 1 as const;

/** Minimal storage port (localStorage-compatible subset). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/**
 * One local learner entry. Identity fields are limited to opaque id + display
 * name — never email, birthday, password, or role.
 */
export interface LocalLearner {
  /** Opaque id (not an account / auth subject). */
  id: string;
  /** Trimmed display name shown in the learner selector. */
  displayName: string;
  /**
   * Canonical workspace root path strings (not daemon workspace ids, not
   * session ids, not display-name paths). May be empty when the learner has
   * no learning space yet.
   */
  workspaceRoots: string[];
  /** Last used root; when set must be a member of workspaceRoots. */
  lastWorkspaceRoot?: string;
}

export interface LearnerDirectoryDocument {
  version: typeof LEARNER_DIRECTORY_VERSION;
  selectedLearnerId?: string;
  learners: LocalLearner[];
}

export type RecoveryIssueCode =
  | 'corrupt_json'
  | 'wrong_version'
  | 'invalid_shape'
  | 'orphan_selected_learner'
  | 'duplicate_learner_id'
  | 'blank_display_name'
  | 'invalid_learner'
  | 'blank_workspace_root'
  | 'duplicate_workspace_root'
  | 'invalid_last_workspace_root'
  | 'cross_learner_workspace_root'
  | 'storage_unavailable';

export interface RecoveryIssue {
  code: RecoveryIssueCode;
  message: string;
  learnerId?: string;
  detail?: string;
}

export type LoadLearnerDirectoryResult = {
  status: 'empty' | 'ok' | 'recovered' | 'unavailable';
  directory: LearnerDirectoryDocument;
  issues: RecoveryIssue[];
  /** Original storage bytes when the key was present (support / diagnostics). */
  raw?: string;
};

export type LearnerDirectoryError =
  | { code: 'learner_not_found'; learnerId: string }
  | { code: 'invalid_display_name' }
  | { code: 'invalid_learner_id' }
  | { code: 'duplicate_learner_id'; learnerId: string }
  | { code: 'invalid_workspace_root' }
  | { code: 'duplicate_workspace_root'; root: string }
  | { code: 'workspace_root_owned'; root: string; ownerLearnerId: string }
  | { code: 'last_root_not_attached'; root: string }
  | { code: 'root_not_attached'; root: string };

export type LearnerDirectoryMutationResult =
  | { ok: true; directory: LearnerDirectoryDocument }
  | { ok: false; error: LearnerDirectoryError };

export type WorkspaceRootReconciliation<TWorkspace extends { root: string } = { root: string }> =
  | { status: 'matched'; root: string; workspace: TWorkspace }
  | { status: 'unavailable'; root: string };

export function emptyLearnerDirectory(): LearnerDirectoryDocument {
  return { version: LEARNER_DIRECTORY_VERSION, learners: [] };
}

function issue(
  code: RecoveryIssueCode,
  message: string,
  extra?: { learnerId?: string; detail?: string },
): RecoveryIssue {
  const out: RecoveryIssue = { code, message };
  if (extra?.learnerId !== undefined) out.learnerId = extra.learnerId;
  if (extra?.detail !== undefined) out.detail = extra.detail;
  return out;
}

function generateLearnerId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return `learner_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneDirectory(doc: LearnerDirectoryDocument): LearnerDirectoryDocument {
  return {
    version: LEARNER_DIRECTORY_VERSION,
    learners: doc.learners.map((l) => cloneLearner(l)),
    selectedLearnerId: doc.selectedLearnerId,
  };
}

function cloneLearner(l: LocalLearner): LocalLearner {
  return {
    id: l.id,
    displayName: l.displayName,
    workspaceRoots: [...l.workspaceRoots],
    lastWorkspaceRoot: l.lastWorkspaceRoot,
  };
}

function normalizeLearnerDocument(doc: LearnerDirectoryDocument): LearnerDirectoryDocument {
  const out: LearnerDirectoryDocument = {
    version: LEARNER_DIRECTORY_VERSION,
    learners: doc.learners.map((l) => {
      const entry: LocalLearner = {
        id: l.id,
        displayName: l.displayName,
        workspaceRoots: [...l.workspaceRoots],
      };
      if (l.lastWorkspaceRoot !== undefined) {
        entry.lastWorkspaceRoot = l.lastWorkspaceRoot;
      }
      return entry;
    }),
  };
  if (doc.selectedLearnerId !== undefined) {
    out.selectedLearnerId = doc.selectedLearnerId;
  }
  return out;
}

/**
 * Load and validate the v1 learner directory from storage.
 * Missing key → explicit empty directory (not an error).
 * Corrupt / wrong version / invalid shape → recovered empty + raw preserved.
 * Soft structural problems → recovered directory with issues; never invents members.
 */
export function loadLearnerDirectory(storage: StorageLike): LoadLearnerDirectoryResult {
  let raw: string | null;
  try {
    raw = storage.getItem(LEARNER_DIRECTORY_STORAGE_KEY);
  } catch {
    return {
      status: 'unavailable',
      directory: emptyLearnerDirectory(),
      issues: [
        issue('storage_unavailable', 'learner directory storage getItem failed'),
      ],
    };
  }

  if (raw === null || raw === '') {
    return {
      status: 'empty',
      directory: emptyLearnerDirectory(),
      issues: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'recovered',
      directory: emptyLearnerDirectory(),
      issues: [issue('corrupt_json', 'stored learner directory is not valid JSON')],
      raw,
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      status: 'recovered',
      directory: emptyLearnerDirectory(),
      issues: [issue('invalid_shape', 'learner directory must be a JSON object')],
      raw,
    };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj['version'] !== LEARNER_DIRECTORY_VERSION) {
    return {
      status: 'recovered',
      directory: emptyLearnerDirectory(),
      issues: [
        issue('wrong_version', `unsupported learner directory version: ${String(obj['version'])}`),
      ],
      raw,
    };
  }

  if (!Array.isArray(obj['learners'])) {
    return {
      status: 'recovered',
      directory: emptyLearnerDirectory(),
      issues: [issue('invalid_shape', 'learners must be an array')],
      raw,
    };
  }

  const issues: RecoveryIssue[] = [];
  const learners: LocalLearner[] = [];
  const seenIds = new Set<string>();
  const claimedRoots = new Map<string, string>(); // root → owner learner id

  for (let i = 0; i < obj['learners'].length; i++) {
    const rawLearner = obj['learners'][i];
    if (rawLearner === null || typeof rawLearner !== 'object' || Array.isArray(rawLearner)) {
      issues.push(
        issue('invalid_learner', `learners[${i}] is not an object`, { detail: String(i) }),
      );
      continue;
    }
    const entry = rawLearner as Record<string, unknown>;
    const id = entry['id'];
    if (typeof id !== 'string' || id.length === 0) {
      issues.push(
        issue('invalid_learner', `learners[${i}] has invalid id`, { detail: String(i) }),
      );
      continue;
    }
    if (seenIds.has(id)) {
      issues.push(
        issue('duplicate_learner_id', `duplicate learner id dropped: ${id}`, {
          learnerId: id,
        }),
      );
      continue;
    }

    const nameRaw = entry['displayName'];
    if (typeof nameRaw !== 'string') {
      issues.push(
        issue('invalid_learner', `learner ${id} has invalid displayName`, { learnerId: id }),
      );
      continue;
    }
    const displayName = nameRaw.trim();
    if (displayName.length === 0) {
      issues.push(
        issue('blank_display_name', `learner ${id} has blank displayName`, { learnerId: id }),
      );
      continue;
    }

    const rootsRaw = entry['workspaceRoots'];
    if (!Array.isArray(rootsRaw)) {
      issues.push(
        issue('invalid_learner', `learner ${id} has invalid workspaceRoots`, { learnerId: id }),
      );
      continue;
    }

    const workspaceRoots: string[] = [];
    const rootsSeen = new Set<string>();
    for (const r of rootsRaw) {
      if (typeof r !== 'string') {
        issues.push(
          issue('blank_workspace_root', `learner ${id} has non-string workspace root`, {
            learnerId: id,
          }),
        );
        continue;
      }
      const root = r.trim();
      if (root.length === 0) {
        issues.push(
          issue('blank_workspace_root', `learner ${id} has blank workspace root`, {
            learnerId: id,
          }),
        );
        continue;
      }
      if (rootsSeen.has(root)) {
        issues.push(
          issue('duplicate_workspace_root', `learner ${id} has duplicate root ${root}`, {
            learnerId: id,
            detail: root,
          }),
        );
        continue;
      }
      const owner = claimedRoots.get(root);
      if (owner !== undefined) {
        issues.push(
          issue(
            'cross_learner_workspace_root',
            `workspace root ${root} already owned by ${owner}; stripped from ${id}`,
            { learnerId: id, detail: root },
          ),
        );
        continue;
      }
      rootsSeen.add(root);
      claimedRoots.set(root, id);
      workspaceRoots.push(root);
    }

    let lastWorkspaceRoot: string | undefined;
    if ('lastWorkspaceRoot' in entry && entry['lastWorkspaceRoot'] !== undefined) {
      const last = entry['lastWorkspaceRoot'];
      if (typeof last !== 'string' || last.trim().length === 0) {
        issues.push(
          issue('invalid_last_workspace_root', `learner ${id} has invalid lastWorkspaceRoot`, {
            learnerId: id,
          }),
        );
      } else {
        const trimmedLast = last.trim();
        if (!workspaceRoots.includes(trimmedLast)) {
          issues.push(
            issue(
              'invalid_last_workspace_root',
              `learner ${id} lastWorkspaceRoot not in workspaceRoots`,
              { learnerId: id, detail: trimmedLast },
            ),
          );
        } else {
          lastWorkspaceRoot = trimmedLast;
        }
      }
    }

    seenIds.add(id);
    const learner: LocalLearner = {
      id,
      displayName,
      workspaceRoots,
    };
    if (lastWorkspaceRoot !== undefined) {
      learner.lastWorkspaceRoot = lastWorkspaceRoot;
    }
    learners.push(learner);
  }

  let selectedLearnerId: string | undefined;
  if ('selectedLearnerId' in obj && obj['selectedLearnerId'] !== undefined) {
    const sel = obj['selectedLearnerId'];
    if (typeof sel !== 'string' || sel.length === 0) {
      issues.push(
        issue('orphan_selected_learner', 'selectedLearnerId is not a valid string'),
      );
    } else if (!seenIds.has(sel)) {
      issues.push(
        issue('orphan_selected_learner', `selectedLearnerId ${sel} does not match any learner`, {
          detail: sel,
        }),
      );
    } else {
      selectedLearnerId = sel;
    }
  }

  const directory: LearnerDirectoryDocument = {
    version: LEARNER_DIRECTORY_VERSION,
    learners,
  };
  if (selectedLearnerId !== undefined) {
    directory.selectedLearnerId = selectedLearnerId;
  }

  if (issues.length === 0) {
    return { status: 'ok', directory, issues: [] };
  }

  return {
    status: 'recovered',
    directory,
    issues,
    raw,
  };
}

/** Persist a validated directory document. Does not re-validate. */
export function persistLearnerDirectory(
  storage: StorageLike,
  directory: LearnerDirectoryDocument,
): void {
  const payload = normalizeLearnerDocument(directory);
  storage.setItem(LEARNER_DIRECTORY_STORAGE_KEY, JSON.stringify(payload));
}

export interface AddLearnerInput {
  displayName: string;
  /** Optional pre-assigned opaque id (tests / migration). Generated when omitted. */
  id?: string;
  workspaceRoots?: string[];
}

export function addLearner(
  directory: LearnerDirectoryDocument,
  input: AddLearnerInput,
): LearnerDirectoryMutationResult {
  const displayName = input.displayName.trim();
  if (displayName.length === 0) {
    return { ok: false, error: { code: 'invalid_display_name' } };
  }

  let id = input.id?.trim();
  if (id !== undefined && id.length === 0) {
    return { ok: false, error: { code: 'invalid_learner_id' } };
  }
  if (id !== undefined && directory.learners.some((l) => l.id === id)) {
    // Explicit id already present — refuse rather than clobber.
    return { ok: false, error: { code: 'duplicate_learner_id', learnerId: id } };
  }
  if (id === undefined) {
    id = generateLearnerId();
    while (directory.learners.some((l) => l.id === id)) {
      id = generateLearnerId();
    }
  }

  const roots: string[] = [];
  if (input.workspaceRoots) {
    for (const r of input.workspaceRoots) {
      const root = r.trim();
      if (root.length === 0) {
        return { ok: false, error: { code: 'invalid_workspace_root' } };
      }
      if (roots.includes(root)) {
        return { ok: false, error: { code: 'duplicate_workspace_root', root } };
      }
      const owner = findRootOwner(directory, root);
      if (owner !== undefined) {
        return {
          ok: false,
          error: { code: 'workspace_root_owned', root, ownerLearnerId: owner },
        };
      }
      roots.push(root);
    }
  }

  const next = cloneDirectory(directory);
  next.learners.push({
    id,
    displayName,
    workspaceRoots: roots,
  });
  return { ok: true, directory: next };
}

export function renameLearner(
  directory: LearnerDirectoryDocument,
  learnerId: string,
  displayName: string,
): LearnerDirectoryMutationResult {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: { code: 'invalid_display_name' } };
  }
  const index = directory.learners.findIndex((l) => l.id === learnerId);
  if (index < 0) {
    return { ok: false, error: { code: 'learner_not_found', learnerId } };
  }
  const next = cloneDirectory(directory);
  next.learners[index] = {
    ...next.learners[index]!,
    displayName: trimmed,
  };
  return { ok: true, directory: next };
}

export function selectLearner(
  directory: LearnerDirectoryDocument,
  learnerId: string | null,
): LearnerDirectoryMutationResult {
  const next = cloneDirectory(directory);
  if (learnerId === null) {
    delete next.selectedLearnerId;
    return { ok: true, directory: next };
  }
  if (!directory.learners.some((l) => l.id === learnerId)) {
    return { ok: false, error: { code: 'learner_not_found', learnerId } };
  }
  next.selectedLearnerId = learnerId;
  return { ok: true, directory: next };
}

/**
 * Remove a learner entry from the local directory only.
 * Never deletes a workspace, session, or Teach file.
 */
export function removeLearner(
  directory: LearnerDirectoryDocument,
  learnerId: string,
): LearnerDirectoryMutationResult {
  if (!directory.learners.some((l) => l.id === learnerId)) {
    return { ok: false, error: { code: 'learner_not_found', learnerId } };
  }
  const next = cloneDirectory(directory);
  next.learners = next.learners.filter((l) => l.id !== learnerId);
  if (next.selectedLearnerId === learnerId) {
    delete next.selectedLearnerId;
  }
  return { ok: true, directory: next };
}

function findRootOwner(
  directory: LearnerDirectoryDocument,
  root: string,
): string | undefined {
  for (const l of directory.learners) {
    if (l.workspaceRoots.includes(root)) return l.id;
  }
  return undefined;
}

export function attachWorkspaceRoot(
  directory: LearnerDirectoryDocument,
  learnerId: string,
  workspaceRoot: string,
): LearnerDirectoryMutationResult {
  const root = workspaceRoot.trim();
  if (root.length === 0) {
    return { ok: false, error: { code: 'invalid_workspace_root' } };
  }
  const index = directory.learners.findIndex((l) => l.id === learnerId);
  if (index < 0) {
    return { ok: false, error: { code: 'learner_not_found', learnerId } };
  }
  const learner = directory.learners[index]!;
  if (learner.workspaceRoots.includes(root)) {
    return { ok: false, error: { code: 'duplicate_workspace_root', root } };
  }
  const owner = findRootOwner(directory, root);
  if (owner !== undefined && owner !== learnerId) {
    return {
      ok: false,
      error: { code: 'workspace_root_owned', root, ownerLearnerId: owner },
    };
  }

  const next = cloneDirectory(directory);
  next.learners[index] = {
    ...next.learners[index]!,
    workspaceRoots: [...next.learners[index]!.workspaceRoots, root],
  };
  return { ok: true, directory: next };
}

/**
 * Detach a workspace root from the learner directory entry only.
 * Never deletes the workspace or any Teach file on disk.
 */
export function detachWorkspaceRoot(
  directory: LearnerDirectoryDocument,
  learnerId: string,
  workspaceRoot: string,
): LearnerDirectoryMutationResult {
  const root = workspaceRoot.trim();
  if (root.length === 0) {
    return { ok: false, error: { code: 'invalid_workspace_root' } };
  }
  const index = directory.learners.findIndex((l) => l.id === learnerId);
  if (index < 0) {
    return { ok: false, error: { code: 'learner_not_found', learnerId } };
  }
  const learner = directory.learners[index]!;
  if (!learner.workspaceRoots.includes(root)) {
    return { ok: false, error: { code: 'root_not_attached', root } };
  }

  const next = cloneDirectory(directory);
  const roots = next.learners[index]!.workspaceRoots.filter((r) => r !== root);
  const updated: LocalLearner = {
    id: next.learners[index]!.id,
    displayName: next.learners[index]!.displayName,
    workspaceRoots: roots,
  };
  if (
    next.learners[index]!.lastWorkspaceRoot !== undefined &&
    next.learners[index]!.lastWorkspaceRoot !== root
  ) {
    updated.lastWorkspaceRoot = next.learners[index]!.lastWorkspaceRoot;
  }
  next.learners[index] = updated;
  return { ok: true, directory: next };
}

export function rememberLastWorkspaceRoot(
  directory: LearnerDirectoryDocument,
  learnerId: string,
  workspaceRoot: string,
): LearnerDirectoryMutationResult {
  const root = workspaceRoot.trim();
  if (root.length === 0) {
    return { ok: false, error: { code: 'invalid_workspace_root' } };
  }
  const index = directory.learners.findIndex((l) => l.id === learnerId);
  if (index < 0) {
    return { ok: false, error: { code: 'learner_not_found', learnerId } };
  }
  if (!directory.learners[index]!.workspaceRoots.includes(root)) {
    return { ok: false, error: { code: 'last_root_not_attached', root } };
  }
  const next = cloneDirectory(directory);
  next.learners[index] = {
    ...next.learners[index]!,
    lastWorkspaceRoot: root,
  };
  return { ok: true, directory: next };
}

/**
 * Pure helper: match a persisted workspace root string to a current workspace
 * by `root` only. No match → unavailable. Never falls back to the first workspace.
 * Never matches daemon workspace ids.
 */
export function reconcileWorkspaceRoot<TWorkspace extends { root: string }>(
  persistedRoot: string,
  workspaces: readonly TWorkspace[],
): WorkspaceRootReconciliation<TWorkspace> {
  const root = persistedRoot;
  for (const ws of workspaces) {
    if (ws.root === root) {
      return { status: 'matched', root, workspace: ws };
    }
  }
  return { status: 'unavailable', root };
}
