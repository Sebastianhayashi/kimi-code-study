<!-- apps/kimi-web/src/study/components/product/StudyLearning.vue -->
<!-- Learner surface: numbered lesson tree, sandboxed lesson reader, and a
     page-context tutor drawer. Lessons publish incrementally — the tree grows
     as the engine publishes; nothing is shown before it exists on disk. The
     tutor never exposes session/model/permission controls. -->
<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../../../components/ui/Button.vue';
import Card from '../../../components/ui/Card.vue';
import Icon from '../../../components/ui/Icon.vue';
import IconButton from '../../../components/ui/IconButton.vue';
import Spinner from '../../../components/ui/Spinner.vue';
import StudyLessonReader from '../StudyLessonReader.vue';
import {
  extractHtmlTitle,
  STUDY_PRODUCT_INJECTION_KEY,
  type CourseSnapshot,
  type LessonSource,
  type TutorExchange,
} from '../../foundation';

const props = defineProps<{
  snapshot: CourseSnapshot;
  busy: boolean;
}>();

const emit = defineEmits<{
  upgrade: [];
  home: [];
}>();

const { t } = useI18n();
const product = inject(STUDY_PRODUCT_INJECTION_KEY)!;

const showUpgrade = computed(() => props.snapshot.profile?.mode === 'quick');

const lessonsLabel = computed(() =>
  t('study.product.lessonsReady', {
    published: props.snapshot.generation.publishedLessons,
    total: props.snapshot.generation.totalLessons ?? props.snapshot.generation.publishedLessons,
  }));

// --- Lesson tree: read from the workspace, ordered by file name. ---
interface LessonEntry {
  readonly path: string;
  readonly title: string;
}

const lessons = ref<readonly LessonEntry[]>([]);
const treeUnavailable = ref(false);
const currentPath = ref<string | undefined>(undefined);
const currentLesson = ref<LessonSource | undefined>(undefined);

async function loadTree(): Promise<void> {
  const files = await product.listCourseFiles('lessons');
  if (files === undefined) {
    treeUnavailable.value = true;
    return;
  }
  treeUnavailable.value = false;
  const htmlFiles = files
    .filter((file) => file.name.endsWith('.html'))
    .sort((left, right) => left.name.localeCompare(right.name));
  const entries: LessonEntry[] = [];
  for (const file of htmlFiles) {
    const path = `lessons/${file.name}`;
    let title = file.name.replace(/\.html$/, '');
    const head = await product.loadCourseText(path, 8192);
    if (head.status === 'ready') {
      title = extractHtmlTitle(head.content) ?? title;
    }
    entries.push({ path, title });
  }
  lessons.value = entries;
  if (currentPath.value === undefined || !entries.some((entry) => entry.path === currentPath.value)) {
    const first = entries[0];
    if (first !== undefined) await selectLesson(first.path);
  }
}

async function selectLesson(path: string): Promise<void> {
  currentPath.value = path;
  currentLesson.value = undefined;
  const loaded = await product.loadCourseText(path);
  const entry = lessons.value.find((candidate) => candidate.path === path);
  if (loaded.status !== 'ready') {
    currentLesson.value = {
      path,
      title: entry?.title ?? path,
      html: '',
      state: 'error',
      error: t('study.product.lessonLoadError'),
    };
    return;
  }
  currentLesson.value = {
    path,
    title: entry?.title ?? path,
    html: loaded.content,
    state: loaded.truncated ? 'truncated' : 'ok',
  };
}

const currentIndex = computed(() =>
  lessons.value.findIndex((entry) => entry.path === currentPath.value));

const hasPrev = computed(() => currentIndex.value > 0);
const hasNext = computed(() =>
  currentIndex.value >= 0 && currentIndex.value < lessons.value.length - 1);

async function prevLesson(): Promise<void> {
  const entry = lessons.value[currentIndex.value - 1];
  if (entry !== undefined) await selectLesson(entry.path);
}

async function nextLesson(): Promise<void> {
  const entry = lessons.value[currentIndex.value + 1];
  if (entry !== undefined) await selectLesson(entry.path);
}

// --- Tutor drawer: page-context questions, answer polling while waiting. ---
const tutorOpen = ref(false);
const exchanges = ref<readonly TutorExchange[]>([]);
const tutorInput = ref('');
const tutorSending = ref(false);
let tutorTimer: ReturnType<typeof setInterval> | undefined;

async function reloadTutor(): Promise<void> {
  try {
    exchanges.value = await product.listTutorExchanges();
  } catch {
    // Keep the last known thread; the next poll retries.
  }
}

function stopTutorPolling(): void {
  if (tutorTimer !== undefined) {
    clearInterval(tutorTimer);
    tutorTimer = undefined;
  }
}

function startTutorPolling(): void {
  stopTutorPolling();
  tutorTimer = setInterval(() => { void reloadTutor(); }, 4000);
}

async function toggleTutor(): Promise<void> {
  tutorOpen.value = !tutorOpen.value;
  if (tutorOpen.value) {
    await reloadTutor();
    startTutorPolling();
  } else {
    stopTutorPolling();
  }
}

async function sendTutor(): Promise<void> {
  const text = tutorInput.value.trim();
  if (text.length === 0 || tutorSending.value) return;
  tutorSending.value = true;
  try {
    const entry = lessons.value[currentIndex.value];
    await product.sendTutorMessage(text, {
      lessonPath: entry?.path,
      lessonTitle: entry?.title,
    });
    tutorInput.value = '';
    await reloadTutor();
  } finally {
    tutorSending.value = false;
  }
}

onMounted(() => { void loadTree(); });
onUnmounted(stopTutorPolling);
watch(() => props.snapshot.generation.publishedLessons, () => { void loadTree(); });
</script>

<template>
  <div class="study-learn">
    <header class="study-learn-chrome">
      <Button variant="ghost" size="sm" @click="emit('home')">
        <span class="study-icon-flip" aria-hidden="true"><Icon name="arrow-right" size="sm" /></span>
        <span>{{ t('study.product.backHome') }}</span>
      </Button>
      <h1 class="study-learn-title" :title="snapshot.source.title">{{ snapshot.source.title }}</h1>
      <div class="study-learn-chrome-actions">
        <Button variant="ghost" size="sm" :disabled="!hasPrev" @click="prevLesson">
          <span class="study-icon-flip" aria-hidden="true"><Icon name="arrow-right" size="sm" /></span>
          <span>{{ t('study.lesson.prevLesson') }}</span>
        </Button>
        <Button variant="ghost" size="sm" :disabled="!hasNext" @click="nextLesson">
          <span>{{ t('study.lesson.nextLesson') }}</span>
          <Icon name="arrow-right" size="sm" />
        </Button>
        <Button
          :variant="tutorOpen ? 'secondary' : 'primary'"
          size="sm"
          @click="toggleTutor"
        >
          <Icon name="message" size="sm" />
          <span>{{ t('study.product.tutorOpen') }}</span>
        </Button>
      </div>
    </header>

    <div class="study-learn-body">
      <aside class="study-learn-tree">
        <p class="study-learn-progress">{{ lessonsLabel }}</p>
        <div class="study-learn-bar" role="progressbar">
          <div
            class="study-learn-bar-fill"
            :style="{
              width: `${(snapshot.generation.totalLessons ?? 0) > 0
                ? (snapshot.generation.publishedLessons / (snapshot.generation.totalLessons ?? 1)) * 100
                : 100}%`,
            }"
          />
        </div>
        <p v-if="treeUnavailable" class="study-learn-tree-note">
          {{ t('study.product.lessonsUnavailable') }}
        </p>
        <ol v-else class="study-learn-tree-list">
          <li v-for="(entry, index) in lessons" :key="entry.path">
            <button
              type="button"
              class="study-learn-tree-item"
              :class="{ 'is-active': entry.path === currentPath }"
              @click="selectLesson(entry.path)"
            >
              <span class="study-learn-tree-seq">{{ index + 1 }}</span>
              <span class="study-learn-tree-title">{{ entry.title }}</span>
            </button>
          </li>
        </ol>

        <Card v-if="showUpgrade" class="study-upgrade">
          <div class="study-upgrade-copy">
            <span class="study-upgrade-title">{{ t('study.product.upgradeTitle') }}</span>
            <span class="study-upgrade-desc">{{ t('study.product.upgradeDesc') }}</span>
          </div>
          <Button variant="secondary" size="sm" :disabled="busy" @click="emit('upgrade')">
            <Icon name="sparkles" size="sm" />
            <span>{{ t('study.product.upgradeAction') }}</span>
          </Button>
        </Card>
      </aside>

      <section class="study-learn-reader" :aria-label="t('study.lessonLabel')">
        <StudyLessonReader
          v-if="currentLesson"
          :source="currentLesson"
          :show-practice-action="false"
        />
        <div v-else class="study-learn-reader-empty">
          <Spinner size="lg" />
        </div>
      </section>

      <aside v-if="tutorOpen" class="study-tutor" :aria-label="t('study.product.tutorTitle')">
        <div class="study-tutor-head">
          <h2 class="study-tutor-title">{{ t('study.product.tutorTitle') }}</h2>
          <IconButton
            size="sm"
            :label="t('study.product.tutorClose')"
            @click="toggleTutor"
          >
            <Icon name="close" size="md" />
          </IconButton>
        </div>
        <p v-if="lessons[currentIndex]" class="study-tutor-context">
          {{ t('study.product.tutorContext', { title: lessons[currentIndex]!.title }) }}
        </p>

        <div class="study-tutor-thread">
          <p v-if="exchanges.length === 0" class="study-tutor-empty">
            {{ t('study.product.tutorEmpty') }}
          </p>
          <div v-for="exchange in exchanges" :key="exchange.id" class="study-tutor-exchange">
            <p class="study-tutor-question">{{ exchange.question }}</p>
            <p v-if="exchange.answer" class="study-tutor-answer">{{ exchange.answer }}</p>
            <p v-else class="study-tutor-waiting">{{ t('study.product.tutorWaiting') }}</p>
          </div>
        </div>

        <div class="study-tutor-compose">
          <textarea
            v-model="tutorInput"
            class="study-tutor-input"
            rows="2"
            :placeholder="t('study.product.tutorPlaceholder')"
            @keydown.enter.exact.prevent="sendTutor"
          />
          <Button
            variant="primary"
            size="sm"
            :disabled="tutorInput.trim().length === 0"
            :loading="tutorSending"
            @click="sendTutor"
          >
            <Icon name="send" size="sm" />
            <span>{{ t('study.product.tutorSend') }}</span>
          </Button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.study-learn {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.study-learn-chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface);
}

.study-learn-title {
  flex: 1;
  min-width: 0;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  line-height: var(--leading-tight);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-learn-chrome-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.study-icon-flip {
  display: inline-flex;
  transform: scaleX(-1);
}

.study-learn-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.study-learn-tree {
  width: 280px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-right: 1px solid var(--color-line);
  background: var(--color-surface);
  overflow-y: auto;
}

.study-learn-progress {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.study-learn-bar {
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  overflow: hidden;
}

.study-learn-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  transition: width var(--duration-base) var(--ease-out);
}

.study-learn-tree-note {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-learn-tree-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.study-learn-tree-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.study-learn-tree-item:hover {
  background: var(--color-surface-sunken);
}

.study-learn-tree-item.is-active {
  background: var(--color-surface-sunken);
  font-weight: var(--weight-medium);
}

.study-learn-tree-seq {
  flex: none;
  width: 20px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  text-align: right;
  line-height: var(--leading-relaxed);
}

.study-learn-tree-title {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
}

.study-learn-reader {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.study-learn-reader-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.study-tutor {
  width: 360px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-line);
  background: var(--color-surface);
}

.study-tutor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-line);
}

.study-tutor-title {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}

.study-tutor-context {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-line);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-tutor-thread {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
}

.study-tutor-empty {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-tutor-exchange {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-tutor-question {
  align-self: flex-end;
  max-width: 90%;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
  color: var(--color-text);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
}

.study-tutor-answer {
  font-size: var(--text-sm);
  color: var(--color-text);
  line-height: var(--leading-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
}

.study-tutor-waiting {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.study-tutor-compose {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-line);
}

.study-tutor-input {
  flex: 1;
  resize: none;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
}

.study-tutor-input:focus {
  outline: none;
  border-color: var(--color-accent-bd);
}

.study-upgrade {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

.study-upgrade-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.study-upgrade-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.study-upgrade-desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

@media (max-width: 900px) {
  .study-learn-tree {
    width: 200px;
  }

  .study-tutor {
    position: absolute;
    inset: 0;
    width: auto;
    z-index: var(--z-sticky);
  }
}
</style>
