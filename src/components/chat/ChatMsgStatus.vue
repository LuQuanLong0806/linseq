<template>
  <div class="chat-msg-status">
    <span class="status-dot"></span>
    <span class="status-text">{{ msg.content }}</span>
    <span class="status-time">{{ formatTime(msg.time) }}</span>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '@/api/agent'
import dayjs from 'dayjs'

defineProps<{ msg: ChatMessage }>()
function formatTime(t: string) { return dayjs(t).format('HH:mm') }
</script>

<style lang="scss" scoped>
.chat-msg-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 12px;
  margin: 2px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
}

.status-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--cyber-text-muted);
  flex-shrink: 0;
}

.status-text {
  font-size: 11px;
  color: var(--cyber-text-muted);
}

.status-time {
  font-size: 10px;
  color: var(--cyber-text-muted);
  opacity: 0.6;
}
</style>
