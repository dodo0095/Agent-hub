<template>
  <div class="skill-tab">
    <!-- Left Panel -->
    <div class="panel-left">
      <!-- Skill Actions -->
      <div class="skill-actions">
        <button class="btn btn-outline" @click="showExportModal = true">
          📤 {{ t('harness.skill.export') }}
        </button>
        <button class="btn btn-outline" @click="showImportModal = true">
          📥 {{ t('harness.skill.import') }}
        </button>
        <button class="btn btn-outline" @click="showCreateModal = true">
          ✨ 新增
        </button>
      </div>

      <!-- Search Row -->
      <div class="search-row">
        <div class="search-input-wrap">
          <svg class="search-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <input
            v-model="store.searchQuery"
            type="text"
            class="search-input"
            :placeholder="t('harness.skill.searchPlaceholder')"
          />
        </div>

        <div class="filter-wrap">
          <select v-model="store.projectFilter" class="project-filter">
            <option value="all">{{ t('harness.skill.filterAll') }}</option>
            <option
              v-for="proj in projectPaths"
              :key="proj"
              :value="proj"
            >{{ projLabel(proj) }}</option>
          </select>
          <svg class="filter-arrow" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <!-- Skill List -->
      <SkillList
        :filtered-skills="store.filteredSkills"
        :loading="store.loading"
        :selected-skill-name="store.selectedSkill?.name"
        @select="(name, scope, projectPath) => store.selectSkill(name, scope, projectPath)"
        @edit="onEditSkill"
      />
    </div>

    <!-- Export Modal -->
    <SkillExportModal
      :show="showExportModal"
      :export-json="exportJson"
      :copied="copied"
      @close="showExportModal = false"
      @copy="copyExportJson"
    />

    <!-- Import Modal -->
    <SkillImportModal
      :show="showImportModal"
      :import-json="importJson"
      :import-error="importError"
      :import-result="importResult"
      :show-conflict-choice="showConflictChoice"
      @close="closeImportModal"
      @update:import-json="importJson = $event"
      @handle-import="handleImport"
      @do-import="doImport"
    />

    <!-- Create Modal -->
    <SkillCreateModal
      :show="showCreateModal"
      :project-paths="projectPaths"
      @close="showCreateModal = false"
      @created="onSkillCreated"
    />

    <!-- Right Panel -->
    <SkillDetailPanel
      :skill="store.selectedSkill ?? null"
      :project-paths="projectPaths"
      @save="onSkillSaved"
      @delete="onSkillDeleted"
      @toggle="onSkillToggled"
      @deploy="onSkillDeployed"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useHarnessStore } from '../../stores/harness';
import { useIpc } from '../../composables/useIpc';
import type { SkillItem } from '../../stores/harness';
import SkillList from './SkillList.vue';
import SkillExportModal from './SkillExportModal.vue';
import SkillImportModal from './SkillImportModal.vue';
import SkillCreateModal from './SkillCreateModal.vue';
import SkillDetailPanel from './SkillDetailPanel.vue';

const { t } = useI18n();
const store = useHarnessStore();
const ipc = useIpc();

// ── Export / Import / Create state ───────────────────────
const showExportModal = ref(false);
const showImportModal = ref(false);
const showCreateModal = ref(false);
const exportJson = ref('');
const importJson = ref('');
const importError = ref('');
const importResult = ref<{ imported: string[]; skipped: string[]; overwritten: string[]; errors: string[] } | null>(null);
const copied = ref(false);
const showConflictChoice = ref(false);
const parsedBundle = ref<unknown>(null);

// Export: fetch bundle whenever modal opens
watch(showExportModal, async (show) => {
  if (!show) return;
  copied.value = false;
  const names = store.skills.map(s => s.name);
  if (names.length === 0) {
    exportJson.value = '{"error": "No skills to export"}';
    return;
  }
  try {
    const bundle = await ipc.exportSkills(names);
    exportJson.value = JSON.stringify(bundle, null, 2);
  } catch (e) {
    exportJson.value = `{"error": "${String(e)}"}`;
  }
});

async function copyExportJson() {
  await navigator.clipboard.writeText(exportJson.value);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

// Import
function handleImport() {
  importError.value = '';
  importResult.value = null;
  let bundle: any;
  try {
    bundle = JSON.parse(importJson.value);
  } catch (e) {
    importError.value = t('harness.skill.jsonParseError', { msg: String(e) });
    return;
  }
  if (!bundle.version || !Array.isArray(bundle.skills)) {
    importError.value = t('harness.skill.jsonFormatError');
    return;
  }
  parsedBundle.value = bundle;
  const existingNames = store.skills.map(s => s.name);
  const conflicts = bundle.skills.filter((s: any) => existingNames.includes(s.name));
  if (conflicts.length > 0) {
    showConflictChoice.value = true;
  } else {
    doImport('skip');
  }
}

async function doImport(onConflict: 'skip' | 'overwrite') {
  showConflictChoice.value = false;
  try {
    importResult.value = await ipc.importSkills(parsedBundle.value, onConflict) as {
      imported: string[];
      skipped: string[];
      overwritten: string[];
      errors: string[];
    };
    await store.fetchSkills();
  } catch (e) {
    importError.value = t('harness.skill.importFailed', { msg: String(e) });
  }
}

function closeImportModal() {
  showImportModal.value = false;
  importJson.value = '';
  importError.value = '';
  importResult.value = null;
  showConflictChoice.value = false;
  parsedBundle.value = null;
}

// Derive unique project paths from all skills
const projectPaths = computed(() => {
  const paths = new Set<string>();
  store.skills.forEach(s => {
    if (s.scope === 'project' && s.projectPath) paths.add(s.projectPath);
  });
  return Array.from(paths);
});

function projLabel(path?: string): string {
  if (!path) return t('harness.skill.unknownProject');
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function onEditSkill(_skill: SkillItem) {
  // Placeholder — will be wired to IPC in a future sprint
}

async function onSkillCreated() {
  await store.fetchSkills();
}

async function onSkillSaved(_name: string, _content: string, _scope: string, _projectPath?: string) {
  await store.fetchSkills();
}

async function onSkillDeleted(_name: string, _scope: string, _projectPath?: string) {
  await store.fetchSkills();
}

async function onSkillToggled(_name: string, _enabled: boolean, _scope: string, _projectPath?: string) {
  await store.fetchSkills();
}

async function onSkillDeployed(_name: string, _projects: string[]) {
  await store.fetchSkills();
}
</script>

<style scoped>
/* ─── Layout ─────────────────────────────────────────── */
.skill-tab {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg-primary);
}

/* ─── Left Panel ─────────────────────────────────────── */
.panel-left {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border-default);
  overflow: hidden;
}

/* Search Row */
.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.search-input-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 13px;
  height: 13px;
  color: var(--color-text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 12px 7px 32px;
  border-radius: 6px;
  font-size: 12px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  outline: none;
  transition: border-color 0.15s;
}

.search-input::placeholder {
  color: var(--color-text-muted);
}

.search-input:focus {
  border-color: var(--color-accent);
}

/* Project Filter */
.filter-wrap {
  position: relative;
  flex-shrink: 0;
}

.project-filter {
  appearance: none;
  -webkit-appearance: none;
  padding: 6px 24px 6px 8px;
  border-radius: 6px;
  font-size: 11px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-secondary);
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.project-filter:focus {
  border-color: var(--color-accent);
}

.filter-arrow {
  position: absolute;
  right: 7px;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 6px;
  color: var(--color-text-muted);
  pointer-events: none;
}

/* ─── Skill Actions ───────────────────────────────────── */
.skill-actions {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

/* ─── Buttons ─────────────────────────────────────────── */
.btn-outline {
  background: transparent;
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: background 0.15s;
}

.btn-outline:hover {
  background: var(--color-bg-hover);
}
</style>
