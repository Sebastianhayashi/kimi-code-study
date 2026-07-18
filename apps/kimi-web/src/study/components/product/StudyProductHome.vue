<!-- Kimi Study home: personal courses plus the minimal approved Catalog slice. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../../../components/ui/Button.vue';
import Card from '../../../components/ui/Card.vue';
import Dialog from '../../../components/ui/Dialog.vue';
import Icon from '../../../components/ui/Icon.vue';
import Badge from '../../../components/ui/Badge.vue';
import type { CertifiedCatalogMaterial, StudyCourseBinding } from '../../foundation';

type HomeSection = 'courses' | 'textbooks' | 'books';

const props = defineProps<{
  courses: readonly StudyCourseBinding[];
  catalog: readonly CertifiedCatalogMaterial[];
  coverUrls: Readonly<Record<string, string>>;
  busy: boolean;
  catalogBusy: boolean;
  authRequired: boolean;
  readinessMessage?: string;
  importState: 'idle' | 'installing' | 'succeeded' | 'failed';
  importMessage?: string;
  initialSection?: HomeSection;
}>();

const emit = defineEmits<{
  upload: [file: File];
  importPackage: [file: File];
  open: [courseId: string];
  startCatalog: [material: CertifiedCatalogMaterial];
  recheck: [];
}>();

const { t } = useI18n();
const fileInput = ref<HTMLInputElement | null>(null);
const packageInput = ref<HTMLInputElement | null>(null);
const section = ref<HomeSection>(props.initialSection ?? 'courses');
const selected = ref<CertifiedCatalogMaterial | null>(null);

const textbooks = computed(() => props.catalog.filter((item) => item.materialKind === 'textbook'));
const books = computed(() => props.catalog.filter((item) => item.materialKind === 'book'));
const visibleCatalog = computed(() => section.value === 'textbooks' ? textbooks.value : books.value);

function pickFile(): void {
  if (props.busy || props.authRequired) return;
  fileInput.value?.click();
}

function pickPackage(): void {
  if (props.catalogBusy || props.authRequired) return;
  packageInput.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file !== undefined) emit('upload', file);
  input.value = '';
}

function onPackageChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file !== undefined) emit('importPackage', file);
  input.value = '';
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

function authorLine(material: CertifiedCatalogMaterial): string {
  return material.authors.join(t('study.product.catalogAuthorSeparator'));
}

function openMaterial(material: CertifiedCatalogMaterial): void {
  selected.value = material;
}

function startSelected(): void {
  if (selected.value === null || props.authRequired || props.busy) return;
  const material = selected.value;
  selected.value = null;
  emit('startCatalog', material);
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

      <input ref="fileInput" class="study-file-input" type="file" aria-hidden="true" tabindex="-1" @change="onFileChange" />
      <Button variant="primary" size="lg" :loading="busy" :disabled="authRequired" @click="pickFile">
        <Icon name="file-plus" size="md" />
        <span>{{ busy ? t('study.product.uploading') : t('study.product.uploadAction') }}</span>
      </Button>
      <p class="study-hero-formats">{{ t('study.product.uploadFormats') }}</p>
    </section>

    <nav class="study-library-nav" :aria-label="t('study.product.libraryNavigation')">
      <Button :variant="section === 'courses' ? 'secondary' : 'ghost'" size="sm" @click="section = 'courses'">
        {{ t('study.product.myCourses') }}
      </Button>
      <Button :variant="section === 'textbooks' ? 'secondary' : 'ghost'" size="sm" @click="section = 'textbooks'">
        {{ t('study.product.textbookLibrary') }}
        <Badge variant="neutral" size="sm">{{ textbooks.length }}</Badge>
      </Button>
      <Button :variant="section === 'books' ? 'secondary' : 'ghost'" size="sm" @click="section = 'books'">
        {{ t('study.product.bookLibrary') }}
        <Badge variant="neutral" size="sm">{{ books.length }}</Badge>
      </Button>
    </nav>

    <section v-if="section === 'courses'" class="study-courses">
      <h2 class="study-section-title">{{ t('study.product.myCourses') }}</h2>
      <div v-if="courses.length > 0" class="study-course-list">
        <Card
          v-for="course in courses"
          :key="course.courseId"
          class="study-course-item"
          tabindex="0"
          role="button"
          :aria-label="t('study.product.openCourse', { title: course.title })"
          @click="emit('open', course.courseId)"
          @keydown.enter="emit('open', course.courseId)"
          @keydown.space.prevent="emit('open', course.courseId)"
        >
          <div class="study-course-row">
            <Icon name="file-text" size="md" />
            <div class="study-course-info">
              <span class="study-course-title">{{ course.title }}</span>
              <span class="study-course-meta">{{ formatUpdated(course.updatedAt) }}</span>
            </div>
            <Badge variant="neutral" size="sm">
              {{ course.sourceKind === 'catalog' ? t('study.product.courseKindCatalog') : t('study.product.courseKindUpload') }}
            </Badge>
            <Icon name="chevron-right" size="md" />
          </div>
        </Card>
      </div>
      <p v-else class="study-courses-empty">{{ t('study.product.emptyCourses') }}</p>
    </section>

    <section v-else class="study-catalog">
      <div class="study-catalog-heading">
        <div>
          <h2 class="study-section-title">
            {{ section === 'textbooks' ? t('study.product.textbookLibrary') : t('study.product.bookLibrary') }}
          </h2>
          <p class="study-catalog-hint">{{ t('study.product.catalogHint') }}</p>
        </div>
        <input
          ref="packageInput"
          class="study-file-input"
          type="file"
          accept=".kstudy.zip,application/zip"
          aria-hidden="true"
          tabindex="-1"
          @change="onPackageChange"
        />
        <Button variant="ghost" size="sm" :loading="catalogBusy" :disabled="authRequired" @click="pickPackage">
          <Icon name="plus" size="sm" />
          {{ t('study.product.importPackage') }}
        </Button>
      </div>

      <p
        v-if="importState !== 'idle'"
        class="study-import-status"
        :class="`study-import-status--${importState}`"
        role="status"
      >
        {{ importMessage }}
      </p>

      <div v-if="visibleCatalog.length > 0" class="study-catalog-grid">
        <Card
          v-for="material in visibleCatalog"
          :key="material.packageRef"
          class="study-catalog-card"
          tabindex="0"
          role="button"
          :aria-label="t('study.product.openMaterial', { title: material.title })"
          @click="openMaterial(material)"
          @keydown.enter="openMaterial(material)"
          @keydown.space.prevent="openMaterial(material)"
        >
          <img
            v-if="coverUrls[material.packageRef]"
            class="study-cover"
            :src="coverUrls[material.packageRef]"
            :alt="t('study.product.coverAlt', { title: material.title })"
          />
          <div v-else class="study-cover study-cover--fallback" aria-hidden="true">
            <span class="study-cover-kind">{{ material.materialKind === 'textbook' ? t('study.product.textbook') : t('study.product.book') }}</span>
            <strong>{{ material.title }}</strong>
            <span>{{ authorLine(material) }}</span>
          </div>
          <div class="study-catalog-copy">
            <h3>{{ material.title }}</h3>
            <p>{{ authorLine(material) }}</p>
            <span v-if="material.publisher">{{ material.publisher }}<template v-if="material.edition"> · {{ material.edition }}</template></span>
          </div>
        </Card>
      </div>
      <p v-else class="study-courses-empty">{{ t('study.product.emptyCatalog') }}</p>
    </section>

    <Dialog
      :open="selected !== null"
      :title="selected?.title"
      :description="selected === null ? undefined : authorLine(selected)"
      size="md"
      @update:open="(open) => { if (!open) selected = null; }"
    >
      <div v-if="selected" class="study-material-detail">
        <img
          v-if="coverUrls[selected.packageRef]"
          class="study-detail-cover"
          :src="coverUrls[selected.packageRef]"
          :alt="t('study.product.coverAlt', { title: selected.title })"
        />
        <div class="study-detail-copy">
          <p v-if="selected.subtitle">{{ selected.subtitle }}</p>
          <p v-if="selected.description">{{ selected.description }}</p>
          <dl>
            <template v-if="selected.publisher">
              <dt>{{ t('study.product.publisher') }}</dt><dd>{{ selected.publisher }}</dd>
            </template>
            <template v-if="selected.edition">
              <dt>{{ t('study.product.edition') }}</dt><dd>{{ selected.edition }}</dd>
            </template>
            <template v-if="selected.education?.grade">
              <dt>{{ t('study.product.grade') }}</dt><dd>{{ selected.education.grade }}</dd>
            </template>
            <template v-if="selected.education?.subject">
              <dt>{{ t('study.product.subject') }}</dt><dd>{{ selected.education.subject }}</dd>
            </template>
          </dl>
        </div>
      </div>
      <template #foot>
        <Button variant="secondary" size="md" @click="selected = null">{{ t('study.product.cancel') }}</Button>
        <Button variant="primary" size="md" :disabled="authRequired || busy" @click="startSelected">
          {{ t('study.product.startLearning') }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.study-home { display: flex; flex-direction: column; gap: var(--space-6); max-width: 960px; margin: 0 auto; padding: var(--space-6) var(--space-4); }
.study-hero { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3); }
.study-hero-title { font-size: var(--text-2xl); font-weight: var(--weight-semibold); line-height: var(--leading-tight); color: var(--color-text); }
.study-hero-hint { font-size: var(--text-base); color: var(--color-text-muted); line-height: var(--leading-relaxed); }
.study-hero-formats, .study-catalog-hint { font-size: var(--text-xs); color: var(--color-text-muted); }
.study-file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
.study-auth-notice { width: 100%; }
.study-auth-row { display: flex; align-items: flex-start; gap: var(--space-3); color: var(--color-text-muted); }
.study-auth-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.study-auth-title { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--color-text); }
.study-auth-body { font-size: var(--text-sm); color: var(--color-text-muted); line-height: var(--leading-relaxed); }
.study-library-nav { display: flex; flex-wrap: wrap; gap: var(--space-2); padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-line); }
.study-courses, .study-catalog { display: flex; flex-direction: column; gap: var(--space-3); }
.study-section-title { font-size: var(--text-lg); font-weight: var(--weight-semibold); color: var(--color-text); }
.study-course-list { display: flex; flex-direction: column; gap: var(--space-2); }
.study-course-item, .study-catalog-card { cursor: pointer; transition: border-color var(--duration-fast) var(--ease-out); }
.study-course-item:hover, .study-course-item:focus-visible, .study-catalog-card:hover, .study-catalog-card:focus-visible { border-color: var(--color-accent-bd); outline: none; box-shadow: var(--p-focus-ring); }
.study-course-row { display: flex; align-items: center; gap: var(--space-3); color: var(--color-text-muted); }
.study-course-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.study-course-title { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.study-course-meta { font-size: var(--text-xs); color: var(--color-text-muted); }
.study-courses-empty { font-size: var(--text-sm); color: var(--color-text-muted); }
.study-catalog-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
.study-catalog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: var(--space-4); }
.study-catalog-card { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.study-cover { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: var(--radius-md); border: 1px solid var(--color-line); background: var(--color-surface-sunken); }
.study-cover--fallback { display: flex; flex-direction: column; justify-content: space-between; padding: var(--space-4); color: var(--color-text); background: var(--color-surface); box-shadow: inset 0 4px 0 var(--color-accent); }
.study-cover--fallback strong { font-size: var(--text-lg); line-height: var(--leading-tight); }
.study-cover--fallback span { font-size: var(--text-xs); color: var(--color-text-muted); }
.study-cover-kind { text-transform: uppercase; letter-spacing: .08em; }
.study-catalog-copy { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.study-catalog-copy h3 { font-size: var(--text-base); font-weight: var(--weight-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.study-catalog-copy p, .study-catalog-copy span { font-size: var(--text-xs); color: var(--color-text-muted); }
.study-import-status { padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-sm); background: var(--color-surface); color: var(--color-text-muted); }
.study-import-status--succeeded { color: var(--color-success); }
.study-import-status--failed { color: var(--color-danger); }
.study-material-detail { display: grid; grid-template-columns: 120px 1fr; gap: var(--space-4); }
.study-detail-cover { width: 120px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: var(--radius-md); border: 1px solid var(--color-line); }
.study-detail-copy { display: flex; flex-direction: column; gap: var(--space-3); color: var(--color-text-muted); line-height: var(--leading-relaxed); }
.study-detail-copy dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-3); font-size: var(--text-sm); }
.study-detail-copy dt { color: var(--color-text-muted); }
.study-detail-copy dd { color: var(--color-text); }
@media (max-width: 640px) {
  .study-home { padding: var(--space-4); }
  .study-catalog-heading { flex-direction: column; }
  .study-catalog-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .study-material-detail { grid-template-columns: 1fr; }
  .study-detail-cover { width: 100%; max-width: 180px; }
}
</style>
