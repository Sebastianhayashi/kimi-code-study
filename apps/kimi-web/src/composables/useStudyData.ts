import { computed, ref } from 'vue';
import type {
  LearningRecord,
  StudyContext,
  StudyMission,
  StudyProgress,
  StudyResource,
} from '../types/study';

/**
 * Mock study data for the first frontend-only iteration.
 *
 * TODO: replace this static dataset with a backend client that reads the Teach
 * Skill files from the active workspace (MISSION.md, RESOURCES.md,
 * learning-records/, NOTES.md).
 */
const mockMissions: StudyMission[] = [
  {
    id: 'mission-1',
    title: '了解 Kimi Code 能做什么',
    description: '通过几个简单例子，认识 Kimi Code 如何帮助你学习、写笔记和整理资料。',
    duration: '20 分钟',
    tags: ['入门', '工具介绍'],
    order: 1,
    started: true,
    completed: false,
    totalSteps: 4,
    completedSteps: 1,
  },
  {
    id: 'mission-2',
    title: '用 AI 导师读一本书',
    description: '上传一本 EPUB，让 Kimi 带你按章节提问、做笔记、生成复习卡片。',
    duration: '1 小时',
    tags: ['阅读', '提问'],
    order: 2,
    started: false,
    completed: false,
    totalSteps: 5,
    completedSteps: 0,
  },
  {
    id: 'mission-3',
    title: '整理自己的学习看板',
    description: '把学过的内容变成可视化的进度，随时知道下一步该学什么。',
    duration: '30 分钟',
    tags: ['整理', '复习'],
    order: 3,
    started: false,
    completed: false,
    totalSteps: 3,
    completedSteps: 0,
  },
];

const mockResources: StudyResource[] = [
  {
    id: 'res-1',
    missionId: 'mission-1',
    title: 'Kimi Code 快速上手',
    type: 'article',
    source: '官方文档',
    consumed: true,
  },
  {
    id: 'res-2',
    missionId: 'mission-1',
    title: '三分钟认识界面',
    type: 'video',
    source: '教学视频',
    consumed: false,
  },
  {
    id: 'res-3',
    missionId: 'mission-2',
    title: '示例书籍：让创意更有黏性',
    type: 'epub',
    source: 'made-to-stick.epub',
    consumed: false,
  },
];

const mockRecords: LearningRecord[] = [
  {
    id: 'rec-1',
    missionId: 'mission-1',
    prompt: 'Kimi Code 和学习工具最大的区别是什么？',
    response: '它可以直接读取我本地的文件，并陪我一步一步学习。',
    createdAt: '2026-07-14T10:00:00Z',
    superseded: false,
  },
];

const context = ref<StudyContext>({
  workspaceName: '家庭学习空间',
  learnerName: '学习者',
  missions: mockMissions,
  resources: mockResources,
  records: mockRecords,
});

export function useStudyData() {
  const progress = computed<StudyProgress>(() => {
    const missions = context.value.missions;
    const resources = context.value.resources;
    const records = context.value.records;

    return {
      totalMissions: missions.length,
      completedMissions: missions.filter((m) => m.completed).length,
      inProgressMissions: missions.filter((m) => m.started && !m.completed).length,
      totalResources: resources.length,
      consumedResources: resources.filter((r) => r.consumed).length,
      totalRecords: records.length,
    };
  });

  const currentMission = computed<StudyMission | null>(() => {
    const inProgress = context.value.missions.find((m) => m.started && !m.completed);
    if (inProgress) return inProgress;
    const next = context.value.missions.find((m) => !m.started);
    return next ?? null;
  });

  const resourcesForMission = (missionId: string): StudyResource[] => {
    return context.value.resources.filter((r) => r.missionId === missionId);
  };

  const recordsForMission = (missionId: string): LearningRecord[] => {
    return context.value.records.filter((r) => r.missionId === missionId && !r.superseded);
  };

  const startMission = (missionId: string): void => {
    const mission = context.value.missions.find((m) => m.id === missionId);
    if (mission && !mission.started) {
      mission.started = true;
    }
  };

  const completeStep = (missionId: string): void => {
    const mission = context.value.missions.find((m) => m.id === missionId);
    if (!mission) return;
    if (mission.completedSteps < mission.totalSteps) {
      mission.completedSteps += 1;
      mission.started = true;
    }
    if (mission.completedSteps >= mission.totalSteps) {
      mission.completed = true;
    }
  };

  const toggleResourceConsumed = (resourceId: string): void => {
    const resource = context.value.resources.find((r) => r.id === resourceId);
    if (resource) {
      resource.consumed = !resource.consumed;
    }
  };

  return {
    context,
    progress,
    currentMission,
    resourcesForMission,
    recordsForMission,
    startMission,
    completeStep,
    toggleResourceConsumed,
  };
}
