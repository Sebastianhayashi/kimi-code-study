<!-- apps/kimi-web/src/study/StudyDemoApp.vue -->
<!-- Dev-only controlled demo fixture (enable with ?study-demo=1 in dev). All
     data is in-memory snapshot state; no real learning progress, persistence,
     or backend integration is claimed. The product flow lives in StudyApp.vue. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppearance } from '../composables/client/useAppearance';
import Button from '../components/ui/Button.vue';
import Icon from '../components/ui/Icon.vue';
import Sheet from '../components/ui/Sheet.vue';
import StudyHome from './components/StudyHome.vue';
import StudyDetail from './components/StudyDetail.vue';
import StudyNew from './components/StudyNew.vue';
import StudyLessonChrome from './components/StudyLessonChrome.vue';
import StudyLessonReader from './components/StudyLessonReader.vue';
import {
  createStudyDemoState,
  selectCurrentLessonSource,
  selectCurrentQuickrefSource,
  transitionStudyDemo,
} from './domain/studyDemo';
import type { StudyDemoEvent } from './domain/studyDemo';

const { t } = useI18n();
useAppearance();

const state = ref(createStudyDemoState());

function dispatch(event: StudyDemoEvent): void {
  state.value = transitionStudyDemo(state.value, event);
}

const title = computed(() => t('study.title'));
watch(
  title,
  (value) => {
    if (typeof document !== 'undefined') {
      document.title = value;
    }
  },
  { immediate: true },
);

const activeStudy = computed(() =>
  state.value.studies.find((s) => s.id === state.value.activeStudyId),
);

const activeLesson = computed(() => {
  const study = activeStudy.value;
  if (!study) return undefined;
  return (
    study.lessons.find((l) => l.id === state.value.lessonId) ??
    study.lessons.find((l) => l.id === study.currentLessonId) ??
    study.lessons[0]
  );
});

const lessonSource = computed(() => selectCurrentLessonSource(state.value));
const quickrefSource = computed(() => selectCurrentQuickrefSource(state.value));

const hasPrevLesson = computed(() => {
  const study = activeStudy.value;
  const lesson = activeLesson.value;
  if (!study || !lesson) return false;
  const idx = study.lessons.findIndex((l) => l.id === lesson.id);
  return idx > 0;
});

const hasNextLesson = computed(() => {
  const study = activeStudy.value;
  const lesson = activeLesson.value;
  if (!study || !lesson) return false;
  const idx = study.lessons.findIndex((l) => l.id === lesson.id);
  return idx >= 0 && idx < study.lessons.length - 1;
});

// Responsive quickref: bottom sheet on mobile, side panel on desktop.
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024);
function onResize() {
  windowWidth.value = window.innerWidth;
}
onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => window.removeEventListener('resize', onResize));
const isMobile = computed(() => windowWidth.value < 640);
</script>

<template>
  <div class="study-app" :data-view="state.view">
    <header class="study-topbar">
      <div class="study-brand">
        <span class="study-logo" aria-hidden="true">K</span>
        <h1 class="study-name">{{ t('study.title') }}</h1>
      </div>
      <div class="study-learner">
        <span class="study-learner-label">{{ t('study.currentLearner') }}</span>
        <span class="study-learner-name">{{ state.learnerName }}</span>
      </div>
    </header>

    <main class="study-main">
      <StudyHome
        v-if="state.view === 'home'"
        :studies="state.studies"
        :active-study-id="state.activeStudyId"
        @continue="dispatch({ type: 'continue-study', studyId: $event })"
        @select="dispatch({ type: 'select-study', studyId: $event })"
        @new="dispatch({ type: 'go-new-study' })"
      />

      <StudyDetail
        v-else-if="state.view === 'detail' && activeStudy"
        :study="activeStudy"
        @back="dispatch({ type: 'go-home' })"
        @continue="dispatch({ type: 'continue-study', studyId: $event })"
        @open-lesson="dispatch({ type: 'open-lesson', studyId: activeStudy.id, lessonId: $event })"
      />

      <StudyNew
        v-else-if="state.view === 'new'"
        :new-flow="state.newFlow"
        @back="dispatch({ type: 'go-home' })"
        @upload="dispatch({ type: 'upload-complete', material: $event })"
        @mission-next="dispatch({ type: 'mission-next', answer: $event })"
        @mission-done="dispatch({ type: 'mission-done' })"
      />

      <section
        v-else-if="state.view === 'lesson' && lessonSource"
        class="study-lesson"
        :aria-label="t('study.lessonLabel')"
      >
        <StudyLessonChrome
          :title="lessonSource.title"
          :has-prev="hasPrevLesson"
          :has-next="hasNextLesson"
          @back="dispatch({ type: 'go-home' })"
          @prev="dispatch({ type: 'prev-lesson' })"
          @next="dispatch({ type: 'next-lesson' })"
          @quickref="dispatch({ type: 'open-quickref' })"
        />

        <div class="study-lesson-body">
          <div class="study-reader-wrap">
            <StudyLessonReader
              :source="lessonSource"
              :show-practice-action="false"
            />
          </div>

          <!-- Desktop quickref side panel -->
          <aside
            v-if="state.quickrefOpen && !isMobile && quickrefSource"
            class="study-quickref-panel"
          >
            <div class="study-quickref-head">
              <h2 class="study-quickref-title">{{ t('study.quickref.title') }}</h2>
              <Button variant="ghost" size="sm" @click="dispatch({ type: 'close-quickref' })">
                <Icon name="close" size="md" />
              </Button>
            </div>
            <div class="study-quickref-body">
              <StudyLessonReader
                :source="quickrefSource"
                :show-practice-action="false"
              />
            </div>
          </aside>
        </div>
      </section>
    </main>

    <!-- Mobile quickref bottom sheet -->
    <Sheet
      v-if="isMobile"
      :open="state.quickrefOpen"
      :title="t('study.quickref.title')"
      @close="dispatch({ type: 'close-quickref' })"
      @update:open="dispatch({ type: 'close-quickref' })"
    >
      <div v-if="quickrefSource" class="study-quickref-sheet-body">
        <StudyLessonReader
          :source="quickrefSource"
          :show-practice-action="false"
        />
      </div>
    </Sheet>
  </div>
</template>

<style scoped>
.study-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-ui);
}

.study-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-shrink: 0;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface);
}

.study-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.study-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  font-weight: var(--weight-semibold);
  font-size: var(--text-base);
  flex: none;
}

.study-name {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  white-space: nowrap;
}

.study-learner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  min-width: 0;
}

.study-learner-name {
  color: var(--color-text);
  font-weight: var(--weight-medium);
}

.study-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.study-lesson {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.study-lesson-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.study-reader-wrap {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.study-quickref-panel {
  width: 380px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-line);
  background: var(--color-surface);
}

.study-quickref-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-line);
}

.study-quickref-title {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  line-height: var(--leading-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-quickref-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.study-quickref-sheet-body {
  height: 60vh;
  min-height: 300px;
}

@media (max-width: 640px) {
  .study-lesson-chrome :deep(.ui-button) {
    min-height: 44px;
  }
}
</style>
