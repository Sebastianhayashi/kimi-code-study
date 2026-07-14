<!-- apps/kimi-web/src/study/components/StudyHome.vue -->
<!-- Study home: continue learning + my studies + new study. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../../components/ui/Button.vue';
import Card from '../../components/ui/Card.vue';
import Badge from '../../components/ui/Badge.vue';
import Icon from '../../components/ui/Icon.vue';
import EmptyState from '../../components/ui/EmptyState.vue';
import type { Study, StudyLesson } from '../../types/study';

const props = defineProps<{
  studies: Study[];
  activeStudyId?: string;
}>();

const emit = defineEmits<{
  continue: [studyId: string];
  select: [studyId: string];
  new: [];
}>();

const { t } = useI18n();

const activeStudy = computed<Study | undefined>(() =>
  props.studies.find((s) => s.id === props.activeStudyId),
);

const currentLesson = computed<StudyLesson | undefined>(() => {
  const study = activeStudy.value;
  if (!study) return undefined;
  return (
    study.lessons.find((l) => l.id === study.currentLessonId) ?? study.lessons[0]
  );
});

const currentLessonIndex = computed<number>(() => {
  const study = activeStudy.value;
  const lesson = currentLesson.value;
  if (!study || !lesson) return 0;
  return study.lessons.findIndex((l) => l.id === lesson.id) + 1;
});

function statusVariant(status: Study['status']) {
  switch (status) {
    case 'completed':
      return 'success' as const;
    case 'in-progress':
      return 'info' as const;
    default:
      return 'neutral' as const;
  }
}

function statusLabel(status: Study['status']) {
  switch (status) {
    case 'completed':
      return t('study.status.completed');
    case 'in-progress':
      return t('study.status.inProgress');
    default:
      return t('study.status.notStarted');
  }
}
</script>

<template>
  <section class="study-home" aria-labelledby="study-home-title">
    <div class="study-home-content">
      <h1 id="study-home-title" class="study-home-title">{{ t('study.title') }}</h1>

      <!-- Continue learning -->
      <div v-if="activeStudy && currentLesson" class="study-continue-section">
        <h2 class="study-section-label">{{ t('study.continueCardLabel') }}</h2>
        <Card class="study-continue-card" elevated>
          <div class="study-continue-card-body">
            <div class="study-continue-meta">
              <span class="study-continue-emoji" aria-hidden="true">{{ activeStudy.emoji }}</span>
              <Badge :variant="statusVariant(activeStudy.status)">
                {{ statusLabel(activeStudy.status) }}
              </Badge>
            </div>
            <div class="study-continue-study-title">{{ activeStudy.title }}</div>
            <div class="study-continue-lesson">
              {{ t('study.lessonCount', { current: currentLessonIndex, total: activeStudy.lessons.length }) }}
            </div>
            <div class="study-continue-lesson-title">{{ currentLesson.title }}</div>
          </div>
          <template #foot>
            <Button
              variant="primary"
              size="lg"
              class="study-continue-button"
              @click="emit('continue', activeStudy.id)"
            >
              <Icon name="play" size="md" />
              {{ t('study.continueLearning') }}
            </Button>
          </template>
        </Card>
      </div>

      <!-- My studies -->
      <div class="study-list-section">
        <h2 class="study-section-label">{{ t('study.myStudies') }}</h2>
        <div v-if="studies.length" class="study-list">
          <Card
            v-for="study in studies"
            :key="study.id"
            class="study-list-item"
            tabindex="0"
            role="button"
            :aria-label="t('study.myStudies') + ': ' + study.title"
            @click="emit('select', study.id)"
            @keydown.enter="emit('select', study.id)"
            @keydown.space.prevent="emit('select', study.id)"
          >
            <div class="study-list-item-main">
              <span class="study-list-item-emoji" aria-hidden="true">{{ study.emoji }}</span>
              <div class="study-list-item-text">
                <div class="study-list-item-title">{{ study.title }}</div>
                <div class="study-list-item-count">
                  {{ t('study.lessonCount', { current: study.lessons.filter((l) => l.records.length > 0).length, total: study.lessons.length }) }}
                </div>
              </div>
            </div>
            <Badge :variant="statusVariant(study.status)" size="sm">
              {{ statusLabel(study.status) }}
            </Badge>
          </Card>
        </div>
        <EmptyState v-else :title="t('study.emptyStudiesTitle')" :hint="t('study.emptyStudiesHint')">
          <template #icon>
            <Icon name="file-text" size="lg" />
          </template>
        </EmptyState>
      </div>

      <!-- New study -->
      <Button
        variant="secondary"
        size="lg"
        class="study-new-button"
        @click="emit('new')"
      >
        <Icon name="plus" size="md" />
        {{ t('study.newStudy') }}
      </Button>
    </div>
  </section>
</template>

<style scoped>
.study-home {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-height: 100%;
  padding: var(--space-5) var(--space-4);
}

.study-home-content {
  width: 100%;
  max-width: var(--p-content-max);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.study-home-title {
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  line-height: var(--leading-tight);
}

.study-section-label {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}

.study-continue-section,
.study-list-section {
  display: flex;
  flex-direction: column;
}

.study-continue-card :deep(.ui-card__body) {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.study-continue-card-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-continue-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.study-continue-emoji {
  font-size: var(--text-xl);
  line-height: 1;
}

.study-continue-study-title {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  line-height: var(--leading-tight);
}

.study-continue-lesson {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.study-continue-lesson-title {
  font-size: var(--text-base);
  color: var(--color-text);
}

.study-continue-button {
  width: 100%;
}

.study-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-list-item {
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out);
}

.study-list-item:hover {
  border-color: var(--color-accent-bd);
  background-color: var(--color-surface-sunken);
}

.study-list-item :deep(.ui-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.study-list-item-main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.study-list-item-emoji {
  font-size: var(--text-xl);
  line-height: 1;
  flex: none;
}

.study-list-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.study-list-item-title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-list-item-count {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.study-new-button {
  width: 100%;
}

@media (min-width: 641px) {
  .study-home {
    padding: var(--space-8) var(--space-6);
  }

  .study-new-button,
  .study-continue-button {
    width: auto;
    align-self: flex-start;
  }
}
</style>
