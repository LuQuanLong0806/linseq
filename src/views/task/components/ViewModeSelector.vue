<template>
  <div class="view-switch">
    <button
      v-for="m in modes" :key="m.key"
      class="view-btn" :class="{ active: modelValue === m.key }"
      @click="$emit('update:modelValue', m.key)"
      :title="m.label"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" v-html="m.svg" />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ViewMode } from '@/stores/task'

defineProps<{ modelValue: ViewMode }>()
defineEmits<{ 'update:modelValue': [v: ViewMode] }>()

const modes: { key: ViewMode; label: string; svg: string }[] = [
  { key: 'table', label: '列表视图', svg: '<rect x="2" y="3" width="16" height="3" rx="1"/><rect x="2" y="8.5" width="16" height="3" rx="1"/><rect x="2" y="14" width="16" height="3" rx="1"/>' },
  { key: 'card', label: '卡片视图', svg: '<rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/>' },
  { key: 'planetary', label: '行星轨道', svg: '<circle cx="10" cy="10" r="3" fill="currentColor" stroke="none"/><ellipse cx="10" cy="10" rx="8" ry="4" /><ellipse cx="10" cy="10" rx="5" ry="8" stroke-dasharray="2 2" /><circle cx="16" cy="7" r="1.2" fill="currentColor" stroke="none"/>' },
  { key: 'holographic', label: '全息HUD', svg: '<rect x="3" y="4" width="14" height="12" rx="1" stroke-dasharray="3 2"/><line x1="3" y1="8" x2="17" y2="8" stroke-dasharray="2 2"/><line x1="3" y1="12" x2="17" y2="12" stroke-dasharray="2 2"/><line x1="8" y1="4" x2="8" y2="16" stroke-dasharray="2 2"/>' },
  { key: 'datastream', label: '数据流', svg: '<line x1="4" y1="2" x2="4" y2="18" stroke-dasharray="2 3"/><line x1="8" y1="2" x2="8" y2="18" stroke-dasharray="3 2"/><line x1="12" y1="2" x2="12" y2="18" stroke-dasharray="1 4"/><line x1="16" y1="2" x2="16" y2="18" stroke-dasharray="2 2"/><circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none"/>' },
  { key: 'constellation', label: '星座图谱', svg: '<circle cx="4" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="10" cy="3" r="1.2" fill="currentColor" stroke="none"/><circle cx="16" cy="6" r="1.8" fill="currentColor" stroke="none"/><circle cx="7" cy="14" r="1.5" fill="currentColor" stroke="none"/><circle cx="14" cy="16" r="1.2" fill="currentColor" stroke="none"/><line x1="4" y1="5" x2="10" y2="3" stroke-dasharray="2 2"/><line x1="10" y1="3" x2="16" y2="6" stroke-dasharray="2 2"/><line x1="4" y1="5" x2="7" y2="14" stroke-dasharray="2 2"/><line x1="16" y1="6" x2="14" y2="16" stroke-dasharray="2 2"/>' },
]
</script>

<style lang="scss" scoped>
.view-switch {
  display: flex; gap: 4px;
  background: rgba(10,16,31,0.4); border: 1px solid rgba(0,229,255,0.12);
  border-radius: 8px; padding: 3px; backdrop-filter: blur(8px);
}
.view-btn {
  width: 32px; height: 28px; border: none; background: transparent;
  border-radius: 6px; cursor: pointer; color: #8c8ca1; display: flex;
  align-items: center; justify-content: center; transition: all 0.25s ease;
  svg { width: 16px; height: 16px; }
  &:hover { color: #00E5FF; background: rgba(0,229,255,0.08); }
  &.active {
    color: #00E5FF; background: rgba(0,229,255,0.15);
    box-shadow: 0 0 8px rgba(0,229,255,0.2);
  }
}
</style>
