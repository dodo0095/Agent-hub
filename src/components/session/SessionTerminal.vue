<script setup lang="ts">
import { ref, inject, nextTick, onMounted, onBeforeUnmount, onActivated, watch } from 'vue';
import type { Ref } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useIpc } from '../../composables/useIpc';

const props = defineProps<{
  ptyId: string;
  active?: boolean;
}>();

const ipc = useIpc();
const terminalRef = ref<HTMLDivElement | null>(null);

// Right-click context menu state (rendered via Teleport to body).
const menuVisible = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const menuHasSelection = ref(false);

let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let initialized = false;
let alive = true;
let writeBuffer = '';
let writeRafId: number | null = null;
let onContextMenu: ((event: MouseEvent) => void) | null = null;

// Injected from SessionsView — bumped when a collapsed group expands
const refitSignal = inject<Ref<number>>('terminalRefitSignal', ref(0));

/**
 * Copy current terminal selection to the system clipboard (no-op if empty).
 * Uses Electron's native clipboard via IPC — the renderer's navigator.clipboard
 * is blocked by default Electron permissions and fails silently.
 */
async function copySelection(): Promise<void> {
  if (!terminal || !terminal.hasSelection()) return;
  const text = terminal.getSelection();
  if (!text) return;
  try {
    await ipc.writeClipboard(text);
  } catch {
    // Never crash the terminal on clipboard failure.
  }
}

/** Read clipboard text (native Electron clipboard) and send it to the PTY as input (paste). */
async function pasteFromClipboard(): Promise<void> {
  try {
    const text = await ipc.readClipboard();
    if (text) ipc.ptyInput(props.ptyId, text);
  } catch {
    // Silently ignore clipboard read failures.
  }
}

/** Open the right-click context menu at the cursor, clamped to the viewport. */
function openContextMenu(event: MouseEvent): void {
  menuHasSelection.value = !!terminal?.hasSelection();
  // Clamp so the menu stays on-screen (menu is ~160px wide, ~150px tall).
  const menuW = 170;
  const menuH = 160;
  menuX.value = Math.min(event.clientX, window.innerWidth - menuW);
  menuY.value = Math.min(event.clientY, window.innerHeight - menuH);
  menuVisible.value = true;
  window.addEventListener('mousedown', onWindowMouseDown, true);
  window.addEventListener('keydown', onWindowKeyDown, true);
}

function closeContextMenu(): void {
  if (!menuVisible.value) return;
  menuVisible.value = false;
  window.removeEventListener('mousedown', onWindowMouseDown, true);
  window.removeEventListener('keydown', onWindowKeyDown, true);
}

function onWindowMouseDown(event: MouseEvent): void {
  // Any click outside the menu dismisses it.
  const target = event.target as HTMLElement | null;
  if (target && target.closest('.terminal-context-menu')) return;
  closeContextMenu();
}

function onWindowKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeContextMenu();
}

function menuCopy(): void {
  void copySelection();
  closeContextMenu();
}

function menuPaste(): void {
  void pasteFromClipboard();
  closeContextMenu();
}

function menuSelectAll(): void {
  terminal?.selectAll();
  terminal?.focus();
  closeContextMenu();
}

function menuClear(): void {
  terminal?.clear();
  terminal?.focus();
  closeContextMenu();
}

function createTerminal() {
  return new Terminal({
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
    theme: {
      background: '#0f1117',
      foreground: '#e4e4f0',
      cursor: '#0066cc',           // StarkLab brand blue cursor
      cursorAccent: '#0f1117',
      selectionBackground: '#0066cc33', // brand blue with 20% opacity
      black: '#0f1117',
      red: '#ff6b6b',
      green: '#00d68f',
      yellow: '#ffaa00',
      blue: '#339af0',
      magenta: '#4da3ff', // StarkLab brand blue-light
      cyan: '#22d3ee',
      white: '#e4e4f0',
      brightBlack: '#5c5e72',
      brightRed: '#ff8787',
      brightGreen: '#38d9a9',
      brightYellow: '#ffd43b',
      brightBlue: '#74c0fc',
      brightMagenta: '#a29bfe',
      brightCyan: '#66d9e8',
      brightWhite: '#ffffff',
    },
    cursorBlink: true,
    scrollback: 3000,
    allowProposedApi: true,
  });
}

async function initTerminal() {
  if (!terminalRef.value || terminal) return;

  terminal = createTerminal();
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  terminal.open(terminalRef.value);
  try { fitAddon.fit(); } catch { /* ignore */ }

  // Clipboard: terminals capture Ctrl+C as SIGINT, so use Ctrl+Shift+C/V.
  // Return false tells xterm we handled the key and must NOT forward it to the PTY.
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true;
    if (event.ctrlKey && event.shiftKey && (event.key === 'C' || event.key === 'c')) {
      void copySelection();
      return false;
    }
    if (event.ctrlKey && event.shiftKey && (event.key === 'V' || event.key === 'v')) {
      void pasteFromClipboard();
      return false;
    }
    return true;
  });

  // Copy-on-select: reflect the terminal selection into the clipboard automatically.
  terminal.onSelectionChange(() => {
    void copySelection();
  });

  // Right-click: open a context menu (copy / paste / select all / clear).
  onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    openContextMenu(event);
  };
  terminalRef.value.addEventListener('contextmenu', onContextMenu);

  // Replay output buffer from Main Process to restore terminal content
  if (!initialized) {
    try {
      const buffer = await ipc.getOutputBuffer(props.ptyId);
      if (buffer && terminal) {
        terminal.write(buffer);
      }
    } catch {
      // Ignore replay errors
    }
    initialized = true;
  }

  // Send user keyboard input to PTY
  terminal.onData((data) => {
    ipc.ptyInput(props.ptyId, data);
  });

  // Resize PTY when terminal resizes
  terminal.onResize(({ cols, rows }) => {
    ipc.ptyResize(props.ptyId, cols, rows);
  });

  // Listen for PTY data from this session
  // Buffer writes and flush once per animation frame to prevent rendering overload
  // when Claude Code outputs large amounts of text rapidly.
  ipc.onPtyData((ptyData) => {
    if (alive && ptyData.ptyId === props.ptyId && terminal) {
      writeBuffer += ptyData.data;
      if (writeRafId === null) {
        writeRafId = requestAnimationFrame(() => {
          if (terminal && writeBuffer) {
            terminal.write(writeBuffer);
            writeBuffer = '';
          }
          writeRafId = null;
        });
      }
    }
  });

  // ResizeObserver for container size changes
  resizeObserver = new ResizeObserver(() => {
    if (fitAddon && terminal) {
      try {
        fitAddon.fit();
      } catch {
        // Ignore fit errors during rapid resize
      }
    }
  });
  resizeObserver.observe(terminalRef.value);

  // Safety net: refit after layout fully settles (fixes first-load garbled text)
  setTimeout(() => {
    if (fitAddon && terminal) {
      try { fitAddon.fit(); } catch { /* ignore */ }
    }
  }, 300);
}

// Re-fit when active state changes (e.g., switching tabs)
watch(
  () => props.active,
  (isActive) => {
    if (isActive && fitAddon && terminal) {
      setTimeout(() => fitAddon?.fit(), 50);
    }
  },
);

// Re-fit when parent signals group expand (v-show toggled back to visible)
watch(refitSignal, () => {
  if (fitAddon && terminal) {
    try { fitAddon.fit(); } catch { /* ignore */ }
  }
});

// KeepAlive: re-fit terminal when component is re-activated
onActivated(() => {
  if (fitAddon && terminal) {
    setTimeout(() => fitAddon?.fit(), 50);
  }
});

onMounted(() => {
  // Wait for container to have stable dimensions before initializing xterm.
  // CSS grid/flex may not have resolved column widths yet on first frame.
  // We observe the container and only init once its width stops changing.
  if (!terminalRef.value) return;
  let lastWidth = 0;
  let stableCount = 0;
  const checkStable = () => {
    const w = terminalRef.value?.clientWidth ?? 0;
    if (w > 0 && w === lastWidth) {
      stableCount++;
      if (stableCount >= 2) {
        initTerminal();
        return;
      }
    } else {
      stableCount = 0;
    }
    lastWidth = w;
    requestAnimationFrame(checkStable);
  };
  requestAnimationFrame(checkStable);
});

onBeforeUnmount(() => {
  alive = false;
  closeContextMenu();
  if (writeRafId !== null) cancelAnimationFrame(writeRafId);
  writeRafId = null;
  writeBuffer = '';
  if (onContextMenu && terminalRef.value) {
    terminalRef.value.removeEventListener('contextmenu', onContextMenu);
  }
  onContextMenu = null;
  resizeObserver?.disconnect();
  terminal?.dispose();
  terminal = null;
  fitAddon = null;
});

function reinit() {
  closeContextMenu();
  if (onContextMenu && terminalRef.value) {
    terminalRef.value.removeEventListener('contextmenu', onContextMenu);
  }
  onContextMenu = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  terminal?.dispose();
  terminal = null;
  fitAddon = null;
  initialized = false;
  // Clear leftover DOM nodes from disposed terminal
  if (terminalRef.value) {
    terminalRef.value.innerHTML = '';
  }
  // Wait for DOM cleanup before re-initializing
  nextTick(() => initTerminal());
}

defineExpose({
  fit: () => fitAddon?.fit(),
  focus: () => terminal?.focus(),
  clear: () => terminal?.clear(),
  reinit,
});
</script>

<template>
  <div
    ref="terminalRef"
    class="h-full w-full overflow-hidden"
    title="複製/貼上：Ctrl+Shift+C 複製選取 · Ctrl+Shift+V 貼上 · 右鍵開啟選單（選取後自動複製）"
  />

  <Teleport to="body">
    <div
      v-if="menuVisible"
      class="terminal-context-menu"
      :style="{ left: menuX + 'px', top: menuY + 'px' }"
      role="menu"
    >
      <button
        type="button"
        class="terminal-context-menu__item"
        role="menuitem"
        :disabled="!menuHasSelection"
        @click="menuCopy"
      >
        複製<span class="terminal-context-menu__hint">Ctrl+Shift+C</span>
      </button>
      <button
        type="button"
        class="terminal-context-menu__item"
        role="menuitem"
        @click="menuPaste"
      >
        貼上<span class="terminal-context-menu__hint">Ctrl+Shift+V</span>
      </button>
      <div class="terminal-context-menu__sep" role="separator" />
      <button
        type="button"
        class="terminal-context-menu__item"
        role="menuitem"
        @click="menuSelectAll"
      >
        全選
      </button>
      <button
        type="button"
        class="terminal-context-menu__item"
        role="menuitem"
        @click="menuClear"
      >
        清除
      </button>
    </div>
  </Teleport>
</template>

<style>
@import '@xterm/xterm/css/xterm.css';

.xterm {
  height: 100%;
  padding: 4px;
}

/* Right-click context menu (teleported to body, so styles are global). */
.terminal-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 160px;
  padding: 4px;
  background: #1a1c26;
  border: 1px solid #2a2d3a;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  font-size: 13px;
  color: #e4e4f0;
  user-select: none;
}

.terminal-context-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.terminal-context-menu__item:hover:not(:disabled) {
  background: #0066cc;
  color: #ffffff;
}

.terminal-context-menu__item:disabled {
  opacity: 0.4;
  cursor: default;
}

.terminal-context-menu__hint {
  font-size: 11px;
  color: #8b8da3;
}

.terminal-context-menu__item:hover:not(:disabled) .terminal-context-menu__hint {
  color: #cfe0ff;
}

.terminal-context-menu__sep {
  height: 1px;
  margin: 4px 6px;
  background: #2a2d3a;
}
</style>
