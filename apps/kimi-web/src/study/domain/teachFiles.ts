/**
 * Parsing helpers for teach-skill workspace files (MISSION.md,
 * source/TEACHING-MAP.md, lessons/*.html). Pure module — no DOM, network,
 * or Vue dependencies — so the Coursebox-style screens can derive honest
 * progress states from workspace files and unit tests can pin the parsing.
 */

/** Root directory that holds every Kimi Study course workspace. */
// Resolved at runtime via VITE_STUDY_WORKSPACE_ROOT env var.
export function resolveStudyWorkspaceRoot(override?: string): string {
  const configured = override ?? (typeof import.meta !== "undefined" ? (import.meta as any).env?.VITE_STUDY_WORKSPACE_ROOT : undefined);
  if (typeof configured !== "string" || configured.trim().length === 0) return "";
  return configured.trim().replace(/\/+$/, "");
}

/**
 * True when `cwd` is a course directory directly under the study root
 * (the root itself is the launcher workspace, not a course).
 */
export function isStudyCourseCwd(cwd: string | undefined, workspaceRoot?: string): boolean {
  if (cwd === undefined || cwd.length === 0) return false;
  const root = workspaceRoot ?? resolveStudyWorkspaceRoot();
  if (!root) return false;
  const prefix = `${root}/`;
  if (!cwd.startsWith(prefix)) return false;
  const rest = cwd.slice(prefix.length);
  return rest.length > 0 && !rest.includes('/');
}

/**
 * Filesystem-safe directory name for a new course, derived from the topic.
 * Non-ASCII topics (e.g. Chinese) carry no safe slug characters, so they
 * fall back to a plain `course` — the caller retries with numeric suffixes
 * when the directory already exists.
 */
export function courseDirName(topic: string): string {
  const slug = topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug.length > 0 ? slug : 'course';
}

/** Status values the teach skill writes into TEACHING-MAP.md `## Control`. */
export type TeachingMapStatus = 'draft' | 'ready for confirmation' | 'confirmed' | 'stale';

/** One row of the TEACHING-MAP.md `## Learning path` table. */
export interface TeachingMapRow {
  readonly sequence: string;
  readonly sliceId: string;
  readonly capability: string;
  readonly sources: string;
  readonly prerequisites: string;
  readonly evidence: string;
}

/** Lessons grouped under a chapter id (the slice-id prefix before `.`). */
export interface TeachingMapChapter {
  readonly id: string;
  readonly lessons: readonly TeachingMapRow[];
}

export interface TeachingMapOutline {
  readonly status: TeachingMapStatus | 'unknown';
  readonly blueprintRevision: string;
  readonly rows: readonly TeachingMapRow[];
  readonly chapters: readonly TeachingMapChapter[];
  readonly lessonCount: number;
}

function parseControlField(markdown: string, field: string): string | undefined {
  const match = markdown.match(new RegExp(`^-\\s*${field}:\\s*(.+?)\\s*$`, 'mi'));
  return match?.[1];
}

function parseStatus(raw: string | undefined): TeachingMapStatus | 'unknown' {
  const value = raw?.trim().toLowerCase();
  if (
    value === 'draft' ||
    value === 'ready for confirmation' ||
    value === 'confirmed' ||
    value === 'stale'
  ) {
    return value;
  }
  return 'unknown';
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** Parse `source/TEACHING-MAP.md` into an outline. Tolerates partial files. */
export function parseTeachingMap(markdown: string): TeachingMapOutline {
  const status = parseStatus(parseControlField(markdown, 'Status'));
  const blueprintRevision = parseControlField(markdown, 'Blueprint revision') ?? '';

  const rows: TeachingMapRow[] = [];
  const lines = markdown.split('\n');
  let inLearningPath = false;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      inLearningPath = /^learning path$/i.test(heading[1] ?? '');
      continue;
    }
    if (!inLearningPath || !line.trim().startsWith('|')) continue;
    const cells = splitTableRow(line);
    if (cells.length < 3) continue;
    // Skip the header row and the `|---|` separator row.
    if (/^sequence$/i.test(cells[0] ?? '')) continue;
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    rows.push({
      sequence: cells[0] ?? '',
      sliceId: cells[1] ?? '',
      capability: cells[2] ?? '',
      sources: cells[3] ?? '',
      prerequisites: cells[4] ?? '',
      evidence: cells[5] ?? '',
    });
  }

  const chapters: TeachingMapChapter[] = [];
  for (const row of rows) {
    const dot = row.sliceId.indexOf('.');
    const chapterId = dot > 0 ? row.sliceId.slice(0, dot) : row.sliceId || row.sequence;
    const last = chapters[chapters.length - 1];
    if (last !== undefined && last.id === chapterId) {
      (last.lessons as TeachingMapRow[]).push(row);
    } else {
      chapters.push({ id: chapterId, lessons: [row] });
    }
  }

  return { status, blueprintRevision, rows, chapters, lessonCount: rows.length };
}

/** First `# ` heading of MISSION.md, if present. */
export function parseMissionTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+?)\s*$/m);
  return match?.[1];
}

/**
 * Honest generation stages shown in the generator screen. Derived only from
 * which workspace files exist plus the map status — never from timers.
 */
export type CourseStage =
  /** No MISSION.md yet — the mission interview is happening in chat. */
  | 'interview'
  /** MISSION.md exists, no TEACHING-MAP.md — reading sources / building the blueprint. */
  | 'reading'
  /** TEACHING-MAP.md exists but is not confirmed — outline awaiting user confirmation. */
  | 'outline'
  /** Map confirmed, no lessons published yet — ready to generate lessons. */
  | 'ready'
  /** At least one lesson HTML exists. */
  | 'learning'
  /** Map marked stale — outline must be rebuilt before generating. */
  | 'stale';

export function deriveCourseStage(input: {
  hasMission: boolean;
  mapStatus: TeachingMapStatus | 'unknown' | null;
  lessonCount: number;
}): CourseStage {
  if (input.mapStatus === 'stale') return 'stale';
  if (input.lessonCount > 0) return 'learning';
  if (input.mapStatus === 'confirmed') return 'ready';
  if (input.mapStatus !== null) return 'outline';
  if (input.hasMission) return 'reading';
  return 'interview';
}

/**
 * Sort lesson file names (`NNNN-dash-case-name.html`) by their numeric
 * prefix; files without one sort last, alphabetically.
 */
export function sortLessonFiles(names: readonly string[]): string[] {
  return [...names].sort((a, b) => {
    const na = /^(\d+)/.exec(a)?.[1];
    const nb = /^(\d+)/.exec(b)?.[1];
    if (na !== undefined && nb !== undefined) return Number(na) - Number(nb);
    if (na !== undefined) return -1;
    if (nb !== undefined) return 1;
    return a.localeCompare(b);
  });
}

/** Human-readable lesson title from its file name. */
export function lessonTitleFromFile(name: string): string {
  return name
    .replace(/\.html$/i, '')
    .replace(/^\d+-?/, '')
    .replace(/-/g, ' ');
}

// ---------------------------------------------------------------------------
// Reading-gate progress (source/BOOK-READING-STATE.md)
// ---------------------------------------------------------------------------

/** Honest reading-gate progress parsed from BOOK-READING-STATE.md. */
export interface ReadingProgress {
  /** Coverage percent exactly as written in `## Gate` (0-100), null if absent. */
  readonly coverage: number | null;
  /** Ledger rows marked read. */
  readonly readRanges: number;
  /** Ledger rows total (read + unread + blocked). */
  readonly totalRanges: number;
  /** First ledger range still unread — what the tutor is reading now. */
  readonly currentRange: string;
  /** Book title from `## Source`, empty when unknown. */
  readonly bookTitle: string;
}

/**
 * Parse `source/BOOK-READING-STATE.md`. Trusts the `Coverage` field first,
 * falls back to counting ledger rows; never invents numbers.
 */
export function parseReadingState(markdown: string): ReadingProgress {
  let coverage: number | null = null;
  const coverageMatch = markdown.match(/^-\s*Coverage:\s*(\d{1,3})\s*%/im);
  if (coverageMatch?.[1] !== undefined) {
    coverage = Math.min(100, Math.max(0, Number(coverageMatch[1])));
  }

  let bookTitle = '';
  const titleMatch = markdown.match(/^-\s*Title:\s*(.+?)\s*$/im);
  if (titleMatch?.[1] !== undefined) bookTitle = titleMatch[1];

  let readRanges = 0;
  let totalRanges = 0;
  let currentRange = '';
  let inLedger = false;
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      inLedger = /^reading ledger$/i.test(heading[1] ?? '');
      continue;
    }
    if (!inLedger || !line.trim().startsWith('|')) continue;
    const cells = splitTableRow(line);
    if (cells.length < 3) continue;
    if (/^range$/i.test(cells[0] ?? '')) continue;
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    const status = (cells[2] ?? '').trim().toLowerCase();
    if (status !== 'read' && status !== 'unread' && status !== 'blocked') continue;
    totalRanges += 1;
    if (status === 'read') {
      readRanges += 1;
    } else if (currentRange === '' && status === 'unread') {
      currentRange = cells[0] ?? '';
    }
  }

  if (coverage === null && totalRanges > 0) {
    coverage = Math.round((readRanges / totalRanges) * 100);
  }

  return { coverage, readRanges, totalRanges, currentRange, bookTitle };
}

// ---------------------------------------------------------------------------
// Lesson briefs (source/lesson-briefs/NNNN-*.md)
// ---------------------------------------------------------------------------

/** The bits of a lesson brief the learner view needs. */
export interface LessonBriefInfo {
  /** First paragraph of `## Primary capability slice`, trimmed. */
  readonly capability: string;
  /** `Status` from `## Control` (draft/ready/published/stale), '' if absent. */
  readonly status: string;
}

/** Parse one `source/lesson-briefs/*.md` file. Tolerates partial files. */
export function parseLessonBrief(markdown: string): LessonBriefInfo {
  const status = parseControlField(markdown, 'Status')?.trim().toLowerCase() ?? '';
  const section = markdown.match(/^##\s+Primary capability slice\s*\n+([\s\S]*?)(?:\n##\s|$)/im);
  const capability = (section?.[1] ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(' ')
    .trim();
  return { capability, status };
}

// ---------------------------------------------------------------------------
// Review queue (NOTES.md, lenient)
// ---------------------------------------------------------------------------

/**
 * NOTES.md is freeform (the teach skill does not pin a review-queue format),
 * so this stays deliberately lenient: a review item is any line mentioning
 * 复习/review that also carries an ISO date; it is due when the date is today
 * or in the past. No dates → not due (never invent urgency).
 */
export function parseReviewDue(notesMarkdown: string, today: Date = new Date()): boolean {
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  for (const line of notesMarkdown.split('\n')) {
    if (!/复习|review/i.test(line)) continue;
    for (const match of line.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) {
      const dateStr = match[1];
      if (dateStr !== undefined && dateStr <= todayStr) return true;
    }
  }
  return false;
}
