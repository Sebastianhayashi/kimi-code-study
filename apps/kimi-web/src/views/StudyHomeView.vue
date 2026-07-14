<!-- apps/kimi-web/src/views/StudyHomeView.vue -->
<!-- Kimi Study home: a learning-focused entry point for non-technical users.
     This is the first Study-mode screen; later it will be gated by the product
     profile and driven by real Teach Skill data from the backend. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../components/ui/Button.vue';
import Card from '../components/ui/Card.vue';
import Icon from '../components/ui/Icon.vue';
import Badge from '../components/ui/Badge.vue';
import Pill from '../components/ui/Pill.vue';
import { useStudyData } from '../composables/useStudyData';
import type { StudyMission, StudyResource } from '../types/study';

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const { context, progress, currentMission, resourcesForMission } = useStudyData();

function close(): void {
  emit('close');
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}

const resourceIcon = (type: StudyResource['type']) => {
  switch (type) {
    case 'article':
      return 'file-text';
    case 'video':
      return 'play';
    case 'epub':
    case 'pdf':
      return 'book';
    case 'exercise':
      return 'check-list';
    case 'link':
      return 'external-link';
    default:
      return 'file';
  }
};

const statusVariant = (mission: StudyMission) => {
  if (mission.completed) return 'success' as const;
  if (mission.started) return 'info' as const;
  return 'neutral' as const;
};

const statusLabel = (mission: StudyMission) => {
  if (mission.completed) return t('study.completed');
  if (mission.started) return t('study.inProgress');
  return t('study.notStarted');
};

const missionResources = computed(() => {
  if (!currentMission.value) return [];
  return resourcesForMission(currentMission.value.id);
});
</script>

<template>
  <div class="study-page" tabindex="-1" @keydown="onKeydown">
    <div class="study-topbar">
      <Button variant="ghost" size="sm" @click="close">
        <Icon name="arrow-right" size="sm" />
        <span>{{ t('study.back') }}</span>
      </Button>
      <div class="study-brand">
        <Icon name="book" size="md" />
        <span class="study-brand-title">{{ t('study.title') }}</span>
      </div>
      <div class="study-topbar-spacer" />
    </div>

    <main class="study-content">
      <div class="study-layout">
        <section class="study-main">
          <header class="study-welcome">
            <h1 class="study-welcome-title">
              {{ t('study.subtitle') }}, {{ context.learnerName }}
            </h1>
            <p class="study-welcome-body">
              这里是你当前的学习空间。从“继续学习”开始，Kimi 会陪你一步一步完成今天的任务。
            </p>
          </header>

          <Card v-if="currentMission" class="study-continue-card" elevated>
            <template #head>
              <Icon name="graduation-cap" size="md" />
              <span>{{ t('study.continueLearning') }}</span>
            </template>
            <div class="study-continue-body">
              <div class="study-continue-meta">
                <Badge :variant="statusVariant(currentMission)">
                  {{ statusLabel(currentMission) }}
                </Badge>
                <span class="study-duration">
                  <Icon name="clock" size="sm" />
                  {{ currentMission.duration }}
                </span>
              </div>
              <h2 class="study-mission-title">{{ currentMission.title }}</h2>
              <p class="study-mission-description">{{ currentMission.description }}</p>
              <div class="study-mission-progress">
                <div class="study-progress-bar">
                  <div
                    class="study-progress-fill"
                    :style="{
                      width: `${(currentMission.completedSteps / currentMission.totalSteps) * 100}%`,
                    }"
                  />
                </div>
                <span class="study-progress-text">
                  {{ t('study.steps', { completed: currentMission.completedSteps, total: currentMission.totalSteps }) }}
                </span>
              </div>
              <div v-if="missionResources.length" class="study-continue-resources">
                <Pill
                  v-for="resource in missionResources"
                  :key="resource.id"
                  :clickable="false"
                >
                  <Icon :name="resourceIcon(resource.type)" size="sm" />
                  {{ resource.title }}
                </Pill>
              </div>
            </div>
            <template #foot>
              <Button variant="primary" size="md">
                <Icon name="play" size="sm" />
                <span>
                  {{ currentMission.started ? t('study.continueLearning') : t('study.startMission') }}
                </span>
              </Button>
            </template>
          </Card>

          <section class="study-section">
            <h2 class="study-section-title">{{ t('study.missions') }}</h2>
            <div v-if="context.missions.length" class="study-mission-list">
              <Card
                v-for="mission in context.missions"
                :key="mission.id"
                class="study-mission-item"
              >
                <div class="study-mission-item-content">
                  <div class="study-mission-item-main">
                    <div class="study-mission-item-meta">
                      <Badge :variant="statusVariant(mission)" size="sm">
                        {{ statusLabel(mission) }}
                      </Badge>
                      <span class="study-duration">
                        <Icon name="clock" size="sm" />
                        {{ mission.duration }}
                      </span>
                    </div>
                    <h3 class="study-mission-item-title">{{ mission.title }}</h3>
                    <p class="study-mission-item-description">{{ mission.description }}</p>
                    <div class="study-mission-tags">
                      <Pill
                        v-for="tag in mission.tags"
                        :key="tag"
                        :clickable="false"
                      >
                        {{ tag }}
                      </Pill>
                    </div>
                  </div>
                  <div class="study-mission-item-progress">
                    <div class="study-progress-ring" aria-hidden="true">
                      <svg viewBox="0 0 36 36">
                        <path
                          class="study-progress-ring-track"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          class="study-progress-ring-fill"
                          :stroke-dasharray="`${(mission.completedSteps / mission.totalSteps) * 100}, 100`"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <span class="study-progress-ring-text">
                        {{ mission.completedSteps }}/{{ mission.totalSteps }}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
            <Card v-else class="study-empty">
              <p>{{ t('study.emptyMissions') }}</p>
              <p class="study-empty-hint">{{ t('study.emptyMissionsHint') }}</p>
            </Card>
          </section>
        </section>

        <aside class="study-side">
          <Card class="study-progress-card">
            <template #head>
              <Icon name="target" size="md" />
              <span>{{ t('study.progress') }}</span>
            </template>
            <div class="study-stats">
              <div class="study-stat">
                <span class="study-stat-value">{{ progress.completedMissions }}</span>
                <span class="study-stat-label">{{ t('study.completed') }}</span>
              </div>
              <div class="study-stat">
                <span class="study-stat-value">{{ progress.inProgressMissions }}</span>
                <span class="study-stat-label">{{ t('study.inProgress') }}</span>
              </div>
              <div class="study-stat">
                <span class="study-stat-value">{{ progress.consumedResources }}/{{ progress.totalResources }}</span>
                <span class="study-stat-label">{{ t('study.resources') }}</span>
              </div>
            </div>
          </Card>

          <Card class="study-resources-card">
            <template #head>
              <Icon name="file-text" size="md" />
              <span>{{ t('study.resources') }}</span>
            </template>
            <ul class="study-resource-list">
              <li
                v-for="resource in context.resources"
                :key="resource.id"
                class="study-resource-item"
                :class="{ 'is-consumed': resource.consumed }"
              >
                <Icon :name="resourceIcon(resource.type)" size="sm" />
                <div class="study-resource-info">
                  <span class="study-resource-title">{{ resource.title }}</span>
                  <span class="study-resource-source">{{ resource.source }}</span>
                </div>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </main>
  </div>
</template>

<style scoped>
.study-page {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  color: var(--color-text);
  overflow: hidden;
}

.study-topbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 56px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface);
}

.study-topbar :deep(.ui-button__content) {
  flex-direction: row-reverse;
}

.study-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 auto;
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
}

.study-topbar-spacer {
  width: 80px;
}

.study-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
}

.study-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--space-6);
  max-width: var(--p-content-wide);
  margin: 0 auto;
}

@media (max-width: 960px) {
  .study-layout {
    grid-template-columns: 1fr;
  }
}

.study-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.study-welcome {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-welcome-title {
  font-family: var(--font-ui);
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}

.study-welcome-body {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-continue-card {
  border-color: var(--color-accent-bd);
}

.study-continue-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.study-continue-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.study-duration {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.study-mission-title {
  font-family: var(--font-ui);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}

.study-mission-description {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-mission-progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.study-progress-bar {
  flex: 1;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  overflow: hidden;
}

.study-progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  transition: width var(--duration-base) var(--ease-out);
}

.study-progress-text {
  flex: none;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.study-continue-resources {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.study-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.study-section-title {
  font-family: var(--font-ui);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}

.study-mission-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.study-mission-item-content {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}

.study-mission-item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-mission-item-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.study-mission-item-title {
  font-family: var(--font-ui);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}

.study-mission-item-description {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-mission-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.study-mission-item-progress {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.study-progress-ring {
  position: relative;
  width: 56px;
  height: 56px;
}

.study-progress-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.study-progress-ring-track {
  fill: none;
  stroke: var(--color-surface-sunken);
  stroke-width: 3;
}

.study-progress-ring-fill {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dasharray var(--duration-base) var(--ease-out);
}

.study-progress-ring-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.study-empty {
  text-align: center;
  color: var(--color-text-muted);
}

.study-empty-hint {
  font-size: var(--text-sm);
  margin-top: var(--space-2);
}

.study-side {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.study-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}

.study-stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  text-align: center;
}

.study-stat-value {
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  font-family: var(--font-mono);
}

.study-stat-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.study-resource-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.study-resource-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  color: var(--color-text);
}

.study-resource-item.is-consumed {
  opacity: 0.6;
}

.study-resource-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.study-resource-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-resource-source {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
</style>
