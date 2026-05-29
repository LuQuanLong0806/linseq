<template>
  <div class="chat-msg-question">
    <div class="q-header">
      <span class="q-icon">?</span>
      <span class="q-label">Agent 提问</span>
      <span class="q-time">{{ formatTime(msg.time) }}</span>
    </div>
    <div class="q-content">{{ msg.content }}</div>
    <div v-if="showActions" class="q-actions">
      <button class="act-btn act-answer" @click="$emit('answer', msg, msg.content)">直接回复</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '@/api/agent'
import dayjs from 'dayjs'

defineProps<{ msg: ChatMessage; showActions?: boolean }>()
defineEmits<{ answer: [msg: ChatMessage, answer: string] }>()

function formatTime(t: string) { return dayjs(t).format('HH:mm') }
</script>

<style lang="scss" scoped>
.chat-msg-question {
  margin: 4px 12px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 125, 0, 0.04);
  border: 1px solid rgba(255, 125, 0, 0.2);
}

.q-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.q-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 125, 0, 0.12);
  color: var(--cyber-orange);
  font-size: 12px;
  font-weight: 700;
}

.q-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cyber-orange);
}

.q-time {
  margin-left: auto;
  font-size: 10px;
  color: var(--cyber-text-muted);
}

.q-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--cyber-text-primary);
}

.q-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
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

.act-answer {
  background: rgba(0, 229, 255, 0.08);
  border-color: rgba(0, 229, 255, 0.3);
  color: var(--cyber-cyan);
  &:hover { background: rgba(0, 229, 255, 0.15); }
}
</style>
