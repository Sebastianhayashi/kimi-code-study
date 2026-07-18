<!-- apps/kimi-web/src/study/components/product/StudyPreparing.vue -->
<!-- Source work and Mission clarification as one continuous surface. Internal
     approvals, decomposition, and workflow vocabulary stay invisible. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Card from '../../../components/ui/Card.vue';
import Icon from '../../../components/ui/Icon.vue';
import type { CourseSnapshot } from '../../foundation';

const props = defineProps<{
  snapshot: CourseSnapshot;
}>();

const { t } = useI18n();

const sourceBusy = computed(() =>
  props.snapshot.source.status === 'surveying' || props.snapshot.source.status === 'deep_reading');

const sourceLabel = computed(() => {
  switch (props.snapshot.source.status) {
    case 'surveying':
      return t('study.product.sourceSurveying');
    case 'deep_reading':
      return t('study.product.sourceDeepReading');
    case 'ready':
      return t('study.product.sourceReady');
    default:
      return t('study.product.sourceSelected');
  }
});

const missionBusy = computed(() => props.snapshot.mission.status === 'interviewing');

const missionLabel = computed(() =>
  props.snapshot.mission.status === 'ready'
    ? t('study.product.missionReady')
    : t('study.product.missionInterviewing'));
</script>

<template>
  <div class="study-preparing">
    <header class="study-preparing-head">
      <h1 class="study-preparing-title">{{ t('study.product.preparingTitle') }}</h1>
      <p class="study-preparing-source">{{ snapshot.source.title }}</p>
    </header>

    <div class="study-track-list">
      <Card class="study-track">
        <div class="study-track-row">
          <Icon :name="sourceBusy ? 'clock' : 'check'" size="md" />
          <div class="study-track-info">
            <span class="study-track-name">{{ t('study.product.sourceWork') }}</span>
            <span class="study-track-label">{{ sourceLabel }}</span>
          </div>
          <span v-if="sourceBusy" class="study-track-pulse" aria-hidden="true" />
        </div>
      </Card>

      <Card class="study-track">
        <div class="study-track-row">
          <Icon :name="missionBusy ? 'clock' : 'check'" size="md" />
          <div class="study-track-info">
            <span class="study-track-name">{{ t('study.product.missionWork') }}</span>
            <span class="study-track-label">{{ missionLabel }}</span>
          </div>
          <span v-if="missionBusy" class="study-track-pulse" aria-hidden="true" />
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.study-preparing {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
}

.study-preparing-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-preparing-title {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  color: var(--color-text);
}

.study-preparing-source {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-track-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.study-track-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
}

.study-track-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.study-track-name {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.study-track-label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-track-pulse {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  animation: study-track-pulse 1.2s var(--ease-out) infinite;
}

@keyframes study-track-pulse {
  0%, 100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}
</style>
