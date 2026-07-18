<!-- apps/kimi-web/src/study/StudyApp.vue -->
<!-- Kimi Study product shell. The core path is deliberately narrow:
     upload material, generate with Quick, optionally deepen, then learn. -->
<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppearance } from '../composables/client/useAppearance';
import { initServerAuth, setCredential } from '../api/daemon/serverAuth';
import Button from '../components/ui/Button.vue';
import Icon from '../components/ui/Icon.vue';
import Spinner from '../components/ui/Spinner.vue';
import {
  deriveStudyScreen,
  STUDY_PRODUCT_INJECTION_KEY,
  useStudyProduct,
  type QuestionResponse,
  type StudyCourseBinding,
} from './foundation';
import StudyProductHome from './components/product/StudyProductHome.vue';
import StudyPreparing from './components/product/StudyPreparing.vue';
import StudyOutline from './components/product/StudyOutline.vue';
import StudyLearning from './components/product/StudyLearning.vue';
import StudyQuestionCard from './components/product/StudyQuestionCard.vue';

initServerAuth();

const { t } = useI18n();
useAppearance();

const product = useStudyProduct();
provide(STUDY_PRODUCT_INJECTION_KEY, product);
const courses = ref<readonly StudyCourseBinding[]>([]);

async function reloadCourses(): Promise<void> {
  try {
    courses.value = await product.listCourses();
  } catch {
    courses.value = [];
  }
}

onMounted(async () => {
  try {
    await product.checkReadiness();
  } catch {
    // Readiness failure is already reflected in the view state.
  }
  await reloadCourses();
});

const model = computed(() => deriveStudyScreen(product.view.value));
const snapshot = computed(() => product.view.value.snapshot);
const question = computed(() => product.view.value.question);

const needsServerCredential = computed(() =>
  model.value.screen === 'unavailable'
  && /401|unauthorized/i.test(model.value.readinessMessage ?? ''));

const serverTokenInput = ref('');

async function saveServerToken(): Promise<void> {
  const token = serverTokenInput.value.trim();
  if (token.length === 0) return;
  setCredential(token);
  serverTokenInput.value = '';
  await onRecheck();
}

watch(
  () => model.value.screen,
  (screen) => {
    if (screen === 'home') void reloadCourses();
  },
);

const title = computed(() => t('study.title'));
watch(
  title,
  (value) => {
    if (typeof document !== 'undefined') document.title = value;
  },
  { immediate: true },
);

async function guard(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch {
    // Failures transition the facade to the error screen.
  }
}

function onUpload(file: File): Promise<void> {
  return guard(async () => {
    await product.upload(file);
    // Quick is the product default. Deep remains an optional later enhancement.
    await product.selectMode('quick');
  });
}

function onOpen(courseId: string): Promise<void> {
  return guard(async () => {
    const opened = await product.open(courseId);
    if (!opened) await reloadCourses();
  });
}

function onAnswer(response: QuestionResponse): Promise<void> {
  return guard(() => product.answerQuestion(response));
}

function onSkipQuestion(): Promise<void> {
  return guard(() => product.skipQuestion());
}

function onDismissQuestion(): Promise<void> {
  return guard(() => product.dismissQuestion());
}

function onGenerate(): Promise<void> {
  return guard(() => product.generate());
}

function onUpgrade(): Promise<void> {
  return guard(() => product.upgradeToDeep());
}

function onHome(): void {
  product.showHome();
}

function onRecheck(): Promise<void> {
  return guard(() => product.checkReadiness());
}
</script>

<template>
  <div class="study-app" :data-screen="model.screen">
    <header class="study-topbar">
      <div class="study-brand">
        <span class="study-logo" aria-hidden="true">K</span>
        <h1 class="study-name">{{ t('study.title') }}</h1>
      </div>
      <Button
        v-if="model.screen !== 'home' && model.screen !== 'loading' && model.screen !== 'unavailable'"
        variant="ghost"
        size="sm"
        @click="onHome"
      >
        <Icon name="arrow-right" size="sm" class="study-back-icon" />
        <span>{{ t('study.product.backHome') }}</span>
      </Button>
    </header>

    <main class="study-main">
      <div v-if="model.screen === 'loading'" class="study-center">
        <Spinner size="lg" />
        <p class="study-center-text">{{ t('study.product.loading') }}</p>
      </div>

      <div v-else-if="model.screen === 'unavailable'" class="study-center">
        <template v-if="needsServerCredential">
          <Icon name="log-in" size="lg" />
          <h2 class="study-center-title">{{ t('study.product.serverTokenTitle') }}</h2>
          <p class="study-center-text">{{ t('study.product.serverTokenHint') }}</p>
          <form class="study-token-form" @submit.prevent="saveServerToken">
            <input
              v-model="serverTokenInput"
              class="study-token-input"
              type="password"
              autocomplete="off"
              :placeholder="t('study.product.serverTokenPlaceholder')"
            />
            <Button variant="primary" size="md" type="submit" :disabled="serverTokenInput.trim().length === 0">
              {{ t('study.product.serverTokenSave') }}
            </Button>
          </form>
        </template>
        <template v-else>
          <Icon name="alert-triangle" size="lg" />
          <h2 class="study-center-title">{{ t('study.product.unavailableTitle') }}</h2>
          <p class="study-center-text">{{ model.readinessMessage ?? t('study.product.unavailableBody') }}</p>
          <Button variant="secondary" size="md" @click="onRecheck">
            {{ t('study.product.retry') }}
          </Button>
        </template>
      </div>

      <StudyProductHome
        v-else-if="model.screen === 'home'"
        :courses="courses"
        :busy="model.busy"
        :auth-required="model.authRequired"
        :readiness-message="model.readinessMessage"
        @upload="onUpload"
        @open="onOpen"
        @recheck="onRecheck"
      />

      <!-- mode_select is intentionally transient: uploads immediately select Quick. -->
      <div v-else-if="model.screen === 'mode_select'" class="study-center">
        <Spinner size="lg" />
        <p class="study-center-text">{{ t('study.product.loading') }}</p>
      </div>

      <StudyPreparing
        v-else-if="model.screen === 'preparing' && snapshot"
        :snapshot="snapshot"
      />

      <StudyOutline
        v-else-if="model.screen === 'outline' && snapshot"
        :snapshot="snapshot"
        :busy="model.busy"
        @generate="onGenerate"
        @upgrade="onUpgrade"
      />

      <StudyLearning
        v-else-if="model.screen === 'learning' && snapshot"
        :snapshot="snapshot"
        :busy="model.busy"
        @upgrade="onUpgrade"
        @home="onHome"
      />

      <div v-else-if="model.screen === 'blocked'" class="study-center">
        <Icon name="alert-triangle" size="lg" />
        <h2 class="study-center-title">{{ t('study.product.blockedTitle') }}</h2>
        <Button variant="secondary" size="md" @click="onHome">
          {{ t('study.product.backHome') }}
        </Button>
      </div>

      <div v-else class="study-center">
        <Icon name="alert-triangle" size="lg" />
        <h2 class="study-center-title">{{ t('study.product.errorTitle') }}</h2>
        <Button variant="secondary" size="md" @click="onHome">
          {{ t('study.product.backHome') }}
        </Button>
      </div>
    </main>

    <StudyQuestionCard
      v-if="question"
      :question="question"
      @answer="onAnswer"
      @skip="onSkipQuestion"
      @dismiss="onDismissQuestion"
    />
  </div>
</template>

<style scoped>
.study-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-ui);
}

.study-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-shrink: 0;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface);
}

.study-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.study-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  font-weight: var(--weight-semibold);
  font-size: var(--text-base);
  flex: none;
}

.study-name {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  white-space: nowrap;
}

.study-back-icon {
  transform: scaleX(-1);
}

.study-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.study-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: 60vh;
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--color-text-muted);
}

.study-center-title {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}

.study-center-text {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
  max-width: 420px;
}

.study-token-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: min(420px, 100%);
}

.study-token-input {
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.study-token-input:focus {
  outline: none;
  border-color: var(--color-accent-bd);
}
</style>
