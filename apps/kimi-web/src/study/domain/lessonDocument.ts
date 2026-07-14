/**
 * Pure helpers for the Kimi Study lesson reader.
 *
 * These functions intentionally do not touch the DOM, network, or Vue state.
 * They build a sandboxed HTML srcdoc and detect content that cannot safely
 * run under the static preview model inherited from FilePreview.vue.
 */

/** Declared state passed by the caller. The component never fetches paths. */
export interface LessonSource {
  path: string;
  title: string;
  html: string;
  state: 'ok' | 'truncated' | 'error';
  error?: string;
}

/** Result of scanning the HTML for unsupported or unsafe markup. */
export interface LessonPartialAnalysis {
  isPartial: boolean;
  reasons: string[];
}

/** Resolved status shown to the learner. */
export type LessonStatus =
  | { kind: 'ok' }
  | { kind: 'partial'; reasons: string[] }
  | { kind: 'error'; error: string };

const CSP =
  "default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; navigate-to 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:;";

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

/** Tags whose content is raw text: no tags are parsed until the matching end tag. */
const RAW_TEXT_TAGS = new Set([
  'script', 'style', 'xmp', 'iframe', 'noembed', 'noframes',
]);

/** Tags whose content is RCDATA: character references are parsed but no tags. */
const RCDATA_TAGS = new Set(['title', 'textarea']);

/** Tags that start plaintext mode (no further tags parsed until EOF). */
const PLAINTEXT_TAG = 'plaintext';

/**
 * Decode a small, safety-relevant subset of HTML character references so that
 * obfuscated attributes (e.g. `&#x6A;avascript:...`) are checked in their
 * decoded form. No DOM parsing and no new dependencies.
 *
 * Numeric references are allowed to omit the trailing semicolon, matching
 * browser behavior. Surrogate and out-of-range code points are left as the
 * original reference so the function never throws.
 */
function decodeHtmlEntities(input: string): string {
  return input.replace(
    /&(?:#([0-9]+)|#x([0-9A-Fa-f]+)|([a-zA-Z][a-zA-Z0-9]*));?/g,
    (match, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (dec !== undefined) {
        const code = parseInt(dec, 10);
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      if (hex !== undefined) {
        const code = parseInt(hex, 16);
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      switch (name?.toLowerCase()) {
        case 'amp':
          return '&';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'quot':
          return '"';
        case 'apos':
          return "'";
        default:
          return match;
      }
    },
  );
}

/** Mutable scanner state so sequential calls can skip raw-text/RCDATA regions. */
interface ScannerState {
  mode: 'data' | 'rawText' | 'rcdata' | 'plaintext';
  rawTextTag?: string;
  svgDepth: number;
  foreignObjectDepth: number;
}

/** A parsed attribute inside a start tag. */
interface Attribute {
  name: string;
  value: string;
  quote: '"' | "'" | '';
  hasValue: boolean;
}

/** A start tag located by the state-aware scanner. */
interface StartTag {
  tagName: string;
  raw: string;
  start: number;
  end: number;
  attributes: Attribute[];
  selfClosing: boolean;
}

/**
 * Parse a single start tag beginning at `start` (which must point at '<').
 *
 * The tokenizer follows the HTML5 before-attribute-name solidus rule: a `/`
 * after the tag name enters the self-closing start-tag state, and if the next
 * character is not `>` the solidus is a parse error and the tokenizer returns
 * to before-attribute-name state. This prevents `<a/href=...>` from being read
 * as an attribute named `/href`.
 */
function parseStartTag(html: string, start: number): StartTag | undefined {
  let i = start + 1;

  const nameStart = i;
  while (i < html.length && /[a-zA-Z0-9-]/.test(html[i]!)) {
    i++;
  }
  if (i === nameStart) return undefined;
  const tagName = html.slice(nameStart, i).toLowerCase();

  const attributes: Attribute[] = [];
  let selfClosing = false;

  while (i < html.length) {
    const ch = html[i];
    if (ch === '>') {
      i++;
      break;
    }

    if (/\s/.test(ch!)) {
      i++;
      continue;
    }

    if (ch === '/') {
      // Self-closing start tag state.
      i++;
      if (i < html.length && html[i] === '>') {
        selfClosing = true;
        i++;
        break;
      }
      // Parse error: reconsume in before attribute name state.
      continue;
    }

    const nameStartIdx = i;
    while (i < html.length) {
      const c = html[i];
      if (/\s/.test(c!) || c === '=' || c === '>' || c === '/') break;
      i++;
    }
    const name = html.slice(nameStartIdx, i).toLowerCase();

    while (i < html.length && /\s/.test(html[i]!)) {
      i++;
    }

    let value = '';
    let quote: '"' | "'" | '' = '';
    let hasValue = false;
    if (i < html.length && html[i] === '=') {
      hasValue = true;
      i++;
      while (i < html.length && /\s/.test(html[i]!)) {
        i++;
      }
      if (i < html.length && (html[i] === '"' || html[i] === "'")) {
        quote = html[i] as '"' | "'";
        i++;
        const valueStart = i;
        while (i < html.length && html[i] !== quote) {
          i++;
        }
        value = html.slice(valueStart, i);
        if (i < html.length) i++;
      } else {
        const valueStart = i;
        while (i < html.length && !/\s/.test(html[i]!) && html[i] !== '>') {
          i++;
        }
        value = html.slice(valueStart, i);
      }
    }

    attributes.push({ name, value, quote, hasValue });
  }

  const end = i;
  return { tagName, raw: html.slice(start, end), start, end, attributes, selfClosing };
}

/**
 * Find the next start tag in `html` at or after `offset`, skipping over
 * comments, raw-text elements, RCDATA elements, plaintext, and SVG CDATA
 * sections. The returned `StartTag` shares the scanner's view of tag
 * boundaries, so neutralization and analysis cannot disagree.
 */
function findNextStartTag(
  html: string,
  offset: number,
  state: ScannerState,
): StartTag | undefined {
  let i = offset;

  while (i < html.length) {
    if (state.mode === 'plaintext') {
      return undefined;
    }

    if (state.mode === 'rawText' || state.mode === 'rcdata') {
      const closeIdx = findEndTag(html, i, state.rawTextTag!);
      if (closeIdx === -1) {
        return undefined;
      }
      state.mode = 'data';
      i = closeIdx;
      continue;
    }

    const lt = html.indexOf('<', i);
    if (lt === -1) return undefined;

    const afterLt = lt + 1;
    if (afterLt >= html.length) return undefined;
    const ch = html[afterLt];

    if (ch === '!') {
      if (html.slice(afterLt, afterLt + 3) === '!--') {
        // Comments may end with either '--!>' or '-->' (per HTML5 comment-end
        // state); use the first occurrence so anchors after a --!> close are
        // scanned normally.
        const commentEndRe = /--!?>/g;
        commentEndRe.lastIndex = afterLt + 3;
        const match = commentEndRe.exec(html);
        i = match ? match.index + match[0].length : html.length;
        continue;
      }
      if (
        state.svgDepth > state.foreignObjectDepth &&
        html.slice(afterLt, afterLt + 8).toLowerCase() === '![cdata['
      ) {
        const end = html.indexOf(']]>', afterLt + 8);
        i = end === -1 ? html.length : end + 3;
        continue;
      }
      // In ordinary HTML data state <![CDATA[ is a bogus comment ending at '>'.
      const gt = html.indexOf('>', afterLt);
      i = gt === -1 ? html.length : gt + 1;
      continue;
    }

    if (ch === '/') {
      const endTag = parseEndTagAt(html, lt);
      if (endTag) {
        if (endTag.tagName === 'svg') {
          if (state.svgDepth > 0) {
            state.svgDepth--;
            if (state.foreignObjectDepth > state.svgDepth) {
              state.foreignObjectDepth = state.svgDepth;
            }
          }
        } else if (endTag.tagName === 'foreignobject') {
          if (state.foreignObjectDepth > 0) {
            state.foreignObjectDepth--;
          }
        }
        i = endTag.end;
      } else {
        i = lt + 2;
      }
      continue;
    }

    if (ch === '?') {
      const gt = html.indexOf('>', afterLt);
      i = gt === -1 ? html.length : gt + 1;
      continue;
    }

    if (!/[a-zA-Z]/.test(ch!)) {
      i = lt + 1;
      continue;
    }

    const tag = parseStartTag(html, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }

    if (tag.tagName === PLAINTEXT_TAG) {
      state.mode = 'plaintext';
    } else if (RAW_TEXT_TAGS.has(tag.tagName)) {
      state.mode = 'rawText';
      state.rawTextTag = tag.tagName;
    } else if (RCDATA_TAGS.has(tag.tagName)) {
      state.mode = 'rcdata';
      state.rawTextTag = tag.tagName;
    } else if (tag.tagName === 'svg') {
      state.svgDepth++;
    } else if (tag.tagName === 'foreignobject' && state.svgDepth > 0) {
      state.foreignObjectDepth++;
    }

    return tag;
  }

  return undefined;
}

/** Find the offset just after a matching end tag, or -1 if none exists. */
function findEndTag(html: string, offset: number, tagName: string): number {
  const target = `</${tagName}`;
  let i = offset;
  while (i < html.length) {
    const idx = html.toLowerCase().indexOf(target, i);
    if (idx === -1) return -1;
    let j = idx + target.length;
    // An appropriate end tag name must be followed by whitespace, '/', or '>'.
    if (j < html.length) {
      const ch = html[j]!;
      if (!(/\s/.test(ch) || ch === '/' || ch === '>')) {
        i = idx + 1;
        continue;
      }
    } else {
      return html.length;
    }
    // Consume the rest of the end tag, staying quote-aware so a '>' inside a
    // bogus attribute does not prematurely terminate the token.
    let quote: '"' | "'" | null = null;
    while (j < html.length) {
      const c = html[j]!;
      if (c === '>' && quote === null) {
        return j + 1;
      }
      if (quote === null) {
        if (c === '"' || c === "'") {
          quote = c;
        }
      } else if (c === quote) {
        quote = null;
      }
      j++;
    }
    return html.length;
  }
  return -1;
}

/**
 * Parse an end tag beginning at `start` (which must point at '<').
 * Returns the lower-cased tag name and the offset just after the tag, or
 * undefined if no valid tag name follows the '</'.
 */
function parseEndTagAt(html: string, start: number): { tagName: string; end: number } | undefined {
  let i = start + 2;
  const nameStart = i;
  while (i < html.length && /[a-zA-Z0-9-]/.test(html[i]!)) {
    i++;
  }
  if (i === nameStart) return undefined;
  const tagName = html.slice(nameStart, i).toLowerCase();
  let quote: '"' | "'" | null = null;
  while (i < html.length) {
    const c = html[i]!;
    if (c === '>' && quote === null) {
      i++;
      break;
    }
    if (quote === null) {
      if (c === '"' || c === "'") {
        quote = c;
      }
    } else if (c === quote) {
      quote = null;
    }
    i++;
  }
  return { tagName, end: i };
}

function classifyUrl(value: string): 'external' | 'relative' | 'data' | 'empty' {
  const decoded = decodeHtmlEntities(value).trim();
  if (decoded === '') return 'empty';
  if (/^https?:/i.test(decoded)) return 'external';
  if (/^(data:|blob:)/i.test(decoded)) return 'data';
  return 'relative';
}

function classifySrcset(value: string): 'external' | 'relative' | 'data' | 'empty' {
  const decoded = decodeHtmlEntities(value).trim();
  if (decoded === '') return 'empty';
  const candidates = decoded
    .split(',')
    .map((s) => s.trim().split(/\s+/)[0])
    .filter((u): u is string => Boolean(u));
  if (candidates.length === 0) return 'empty';
  if (candidates.some((u) => /^https?:/i.test(u))) return 'external';
  if (candidates.every((u) => /^(data:|blob:)/i.test(u))) return 'data';
  return 'relative';
}

function isNonFragmentUrl(value: string): boolean {
  const decoded = decodeHtmlEntities(value).trim();
  return decoded !== '' && !decoded.startsWith('#');
}

function hasRelToken(attributes: Attribute[], token: string): boolean {
  const rel = attributes.find((a) => a.name === 'rel')?.value;
  if (!rel) return false;
  return rel
    .toLowerCase()
    .split(/\s+/)
    .includes(token.toLowerCase());
}

type RewriteRule = { attr: string; rewrite: (value: string) => string | undefined };

/**
 * Reconstruct a start tag, applying rewrite rules to specific attributes.
 * Attributes not covered by a rule are emitted unchanged. Boolean attributes,
 * quote style, and self-closing form are preserved.
 */
function rewriteAttributes(
  raw: string,
  tagName: string,
  attributes: Attribute[],
  rules: RewriteRule[],
): string {
  let out = '<' + tagName;
  for (const attr of attributes) {
    const rule = rules.find((r) => r.attr === attr.name);
    const newValue = rule ? rule.rewrite(attr.value) : undefined;
    out += ' ';
    out += attr.name;
    if (attr.hasValue) {
      out += '=';
      const quote = attr.quote || '"';
      const value = newValue !== undefined ? newValue : attr.value;
      out += quote + value + quote;
    }
  }
  if (raw.endsWith('/>')) {
    out += ' /';
  }
  out += '>';
  return out;
}

/** Navigation-capable href-like attributes become `#` unless same-document fragments. */
function neutralizeHrefAttributes(raw: string, tagName: string): string {
  const tag = parseStartTag(raw, 0);
  if (!tag) return raw;
  return rewriteAttributes(raw, tagName, tag.attributes, [
    { attr: 'href', rewrite: (v) => (isNonFragmentUrl(v) ? '#' : undefined) },
    { attr: 'xlink:href', rewrite: (v) => (isNonFragmentUrl(v) ? '#' : undefined) },
  ]);
}

/** External or relative asset references are rewritten so they cannot load. */
function neutralizeAssetAttributes(raw: string, tagName: string): string {
  const tag = parseStartTag(raw, 0);
  if (!tag) return raw;

  const urlRule: RewriteRule = {
    attr: 'src',
    rewrite: (v) => {
      const kind = classifyUrl(v);
      return kind === 'external' || kind === 'relative' ? '#' : undefined;
    },
  };
  const dataRule: RewriteRule = {
    attr: 'data',
    rewrite: (v) => {
      const kind = classifyUrl(v);
      return kind === 'external' || kind === 'relative' ? '#' : undefined;
    },
  };
  const posterRule: RewriteRule = {
    attr: 'poster',
    rewrite: (v) => {
      const kind = classifyUrl(v);
      return kind === 'external' || kind === 'relative' ? '#' : undefined;
    },
  };
  const hrefRule: RewriteRule = {
    attr: 'href',
    rewrite: (v) => {
      const kind = classifyUrl(v);
      return kind === 'external' || kind === 'relative' ? '#' : undefined;
    },
  };
  const xlinkHrefRule: RewriteRule = {
    attr: 'xlink:href',
    rewrite: (v) => {
      const kind = classifyUrl(v);
      return kind === 'external' || kind === 'relative' ? '#' : undefined;
    },
  };
  const srcsetRule: RewriteRule = {
    attr: 'srcset',
    rewrite: (v) => {
      const kind = classifySrcset(v);
      return kind === 'external' || kind === 'relative' ? '' : undefined;
    },
  };

  switch (tagName) {
    case 'img':
      return rewriteAttributes(raw, tagName, tag.attributes, [urlRule, srcsetRule]);
    case 'source':
      return rewriteAttributes(raw, tagName, tag.attributes, [urlRule, srcsetRule]);
    case 'video':
      return rewriteAttributes(raw, tagName, tag.attributes, [urlRule, posterRule]);
    case 'audio':
    case 'track':
    case 'embed':
      return rewriteAttributes(raw, tagName, tag.attributes, [urlRule]);
    case 'object':
      return rewriteAttributes(raw, tagName, tag.attributes, [dataRule]);
    case 'input': {
      const type = tag.attributes.find((a) => a.name === 'type')?.value.toLowerCase();
      if (type === 'image') {
        return rewriteAttributes(raw, tagName, tag.attributes, [urlRule]);
      }
      return raw;
    }
    case 'image':
    case 'use':
      return rewriteAttributes(raw, tagName, tag.attributes, [hrefRule, xlinkHrefRule]);
    case 'link':
      if (hasRelToken(tag.attributes, 'stylesheet')) {
        return rewriteAttributes(raw, tagName, tag.attributes, [hrefRule]);
      }
      return raw;
    default:
      return raw;
  }
}

/**
 * Neutralize navigation-capable start tags.
 *
 * - HTML `<a href>` and SVG `<a href>` / `<a xlink:href>` become `#` unless
 *   they are same-document fragments.
 * - HTML `<area href>` becomes `#` unless it is a same-document fragment.
 * - `<base>` start tags are removed so fragments cannot resolve externally.
 * - Any lesson-provided `<meta http-equiv=...>` start tag is removed.
 *
 * Uses the same state-aware scanner as `analyzeLessonHtml` so the two cannot
 * disagree on where a tag begins and ends.
 */
function neutralizeNavigationTags(html: string): string {
  const result: string[] = [];
  let offset = 0;
  const state: ScannerState = { mode: 'data', svgDepth: 0, foreignObjectDepth: 0 };
  let tag: StartTag | undefined;

  while ((tag = findNextStartTag(html, offset, state)) !== undefined) {
    result.push(html.slice(offset, tag.start));

    if (tag.tagName === 'a') {
      result.push(neutralizeHrefAttributes(tag.raw, tag.tagName));
    } else if (tag.tagName === 'area') {
      result.push(neutralizeHrefAttributes(tag.raw, tag.tagName));
    } else if (tag.tagName === 'base') {
      // Drop the entire start tag; fragment anchors are then guaranteed local.
    } else if (tag.tagName === 'meta' && tag.attributes.some((a) => a.name === 'http-equiv')) {
      // Conservative: we cannot reliably prove an entity-obfuscated http-equiv
      // is not refresh, so drop every lesson-provided http-equiv <meta>.
    } else {
      result.push(neutralizeAssetAttributes(tag.raw, tag.tagName));
    }

    offset = tag.end;
  }
  result.push(html.slice(offset));
  return result.join('');
}

/**
 * Make `<script>` markup inert by turning the delimiters into plain text.
 * The result is well-formed HTML text, not a malformed raw-text mutation.
 */
function makeScriptMarkupInert(html: string): string {
  return html.replace(/<script\b/gi, '&lt;script').replace(/<\/script>/gi, '&lt;/script&gt;');
}

/**
 * Build a srcdoc for an iframe with an empty `sandbox` attribute.
 *
 * Before embedding, every non-fragment URL attribute on navigation-capable tags
 * is rewritten to `#`, `<base>` and http-equiv `<meta>` tags are removed,
 * external/relative asset references are cleared, and script tag delimiters are
 * escaped to text. The CSP is the primary defense; neutralization is a
 * deterministic, JavaScript-free hardening layer.
 */
export function buildLessonSrcdoc(html: string): string {
  let safeHtml = neutralizeNavigationTags(html);
  safeHtml = makeScriptMarkupInert(safeHtml);
  return [
    '<!doctype html>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    safeHtml,
  ].join('');
}

/**
 * Scan lesson HTML for markup that the static sandbox cannot support.
 *
 * Detection is conservative: we flag anything that would require scripts,
 * network access, same-origin privileges, or a complete document to render.
 */
export function analyzeLessonHtml(html: string): LessonPartialAnalysis {
  const reasons: string[] = [];
  let hasScriptTag = false;

  let hasExternalImage = false;
  let hasRelativeImage = false;
  let hasExternalMedia = false;
  let hasRelativeMedia = false;
  let hasStylesheet = false;
  let hasNestedIframe = false;
  let hasBase = false;
  let hasMetaRefresh = false;
  let hasExternalAnchor = false;
  let hasRelativeAnchor = false;
  let hasFormAction = false;
  let hasInlineHandler = false;
  let hasJavaScriptUrl = false;

  let offset = 0;
  const state: ScannerState = { mode: 'data', svgDepth: 0, foreignObjectDepth: 0 };
  let tag: StartTag | undefined;

  while ((tag = findNextStartTag(html, offset, state)) !== undefined) {
    const attrs = tag.attributes;

    if (tag.tagName === 'script') {
      hasScriptTag = true;
    }

    for (const attr of attrs) {
      if (attr.name.length > 2 && attr.name.startsWith('on')) {
        hasInlineHandler = true;
      }
    }

    switch (tag.tagName) {
      case 'a': {
        const href = attrs.find((a) => a.name === 'href')?.value;
        if (href !== undefined) {
          const decoded = decodeHtmlEntities(href).trim();
          if (decoded.startsWith('javascript:')) {
            hasJavaScriptUrl = true;
          }
          if (decoded !== '' && !decoded.startsWith('#')) {
            hasExternalAnchor = /^https?:/i.test(decoded);
            hasRelativeAnchor = !hasExternalAnchor;
          }
        }
        const xlinkHref = attrs.find((a) => a.name === 'xlink:href')?.value;
        if (xlinkHref !== undefined) {
          const decoded = decodeHtmlEntities(xlinkHref).trim();
          if (decoded !== '' && !decoded.startsWith('#')) {
            hasExternalAnchor = /^https?:/i.test(decoded);
            hasRelativeAnchor = !hasExternalAnchor;
          }
        }
        break;
      }
      case 'area': {
        const href = attrs.find((a) => a.name === 'href')?.value;
        if (href !== undefined) {
          const decoded = decodeHtmlEntities(href).trim();
          if (decoded.startsWith('javascript:')) {
            hasJavaScriptUrl = true;
          }
          if (decoded !== '' && !decoded.startsWith('#')) {
            hasExternalAnchor = /^https?:/i.test(decoded);
            hasRelativeAnchor = !hasExternalAnchor;
          }
        }
        break;
      }
      case 'base': {
        hasBase = true;
        break;
      }
      case 'meta': {
        if (attrs.some((a) => a.name === 'http-equiv')) {
          // Conservative: any http-equiv could be an entity-obfuscated refresh.
          hasMetaRefresh = true;
        }
        break;
      }
      case 'img': {
        const src = attrs.find((a) => a.name === 'src')?.value;
        if (src !== undefined) {
          const kind = classifyUrl(src);
          if (kind === 'external') hasExternalImage = true;
          else if (kind === 'relative') hasRelativeImage = true;
        }
        const srcset = attrs.find((a) => a.name === 'srcset')?.value;
        if (srcset !== undefined) {
          const kind = classifySrcset(srcset);
          if (kind === 'external') hasExternalImage = true;
          else if (kind === 'relative') hasRelativeImage = true;
        }
        break;
      }
      case 'source': {
        const src = attrs.find((a) => a.name === 'src')?.value;
        if (src !== undefined) {
          const kind = classifyUrl(src);
          if (kind === 'external') hasExternalMedia = true;
          else if (kind === 'relative') hasRelativeMedia = true;
        }
        const srcset = attrs.find((a) => a.name === 'srcset')?.value;
        if (srcset !== undefined) {
          const kind = classifySrcset(srcset);
          if (kind === 'external') hasExternalMedia = true;
          else if (kind === 'relative') hasRelativeMedia = true;
        }
        break;
      }
      case 'video': {
        const src = attrs.find((a) => a.name === 'src')?.value;
        if (src !== undefined) {
          const kind = classifyUrl(src);
          if (kind === 'external') hasExternalMedia = true;
          else if (kind === 'relative') hasRelativeMedia = true;
        }
        const poster = attrs.find((a) => a.name === 'poster')?.value;
        if (poster !== undefined) {
          const kind = classifyUrl(poster);
          if (kind === 'external') hasExternalMedia = true;
          else if (kind === 'relative') hasRelativeMedia = true;
        }
        break;
      }
      case 'audio':
      case 'track':
      case 'embed': {
        const src = attrs.find((a) => a.name === 'src')?.value;
        if (src !== undefined) {
          const kind = classifyUrl(src);
          if (kind === 'external') hasExternalMedia = true;
          else if (kind === 'relative') hasRelativeMedia = true;
        }
        break;
      }
      case 'object': {
        const data = attrs.find((a) => a.name === 'data')?.value;
        if (data !== undefined) {
          const kind = classifyUrl(data);
          if (kind === 'external') hasExternalMedia = true;
          else if (kind === 'relative') hasRelativeMedia = true;
        }
        break;
      }
      case 'input': {
        const type = attrs.find((a) => a.name === 'type')?.value.toLowerCase();
        const src = attrs.find((a) => a.name === 'src')?.value;
        if (type === 'image' && src !== undefined) {
          const kind = classifyUrl(src);
          if (kind === 'external') hasExternalImage = true;
          else if (kind === 'relative') hasRelativeImage = true;
        }
        break;
      }
      case 'image':
      case 'use': {
        const href = attrs.find((a) => a.name === 'href')?.value;
        if (href !== undefined) {
          const kind = classifyUrl(href);
          if (kind === 'external') hasExternalImage = true;
          else if (kind === 'relative') hasRelativeImage = true;
        }
        const xlinkHref = attrs.find((a) => a.name === 'xlink:href')?.value;
        if (xlinkHref !== undefined) {
          const kind = classifyUrl(xlinkHref);
          if (kind === 'external') hasExternalImage = true;
          else if (kind === 'relative') hasRelativeImage = true;
        }
        break;
      }
      case 'link': {
        if (hasRelToken(attrs, 'stylesheet')) {
          hasStylesheet = true;
        }
        break;
      }
      case 'iframe': {
        hasNestedIframe = true;
        break;
      }
      case 'form': {
        const action = attrs.find((a) => a.name === 'action')?.value;
        if (action !== undefined) {
          hasFormAction = true;
        }
        break;
      }
    }
    offset = tag.end;
  }

  if (hasScriptTag || /<\/script>/i.test(html)) {
    reasons.push('lesson contains <script> tags that cannot run in static safety mode');
  }

  if (hasExternalImage) {
    reasons.push('lesson references external images that cannot load in static safety mode');
  }
  if (hasRelativeImage) {
    reasons.push('lesson references relative or unsupported images that cannot load in static safety mode');
  }
  if (hasExternalMedia) {
    reasons.push('lesson references external media that cannot load in static safety mode');
  }
  if (hasRelativeMedia) {
    reasons.push('lesson references relative or unsupported media that cannot load in static safety mode');
  }
  if (hasStylesheet) {
    reasons.push('lesson contains external stylesheets that cannot load in static safety mode');
  }
  if (hasNestedIframe) {
    reasons.push('lesson contains nested iframes that cannot run in static safety mode');
  }
  if (hasBase) {
    reasons.push('lesson contains a <base> tag that cannot apply in static safety mode');
  }
  if (hasMetaRefresh) {
    reasons.push('lesson contains a meta refresh redirect that cannot run in static safety mode');
  }
  if (hasExternalAnchor) {
    reasons.push(
      'lesson contains anchor links to external destinations that cannot navigate in static safety mode',
    );
  }
  if (hasRelativeAnchor) {
    reasons.push(
      'lesson contains anchor links to relative destinations that cannot navigate in static safety mode',
    );
  }
  if (hasFormAction) {
    reasons.push('lesson contains forms with actions that cannot submit in static safety mode');
  }
  if (hasInlineHandler) {
    reasons.push('lesson contains inline event handlers that cannot run in static safety mode');
  }
  if (hasJavaScriptUrl) {
    reasons.push('lesson contains javascript: links that cannot run in static safety mode');
  }

  if (/href\s*=\s*["']?javascript:/i.test(html)) {
    reasons.push('lesson contains javascript: links that cannot run in static safety mode');
  }

  if (isTruncated(html)) {
    reasons.push('lesson text appears truncated or has unclosed markup');
  }

  const unique = Array.from(new Set(reasons));
  return { isPartial: unique.length > 0, reasons: unique };
}

/**
 * Heuristic for whether HTML looks cut off mid-document.
 *
 * Detects three failure modes:
 * 1. The document ends inside a tag literal (`<img src="`).
 * 2. The document ends with an unclosed `<`.
 * 3. A non-void opening tag was started but never closed (`<p>text`).
 */
function isTruncated(html: string): boolean {
  const trimmed = html.trimEnd();
  if (trimmed.length === 0) return false;

  // Ends inside a tag or with an unclosed `<`.
  const lastOpen = trimmed.lastIndexOf('<');
  const lastClose = trimmed.lastIndexOf('>');
  if (lastOpen > lastClose) return true;

  // Unclosed quotes inside the last tag.
  if (lastClose < lastOpen) {
    const lastQuote = Math.max(trimmed.lastIndexOf('"'), trimmed.lastIndexOf("'"));
    if (lastQuote > lastOpen) return true;
  }

  // Count unclosed non-void/self-closing tags.
  let depth = 0;
  const tagPattern = /<(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)(?:[^>]*)?(\/?)\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(trimmed)) !== null) {
    const slash = match[1];
    const tagName = match[2]!.toLowerCase();
    const selfClosing = match[3] === '/';
    if (VOID_TAGS.has(tagName) || selfClosing) {
      continue;
    }
    if (slash) {
      depth--;
    } else {
      depth++;
    }
  }

  return depth > 0;
}

/**
 * Combine caller-declared source state with detected unsafe content.
 *
 * Order of precedence: declared error > declared truncated > detected issues > ok.
 */
export function deriveLessonStatus(source: LessonSource): LessonStatus {
  if (source.state === 'error') {
    return { kind: 'error', error: source.error ?? 'Lesson could not be loaded' };
  }

  const analysis = analyzeLessonHtml(source.html);
  const reasons: string[] = [];

  if (source.state === 'truncated') {
    reasons.push('lesson text was truncated when read');
  }

  if (analysis.isPartial) {
    reasons.push(...analysis.reasons);
  }

  const unique = Array.from(new Set(reasons));
  if (unique.length > 0) {
    return { kind: 'partial', reasons: unique };
  }

  return { kind: 'ok' };
}
