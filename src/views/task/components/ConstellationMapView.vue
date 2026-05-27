<template>
  <div class="constellation-view" ref="containerRef">
    <!-- Task stars -->
    <div
      v-for="star in stars" :key="star.task.id"
      class="cstar"
      :class="{ 'in-todo': star.isTodo }"
      :style="star.style"
      draggable="true"
      @dragstart="onDragStart($event, star.task)"
      @click="showDetail(star.task, $event)"
    >
      <div class="star-dot" :style="star.dotStyle">
        <div class="star-glow" :style="star.glowStyle"></div>
      </div>
      <span class="star-name">{{ star.shortTitle }}</span>
    </div>

    <TaskPortal variant="wormhole" @drop="onPortalDrop" class="portal-area" />
    <TaskDetailPopup :task="popupTask" :x="popupX" :y="popupY" @close="popupTask = null"
      @detail="navDetail" @config="navConfig" @toggleTodo="navTodo" @statusChange="navStatus" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Task } from '@/types'
import { useTaskStore } from '@/stores/task'
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
const containerRef = ref<HTMLElement | null>(null)

const prioritySizes: Record<string, number> = { urgent: 22, high: 18, medium: 14, low: 10 }

interface StarData {
  task: Task; shortTitle: string; isTodo: boolean;
  style: Record<string, string>; dotStyle: Record<string, string>; glowStyle: Record<string, string>;
  x: number; y: number; color: string;
}

const stars = computed<StarData[]>(() => {
  const total = props.tasks.length || 1
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))

  // Distribute ALL tasks uniformly across the full area using sunflower pattern
  return props.tasks.map((task, idx) => {
    const color = getProjectColor(task.project || task.customer)
    const size = prioritySizes[task.priority] || 6
    // Sunflower spiral across full canvas
    const angle = idx * goldenAngle
    const dist = Math.sqrt((idx + 0.5) / total) * 42
    const x = Math.max(4, Math.min(88, 46 + Math.cos(angle) * dist))
    const y = Math.max(4, Math.min(86, 44 + Math.sin(angle) * dist))

    return {
      task, shortTitle: (task.title || '').slice(0, 6), isTodo: taskStore.isInTodoList(task.id),
      x, y, color,
      style: { left: `${x}%`, top: `${y}%` },
      dotStyle: {
        width: `${size}px`, height: `${size}px`,
        background: color, boxShadow: `0 0 ${size * 2}px ${color}88`,
      },
      glowStyle: { width: `${size * 2}px`, height: `${size * 2}px`, background: `${color}22` },
    }
  })
})

const lines = computed(() => {
  const result: { x1: number; y1: number; x2: number; y2: number; color: string }[] = []
  // Only connect stars of the SAME project, max 3 lines per project
  const groups: Record<string, StarData[]> = {}
  for (const s of stars.value) {
    const proj = s.task.project || s.task.customer || '_'
    if (!groups[proj]) groups[proj] = []
    groups[proj].push(s)
  }
  for (const group of Object.values(groups)) {
    if (group.length < 2) continue
    // Connect only sequential neighbors, limit to 4 lines per group
    const maxLines = Math.min(group.length - 1, 4)
    for (let i = 0; i < maxLines; i++) {
      result.push({
        x1: group[i].x, y1: group[i].y,
        x2: group[i + 1].x, y2: group[i + 1].y,
        color: group[i].color,
      })
    }
  }
  return result
})

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
</script>

<style lang="scss" scoped>
.constellation-view {
  position: relative; width: 100%; height: calc(100vh - 200px); min-height: 500px; overflow: hidden;
}
.constellation-lines {
  position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0;
}
.con-line {
  animation: dashFlow 3s linear infinite;
}
@keyframes dashFlow { to { stroke-dashoffset: -20; } }

.cstar {
  position: absolute; display: flex; flex-direction: column; align-items: center;
  cursor: pointer; z-index: 1; transform: translate(-50%, -50%);
  transition: transform 0.25s;
  &:hover { transform: translate(-50%, -50%) scale(1.3); }
  &:hover .star-name { opacity: 1; }
  &:hover .star-glow { transform: translate(-50%, -50%) scale(1.5); opacity: 1; }
}
.star-dot {
  border-radius: 50%; position: relative; z-index: 2; overflow: visible;
  animation: starTwinkle 4s ease-in-out infinite alternate;
}
@keyframes starTwinkle {
  0% { opacity: 0.5; transform: scale(0.85); }
  100% { opacity: 1; transform: scale(1.1); }
}
.star-glow {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  border-radius: 50%; z-index: 1; filter: blur(8px); opacity: 0.3;
  transition: all 0.3s;
  animation: glowBreath 4s ease-in-out infinite alternate;
}
@keyframes glowBreath {
  0% { opacity: 0.15; filter: blur(6px); }
  100% { opacity: 0.6; filter: blur(10px); }
}
.star-name {
  margin-top: 4px; font-size: 9px; color: rgba(232,240,255,0.5);
  white-space: nowrap; max-width: 60px; overflow: hidden; text-overflow: ellipsis;
  opacity: 0.4; transition: opacity 0.2s;
}
.in-todo .star-dot { box-shadow: 0 0 8px #FF7D0088, 0 0 16px #FF7D0044; }

.portal-area { position: absolute; right: 30px; bottom: 30px; z-index: 20; }
</style>
