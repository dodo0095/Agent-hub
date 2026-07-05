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

/** Copy current terminal selection to the system clipboard (no-op if empty). */
async function copySelection(): Promise<void> {
  if (!terminal || !terminal.hasSelection()) return;
  const text = terminal.getSelection();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard may reject (permissions / focus); never crash the terminal.
  }
}

/** Read clipboard text and send it to the PTY as input (paste). */
async function pasteFromClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    if (text) ipc.ptyInput(props.ptyId, text);
  } catch {
    // Clipboard read may reject; silently ignore.
  }
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

  // Right-click: copy when there is a selection, otherwise paste.
  onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (terminal?.hasSelection()) {
      void copySelection();
    } else {
      void pasteFromClipboard();
    }
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
    title="複製/貼上：Ctrl+Shift+C 複製選取 · Ctrl+Shift+V 貼上 · 右鍵複製或貼上（選取後自動複製）"
  />
</template>

<style>
@import '@xterm/xterm/css/xterm.css';

.xterm {
  height: 100%;
  padding: 4px;
}
</style>
