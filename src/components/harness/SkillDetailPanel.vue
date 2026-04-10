<template>
  <div class="panel-right">
    <!-- No Selection State -->
    <div v-if="!skill" class="no-selection">
      <span class="no-sel-icon">🧩</span>
      <p class="no-sel-text">{{ t('harness.skill.selectPrompt') }}</p>
    </div>

    <!-- Selected Skill Detail -->
    <div v-else class="preview-wrap">
      <!-- Detail Header -->
      <div class="detail-header">
        <div class="detail-header-top">
          <div class="header-title-row">
            <h2 class="detail-title">{{ skill.name }}</h2>
            <span
              class="tag"
              :class="skill.source === 'system' ? 'tag-system' : 'tag-custom'"
            >{{ skill.source === 'system' ? 'System' : 'Custom' }}</span>
          </div>
          <div class="detail-meta-row">
            <span class="detail-path">{{ skill.path }}</span>
            <span
              class="detail-status"
              :class="skill.enabled ? 'is-enabled' : 'is-disabled'"
            >
              <span class="status-dot"></span>
              {{ skill.enabled ? t('harness.skill.statusEnabled') : t('harness.skill.statusDisabled') }}
            </span>
          </div>
        </div>

        <!-- Edit button (non-system, preview mode only) -->
        <button
          v-if="skill.source !== 'system' && mode === 'preview'"
          class="btn btn-outline btn-sm"
          @click="enterEditMode"
        >
          ✏️ 編輯
        </button>
      </div>

      <!-- Detail Body -->
      <div class="detail-body">
        <!-- Preview mode -->
        <template v-if="mode === 'preview'">
          <div v-if="skill.content" class="md-block">{{ skill.content }}</div>
          <p v-else class="md-p no-content-text">{{ t('harness.skill.noContent') }}</p>
        </template>

        <!-- Edit mode -->
        <template v-else>
          <textarea
            v-model="editContent"
            class="edit-textarea"
            :placeholder="t('harness.skill.noContent')"
          ></textarea>
          <div v-if="saveError" class="save-error">{{ saveError }}</div>
        </template>
      </div>

      <!-- Actions Bar (preview mode only) -->
      <div v-if="mode === 'preview'" class="actions-bar">
        <!-- Toggle switch -->
        <label class="toggle-wrap" :title="skill.enabled ? '點擊停用' : '點擊啟用'">
          <input
            type="checkbox"
            class="toggle-input"
            :checked="skill.enabled"
            :disabled="toggling"
            @change="handleToggle"
          />
          <span class="toggle-track">
            <span class="toggle-thumb"></span>
          </span>
          <span class="toggle-label">{{ skill.enabled ? '啟用中' : '已停用' }}</span>
        </label>

        <div class="actions-right">
          <!-- Delete: normal state -->
          <template v-if="skill.source !== 'system' && !showDeleteConfirm">
            <button
              class="btn btn-danger btn-sm"
              :disabled="deleting"
              @click="showDeleteConfirm = true"
            >
              🗑️ 刪除
            </button>
          </template>

          <!-- Delete: inline confirm -->
          <template v-else-if="skill.source !== 'system' && showDeleteConfirm">
            <span class="confirm-text">確定刪除？</span>
            <button
              class="btn btn-danger btn-sm"
              :disabled="deleting"
              @click="handleDelete"
            >
              {{ deleting ? '刪除中...' : '確認' }}
            </button>
            <button
              class="btn btn-outline btn-sm"
              :disabled="deleting"
              @click="showDeleteConfirm = false"
            >
              取消
            </button>
          </template>
        </div>
      </div>

      <!-- Deploy Section (global Skill, preview mode only) -->
      <div v-if="skill.scope === 'global' && mode === 'preview' && projectPaths.length > 0" class="deploy-section">
        <div class="deploy-header">
          <span class="deploy-title">🚀 部署到子專案</span>
        </div>
        <div class="deploy-list">
          <label
            v-for="p in projectPaths"
            :key="p"
            class="deploy-item"
          >
            <input
              type="checkbox"
              class="deploy-checkbox"
              :value="p"
              v-model="selectedDeployProjects"
            />
            <span class="deploy-proj-name">{{ projLabel(p) }}</span>
            <span class="deploy-proj-path">{{ p }}</span>
          </label>
        </div>
        <div class="deploy-footer">
          <button
            class="btn btn-primary btn-sm"
            :disabled="deploying || selectedDeployProjects.length === 0"
            @click="handleDeploy"
          >
            {{ deploying ? '部署中...' : `部署到 ${selectedDeployProjects.length} 個專案` }}
          </button>
          <span v-if="deployResult" class="deploy-result">{{ deployResult }}</span>
        </div>
      </div>

      <!-- Detail Footer -->
      <div class="detail-footer">
        <!-- Edit mode: Save / Cancel -->
        <template v-if="mode === 'edit'">
          <button
            class="btn btn-primary btn-sm"
            :disabled="saving"
            @click="handleSave"
          >
            {{ saving ? '儲存中...' : '💾 儲存' }}
          </button>
          <button class="btn btn-outline btn-sm" :disabled="saving" @click="cancelEdit">
            取消
          </button>
        </template>

        <!-- Preview mode: meta info -->
        <template v-else>
          <div class="footer-meta" v-if="skill.updatedAt">
            {{ t('harness.skill.updatedAt') }}<span class="footer-mono">{{ skill.updatedAt }}</span>
          </div>
          <div class="footer-meta" v-if="skill.fileSize !== undefined">
            {{ t('harness.skill.fileSize') }}<span class="footer-mono">{{ formatSize(skill.fileSize) }}</span>
          </div>
          <div class="footer-meta">
            {{ t('harness.skill.scope') }}<span class="footer-mono">{{ skill.scope === 'global' ? t('harness.skill.scopeGlobal') : projLabel(skill.projectPath) }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useIpc } from '../../composables/useIpc';
import type { SkillItem } from '../../stores/harness';

const { t } = useI18n();
const ipc = useIpc();

const props = defineProps<{
  skill: SkillItem | null;
  projectPaths: string[];
}>();

const emit = defineEmits<{
  save: [name: string, content: string, scope: string, projectPath?: string];
  delete: [name: string, scope: string, projectPath?: string];
  toggle: [name: string, enabled: boolean, scope: string, projectPath?: string];
  deploy: [name: string, projects: string[]];
}>();

// ── Mode state ────────────────────────────────────────────
const mode = ref<'preview' | 'edit'>('preview');
const editContent = ref('');
const saving = ref(false);
const saveError = ref('');

// ── Delete state ──────────────────────────────────────────
const showDeleteConfirm = ref(false);
const deleting = ref(false);

// ── Toggle state ──────────────────────────────────────────
const toggling = ref(false);

// ── Deploy state ──────────────────────────────────────────
const selectedDeployProjects = ref<string[]>([]);
const deploying = ref(false);
const deployResult = ref('');

// Auto-reset when selected skill changes
watch(() => props.skill, () => {
  mode.value = 'preview';
  saveError.value = '';
  showDeleteConfirm.value = false;
  selectedDeployProjects.value = [];
  deployResult.value = '';
});

// ── Edit mode ─────────────────────────────────────────────
function enterEditMode() {
  editContent.value = props.skill?.content ?? '';
  saveError.value = '';
  mode.value = 'edit';
}

function cancelEdit() {
  mode.value = 'preview';
  saveError.value = '';
}

async function handleSave() {
  if (!props.skill) return;
  saving.value = true;
  saveError.value = '';
  try {
    await ipc.updateSkill({
      name: props.skill.name,
      content: editContent.value,
      scope: props.skill.scope,
      projectPath: props.skill.projectPath,
    });
    emit('save', props.skill.name, editContent.value, props.skill.scope, props.skill.projectPath);
    mode.value = 'preview';
  } catch (e: unknown) {
    saveError.value = `儲存失敗：${String(e)}`;
  } finally {
    saving.value = false;
  }
}

// ── Delete ────────────────────────────────────────────────
async function handleDelete() {
  if (!props.skill) return;
  deleting.value = true;
  try {
    await ipc.deleteSkill(props.skill.name, props.skill.scope, props.skill.projectPath);
    emit('delete', props.skill.name, props.skill.scope, props.skill.projectPath);
  } catch (e: unknown) {
    console.error('Delete skill failed:', e);
  } finally {
    deleting.value = false;
    showDeleteConfirm.value = false;
  }
}

// ── Toggle ────────────────────────────────────────────────
async function handleToggle(e: Event) {
  if (!props.skill) return;
  const enabled = (e.target as HTMLInputElement).checked;
  toggling.value = true;
  try {
    await ipc.toggleSkill(props.skill.name, enabled, props.skill.scope, props.skill.projectPath);
    emit('toggle', props.skill.name, enabled, props.skill.scope, props.skill.projectPath);
  } catch (err: unknown) {
    console.error('Toggle skill failed:', err);
  } finally {
    toggling.value = false;
  }
}

// ── Deploy ────────────────────────────────────────────────
async function handleDeploy() {
  if (!props.skill || selectedDeployProjects.value.length === 0) return;
  deploying.value = true;
  deployResult.value = '';
  try {
    await ipc.deploySkill(props.skill.name, selectedDeployProjects.value);
    emit('deploy', props.skill.name, selectedDeployProjects.value);
    deployResult.value = `✅ 已部署到 ${selectedDeployProjects.value.length} 個專案`;
    selectedDeployProjects.value = [];
  } catch (e: unknown) {
    deployResult.value = `❌ 部署失敗：${String(e)}`;
  } finally {
    deploying.value = false;
  }
}

// ── Helpers ───────────────────────────────────────────────
function projLabel(path?: string): string {
  if (!path) return t('harness.skill.unknownProject');
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<style scoped>
/* ─── Right Panel ─────────────────────────────────────── */
.panel-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* No Selection */
.no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.no-sel-icon {
  font-size: 36px;
  opacity: 0.25;
  line-height: 1;
}

.no-sel-text {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

/* ─── Preview / Edit Wrap ─────────────────────────────── */
.preview-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── Detail Header ───────────────────────────────────── */
.detail-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.detail-header-top {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.detail-meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.detail-path {
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  color: var(--color-text-muted);
  word-break: break-all;
}

.detail-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-text-muted);
  flex-shrink: 0;
  transition: background 0.2s;
}

.detail-status.is-enabled .status-dot {
  background: var(--color-success);
}

.detail-status.is-enabled {
  color: var(--color-success);
}

.detail-status.is-disabled .status-dot {
  background: var(--color-text-muted);
}

/* ─── Detail Body ─────────────────────────────────────── */
.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.md-p {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin: 0 0 10px;
}

.no-content-text {
  font-style: italic;
}

.md-block {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-left: 3px solid var(--color-accent);
  border-radius: 6px;
  padding: 12px 14px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  margin: 0;
}

.edit-textarea {
  flex: 1;
  width: 100%;
  min-height: 200px;
  box-sizing: border-box;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 12px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
  line-height: 1.6;
}

.edit-textarea:focus {
  border-color: var(--color-accent);
}

.save-error {
  font-size: 12px;
  color: var(--color-danger, #ff6b6b);
  background: rgba(255, 107, 107, 0.08);
  border: 1px solid rgba(255, 107, 107, 0.2);
  border-radius: 6px;
  padding: 8px 10px;
  margin-top: 10px;
}

/* ─── Actions Bar ─────────────────────────────────────── */
.actions-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
  gap: 8px;
}

.actions-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.confirm-text {
  font-size: 12px;
  color: var(--color-warning, #f59e0b);
}

/* Toggle Switch */
.toggle-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.toggle-input {
  display: none;
}

.toggle-track {
  position: relative;
  width: 32px;
  height: 18px;
  background: var(--color-border-default);
  border-radius: 9px;
  transition: background 0.2s;
  flex-shrink: 0;
}

.toggle-input:checked + .toggle-track {
  background: var(--color-success);
}

.toggle-input:disabled + .toggle-track {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.toggle-input:checked + .toggle-track .toggle-thumb {
  transform: translateX(14px);
}

.toggle-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* ─── Deploy Section ──────────────────────────────────── */
.deploy-section {
  border-top: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary);
  padding: 12px 20px;
  flex-shrink: 0;
  max-height: 180px;
  overflow-y: auto;
}

.deploy-header {
  margin-bottom: 8px;
}

.deploy-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.deploy-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.deploy-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: background 0.1s;
}

.deploy-item:hover {
  background: var(--color-bg-hover);
}

.deploy-checkbox {
  width: 13px;
  height: 13px;
  cursor: pointer;
  accent-color: var(--color-accent);
  flex-shrink: 0;
}

.deploy-proj-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.deploy-proj-path {
  font-size: 10px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.deploy-footer {
  display: flex;
  align-items: center;
  gap: 10px;
}

.deploy-result {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* ─── Detail Footer ───────────────────────────────────── */
.detail-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.footer-meta {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-right: 8px;
}

.footer-mono {
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  color: var(--color-text-secondary);
}

/* ─── Tags ────────────────────────────────────────────── */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.6;
  white-space: nowrap;
}

.tag-system {
  background: rgba(108, 92, 231, 0.2);
  color: var(--color-accent-light);
}

.tag-custom {
  background: rgba(34, 211, 238, 0.2);
  color: #22d3ee;
}

/* ─── Buttons ─────────────────────────────────────────── */
.btn {
  cursor: pointer;
  font-family: inherit;
  border-radius: 6px;
  transition: opacity 0.15s, background 0.15s;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-primary {
  background: var(--color-accent);
  color: #fff;
  border: none;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
}

.btn-outline:hover {
  background: var(--color-bg-hover);
}

.btn-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: transparent;
  border: 1px solid var(--color-danger, #ff6b6b);
  color: var(--color-danger, #ff6b6b);
}

.btn-danger:hover {
  background: rgba(255, 107, 107, 0.1);
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
