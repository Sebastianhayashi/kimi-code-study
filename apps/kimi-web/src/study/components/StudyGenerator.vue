<!--
  StudyGenerator — Coursebox builder layout on the kimi-native design system.

  Left MAIN area is stage-driven (UX v2 state machine):
    interview — guide card pointing at the chat;
    reading   — reading-gate progress card (coverage bar + current range);
    outline/ready/learning — course card (stats + generation progress) +
    chapter accordions + published lessons.
  Right FIXED 400px column = tutor chat (minimalChrome ConversationPane).
  Bottom full-width primary button follows the same state machine.

  Data: polls MISSION.md / source/BOOK-READING-STATE.md (reading stage only) /
  source/TEACHING-MAP.md / lessons/ every 3s. No timers, no invented data.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../../components/ui/Button.vue';
import Card from '../../components/ui/Card.vue';
import Badge from '../../components/ui/Badge.vue';
import Icon from '../../components/ui/Icon.vue';
import StudyChat from './StudyChat.vue';
import { useKimiWebClient } from '../../composables/useKimiWebClient';
import {
  listLessonFiles,
  readHtmlTitles,
  readWorkspaceText,
  requestLessonGeneration,
} from '../studyClient';
import {
  deriveCourseStage,
  lessonTitleFromFile,
  parseMissionTitle,
  parseReadingState,
  parseTeachingMap,
} from '../domain/teachFiles';
import type { CourseStage, ReadingProgress, TeachingMapOutline } from '../domain/teachFiles';
import type { StudyRoute } from '../domain/studyRoute';

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ navigate: [route: StudyRoute] }>();
const { t } = useI18n();
const client = useKimiWebClient();

const missionTitle = ref<string>('');
const sessionTitle = ref<string>('');
const outline = ref<TeachingOutlineState>({ kind: 'missing' });
const reading = ref<ReadingProgress | null>(null);
const lessonFiles = ref<string[]>([]);
const lessonTitles = ref<Record<string, string>>({});
const pollError = ref('');
const generating = ref(false);

/** Chapter headers: numeric ids render as 第 N 章, named ids as-is. */
function chapterLabel(chapterId: string, index: number): string {
  return /^\d+$/.test(chapterId)
    ? t('study.generator.chapterNth', { n: chapterId })
    : `${index + 1}. ${chapterId}`;
}

function lessonTitle(file: string): string {
  return lessonTitles.value[file] ?? lessonTitleFromFile(file);
}

type TeachingOutlineState =
  | { kind: 'missing' }
  | { kind: 'ready'; map: TeachingMapOutline };

const stage = computed<CourseStage>(() =>
  deriveCourseStage({
    hasMission: missionTitle.value !== '',
    mapStatus: outline.value.kind === 'ready' ? outline.value.map.status : null,
    lessonCount: lessonFiles.value.length,
  }),
);

const courseTitle = computed(
  () => missionTitle.value || sessionTitle.value || t('study.generator.untitled'),
);

const running = computed(() => client.activity.value !== 'idle');

const chapterCount = computed(() =>
  outline.value.kind === 'ready' ? outline.value.map.chapters.length : 0,
);
const lessonCount = computed(() =>
  outline.value.kind === 'ready' ? outline.value.map.lessonCount : 0,
);

/** Published lessons vs the map — drives the honest generation progress. */
const generationProgress = computed(() => {
  const done = lessonFiles.value.length;
  const total = lessonCount.value;
  if (done === 0 || total === 0 || done >= total) return null;
  return { done, total };
});

const canGenerate = computed(
  () =>
    (stage.value === 'outline' || stage.value === 'ready') &&
    !running.value &&
    !generating.value,
);

const primaryLabel = computed(() => {
  switch (stage.value) {
    case 'outline':
      return t('study.generator.confirmGenerate');
    case 'ready':
      return t('study.generator.generate');
    case 'learning':
      return t('study.generator.enterCourse');
    default:
      return t('study.generator.generate');
  }
});

const primaryEnabled = computed(() => {
  if (stage.value === 'learning') return lessonFiles.value.length > 0;
  return canGenerate.value;
});

const stageMessage = computed(() => {
  switch (stage.value) {
    case 'interview':
      return { title: t('study.generator.stage.interview'), hint: t('study.generator.stage.interviewHint') };
    case 'reading':
      return { title: t('study.generator.stage.reading'), hint: t('study.generator.stage.readingHint') };
    case 'outline':
      return { title: t('study.generator.stage.outline'), hint: t('study.generator.stage.outlineHint') };
    case 'ready':
      return { title: t('study.generator.stage.ready'), hint: t('study.generator.stage.readyHint') };
    case 'learning':
      return { title: t('study.generator.stage.learning'), hint: '' };
    case 'stale':
      return { title: t('study.generator.stage.stale'), hint: t('study.generator.stage.staleHint') };
  }
});

async function poll(): Promise<void> {
  try {
    const wantReading = missionTitle.value !== '' && outline.value.kind === 'missing';
    const [mission, map, readingState, lessons] = await Promise.all([
      readWorkspaceText(props.sessionId, 'MISSION.md'),
      readWorkspaceText(props.sessionId, 'source/TEACHING-MAP.md'),
      wantReading
        ? readWorkspaceText(props.sessionId, 'source/BOOK-READING-STATE.md')
        : Promise.resolve(null),
      listLessonFiles(props.sessionId),
    ]);
    missionTitle.value = mission === null ? '' : (parseMissionTitle(mission) ?? '');
    outline.value = map === null ? { kind: 'missing' } : { kind: 'ready', map: parseTeachingMap(map) };
    if (readingState !== null) reading.value = parseReadingState(readingState);
    // Lesson titles come from each HTML <title> — fetch only when the list
    // changes, not on every poll tick.
    if (lessons.join('') !== lessonFiles.value.join('')) {
      void readHtmlTitles(props.sessionId, 'lessons', lessons).then((titles) => {
        lessonTitles.value = { ...lessonTitles.value, ...titles };
      });
    }
    lessonFiles.value = lessons;
    pollError.value = '';
  } catch (error) {
    pollError.value = error instanceof Error ? error.message : String(error);
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  // 'none': the study screens own the URL (hash router) — the client store
  // must not rewrite it to /sessions/{id}.
  void client.selectSession(props.sessionId, { urlMode: 'none' });
  sessionTitle.value =
    client.sessions.value.find((s) => s.id === props.sessionId)?.title ?? '';
  void poll();
  pollTimer = setInterval(() => {
    void poll();
  }, 3000);
});

onUnmounted(() => {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});

async function onPrimary(): Promise<void> {
  if (stage.value === 'learning') {
    const first = lessonFiles.value[0];
    if (first !== undefined) {
      emit('navigate', { name: 'learner', sessionId: props.sessionId, lessonFile: first });
    }
    return;
  }
  if (!canGenerate.value) return;
  generating.value = true;
  try {
    await requestLessonGeneration(props.sessionId);
  } catch (error) {
    pollError.value = error instanceof Error ? error.message : String(error);
  } finally {
    generating.value = false;
  }
}

function openLesson(file: string): void {
  emit('navigate', { name: 'learner', sessionId: props.sessionId, lessonFile: file });
}
</script>

<template>
  <div class="generator">
    <div class="gen-body">
      <section class="outline-main">
        <Card v-if="stage === 'interview'" class="stage-card">
          <div class="stage-icon"><Icon name="message" size="lg" /></div>
          <h2 class="stage-title">{{ stageMessage.title }}</h2>
          <p class="stage-hint-block">{{ stageMessage.hint }}</p>
        </Card>

        <Card v-else-if="stage === 'reading'" class="stage-card">
          <h2 class="stage-title">
            <Icon name="clock" size="md" /> {{ stageMessage.title }}
          </h2>
          <template v-if="reading !== null">
            <div class="reading-bar">
              <div
                class="reading-bar-fill"
                :style="{ width: `${reading.coverage ?? 0}%` }"
              />
            </div>
            <div class="reading-stats">
              <span v-if="reading.coverage !== null">{{ reading.coverage }}%</span>
              <span v-if="reading.totalRanges > 0">
                · {{ reading.readRanges }}/{{ reading.totalRanges }}
                {{ t('study.generator.readingRanges') }}
              </span>
            </div>
            <div v-if="reading.currentRange" class="reading-current">
              {{ t('study.generator.readingNow') }}：{{ reading.currentRange }}
            </div>
            <div v-if="reading.bookTitle" class="reading-book">《{{ reading.bookTitle }}》</div>
          </template>
          <p class="stage-hint-block">{{ stageMessage.hint }}</p>
        </Card>

        <template v-else>
          <Card class="course-card">
            <h1 class="course-title">{{ courseTitle }}</h1>
            <div class="course-stats">
              <span class="stat">
                <strong>{{ chapterCount }}</strong> {{ t('study.generator.statChapters') }}
              </span>
              <span class="stat">
                <strong>{{ lessonCount }}</strong> {{ t('study.generator.statLessons') }}
              </span>
              <span v-if="lessonFiles.length > 0" class="stat stat-published">
                <strong>{{ lessonFiles.length }}</strong> {{ t('study.generator.statPublished') }}
              </span>
            </div>
            <div v-if="generationProgress !== null" class="gen-progress">
              <Icon name="bolt" size="sm" />
              {{
                t('study.generator.generatingProgress', {
                  done: generationProgress.done,
                  total: generationProgress.total,
                })
              }}
            </div>
            <div v-if="stageMessage.hint" class="stage-hint">{{ stageMessage.hint }}</div>
            <div v-if="pollError" class="poll-error">{{ pollError }}</div>
          </Card>

          <div v-if="outline.kind === 'ready'" class="chapters">
            <details
              v-for="(chapter, ci) in outline.map.chapters"
              :key="chapter.id"
              class="chapter"
              open
            >
              <summary class="chapter-summary">
                <span class="chapter-caret" aria-hidden="true">▾</span>
                <span class="chapter-no">{{ chapterLabel(chapter.id, ci) }}</span>
                <span class="chapter-count">
                  {{ t('study.generator.chapterLessons', { count: chapter.lessons.length }) }}
                </span>
              </summary>
              <ul class="chapter-lessons">
                <li v-for="lesson in chapter.lessons" :key="lesson.sliceId" class="lesson-row">
                  <span class="lesson-slice">{{ lesson.sliceId }}</span>
                  <span class="lesson-capability">{{ lesson.capability }}</span>
                </li>
              </ul>
            </details>
          </div>

          <Card v-if="lessonFiles.length > 0" class="published">
            <div class="published-title">
              {{ t('study.generator.lessonsReady', { count: lessonFiles.length }) }}
            </div>
            <ul class="published-list">
              <li v-for="file in lessonFiles" :key="file">
                <button type="button" class="published-link" @click="openLesson(file)">
                  {{ lessonTitle(file) }}
                </button>
              </li>
            </ul>
          </Card>
        </template>
      </section>

      <aside class="chat-col">
        <header class="chat-rail-header">
          <span class="chat-rail-title">{{ courseTitle }}</span>
          <Badge>{{ stageMessage.title }}</Badge>
        </header>
        <StudyChat />
      </aside>
    </div>

    <footer class="gen-footer">
      <Button
        variant="primary"
        size="lg"
        class="primary-wide"
        :disabled="!primaryEnabled"
        :loading="generating"
        @click="onPrimary"
      >
        {{ generating ? t('study.generator.generating') : primaryLabel }}
      </Button>
    </footer>
  </div>
</template>

<style scoped>
.generator {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.gen-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.outline-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: var(--space-6) var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* --- stage cards (interview / reading) --- */
.stage-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.stage-icon {
  color: var(--color-accent);
}

.stage-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 16px;
  font-weight: var(--weight-semibold);
  margin: 0;
}

.stage-hint-block {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-muted);
}

.reading-bar {
  height: 6px;
  border-radius: var(--radius-xs);
  background: var(--color-surface-sunken);
  overflow: hidden;
}

.reading-bar-fill {
  height: 100%;
  border-radius: var(--radius-xs);
  background: var(--color-accent);
  transition: width 0.4s ease;
}

.reading-stats {
  font-size: 13px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.reading-current {
  font-size: 12.5px;
  color: var(--color-text-faint);
}

.reading-book {
  font-size: 12.5px;
  color: var(--color-text-faint);
}

/* --- course card + outline --- */
.course-card :first-child {
  margin-top: 0;
}

.course-title {
  font-size: 22px;
  font-weight: var(--weight-semibold);
  margin: 0 0 var(--space-3);
  line-height: 1.3;
}

.course-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5);
  font-size: 13px;
  color: var(--color-text-muted);
}

.course-stats strong {
  font-size: 16px;
  color: var(--color-text);
  margin-right: var(--space-1);
}

.stat-published strong {
  color: var(--color-success);
}

.gen-progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  font-size: 13px;
  color: var(--color-accent);
}

.stage-hint {
  margin-top: var(--space-3);
  font-size: 12.5px;
  color: var(--color-text-faint);
  line-height: 1.6;
}

.poll-error {
  margin-top: var(--space-2);
  font-size: 12px;
  color: var(--color-danger);
}

.chapters {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.chapter {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-line);
  border-radius: 12px;
  overflow: hidden;
}

.chapter-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 12px var(--space-4);
  cursor: pointer;
  list-style: none;
  font-size: 15px;
  font-weight: var(--weight-semibold);
}

.chapter-summary::-webkit-details-marker {
  display: none;
}

.chapter-summary:hover {
  background: var(--color-hover);
}

.chapter-caret {
  transition: transform 0.15s ease;
  transform: rotate(-90deg);
  color: var(--color-text-faint);
  font-size: 12px;
}

.chapter[open] .chapter-caret {
  transform: rotate(0deg);
}

.chapter-no {
  color: var(--color-text-faint);
}

.chapter-count {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-faint);
}

.chapter-lessons {
  list-style: none;
  margin: 0;
  padding: 0 var(--space-4) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.lesson-row {
  display: flex;
  gap: var(--space-2);
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-surface-sunken);
}

.lesson-slice {
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.published-title {
  font-size: 13px;
  font-weight: var(--weight-semibold);
  color: var(--color-success);
  margin-bottom: var(--space-2);
}

.published-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.published-link {
  border: none;
  background: none;
  padding: 4px 0;
  font-size: 13px;
  color: var(--color-accent);
  cursor: pointer;
  text-align: left;
}

.published-link:hover {
  text-decoration: underline;
}

/* --- chat rail --- */
.chat-col {
  flex: none;
  width: 400px;
  border-left: 1px solid var(--color-line);
  background: var(--color-bg);
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-rail-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px var(--space-4);
  border-bottom: 1px solid var(--color-line);
  font-size: 13px;
}

.chat-rail-title {
  flex: 1;
  min-width: 0;
  font-weight: var(--weight-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gen-footer {
  flex: none;
  display: flex;
  justify-content: center;
  padding: var(--space-3) var(--space-6) var(--space-5);
}

/* Coursebox generate button: centred pill, min(400px,100%) × 44, radius 50. */
.primary-wide {
  width: min(400px, 100%);
  border-radius: var(--radius-full);
  font-weight: var(--weight-semibold) !important;
  transition:
    background 0.15s,
    transform 0.1s !important;
}

@media (max-width: 900px) {
  .gen-body {
    flex-direction: column;
    overflow-y: auto;
  }

  .chat-col {
    width: 100%;
    border-left: none;
    border-top: 1px solid var(--color-line);
    min-height: 420px;
  }
}
</style>
