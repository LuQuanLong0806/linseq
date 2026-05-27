<template>
  <Teleport to="body">
    <Transition name="popup-fade">
      <div v-if="task" class="detail-popup-overlay" @click.self="$emit('close')">
        <div class="detail-popup" :style="posStyle">
          <div class="popup-scanline"></div>
          <div class="popup-header">
            <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
            <el-tag v-if="task.aiStatus" :type="getAiStatusType(task.aiStatus)" size="small" effect="dark">{{ getAiStatusLabel(task.aiStatus) }}</el-tag>
            <span class="popup-id">#{{ task.sourceId }}</span>
            <button class="popup-close" @click="$emit('close')">✕</button>
          </div>
          <h3 class="popup-title">{{ task.title }}</h3>
          <div class="popup-meta">
            <span v-if="task.project || task.customer">{{ task.project || task.customer }}</span>
            <span v-if="task.module">{{ task.module }}</span>
            <span>{{ task.workHours || 0 }}h</span>
            <span :class="{ overdue: isOverdue }">{{ formatDate(task.deadline) }}</span>
          </div>
          <p v-if="task.customDescription" class="popup-desc">{{ task.customDescription }}</p>
          <div class="popup-actions">
            <button class="pa-btn" @click="$emit('detail', task)">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/></svg>
              详情
            </button>
            <button class="pa-btn" @click="$emit('config', task)">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13"/></svg>
              配置
            </button>
            <button class="pa-btn pa-todo" @click="$emit('toggleTodo', task)">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8l4 4 8-8"/></svg>
              {{ isInTodo ? 'AI待办中' : '入AI待办' }}
            </button>
            <select class="pa-select" @change="(e) => $emit('statusChange', task, (e.target as HTMLSelectElement).value)">
              <option value="">状态</option>
              <option value="pending">待开发</option>
              <option value="in_progress">开发中</option>
              <option value="self_test">自测完成</option>
              <option value="submitted">已提测</option>
              <option value="completed">已完结</option>
            </select>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '@/types'
import { useTaskStore } from '@/stores/task'
import dayjs from 'dayjs'

const props = defineProps<{
  task: Task | null
  x: number
  y: number
}>()

defineEmits<{
  close: []
  detail: [task: Task]
  config: [task: Task]
  toggleTodo: [task: Task]
  statusChange: [task: Task, status: string]
}>()

const taskStore = useTaskStore()
const isInTodo = computed(() => props.task ? taskStore.isInTodoList(props.task.id) : false)
const isOverdue = computed(() => props.task ? props.task.status !== 'completed' && new Date(props.task.deadline).getTime() < Date.now() : false)
const posStyle = computed(() => ({
  left: `${Math.min(props.x, window.innerWidth - 340)}px`,
  top: `${Math.min(props.y, window.innerHeight - 300)}px`,
}))

function formatDate(d: string) { return dayjs(d).format('MM-DD HH:mm') }
function getPriorityType(p: string) {
  const m: Record<string, string> = { urgent: 'danger', high: 'warning', medium: 'info', low: 'success' }
  return m[p] || 'info'
}
function getPriorityLabel(p: string) {
  const m: Record<string, string> = { urgent: '紧急', high: '高', medium: '中', low: '低' }
  return m[p] || p
}
function getAiStatusType(s: string) {
  const m: Record<string, string> = { ai_todo: 'warning', ai_rework: 'danger', ai_dev: 'primary', ai_review: 'primary', ai_done: 'success' }
  return m[s] || 'info'
}
function getAiStatusLabel(s: string) {
  const m: Record<string, string> = { ai_todo: 'AI待办', ai_rework: '待返工', ai_dev: '开发中', ai_review: '待审核', ai_done: 'AI完成' }
  return m[s] || '未加入'
}
</script>

<style lang="scss" scoped>
.detail-popup-overlay {
  position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.2);
}
.detail-popup {
  position: absolute; width: 320px; padding: 16px;
  background: rgba(10,16,31,0.95); border: 1px solid rgba(0,229,255,0.3);
  border-radius: 12px; backdrop-filter: blur(20px);
  box-shadow: 0 0 30px rgba(0,229,255,0.15), inset 0 0 30px rgba(0,229,255,0.03);
  overflow: hidden;
}
.popup-scanline {
  position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(transparent, rgba(0,229,255,0.02) 1px, transparent 2px);
}
.popup-header {
  display: flex; align-items: center; gap: 6px; margin-bottom: 8px;
  .popup-id { color: #8c8ca1; font-size: 11px; margin-left: auto; }
  .popup-close {
    background: none; border: none; color: #8c8ca1; cursor: pointer; font-size: 14px;
    &:hover { color: #00E5FF; }
  }
}
.popup-title { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #e0e0ef; line-height: 1.4; }
.popup-meta {
  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;
  font-size: 11px; color: #8c8ca1;
  .overdue { color: #f56c6c; font-weight: 600; }
}
.popup-desc {
  margin: 0 0 12px; padding: 8px; border-radius: 6px;
  background: rgba(0,229,255,0.06); border: 1px solid rgba(0,229,255,0.1);
  font-size: 12px; color: #cfd3dc; line-height: 1.4;
}
.popup-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.pa-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; font-size: 11px; color: #00E5FF;
  background: rgba(0,229,255,0.08); border: 1px solid rgba(0,229,255,0.15);
  border-radius: 6px; cursor: pointer; transition: all 0.2s;
  &:hover { background: rgba(0,229,255,0.15); box-shadow: 0 0 8px rgba(0,229,255,0.2); }
}
.pa-todo { color: #9D5CFF; border-color: rgba(157,92,255,0.2); background: rgba(157,92,255,0.08);
  &:hover { background: rgba(157,92,255,0.15); box-shadow: 0 0 8px rgba(157,92,255,0.2); }
}
.pa-select {
  padding: 4px 8px; font-size: 11px; color: #00E5FF;
  background: rgba(0,229,255,0.08); border: 1px solid rgba(0,229,255,0.15);
  border-radius: 6px; cursor: pointer; outline: none;
  option { background: #0a101f; color: #e0e0ef; }
}

.popup-fade-enter-active { transition: all 0.25s ease; }
.popup-fade-leave-active { transition: all 0.15s ease; }
.popup-fade-enter-from { opacity: 0; transform: scale(0.9); }
.popup-fade-leave-to { opacity: 0; transform: scale(0.95); }
</style>
