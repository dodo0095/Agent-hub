<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <!-- Header -->
      <div class="modal-header">
        <h3>新增 Skill</h3>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <!-- Name -->
        <div class="form-group">
          <label class="form-label">名稱 <span class="required">*</span></label>
          <input
            v-model="name"
            type="text"
            class="form-input"
            :class="{ 'has-error': !!nameError }"
            placeholder="e.g. my-custom-skill"
            @input="nameError = ''"
          />
          <div v-if="nameError" class="field-error">{{ nameError }}</div>
        </div>

        <!-- Scope -->
        <div class="form-group">
          <label class="form-label">範圍</label>
          <div class="select-wrap">
            <select v-model="scope" class="form-select" @change="projectPath = ''">
              <option value="global">Global（全域）</option>
              <option value="project">Project（子專案）</option>
            </select>
            <svg class="select-arrow" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>

        <!-- Project Path (only when scope === 'project') -->
        <div v-if="scope === 'project'" class="form-group">
          <label class="form-label">專案路徑 <span class="required">*</span></label>
          <div class="select-wrap">
            <select
              v-model="projectPath"
              class="form-select"
              :class="{ 'has-error': !!projectPathError }"
              @change="projectPathError = ''"
            >
              <option value="">-- 請選擇專案 --</option>
              <option v-for="p in projectPaths" :key="p" :value="p">{{ projLabel(p) }}</option>
            </select>
            <svg class="select-arrow" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div v-if="projectPathError" class="field-error">{{ projectPathError }}</div>
        </div>

        <!-- Content (Markdown) -->
        <div class="form-group">
          <label class="form-label">內容（Markdown）</label>
          <textarea
            v-model="content"
            class="form-textarea"
            placeholder="在此輸入 Skill 的 Markdown 內容..."
          ></textarea>
        </div>

        <!-- Global error -->
        <div v-if="submitError" class="submit-error">{{ submitError }}</div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button
          class="btn btn-primary"
          :disabled="submitting"
          @click="handleSubmit"
        >
          {{ submitting ? '建立中...' : '建立 Skill' }}
        </button>
        <button class="btn btn-outline" @click="$emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useIpc } from '../../composables/useIpc';

const ipc = useIpc();

const props = defineProps<{
  show: boolean;
  projectPaths: string[];
}>();

const emit = defineEmits<{
  close: [];
  created: [];
}>();

// ── Form state ────────────────────────────────────────────
const name = ref('');
const scope = ref<'global' | 'project'>('global');
const projectPath = ref('');
const content = ref('');

const nameError = ref('');
const projectPathError = ref('');
const submitError = ref('');
const submitting = ref(false);

// Reset form when modal opens
watch(() => props.show, (val) => {
  if (val) {
    name.value = '';
    scope.value = 'global';
    projectPath.value = '';
    content.value = '';
    nameError.value = '';
    projectPathError.value = '';
    submitError.value = '';
    submitting.value = false;
  }
});

// ── Validation ────────────────────────────────────────────
const NAME_PATTERN = /^[a-zA-Z0-9_\-]+$/;

function validate(): boolean {
  let ok = true;

  if (!name.value.trim()) {
    nameError.value = '名稱不可為空';
    ok = false;
  } else if (!NAME_PATTERN.test(name.value.trim())) {
    nameError.value = '名稱只能包含英數字、連字號（-）和底線（_）';
    ok = false;
  }

  if (scope.value === 'project' && !projectPath.value) {
    projectPathError.value = '請選擇專案路徑';
    ok = false;
  }

  return ok;
}

// ── Submit ────────────────────────────────────────────────
async function handleSubmit() {
  submitError.value = '';
  if (!validate()) return;

  submitting.value = true;
  try {
    await ipc.createSkill({
      name: name.value.trim(),
      content: content.value,
      scope: scope.value,
      projectPath: scope.value === 'project' ? projectPath.value : undefined,
    });
    emit('created');
    emit('close');
  } catch (e: unknown) {
    const msg = String(e);
    if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('duplicate')) {
      nameError.value = `Skill「${name.value.trim()}」已存在，請使用不同名稱`;
    } else {
      submitError.value = `建立失敗：${msg}`;
    }
  } finally {
    submitting.value = false;
  }
}

// ── Helpers ───────────────────────────────────────────────
function projLabel(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}
</script>

<style scoped>
/* ─── Overlay & Modal ─────────────────────────────────── */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

/* ─── Header ──────────────────────────────────────────── */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s;
}

.modal-close:hover {
  color: var(--color-text-primary);
}

/* ─── Body ────────────────────────────────────────────── */
.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ─── Form Groups ─────────────────────────────────────── */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.required {
  color: var(--color-danger, #ff6b6b);
}

.form-input {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.form-input:focus {
  border-color: var(--color-accent);
}

.form-input.has-error {
  border-color: var(--color-danger, #ff6b6b);
}

/* ─── Select ──────────────────────────────────────────── */
.select-wrap {
  position: relative;
}

.form-select {
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  padding: 7px 28px 7px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.form-select:focus {
  border-color: var(--color-accent);
}

.form-select.has-error {
  border-color: var(--color-danger, #ff6b6b);
}

.select-arrow {
  position: absolute;
  right: 9px;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 6px;
  color: var(--color-text-muted);
  pointer-events: none;
}

/* ─── Textarea ────────────────────────────────────────── */
.form-textarea {
  width: 100%;
  min-height: 160px;
  box-sizing: border-box;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 10px 12px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}

.form-textarea:focus {
  border-color: var(--color-accent);
}

/* ─── Errors ──────────────────────────────────────────── */
.field-error {
  font-size: 11px;
  color: var(--color-danger, #ff6b6b);
}

.submit-error {
  font-size: 12px;
  color: var(--color-danger, #ff6b6b);
  background: rgba(255, 107, 107, 0.08);
  border: 1px solid rgba(255, 107, 107, 0.2);
  border-radius: 6px;
  padding: 8px 10px;
}

/* ─── Footer ──────────────────────────────────────────── */
.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border-default);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-shrink: 0;
}

.btn-primary {
  background: var(--color-accent);
  color: #fff;
  border: none;
  padding: 5px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: opacity 0.15s;
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
  padding: 5px 14px;
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
