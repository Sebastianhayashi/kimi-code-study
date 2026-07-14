// Pure parser/serializer for the Kimi Study-owned review queue block in NOTES.md.
// Product convention only — not an upstream Teach format. No I/O, no scheduling.

export const REVIEW_QUEUE_HEADING = '## Review queue';
export const REVIEW_QUEUE_FENCE_INFO = 'kimi-study-review-queue-v1';
export const REVIEW_QUEUE_VERSION = 1 as const;

export type ReviewItemStatus = 'scheduled' | 'completed' | 'cancelled';

export interface ReviewQueueItem {
  id: string;
  sourcePath: string;
  prompt: string;
  /** Local calendar date only: YYYY-MM-DD. Timezone-to-instant is out of scope. */
  dueOn: string;
  status: ReviewItemStatus;
  /** Unknown item-level fields preserved for round-trip. */
  unknownFields: Record<string, unknown>;
}

export interface ReviewQueueData {
  version: typeof REVIEW_QUEUE_VERSION;
  items: ReviewQueueItem[];
  /** Unknown top-level fields preserved for round-trip (excludes version/items). */
  unknownFields: Record<string, unknown>;
}

export type ParseReviewQueueResult =
  | { status: 'missing' }
  | { status: 'ok'; data: ReviewQueueData }
  | { status: 'malformed'; reason: string }
  | {
      status: 'partial';
      reason: string;
      validItems: ReviewQueueItem[];
      diagnostics: string[];
    };

export type SerializeReviewQueueResult =
  | { ok: true; markdown: string }
  | { ok: false; reason: string };

export interface SerializeReviewQueueOptions {
  /** When the owned block is missing, append it once instead of refusing. */
  appendIfMissing?: boolean;
}

const ITEM_STATUSES = new Set<ReviewItemStatus>(['scheduled', 'completed', 'cancelled']);
const ITEM_KNOWN_KEYS = new Set(['id', 'sourcePath', 'prompt', 'dueOn', 'status']);
const TOP_KNOWN_KEYS = new Set(['version', 'items']);

const HEADING_LINE_RE = /^## Review queue[ \t]*$/;
const OWNED_OPEN_FENCE_RE = /^```kimi-study-review-queue-v1[ \t]*$/;
/** Closing fence: exactly three backticks, optional spaces/tabs only. Column 0 only. */
const OWNED_CLOSE_FENCE_RE = /^```[ \t]*$/;
/**
 * Generic CommonMark fenced-code open line: optional 0–3 leading spaces, then
 * a run of ≥3 backticks or tildes, then an optional info string. 4+ spaces is
 * an indented code block, not a fence. Owned product fences stay column-0 only.
 */
const GENERIC_FENCE_RE = /^(?<indent> {0,3})(?<ticks>`{3,}|~{3,})(?<info>.*)$/;
/** Generic CommonMark fence close: 0–3 leading spaces, matching marker, ≥ open length. */
const GENERIC_CLOSE_FENCE_RE = /^(?<indent> {0,3})(?<ticks>`{3,}|~{3,})[ \t]*$/;
interface LineInfo {
  /** Start index of the line content in the original markdown. */
  start: number;
  /** End index exclusive of line content (before ending). */
  contentEnd: number;
  /** End index exclusive including line ending. */
  end: number;
  content: string;
  ending: string;
}

interface OwnedBlockMatch {
  start: number;
  end: number;
  body: string;
  /** The whitespace/newline characters (if any) after the closing fence. */
  trailing: string;
}

interface ScanResult {
  complete: OwnedBlockMatch[];
  /** True when a recognizable owned start exists outside enclosing fences without a valid close. */
  hasPartial: boolean;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate a workspace-relative source path. Rejects blank, absolute,
 * backslash-rooted/Windows drive, `.`/`..` traversal segments and NUL/control
 * characters. Preserves legitimate Unicode names and nested relative paths.
 * Pure function; no I/O.
 */
export function isValidWorkspaceRelativeSourcePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0) return false;
  // Reject leading/trailing whitespace (covers whitespace-only paths).
  if (value.trim() !== value) return false;
  // Absolute Unix path.
  if (value.startsWith('/')) return false;
  // Backslash-rooted (Windows rooted or UNC).
  if (value.startsWith('\\')) return false;
  // Windows drive letter, e.g. C: or C:\.
  if (/^[A-Za-z]:/.test(value)) return false;
  // NUL and control characters.
  if (/[\x00-\x1f\x7f]/.test(value)) return false;

  for (const segment of value.split(/[\\/]/)) {
    if (segment === '.' || segment === '..' || segment.length === 0) return false;
  }
  return true;
}

/** Calendar-date only (YYYY-MM-DD); rejects impossible dates like 2026-02-30. */
export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

/**
 * Build a dictionary that can hold hostile keys (`__proto__`, `constructor`,
 * `prototype`) as ordinary own data properties without prototype mutation.
 */
function createOwnBag(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

/** Assign `key` as an own enumerable data property (safe for `__proto__`). */
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function splitLines(markdown: string): LineInfo[] {
  const lines: LineInfo[] = [];
  let i = 0;
  while (i < markdown.length) {
    const start = i;
    while (i < markdown.length && markdown[i] !== '\n' && markdown[i] !== '\r') {
      i += 1;
    }
    const contentEnd = i;
    let ending = '';
    if (i < markdown.length) {
      if (markdown[i] === '\r' && markdown[i + 1] === '\n') {
        ending = '\r\n';
        i += 2;
      } else {
        ending = markdown[i]!;
        i += 1;
      }
    }
    lines.push({
      start,
      contentEnd,
      end: i,
      content: markdown.slice(start, contentEnd),
      ending,
    });
  }
  // Trailing empty line only when the source ends with a newline is already
  // represented by the final line's ending; no extra synthetic line needed.
  return lines;
}

function isBlankLine(content: string): boolean {
  return /^[ \t]*$/.test(content);
}

interface FenceState {
  marker: '`' | '~';
  length: number;
}

function matchGenericFence(content: string): { marker: '`' | '~'; length: number; info: string } | null {
  const m = GENERIC_FENCE_RE.exec(content);
  if (!m || !m.groups) return null;
  const ticks = m.groups['ticks'] ?? '';
  const marker = ticks[0] as '`' | '~';
  // Backtick fences cannot contain backticks in the info string (CommonMark).
  const info = m.groups['info'] ?? '';
  if (marker === '`' && info.includes('`')) return null;
  return { marker, length: ticks.length, info };
}

function isClosingFence(content: string, open: FenceState): boolean {
  const m = GENERIC_CLOSE_FENCE_RE.exec(content);
  if (!m || !m.groups) return false;
  const ticks = m.groups['ticks'] ?? '';
  if (ticks[0] !== open.marker) return false;
  return ticks.length >= open.length;
}

/**
 * Scan markdown for product-owned review-queue blocks that appear outside of
 * enclosing non-owned fenced code (tilde fences, longer backtick fences, etc.).
 * Enclosing fences follow CommonMark: open/close may be indented 0–3 spaces.
 */
function scanOwnedBlocks(markdown: string): ScanResult {
  const lines = splitLines(markdown);
  const complete: OwnedBlockMatch[] = [];
  let hasPartial = false;
  let fence: FenceState | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (fence !== null) {
      if (isClosingFence(line.content, fence)) {
        fence = null;
      }
      i += 1;
      continue;
    }

    // Outside any enclosing fence: look for an owned block start.
    if (HEADING_LINE_RE.test(line.content)) {
      const headingIndex = i;
      let j = i + 1;
      while (j < lines.length && isBlankLine(lines[j]!.content)) {
        j += 1;
      }
      if (j < lines.length && OWNED_OPEN_FENCE_RE.test(lines[j]!.content)) {
        // Recognizable owned start — try to find a strict closing fence.
        let k = j + 1;
        let closed = false;
        while (k < lines.length) {
          if (OWNED_CLOSE_FENCE_RE.test(lines[k]!.content)) {
            const headingLine = lines[headingIndex]!;
            const openLine = lines[j]!;
            const closeLine = lines[k]!;
            // Body is every byte after the open-fence line up to the close line.
            complete.push({
              start: headingLine.start,
              end: closeLine.end,
              body: markdown.slice(openLine.end, closeLine.start),
              trailing: closeLine.ending,
            });
            // Do not treat the owned fence as an enclosing generic fence.
            i = k + 1;
            closed = true;
            break;
          }
          // ```extra is not a valid close; keep scanning until a pure ``` or EOF.
          k += 1;
        }
        if (!closed) {
          hasPartial = true;
          // Advance past the open fence; later content may still hold another block.
          i = j + 1;
        }
        continue;
      }
      // Heading without owned open fence: fall through as ordinary text.
    }

    // Non-owned CommonMark fence open (0–3 leading spaces) — enter enclosing fence.
    const generic = matchGenericFence(line.content);
    if (generic !== null) {
      fence = { marker: generic.marker, length: generic.length };
      i += 1;
      continue;
    }

    i += 1;
  }

  return { complete, hasPartial };
}

function parseItem(
  raw: unknown,
  index: number,
): { ok: true; item: ReviewQueueItem } | { ok: false; diagnostic: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, diagnostic: `item[${index}]: expected an object` };
  }
  const obj = raw as Record<string, unknown>;
  const id = obj['id'];
  const sourcePath = obj['sourcePath'];
  const prompt = obj['prompt'];
  const dueOn = obj['dueOn'];
  const status = obj['status'];

  if (!isNonBlankString(id)) {
    return { ok: false, diagnostic: `item[${index}]: invalid id` };
  }
  if (!isValidWorkspaceRelativeSourcePath(sourcePath)) {
    return { ok: false, diagnostic: `item[${index}]: invalid sourcePath` };
  }
  if (!isNonBlankString(prompt)) {
    return { ok: false, diagnostic: `item[${index}]: invalid prompt` };
  }
  if (typeof dueOn !== 'string' || !isValidCalendarDate(dueOn)) {
    return { ok: false, diagnostic: `item[${index}]: invalid dueOn date` };
  }
  if (typeof status !== 'string' || !ITEM_STATUSES.has(status as ReviewItemStatus)) {
    return { ok: false, diagnostic: `item[${index}]: invalid status` };
  }

  const unknownFields = createOwnBag();
  for (const key of Reflect.ownKeys(obj)) {
    if (typeof key !== 'string') continue;
    if (!ITEM_KNOWN_KEYS.has(key)) setOwn(unknownFields, key, obj[key]);
  }

  return {
    ok: true,
    item: {
      id,
      sourcePath,
      prompt,
      dueOn,
      status: status as ReviewItemStatus,
      unknownFields,
    },
  };
}

function findDuplicateIds(items: unknown[]): string | undefined {
  const seen = new Set<string>();
  for (const raw of items) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const id = (raw as Record<string, unknown>)['id'];
    if (typeof id !== 'string') continue;
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return undefined;
}

function parseOwnedBody(body: string): ParseReviewQueueResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 'malformed', reason: 'invalid JSON in review queue block' };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'malformed', reason: 'review queue body must be a JSON object' };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj['version'] !== REVIEW_QUEUE_VERSION) {
    return { status: 'malformed', reason: `unsupported version: ${String(obj['version'])}` };
  }

  const itemsRaw = obj['items'];
  if (!Array.isArray(itemsRaw)) {
    return { status: 'malformed', reason: 'items must be an array' };
  }

  const duplicateId = findDuplicateIds(itemsRaw);
  if (duplicateId !== undefined) {
    return {
      status: 'malformed',
      reason: `duplicate item id: ${duplicateId}`,
    };
  }

  const validItems: ReviewQueueItem[] = [];
  const diagnostics: string[] = [];
  for (let i = 0; i < itemsRaw.length; i++) {
    const result = parseItem(itemsRaw[i], i);
    if (result.ok) validItems.push(result.item);
    else diagnostics.push(result.diagnostic);
  }

  if (diagnostics.length > 0) {
    if (validItems.length > 0) {
      return {
        status: 'partial',
        reason: 'some review queue items are invalid',
        validItems,
        diagnostics,
      };
    }
    return {
      status: 'malformed',
      reason: diagnostics[0] ?? 'invalid review queue items',
    };
  }

  const unknownFields = createOwnBag();
  for (const key of Reflect.ownKeys(obj)) {
    if (typeof key !== 'string') continue;
    if (!TOP_KNOWN_KEYS.has(key)) setOwn(unknownFields, key, obj[key]);
  }

  return {
    status: 'ok',
    data: {
      version: REVIEW_QUEUE_VERSION,
      items: validItems,
      unknownFields,
    },
  };
}

type JsonAssertResult = { ok: true } | { ok: false; reason: string };

/** True for canonical array index keys `"0"`, `"1"`, … below `length` (not `"01"`). */
function isCanonicalArrayIndexKey(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

/** Own data property only — never invokes getters/setters. */
function isOwnEnumerableDataProperty(
  desc: PropertyDescriptor | undefined,
): desc is PropertyDescriptor & { value: unknown } {
  return (
    desc !== undefined &&
    desc.enumerable === true &&
    !('get' in desc) &&
    !('set' in desc) &&
    'value' in desc
  );
}

function isOwnDataProperty(
  desc: PropertyDescriptor | undefined,
): desc is PropertyDescriptor & { value: unknown } {
  return (
    desc !== undefined && !('get' in desc) && !('set' in desc) && 'value' in desc
  );
}

/**
 * Verify `value` is an actual JSON value that round-trips through
 * JSON.stringify/parse without silent key drops or value rewrites.
 *
 * Uses iterative DFS with path-scoped cycle tracking (shared refs allowed;
 * true cycles refused). Reads only via property descriptors so accessors are
 * never invoked. Arrays must be dense JSON elements: own keys may only be
 * `length` and canonical index data properties `0..length-1`.
 *
 * Allowed: null, boolean, string, finite non-negative-zero number, arrays,
 * plain objects (Object.prototype or null prototype) with own enumerable
 * string data properties only.
 * Rejects undefined/function/symbol/bigint, NaN/±Infinity/-0, cycles, symbol or
 * non-enumerable keys, accessors, sparse holes, extra array own keys,
 * Date/Map/Set/RegExp/typed arrays/class instances, objects with toJSON, and
 * other non-plain objects.
 */
function assertJsonValue(value: unknown): JsonAssertResult {
  try {
    return assertJsonValueIterative(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `unexpected error while validating JSON value: ${message}`,
    };
  }
}

function assertJsonValueIterative(root: unknown): JsonAssertResult {
  // Path-scoped only: pop on exit so `{ a: shared, b: shared }` is not a cycle.
  const path = new Set<object>();
  type Frame =
    | { kind: 'enter'; value: unknown }
    | { kind: 'exit'; value: object };
  const stack: Frame[] = [{ kind: 'enter', value: root }];

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.kind === 'exit') {
      path.delete(frame.value);
      continue;
    }

    const value = frame.value;
    if (value === null) continue;

    const valueType = typeof value;
    if (valueType === 'boolean' || valueType === 'string') continue;
    if (valueType === 'number') {
      if (!Number.isFinite(value)) {
        return { ok: false, reason: 'non-finite number is not a JSON value' };
      }
      // JSON.stringify(-0) emits "0", so -0 is not a stable JSON number.
      if (Object.is(value, -0)) {
        return { ok: false, reason: '-0 is not a stable JSON number' };
      }
      continue;
    }
    if (
      valueType === 'undefined' ||
      valueType === 'function' ||
      valueType === 'symbol' ||
      valueType === 'bigint'
    ) {
      return { ok: false, reason: `${valueType} is not a JSON value` };
    }
    if (valueType !== 'object') {
      return { ok: false, reason: 'value is not a JSON value' };
    }

    const obj = value as object;
    if (path.has(obj)) {
      return { ok: false, reason: 'circular reference is not a JSON value' };
    }
    path.add(obj);
    stack.push({ kind: 'exit', value: obj });

    if (Array.isArray(value)) {
      const lengthDesc = Object.getOwnPropertyDescriptor(value, 'length');
      if (!isOwnDataProperty(lengthDesc) || typeof lengthDesc.value !== 'number') {
        return { ok: false, reason: 'array length is not a data property' };
      }
      const length = lengthDesc.value;
      if (!Number.isInteger(length) || length < 0 || length > Number.MAX_SAFE_INTEGER) {
        return { ok: false, reason: 'array length is not a JSON array length' };
      }

      const children: unknown[] = [];
      for (let i = 0; i < length; i++) {
        const key = String(i);
        const indexDesc = Object.getOwnPropertyDescriptor(value, key);
        // Sparse holes read as undefined and would become null under stringify.
        if (indexDesc === undefined) {
          return { ok: false, reason: 'sparse array hole is not a JSON value' };
        }
        if (!isOwnDataProperty(indexDesc)) {
          return { ok: false, reason: 'array index accessor is not a JSON value' };
        }
        children.push(indexDesc.value);
      }

      for (const key of Reflect.ownKeys(value)) {
        if (key === 'length') continue;
        if (typeof key === 'string' && isCanonicalArrayIndexKey(key, length)) {
          continue;
        }
        // Extra string keys (enumerable or not), symbol keys, custom toJSON, etc.
        if (typeof key === 'symbol') {
          return { ok: false, reason: 'symbol key is not a JSON value' };
        }
        return {
          ok: false,
          reason: 'array has non-index own property that is not a JSON value',
        };
      }

      // Push children so deeper frames run before this array's exit.
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ kind: 'enter', value: children[i] });
      }
      continue;
    }

    const proto = Object.getPrototypeOf(obj);
    if (proto !== null && proto !== Object.prototype) {
      return { ok: false, reason: 'non-plain object is not a JSON value' };
    }

    // Prefer descriptor-based toJSON detection — never invoke a toJSON getter.
    const toJsonDesc = Object.getOwnPropertyDescriptor(obj, 'toJSON');
    if (toJsonDesc !== undefined) {
      if (!isOwnDataProperty(toJsonDesc) || typeof toJsonDesc.value === 'function') {
        return { ok: false, reason: 'object with toJSON is not a JSON value' };
      }
    }

    const children: unknown[] = [];
    for (const key of Reflect.ownKeys(obj)) {
      if (typeof key !== 'string') {
        return { ok: false, reason: 'symbol key is not a JSON value' };
      }
      const desc = Object.getOwnPropertyDescriptor(obj, key);
      if (desc === undefined) {
        return { ok: false, reason: 'missing own property descriptor is not a JSON value' };
      }
      if (!isOwnEnumerableDataProperty(desc)) {
        if ('get' in desc || 'set' in desc) {
          return { ok: false, reason: 'accessor property is not a JSON value' };
        }
        if (desc.enumerable !== true) {
          return { ok: false, reason: 'non-enumerable key is not a JSON value' };
        }
        return { ok: false, reason: 'non-data property is not a JSON value' };
      }
      children.push(desc.value);
    }

    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ kind: 'enter', value: children[i] });
    }
  }

  return { ok: true };
}

/**
 * Validate proposed runtime data with the same rules as parseOwnedBody so
 * serialize never emits JSON that parse would immediately reject.
 */
function validateReviewQueueData(
  data: ReviewQueueData,
): { ok: true } | { ok: false; reason: string } {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'review queue data must be an object' };
  }
  if (data.version !== REVIEW_QUEUE_VERSION) {
    return { ok: false, reason: `unsupported version: ${String(data.version)}` };
  }
  if (!Array.isArray(data.items)) {
    return { ok: false, reason: 'items must be an array' };
  }

  const duplicateId = findDuplicateIds(data.items);
  if (duplicateId !== undefined) {
    return { ok: false, reason: `duplicate item id: ${duplicateId}` };
  }

  if (
    data.unknownFields !== undefined &&
    data.unknownFields !== null &&
    (typeof data.unknownFields !== 'object' || Array.isArray(data.unknownFields))
  ) {
    return { ok: false, reason: 'unknownFields must be an object' };
  }

  // Lossless JSON for unknown bags MUST run before itemToRawForValidation /
  // dataToJson, which would otherwise read accessors (throw / side effects)
  // or let JSON.stringify drop/rewrite non-JSON shapes.
  if (data.unknownFields !== undefined && data.unknownFields !== null) {
    const topUnknown = assertJsonValue(data.unknownFields);
    if (!topUnknown.ok) {
      return {
        ok: false,
        reason: `review queue data is not JSON-serializable: ${topUnknown.reason}`,
      };
    }
  }

  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      // Fall through to parseItem for the structured diagnostic.
      const result = parseItem(item, i);
      if (!result.ok) return { ok: false, reason: result.diagnostic };
      continue;
    }
    const uf = (item as ReviewQueueItem).unknownFields;
    if (uf !== undefined && uf !== null) {
      if (typeof uf !== 'object' || Array.isArray(uf)) {
        return { ok: false, reason: `item[${i}]: unknownFields must be an object` };
      }
      const itemUnknown = assertJsonValue(uf);
      if (!itemUnknown.ok) {
        return {
          ok: false,
          reason: `review queue data is not JSON-serializable: ${itemUnknown.reason}`,
        };
      }
    }
  }

  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    // Reuse parseItem against a plain object view of known + unknown fields.
    // Unknown bags were already proven to be data-property JSON values.
    const raw = itemToRawForValidation(item);
    const result = parseItem(raw, i);
    if (!result.ok) {
      return { ok: false, reason: result.diagnostic };
    }
  }

  return { ok: true };
}

/**
 * Flatten a runtime item into the same shape parseItem expects, so validation
 * reuses the parser rules rather than a weaker duplicate check.
 * Reads unknown-field values only via data-property descriptors (no getters).
 */
function itemToRawForValidation(item: unknown): unknown {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    return item;
  }
  const obj = item as ReviewQueueItem;
  const raw = createOwnBag();
  setOwn(raw, 'id', obj.id);
  setOwn(raw, 'sourcePath', obj.sourcePath);
  setOwn(raw, 'prompt', obj.prompt);
  setOwn(raw, 'dueOn', obj.dueOn);
  setOwn(raw, 'status', obj.status);
  const unknown = obj.unknownFields;
  if (unknown !== null && typeof unknown === 'object' && !Array.isArray(unknown)) {
    for (const key of Reflect.ownKeys(unknown as object)) {
      if (typeof key !== 'string') continue;
      // Known keys in unknownFields must not override; match serializer defense.
      if (ITEM_KNOWN_KEYS.has(key)) continue;
      const desc = Object.getOwnPropertyDescriptor(unknown as object, key);
      if (!isOwnDataProperty(desc)) continue;
      setOwn(raw, key, desc.value);
    }
  }
  return raw;
}

/**
 * Parse the product-owned review queue block from NOTES.md markdown.
 * Missing is a valid result and must not be treated as "no review needed".
 * Never invents items from surrounding activity text.
 */
export function parseReviewQueue(markdown: string): ParseReviewQueueResult {
  const scan = scanOwnedBlocks(markdown);

  // Recognizable partial / malformed-closing blocks take priority over a single
  // complete block so mixed complete+incomplete is never silently ok.
  if (scan.hasPartial) {
    return {
      status: 'malformed',
      reason: 'unterminated review queue block: missing or malformed closing fence',
    };
  }

  if (scan.complete.length > 1) {
    return {
      status: 'malformed',
      reason: 'multiple owned review queue blocks present',
    };
  }

  if (scan.complete.length === 1) {
    return parseOwnedBody(scan.complete[0]!.body);
  }

  return { status: 'missing' };
}

/**
 * Copy own enumerable string data properties from a validated unknown bag.
 * Uses descriptors only — never triggers accessors.
 */
function copyUnknownDataProperties(
  target: Record<string, unknown>,
  unknown: Record<string, unknown>,
  blockedKeys: Set<string>,
): void {
  for (const key of Reflect.ownKeys(unknown)) {
    if (typeof key !== 'string') continue;
    if (blockedKeys.has(key)) continue;
    const desc = Object.getOwnPropertyDescriptor(unknown, key);
    if (!isOwnDataProperty(desc)) continue;
    setOwn(target, key, desc.value);
  }
}

function itemToJson(item: ReviewQueueItem): Record<string, unknown> {
  const result = createOwnBag();
  setOwn(result, 'id', item.id);
  setOwn(result, 'sourcePath', item.sourcePath);
  setOwn(result, 'prompt', item.prompt);
  setOwn(result, 'dueOn', item.dueOn);
  setOwn(result, 'status', item.status);
  const unknown = item.unknownFields ?? createOwnBag();
  copyUnknownDataProperties(result, unknown, ITEM_KNOWN_KEYS);
  return result;
}

function dataToJson(data: ReviewQueueData): Record<string, unknown> {
  const result = createOwnBag();
  setOwn(result, 'version', REVIEW_QUEUE_VERSION);
  const unknown = data.unknownFields ?? createOwnBag();
  copyUnknownDataProperties(result, unknown, TOP_KNOWN_KEYS);
  setOwn(
    result,
    'items',
    data.items.map((item) => itemToJson(item)),
  );
  return result;
}

function formatOwnedBlock(data: ReviewQueueData, trailing: string): string {
  // JSON.stringify can still throw (e.g. extreme depth); callers catch.
  const json = JSON.stringify(dataToJson(data), null, 2);
  return `${REVIEW_QUEUE_HEADING}\n\n\`\`\`${REVIEW_QUEUE_FENCE_INFO}\n${json}\n\`\`\`${trailing}`;
}

function appendOwnedBlock(markdown: string, data: ReviewQueueData): string {
  const block = formatOwnedBlock(data, '\n');
  if (markdown.length === 0) return `${block}`;
  if (markdown.endsWith('\n\n')) return `${markdown}${block}`;
  if (markdown.endsWith('\n')) return `${markdown}\n${block}`;
  return `${markdown}\n\n${block}`;
}

/**
 * Replace the exact owned review queue block, or append once when missing and
 * `appendIfMissing` is set. Text outside the owned block is byte-preserved.
 * Refuses destructive overwrite of missing/malformed/partial/multi-block state.
 *
 * Public boundary: validation / format / unexpected runtime errors become
 * structured `{ ok: false, reason }` — never uncaught exceptions.
 */
export function serializeReviewQueue(
  markdown: string,
  data: ReviewQueueData,
  options?: SerializeReviewQueueOptions,
): SerializeReviewQueueResult {
  try {
    const validated = validateReviewQueueData(data);
    if (!validated.ok) {
      return { ok: false, reason: validated.reason };
    }

    const scan = scanOwnedBlocks(markdown);

    // A recognizable but unterminated block (missing/malformed closing fence)
    // must not be papered over by appending a second block — including when a
    // complete block already exists alongside the partial.
    if (scan.hasPartial) {
      return {
        ok: false,
        reason:
          'refuse overwrite: existing review queue block is missing or has a malformed closing fence',
      };
    }

    if (scan.complete.length === 0) {
      if (options?.appendIfMissing) {
        return { ok: true, markdown: appendOwnedBlock(markdown, data) };
      }
      return {
        ok: false,
        reason: 'review queue block is missing; pass appendIfMissing to create one',
      };
    }

    if (scan.complete.length > 1) {
      return {
        ok: false,
        reason: 'refuse overwrite: multiple owned review queue blocks present',
      };
    }

    const block = scan.complete[0]!;
    const parsed = parseOwnedBody(block.body);
    if (parsed.status === 'malformed') {
      return {
        ok: false,
        reason: `refuse overwrite of malformed review queue: ${parsed.reason}`,
      };
    }
    if (parsed.status === 'partial') {
      return {
        ok: false,
        reason: `refuse overwrite of partial review queue: ${parsed.reason}`,
      };
    }

    const next =
      markdown.slice(0, block.start) +
      formatOwnedBlock(data, block.trailing) +
      markdown.slice(block.end);
    return { ok: true, markdown: next };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `failed to serialize review queue: ${message}`,
    };
  }
}
