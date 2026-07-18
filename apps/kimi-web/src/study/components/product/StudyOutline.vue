<!-- apps/kimi-web/src/study/components/product/StudyOutline.vue -->
<!-- Outline + generation surface. The plan shown here always names the exact
     source/Mission revisions it was built from; generation targets only the
     visible current revision (the controller enforces the same gate). Outline
     items are parsed from workspace artifacts — when the artifact is absent
     or malformed the counts alone carry the truth, never an invented list.
     Learner feedback requests a NEW plan revision; it never mutates in place. -->
<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../../../components/ui/Button.vue';
import Card from '../../../components/ui/Card.vue';
import Icon from '../../../components/ui/Icon.vue';
import Badge from '../../../components/ui/Badge.vue';
import {
  parseQuickPlanOutline,
  QUICK_PLAN_PATH,
  STUDY_PRODUCT_INJECTION_KEY,
  type CourseOutline,
  type CourseSnapshot,
} from '../../foundation';

const props = defineProps<{
  snapshot: CourseSnapshot;
  busy: boolean;
}>();

const emit = defineEmits<{
  generate: [];
  upgrade: [];
}>();

const { t } = useI18n();
const product = inject(STUDY_PRODUCT_INJECTION_KEY)!;

const planReady = computed(() => props.snapshot.plan.status === 'ready');
const generating = computed(() => props.snapshot.generation.status === 'generating');
const showUpgrade = computed(() => props.snapshot.profile?.mode === 'quick');

const planCounts = computed(() => {
  const { chapterCount, pageCount, quizCount } = props.snapshot.plan;
  if (chapterCount === undefined) return undefined;
  return t('study.product.outlineCounts', {
    chapters: chapterCount,
    pages: pageCount ?? 0,
    quizzes: quizCount ?? 0,
  });
});

const revisionLabel = computed(() => {
  const revision = props.snapshot.plan.revision;
  if (revision === undefined) return undefined;
  return t('study.product.planRevision', { revision });
});

// --- Outline items from the workspace plan artifact (quick survey plans). ---
const outline = ref<CourseOutline | undefined>(undefined);

async function loadOutlineItems(): Promise<void> {
  outline.value = undefined;
  if (!planReady.value) return;
  const loaded = await product.loadCourseText(QUICK_PLAN_PATH);
  if (loaded.status !== 'ready') return;
  outline.value = parseQuickPlanOutline(loaded.content);
}

onMounted(() => { void loadOutlineItems(); });
watch(() => props.snapshot.plan.revision, () => { void loadOutlineItems(); });

// --- Revisioned outline edits: every request targets the visible revision. ---
const reviseText = ref('');
const reviseSent = ref(false);
const reviseError = ref(false);
const revising = ref(false);

async function submitRevision(): Promise<void> {
  const text = reviseText.value.trim();
  if (text.length === 0 || revising.value) return;
  revising.value = true;
  reviseError.value = false;
  try {
    await product.requestPlanChange(text);
    reviseText.value = '';
    reviseSent.value = true;
  } catch {
    reviseError.value = true;
  } finally {
    revising.value = false;
  }
}
</script>

<template>
  <div class="study-outline">
    <header class="study-outline-head">
      <h1 class="study-outline-title">{{ t('study.product.outlineTitle') }}</h1>
      <p class="study-outline-source">{{ snapshot.source.title }}</p>
    </header>

    <Card v-if="!planReady" class="study-outline-pending">
      <div class="study-outline-pending-row">
        <Icon name="clock" size="md" />
        <p class="study-outline-pending-text">{{ t('study.product.outlineDesigning') }}</p>
        <span class="study-outline-pulse" aria-hidden="true" />
      </div>
    </Card>

    <template v-else>
      <Card class="study-outline-plan">
        <div class="study-outline-plan-row">
          <Icon name="list" size="md" />
          <div class="study-outline-plan-info">
            <span v-if="planCounts" class="study-outline-counts">{{ planCounts }}</span>
            <span v-if="revisionLabel" class="study-outline-revision">{{ revisionLabel }}</span>
          </div>
        </div>

        <ol v-if="outline" class="study-outline-items">
          <li v-for="item in outline.items" :key="item.sequence" class="study-outline-item">
            <span class="study-outline-item-seq">{{ item.sequence }}</span>
            <span class="study-outline-item-title">{{ item.title }}</span>
            <Badge variant="neutral" size="sm">
              {{ t(`study.product.type_${item.kind}`) }}
            </Badge>
          </li>
        </ol>

        <div class="study-outline-actions">
          <Button
            variant="primary"
            size="md"
            :disabled="!snapshot.canGenerate || generating || busy"
            :loading="generating"
            @click="emit('generate')"
          >
            <Icon name="play" size="sm" />
            <span>{{ generating ? t('study.product.generating') : t('study.product.generate') }}</span>
          </Button>
          <p v-if="generating" class="study-outline-progress">
            {{ t('study.product.generationProgress', {
              published: snapshot.generation.publishedLessons,
              total: snapshot.generation.totalLessons ?? '…',
            }) }}
          </p>
        </div>
      </Card>

      <Card v-if="!generating" class="study-outline-revise">
        <div class="study-outline-revise-head">
          <Icon name="file-edit" size="md" />
          <span class="study-outline-revise-title">{{ t('study.product.outlineReviseTitle') }}</span>
        </div>
        <textarea
          v-model="reviseText"
          class="study-outline-revise-input"
          rows="2"
          :placeholder="t('study.product.outlineRevisePlaceholder')"
          @keydown.enter.exact.prevent="submitRevision"
        />
        <div class="study-outline-revise-actions">
          <p v-if="reviseSent" class="study-outline-revise-note">
            {{ t('study.product.outlineReviseSent') }}
          </p>
          <p v-else-if="reviseError" class="study-outline-revise-note study-outline-revise-note--error">
            {{ t('study.product.outlineReviseError') }}
          </p>
          <Button
            variant="secondary"
            size="sm"
            :disabled="reviseText.trim().length === 0"
            :loading="revising"
            @click="submitRevision"
          >
            {{ t('study.product.outlineReviseAction') }}
          </Button>
        </div>
      </Card>
    </template>

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
  </div>
</template>

<style scoped>
.study-outline {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
}

.study-outline-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-outline-title {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  color: var(--color-text);
}

.study-outline-source {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-outline-pending-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
}

.study-outline-pending-text {
  flex: 1;
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
}

.study-outline-pulse {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  animation: study-outline-pulse 1.2s var(--ease-out) infinite;
}

@keyframes study-outline-pulse {
  0%, 100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

.study-outline-plan {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.study-outline-plan-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  color: var(--color-text-muted);
}

.study-outline-plan-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.study-outline-counts {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.study-outline-revision {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.study-outline-items {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.study-outline-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-line);
}

.study-outline-item:last-child {
  border-bottom: none;
}

.study-outline-item-seq {
  flex: none;
  width: 24px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  text-align: right;
}

.study-outline-item-title {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--color-text);
  line-height: var(--leading-relaxed);
}

.study-outline-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.study-outline-progress {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.study-outline-revise {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.study-outline-revise-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
}

.study-outline-revise-title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.study-outline-revise-input {
  width: 100%;
  resize: vertical;
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
}

.study-outline-revise-input:focus {
  outline: none;
  border-color: var(--color-accent-bd);
}

.study-outline-revise-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
}

.study-outline-revise-note {
  flex: 1;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.study-outline-revise-note--error {
  color: var(--color-danger, var(--color-text-muted));
}

.study-upgrade {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.study-upgrade-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.study-upgrade-title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.study-upgrade-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}
</style>
