<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../common/BaseModal.vue';
import BaseButton from '../common/BaseButton.vue';
import SessionAgentSelector from './SessionAgentSelector.vue';
import SessionTaskSelector from './SessionTaskSelector.vue';
import SessionConfigPanel from './SessionConfigPanel.vue';
import { useAgentsStore } from '../../stores/agents';
import { useSessionsStore } from '../../stores/sessions';
import { useTasksStore, type TaskRecord } from '../../stores/tasks';
import { useProjectsStore } from '../../stores/projects';
import { useIpc } from '../../composables/useIpc';

export interface RemixData {
  agentId: string;
  task: string;
  model: 'opus' | 'sonnet' | 'haiku';
  projectId?: string | null;
  taskId?: string | null;
}

const props = defineProps<{
  show: boolean;
  preselectedAgentId?: string;
  preselectedTaskId?: string;
  preselectedProjectId?: string;
  remixData?: RemixData | null;
  parentSessionId?: string;
}>();

const emit = defineEmits<{
  close: [];
  launched: [sessionId: string];
}>();

const { t } = useI18n();
const agentsStore = useAgentsStore();
const sessionsStore = useSessionsStore();
const tasksStore = useTasksStore();
const projectsStore = useProjectsStore();
const ipc = useIpc();

const selectedAgentId = ref('');
const task = ref('');
const model = ref<'opus' | 'sonnet' | 'haiku'>('sonnet');
const maxTurns = ref(10);
const selectedTaskId = ref<string | null>(null);
const showPromptPreview = ref(false);
const promptPreview = ref('');
const launching = ref(false);
const availableTasks = ref<TaskRecord[]>([]);

const selectedProjectId = ref<string | null>(null);

// 9E: 內嵌專案建立
const showCreateProject = ref(false);
const newProjectName = ref('');
const newProjectWorkDir = ref('');
const newProjectTemplate = ref('web-app');
const creatingProject = ref(false);

const templateOptions = computed(() => [
  { value: 'web-app', label: t('projects.modal.templateWebApp') },
  { value: 'api-service', label: t('projects.modal.templateApiService') },
  { value: 'mobile-app', label: t('projects.modal.templateMobileApp') },
  { value: 'library', label: t('projects.modal.templateLibrary') },
]);

const effectiveProjectId = computed(() =>
  props.preselectedProjectId || selectedProjectId.value || projectsStore.selectedProjectId || null,
);

/** Projects visible in the launcher dropdown: hide archived, but keep the
 *  currently effective project (remix / preselected) so the select never
 *  ends up with a missing option. */
const availableProjects = computed(() =>
  projectsStore.projects.filter(
    (p) => p.status !== 'archived' || p.id === effectiveProjectId.value,
  ),
);

/** Non-done tasks, flat list (used when a project is selected) */
const filteredTasks = computed(() =>
  availableTasks.value.filter((t) => t.status !== 'done'),
);

/** Non-done tasks grouped by project (used when no project is selected) */
const tasksByProject = computed(() => {
  const groups = new Map<string, TaskRecord[]>();
  for (const t of filteredTasks.value) {
    const pid = t.projectId || '__none__';
    if (!groups.has(pid)) groups.set(pid, []);
    groups.get(pid)!.push(t);
  }
  return groups;
});

const selectedAgent = computed(() =>
  selectedAgentId.value ? agentsStore.getById(selectedAgentId.value) : null,
);

const canLaunch = computed(() => !!selectedAgentId.value);

/** Agent is locked when pre-selected from agent page or remix */
const agentLocked = computed(() => !!(props.preselectedAgentId || props.remixData));

const modelOptions = computed(() => [
  { value: 'opus', label: 'Opus', desc: t('sessions.launcher.modelOpus') },
  { value: 'sonnet', label: 'Sonnet', desc: t('sessions.launcher.modelSonnet') },
  { value: 'haiku', label: 'Haiku', desc: t('sessions.launcher.modelHaiku') },
]);

const departmentLabel = computed<Record<string, string>>(() => ({
  engineering: t('agents.departments.engineering'),
  design: t('agents.departments.design'),
  product: t('agents.departments.product'),
  marketing: t('agents.departments.marketing'),
  testing: t('agents.departments.testing'),
  'project-management': t('agents.departments.project-management'),
  'studio-operations': t('agents.departments.studio-operations'),
  company: t('agents.departments.company'),
  bonus: t('agents.departments.bonus'),
}));

watch(
  () => props.show,
  async (isShow) => {
    if (isShow) {
      // Remix prefill takes priority
      if (props.remixData) {
        selectedAgentId.value = props.remixData.agentId;
        task.value = props.remixData.task;
        model.value = props.remixData.model;
        selectedTaskId.value = props.remixData.taskId || null;
      } else if (props.preselectedAgentId) {
        selectedAgentId.value = props.preselectedAgentId;
        const agent = agentsStore.getById(props.preselectedAgentId);
        if (agent) model.value = agent.model;
        task.value = '';
        selectedTaskId.value = null;
      } else {
        selectedAgentId.value = '';
        task.value = '';
        selectedTaskId.value = null;
        selectedProjectId.value = null;
      }

      // Prefill from task
      if (props.preselectedTaskId) {
        selectedTaskId.value = props.preselectedTaskId;
        const t = tasksStore.tasks.find((t) => t.id === props.preselectedTaskId);
        if (t) {
          task.value = task.value || t.description || t.title;
        }
      }

      // Load available tasks — scoped to project if selected, otherwise all projects
      try {
        const pid = effectiveProjectId.value;
        const filters = pid ? { projectId: pid } : {};
        availableTasks.value = (await ipc.listTasks(filters)) as TaskRecord[];
      } catch { availableTasks.value = []; }

      showPromptPreview.value = false;
      promptPreview.value = '';
    }
  },
);

// Reload tasks when project selection changes
watch(selectedProjectId, async () => {
  if (!props.show) return;
  try {
    const pid = effectiveProjectId.value;
    const filters = pid ? { projectId: pid } : {};
    availableTasks.value = (await ipc.listTasks(filters)) as TaskRecord[];
  } catch { availableTasks.value = []; }
  selectedTaskId.value = null;
});

async function loadPromptPreview() {
  if (!selectedAgentId.value) return;
  try {
    promptPreview.value = await ipc.previewPrompt(selectedAgentId.value);
    showPromptPreview.value = true;
  } catch (err) {
    promptPreview.value = t('sessions.launcher.promptPreviewError');
    showPromptPreview.value = true;
  }
}

function onTaskSelect(taskId: string) {
  selectedTaskId.value = taskId === 'null' ? null : taskId;
  if (!selectedTaskId.value) return;
  const found = availableTasks.value.find((t) => t.id === selectedTaskId.value);
  if (found) {
    if (!task.value.trim()) {
      task.value = found.description || found.title;
    }
    if (!props.preselectedProjectId && found.projectId) {
      selectedProjectId.value = found.projectId;
    }
    if (!agentLocked.value && found.assignedTo) {
      const agent = agentsStore.getById(found.assignedTo);
      if (agent) {
        selectedAgentId.value = found.assignedTo;
        model.value = agent.model;
      }
    }
  }
}

async function launch() {
  if (!canLaunch.value) return;
  launching.value = true;
  try {
    const result = await sessionsStore.spawn({
      agentId: selectedAgentId.value,
      task: task.value.trim(),
      model: model.value,
      maxTurns: maxTurns.value,
      projectId: effectiveProjectId.value,
      taskId: selectedTaskId.value || null,
      interactive: true,
      ...(props.parentSessionId ? { parentSessionId: props.parentSessionId } : {}),
    });
    emit('launched', result.sessionId);
    emit('close');
  } catch (err) {
    console.error('Failed to launch session', err);
  } finally {
    launching.value = false;
  }
}

function onProjectChange(value: string) {
  if (value === '__create__') {
    showCreateProject.value = true;
    selectedProjectId.value = null;
    newProjectName.value = '';
    newProjectWorkDir.value = '';
    newProjectTemplate.value = 'web-app';
  } else {
    showCreateProject.value = false;
    selectedProjectId.value = value === 'null' ? null : value;
  }
}

async function selectWorkDir() {
  const dir = await ipc.selectFolder();
  if (dir) newProjectWorkDir.value = dir;
}

async function createProject() {
  if (!newProjectName.value.trim() || !newProjectWorkDir.value.trim()) return;
  creatingProject.value = true;
  try {
    const project = (await ipc.createProject({
      name: newProjectName.value.trim(),
      workDir: newProjectWorkDir.value.trim(),
      template: newProjectTemplate.value,
    })) as { id: string };
    // 自動建立 Sprint 1
    try {
      await ipc.createSprint({
        projectId: project.id,
        name: 'Sprint 1',
        sprintType: 'full',
      });
    } catch { /* Sprint 建立失敗不阻塞 */ }
    // 刷新專案列表並選中新專案
    await projectsStore.fetchProjects();
    selectedProjectId.value = project.id;
    showCreateProject.value = false;
  } catch (err) {
    console.error('Failed to create project', err);
  } finally {
    creatingProject.value = false;
  }
}

function onAgentChange(value: string) {
  selectedAgentId.value = value;
  const agent = agentsStore.getById(value);
  if (agent) {
    model.value = agent.model;
  }
  showPromptPreview.value = false;
}
</script>

<template>
  <BaseModal :show="show" :title="$t('sessions.launcher.title')" @close="emit('close')">
    <div class="launcher">
      <!-- Agent Selection -->
      <SessionAgentSelector
        :selected-agent-id="selectedAgentId"
        :agent-locked="agentLocked"
        :selected-agent="selectedAgent"
        :department-label="departmentLabel"
        @update:selected-agent-id="onAgentChange"
      />

      <!-- Project + Task Selection -->
      <SessionTaskSelector
        :preselected-project-id="props.preselectedProjectId"
        :selected-project-id="selectedProjectId"
        :show-create-project="showCreateProject"
        :new-project-name="newProjectName"
        :new-project-work-dir="newProjectWorkDir"
        :new-project-template="newProjectTemplate"
        :creating-project="creatingProject"
        :template-options="templateOptions"
        :projects="availableProjects"
        :selected-task-id="selectedTaskId"
        :filtered-tasks="filteredTasks"
        :tasks-by-project="tasksByProject"
        :effective-project-id="effectiveProjectId"
        @project-change="onProjectChange"
        @task-change="onTaskSelect"
        @update:new-project-name="newProjectName = $event"
        @update:new-project-work-dir="newProjectWorkDir = $event"
        @update:new-project-template="newProjectTemplate = $event"
        @select-work-dir="selectWorkDir"
        @create-project="createProject"
        @cancel-create="showCreateProject = false"
      />

      <!-- Config: task desc + model + max turns + prompt preview -->
      <SessionConfigPanel
        :task="task"
        :model="model"
        :max-turns="maxTurns"
        :show-prompt-preview="showPromptPreview"
        :prompt-preview="promptPreview"
        :model-options="modelOptions"
        @update:task="task = $event"
        @update:model="model = $event"
        @update:max-turns="maxTurns = $event"
        @toggle-preview="loadPromptPreview"
      />
    </div>

    <template #footer>
      <div class="launcher__footer">
        <BaseButton variant="ghost" @click="emit('close')">{{ $t('common.cancel') }}</BaseButton>
        <BaseButton variant="primary" :disabled="!canLaunch || launching" @click="launch">
          {{ launching ? $t('sessions.launcher.launching') : $t('sessions.launcher.launch') }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
/* ── Launcher form shell ── */
.launcher {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Footer ── */
.launcher__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>
