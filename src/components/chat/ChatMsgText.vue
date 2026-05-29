<template>
  <div class="chat-msg-text" :class="[`role-${msg.role}`]">
    <div class="msg-avatar">
      <span v-if="msg.role === 'user'" class="avatar user-avatar">U</span>
      <span v-else-if="msg.role === 'agent'" class="avatar agent-avatar">AI</span>
      <span v-else class="avatar system-avatar">S</span>
    </div>
    <div class="msg-body">
      <div class="msg-content">{{ msg.content }}</div>
      <div class="msg-time">{{ formatTime(msg.time) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '@/api/agent'
import dayjs from 'dayjs'

defineProps<{ msg: ChatMessage }>()
function formatTime(t: string) { return dayjs(t).format('HH:mm') }
</script>

<style lang="scss" scoped>
.chat-msg-text {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  transition: background 0.15s;

  &:hover { background: rgba(0, 229, 255, 0.03); }

  &.role-user {
    flex-direction: row-reverse;
    .msg-body { align-items: flex-end; }
    .msg-content {
      background: rgba(0, 229, 255, 0.08);
      border: 1px solid rgba(0, 229, 255, 0.15);
    }
  }
}

.msg-avatar {
  flex-shrink: 0;
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
}

.user-avatar { background: rgba(0, 229, 255, 0.12); color: var(--cyber-cyan); }
.agent-avatar { background: rgba(157, 92, 255, 0.12); color: var(--cyber-purple); }
.system-avatar { background: rgba(255, 125, 0, 0.12); color: var(--cyber-orange); }

.msg-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 80%;
}

.msg-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--cyber-text-primary);
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(157, 92, 255, 0.06);
  border: 1px solid rgba(157, 92, 255, 0.12);
  word-break: break-word;
}

.msg-time {
  font-size: 10px;
  color: var(--cyber-text-muted);
}
</style>
