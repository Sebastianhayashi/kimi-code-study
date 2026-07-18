<!--
  StudyCourseList — the "我的课程" sidebar list: one row per course with an
  honest status badge (UX v2 state machine + review-due). Used by the app
  shell's collapsible sidebar.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Spinner from '../../components/ui/Spinner.vue';
import Banner from '../../components/ui/Banner.vue';
import { listStudyCourses } from '../studyClient';
import type { CourseSummary } from '../studyClient';
import type { StudyRoute } from '../domain/studyRoute';

const emit = defineEmits<{ navigate: [route: StudyRoute] }>();
const { t } = useI18n();

const courses = ref<CourseSummary[]>([]);
const loading = ref(true);
const loadError = ref('');

async function refresh(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    courses.value = await listStudyCourses();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
defineExpose({ refresh });

function openCourse(course: CourseSummary): void {
  emit('navigate', { name: 'generator', sessionId: course.session.id });
}

function statusText(course: CourseSummary): string {
  if (course.reviewDue) return t('study.home.statusReview');
  if (course.lessonCount > 0) {
    return t('study.home.statusLearning', { count: course.lessonCount });
  }
  if (course.hasMap) return t('study.home.statusOutline');
  if (course.hasMission) return t('study.home.statusReading');
  return t('study.home.statusInterview');
}
</script>

<template>
  <div class="course-list-wrap">
    <Banner v-if="loadError" variant="danger">{{ loadError }}</Banner>
    <div v-else-if="loading" class="list-loading"><Spinner size="sm" /></div>
    <div v-else-if="courses.length === 0" class="list-empty">
      {{ t('study.home.emptyCourses') }}
    </div>
    <ul v-else class="course-list">
      <li v-for="course in courses" :key="course.session.id">
        <button type="button" class="course-row" @click="openCourse(course)">
          <span class="course-title">{{ course.session.title }}</span>
          <span class="course-status" :class="{ 'course-status-review': course.reviewDue }">
            {{ statusText(course) }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.course-list-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.list-loading {
  display: flex;
  justify-content: center;
  padding: var(--space-4);
}

.list-empty {
  font-size: 12.5px;
  color: var(--color-text-faint);
  padding: var(--space-2) var(--space-1);
  line-height: 1.6;
}

.course-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.course-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 8px var(--space-2);
  border: none;
  border-radius: 8px;
  background: none;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.course-row:hover {
  background: var(--color-hover);
}

.course-title {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-status {
  flex: none;
  font-size: 11.5px;
  color: var(--color-text-faint);
}

.course-status-review {
  color: var(--color-accent);
  font-weight: var(--weight-semibold);
}
</style>
