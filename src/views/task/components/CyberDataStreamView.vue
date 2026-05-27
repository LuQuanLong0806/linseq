<template>
  <div class="datastream-view">
    <canvas ref="rainCanvas" class="rain-canvas"></canvas>
    <div class="ds-layout">
      <div class="ds-flow">
        <div
          v-for="(task, idx) in tasks" :key="task.id"
          class="ds-node"
          :class="{ 'in-todo': taskStore.isInTodoList(task.id) }"
          :style="{ '--pulse-delay': `${idx * 0.2}s`, '--node-color': getProjectColor(task.project || task.customer) }"
          draggable="true"
          @dragstart="onDragStart($event, task)"
          @dblclick="showDetail(task, $event)"
        >
          <div class="node-pulse"></div>
          <div class="node-bar"></div>
          <div class="node-content">
            <div class="node-header">
              <el-tag :type="getPriorityType(task.priority)" size="small" effect="dark">{{ getPriorityLabel(task.priority) }}</el-tag>
              <span class="node-id">{{ task.sourceId }}</span>
            </div>
            <div class="node-title">{{ task.title }}</div>
            <div class="node-meta">
              <span>{{ task.module || '-' }}</span>
              <span>{{ task.workHours || 0 }}h</span>
              <span :class="{ overdue: isOverdue(task) }">{{ formatDate(task.deadline) }}</span>
            </div>
          </div>
          <div class="node-actions" @click.stop>
            <span class="na" @click="$emit('config', task)">配置</span>
            <span class="na" @click="$emit('toggleTodo', task)">{{ taskStore.isInTodoList(task.id) ? 'AI待办' : '入待办' }}</span>
          </div>
        </div>
      </div>
      <div class="ds-portal">
        <TaskPortal variant="vortex" @drop="onPortalDrop" />
      </div>
    </div>
    <TaskDetailPopup :task="popupTask" :x="popupX" :y="popupY" @close="popupTask = null"
      @detail="navDetail" @config="navConfig" @toggleTodo="navTodo" @statusChange="navStatus" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
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

const router = useRouter()
const taskStore = useTaskStore()
const rainCanvas = ref<HTMLCanvasElement | null>(null)
let animId = 0

// Rain effect
onMounted(() => {
  const canvas = rainCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  function resize() {
    if (!canvas) return
    canvas.width = canvas.parentElement?.clientWidth || 800
    canvas.height = canvas.parentElement?.clientHeight || 600
  }
  resize()
  window.addEventListener('resize', resize)

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*'
  const fontSize = 12
  let columns: number[] = []

  function initColumns() {
    if (!canvas) return
    const colCount = Math.floor(canvas.width / fontSize)
    columns = Array(colCount).fill(0).map(() => Math.random() * -50)
  }
  initColumns()

  function draw() {
    if (!ctx || !canvas) return
    ctx.fillStyle = 'rgba(10,16,31,0.08)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(0,229,255,0.12)'
    ctx.font = `${fontSize}px monospace`

    for (let i = 0; i < columns.length; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)]
      ctx.fillText(char, i * fontSize, columns[i] * fontSize)
      if (columns[i] * fontSize > canvas.height && Math.random() > 0.975) {
        columns[i] = 0
      }
      columns[i] += 0.5
    }
    animId = requestAnimationFrame(draw)
  }
  draw()
})

onUnmounted(() => { cancelAnimationFrame(animId) })

// Popup
const popupTask = ref<Task | null>(null)
const popupX = ref(0)
const popupY = ref(0)
function showDetail(task: Task, e: MouseEvent) { popupTask.value = task; popupX.value = e.clientX + 20; popupY.value = e.clientY }

function onDragStart(e: DragEvent, task: Task) { e.dataTransfer?.setData('application/json', JSON.stringify(task)); e.dataTransfer!.effectAllowed = 'move' }
function onPortalDrop(task: Task) { emit('toggleTodo', task) }
function navDetail(task: Task) { popupTask.value = null; router.push(`/tasks/${task.id}`) }
function navConfig(task: Task) { popupTask.value = null; emit('config', task) }
function navTodo(task: Task) { popupTask.value = null; emit('toggleTodo', task) }
function navStatus(task: Task, status: string) { popupTask.value = null; emit('statusChange', task, status) }

function isOverdue(t: Task) { return t.status !== 'completed' && new Date(t.deadline).getTime() < Date.now() }
function formatDate(d: string) { return dayjs(d).format('MM-DD') }
function getPriorityType(p: string) { return ({ urgent: 'danger', high: 'warning', medium: 'info', low: 'success' } as Record<string,string>)[p] || 'info' }
function getPriorityLabel(p: string) { return ({ urgent: '紧急', high: '高', medium: '中', low: '低' } as Record<string,string>)[p] || p }
</script>

<style lang="scss" scoped>
.datastream-view { position: relative; min-height: 500px; overflow: hidden; }
.rain-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 0; opacity: 0.6;
}
.ds-layout { position: relative; z-index: 1; display: flex; gap: 20px; }
.ds-flow { flex: 1; display: flex; flex-direction: column; gap: 8px; max-height: 80vh; overflow-y: auto; }
.ds-portal { flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding-top: 40px; }

.ds-node {
  position: relative; display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 8px;
  background: rgba(10,16,31,0.6); border: 1px solid rgba(0,229,255,0.12);
  backdrop-filter: blur(6px); cursor: pointer; transition: all 0.25s;
  &:hover {
    border-color: rgba(0,229,255,0.35);
    box-shadow: 0 0 15px rgba(0,229,255,0.1);
    transform: translateX(4px);
  }
  &.in-todo { border-left: 3px solid #FF7D00; }
}
.node-pulse {
  position: absolute; left: -1px; top: 50%; width: 6px; height: 6px;
  border-radius: 50%; background: var(--node-color);
  transform: translateY(-50%);
  box-shadow: 0 0 6px var(--node-color);
  animation: nodePulse 2s ease-in-out infinite;
  animation-delay: var(--pulse-delay);
}
@keyframes nodePulse {
  0%, 100% { opacity: 0.4; box-shadow: 0 0 4px var(--node-color); }
  50% { opacity: 1; box-shadow: 0 0 12px var(--node-color); }
}
.node-bar {
  width: 3px; height: 30px; border-radius: 2px; flex-shrink: 0;
  background: linear-gradient(180deg, transparent, var(--node-color), transparent);
}
.node-content { flex: 1; min-width: 0; }
.node-header {
  display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
  .node-id { font-family: monospace; font-size: 10px; color: #8c8ca1; margin-left: auto; }
}
.node-title {
  font-size: 13px; font-weight: 600; color: #e0e0ef; line-height: 1.3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.node-meta {
  display: flex; gap: 8px; margin-top: 4px; font-size: 10px; color: #8c8ca1;
  .overdue { color: #f56c6c; }
}
.node-actions {
  display: flex; gap: 6px; flex-shrink: 0;
  .na {
    font-size: 10px; color: #00E5FF; cursor: pointer;
    padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(0,229,255,0.12);
    transition: all 0.2s;
    &:hover { background: rgba(0,229,255,0.1); }
  }
}
</style>
