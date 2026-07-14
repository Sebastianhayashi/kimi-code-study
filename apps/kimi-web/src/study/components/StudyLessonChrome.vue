<!-- apps/kimi-web/src/study/components/StudyLessonChrome.vue -->
<!-- Lesson chrome: back, title, prev/next, quickref toggle. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from '../../components/ui/Button.vue';
import Icon from '../../components/ui/Icon.vue';

const props = defineProps<{
  title: string;
  hasPrev: boolean;
  hasNext: boolean;
}>();

const emit = defineEmits<{
  back: [];
  prev: [];
  next: [];
  quickref: [];
}>();

const { t } = useI18n();
</script>

<template>
  <header class="study-lesson-chrome">
    <Button variant="ghost" size="sm" @click="emit('back')">
      <Icon name="arrow-right" size="sm" />
      <span>{{ t('study.lesson.backToCourse') }}</span>
    </Button>

    <h1 class="study-lesson-title" :title="title">{{ title }}</h1>

    <div class="study-lesson-actions">
      <Button
        variant="ghost"
        size="sm"
        :disabled="!hasPrev"
        :title="t('study.lesson.prevLesson')"
        @click="emit('prev')"
      >
        <span class="study-icon-flip" aria-hidden="true">
          <Icon name="arrow-right" size="sm" />
        </span>
        <span class="study-action-label">{{ t('study.lesson.prevLesson') }}</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        :disabled="!hasNext"
        :title="t('study.lesson.nextLesson')"
        @click="emit('next')"
      >
        <span class="study-action-label">{{ t('study.lesson.nextLesson') }}</span>
        <Icon name="arrow-right" size="sm" />
      </Button>

      <Button
        variant="secondary"
        size="sm"
        :title="t('study.lesson.quickref')"
        @click="emit('quickref')"
      >
        <Icon name="file-text" size="sm" />
        <span class="study-action-label">{{ t('study.lesson.quickref') }}</span>
      </Button>
    </div>
  </header>
</template>

<style scoped>
.study-lesson-chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface);
}

.study-lesson-chrome :deep(.ui-button__content) {
  flex-direction: row-reverse;
}

.study-lesson-title {
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

.study-lesson-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.study-action-label {
  display: inline;
}

.study-icon-flip {
  display: inline-flex;
  transform: scaleX(-1);
}

@media (min-width: 641px) {
  .study-lesson-chrome {
    flex-wrap: nowrap;
    padding: var(--space-2) var(--space-4);
  }

  .study-lesson-title {
    font-size: var(--text-lg);
  }
}
</style>
