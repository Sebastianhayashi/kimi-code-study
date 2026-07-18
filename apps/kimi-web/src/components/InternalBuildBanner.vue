<!-- apps/kimi-web/src/components/InternalBuildBanner.vue -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { isDesktop } from '../lib/desktopFlag';

const { t } = useI18n();

// True only inside the Kimi Desktop app (see desktopFlag.ts). Renders a small
// tag pinned to the app's bottom-right corner (positioned by App.vue).
const show = isDesktop;
</script>

<template>
  <span
    v-if="show"
    class="internal-build-tag"
    role="note"
    :aria-label="t('app.internalBuildBanner')"
  >
    <svg
      viewBox="0 0 16 16"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2 14 13H2L8 2Z" />
      <path d="M8 6v3.5" />
      <path d="M8 11.5h.01" />
    </svg>
    <span>{{ t('app.internalBuildBanner') }}</span>
  </span>
</template>

<style scoped>
.internal-build-tag {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: var(--color-logo-dev);
  color: var(--color-logo-dev-text);
  font-size: 11px;
  font-weight: var(--weight-semibold);
  letter-spacing: 0.01em;
  line-height: 1.4;
  white-space: nowrap;
  user-select: none;
}
</style>
