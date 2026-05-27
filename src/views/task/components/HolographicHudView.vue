<template>
  <div class="holographic-view">
    <div class="holo-scanlines"></div>
    <div class="holo-grid">
      <div
        v-for="(task, idx) in tasks" :key="task.id"
        class="holo-card"
        :class="{ 'in-todo': taskStore.isInTodoList(task.id) }"
        :style="{
          '--float-delay': `${idx * 0.15}s`,
          '--glitch-delay': `${idx * 0.8}s`,
          '--project-color': getProjectColor(task.project || task.customer),
        }"
        draggable="true"
        @dragstart="onDragStart($event, task)"
        @click="showDetail(task, $event)"
      >
        <div class="holo-card-border"></div>
        <div class="holo-card-scanline"></div>
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
          <span class="ha" @click="$emit('config', task)">配置</span>
          <span class="ha" @click="$emit('toggleTodo', task)">{{ taskStore.isInTodoList(task.id) ? 'AI待办' : '入待办' }}</span>
        </div>
      </div>
    </div>
    <TaskPortal variant="sphere" @drop="onPortalDrop" class="portal-area" />
    <TaskDetailPopup :task="popupTask" :x="popupX" :y="popupY" @close="popupTask = null"
      @detail="navDetail" @config="navConfig" @toggleTodo="navTodo" @statusChange="navStatus" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Task } from '@/types'
import { useTaskStore } from '@/stores/task'
import dayjs from 'dayjs'
import TaskPortal from './TaskPortal.vue'
import TaskDetailPopup from './TaskDetailPopup.vue'
import { getProjectColor } from './projectColors'

const props = defineProps<{ tasks: Task[] }>()
const emit = defineEmits<{
  config: [task: Task]
  toggleTodo: [task: Task]
  statusChange: [task: Task, status: string]
}>()
defineOptions({ inheritAttrs: false })

const router = useRouter()
const taskStore = useTaskStore()
const popupTask = ref<Task | null>(null)
const popupX = ref(0)
const popupY = ref(0)

function showDetail(task: Task, e: MouseEvent) {
  popupTask.value = task; popupX.value = e.clientX + 20; popupY.value = e.clientY
}
function onDragStart(e: DragEvent, task: Task) {
  e.dataTransfer?.setData('application/json', JSON.stringify(task)); e.dataTransfer!.effectAllowed = 'move'
}
function onPortalDrop(task: Task) { emit('toggleTodo', task) }
function navDetail(task: Task) { popupTask.value = null; router.push(`/tasks/${task.id}`) }
function navConfig(task: Task) { popupTask.value = null; emit('config', task) }
function navTodo(task: Task) { popupTask.value = null; emit('toggleTodo', task) }
function navStatus(task: Task, status: string) { popupTask.value = null; emit('statusChange', task, status) }

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
.holo-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px; position: relative; z-index: 1;
  padding-right: 140px;
}

.holo-card {
  position: relative; padding: 14px; border-radius: 8px; overflow: hidden;
  background: rgba(10,16,31,0.5); border: 1px solid rgba(0,229,255,0.15);
  backdrop-filter: blur(8px); cursor: pointer;
  animation: holoFloat 4s ease-in-out infinite;
  animation-delay: var(--float-delay);
  transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s;
  &:hover {
    border-color: rgba(0,229,255,0.5);
    box-shadow: 0 0 25px rgba(0,229,255,0.15), 0 0 50px rgba(0,229,255,0.05);
    transform: translateY(-4px) scale(1.02);
    .holo-title { text-shadow: 2px 0 rgba(0,229,255,0.4), -2px 0 rgba(157,92,255,0.3); }
  }
  &.in-todo { border-color: rgba(255,125,0,0.3); }
}

.holo-card-border {
  position: absolute; inset: 0; border-radius: 8px; pointer-events: none;
  background: conic-gradient(from var(--holo-angle, 0deg) at 50% 50%,
    transparent 0%, rgba(0,229,255,0.08) 10%, transparent 20%,
    rgba(157,92,255,0.06) 40%, transparent 50%,
    rgba(255,125,0,0.04) 70%, transparent 80%
  );
  animation: holoBorderSpin 8s linear infinite;
}
@property --holo-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
@keyframes holoBorderSpin { to { --holo-angle: 360deg; } }

.holo-card-scanline {
  position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(transparent, rgba(0,229,255,0.01) 1px, transparent 2px);
  animation: scanDrift 3s linear infinite;
}
@keyframes scanDrift { from { background-position: 0 0; } to { background-position: 0 100px; } }

.holo-card-header {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
  .holo-id { color: rgba(140,140,161,0.6); font-size: 10px; margin-left: auto; font-family: monospace; }
}
.holo-title {
  margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #e0e0ef;
  line-height: 1.4; transition: text-shadow 0.3s;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.holo-meta {
  display: flex; gap: 8px; font-size: 10px; color: #8c8ca1;
  .overdue { color: #f56c6c; }
}
.holo-actions {
  display: flex; gap: 8px; margin-top: 10px;
  .ha {
    font-size: 10px; color: #00E5FF; cursor: pointer;
    padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(0,229,255,0.15);
    transition: all 0.2s;
    &:hover { background: rgba(0,229,255,0.12); border-color: rgba(0,229,255,0.3); }
  }
}

@keyframes holoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.portal-area { position: fixed; right: 30px; bottom: 30px; z-index: 10; }
</style>
