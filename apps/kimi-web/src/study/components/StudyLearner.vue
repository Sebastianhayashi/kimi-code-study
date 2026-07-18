<!--
  StudyLearner — Coursebox learner layout on the kimi-native design system:
  left lesson tree (+ durable reference pages), main sandboxed reader with a
  "what this lesson gets you" band (from the lesson brief), right-slide tutor
  drawer carrying the current-lesson context chip, bottom prev/next bar.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../../components/ui/Button.vue';
import Icon from '../../components/ui/Icon.vue';
import Spinner from '../../components/ui/Spinner.vue';
import StudyChat from './StudyChat.vue';
import StudyLessonReader from './StudyLessonReader.vue';
import { useKimiWebClient } from '../../composables/useKimiWebClient';
import {
  listLessonFiles,
  listReferenceFiles,
  readHtmlTitles,
  readLessonBriefText,
  readWorkspaceText,
} from '../studyClient';
import { lessonTitleFromFile, parseLessonBrief } from '../domain/teachFiles';
import type { LessonSource } from '../domain/lessonDocument';
import type { StudyRoute } from '../domain/studyRoute';

const props = defineProps<{ sessionId: string; lessonFile: string }>();
const emit = defineEmits<{ navigate: [route: StudyRoute] }>();
const { t } = useI18n();
const client = useKimiWebClient();

const lessonFiles = ref<string[]>([]);
const referenceFiles = ref<string[]>([]);
const lessonTitles = ref<Record<string, string>>({});
const lessonHtml = ref<string | null>(null);
const capability = ref('');
const loading = ref(true);
const loadError = ref('');
const tutorOpen = ref(false);

function displayTitle(dir: 'lessons' | 'reference', file: string): string {
  return lessonTitles.value[`${dir}/${file}`] ?? lessonTitleFromFile(file);
}

/** Reference pages load from reference/; lessons from lessons/. */
const isReference = computed(() => props.lessonFile.includes('/'));
const filePath = computed(() =>
  isReference.value ? props.lessonFile : `lessons/${props.lessonFile}`,
);
const fileTitle = computed(() => {
  const base = props.lessonFile.split('/').pop() ?? '';
  return (
    lessonTitles.value[props.lessonFile] ??
    lessonTitles.value[`lessons/${base}`] ??
    lessonTitles.value[`reference/${base}`] ??
    lessonTitleFromFile(base)
  );
});

const currentIndex = computed(() => lessonFiles.value.indexOf(props.lessonFile));
const total = computed(() => lessonFiles.value.length);
const hasPrev = computed(() => currentIndex.value > 0);
const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < total.value - 1);

const source = computed<LessonSource>(() => ({
  path: filePath.value,
  title: fileTitle.value,
  html: lessonHtml.value ?? '',
  state: loadError.value !== '' ? 'error' : 'ok',
  error: loadError.value !== '' ? loadError.value : undefined,
}));

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  capability.value = '';
  try {
    const [lessons, references, html, brief] = await Promise.all([
      listLessonFiles(props.sessionId),
      listReferenceFiles(props.sessionId),
      readWorkspaceText(props.sessionId, filePath.value),
      isReference.value
        ? Promise.resolve(null)
        : readLessonBriefText(props.sessionId, props.lessonFile),
    ]);
    lessonFiles.value = lessons;
    referenceFiles.value = references;
    lessonHtml.value = html;
    void Promise.all([
      readHtmlTitles(props.sessionId, 'lessons', lessons),
      readHtmlTitles(props.sessionId, 'reference', references),
    ]).then(([lt, rt]) => {
      const merged: Record<string, string> = {};
      for (const [k, v] of Object.entries(lt)) merged[`lessons/${k}`] = v;
      for (const [k, v] of Object.entries(rt)) merged[`reference/${k}`] = v;
      lessonTitles.value = { ...lessonTitles.value, ...merged };
    });
    if (html === null) {
      loadError.value = t('study.learner.empty');
    }
    if (brief !== null) {
      capability.value = parseLessonBrief(brief).capability;
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  // 'none': the study hash router owns the URL.
  void client.selectSession(props.sessionId, { urlMode: 'none' });
  void load();
});

watch(
  () => props.lessonFile,
  () => {
    void load();
  },
);

function goTo(file: string): void {
  emit('navigate', { name: 'learner', sessionId: props.sessionId, lessonFile: file });
}

function goPrev(): void {
  const prev = lessonFiles.value[currentIndex.value - 1];
  if (prev !== undefined) goTo(prev);
}

function goNext(): void {
  const next = lessonFiles.value[currentIndex.value + 1];
  if (next !== undefined) goTo(next);
}

function backToOutline(): void {
  emit('navigate', { name: 'generator', sessionId: props.sessionId });
}
</script>

<template>
  <div class="learner">
    <aside class="toc">
      <Button variant="ghost" size="sm" class="toc-back" @click="backToOutline">
        ← {{ t('study.learner.back') }}
      </Button>
      <div class="toc-title">{{ t('study.learner.tocTitle') }}</div>
      <ul class="toc-list">
        <li v-for="(file, index) in lessonFiles" :key="file">
          <button
            type="button"
            class="toc-item"
            :class="{ 'toc-item-active': file === lessonFile }"
            @click="goTo(file)"
          >
            <span class="toc-no">{{ index + 1 }}.</span>
            <span class="toc-name">{{ displayTitle('lessons', file) }}</span>
          </button>
        </li>
      </ul>
      <template v-if="referenceFiles.length > 0">
        <div class="toc-title toc-title-ref">{{ t('study.learner.refTitle') }}</div>
        <ul class="toc-list">
          <li v-for="file in referenceFiles" :key="file">
            <button
              type="button"
              class="toc-item"
              :class="{ 'toc-item-active': `reference/${file}` === lessonFile }"
              @click="goTo(`reference/${file}`)"
            >
              <Icon name="file" size="sm" />
              <span class="toc-name">{{ displayTitle('reference', file) }}</span>
            </button>
          </li>
        </ul>
      </template>
    </aside>

    <main class="reader">
      <div v-if="loading" class="reader-loading"><Spinner size="md" /></div>
      <template v-else-if="lessonHtml !== null">
        <div v-if="capability" class="lesson-band">
          <span class="lesson-band-label">{{ t('study.learner.bandLabel') }}</span>
          <span class="lesson-band-text">{{ capability }}</span>
        </div>
        <StudyLessonReader
          :source="source"
          :chrome="false"
          :show-practice-action="false"
          @start-practice="tutorOpen = true"
        />
      </template>
      <div v-else class="reader-empty">{{ loadError }}</div>

      <footer class="reader-nav">
        <Button variant="ghost" size="md" :disabled="!hasPrev" @click="goPrev">
          ← {{ t('study.learner.prev') }}
        </Button>
        <Button variant="secondary" size="md" @click="tutorOpen = true">
          {{ t('study.learner.askTutor') }}
        </Button>
        <Button variant="primary" size="md" :disabled="!hasNext" @click="goNext">
          {{ t('study.learner.next') }} →
        </Button>
      </footer>
    </main>

    <!-- Right-slide tutor drawer (Coursebox-style AI advisor panel). -->
    <transition name="tutor-slide">
      <aside v-if="tutorOpen" class="tutor-panel">
        <header class="tutor-header">
          <span class="tutor-title">{{ t('study.learner.askTutor') }}</span>
          <span class="tutor-context">
            <Icon name="file" size="sm" /> {{ fileTitle }}
          </span>
          <button type="button" class="tutor-close" @click="tutorOpen = false">
            <Icon name="close" size="sm" />
          </button>
        </header>
        <div class="tutor-body">
          <StudyChat />
        </div>
      </aside>
    </transition>
  </div>
</template>

<style scoped>
.learner {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
}

.toc {
  flex: none;
  width: 240px;
  border-right: 1px solid var(--color-line);
  background: var(--color-sidebar-bg);
  padding: var(--space-4) var(--space-3);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.toc-back {
  align-self: flex-start;
}

.toc-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-faint);
  padding: 0 6px;
}

.toc-title-ref {
  margin-top: var(--space-4);
}

.toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toc-item {
  width: 100%;
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  border: none;
  background: none;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-muted);
  cursor: pointer;
  text-align: left;
}

.toc-item:hover {
  background: var(--color-hover);
}

.toc-item-active {
  background: var(--color-selected);
  color: var(--color-text);
  font-weight: 600;
}

.toc-no {
  font-variant-numeric: tabular-nums;
  flex: none;
}

.reader {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.reader-loading,
.reader-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-faint);
}

.lesson-band {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: 10px var(--space-5);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface-raised);
  font-size: 13px;
  line-height: 1.6;
}

.lesson-band-label {
  flex: none;
  font-weight: 600;
  color: var(--color-accent);
}

.lesson-band-text {
  color: var(--color-text-muted);
}

.reader-nav {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  background: var(--color-bg);
  border-top: 1px solid var(--color-line);
}

/* --- tutor drawer (right slide) --- */
.tutor-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 400px;
  max-width: 90%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border-left: 1px solid var(--color-line);
  box-shadow: -8px 0 24px rgb(0 0 0 / 8%);
  z-index: 20;
}

.tutor-slide-enter-active,
.tutor-slide-leave-active {
  transition: transform 0.2s ease;
}

.tutor-slide-enter-from,
.tutor-slide-leave-to {
  transform: translateX(100%);
}

.tutor-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px var(--space-4);
  border-bottom: 1px solid var(--color-line);
}

.tutor-title {
  font-size: 14px;
  font-weight: 600;
}

.tutor-context {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: 12px;
  color: var(--color-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tutor-close {
  border: none;
  background: none;
  padding: 4px;
  cursor: pointer;
  color: var(--color-text-faint);
  display: inline-flex;
  border-radius: 6px;
}

.tutor-close:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.tutor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

@media (max-width: 900px) {
  .toc {
    display: none;
  }

  .tutor-panel {
    width: 100%;
    max-width: 100%;
  }
}
</style>
