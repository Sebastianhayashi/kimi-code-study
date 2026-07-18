/**
 * Tutor thread projection for the course tutor drawer.
 *
 * Tutor exchanges are ordinary session messages: learner questions carry the
 * `kimiStudyTutor` metadata marker, and assistant replies are the messages
 * that follow until the next user message. Workflow prompts (course start,
 * generation, plan edits) never enter the tutor thread.
 */

import type { AppMessage, AppMessageContent } from '../../api/types';

export const TUTOR_METADATA_FLAG = 'kimiStudyTutor' as const;
export const TUTOR_METADATA_TEXT = 'kimiStudyTutorText' as const;

type TextBlock = Extract<AppMessageContent, { type: 'text' }>;

export interface TutorExchange {
  readonly id: string;
  readonly question: string;
  readonly answer?: string;
  readonly createdAt: string;
}

/** Concatenated visible text of one message (text blocks only). */
export function messageText(message: AppMessage): string {
  return message.content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

export function isTutorUserMessage(message: AppMessage): boolean {
  return message.role === 'user' && message.metadata?.[TUTOR_METADATA_FLAG] === '1';
}

/**
 * Pair marked learner questions with the assistant replies that follow them.
 * Input order does not matter; messages are sorted by `createdAt` first.
 */
export function buildTutorThread(messages: readonly AppMessage[]): TutorExchange[] {
  const sorted = [...messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const exchanges: TutorExchange[] = [];
  let answers: string[] | undefined;

  for (const message of sorted) {
    if (message.role === 'user') {
      answers = undefined;
      if (isTutorUserMessage(message)) {
        const marked = message.metadata?.[TUTOR_METADATA_TEXT];
        const question = typeof marked === 'string' && marked.trim().length > 0
          ? marked.trim()
          : messageText(message);
        exchanges.push({ id: message.id, question, createdAt: message.createdAt });
        answers = [];
      }
      continue;
    }
    if (message.role === 'assistant' && answers !== undefined) {
      const text = messageText(message);
      if (text.length > 0) answers.push(text);
      const last = exchanges[exchanges.length - 1];
      if (last !== undefined) {
        exchanges[exchanges.length - 1] = { ...last, answer: answers.join('\n\n') };
      }
    }
  }

  return exchanges;
}
