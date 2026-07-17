import { computed, onUnmounted, shallowRef, type InjectionKey } from 'vue';

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
  const current = shallowRef(controller.view);
  const unsubscribe = controller.subscribe((next) => { current.value = next; });
  onUnmounted(() => {
    unsubscribe();
    controller.dispose();
  });

  return {
    // A computed without a setter is read-only to consumers while keeping the
    // exact StudyProductView shape (readonly() would deep-freeze nested
    // mutable arrays and break assignability).
    view: computed(() => current.value),
    isBusy: computed(() => ['uploading', 'starting'].includes(current.value.stage)),
    upload: controller.upload.bind(controller),
    selectMode: controller.selectMode.bind(controller),
    startCatalog: controller.startCatalog.bind(controller),
    open: controller.open.bind(controller),
    refresh: controller.refresh.bind(controller),
    listCourses: controller.listCourses.bind(controller),
    listCatalog: controller.listCatalog.bind(controller),
    showHome: controller.showHome.bind(controller),
    answerQuestion: controller.answerQuestion.bind(controller),
    skipQuestion: controller.skipQuestion.bind(controller),
    dismissQuestion: controller.dismissQuestion.bind(controller),
    generate: controller.generate.bind(controller),
    upgradeToDeep: controller.upgradeToDeep.bind(controller),
    checkReadiness: controller.checkReadiness.bind(controller),
    loadCourseText: controller.loadCourseText.bind(controller),
    listCourseFiles: controller.listCourseFiles.bind(controller),
    sendTutorMessage: controller.sendTutorMessage.bind(controller),
    listTutorExchanges: controller.listTutorExchanges.bind(controller),
    requestPlanChange: controller.requestPlanChange.bind(controller),
  };
}

export type StudyProductApi = ReturnType<typeof useStudyProduct>;

/** Single-owner injection: the shell provides, product components inject. */
export const STUDY_PRODUCT_INJECTION_KEY: InjectionKey<StudyProductApi> = Symbol('kimi-study-product');
