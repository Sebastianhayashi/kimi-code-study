import { describe, expect, it } from 'vitest';

import type { AppMessage } from '../src/api/types';
import {
  buildTutorThread,
  isTutorUserMessage,
  messageText,
} from '../src/study/domain/tutorThread';

function message(
  id: string,
  role: AppMessage['role'],
  text: string,
  createdAt: string,
  metadata?: Record<string, unknown>,
): AppMessage {
  return {
    id,
    sessionId: 'session-1',
    role,
    content: [{ type: 'text', text }],
    createdAt,
    metadata,
  };
}

describe('messageText', () => {
  it('joins text blocks and ignores non-text content', () => {
    const combined: AppMessage = {
      id: 'm1',
      sessionId: 'session-1',
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'hidden' },
        { type: 'text', text: 'First.' },
        { type: 'toolUse', toolCallId: 't1', toolName: 'read', input: {} },
        { type: 'text', text: 'Second.' },
      ],
      createdAt: '2026-07-17T00:00:01.000Z',
    };
    expect(messageText(combined)).toBe('First.\nSecond.');
  });
});

describe('buildTutorThread', () => {
  it('pairs marked questions with the replies that follow them', () => {
    const thread = buildTutorThread([
      message('u1', 'user', 'Start the quick survey', '2026-07-17T00:00:00.000Z', {
        kimiStudyOperationId: 'op-1',
      }),
      message('a1', 'assistant', 'Working on the survey.', '2026-07-17T00:00:01.000Z'),
      message('u2', 'user', 'Tutor wrapper text', '2026-07-17T00:00:02.000Z', {
        kimiStudyTutor: '1',
        kimiStudyTutorText: 'What is a feedback loop?',
      }),
      message('a2', 'assistant', 'A loop where output feeds back as input.', '2026-07-17T00:00:03.000Z'),
      message('u3', 'user', 'Generate the course', '2026-07-17T00:00:04.000Z', {
        kimiStudyOperationId: 'op-2',
      }),
      message('a3', 'assistant', 'Generating.', '2026-07-17T00:00:05.000Z'),
    ]);

    expect(thread).toHaveLength(1);
    expect(thread[0]!.question).toBe('What is a feedback loop?');
    expect(thread[0]!.answer).toBe('A loop where output feeds back as input.');
  });

  it('sorts by createdAt before pairing', () => {
    const thread = buildTutorThread([
      message('a1', 'assistant', 'An answer.', '2026-07-17T00:00:02.000Z'),
      message('u1', 'user', 'A question?', '2026-07-17T00:00:01.000Z', { kimiStudyTutor: '1' }),
    ]);
    expect(thread).toHaveLength(1);
    expect(thread[0]!.answer).toBe('An answer.');
  });

  it('leaves unanswered questions without an answer', () => {
    const thread = buildTutorThread([
      message('u1', 'user', 'Still waiting?', '2026-07-17T00:00:01.000Z', { kimiStudyTutor: '1' }),
    ]);
    expect(thread).toHaveLength(1);
    expect(thread[0]!.answer).toBeUndefined();
  });

  it('does not treat workflow prompts as tutor questions', () => {
    expect(isTutorUserMessage(message('u1', 'user', 'op', '2026-07-17T00:00:00.000Z', {
      kimiStudyOperationId: 'op-1',
    }))).toBe(false);
  });
});
