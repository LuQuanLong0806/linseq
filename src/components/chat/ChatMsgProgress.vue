<template>
  <div class="chat-msg-progress">
    <div class="prog-header">
      <span class="prog-dot"></span>
      <span class="prog-action">{{ msg.content.substring(0, 50) }}</span>
      <span class="prog-time">{{ formatTime(msg.time) }}</span>
    </div>
    <div v-if="msg.content.length > 50" class="prog-detail">{{ msg.content }}</div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '@/api/agent'
import dayjs from 'dayjs'

defineProps<{ msg: ChatMessage }>()
function formatTime(t: string) { return dayjs(t).format('HH:mm') }
</script>

<style lang="scss" scoped>
.chat-msg-progress {
  margin: 3px 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(0, 229, 255, 0.03);
  border-left: 2px solid rgba(0, 229, 255, 0.3);
}

.prog-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prog-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cyber-cyan);
  flex-shrink: 0;
}

.prog-action {
  font-size: 12px;
  color: var(--cyber-text-secondary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prog-time {
  font-size: 10px;
  color: var(--cyber-text-muted);
  flex-shrink: 0;
}

.prog-detail {
  margin-top: 6px;
  font-size: 12px;
  color: var(--cyber-text-muted);
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
