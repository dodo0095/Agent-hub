<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useIpc } from '../composables/useIpc';
import { useAgentsStore } from '../stores/agents';
import { useProjectsStore } from '../stores/projects';
import { useSessionsStore, type ActiveSession } from '../stores/sessions';
import { useUiStore } from '../stores/ui';
import { notifySpawnError } from '../utils/spawn-error';
import BaseButton from '../components/common/BaseButton.vue';
import BaseTag from '../components/common/BaseTag.vue';
import SessionTerminal from '../components/session/SessionTerminal.vue';

const { t } = useI18n();
const ipc = useIpc();
const agentsStore = useAgentsStore();
const projectsStore = useProjectsStore();
const sessionsStore = useSessionsStore();
const uiStore = useUiStore();

// --- State ---
interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

const knowledgeTree = ref<TreeNode[]>([]);
const expandedDirs = ref<Set<string>>(new Set());
const selectedFile = ref<string | null>(null);
const fileContent = ref('');
const loadingTree = ref(false);
const loadingFile = ref(false);

// Session state
const activeSession = ref<ActiveSession | null>(null);
const launching = ref(false);
const rightTab = ref<'preview' | 'session'>('preview');

// --- Computed ---
const childProjects = computed(() =>
  projectsStore.projects.filter(
    (p) => p.workDir && ['planning', 'active'].includes(p.status),
  ),
);

// Filter tree to only show company/ subtree
const companyTree = computed(() => {
  const companyNode = knowledgeTree.value.find(
    (n) => n.name === 'company' && n.type === 'directory',
  );
  return companyNode?.children || [];
});

// Check if there's already a running company-manager session
const existingSession = computed(() =>
  sessionsStore.activeSessions.find((s) => s.agentId === 'company-manager'),
);

// --- Actions ---
onMounted(async () => {
  loadingTree.value = true;

  // Fetch agents & projects independently — don't block knowledge tree
  try {
    if (agentsStore.agents.length === 0) await agentsStore.fetchAll();
  } catch (err) {
    // ignore — agents may already be loaded from another view
  }
  try {
    if (projectsStore.projects.length === 0) await projectsStore.fetchProjects();
  } catch (err) {
    // ignore — projects may already be loaded from another view
  }

  // Fetch knowledge tree
  try {
    const tree = await ipc.knowledgeListTree();
    knowledgeTree.value = (tree || []) as TreeNode[];
    // Auto-expand company/ subtree top-level dirs
    for (const node of companyTree.value) {
      if (node.type === 'directory') {
        expandedDirs.value.add(node.path);
      }
    }
  } catch (err) {
    console.error('Failed to load knowledge tree', err);
  } finally {
    loadingTree.value = false;
  }

  // Restore existing session if any
  if (existingSession.value) {
    activeSession.value = existingSession.value;
    rightTab.value = 'session';
  }
});

// Watch for session status changes
watch(
  () => sessionsStore.activeSessions,
  (sessions) => {
    if (activeSession.value) {
      const updated = sessions.find((s) => s.sessionId === activeSession.value!.sessionId);
      if (updated) {
        activeSession.value = updated;
      } else {
        // Session ended
        activeSession.value = null;
        rightTab.value = 'preview';
      }
    }
  },
  { deep: true },
);

function toggleDir(path: string) {
  if (expandedDirs.value.has(path)) {
    expandedDirs.value.delete(path);
  } else {
    expandedDirs.value.add(path);
  }
}

async function selectFile(path: string) {
  selectedFile.value = path;
  rightTab.value = 'preview';
  loadingFile.value = true;
  try {
    const content = await ipc.knowledgeReadFile(path);
    fileContent.value = content || t('knowledge.fileEmpty');
  } catch {
    fileContent.value = t('knowledge.fileReadError');
  } finally {
    loadingFile.value = false;
  }
}

async function launchSession() {
  // If already running, just switch to session tab
  if (existingSession.value) {
    activeSession.value = existingSession.value;
    rightTab.value = 'session';
    return;
  }

  launching.value = true;
  try {
    const result = await sessionsStore.spawn({
      agentId: 'company-manager',
      task: '',
      model: 'opus',
      interactive: true,
    });
    // Find the newly created session
    const session = sessionsStore.activeSessions.find(
      (s) => s.sessionId === result.sessionId,
    );
    if (session) {
      activeSession.value = session;
    }
    rightTab.value = 'session';
  } catch (err) {
    console.error('Failed to launch company-manager session', err);
    notifySpawnError(err, t, uiStore);
  } finally {
    launching.value = false;
  }
}

async function stopSession() {
  if (!activeSession.value) return;
  try {
    await sessionsStore.stop(activeSession.value.sessionId);
  } catch (err) {
    console.error('Failed to stop session', err);
  }
}

function getFileIcon(name: string): string {
  if (name.endsWith('.md')) return '📄';
  if (name.endsWith('.template')) return '📝';
  return '📄';
}

function getCategoryLabel(name: string): string {
  const labels: Record<string, string> = {
    sop: t('knowledge.categoryLabels.sop'),
    standards: t('knowledge.categoryLabels.standards'),
    templates: t('knowledge.categoryLabels.templates'),
    'skill-templates': t('knowledge.categoryLabels.skillTemplates'),
    'project-templates': t('knowledge.categoryLabels.projectTemplates'),
  };
  return labels[name] || name;
}

function getCategoryIcon(name: string): string {
  const icons: Record<string, string> = {
    sop: '📏',
    standards: '📐',
    templates: '📝',
    'skill-templates': '⚡',
    'project-templates': '🏗️',
  };
  return icons[name] || '📁';
}
</script>

<template>
  <div class="knowledge-layout">
    <!-- Top bar -->
    <div class="knowledge-topbar">
      <span class="topbar-icon">📚</span>
      <div class="topbar-text">
        <span class="topbar-title">{{ $t('knowledge.title') }}</span>
        <span class="topbar-subtitle">{{ $t('knowledge.subtitle') }}</span>
      </div>
      <div class="topbar-actions">
        <template v-if="activeSession">
          <span class="session-indicator">
            <span class="session-dot"></span>
            {{ $t('knowledge.sessionActive') }}
          </span>
          <BaseButton variant="ghost" size="sm" @click="stopSession">{{ $t('knowledge.stopSession') }}</BaseButton>
          <BaseButton
            v-if="rightTab !== 'session'"
            variant="primary"
            size="sm"
            @click="rightTab = 'session'"
          >
            {{ $t('knowledge.switchToTerminal') }}
          </BaseButton>
        </template>
        <BaseButton
          v-else
          variant="primary"
          :disabled="launching"
          @click="launchSession"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          {{ launching ? $t('knowledge.launching') : $t('knowledge.launchSession') }}
        </BaseButton>
      </div>
    </div>

    <!-- Content: 2 column -->
    <div class="knowledge-content">
      <!-- Left panel -->
      <div class="panel-left">

        <!-- Agent card -->
        <div class="agent-card">
          <div class="agent-header">
            <span class="agent-emoji">{{ agentsStore.agentIcon('company-manager') }}</span>
            <div class="agent-info">
              <div class="agent-name">{{ agentsStore.displayName('company-manager') }}</div>
              <div class="agent-id">company-manager</div>
            </div>
            <BaseTag color="purple" class="tag-l1">L1</BaseTag>
          </div>
          <p class="agent-desc">{{ agentsStore.agentBrief('company-manager') }}</p>
        </div>

        <!-- Sub-projects -->
        <div class="section-block">
          <div class="section-block-title">
            {{ $t('knowledge.knownProjects') }}
            <span class="section-count">({{ childProjects.length }})</span>
          </div>
          <div v-if="childProjects.length === 0" class="section-empty">
            {{ $t('knowledge.noProjects') }}
          </div>
          <div v-else class="subproject-list">
            <div
              v-for="project in childProjects"
              :key="project.id"
              class="subproject-item"
            >
              <span
                class="subproject-dot"
                :class="project.status === 'active' ? 'dot-success' : 'dot-warning'"
              ></span>
              <div class="subproject-body">
                <div class="subproject-name">{{ project.name }}</div>
                <div class="subproject-path" :title="project.workDir || ''">{{ project.workDir }}</div>
              </div>
              <BaseTag :color="project.status === 'active' ? 'green' : 'yellow'" class="tag-xs">
                {{ project.status === 'active' ? $t('knowledge.statusActive') : $t('knowledge.statusPlanning') }}
              </BaseTag>
            </div>
          </div>
        </div>

        <!-- File tree -->
        <div class="file-tree">
          <div class="section-block-title" style="padding: 8px 16px 6px;">{{ $t('knowledge.companyFiles') }}</div>

          <!-- Loading -->
          <div v-if="loadingTree" class="tree-loading">{{ $t('common.loading') }}</div>

          <!-- Empty -->
          <div v-else-if="companyTree.length === 0" class="tree-empty">
            {{ $t('knowledge.noFiles') }}
          </div>

          <!-- Tree nodes -->
          <div v-else>
            <template v-for="category in companyTree" :key="category.path">

              <!-- Directory -->
              <div v-if="category.type === 'directory'" class="tree-group">
                <button class="tree-group-header" @click="toggleDir(category.path)">
                  <span class="tree-chevron" :class="{ open: expandedDirs.has(category.path) }">&#9654;</span>
                  <span class="tree-group-icon">{{ getCategoryIcon(category.name) }}</span>
                  <span class="tree-group-name">{{ getCategoryLabel(category.name) }}</span>
                  <span class="tree-group-count">{{ category.children?.length || 0 }}</span>
                </button>

                <div v-if="expandedDirs.has(category.path)" class="tree-files">
                  <template v-for="item in category.children" :key="item.path">

                    <!-- Nested directory -->
                    <button
                      v-if="item.type === 'directory'"
                      class="tree-group-header tree-group-header--nested"
                      @click="toggleDir(item.path)"
                    >
                      <span class="tree-chevron" :class="{ open: expandedDirs.has(item.path) }">&#9654;</span>
                      <span class="tree-group-icon">📁</span>
                      <span class="tree-group-name">{{ item.name }}</span>
                    </button>
                    <div v-if="item.type === 'directory' && expandedDirs.has(item.path)" class="tree-files tree-files--deep">
                      <button
                        v-for="subItem in item.children"
                        :key="subItem.path"
                        class="tree-file"
                        :class="{ selected: selectedFile === subItem.path }"
                        @click="selectFile(subItem.path)"
                      >
                        <span class="tree-file-icon">{{ getFileIcon(subItem.name) }}</span>
                        <span class="tree-file-name">{{ subItem.name }}</span>
                      </button>
                    </div>

                    <!-- File inside category -->
                    <button
                      v-if="item.type === 'file'"
                      class="tree-file"
                      :class="{ selected: selectedFile === item.path }"
                      @click="selectFile(item.path)"
                    >
                      <span class="tree-file-icon">{{ getFileIcon(item.name) }}</span>
                      <span class="tree-file-name">{{ item.name }}</span>
                    </button>

                  </template>
                </div>
              </div>

              <!-- Top-level file -->
              <button
                v-else-if="category.type === 'file'"
                class="tree-file tree-file--top"
                :class="{ selected: selectedFile === category.path }"
                @click="selectFile(category.path)"
              >
                <span class="tree-file-icon">{{ getFileIcon(category.name) }}</span>
                <span class="tree-file-name">{{ category.name }}</span>
              </button>

            </template>
          </div>
        </div>
      </div>

      <!-- Right panel -->
      <div class="panel-right">

        <!-- Tab bar: only when session active -->
        <div v-if="activeSession" class="tab-bar">
          <button
            class="tab"
            :class="{ active: rightTab === 'session' }"
            @click="rightTab = 'session'"
          >{{ $t('knowledge.tabTerminal') }}</button>
          <button
            class="tab"
            :class="{ active: rightTab === 'preview' }"
            @click="rightTab = 'preview'"
          >{{ $t('knowledge.tabPreview') }}</button>
        </div>

        <!-- Session terminal -->
        <div
          v-if="activeSession && rightTab === 'session'"
          class="terminal-wrap"
        >
          <SessionTerminal :pty-id="activeSession.ptyId" :active="true" />
        </div>

        <!-- File preview -->
        <div v-else-if="selectedFile" class="file-preview">
          <!-- Path breadcrumb -->
          <div class="file-path-bar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--color-text-muted)">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span class="file-path-text">{{ selectedFile }}</span>
          </div>
          <!-- Content -->
          <div class="file-content">
            <div v-if="loadingFile" class="file-loading">
              <div class="skeleton-line" style="width:200px;height:22px;"></div>
              <div class="skeleton-line" style="width:80px;height:14px;border-radius:99px;margin-top:8px;"></div>
              <div class="skeleton-divider"></div>
              <div class="skeleton-line" style="width:100%;height:12px;"></div>
              <div class="skeleton-line" style="width:88%;height:12px;"></div>
              <div class="skeleton-line" style="width:74%;height:12px;"></div>
            </div>
            <pre v-else class="file-pre">{{ fileContent }}</pre>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="empty-state">
          <div class="empty-icon">📖</div>
          <div class="empty-title">{{ $t('knowledge.emptyTitle') }}</div>
          <div class="empty-desc">{{ $t('knowledge.emptyDesc') }}</div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ------------------------------------------------------------------ */
/* Layout shell                                                         */
/* ------------------------------------------------------------------ */
.knowledge-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ------------------------------------------------------------------ */
/* Top bar                                                              */
/* ------------------------------------------------------------------ */
.knowledge-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
  flex-wrap: wrap;
  row-gap: 8px;
  min-height: 64px;
}

.topbar-icon {
  font-size: 22px;
  flex-shrink: 0;
}

.topbar-text {
  flex: 1;
  min-width: 0;
}

.topbar-title {
  display: block;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.3;
}

.topbar-subtitle {
  display: block;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.session-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-success);
}

.session-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-success);
  flex-shrink: 0;
}

/* ------------------------------------------------------------------ */
/* Content area: 2-column                                              */
/* ------------------------------------------------------------------ */
.knowledge-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ------------------------------------------------------------------ */
/* Left panel                                                           */
/* ------------------------------------------------------------------ */
.panel-left {
  width: 300px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border-default);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* scrollbar */
.panel-left::-webkit-scrollbar { width: 6px; }
.panel-left::-webkit-scrollbar-track { background: transparent; }
.panel-left::-webkit-scrollbar-thumb {
  background: var(--color-border-light);
  border-radius: 3px;
}

/* Agent card */
.agent-card {
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border-default);
  padding: 14px 16px;
  flex-shrink: 0;
}

.agent-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.agent-emoji {
  font-size: 24px;
  flex-shrink: 0;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.agent-id {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: 'Consolas', 'Cascadia Code', monospace;
  margin-top: 1px;
}

.agent-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.tag-l1 {
  font-size: 10px !important;
  flex-shrink: 0;
}

/* Section block (sub-projects) */
.section-block {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.section-block-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.section-count {
  font-weight: 400;
  font-size: 10px;
  margin-left: 4px;
}

.section-empty {
  font-size: 11px;
  color: var(--color-text-muted);
}

.subproject-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.subproject-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.subproject-item:hover {
  background: var(--color-bg-hover);
}

.subproject-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-success { background: var(--color-success); }
.dot-warning { background: var(--color-warning); }

.subproject-body {
  flex: 1;
  min-width: 0;
}

.subproject-name {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.subproject-path {
  font-size: 10px;
  color: var(--color-text-muted);
  font-family: 'Consolas', 'Cascadia Code', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag-xs {
  font-size: 9px !important;
  flex-shrink: 0;
}

/* ------------------------------------------------------------------ */
/* File tree                                                            */
/* ------------------------------------------------------------------ */
.file-tree {
  flex: 1;
  padding-bottom: 12px;
}

.tree-loading,
.tree-empty {
  padding: 12px 16px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.tree-group {
  margin-bottom: 1px;
}

.tree-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
  text-align: left;
}

.tree-group-header:hover {
  background: var(--color-bg-hover);
}

.tree-group-header--nested {
  padding-left: 28px;
}

.tree-chevron {
  font-size: 10px;
  color: var(--color-text-muted);
  transition: transform 0.2s;
  flex-shrink: 0;
  display: inline-block;
}

.tree-chevron.open {
  transform: rotate(90deg);
}

.tree-group-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.tree-group-name {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
  flex: 1;
  min-width: 0;
}

.tree-group-count {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.07);
  color: var(--color-text-muted);
  padding: 1px 6px;
  border-radius: 99px;
  flex-shrink: 0;
}

.tree-files {
  /* file list inside a category */
}

.tree-files--deep {
  padding-left: 16px;
}

.tree-file {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 16px 5px 42px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}

.tree-file--top {
  padding-left: 16px;
}

.tree-file:hover {
  background: var(--color-bg-hover);
}

.tree-file.selected {
  background: rgba(108, 92, 231, 0.1);
}

.tree-file-icon {
  font-size: 12px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.tree-file.selected .tree-file-icon {
  color: var(--color-accent-light);
}

.tree-file-name {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-file.selected .tree-file-name {
  color: var(--color-accent-light);
}

/* ------------------------------------------------------------------ */
/* Right panel                                                          */
/* ------------------------------------------------------------------ */
.panel-right {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Tab bar */
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--color-border-default);
  padding: 0 20px;
  flex-shrink: 0;
}

.tab {
  padding: 10px 16px;
  font-size: 13px;
  color: var(--color-text-muted);
  cursor: pointer;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  transition: color 0.15s, border-color 0.15s;
  user-select: none;
  font-family: inherit;
}

.tab:hover {
  color: var(--color-text-secondary);
}

.tab.active {
  color: var(--color-accent-light);
  border-bottom-color: var(--color-accent);
  font-weight: 500;
}

/* Terminal wrapper */
.terminal-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* File preview */
.file-preview {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.file-path-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.file-path-text {
  font-family: 'Consolas', 'Cascadia Code', 'SF Mono', monospace;
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.file-content::-webkit-scrollbar { width: 6px; }
.file-content::-webkit-scrollbar-track { background: transparent; }
.file-content::-webkit-scrollbar-thumb {
  background: var(--color-border-light);
  border-radius: 3px;
}

.file-pre {
  font-family: 'Consolas', 'Cascadia Code', 'SF Mono', monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Loading skeleton */
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}

.file-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  background: linear-gradient(
    90deg,
    var(--color-border-default) 25%,
    var(--color-border-light) 50%,
    var(--color-border-default) 75%
  );
  background-size: 400px 100%;
  animation: shimmer 1.4s infinite linear;
  border-radius: 4px;
}

.skeleton-divider {
  height: 1px;
  background: var(--color-border-default);
  margin: 8px 0;
}

/* Empty state */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  gap: 10px;
  color: var(--color-text-muted);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.empty-desc {
  font-size: 12px;
  max-width: 300px;
  line-height: 1.7;
}
</style>
