<template>
  <div class="chat-msg-completion">
    <div class="comp-header">
      <span class="comp-icon">✓</span>
      <span class="comp-label">开发完成</span>
      <span v-if="version" class="comp-version">{{ version }}</span>
      <span class="comp-time">{{ formatTime(msg.time) }}</span>
    </div>

    <div v-if="summary" class="comp-summary">{{ summary }}</div>

    <div v-if="files.length > 0" class="comp-files">
      <div class="files-label">变更文件 ({{ files.length }})</div>
      <div v-for="(f, i) in files.slice(0, 5)" :key="i" class="file-item">
        <span class="file-action" :class="`action-${f.action}`">{{ f.action }}</span>
        <span class="file-path">{{ f.path }}</span>
      </div>
      <div v-if="files.length > 5" class="file-more">...等 {{ files.length }} 个文件</div>
    </div>

    <div v-if="showActions" class="comp-actions">
      <button class="act-btn act-approve" @click="$emit('approve', msg)">批准</button>
      <button class="act-btn act-reject" @click="$emit('reject', msg)">拒绝</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/api/agent'
import dayjs from 'dayjs'

const props = defineProps<{ msg: ChatMessage; showActions?: boolean }>()
defineEmits<{ approve: [msg: ChatMessage]; reject: [msg: ChatMessage] }>()

const meta = computed(() => {
  const m = props.msg.metadata
  return {
    versionNumber: (m?.versionNumber as string) || '',
    screenshots: (m?.screenshots as string[]) || [],
    filesChanged: (m?.filesChanged as { path: string; action: string }[]) || [],
  }
})

const version = computed(() => meta.value.versionNumber)
const summary = computed(() => props.msg.content)
const files = computed(() => meta.value.filesChanged)

function formatTime(t: string) { return dayjs(t).format('HH:mm') }
</script>

<style lang="scss" scoped>
.chat-msg-completion {
  margin: 4px 12px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(0, 229, 255, 0.04);
  border: 1px solid rgba(0, 229, 255, 0.2);
}

.comp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.comp-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0, 229, 255, 0.12);
  color: var(--cyber-cyan);
  font-size: 12px;
  font-weight: 700;
}

.comp-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cyber-cyan);
}

.comp-version {
  font-size: 11px;
  color: var(--cyber-purple);
  background: rgba(157, 92, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.comp-time {
  margin-left: auto;
  font-size: 10px;
  color: var(--cyber-text-muted);
}

.comp-summary {
  font-size: 13px;
  line-height: 1.6;
  color: var(--cyber-text-primary);
  margin-bottom: 8px;
}

.comp-files {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 6px;
}

.files-label {
  font-size: 11px;
  color: var(--cyber-text-secondary);
  margin-bottom: 6px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 2px 0;
  color: var(--cyber-text-muted);
}

.file-action {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
  &.action-add, &.action-create { background: rgba(0, 229, 255, 0.1); color: var(--cyber-cyan); }
  &.action-modify, &.action-edit { background: rgba(255, 125, 0, 0.1); color: var(--cyber-orange); }
  &.action-delete { background: rgba(245, 108, 108, 0.1); color: #f56c6c; }
}

.file-path {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
}

.file-more {
  font-size: 11px;
  color: var(--cyber-text-muted);
  margin-top: 4px;
}

.comp-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.act-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.2s;
}

.act-approve {
  background: rgba(0, 229, 255, 0.08);
  border-color: rgba(0, 229, 255, 0.3);
  color: var(--cyber-cyan);
  &:hover { background: rgba(0, 229, 255, 0.15); }
}

.act-reject {
  background: rgba(245, 108, 108, 0.08);
  border-color: rgba(245, 108, 108, 0.3);
  color: #f56c6c;
  &:hover { background: rgba(245, 108, 108, 0.15); }
}
</style>
