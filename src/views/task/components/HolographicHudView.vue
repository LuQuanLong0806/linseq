<template>
  <div class="holographic-view">
    <div class="holo-scanlines"></div>
    <div class="holo-grid">
      <div
        v-for="(task, idx) in tasks" :key="task.id"
        class="holo-card"
        :class="{
          'in-todo': taskStore.isInTodoList(task.id),
          'selected': selectedIds.has(task.id),
          'streaming': streamingIds.has(task.id),
        }"
        :style="{
          '--float-delay': `${idx * 0.15}s`,
          '--glitch-delay': `${idx * 0.8}s`,
          '--project-color': getProjectColor(task.project || task.customer),
        }"
        @click="toggleSelect(task.id)"
        @animationend="onStreamEnd($event, task.id)"
      >
        <div class="holo-card-border"></div>
        <!-- 卡片内数据流背景 -->
        <div class="card-data-rain">
          <div v-for="n in 5" :key="n" class="card-rain-col" :style="{ '--cr-delay': `${n * 0.4}s`, '--cr-speed': `${1.5 + (n % 3) * 0.5}s`, '--cr-x': `${(n - 1) * 20}%` }">
            <span v-for="d in 6" :key="d" class="cr-char">{{ chars[(n * 3 + d) % chars.length] }}</span>
          </div>
        </div>
        <!-- 选中指示器 -->
        <div class="select-indicator" :class="{ active: selectedIds.has(task.id) }"></div>
        <div class="holo-card-header">
          <el-tag :type="getPriorityType(task.priority)" size="small" effect="dark">{{ getPriorityLabel(task.priority) }}</el-tag>
          <el-tag v-if="task.aiStatus" :type="getAiStatusType(task.aiStatus)" size="small" effect="dark">{{ getAiStatusLabel(task.aiStatus) }}</el-tag>
          <span class="holo-id">#{{ task.sourceId }}</span>
        </div>
        <h3 class="holo-title">{{ task.title }}</h3>
        <div class="holo-meta">
          <span v-if="task.project || task.customer">{{ task.project || task.customer }}</span>
          <span>{{ task.workHours || 0 }}h</span>
          <span :class="{ overdue: isOverdue(task) }">{{ formatDate(task.deadline) }}</span>
        </div>
        <div class="holo-actions" @click.stop>
          <span class="ha ha-detail" @click="navDetail(task)">详情</span>
          <span class="ha ha-config" @click="$emit('config', task)">配置</span>
          <span class="ha ha-todo" @click="handleTodo(task)">
            <template v-if="streamingIds.has(task.id)">
              <span class="stream-text">传输中</span>
            </template>
            <template v-else>
              {{ taskStore.isInTodoList(task.id) ? 'AI待办' : '入待办' }}
            </template>
          </span>
        </div>
        <!-- 入待办电流边框动画 -->
        <div v-if="streamingIds.has(task.id)" class="electric-border"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Task } from '@/types'
import { useTaskStore } from '@/stores/task'
import dayjs from 'dayjs'
// import TaskPortal from './TaskPortal.vue'
// import TaskDetailPopup from './TaskDetailPopup.vue'
import { getProjectColor } from './projectColors'

const props = defineProps<{ tasks: Task[] }>()
const emit = defineEmits<{
  config: [task: Task]
  toggleTodo: [task: Task]
  statusChange: [task: Task, status: string]
  updateSelected: [ids: string[]]
}>()
defineOptions({ inheritAttrs: false })

const router = useRouter()
const taskStore = useTaskStore()
const selectedIds = reactive(new Set<string>())
const streamingIds = reactive(new Set<string>())

const chars = ['0','1','│','┃','╎','▏','█','▓','░','⌇','⣿','⡇','┆','╏','║']

watch(selectedIds, (ids) => {
  emit('updateSelected', Array.from(ids))
}, { deep: true })

function toggleSelect(id: string) {
  if (streamingIds.has(id)) return
  if (selectedIds.has(id)) selectedIds.delete(id)
  else selectedIds.add(id)
}

function handleTodo(task: Task) {
  if (streamingIds.has(task.id)) return
  streamingIds.add(task.id)
  emit('toggleTodo', task)
}

function onStreamEnd(e: AnimationEvent, id: string) {
  if (e.animationName === 'dataStream') {
    streamingIds.delete(id)
  }
}

function navDetail(task: Task) {
  router.push(`/tasks/${task.id}`)
}

function isOverdue(t: Task) { return t.status !== 'completed' && new Date(t.deadline).getTime() < Date.now() }
function formatDate(d: string) { return dayjs(d).format('MM-DD') }
type TagType = 'success' | 'primary' | 'warning' | 'danger' | 'info'
function getPriorityType(p: string): TagType { return ({ urgent: 'danger', high: 'warning', medium: 'info', low: 'success' } as Record<string, TagType>)[p] || 'info' }
function getPriorityLabel(p: string) { return ({ urgent: '紧急', high: '高', medium: '中', low: '低' } as Record<string,string>)[p] || p }
function getAiStatusType(s: string): TagType { return ({ ai_todo: 'warning', ai_rework: 'danger', ai_dev: 'primary', ai_review: 'primary', ai_done: 'success' } as Record<string, TagType>)[s] || 'info' }
function getAiStatusLabel(s: string) { return ({ ai_todo: 'AI待办', ai_rework: '待返工', ai_dev: '开发中', ai_review: '待审核', ai_done: 'AI完成' } as Record<string,string>)[s] || '未加入' }
</script>

<style lang="scss" scoped>
.holographic-view {
  position: relative; min-height: 500px;
}
.holo-scanlines {
  position: absolute; inset: 0; pointer-events: none; z-index: 2;
  background: repeating-linear-gradient(transparent, rgba(0,229,255,0.015) 1px, transparent 2px);
}

/* ====== 卡片网格 ====== */
.holo-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px; position: relative; z-index: 1;
  min-width: 1200px;
}

/* ====== 卡片 ====== */
.holo-card {
  position: relative; padding: 14px; border-radius: 8px; overflow: hidden;
  background: rgba(10,16,31,0.6); border: 1px solid rgba(0,229,255,0.15);
  backdrop-filter: blur(8px); cursor: pointer;
  animation: holoFloat 4s ease-in-out infinite;
  animation-delay: var(--float-delay);
  transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s;
  &:hover {
    border-color: rgba(0,229,255,0.5);
    box-shadow: 0 0 25px rgba(0,229,255,0.15), 0 0 50px rgba(0,229,255,0.05);
    .holo-title { text-shadow: 2px 0 rgba(0,229,255,0.4), -2px 0 rgba(157,92,255,0.3); }
  }
  &.selected {
    border-color: rgba(0,229,255,0.6);
    box-shadow: 0 0 30px rgba(0,229,255,0.25), inset 0 0 20px rgba(0,229,255,0.08);
    transform: scale(1.02);
    .select-indicator { opacity: 1; transform: scale(1); }
  }
  &.in-todo { border-color: rgba(255,125,0,0.3); }
  &.streaming {
    animation: dataStream 1.2s ease-out forwards !important;
    pointer-events: none;
  }
}

/* ====== 卡片内数据流 ====== */
.card-data-rain {
  position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; opacity: 0.12;
}
.card-rain-col {
  position: absolute; left: var(--cr-x); top: -80px;
  display: flex; flex-direction: column; gap: 8px;
  animation: cardRainFall var(--cr-speed) linear infinite;
  animation-delay: var(--cr-delay);
  .cr-char {
    font-size: 9px; color: #00E5FF; font-family: monospace;
    text-shadow: 0 0 3px rgba(0,229,255,0.4);
  }
  &:nth-child(2n) { .cr-char { color: #9D5CFF; text-shadow: 0 0 3px rgba(157,92,255,0.4); } }
  &:nth-child(3n) { opacity: 0.6; }
}
@keyframes cardRainFall {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(calc(100% + 80px)); }
}

/* ====== 选中指示器 ====== */
.select-indicator {
  position: absolute; top: 8px; right: 8px; width: 20px; height: 20px;
  border: 2px solid rgba(0,229,255,0.4); border-radius: 50%;
  transition: all 0.25s; opacity: 0; transform: scale(0.5);
  &.active {
    opacity: 1; transform: scale(1);
    border-color: #00E5FF; background: rgba(0,229,255,0.2);
    box-shadow: 0 0 10px rgba(0,229,255,0.5);
    &::after {
      content: '✓'; position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: #00E5FF;
    }
  }
}

/* ====== 入待办数据流动效 ====== */
.electric-border {
  position: absolute; inset: 0; border-radius: 8px; pointer-events: none; z-index: 3;
  background: none;
  border: 2px solid transparent;
  background-image: linear-gradient(rgba(10,16,31,0.95), rgba(10,16,31,0.95)),
    linear-gradient(90deg, #00E5FF, #9D5CFF, #00E5FF, #FF7D00, #00E5FF);
  background-origin: border-box;
  background-clip: padding-box, border-box;
  animation: electricPulse 0.4s ease-in-out infinite alternate;
}
@keyframes electricPulse {
  0% { box-shadow: 0 0 8px rgba(0,229,255,0.6), inset 0 0 8px rgba(0,229,255,0.2); }
  100% { box-shadow: 0 0 25px rgba(0,229,255,0.9), inset 0 0 15px rgba(157,92,255,0.3), 0 0 50px rgba(0,229,255,0.4); }
}

@keyframes dataStream {
  0% { border-color: #00E5FF; box-shadow: 0 0 20px rgba(0,229,255,0.5); opacity: 1; transform: scale(1); }
  20% {
    box-shadow: 0 0 40px rgba(0,229,255,0.8), 0 0 80px rgba(0,229,255,0.3),
      inset 0 0 30px rgba(0,229,255,0.3), 0 0 120px rgba(157,92,255,0.2);
    border-color: #9D5CFF;
  }
  50% {
    box-shadow: 0 0 60px rgba(157,92,255,0.6), 0 0 100px rgba(0,229,255,0.2);
    border-color: #9D5CFF; opacity: 0.7; transform: scale(0.96);
    filter: blur(1px);
  }
  80% { opacity: 0.3; transform: scale(0.92) translateY(-10px); filter: blur(2px); }
  100% { opacity: 0; transform: scale(0.88) translateY(-20px); filter: blur(3px); }
}

.stream-text {
  animation: streamBlink 0.3s ease-in-out infinite alternate;
}
@keyframes streamBlink {
  0% { opacity: 0.4; }
  100% { opacity: 1; text-shadow: 0 0 8px rgba(0,229,255,0.8); }
}

/* ====== 旋转边框 ====== */
.holo-card-border {
  position: absolute; inset: 0; border-radius: 8px; pointer-events: none; z-index: 1;
}

.holo-card-header {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px; position: relative; z-index: 2;
  .holo-id { color: rgba(140,140,161,0.6); font-size: 10px; margin-left: auto; font-family: monospace; }
}
.holo-title {
  margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #e0e0ef; position: relative; z-index: 2;
  line-height: 1.4; transition: text-shadow 0.3s;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.holo-meta {
  display: flex; gap: 8px; font-size: 10px; color: #8c8ca1; position: relative; z-index: 2;
  .overdue { color: #f56c6c; }
}
.holo-actions {
  display: flex; gap: 8px; margin-top: 10px; position: relative; z-index: 2;
  .ha {
    font-size: 10px; color: #00E5FF; cursor: pointer;
    padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(0,229,255,0.15);
    transition: all 0.2s;
    &:hover { background: rgba(0,229,255,0.12); border-color: rgba(0,229,255,0.3); }
  }
  .ha-detail { color: #9D5CFF; border-color: rgba(157,92,255,0.2);
    &:hover { background: rgba(157,92,255,0.12); border-color: rgba(157,92,255,0.3); }
  }
  .ha-todo { color: #FF7D00; border-color: rgba(255,125,0,0.2);
    &:hover { background: rgba(255,125,0,0.12); border-color: rgba(255,125,0,0.3); }
  }
}

@keyframes holoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
</style>
