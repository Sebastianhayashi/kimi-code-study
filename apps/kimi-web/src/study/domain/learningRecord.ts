/**
 * Read-only pure parser + supersession resolver for fixed Teach Learning Records.
 *
 * Format source: specs/private/teach/LEARNING-RECORD-FORMAT.md
 * (path / raw text in; no I/O, no mastery inference from filename/activity/mtime.)
 */

export interface LearningRecordSource {
  path: string;
  rawText: string;
}

export type LearningRecordParseStatus = 'valid' | 'partial' | 'malformed';

export type LearningRecordEvidenceKind =
  | 'demonstrated'
  | 'self_report'
  | 'insufficient'
  | 'unspecified';

export interface LearningRecordEvidence {
  kind: LearningRecordEvidenceKind;
  raw: string | null;
}

export type LearningRecordLifecycle =
  | { kind: 'active' }
  | { kind: 'superseded'; successorId: string }
  | { kind: 'unknown' };

export interface ParsedLearningRecord {
  source: LearningRecordSource;
  parseStatus: LearningRecordParseStatus;
  id: string | null;
  title: string | null;
  body: string | null;
  evidence: LearningRecordEvidence;
  implications: string | null;
  lifecycle: LearningRecordLifecycle;
  issues: string[];
}

export type LearningRecordUnresolvedReason =
  | 'missing_target'
  | 'duplicate_identity'
  | 'self_cycle'
  | 'cycle'
  | 'malformed_successor';

export interface LearningRecordUnresolved {
  reason: LearningRecordUnresolvedReason;
  recordIds: string[];
}

export interface LearningRecordResolution {
  /** Every input record, in input order (history is never deleted). */
  records: ParsedLearningRecord[];
  /** Valid, non-duplicate records that are not successfully superseded. */
  currentSummary: ParsedLearningRecord[];
  unresolved: LearningRecordUnresolved[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const H1_RE = /^#\s+(.+?)\s*$/m;
const SECTION_RE = /^##\s+(Evidence|Implications)\s*$/gim;
/** Status is Teach frontmatter-only; body Status lines never drive lifecycle. */
const STATUS_LINE_RE = /^Status:\s*(.+?)\s*$/im;
const SUPERSEDED_RE = /^superseded\s+by\s+(LR-\d{4})\s*$/i;
const ACTIVE_STATUS_RE = /^active\s*$/i;
/**
 * Exact fixed Teach identity path (case-sensitive):
 * learning-records/NNNN-<dash-case-name>.md
 * where dash-case is lowercase ASCII alphanumerics separated by single hyphens.
 */
const ID_FROM_PATH_RE = /^learning-records\/(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const LR_ID_RE = /^LR-\d{4}$/;

/** Documented conservative markers — not general natural-language understanding. */
const NEGATED_DEMONSTRATION_RE =
  /\b(?:not demonstrated|did not demonstrate|never demonstrated|without demonstrating)\b/i;
const POSITIVE_DEMONSTRATED_RE = /\bdemonstrated\b/i;
const SELF_REPORT_RE = /\bself[-\s]?report\b/i;
const PRIOR_KNOWLEDGE_RE = /\balready know\b/i;
const ACTIVITY_ONLY_RE = /\b(?:viewed|practiced|covered|read)\b/i;

function identityFromPath(path: string): string | null {
  const m = path.match(ID_FROM_PATH_RE);
  if (!m) return null;
  return `LR-${m[1]}`;
}

function stripFrontmatter(rawText: string): { body: string; frontmatter: string | null } {
  // Require a closed frontmatter fence; unterminated --- blocks are not Status.
  const m = rawText.match(FRONTMATTER_RE);
  if (!m) return { body: rawText, frontmatter: null };
  return { body: rawText.slice(m[0].length), frontmatter: m[1] ?? null };
}

function readStatusValueFromFrontmatter(frontmatter: string | null): string | null {
  if (!frontmatter) return null;
  const fm = frontmatter.match(STATUS_LINE_RE);
  if (fm?.[1]) return fm[1].trim();
  return null;
}

function parseLifecycle(statusValue: string | null): {
  lifecycle: LearningRecordLifecycle;
  statusIssue: string | null;
} {
  // No Status field → treated as active (Teach default).
  if (statusValue === null) {
    return { lifecycle: { kind: 'active' }, statusIssue: null };
  }
  if (ACTIVE_STATUS_RE.test(statusValue)) {
    return { lifecycle: { kind: 'active' }, statusIssue: null };
  }
  const superseded = statusValue.match(SUPERSEDED_RE);
  if (superseded?.[1] && LR_ID_RE.test(superseded[1])) {
    return {
      lifecycle: { kind: 'superseded', successorId: superseded[1]!.toUpperCase() },
      statusIssue: null,
    };
  }
  return {
    lifecycle: { kind: 'unknown' },
    statusIssue: `Unparseable Status: ${statusValue}`,
  };
}

interface SectionMap {
  evidence: string | null;
  implications: string | null;
  /** Prose between H1 and the first optional section. */
  body: string | null;
}

function extractSections(content: string): SectionMap {
  const h1 = content.match(H1_RE);
  if (!h1 || h1.index === undefined) {
    return { evidence: null, implications: null, body: null };
  }

  const afterTitleStart = h1.index + h1[0].length;

  const sectionStarts: Array<{ name: 'evidence' | 'implications'; index: number; headerLen: number }> =
    [];
  SECTION_RE.lastIndex = 0;
  let sm: RegExpExecArray | null;
  while ((sm = SECTION_RE.exec(content)) !== null) {
    const name = sm[1]!.toLowerCase() as 'evidence' | 'implications';
    sectionStarts.push({ name, index: sm.index, headerLen: sm[0].length });
  }

  // Only sections that appear after the H1.
  const sectionsAfterTitle = sectionStarts.filter(s => s.index >= afterTitleStart);

  let bodyEnd = content.length;
  if (sectionsAfterTitle.length > 0) {
    bodyEnd = sectionsAfterTitle[0]!.index;
  }
  const bodyRaw = content.slice(afterTitleStart, bodyEnd).trim();
  const body = bodyRaw.length > 0 ? bodyRaw : null;

  let evidence: string | null = null;
  let implications: string | null = null;

  for (let i = 0; i < sectionsAfterTitle.length; i++) {
    const sec = sectionsAfterTitle[i]!;
    const contentStart = sec.index + sec.headerLen;
    const contentEnd =
      i + 1 < sectionsAfterTitle.length ? sectionsAfterTitle[i + 1]!.index : content.length;
    const text = content.slice(contentStart, contentEnd).trim();
    if (sec.name === 'evidence') evidence = text.length > 0 ? text : null;
    if (sec.name === 'implications') implications = text.length > 0 ? text : null;
  }

  return { evidence, implications, body };
}

function classifyEvidence(raw: string | null): LearningRecordEvidence {
  if (raw === null) {
    return { kind: 'unspecified', raw: null };
  }

  // Negated demonstration markers win over bare "demonstrated".
  if (NEGATED_DEMONSTRATION_RE.test(raw)) {
    return { kind: 'insufficient', raw };
  }
  if (POSITIVE_DEMONSTRATED_RE.test(raw)) {
    return { kind: 'demonstrated', raw };
  }
  if (SELF_REPORT_RE.test(raw) || PRIOR_KNOWLEDGE_RE.test(raw)) {
    return { kind: 'self_report', raw };
  }
  // Activity-only wording (viewed / practiced / covered / read, including "only …")
  // never upgrades evidence. This is marker-based, not general NL proof.
  if (ACTIVITY_ONLY_RE.test(raw)) {
    return { kind: 'insufficient', raw };
  }

  // Any other Evidence wording without positive demonstration / self-report is insufficient.
  return { kind: 'insufficient', raw };
}

function computeParseStatus(input: {
  title: string | null;
  body: string | null;
  evidence: LearningRecordEvidence;
  statusIssue: string | null;
  identityIssue: string | null;
}): { parseStatus: LearningRecordParseStatus; issues: string[] } {
  const issues: string[] = [];

  if (input.title === null) {
    if (input.identityIssue) issues.push(input.identityIssue);
    issues.push('Missing title heading');
    if (input.statusIssue) issues.push(input.statusIssue);
    return { parseStatus: 'malformed', issues };
  }

  if (input.identityIssue) issues.push(input.identityIssue);
  if (input.statusIssue) issues.push(input.statusIssue);

  // Minimum structural rule only: non-empty body after the title.
  // Does not validate sentence count, semantic quality, or future-session significance.
  if (input.body === null) {
    issues.push('Title exists but body is missing');
  }

  if (issues.length > 0) {
    return { parseStatus: 'partial', issues };
  }

  return { parseStatus: 'valid', issues };
}

/**
 * Parse a single Learning Record source. Pure: no I/O, no mutation of input.
 */
export function parseLearningRecord(source: LearningRecordSource): ParsedLearningRecord {
  const rawText = source.rawText;
  const id = identityFromPath(source.path);
  const identityIssue = id === null ? 'Missing/invalid learning record identity from path' : null;

  if (rawText.trim().length === 0) {
    const issues = ['Empty record'];
    if (identityIssue) issues.unshift(identityIssue);
    return {
      source: { path: source.path, rawText },
      parseStatus: 'malformed',
      id,
      title: null,
      body: null,
      evidence: { kind: 'unspecified', raw: null },
      implications: null,
      lifecycle: { kind: 'active' },
      issues,
    };
  }

  const { body: contentAfterFm, frontmatter } = stripFrontmatter(rawText);
  const statusValue = readStatusValueFromFrontmatter(frontmatter);
  const { lifecycle, statusIssue } = parseLifecycle(statusValue);

  const h1 = contentAfterFm.match(H1_RE);
  if (!h1) {
    const issues = ['Missing title heading', ...(statusIssue ? [statusIssue] : [])];
    if (identityIssue) issues.unshift(identityIssue);
    return {
      source: { path: source.path, rawText },
      parseStatus: 'malformed',
      id,
      title: null,
      body: null,
      evidence: { kind: 'unspecified', raw: null },
      implications: null,
      lifecycle: statusIssue ? { kind: 'unknown' } : lifecycle,
      issues,
    };
  }

  const title = h1[1]!.trim();
  const sections = extractSections(contentAfterFm);
  const evidence = classifyEvidence(sections.evidence);
  const { parseStatus, issues } = computeParseStatus({
    title,
    body: sections.body,
    evidence,
    statusIssue,
    identityIssue,
  });

  return {
    source: { path: source.path, rawText },
    parseStatus,
    id,
    title,
    body: sections.body,
    evidence,
    implications: sections.implications,
    lifecycle,
    issues,
  };
}

function groupById(records: ParsedLearningRecord[]): Map<string, ParsedLearningRecord[]> {
  const map = new Map<string, ParsedLearningRecord[]>();
  for (const record of records) {
    if (!record.id) continue;
    const list = map.get(record.id);
    if (list) list.push(record);
    else map.set(record.id, [record]);
  }
  return map;
}

function pushUnresolved(
  unresolved: LearningRecordUnresolved[],
  reason: LearningRecordUnresolvedReason,
  recordIds: string[],
): void {
  const key = `${reason}:${[...recordIds].sort().join(',')}`;
  if (unresolved.some(u => `${u.reason}:${[...u.recordIds].sort().join(',')}` === key)) {
    return;
  }
  unresolved.push({ reason, recordIds: [...recordIds] });
}

/**
 * Walk an explicit supersession chain.
 * Returns true only when a complete acyclic path reaches a valid non-superseded successor.
 * Side-effect: records diagnosable unresolved reasons.
 */
function chainSuccessfullyReplaces(
  start: ParsedLearningRecord,
  byId: Map<string, ParsedLearningRecord[]>,
  unresolved: LearningRecordUnresolved[],
): boolean {
  if (start.lifecycle.kind !== 'superseded' || !start.id) return false;
  if (start.parseStatus !== 'valid') return false;

  const path: string[] = [];
  let current: ParsedLearningRecord = start;

  while (current.lifecycle.kind === 'superseded') {
    const currentId = current.id;
    if (!currentId) return false;

    const successorId = current.lifecycle.successorId;

    if (successorId === currentId) {
      pushUnresolved(unresolved, 'self_cycle', [currentId]);
      return false;
    }

    if (path.includes(currentId)) {
      // Multi-node cycle: from the first occurrence of currentId through path.
      const cycleStart = path.indexOf(currentId);
      const cycleIds = path.slice(cycleStart);
      pushUnresolved(unresolved, 'cycle', cycleIds);
      return false;
    }
    path.push(currentId);

    // Detect cycle via successor already on the path (A→B→C→A).
    if (path.includes(successorId)) {
      const cycleStart = path.indexOf(successorId);
      const cycleIds = [...path.slice(cycleStart), successorId];
      // Unique preserve order
      const unique: string[] = [];
      for (const id of cycleIds) {
        if (!unique.includes(id)) unique.push(id);
      }
      pushUnresolved(unresolved, 'cycle', unique);
      return false;
    }

    const candidates = byId.get(successorId);
    if (!candidates || candidates.length === 0) {
      pushUnresolved(unresolved, 'missing_target', [currentId]);
      return false;
    }
    if (candidates.length > 1) {
      // Duplicate identity already reported separately; chain cannot resolve.
      return false;
    }

    const successor = candidates[0]!;
    if (successor.parseStatus !== 'valid') {
      pushUnresolved(
        unresolved,
        'malformed_successor',
        [currentId, successor.id].filter((x): x is string => Boolean(x)),
      );
      return false;
    }

    current = successor;
  }

  // Landed on a valid record that is not superseded (active / unknown without chain).
  return current.parseStatus === 'valid';
}

/**
 * Resolve a set of Learning Record sources.
 * History is always returned; currentSummary excludes only records whose
 * supersession chain fully resolves to a valid successor.
 */
export function resolveLearningRecords(sources: LearningRecordSource[]): LearningRecordResolution {
  const records = sources.map(parseLearningRecord);
  const byId = groupById(records);
  const unresolved: LearningRecordUnresolved[] = [];

  for (const [id, group] of byId) {
    if (group.length > 1) {
      pushUnresolved(unresolved, 'duplicate_identity', [id]);
    }
  }

  const duplicateIds = new Set<string>();
  for (const [id, group] of byId) {
    if (group.length > 1) duplicateIds.add(id);
  }

  // Evaluate supersession for every valid unique record (diagnoses unresolved chains).
  const successfullySuperseded = new Set<ParsedLearningRecord>();
  for (const record of records) {
    if (record.parseStatus !== 'valid' || !record.id) continue;
    if (duplicateIds.has(record.id)) continue;
    if (record.lifecycle.kind !== 'superseded') continue;
    if (chainSuccessfullyReplaces(record, byId, unresolved)) {
      successfullySuperseded.add(record);
    }
  }

  const currentSummary: ParsedLearningRecord[] = [];
  for (const record of records) {
    if (record.parseStatus !== 'valid') continue;
    if (record.id && duplicateIds.has(record.id)) continue;
    if (successfullySuperseded.has(record)) continue;
    currentSummary.push(record);
  }

  return { records, currentSummary, unresolved };
}
