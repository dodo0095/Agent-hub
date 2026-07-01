<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectsStore } from '../stores/projects';
import ProjectCard from '../components/project/ProjectCard.vue';
import ProjectCreateModal from '../components/project/ProjectCreateModal.vue';
import BaseButton from '../components/common/BaseButton.vue';

type ProjectFilter = 'active' | 'archived' | 'all';

const { t } = useI18n();
const projectsStore = useProjectsStore();
const showCreateModal = ref(false);
const currentFilter = ref<ProjectFilter>('active');

const filterOptions: { value: ProjectFilter; labelKey: string }[] = [
  { value: 'active', labelKey: 'projects.filter.active' },
  { value: 'archived', labelKey: 'projects.filter.archived' },
  { value: 'all', labelKey: 'projects.filter.all' },
];

const visibleProjects = computed(() => {
  const all = projectsStore.projects;
  if (currentFilter.value === 'active') return all.filter((p) => p.status !== 'archived');
  if (currentFilter.value === 'archived') return all.filter((p) => p.status === 'archived');
  return all;
});

onMounted(async () => {
  await projectsStore.fetchAll();
  await projectsStore.fetchAllStats();
});

async function handleCreate(params: { name: string; description: string; template: string; workDir: string }) {
  const project = await projectsStore.create(params);
  showCreateModal.value = false;
  await projectsStore.fetchStats(project.id);
}
</script>

<template>
  <div class="projects-view">
    <!-- Header -->
    <div class="projects-header">
      <h2 class="projects-title">{{ $t('projects.title') }}</h2>
      <BaseButton variant="primary" size="sm" @click="showCreateModal = true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {{ $t('projects.newProject') }}
      </BaseButton>
    </div>

    <!-- Filter tabs -->
    <div class="projects-tabs" role="tablist">
      <button
        v-for="option in filterOptions"
        :key="option.value"
        type="button"
        role="tab"
        class="projects-tab"
        :class="{ 'projects-tab--active': currentFilter === option.value }"
        :aria-selected="currentFilter === option.value"
        @click="currentFilter = option.value"
      >
        {{ t(option.labelKey) }}
      </button>
    </div>

    <!-- Project grid -->
    <div class="projects-grid">
      <ProjectCard
        v-for="project in visibleProjects"
        :key="project.id"
        :project="project"
        :stats="projectsStore.projectStats[project.id] ?? null"
      />

      <!-- Add new card -->
      <div class="project-card-new" @click="showCreateModal = true">
        <svg class="new-card-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        <div class="new-card-text">{{ $t('projects.createNew') }}</div>
        <div class="new-card-hint">{{ $t('projects.selectTemplate') }}</div>
      </div>
    </div>

    <!-- Create Project Modal -->
    <Teleport to="body">
      <ProjectCreateModal
        v-if="showCreateModal"
        @close="showCreateModal = false"
        @create="handleCreate"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.projects-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 20px;
}

.projects-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 52px;
  padding: 0 20px;
  border-bottom: 1px solid var(--color-border-default);
}

.projects-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
}

.projects-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 20px;
  flex-shrink: 0;
  margin-top: -8px;
}

.projects-tab {
  padding: 6px 14px;
  border: 1px solid var(--color-border-default);
  border-radius: 999px;
  background-color: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.projects-tab:hover {
  color: var(--color-text-primary);
  border-color: var(--color-border-light);
  background-color: var(--color-bg-hover);
}

.projects-tab--active {
  color: var(--color-text-primary);
  border-color: var(--color-accent);
  background-color: var(--color-bg-card);
}

.projects-tab:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  align-content: start;
  overflow-y: auto;
  flex: 1;
}

/* Add new project card */
.project-card-new {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  border: 2px dashed var(--color-border-default);
  background: transparent;
  cursor: pointer;
  opacity: 0.55;
  transition: all 0.2s;
  text-align: center;
  padding: 20px;
}

.project-card-new:hover {
  opacity: 0.85;
  border-color: var(--color-border-light);
  background: var(--color-bg-card);
  transform: translateY(-1px);
}

.new-card-icon {
  color: var(--color-text-muted);
  transition: color 0.2s;
}

.project-card-new:hover .new-card-icon {
  color: var(--color-accent-light);
}

.new-card-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.new-card-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>
