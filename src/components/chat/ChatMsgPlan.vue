<template>
  <div class="chat-msg-plan" :class="`level-${levelClass}`">
    <div class="plan-header">
      <span class="plan-icon">P</span>
      <span class="plan-label">执行计划</span>
      <span v-if="level" class="level-badge" :class="`badge-${levelClass}`">
        {{ level }}
        <template v-if="level !== 'L1'">{{ levelLabel }}</template>
      </span>
      <span v-if="showActions && countdown > 0" class="countdown">{{ countdown }}s</span>
      <span class="plan-time">{{ formatTime(msg.time) }}</span>
    </div>
    <div class="plan-content">
      <div v-for="(line, i) in planLines" :key="i" class="plan-step">
        <span class="step-num">{{ i + 1 }}</span>
        <span class="step-text">{{ line }}</span>
      </div>
    </div>
    <div v-if="showActions" class="plan-actions">
      <button class="act-btn act-approve" @click="$emit('approve', msg)">批准计划</button>
      <button class="act-btn act-redirect" @click="$emit('redirect', msg)">调整方向</button>
      <button v-if="level === 'L4'" class="act-btn act-abort" @click="$emit('abort', msg)">拒绝</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import type { ChatMessage } from '@/api/agent'
import dayjs from 'dayjs'

const props = defineProps<{ msg: ChatMessage; showActions?: boolean }>()
defineEmits<{ approve: [msg: ChatMessage]; redirect: [msg: ChatMessage]; abort: [msg: ChatMessage] }>()

const planLines = computed(() => props.msg.content.split('\n').filter(l => l.trim()))

const level = computed(() => {
  const l = (props.msg.metadata?.level as string) || ''
  return ['L1', 'L2', 'L3', 'L4'].includes(l) ? l : ''
})

const levelClass = computed(() => (level.value || 'L2').toLowerCase())

const levelLabel = computed(() => {
  switch (level.value) {
    case 'L2': return '常规'
    case 'L3': return '重要'
    case 'L4': return '关键'
    default: return ''
  }
})

const levelTimeouts: Record<string, number> = { L1: 0, L2: 10, L3: 30, L4: 300 }
const countdown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function startCountdown() {
  stopCountdown()
  if (!props.showActions || !level.value || level.value === 'L1') return
  const seconds = levelTimeouts[level.value] || 0
  if (seconds <= 0) return
  countdown.value = seconds
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) stopCountdown()
  }, 1000)
}

function stopCountdown() {
  if (timer) { clearInterval(timer); timer = null }
  countdown.value = 0
}

watch(() => props.showActions, (v) => { v ? startCountdown() : stopCountdown() })
onMounted(() => { if (props.showActions) startCountdown() })
onUnmounted(stopCountdown)

function formatTime(t: string) { return dayjs(t).format('HH:mm') }
</script>

<style lang="scss" scoped>
.chat-msg-plan {
  margin: 4px 12px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(157, 92, 255, 0.05);
  border: 1px solid rgba(157, 92, 255, 0.15);
  &.level-l4 { border-color: rgba(245, 108, 108, 0.3); background: rgba(245, 108, 108, 0.03); }
  &.level-l3 { border-color: rgba(255, 125, 0, 0.25); }
}

.plan-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.plan-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(157, 92, 255, 0.15);
  color: var(--cyber-purple);
  font-size: 11px;
  font-weight: 700;
}

.plan-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cyber-purple);
}

.level-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  &.badge-l1 { background: rgba(0, 229, 255, 0.08); color: var(--cyber-cyan); }
  &.badge-l2 { background: rgba(157, 92, 255, 0.08); color: var(--cyber-purple); }
  &.badge-l3 { background: rgba(255, 125, 0, 0.1); color: var(--cyber-orange); }
  &.badge-l4 { background: rgba(245, 108, 108, 0.1); color: #f56c6c; }
}

.countdown {
  font-size: 11px;
  color: var(--cyber-orange);
  font-weight: 600;
  font-family: 'Cascadia Code', Consolas, monospace;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.plan-time {
  margin-left: auto;
  font-size: 10px;
  color: var(--cyber-text-muted);
}

.plan-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plan-step {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cyber-text-primary);
}

.step-num {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(157, 92, 255, 0.1);
  color: var(--cyber-purple);
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.plan-actions {
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

.act-redirect {
  background: rgba(255, 125, 0, 0.08);
  border-color: rgba(255, 125, 0, 0.3);
  color: var(--cyber-orange);
  &:hover { background: rgba(255, 125, 0, 0.15); }
}

.act-abort {
  background: rgba(245, 108, 108, 0.08);
  border-color: rgba(245, 108, 108, 0.3);
  color: #f56c6c;
  &:hover { background: rgba(245, 108, 108, 0.15); }
}
</style>
