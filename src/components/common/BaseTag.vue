<script setup lang="ts">
defineProps<{
  color?: 'purple' | 'green' | 'yellow' | 'red' | 'blue' | 'cyan' | 'orange' | 'pink';
}>();

const colorClasses: Record<string, string> = {
  purple: 'bg-[#0066cc22] text-accent-light',
  green: 'bg-success-dim text-success',
  yellow: 'bg-warning-dim text-warning',
  red: 'bg-danger-dim text-danger',
  blue: 'bg-info-dim text-info',
  cyan: 'bg-[#22d3ee22] text-cyan',
  orange: 'bg-[#ff922b22] text-orange',
  pink: 'bg-[#f0659522] text-pink',
};
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-md px-2.5 py-[3px] text-[11px] font-medium"
    :class="colorClasses[color ?? 'purple']"
  >
    <slot />
  </span>
</template>
