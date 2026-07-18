<!-- apps/kimi-web/src/study/components/product/StudyProductHome.vue -->
<!-- Kimi Study core home: one material upload entry and resumable courses. -->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../../../components/ui/Button.vue';
import Card from '../../../components/ui/Card.vue';
import Icon from '../../../components/ui/Icon.vue';
import Badge from '../../../components/ui/Badge.vue';
import type { StudyCourseBinding } from '../../foundation';

const props = defineProps<{
  courses: readonly StudyCourseBinding[];
  busy: boolean;
  authRequired: boolean;
  readinessMessage?: string;
}>();

const emit = defineEmits<{
  upload: [file: File];
  open: [courseId: string];
  recheck: [];
}>();

const { t } = useI18n();
const fileInput = ref<HTMLInputElement | null>(null);

function pickFile(): void {
  if (props.busy || props.authRequired) return;
  fileInput.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file !== undefined) emit('upload', file);
  input.value = '';
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}
</script>

<template>
  <div class="study-home">
    <section class="study-hero">
      <h1 class="study-hero-title">{{ t('study.product.homeTitle') }}</h1>
      <p class="study-hero-hint">{{ t('study.product.homeHint') }}</p>

      <Card v-if="authRequired" class="study-auth-notice">
        <div class="study-auth-row">
          <Icon name="info" size="md" />
          <div class="study-auth-copy">
            <p class="study-auth-title">{{ t('study.product.authTitle') }}</p>
            <p class="study-auth-body">{{ readinessMessage ?? t('study.product.authBody') }}</p>
          </div>
          <Button variant="secondary" size="sm" @click="emit('recheck')">
            {{ t('study.product.recheck') }}
          </Button>
        </div>
      </Card>

      <input
        ref="fileInput"
        class="study-file-input"
        type="file"
        aria-hidden="true"
        tabindex="-1"
        @change="onFileChange"
      />
      <Button
        variant="primary"
        size="lg"
        :loading="busy"
        :disabled="authRequired"
        @click="pickFile"
      >
        <Icon name="file-plus" size="md" />
        <span>{{ busy ? t('study.product.uploading') : t('study.product.uploadAction') }}</span>
      </Button>
      <p class="study-hero-formats">{{ t('study.product.uploadFormats') }}</p>
    </section>

    <section class="study-courses">
      <h2 class="study-section-title">{{ t('study.product.myCourses') }}</h2>
      <div v-if="courses.length > 0" class="study-course-list">
        <Card
          v-for="course in courses"
          :key="course.courseId"
          class="study-course-item"
          tabindex="0"
          role="button"
          @click="emit('open', course.courseId)"
          @keydown.enter="emit('open', course.courseId)"
        >
          <div class="study-course-row">
            <Icon name="file-text" size="md" />
            <div class="study-course-info">
              <span class="study-course-title">{{ course.title }}</span>
              <span class="study-course-meta">{{ formatUpdated(course.updatedAt) }}</span>
            </div>
            <Badge variant="neutral" size="sm">
              {{ t('study.product.courseKindUpload') }}
            </Badge>
            <Icon name="chevron-right" size="md" />
          </div>
        </Card>
      </div>
      <p v-else class="study-courses-empty">{{ t('study.product.emptyCourses') }}</p>
    </section>
  </div>
</template>

<style scoped>
.study-home {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
}

.study-hero {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

.study-hero-title {
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  color: var(--color-text);
}

.study-hero-hint {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-hero-formats {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.study-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
}

.study-auth-notice {
  width: 100%;
}

.study-auth-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  color: var(--color-text-muted);
}

.study-auth-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.study-auth-title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.study-auth-body {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.study-courses {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.study-section-title {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}

.study-course-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.study-course-item {
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out);
}

.study-course-item:hover {
  border-color: var(--color-accent-bd);
}

.study-course-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
}

.study-course-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.study-course-title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.study-course-meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.study-courses-empty {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
</style>
