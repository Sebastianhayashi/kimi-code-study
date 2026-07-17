<!-- apps/kimi-web/src/study/components/product/StudyQuestionCard.vue -->
<!-- The single focused Mission question card: one question, 2-4 options,
     optional free-text "other", skip, and close. It is pinned to the bottom
     of the preparation/outline surface as the next learner action. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../../../components/ui/Button.vue';
import Card from '../../../components/ui/Card.vue';
import Icon from '../../../components/ui/Icon.vue';
import IconButton from '../../../components/ui/IconButton.vue';
import type { QuestionResponse, StudyQuestion } from '../../foundation';

const props = defineProps<{
  question: StudyQuestion;
}>();

const emit = defineEmits<{
  answer: [response: QuestionResponse];
  skip: [];
  dismiss: [];
}>();

const { t } = useI18n();

const item = computed(() => props.question.questions[0]);

const otherOpen = ref(false);
const otherText = ref('');

function choose(optionId: string): void {
  emit('answer', {
    answers: { [item.value.id]: { kind: 'single', optionId } },
    method: 'click',
  });
}

function submitOther(): void {
  const text = otherText.value.trim();
  if (text.length === 0) return;
  emit('answer', {
    answers: { [item.value.id]: { kind: 'other', text } },
    method: 'enter',
  });
}
</script>

<template>
  <div class="study-question-dock" role="dialog" :aria-label="item.header ?? t('study.product.missionWork')">
    <Card class="study-question-card" elevated>
      <div class="study-question-head">
        <span v-if="item.header" class="study-question-kicker">{{ item.header }}</span>
        <IconButton
          class="study-question-close"
          size="sm"
          :label="t('study.product.questionDismiss')"
          @click="emit('dismiss')"
        >
          <Icon name="close" size="md" />
        </IconButton>
      </div>

      <p class="study-question-text">{{ item.question }}</p>
      <p v-if="item.body" class="study-question-body">{{ item.body }}</p>

      <div v-if="!otherOpen" class="study-question-options">
        <button
          v-for="option in item.options"
          :key="option.id"
          type="button"
          class="study-question-option"
          @click="choose(option.id)"
        >
          <span class="study-question-option-label">{{ option.label }}</span>
          <span v-if="option.description" class="study-question-option-desc">
            {{ option.description }}
          </span>
        </button>
        <button
          v-if="item.allowOther"
          type="button"
          class="study-question-option study-question-option--other"
          @click="otherOpen = true"
        >
          <span class="study-question-option-label">
            {{ item.otherLabel ?? t('study.product.questionOther') }}
          </span>
        </button>
      </div>

      <div v-else class="study-question-other">
        <textarea
          v-model="otherText"
          class="study-question-textarea"
          rows="3"
          :placeholder="item.otherDescription ?? t('study.product.questionOtherPlaceholder')"
          @keydown.enter.exact.prevent="submitOther"
        />
        <div class="study-question-other-actions">
          <Button variant="ghost" size="sm" @click="otherOpen = false">
            {{ t('study.product.questionBack') }}
          </Button>
          <Button
            variant="primary"
            size="sm"
            :disabled="otherText.trim().length === 0"
            @click="submitOther"
          >
            <Icon name="send" size="sm" />
            <span>{{ t('study.product.questionSubmit') }}</span>
          </Button>
        </div>
      </div>

      <div class="study-question-foot">
        <Button variant="ghost" size="sm" @click="emit('skip')">
          {{ t('study.product.questionSkip') }}
        </Button>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.study-question-dock {
  position: fixed;
  left: 50%;
  bottom: var(--space-4);
  transform: translateX(-50%);
  width: min(560px, calc(100% - 2 * var(--space-4)));
  z-index: var(--z-overlay);
}

.study-question-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.study-question-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 24px;
}

.study-question-kicker {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.study-question-close {
  margin-left: auto;
}

.study-question-text {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
  line-height: var(--leading-relaxed);
}

.study-question-body {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-question-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-question-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out);
}

.study-question-option:hover {
  border-color: var(--color-accent-bd);
}

.study-question-option-label {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.study-question-option-desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-question-other {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-question-textarea {
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

.study-question-textarea:focus {
  outline: none;
  border-color: var(--color-accent-bd);
}

.study-question-other-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.study-question-foot {
  display: flex;
  justify-content: flex-end;
}
</style>
