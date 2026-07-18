<!--
  StudyChat — the kimi-native ConversationPane pre-wired to the shared client
  store (`useKimiWebClient`), used by the generator screen (main chat column)
  and the learner screen (tutor drawer). Binds the same props/events App.vue
  wires, minus the code-product panels (diff detail, PR, thinking panel) the
  study screens do not host. The whole study UI is kimi-native, so the chat
  column matches the rest of the screen by construction.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ConversationPane from '../../components/chat/ConversationPane.vue';
import { useKimiWebClient } from '../../composables/useKimiWebClient';

const { t } = useI18n();
const client = useKimiWebClient();

const running = computed(() => client.activity.value !== 'idle');
const sessionTitle = computed(() => {
  const id = client.activeSessionId.value;
  return client.sessions.value.find((s) => s.id === id)?.title ?? '';
});

function onSubmit(payload: { text: string; attachments: { fileId: string; kind: 'image' | 'video' }[] }): void {
  void client.sendPrompt(payload.text, payload.attachments);
}

function onCommand(cmd: string): void {
  // Only `/compact` is meaningful inside the study screens; other slash
  // commands target code-product surfaces (goal/swarm/btw) we do not host.
  if (cmd === '/compact' || cmd.startsWith('/compact ')) {
    void client.compact(cmd.slice('/compact'.length).trim() || undefined);
  }
}
</script>

<template>
  <ConversationPane
    minimal-chrome
    :empty-title="t('study.chat.emptyTitle')"
    :turns="client.turns.value"
    :session-id="client.activeSessionId.value"
    :approvals="client.pendingApprovals.value"
    :changes="client.changes.value"
    :git-info="client.gitInfo.value"
    :tasks="client.tasks.value"
    :todos="client.todos.value"
    :goal="client.goal.value"
    :activation-badges="client.activationBadges.value"
    :status="client.status.value"
    :thinking="client.thinking.value"
    :plan-mode="client.planMode.value"
    :swarm-mode="client.swarmMode.value"
    :goal-mode="client.goalMode.value"
    :models="client.models.value"
    :starred-ids="client.starredModelIds.value"
    :skills="client.skills.value"
    :questions="client.questions.value"
    :pending-question-actions="client.pendingQuestionActions"
    :pending-approval-actions="client.pendingApprovalActions"
    :running="running"
    :queued="client.queued.value"
    :search-files="client.searchFiles"
    :upload-image="client.uploadImage"
    :sending="client.isSending.value"
    :starting="client.isStartingFirstPrompt.value"
    :fast-moon="client.fastMoon.value"
    :file-reload-key="client.activeSessionId.value"
    :session-loading="client.sessionLoading.value"
    :compaction="client.compaction.value"
    :has-more-messages="client.hasMoreMessages.value"
    :loading-more="client.loadingMoreMessages.value"
    :loading-more-error="client.loadMoreMessagesError.value"
    :load-older-messages="client.loadOlderMessages"
    :workspace-name="client.visibleWorkspace.value?.name"
    :workspace-root="client.visibleWorkspace.value?.root ?? client.status.value.cwd"
    :git-diff-stats="client.gitDiffStats.value"
    :workspaces="client.workspacesView.value"
    :active-workspace-id="client.activeWorkspaceId.value"
    :session-title="sessionTitle"
    @submit="onSubmit"
    @steer="client.steerPrompt($event.text, $event.attachments)"
    @approval="(approvalId, response) => client.respondApproval(approvalId, response)"
    @cancel-task="client.cancelTask($event)"
    @answer="(questionId, response) => client.respondQuestion(questionId, response)"
    @dismiss="(questionId) => client.dismissQuestion(questionId)"
    @command="onCommand"
    @interrupt="client.abortCurrentPrompt()"
    @unqueue="client.unqueue($event)"
    @edit-queued="client.unqueue($event)"
    @reorder-queue="client.reorderQueue($event.from, $event.to)"
    @set-permission="client.setPermission($event)"
    @set-thinking="client.setThinking($event)"
    @toggle-plan="client.togglePlanMode()"
    @toggle-swarm="client.toggleSwarmMode()"
    @toggle-goal="client.toggleGoalMode()"
    @create-goal="client.createGoal($event)"
    @control-goal="client.controlGoal($event)"
    @compact="client.compact()"
    @select-model="client.setModel($event)"
  />
</template>
