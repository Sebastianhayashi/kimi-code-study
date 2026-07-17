<!-- apps/kimi-web/src/study/components/product/StudyModeSelect.vue -->
<!-- One-time Quick/Deep decision shown after a successful upload. Catalog
     courses never render this screen: their source work is already certified. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Card from '../../../components/ui/Card.vue';
import Icon from '../../../components/ui/Icon.vue';
import Badge from '../../../components/ui/Badge.vue';

defineProps<{
  sourceTitle: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  select: [mode: 'quick' | 'deep'];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="study-mode">
    <header class="study-mode-head">
      <h1 class="study-mode-title">{{ t('study.product.modeTitle', { title: sourceTitle }) }}</h1>
      <p class="study-mode-hint">{{ t('study.product.modeHint') }}</p>
    </header>

    <div class="study-mode-cards">
      <Card
        class="study-mode-card"
        :class="{ 'is-disabled': busy }"
        tabindex="0"
        role="button"
        @click="emit('select', 'quick')"
        @keydown.enter="emit('select', 'quick')"
      >
        <div class="study-mode-card-head">
          <Icon name="bolt" size="md" />
          <span class="study-mode-card-title">{{ t('study.product.quickTitle') }}</span>
          <Badge variant="info" size="sm">{{ t('study.product.recommended') }}</Badge>
        </div>
        <p class="study-mode-card-desc">{{ t('study.product.quickDesc') }}</p>
      </Card>

      <Card
        class="study-mode-card"
        :class="{ 'is-disabled': busy }"
        tabindex="0"
        role="button"
        @click="emit('select', 'deep')"
        @keydown.enter="emit('select', 'deep')"
      >
        <div class="study-mode-card-head">
          <Icon name="graduation-cap" size="md" />
          <span class="study-mode-card-title">{{ t('study.product.deepTitle') }}</span>
        </div>
        <p class="study-mode-card-desc">{{ t('study.product.deepDesc') }}</p>
      </Card>
    </div>

    <p v-if="busy" class="study-mode-starting">{{ t('study.product.starting') }}</p>
  </div>
</template>

<style scoped>
.study-mode {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
}

.study-mode-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-mode-title {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  color: var(--color-text);
}

.study-mode-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.study-mode-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-4);
}

.study-mode-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out);
}

.study-mode-card:hover {
  border-color: var(--color-accent-bd);
}

.study-mode-card.is-disabled {
  pointer-events: none;
  opacity: 0.6;
}

.study-mode-card-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
}

.study-mode-card-title {
  flex: 1;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}

.study-mode-card-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-mode-starting {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
</style>
