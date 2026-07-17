import { computed, onUnmounted, readonly, shallowRef } from 'vue';

import { getKimiWebApi } from '../../api';
import { StudyProductController } from '../product/studyProductController';
import { StudyCourseRegistry } from '../runtime/courseRegistry';
import { KimiStudyRuntime } from '../runtime/kimiStudyRuntime';

const STUDY_WORKSPACE_ROOT = '/home/yuyu/kimi-study-workspace';

export interface UseStudyProductOptions {
  readonly controller?: StudyProductController;
  readonly workspaceRoot?: string;
}

/**
 * Product-only façade for Kimi Study UI. It intentionally exposes no model,
 * permission, plan-mode, session-profile, or developer-chat controls.
 */
export function useStudyProduct(options: UseStudyProductOptions = {}) {
  const controller = options.controller ?? new StudyProductController(
    new KimiStudyRuntime(
      getKimiWebApi(),
      new StudyCourseRegistry(globalThis.localStorage),
      { workspaceRoot: options.workspaceRoot ?? STUDY_WORKSPACE_ROOT },
    ),
  );
  const view = shallowRef(controller.view);
  const unsubscribe = controller.subscribe((next) => { view.value = next; });
  onUnmounted(() => {
    unsubscribe();
    controller.dispose();
  });

  return {
    view: readonly(view),
    isBusy: computed(() => ['uploading', 'starting'].includes(view.value.stage)),
    upload: controller.upload.bind(controller),
    selectMode: controller.selectMode.bind(controller),
    startCatalog: controller.startCatalog.bind(controller),
    open: controller.open.bind(controller),
    refresh: controller.refresh.bind(controller),
    answerQuestion: controller.answerQuestion.bind(controller),
    skipQuestion: controller.skipQuestion.bind(controller),
    dismissQuestion: controller.dismissQuestion.bind(controller),
    generate: controller.generate.bind(controller),
    upgradeToDeep: controller.upgradeToDeep.bind(controller),
    checkReadiness: controller.checkReadiness.bind(controller),
  };
}
