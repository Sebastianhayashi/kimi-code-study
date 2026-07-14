import { describe, expect, it } from 'vitest';
import {
  isValidWorkspaceRelativeSourcePath,
  parseReviewQueue,
  serializeReviewQueue,
  type ReviewQueueData,
  type SerializeReviewQueueResult,
} from '../src/study/domain/reviewQueue';

const SAMPLE_ITEM = {
  id: 'rev-1',
  sourcePath: 'learning-records/2026-07-01-scales.md',
  prompt: 'Explain why the C major scale starts on C',
  dueOn: '2026-07-14',
  status: 'scheduled' as const,
};

function queueJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function notesWithOwnedBlock(
  body: unknown,
  options?: { before?: string; after?: string; heading?: string },
): string {
  const before = options?.before ?? '# Notes\n\nPersonal preferences live here.\n\n';
  const after = options?.after ?? '\n\n## Other notes\n\nKeep me intact.\n';
  const heading = options?.heading ?? '## Review queue';
  return (
    before +
    heading +
    '\n\n```kimi-study-review-queue-v1\n' +
    queueJson(body) +
    '\n```' +
    after
  );
}

describe('parseReviewQueue — missing', () => {
  it('returns missing when NOTES has no owned review queue block', () => {
    const markdown = '# Notes\n\nNo queue here.\n\n```json\n{"hello":1}\n```\n';
    const result = parseReviewQueue(markdown);
    expect(result).toEqual({ status: 'missing' });
  });

  it('missing does not mean the learner needs no review', () => {
    // Contract: callers must treat missing as "unknown / not yet written",
    // never as an empty schedule. The parse result carries no items array.
    const result = parseReviewQueue('');
    expect(result.status).toBe('missing');
    expect(result).not.toHaveProperty('data');
    expect(result).not.toHaveProperty('items');
  });

  it('ignores non-owned fenced blocks even with similar names', () => {
    const markdown = [
      '# Notes',
      '',
      '```kimi-study-review-queue-v2',
      '{"version":2,"items":[]}',
      '```',
      '',
      '```json',
      '{"version":1,"items":[]}',
      '```',
      '',
    ].join('\n');
    expect(parseReviewQueue(markdown)).toEqual({ status: 'missing' });
  });
});

describe('parseReviewQueue — valid', () => {
  it('parses a valid owned block without modifying surrounding markdown contract', () => {
    const markdown = notesWithOwnedBlock({ version: 1, items: [SAMPLE_ITEM] });
    const result = parseReviewQueue(markdown);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data).toEqual({
      version: 1,
      items: [{ ...SAMPLE_ITEM, unknownFields: {} }],
      unknownFields: {},
    });
    // Surrounding text is still exactly as provided — parse is non-mutating.
    expect(markdown).toContain('Personal preferences live here.');
    expect(markdown).toContain('## Other notes');
    expect(markdown).toContain('Keep me intact.');
  });

  it('accepts empty items as a valid explicit queue', () => {
    const result = parseReviewQueue(
      notesWithOwnedBlock({ version: 1, items: [] }),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data.items).toEqual([]);
  });

  it('preserves unknown top-level and item fields', () => {
    const body = {
      version: 1,
      schemaNote: 'future',
      items: [
        {
          ...SAMPLE_ITEM,
          priority: 3,
          tags: ['scale'],
        },
      ],
      meta: { author: 'tutor' },
    };
    const result = parseReviewQueue(notesWithOwnedBlock(body));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data.unknownFields).toEqual({
      schemaNote: 'future',
      meta: { author: 'tutor' },
    });
    expect(result.data.items[0]?.unknownFields).toEqual({
      priority: 3,
      tags: ['scale'],
    });
  });
});

describe('serializeReviewQueue — round-trip / append / update', () => {
  it('round-trips a valid block and preserves surrounding bytes exactly', () => {
    const before = '# Notes\r\n\r\nprefs\u00a0space\r\n\r\n';
    const after = '\r\n\r\n## Footer\r\nkeep-byte-for-byte\r\n';
    const markdown = notesWithOwnedBlock(
      { version: 1, items: [SAMPLE_ITEM] },
      { before, after },
    );
    const parsed = parseReviewQueue(markdown);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;

    const written = serializeReviewQueue(markdown, parsed.data);
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    // Prefix and suffix outside the owned block are byte-identical.
    expect(written.markdown.startsWith(before)).toBe(true);
    expect(written.markdown.endsWith(after)).toBe(true);
    expect(written.markdown.indexOf(after)).toBe(
      written.markdown.length - after.length,
    );

    const reparsed = parseReviewQueue(written.markdown);
    expect(reparsed.status).toBe('ok');
    if (reparsed.status !== 'ok') return;
    expect(reparsed.data).toEqual(parsed.data);
  });

  it('appends an owned block once when missing and appendIfMissing is set', () => {
    const markdown = '# Notes\n\nJust notes.\n';
    const data: ReviewQueueData = {
      version: 1,
      items: [SAMPLE_ITEM],
      unknownFields: {},
    };
    const refused = serializeReviewQueue(markdown, data);
    expect(refused.ok).toBe(false);

    const written = serializeReviewQueue(markdown, data, { appendIfMissing: true });
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(written.markdown.startsWith(markdown)).toBe(true);
    expect(written.markdown).toContain('## Review queue');
    expect(written.markdown).toContain('```kimi-study-review-queue-v1');

    const parsed = parseReviewQueue(written.markdown);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.data.items).toEqual([
      { ...SAMPLE_ITEM, unknownFields: {} },
    ]);

    // A second append is not needed: once present, further serialize replaces.
    const updated: ReviewQueueData = {
      version: 1,
      items: [
        {
          ...SAMPLE_ITEM,
          status: 'completed',
          unknownFields: {},
        },
      ],
      unknownFields: {},
    };
    const again = serializeReviewQueue(written.markdown, updated, {
      appendIfMissing: true,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const ownedHeadingMatches = again.markdown.match(/^## Review queue\s*$/gm);
    expect(ownedHeadingMatches).toHaveLength(1);
    const reparsed = parseReviewQueue(again.markdown);
    expect(reparsed.status).toBe('ok');
    if (reparsed.status !== 'ok') return;
    expect(reparsed.data.items[0]?.status).toBe('completed');
  });

  it('updates only the owned block when replacing an existing queue', () => {
    const markdown = notesWithOwnedBlock({ version: 1, items: [SAMPLE_ITEM] });
    const updated: ReviewQueueData = {
      version: 1,
      items: [
        {
          ...SAMPLE_ITEM,
          status: 'cancelled',
          unknownFields: { note: 'skipped' },
        },
        {
          id: 'rev-2',
          sourcePath: 'lessons/chord-shapes.html',
          prompt: 'Name three open chords',
          dueOn: '2026-07-20',
          status: 'scheduled',
          unknownFields: {},
        },
      ],
      unknownFields: { revised: true },
    };
    const written = serializeReviewQueue(markdown, updated);
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(written.markdown).toContain('Personal preferences live here.');
    expect(written.markdown).toContain('## Other notes');
    expect(written.markdown).toContain('Keep me intact.');
    // Non-owned fences/text are untouched.
    expect(written.markdown).toContain('# Notes');

    const parsed = parseReviewQueue(written.markdown);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.data).toEqual(updated);
  });

  it('round-trips unknown fields through serialize', () => {
    const body = {
      version: 1,
      extraTop: 1,
      items: [{ ...SAMPLE_ITEM, extraItem: 'x' }],
    };
    const markdown = notesWithOwnedBlock(body);
    const parsed = parseReviewQueue(markdown);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    const written = serializeReviewQueue(markdown, parsed.data);
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    const again = parseReviewQueue(written.markdown);
    expect(again.status).toBe('ok');
    if (again.status !== 'ok') return;
    expect(again.data.unknownFields).toEqual({ extraTop: 1 });
    expect(again.data.items[0]?.unknownFields).toEqual({ extraItem: 'x' });
  });
});

describe('parseReviewQueue — malformed / partial', () => {
  it('returns malformed for invalid JSON body', () => {
    const markdown = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{not-json',
      '```',
      '',
    ].join('\n');
    const result = parseReviewQueue(markdown);
    expect(result.status).toBe('malformed');
    if (result.status !== 'malformed') return;
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('returns malformed for wrong version', () => {
    const result = parseReviewQueue(
      notesWithOwnedBlock({ version: 2, items: [SAMPLE_ITEM] }),
    );
    expect(result.status).toBe('malformed');
    if (result.status !== 'malformed') return;
    expect(result.reason.toLowerCase()).toContain('version');
  });

  it('returns malformed for duplicate item ids', () => {
    const result = parseReviewQueue(
      notesWithOwnedBlock({
        version: 1,
        items: [SAMPLE_ITEM, { ...SAMPLE_ITEM, prompt: 'other' }],
      }),
    );
    expect(result.status).toBe('malformed');
    if (result.status !== 'malformed') return;
    expect(result.reason.toLowerCase()).toMatch(/duplicate/);
  });

  it('returns malformed when multiple owned blocks are present', () => {
    const one = notesWithOwnedBlock(
      { version: 1, items: [SAMPLE_ITEM] },
      { before: '# A\n\n', after: '\n\n' },
    );
    const two = notesWithOwnedBlock(
      {
        version: 1,
        items: [{ ...SAMPLE_ITEM, id: 'rev-2' }],
      },
      { before: '', after: '\n' },
    );
    const result = parseReviewQueue(one + two);
    expect(result.status).toBe('malformed');
    if (result.status !== 'malformed') return;
    expect(result.reason.toLowerCase()).toMatch(/multiple|more than one/);
  });

  it('returns partial when some items are invalid but others are usable', () => {
    const result = parseReviewQueue(
      notesWithOwnedBlock({
        version: 1,
        items: [
          SAMPLE_ITEM,
          {
            id: 'rev-bad',
            sourcePath: 'x.md',
            prompt: 'bad date',
            dueOn: '14-07-2026',
            status: 'scheduled',
          },
          {
            id: 'rev-bad-status',
            sourcePath: 'y.md',
            prompt: 'bad status',
            dueOn: '2026-07-15',
            status: 'pending',
          },
        ],
      }),
    );
    expect(result.status).toBe('partial');
    if (result.status !== 'partial') return;
    expect(result.reason.length).toBeGreaterThan(0);
    expect(result.validItems).toEqual([{ ...SAMPLE_ITEM, unknownFields: {} }]);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(2);
  });

  it('returns malformed for invalid calendar dates when no items are valid', () => {
    const result = parseReviewQueue(
      notesWithOwnedBlock({
        version: 1,
        items: [
          {
            ...SAMPLE_ITEM,
            dueOn: '2026-02-30',
          },
        ],
      }),
    );
    expect(result.status).toBe('malformed');
    if (result.status !== 'malformed') return;
    expect(result.reason.toLowerCase()).toMatch(/date|dueon|invalid/);
  });

  it('returns malformed for non-array items', () => {
    const result = parseReviewQueue(
      notesWithOwnedBlock({ version: 1, items: { id: 'x' } }),
    );
    expect(result.status).toBe('malformed');
  });
});

describe('serializeReviewQueue — refuse destructive overwrite', () => {
  it('refuses to overwrite a malformed block', () => {
    const markdown = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{broken',
      '```',
      '',
    ].join('\n');
    const written = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...SAMPLE_ITEM, unknownFields: {} }],
      unknownFields: {},
    });
    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.reason.toLowerCase()).toMatch(/malformed|refuse|overwrite/);
  });

  it('refuses to overwrite a partial block', () => {
    const markdown = notesWithOwnedBlock({
      version: 1,
      items: [
        SAMPLE_ITEM,
        {
          id: 'rev-bad',
          sourcePath: 'x.md',
          prompt: 'bad',
          dueOn: 'not-a-date',
          status: 'scheduled',
        },
      ],
    });
    const written = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...SAMPLE_ITEM, unknownFields: {} }],
      unknownFields: {},
    });
    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.reason.toLowerCase()).toMatch(/partial|refuse|overwrite/);
  });

  it('refuses to overwrite when multiple owned blocks exist', () => {
    const one = notesWithOwnedBlock(
      { version: 1, items: [SAMPLE_ITEM] },
      { before: '', after: '\n\n' },
    );
    const two = notesWithOwnedBlock(
      { version: 1, items: [{ ...SAMPLE_ITEM, id: 'rev-2' }] },
      { before: '', after: '\n' },
    );
    const written = serializeReviewQueue(one + two, {
      version: 1,
      items: [{ ...SAMPLE_ITEM, unknownFields: {} }],
      unknownFields: {},
    });
    expect(written.ok).toBe(false);
  });
});

describe('parseReviewQueue — no implicit scheduling', () => {
  it('never invents review items from surrounding activity text', () => {
    const markdown = [
      '# Notes',
      '',
      'Last opened: 2026-01-01',
      'Idle for 30 days',
      'Completed 12 lessons and 40 chats',
      'Learning Record: learning-records/foo.md exists',
      '',
    ].join('\n');
    const result = parseReviewQueue(markdown);
    expect(result).toEqual({ status: 'missing' });
  });
});

describe('parseReviewQueue — strict closing fence', () => {
  it('rejects a closing fence with extra characters after the backticks', () => {
    const markdown = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
      '```extra',
      '',
    ].join('\n');
    const result = parseReviewQueue(markdown);
    expect(result.status).toBe('malformed');
    if (result.status !== 'malformed') return;
    expect(result.reason.toLowerCase()).toMatch(/closing fence|fence|unterminated/);
  });

  it('accepts a closing fence followed only by spaces/tabs and newline', () => {
    const markdown = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
      '```   ',
      '',
    ].join('\n');
    const result = parseReviewQueue(markdown);
    expect(result.status).toBe('ok');
  });

  it('accepts a closing fence at EOF without trailing newline', () => {
    const markdown = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
      '```',
    ].join('\n');
    const result = parseReviewQueue(markdown);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data.items).toEqual([]);
  });
});

describe('parseReviewQueue — incomplete owned block', () => {
  it('returns malformed when heading and opening fence exist but closing fence is absent', () => {
    const markdown = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
      '',
    ].join('\n');
    const result = parseReviewQueue(markdown);
    expect(result.status).toBe('malformed');
    if (result.status !== 'malformed') return;
    expect(result.reason.toLowerCase()).toMatch(/closing fence|fence|unterminated/);
  });

  it('returns malformed when heading and opening fence exist with a malformed closing fence', () => {
    const markdown = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
      '```extra trailing text',
      '',
    ].join('\n');
    const result = parseReviewQueue(markdown);
    expect(result.status).toBe('malformed');
  });
});

describe('serializeReviewQueue — incomplete owned block', () => {
  it('refuses appendIfMissing when a recognizable owned block lacks a valid closing fence', () => {
    const markdown = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
    ].join('\n');
    const data: ReviewQueueData = {
      version: 1,
      items: [SAMPLE_ITEM],
      unknownFields: {},
    };
    const written = serializeReviewQueue(markdown, data, { appendIfMissing: true });
    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.reason.toLowerCase()).toMatch(/closing fence|fence|unterminated|malformed/);
  });
});

describe('serializeReviewQueue — known-field override defense', () => {
  it('does not let item.unknownFields override id, sourcePath, prompt, dueOn or status', () => {
    const markdown = notesWithOwnedBlock({ version: 1, items: [SAMPLE_ITEM] });
    const parsed = parseReviewQueue(markdown);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;

    const tampered: ReviewQueueData = {
      version: 1,
      items: [
        {
          ...parsed.data.items[0]!,
          unknownFields: {
            id: 'evil-id',
            sourcePath: '/etc/passwd',
            prompt: 'evil prompt',
            dueOn: '2099-01-01',
            status: 'cancelled',
            extra: 'kept',
          },
        },
      ],
      unknownFields: {},
    };

    const written = serializeReviewQueue(markdown, tampered);
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const reparsed = parseReviewQueue(written.markdown);
    expect(reparsed.status).toBe('ok');
    if (reparsed.status !== 'ok') return;
    const item = reparsed.data.items[0]!;
    expect(item.id).toBe(SAMPLE_ITEM.id);
    expect(item.sourcePath).toBe(SAMPLE_ITEM.sourcePath);
    expect(item.prompt).toBe(SAMPLE_ITEM.prompt);
    expect(item.dueOn).toBe(SAMPLE_ITEM.dueOn);
    expect(item.status).toBe(SAMPLE_ITEM.status);
    expect(item.unknownFields).toEqual({ extra: 'kept' });
  });
});

describe('parseReviewQueue — id and prompt validation', () => {
  it('rejects blank id', () => {
    const result = parseReviewQueue(
      notesWithOwnedBlock({ version: 1, items: [{ ...SAMPLE_ITEM, id: '' }] }),
    );
    expect(result.status).toBe('malformed');
  });

  it('rejects whitespace-only id', () => {
    const result = parseReviewQueue(
      notesWithOwnedBlock({ version: 1, items: [{ ...SAMPLE_ITEM, id: '   ' }] }),
    );
    expect(result.status).toBe('malformed');
  });

  it('rejects blank prompt', () => {
    const result = parseReviewQueue(
      notesWithOwnedBlock({ version: 1, items: [{ ...SAMPLE_ITEM, prompt: '' }] }),
    );
    expect(result.status).toBe('malformed');
  });

  it('rejects whitespace-only prompt', () => {
    const result = parseReviewQueue(
      notesWithOwnedBlock({ version: 1, items: [{ ...SAMPLE_ITEM, prompt: '\t\n' }] }),
    );
    expect(result.status).toBe('malformed');
  });
});

describe('isValidWorkspaceRelativeSourcePath', () => {
  it('rejects blank and whitespace-only paths', () => {
    expect(isValidWorkspaceRelativeSourcePath('')).toBe(false);
    expect(isValidWorkspaceRelativeSourcePath('   ')).toBe(false);
  });

  it('rejects absolute paths', () => {
    expect(isValidWorkspaceRelativeSourcePath('/etc/passwd')).toBe(false);
    expect(isValidWorkspaceRelativeSourcePath('/learning-records/foo.md')).toBe(false);
  });

  it('rejects backslash-rooted and Windows drive paths', () => {
    expect(isValidWorkspaceRelativeSourcePath('\\\\server\\share\\file.md')).toBe(false);
    expect(isValidWorkspaceRelativeSourcePath('C:\\Windows\\file.md')).toBe(false);
    expect(isValidWorkspaceRelativeSourcePath('C:file.md')).toBe(false);
  });

  it('rejects traversal segments', () => {
    expect(isValidWorkspaceRelativeSourcePath('../foo.md')).toBe(false);
    expect(isValidWorkspaceRelativeSourcePath('foo/../bar.md')).toBe(false);
    expect(isValidWorkspaceRelativeSourcePath('foo/./bar.md')).toBe(false);
    expect(isValidWorkspaceRelativeSourcePath('./foo.md')).toBe(false);
    expect(isValidWorkspaceRelativeSourcePath('..\\foo.md')).toBe(false);
  });

  it('rejects control characters including NUL', () => {
    expect(isValidWorkspaceRelativeSourcePath('foo\x00bar.md')).toBe(false);
    expect(isValidWorkspaceRelativeSourcePath('foo\x1fbar.md')).toBe(false);
    expect(isValidWorkspaceRelativeSourcePath('foo\x7fbar.md')).toBe(false);
  });

  it('accepts legitimate Unicode names and nested relative paths', () => {
    expect(isValidWorkspaceRelativeSourcePath('learning-records/2026-07-01-scales.md')).toBe(true);
    expect(isValidWorkspaceRelativeSourcePath('lessons/音阶/scale-练习.md')).toBe(true);
    expect(isValidWorkspaceRelativeSourcePath('a/b/c/d/deeply-nested-file.md')).toBe(true);
  });
});

describe('parseReviewQueue — sourcePath validation', () => {
  it('rejects traversal, absolute, backslash-rooted and control-char sourcePaths', () => {
    const badPaths = [
      '../escape.md',
      '/absolute.md',
      'C:\\drive.md',
      '\\\\share\\file.md',
      'foo\x00bar.md',
    ];
    for (const sourcePath of badPaths) {
      const result = parseReviewQueue(
        notesWithOwnedBlock({ version: 1, items: [{ ...SAMPLE_ITEM, sourcePath }] }),
      );
      expect(result.status).toBe('malformed');
    }
  });
});

describe('parseReviewQueue — CRLF surrounding preservation', () => {
  it('preserves CRLF line endings and bytes outside the owned block', () => {
    const before = '# Notes\r\n\r\nKeep this line.\r\n';
    const after = '\r\n\r\n## Footer\r\nkeep-byte-for-byte\r\n';
    const markdown = notesWithOwnedBlock(
      { version: 1, items: [SAMPLE_ITEM] },
      { before, after },
    );
    const parsed = parseReviewQueue(markdown);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;

    const written = serializeReviewQueue(markdown, parsed.data);
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    expect(written.markdown.startsWith(before)).toBe(true);
    expect(written.markdown.endsWith(after)).toBe(true);
    expect(written.markdown.indexOf(after)).toBe(
      written.markdown.length - after.length,
    );
  });
});

describe('parseReviewQueue — mixed complete + incomplete owned blocks', () => {
  const validBlock = notesWithOwnedBlock(
    { version: 1, items: [SAMPLE_ITEM] },
    { before: '# Notes\n\n', after: '\n\n' },
  );

  it('returns malformed when a valid owned block is followed by an unterminated second owned block (LF)', () => {
    const incomplete = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
    ].join('\n');
    const result = parseReviewQueue(validBlock + incomplete);
    expect(result.status).toBe('malformed');
    if (result.status !== 'malformed') return;
    expect(result.reason.toLowerCase()).toMatch(
      /multiple|unterminated|closing fence|malformed/,
    );
  });

  it('returns malformed when a valid owned block is followed by ```extra closing fence (LF)', () => {
    const badClose = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
      '```extra',
      '',
    ].join('\n');
    const result = parseReviewQueue(validBlock + badClose);
    expect(result.status).toBe('malformed');
  });

  it('returns malformed for valid + unterminated second block with CRLF', () => {
    const validCrlf = notesWithOwnedBlock(
      { version: 1, items: [SAMPLE_ITEM] },
      { before: '# Notes\r\n\r\n', after: '\r\n\r\n' },
    );
    const incomplete = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
    ].join('\r\n');
    const result = parseReviewQueue(validCrlf + incomplete);
    expect(result.status).toBe('malformed');
  });

  it('returns malformed for valid + ```extra second block with CRLF', () => {
    const validCrlf = notesWithOwnedBlock(
      { version: 1, items: [SAMPLE_ITEM] },
      { before: '# Notes\r\n\r\n', after: '\r\n\r\n' },
    );
    const badClose = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
      '```extra',
      '',
    ].join('\r\n');
    const result = parseReviewQueue(validCrlf + badClose);
    expect(result.status).toBe('malformed');
  });

  it('serializer refuses overwrite when a valid block is followed by an incomplete owned start', () => {
    const incomplete = [
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
    ].join('\n');
    const written = serializeReviewQueue(
      validBlock + incomplete,
      {
        version: 1,
        items: [{ ...SAMPLE_ITEM, unknownFields: {} }],
        unknownFields: {},
      },
      { appendIfMissing: true },
    );
    expect(written.ok).toBe(false);
  });
});

describe('serializeReviewQueue — proposed runtime data validation', () => {
  const markdown = notesWithOwnedBlock({ version: 1, items: [SAMPLE_ITEM] });
  const baseItem = { ...SAMPLE_ITEM, unknownFields: {} as Record<string, unknown> };

  it('refuses duplicate ids in proposed data', () => {
    const data = {
      version: 1 as const,
      items: [
        { ...baseItem },
        { ...baseItem, prompt: 'other' },
      ],
      unknownFields: {},
    };
    const written = serializeReviewQueue(markdown, data);
    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.reason.toLowerCase()).toMatch(/duplicate/);
  });

  it('refuses blank id and blank prompt in proposed data', () => {
    const blankId = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, id: '' }],
      unknownFields: {},
    });
    expect(blankId.ok).toBe(false);

    const blankPrompt = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, prompt: '   ' }],
      unknownFields: {},
    });
    expect(blankPrompt.ok).toBe(false);
  });

  it('refuses invalid and traversing sourcePath in proposed data', () => {
    for (const sourcePath of ['../escape.md', '/abs.md', 'C:\\x.md', 'foo\x00bar.md']) {
      const written = serializeReviewQueue(markdown, {
        version: 1,
        items: [{ ...baseItem, sourcePath }],
        unknownFields: {},
      });
      expect(written.ok).toBe(false);
    }
  });

  it('refuses impossible date and invalid status in proposed data', () => {
    const badDate = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, dueOn: '2026-02-30' }],
      unknownFields: {},
    });
    expect(badDate.ok).toBe(false);

    const badStatus = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, status: 'pending' as 'scheduled' }],
      unknownFields: {},
    });
    expect(badStatus.ok).toBe(false);
  });

  it('refuses structurally malformed proposed runtime values', () => {
    const noItems = serializeReviewQueue(markdown, {
      version: 1,
      items: null as unknown as ReviewQueueData['items'],
      unknownFields: {},
    });
    expect(noItems.ok).toBe(false);

    const notObjectItem = serializeReviewQueue(markdown, {
      version: 1,
      items: ['not-an-object' as unknown as ReviewQueueData['items'][number]],
      unknownFields: {},
    });
    expect(notObjectItem.ok).toBe(false);
  });

  it('returns ok:false for cyclic unknown values instead of throwing', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic['self'] = cyclic;
    const written = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, unknownFields: { cyclic } }],
      unknownFields: {},
    });
    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.reason.length).toBeGreaterThan(0);
  });

  it('returns ok:false for BigInt unknown values instead of throwing', () => {
    const written = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, unknownFields: { big: 1n } }],
      unknownFields: {},
    });
    expect(written.ok).toBe(false);
  });
});

describe('serializeReviewQueue — lossless JSON value validation', () => {
  const markdown = notesWithOwnedBlock({ version: 1, items: [SAMPLE_ITEM] });
  const baseItem = { ...SAMPLE_ITEM, unknownFields: {} as Record<string, unknown> };

  class CustomClass {
    x = 1;
  }

  /** Values JSON.stringify silently drops or rewrites — must refuse, not mutate. */
  const silentLossOrMutationCases: Array<{ name: string; value: unknown }> = [
    { name: 'undefined', value: undefined },
    { name: 'function', value: () => 1 },
    { name: 'symbol', value: Symbol('s') },
    { name: 'NaN', value: Number.NaN },
    { name: 'Infinity', value: Number.POSITIVE_INFINITY },
    { name: '-Infinity', value: Number.NEGATIVE_INFINITY },
    { name: 'Date', value: new Date('2026-07-14T00:00:00.000Z') },
    { name: 'Map', value: new Map([['a', 1]]) },
    { name: 'Set', value: new Set([1]) },
    { name: 'RegExp', value: /abc/i },
    { name: 'Uint8Array', value: new Uint8Array([1, 2, 3]) },
    { name: 'class instance', value: new CustomClass() },
    {
      name: 'object with custom toJSON',
      value: {
        x: 1,
        toJSON() {
          return { x: 99 };
        },
      },
    },
    {
      name: 'nested undefined property',
      value: { deep: { missing: undefined as unknown } },
    },
    {
      name: 'array hole rewritten via undefined element',
      value: [1, undefined as unknown, 3],
    },
  ];

  it.each(silentLossOrMutationCases)(
    'refuses top-level unknown field that is $name without modifying markdown',
    ({ value }) => {
      const original = markdown;
      const written = serializeReviewQueue(markdown, {
        version: 1,
        items: [{ ...baseItem }],
        unknownFields: { bad: value },
      });
      expect(written.ok).toBe(false);
      if (written.ok) return;
      expect(written.reason.length).toBeGreaterThan(0);
      expect(markdown).toBe(original);
    },
  );

  it.each(silentLossOrMutationCases)(
    'refuses item-level unknown field that is $name without modifying markdown',
    ({ value }) => {
      const original = markdown;
      const written = serializeReviewQueue(markdown, {
        version: 1,
        items: [{ ...baseItem, unknownFields: { bad: value } }],
        unknownFields: {},
      });
      expect(written.ok).toBe(false);
      if (written.ok) return;
      expect(written.reason.length).toBeGreaterThan(0);
      expect(markdown).toBe(original);
    },
  );

  it('refuses symbol keys in top-level and item-level unknown fields', () => {
    const topWithSymbol: Record<string, unknown> = { keep: 1 };
    Object.defineProperty(topWithSymbol, Symbol('hidden'), {
      value: 'x',
      enumerable: true,
    });
    const itemWithSymbol: Record<string, unknown> = { keep: 2 };
    Object.defineProperty(itemWithSymbol, Symbol('hidden'), {
      value: 'y',
      enumerable: true,
    });

    const top = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem }],
      unknownFields: topWithSymbol,
    });
    expect(top.ok).toBe(false);

    const item = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, unknownFields: itemWithSymbol }],
      unknownFields: {},
    });
    expect(item.ok).toBe(false);
  });

  it('round-trips deeply nested legal unknown JSON by value without dropping keys', () => {
    const nestedLeaf = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(nestedLeaf, 'k', {
      value: 'v',
      writable: true,
      enumerable: true,
      configurable: true,
    });
    const nested = {
      a: null,
      b: true,
      c: false,
      d: 'str',
      e: 0,
      f: -1.5,
      g: [1, { inner: false, empty: [] as unknown[] }, null],
      h: nestedLeaf,
      i: { nested: { deeper: { n: 42 } } },
    };

    const data: ReviewQueueData = {
      version: 1,
      items: [
        {
          ...baseItem,
          unknownFields: { nestedItem: nested, tag: 'item-extra' },
        },
      ],
      unknownFields: { nestedTop: nested, schemaNote: 'future' },
    };

    const written = serializeReviewQueue(markdown, data);
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const reparsed = parseReviewQueue(written.markdown);
    expect(reparsed.status).toBe('ok');
    if (reparsed.status !== 'ok') return;

    expect(reparsed.data.unknownFields).toEqual({
      nestedTop: {
        a: null,
        b: true,
        c: false,
        d: 'str',
        e: 0,
        f: -1.5,
        g: [1, { inner: false, empty: [] }, null],
        h: { k: 'v' },
        i: { nested: { deeper: { n: 42 } } },
      },
      schemaNote: 'future',
    });
    expect(reparsed.data.items[0]?.unknownFields).toEqual({
      nestedItem: {
        a: null,
        b: true,
        c: false,
        d: 'str',
        e: 0,
        f: -1.5,
        g: [1, { inner: false, empty: [] }, null],
        h: { k: 'v' },
        i: { nested: { deeper: { n: 42 } } },
      },
      tag: 'item-extra',
    });
  });
});

describe('serializeReviewQueue — non-data JSON shapes and safe traversal', () => {
  const markdown = notesWithOwnedBlock({ version: 1, items: [SAMPLE_ITEM] });
  const baseItem = { ...SAMPLE_ITEM, unknownFields: {} as Record<string, unknown> };

  function expectStructuredRefuse(written: SerializeReviewQueueResult, original: string): void {
    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.reason.length).toBeGreaterThan(0);
    expect(markdown).toBe(original);
  }

  it('refuses array own extra property (including undefined) that JSON.stringify would drop', () => {
    const original = markdown;
    const arr: unknown[] = [1];
    // Own non-index key: silent loss under JSON.stringify → [1] only.
    (arr as unknown as { extra?: unknown }).extra = undefined;

    const top = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem }],
      unknownFields: { a: arr },
    });
    expectStructuredRefuse(top, original);

    const item = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, unknownFields: { a: arr } }],
      unknownFields: {},
    });
    expectStructuredRefuse(item, original);

    const nested = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem }],
      unknownFields: { wrap: { nested: arr } },
    });
    expectStructuredRefuse(nested, original);
  });

  it('refuses non-enumerable own properties and symbol keys on arrays', () => {
    const original = markdown;
    const withHidden: unknown[] = [1];
    Object.defineProperty(withHidden, 'hidden', {
      value: 'x',
      enumerable: false,
      writable: true,
      configurable: true,
    });
    const withSymbol: unknown[] = [1];
    Object.defineProperty(withSymbol, Symbol('s'), {
      value: 'y',
      enumerable: true,
    });

    expectStructuredRefuse(
      serializeReviewQueue(markdown, {
        version: 1,
        items: [{ ...baseItem }],
        unknownFields: { withHidden },
      }),
      original,
    );
    expectStructuredRefuse(
      serializeReviewQueue(markdown, {
        version: 1,
        items: [{ ...baseItem, unknownFields: { withSymbol } }],
        unknownFields: {},
      }),
      original,
    );
  });

  it('refuses array index accessors without invoking the getter', () => {
    const original = markdown;
    let getterCalls = 0;
    const arr: unknown[] = [];
    Object.defineProperty(arr, '0', {
      get() {
        getterCalls += 1;
        return 1;
      },
      enumerable: true,
      configurable: true,
    });
    // Dense length so only the index shape is the issue (not a hole).
    Object.defineProperty(arr, 'length', {
      value: 1,
      writable: true,
      enumerable: false,
      configurable: false,
    });

    const written = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem }],
      unknownFields: { arr },
    });
    expectStructuredRefuse(written, original);
    expect(getterCalls).toBe(0);
  });

  it('refuses plain-object enumerable getters without invoking them or throwing', () => {
    const original = markdown;
    let getterCalls = 0;
    const bag: Record<string, unknown> = {};
    Object.defineProperty(bag, 'boom', {
      get() {
        getterCalls += 1;
        throw new Error('getter must not run');
      },
      enumerable: true,
      configurable: true,
    });

    const written = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem }],
      unknownFields: bag,
    });
    expectStructuredRefuse(written, original);
    expect(getterCalls).toBe(0);
  });

  it('refuses null-prototype object accessors without invoking them', () => {
    const original = markdown;
    let getterCalls = 0;
    const bag = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(bag, 'secret', {
      get() {
        getterCalls += 1;
        return 'nope';
      },
      enumerable: true,
      configurable: true,
    });

    const top = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem }],
      unknownFields: bag,
    });
    expectStructuredRefuse(top, original);
    expect(getterCalls).toBe(0);

    const itemBag = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(itemBag, 'secret', {
      get() {
        getterCalls += 1;
        return 'nope';
      },
      enumerable: true,
      configurable: true,
    });
    const item = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, unknownFields: itemBag }],
      unknownFields: {},
    });
    expectStructuredRefuse(item, original);
    expect(getterCalls).toBe(0);
  });

  it('refuses -0 in top-level and item-level unknown fields (JSON rewrites to 0)', () => {
    const original = markdown;
    const top = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem }],
      unknownFields: { negZero: -0 },
    });
    expectStructuredRefuse(top, original);

    const item = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, unknownFields: { negZero: -0 } }],
      unknownFields: {},
    });
    expectStructuredRefuse(item, original);

    // Nested -0 must also refuse.
    const nested = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem }],
      unknownFields: { wrap: { n: -0 } },
    });
    expectStructuredRefuse(nested, original);

    // Ordinary finite numbers remain allowed.
    const ok = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, unknownFields: { n: 0, m: -1.5 } }],
      unknownFields: { p: 42 },
    });
    expect(ok.ok).toBe(true);
  });

  it('allows shared object references but refuses true cycles', () => {
    const shared = { x: 1, y: [true, null] };
    const withShared = { a: shared, b: shared };
    const sharedOk = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem, unknownFields: { graph: withShared } }],
      unknownFields: { graph: withShared },
    });
    expect(sharedOk.ok).toBe(true);
    if (!sharedOk.ok) return;
    const reparsed = parseReviewQueue(sharedOk.markdown);
    expect(reparsed.status).toBe('ok');
    if (reparsed.status !== 'ok') return;
    expect(reparsed.data.unknownFields).toEqual({
      graph: { a: { x: 1, y: [true, null] }, b: { x: 1, y: [true, null] } },
    });
    expect(reparsed.data.items[0]?.unknownFields).toEqual({
      graph: { a: { x: 1, y: [true, null] }, b: { x: 1, y: [true, null] } },
    });

    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic['self'] = cyclic;
    const cycleRefuse = serializeReviewQueue(markdown, {
      version: 1,
      items: [{ ...baseItem }],
      unknownFields: { cyclic },
    });
    expect(cycleRefuse.ok).toBe(false);
  });

  it('returns structured failure for ~20k-deep cycle without RangeError', () => {
    const original = markdown;
    const root: Record<string, unknown> = { n: 0 };
    let cursor = root;
    for (let i = 1; i < 20_000; i++) {
      const next: Record<string, unknown> = { n: i };
      cursor['child'] = next;
      cursor = next;
    }
    // True cycle at depth ~20k — recursive walk would RangeError.
    cursor['child'] = root;

    let thrown: unknown;
    let written: SerializeReviewQueueResult | undefined;
    try {
      written = serializeReviewQueue(markdown, {
        version: 1,
        items: [{ ...baseItem }],
        unknownFields: { deep: root },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeUndefined();
    expect(written).toBeDefined();
    expectStructuredRefuse(written!, original);
  });

  it('still round-trips legal dense nested arrays and plain/null-prototype objects', () => {
    const leaf = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(leaf, 'ok', {
      value: [1, 2, { z: [null, false] }],
      writable: true,
      enumerable: true,
      configurable: true,
    });
    const dense = {
      list: [[{ a: 1 }, { b: [2, 3] }], []],
      leaf,
    };
    const data: ReviewQueueData = {
      version: 1,
      items: [{ ...baseItem, unknownFields: { dense } }],
      unknownFields: { dense },
    };
    const written = serializeReviewQueue(markdown, data);
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    const again = parseReviewQueue(written.markdown);
    expect(again.status).toBe('ok');
    if (again.status !== 'ok') return;
    expect(again.data.unknownFields).toEqual({
      dense: {
        list: [[{ a: 1 }, { b: [2, 3] }], []],
        leaf: { ok: [1, 2, { z: [null, false] }] },
      },
    });
    expect(again.data.items[0]?.unknownFields).toEqual({
      dense: {
        list: [[{ a: 1 }, { b: [2, 3] }], []],
        leaf: { ok: [1, 2, { z: [null, false] }] },
      },
    });
  });
});

describe('parseReviewQueue — hostile unknown keys', () => {
  it('round-trips top-level __proto__, constructor and prototype without pollution', () => {
    const body = {
      version: 1,
      items: [SAMPLE_ITEM],
      __proto__: { polluted: true },
      constructor: { x: 1 },
      prototype: { y: 2 },
    };
    // JSON.stringify on a plain object literal drops special __proto__ syntax;
    // build the body text so those keys are real own properties in the fence.
    const json = [
      '{',
      '  "version": 1,',
      '  "items": [' + JSON.stringify(SAMPLE_ITEM) + '],',
      '  "__proto__": {"polluted": true},',
      '  "constructor": {"x": 1},',
      '  "prototype": {"y": 2}',
      '}',
    ].join('\n');
    const markdown =
      '# Notes\n\n## Review queue\n\n```kimi-study-review-queue-v1\n' +
      json +
      '\n```\n';

    const beforeProto = Object.prototype as { polluted?: unknown };
    delete beforeProto.polluted;

    const parsed = parseReviewQueue(markdown);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;

    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(Object.hasOwn(parsed.data.unknownFields, '__proto__')).toBe(true);
    expect(Object.hasOwn(parsed.data.unknownFields, 'constructor')).toBe(true);
    expect(Object.hasOwn(parsed.data.unknownFields, 'prototype')).toBe(true);
    expect(parsed.data.unknownFields['__proto__']).toEqual({ polluted: true });
    expect(parsed.data.unknownFields['constructor']).toEqual({ x: 1 });
    expect(parsed.data.unknownFields['prototype']).toEqual({ y: 2 });

    const written = serializeReviewQueue(markdown, parsed.data);
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const again = parseReviewQueue(written.markdown);
    expect(again.status).toBe('ok');
    if (again.status !== 'ok') return;
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(Object.hasOwn(again.data.unknownFields, '__proto__')).toBe(true);
    expect(again.data.unknownFields['__proto__']).toEqual({ polluted: true });
    expect(again.data.unknownFields['constructor']).toEqual({ x: 1 });
    expect(again.data.unknownFields['prototype']).toEqual({ y: 2 });
  });

  it('round-trips item-level __proto__, constructor and prototype without pollution', () => {
    const json = [
      '{',
      '  "version": 1,',
      '  "items": [',
      '    {',
      '      "id": "rev-1",',
      '      "sourcePath": "learning-records/2026-07-01-scales.md",',
      '      "prompt": "Explain why the C major scale starts on C",',
      '      "dueOn": "2026-07-14",',
      '      "status": "scheduled",',
      '      "__proto__": {"itemPolluted": true},',
      '      "constructor": 9,',
      '      "prototype": "kept"',
      '    }',
      '  ]',
      '}',
    ].join('\n');
    const markdown =
      '## Review queue\n\n```kimi-study-review-queue-v1\n' + json + '\n```\n';

    const parsed = parseReviewQueue(markdown);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    const item = parsed.data.items[0]!;
    expect(Object.prototype).not.toHaveProperty('itemPolluted');
    expect(Object.hasOwn(item.unknownFields, '__proto__')).toBe(true);
    expect(item.unknownFields['__proto__']).toEqual({ itemPolluted: true });
    expect(item.unknownFields['constructor']).toBe(9);
    expect(item.unknownFields['prototype']).toBe('kept');

    const written = serializeReviewQueue(markdown, parsed.data);
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    const again = parseReviewQueue(written.markdown);
    expect(again.status).toBe('ok');
    if (again.status !== 'ok') return;
    expect(Object.prototype).not.toHaveProperty('itemPolluted');
    expect(Object.hasOwn(again.data.items[0]!.unknownFields, '__proto__')).toBe(true);
    expect(again.data.items[0]!.unknownFields['__proto__']).toEqual({
      itemPolluted: true,
    });
  });
});

describe('parseReviewQueue — examples inside non-owned fences', () => {
  const ownedExample = [
    '## Review queue',
    '',
    '```kimi-study-review-queue-v1',
    '{"version":1,"items":[]}',
    '```',
  ].join('\n');

  it('treats a complete owned-looking block inside a tilde fence as ordinary markdown (missing)', () => {
    const markdown = ['# Notes', '', '~~~', ownedExample, '~~~', ''].join('\n');
    const result = parseReviewQueue(markdown);
    expect(result.status).toBe('missing');
    // Byte-for-byte: the example remains when we only parse.
    expect(markdown).toContain(ownedExample);
  });

  it('treats a complete owned-looking block inside a four-backtick fence as missing', () => {
    const markdown = ['# Notes', '', '````markdown', ownedExample, '````', ''].join(
      '\n',
    );
    const result = parseReviewQueue(markdown);
    expect(result.status).toBe('missing');
  });

  it('appendIfMissing appends a real owned block after a tilde-enclosed example without mutating it', () => {
    const enclosing = ['# Notes', '', '~~~', ownedExample, '~~~', ''].join('\n');
    const data: ReviewQueueData = {
      version: 1,
      items: [{ ...SAMPLE_ITEM, unknownFields: {} }],
      unknownFields: {},
    };
    const written = serializeReviewQueue(enclosing, data, { appendIfMissing: true });
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    // The enclosed example bytes are preserved intact.
    expect(written.markdown.startsWith(enclosing)).toBe(true);
    // Exactly one real (outer) owned block is parseable.
    const parsed = parseReviewQueue(written.markdown);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.data.items).toEqual([{ ...SAMPLE_ITEM, unknownFields: {} }]);
  });

  it('appendIfMissing appends after a four-backtick enclosure that contains a three-backtick owned example', () => {
    const enclosing = [
      '# Notes',
      '',
      '````text',
      ownedExample,
      '````',
      '',
    ].join('\n');
    const data: ReviewQueueData = {
      version: 1,
      items: [{ ...SAMPLE_ITEM, unknownFields: {} }],
      unknownFields: {},
    };
    const written = serializeReviewQueue(enclosing, data, { appendIfMissing: true });
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(written.markdown.startsWith(enclosing)).toBe(true);
    const parsed = parseReviewQueue(written.markdown);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.data.items[0]?.id).toBe(SAMPLE_ITEM.id);
  });

  // CommonMark fenced code open/close lines may be indented 0–3 spaces.
  // 4+ spaces is an indented code block, not a fence — do not treat as enclosure.
  it.each([
    {
      name: '1-space tilde fence, matching indented close',
      open: ' ~~~',
      close: ' ~~~',
    },
    {
      name: '2-space tilde fence, unindented close',
      open: '  ~~~',
      close: '~~~',
    },
    {
      name: '3-space tilde fence, 3-space close',
      open: '   ~~~',
      close: '   ~~~',
    },
    {
      name: '1-space four-backtick fence with info, matching indented close',
      open: ' ````markdown',
      close: ' ````',
    },
    {
      name: '2-space four-backtick fence, unindented close',
      open: '  ````markdown',
      close: '````',
    },
    {
      name: '3-space four-backtick fence, 1-space close',
      open: '   ````',
      close: ' ````',
    },
  ])(
    'treats owned-looking bytes inside $name as missing and appends outside',
    ({ open, close }) => {
      const enclosing = ['# Notes', '', open, ownedExample, close, ''].join('\n');
      expect(parseReviewQueue(enclosing).status).toBe('missing');

      const data: ReviewQueueData = {
        version: 1,
        items: [{ ...SAMPLE_ITEM, unknownFields: {} }],
        unknownFields: {},
      };
      const written = serializeReviewQueue(enclosing, data, { appendIfMissing: true });
      expect(written.ok).toBe(true);
      if (!written.ok) return;
      // Enclosed example bytes stay untouched; real owned block is appended after.
      expect(written.markdown.startsWith(enclosing)).toBe(true);
      const parsed = parseReviewQueue(written.markdown);
      expect(parsed.status).toBe('ok');
      if (parsed.status !== 'ok') return;
      expect(parsed.data.items).toEqual([{ ...SAMPLE_ITEM, unknownFields: {} }]);
    },
  );

  it('does not treat a 4-space-indented fence-looking line as a CommonMark enclosure', () => {
    // 4 spaces → indented code block in CommonMark, not a fence open/close.
    // The column-0 owned block that follows must still be recognized.
    const markdown = [
      '# Notes',
      '',
      '    ~~~',
      'not a fence',
      '    ~~~',
      '',
      '## Review queue',
      '',
      '```kimi-study-review-queue-v1',
      '{"version":1,"items":[]}',
      '```',
      '',
    ].join('\n');
    const result = parseReviewQueue(markdown);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data.items).toEqual([]);
  });
});
