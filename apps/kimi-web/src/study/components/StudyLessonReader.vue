<!-- apps/kimi-web/src/study/components/StudyLessonReader.vue -->
<!-- Isolated Kimi Study lesson reader.
     Presents real lesson HTML inside the same static sandbox used by
     FilePreview.vue. The practice action can be hidden by the Study shell. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../../components/ui/Button.vue';
import Banner from '../../components/ui/Banner.vue';
import SegmentedControl from '../../components/ui/SegmentedControl.vue';
import Icon from '../../components/ui/Icon.vue';
import { buildLessonSrcdoc, deriveLessonStatus } from '../domain/lessonDocument';
import type { LessonSource, LessonStatus } from '../domain/lessonDocument';

const props = withDefaults(defineProps<{
  source: LessonSource;
  showPracticeAction?: boolean;
  showNavActions?: boolean;
}>(), {
  showPracticeAction: true,
  showNavActions: false,
});

const emit = defineEmits<{
  'start-practice': [];
  prev: [];
  next: [];
  quickref: [];
}>();

const { t } = useI18n();

const mode = ref<'preview' | 'source'>('preview');
const status = computed<LessonStatus>(() => deriveLessonStatus(props.source));

function setMode(value: string): void {
  mode.value = value as 'preview' | 'source';
}

function startPractice(): void {
  emit('start-practice');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const sourceLines = computed<string[]>(() => props.source.html.split('\n'));
const srcdoc = computed<string>(() => buildLessonSrcdoc(props.source.html));
</script>

<template>
  <article class="slr" aria-labelledby="slr-title">
    <header class="slr-header">
      <div class="slr-title-block">
        <Icon name="file-text" size="md" class="slr-title-icon" aria-hidden="true" />
        <div class="slr-title-text">
          <h1 id="slr-title" class="slr-title">{{ source.title }}</h1>
          <span class="slr-path" :title="source.path">{{ source.path }}</span>
        </div>
      </div>
      <SegmentedControl
        :model-value="mode"
        size="sm"
        :options="[
          { value: 'preview', label: t('study.preview') },
          { value: 'source', label: t('study.source') },
        ]"
        @update:model-value="setMode"
      />
    </header>

    <div class="slr-notices" role="region" :aria-label="t('study.lessonStatus')">
      <Banner v-if="status.kind === 'error'" variant="danger">
        {{ status.error }}
      </Banner>
      <Banner v-else-if="status.kind === 'partial'" variant="warning">
        <span>{{ t('study.partialNotice') }}</span>
        <ul class="slr-reasons">
          <li v-for="reason in status.reasons" :key="reason">{{ reason }}</li>
        </ul>
      </Banner>
    </div>

    <div class="slr-body">
      <iframe
        v-if="mode === 'preview'"
        class="slr-frame"
        sandbox=""
        :srcdoc="srcdoc"
        :title="source.title"
      ></iframe>
      <div v-else class="slr-source">
        <div class="slr-line-table">
          <div
            v-for="(line, idx) in sourceLines"
            :key="idx"
            class="slr-line-row"
          >
            <span class="slr-gutter">{{ idx + 1 }}</span>
            <pre class="slr-line-text"><code v-html="escapeHtml(line)"></code></pre>
          </div>
        </div>
      </div>
    </div>

    <footer v-if="showPracticeAction || showNavActions" class="slr-footer">
      <template v-if="showNavActions">
        <Button variant="ghost" size="md" @click="emit('prev')">
          <Icon name="arrow-right" size="sm" class="slr-nav-icon-prev" />
          {{ t('study.lesson.prevLesson') }}
        </Button>
        <Button variant="secondary" size="md" @click="emit('quickref')">
          <Icon name="file-text" size="sm" />
          {{ t('study.lesson.quickref') }}
        </Button>
        <Button variant="ghost" size="md" @click="emit('next')">
          {{ t('study.lesson.nextLesson') }}
          <Icon name="arrow-right" size="sm" />
        </Button>
      </template>
      <Button v-if="showPracticeAction && !showNavActions" variant="primary" size="md" @click="startPractice">
        {{ t('study.startPractice') }}
      </Button>
    </footer>
  </article>
</template>

<style scoped>
.slr {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-ui);
}

.slr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface);
}

.slr-title-block {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.slr-title-icon {
  flex: none;
  color: var(--color-accent);
}

.slr-title-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.slr-title {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slr-path {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slr-notices {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
}

.slr-reasons {
  margin: var(--space-2) 0 0 0;
  padding-left: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.slr-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--color-bg);
}

.slr-frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--color-surface-raised);
}

.slr-source {
  min-height: 100%;
  overflow: auto;
  background: var(--color-surface-sunken);
  padding: var(--space-4) 0;
}

.slr-line-table {
  display: table;
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: var(--ui-font-size);
  line-height: 1.6;
}

.slr-line-row {
  display: table-row;
}

.slr-gutter {
  display: table-cell;
  width: 48px;
  min-width: 48px;
  padding: 0 var(--space-2) 0 var(--space-3);
  text-align: right;
  color: var(--color-text-faint);
  user-select: none;
  border-right: 1px solid var(--color-line);
  vertical-align: top;
}

.slr-line-text {
  display: table-cell;
  padding: 0 var(--space-3);
  color: var(--color-text);
  white-space: pre;
  vertical-align: top;
}

.slr-line-text code {
  font-family: inherit;
  background: transparent;
}

.slr-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-line);
  background: var(--color-surface);
}

.slr-nav-icon-prev {
  transform: scaleX(-1);
}

@media (max-width: 640px) {
  .slr-header {
    flex-wrap: wrap;
    padding: var(--space-3);
  }

  .slr-header :deep(.ui-seg__item) {
    min-height: 44px;
  }

  .slr-title {
    font-size: var(--text-base);
  }

  .slr-notices {
    padding: var(--space-2) var(--space-3);
  }

  .slr-footer {
    padding: var(--space-3);
  }

  .slr-footer :deep(.ui-button) {
    min-height: 44px;
  }
}
</style>
