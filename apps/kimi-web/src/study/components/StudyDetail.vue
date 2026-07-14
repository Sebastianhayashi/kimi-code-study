<!-- apps/kimi-web/src/study/components/StudyDetail.vue -->
<!-- Study detail: mission, lessons, resources, learning records. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../../components/ui/Button.vue';
import Card from '../../components/ui/Card.vue';
import Badge from '../../components/ui/Badge.vue';
import Icon from '../../components/ui/Icon.vue';
import EmptyState from '../../components/ui/EmptyState.vue';
import type { Study, StudyLesson, StudyResource } from '../../types/study';

const props = defineProps<{
  study: Study;
}>();

const emit = defineEmits<{
  back: [];
  continue: [studyId: string];
  'open-lesson': [lessonId: string];
}>();

const { t } = useI18n();

const currentLessonIndex = computed(() => {
  const idx = props.study.lessons.findIndex((l) => l.id === props.study.currentLessonId);
  return idx >= 0 ? idx + 1 : 0;
});

const studyStatusLabel = computed(() => {
  switch (props.study.status) {
    case 'completed':
      return t('study.status.completed');
    case 'in-progress':
      return t('study.status.inProgress');
    default:
      return t('study.status.notStarted');
  }
});

function lessonStatusVariant(lesson: StudyLesson) {
  if (lesson.records.length > 0) return 'success' as const;
  if (lesson.id === props.study.currentLessonId) return 'info' as const;
  return 'neutral' as const;
}

function lessonStatusLabel(lesson: StudyLesson) {
  if (lesson.records.length > 0) return t('study.status.completed');
  if (lesson.id === props.study.currentLessonId) return t('study.status.inProgress');
  return t('study.status.notStarted');
}

function resourceIcon(type: StudyResource['type']) {
  switch (type) {
    case 'video':
      return 'play' as const;
    case 'epub':
    case 'pdf':
      return 'file' as const;
    case 'article':
      return 'file-text' as const;
    case 'exercise':
      return 'check-list' as const;
    case 'link':
    default:
      return 'external-link' as const;
  }
}
</script>

<template>
  <section class="study-detail" :aria-label="study.title">
    <header class="study-detail-header">
      <Button variant="ghost" size="sm" @click="emit('back')">
        <Icon name="arrow-right" size="sm" />
        <span>{{ t('study.backToHome') }}</span>
      </Button>
      <h1 class="study-detail-title">{{ study.title }}</h1>
    </header>

    <div class="study-detail-content">
      <!-- Mission -->
      <Card class="study-mission-card">
        <template #head>
          <Icon name="target" size="md" />
          <span>{{ t('study.detail.mission') }}</span>
        </template>
        <div class="study-mission-body">
          <div class="study-mission-block">
            <h3 class="study-mission-block-title">{{ t('study.detail.why') }}</h3>
            <p>{{ study.mission.why }}</p>
          </div>
          <div class="study-mission-block">
            <h3 class="study-mission-block-title">{{ t('study.detail.success') }}</h3>
            <ul>
              <li v-for="(item, idx) in study.mission.successLooksLike" :key="`success-${idx}`">
                {{ item }}
              </li>
            </ul>
          </div>
          <div class="study-mission-block">
            <h3 class="study-mission-block-title">{{ t('study.detail.constraints') }}</h3>
            <ul>
              <li v-for="(item, idx) in study.mission.constraints" :key="`constraints-${idx}`">
                {{ item }}
              </li>
            </ul>
          </div>
          <div class="study-mission-block">
            <h3 class="study-mission-block-title">{{ t('study.detail.outOfScope') }}</h3>
            <ul>
              <li v-for="(item, idx) in study.mission.outOfScope" :key="`out-${idx}`">
                {{ item }}
              </li>
            </ul>
          </div>
        </div>
        <template #foot>
          <div class="study-mission-footer">
            <span v-if="study.lessons.length > 0" class="study-mission-progress">
              {{ t('study.lessonCount', { current: currentLessonIndex || 1, total: study.lessons.length }) }}
              · {{ studyStatusLabel }}
            </span>
            <span v-else class="study-mission-progress">{{ studyStatusLabel }}</span>
            <Button variant="primary" size="md" @click="emit('continue', study.id)">
              {{ t('study.continueLearning') }}
            </Button>
          </div>
        </template>
      </Card>

      <!-- Lessons -->
      <section class="study-detail-section" :aria-labelledby="'lessons-heading'">
        <h2 id="lessons-heading" class="study-detail-section-title">
          {{ t('study.detail.lessons') }}
        </h2>
        <div class="study-lesson-list">
          <Card
            v-for="lesson in study.lessons"
            :key="lesson.id"
            class="study-lesson-item"
            tabindex="0"
            role="button"
            :aria-label="t('study.detail.lessons') + ' ' + lesson.order + ': ' + lesson.title"
            @click="emit('open-lesson', lesson.id)"
            @keydown.enter="emit('open-lesson', lesson.id)"
            @keydown.space.prevent="emit('open-lesson', lesson.id)"
          >
            <div class="study-lesson-item-main">
              <span class="study-lesson-number">{{ lesson.order }}</span>
              <div class="study-lesson-text">
                <div class="study-lesson-title">{{ lesson.title }}</div>
                <div v-if="lesson.summary" class="study-lesson-summary">{{ lesson.summary }}</div>
              </div>
            </div>
            <Badge :variant="lessonStatusVariant(lesson)" size="sm">
              {{ lessonStatusLabel(lesson) }}
            </Badge>
          </Card>
        </div>
      </section>

      <!-- Resources -->
      <section class="study-detail-section" :aria-labelledby="'resources-heading'">
        <h2 id="resources-heading" class="study-detail-section-title">
          {{ t('study.detail.resources') }}
        </h2>
        <Card v-if="study.resources.length">
          <ul class="study-resource-list">
            <li v-for="resource in study.resources" :key="resource.id" class="study-resource-item">
              <Icon :name="resourceIcon(resource.type)" size="md" />
              <div class="study-resource-info">
                <span class="study-resource-title">{{ resource.title }}</span>
                <span class="study-resource-source">{{ resource.source }}</span>
              </div>
            </li>
          </ul>
        </Card>
        <EmptyState v-else :title="t('study.detail.emptyResources')" />
      </section>

      <!-- Records -->
      <section class="study-detail-section" :aria-labelledby="'records-heading'">
        <h2 id="records-heading" class="study-detail-section-title">
          {{ t('study.detail.records') }}
        </h2>
        <div v-if="study.records.length" class="study-record-list">
          <Card v-for="record in study.records" :key="record.id" class="study-record-item">
            <div class="study-record-prompt">{{ record.prompt }}</div>
            <div class="study-record-response">{{ record.response }}</div>
          </Card>
        </div>
        <EmptyState v-else :title="t('study.detail.emptyRecords')" :hint="t('study.detail.emptyRecordsHint')">
          <template #icon>
            <Icon name="check-list" size="lg" />
          </template>
        </EmptyState>
      </section>
    </div>
  </section>
</template>

<style scoped>
.study-detail {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.study-detail-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface);
}

.study-detail-header :deep(.ui-button__content) {
  flex-direction: row-reverse;
}

.study-detail-title {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  line-height: var(--leading-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-detail-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-5) var(--space-4);
}

.study-mission-card :deep(.ui-card__body) {
  color: var(--color-text);
}

.study-mission-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.study-mission-block-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-text-muted);
  margin: 0 0 var(--space-1);
}

.study-mission-block p,
.study-mission-block ul {
  margin: 0;
  color: var(--color-text);
  line-height: var(--leading-relaxed);
}

.study-mission-block ul {
  padding-left: var(--space-4);
}

.study-mission-block li {
  margin-bottom: var(--space-1);
}

.study-mission-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
}

.study-mission-progress {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.study-detail-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.study-detail-section-title {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}

.study-lesson-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-lesson-item {
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out);
}

.study-lesson-item:hover {
  border-color: var(--color-accent-bd);
  background-color: var(--color-surface-sunken);
}

.study-lesson-item :deep(.ui-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.study-lesson-item-main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.study-lesson-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  flex: none;
}

.study-lesson-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.study-lesson-title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-lesson-summary {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-resource-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  list-style: none;
  margin: 0;
  padding: 0;
}

.study-resource-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.study-resource-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.study-resource-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-resource-source {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.study-record-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-record-item :deep(.ui-card__body) {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-record-prompt {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}

.study-record-response {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

@media (max-width: 640px) {
  .study-mission-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .study-mission-footer .ui-button {
    width: 100%;
  }
}
</style>
