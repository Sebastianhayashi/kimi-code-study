<!-- apps/kimi-web/src/study/components/StudyNew.vue -->
<!-- New study flow: upload -> mission conversation -> first lesson preview. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../../components/ui/Button.vue';
import Card from '../../components/ui/Card.vue';
import Banner from '../../components/ui/Banner.vue';
import Textarea from '../../components/ui/Textarea.vue';
import Icon from '../../components/ui/Icon.vue';
import type { NewStudyFlow } from '../domain/studyDemo';
import { MISSION_ROUNDS } from '../domain/studyDemo';

const props = defineProps<{
  newFlow: NewStudyFlow | null;
}>();

const emit = defineEmits<{
  upload: [material: string];
  'mission-next': [answer: string];
  'mission-done': [];
  back: [];
}>();

const { t } = useI18n();

const draft = ref('');

watch(
  () => props.newFlow?.roundIndex,
  () => {
    draft.value = '';
  },
);

const isUpload = computed(() => props.newFlow?.step === 'upload');
const isMission = computed(() => props.newFlow?.step === 'mission');
const isPreview = computed(() => props.newFlow?.step === 'preview');

const currentQuestion = computed(() => {
  if (!props.newFlow || props.newFlow.step !== 'mission') return '';
  return MISSION_ROUNDS[props.newFlow.roundIndex] ?? '';
});

const isLastRound = computed(() => {
  if (!props.newFlow || props.newFlow.step !== 'mission') return false;
  return props.newFlow.roundIndex >= MISSION_ROUNDS.length - 1;
});

const answeredRounds = computed(() => {
  if (!props.newFlow) return [];
  return props.newFlow.answers.map((answer, idx) => ({
    question: MISSION_ROUNDS[idx] ?? '',
    answer,
  }));
});

function onUpload() {
  emit('upload', draft.value);
  draft.value = '';
}

function onUploadCardClick() {
  if (draft.value.trim()) {
    onUpload();
  } else {
    // In the demo the only working "upload" path is the paste area below.
    const textarea = document.getElementById('study-paste') as HTMLTextAreaElement | null;
    textarea?.focus();
  }
}

function onUploadCardKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onUploadCardClick();
  }
}

function onMissionNext() {
  emit('mission-next', draft.value);
}
</script>

<template>
  <section class="study-new" aria-labelledby="study-new-title">
    <header class="study-new-header">
      <Button variant="ghost" size="sm" @click="emit('back')">
        <Icon name="arrow-right" size="sm" />
        <span>{{ t('study.backToHome') }}</span>
      </Button>
      <h1 id="study-new-title" class="study-new-title">
        {{ t('study.newStudy') }}
      </h1>
    </header>

    <div class="study-new-content">
      <!-- Upload material -->
      <template v-if="isUpload">
        <h2 class="study-new-heading">{{ t('study.new.uploadTitle') }}</h2>
        <p class="study-new-hint">{{ t('study.new.uploadHint') }}</p>

        <Card
          class="study-upload-card"
          tabindex="0"
          role="button"
          :aria-label="t('study.new.uploadAction')"
          @click="onUploadCardClick"
          @keydown="onUploadCardKeydown"
        >
          <div class="study-upload-card-body">
            <Icon name="folder-plus" size="lg" />
            <span class="study-upload-action">{{ t('study.new.uploadAction') }}</span>
            <span class="study-upload-formats">{{ t('study.new.supportedFormats') }}</span>
          </div>
        </Card>

        <div class="study-paste-field">
          <label for="study-paste" class="study-field-label">{{ t('study.new.pasteLabel') }}</label>
          <Textarea
            id="study-paste"
            v-model="draft"
            :rows="4"
            :placeholder="t('study.new.pastePlaceholder')"
          />
        </div>

        <Button
          variant="primary"
          size="lg"
          class="study-new-primary"
          :disabled="!draft.trim()"
          @click="onUpload"
        >
          {{ t('study.new.nextQuestion') }}
        </Button>
      </template>

      <!-- Mission conversation -->
      <template v-else-if="isMission">
        <h2 class="study-new-heading">{{ t('study.new.missionTitle') }}</h2>
        <p class="study-new-hint">{{ t('study.new.missionHint') }}</p>

        <div class="study-conversation">
          <div
            v-for="(round, idx) in answeredRounds"
            :key="`answered-${idx}`"
            class="study-conversation-round"
          >
            <div class="study-message study-message-ai">
              <span class="study-message-sender">{{ t('study.new.assistantName') }}</span>
              <p>{{ round.question }}</p>
            </div>
            <div class="study-message study-message-user">
              <span class="study-message-sender">{{ t('study.new.you') }}</span>
              <p>{{ round.answer }}</p>
            </div>
          </div>

          <div class="study-message study-message-ai">
            <span class="study-message-sender">{{ t('study.new.assistantName') }}</span>
            <p>{{ currentQuestion }}</p>
          </div>
        </div>

        <div class="study-paste-field">
          <label for="study-answer" class="study-field-label">{{ t('study.answerLabel') }}</label>
          <Textarea
            id="study-answer"
            v-model="draft"
            :rows="3"
            :placeholder="t('study.new.answerPlaceholder')"
          />
        </div>

        <Button
          variant="primary"
          size="lg"
          class="study-new-primary"
          :disabled="!draft.trim()"
          @click="onMissionNext"
        >
          {{ isLastRound ? t('study.new.generateMission') : t('study.new.nextQuestion') }}
        </Button>
      </template>

      <!-- Preview -->
      <template v-else-if="isPreview && newFlow">
        <h2 class="study-new-heading">{{ t('study.new.previewTitle') }}</h2>
        <p class="study-new-hint">{{ t('study.new.previewHint', { title: newFlow.previewStudyTitle }) }}</p>

        <Banner variant="info" class="study-preview-notice">
          {{ t('study.demoNotice') }}
        </Banner>

        <Card v-if="newFlow.generatedMission" class="study-mission-summary">
          <template #head>
            <Icon name="target" size="md" />
            <span>{{ t('study.new.generatedMissionTitle') }}</span>
          </template>
          <div class="study-mission-block">
            <h3 class="study-mission-block-title">{{ t('study.detail.why') }}</h3>
            <p>{{ newFlow.generatedMission.why }}</p>
          </div>
          <div class="study-mission-block">
            <h3 class="study-mission-block-title">{{ t('study.detail.success') }}</h3>
            <ul>
              <li v-for="(item, idx) in newFlow.generatedMission.successLooksLike" :key="`s-${idx}`">
                {{ item }}
              </li>
            </ul>
          </div>
        </Card>

        <Card v-if="newFlow.previewLesson" class="study-lesson-preview" elevated>
          <template #head>
            <Icon name="file-text" size="md" />
            <span>{{ t('study.lessonLabel') }}</span>
          </template>
          <div class="study-lesson-preview-title">{{ newFlow.previewLesson.title }}</div>
          <div v-if="newFlow.previewLesson.summary" class="study-lesson-preview-summary">
            {{ newFlow.previewLesson.summary }}
          </div>
        </Card>

        <Button
          variant="primary"
          size="lg"
          class="study-new-primary"
          @click="emit('mission-done')"
        >
          <Icon name="play" size="md" />
          {{ t('study.new.startLearning') }}
        </Button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.study-new {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.study-new-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface);
}

.study-new-header :deep(.ui-button__content) {
  flex-direction: row-reverse;
}

.study-new-title {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  line-height: var(--leading-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-new-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-4);
  max-width: var(--p-content-max);
  width: 100%;
  margin: 0 auto;
}

.study-new-heading {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  line-height: var(--leading-tight);
}

.study-new-hint {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-upload-card {
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out);
}

.study-upload-card:hover {
  border-color: var(--color-accent-bd);
  background-color: var(--color-surface-sunken);
}

.study-upload-card :deep(.ui-card__body) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8);
  color: var(--color-text-muted);
}

.study-upload-action {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.study-upload-formats {
  font-size: var(--text-xs);
}

.study-paste-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.study-field-label {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
}

.study-new-primary {
  width: 100%;
}

.study-conversation {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.study-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  max-width: 90%;
}

.study-message p {
  margin: 0;
  color: var(--color-text);
  line-height: var(--leading-relaxed);
}

.study-message-ai {
  align-self: flex-start;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-line);
}

.study-message-user {
  align-self: flex-end;
  background: var(--color-accent-soft);
  border: 1px solid var(--color-accent-bd);
}

.study-message-sender {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--color-text-muted);
}

.study-preview-notice {
  flex: none;
}

.study-mission-summary :deep(.ui-card__body),
.study-lesson-preview :deep(.ui-card__body) {
  color: var(--color-text);
}

.study-mission-block {
  margin-bottom: var(--space-3);
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
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
}

.study-mission-block ul {
  padding-left: var(--space-4);
}

.study-mission-block li {
  margin-bottom: var(--space-1);
}

.study-lesson-preview-title {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}

.study-lesson-preview-summary {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}

@media (min-width: 641px) {
  .study-new-primary {
    width: auto;
    align-self: flex-start;
  }
}
</style>
