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

// Injected from SessionsView — bumped when a collapsed group expands
const refitSignal = inject<Ref<number>>('terminalRefitSignal', ref(0));

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
      magenta: '#6c5ce7',
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
  resizeObserver?.disconnect();
  terminal?.dispose();
  terminal = null;
  fitAddon = null;
});

function reinit() {
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
  <div ref="terminalRef" class="h-full w-full overflow-hidden" />
</template>

<style>
@import '@xterm/xterm/css/xterm.css';

.xterm {
  height: 100%;
  padding: 4px;
}
</style>
