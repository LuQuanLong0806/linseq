<template>
  <div class="ai-todo-page">
    <!-- Three.js 背景 -->
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>

    <!-- 内容区 -->
    <div class="content-layer">
      <div class="page-header">
        <h2 class="page-title">
          <span class="glow-text">AI 待办队列</span>
        </h2>
        <p class="page-desc">QClaw 自动执行队列 · 拖拽排序调整优先级</p>
      </div>

      <!-- 空状态 -->
      <div v-if="todoTasks.length === 0" class="empty-state">
        <div class="empty-icon">📋</div>
        <p>暂无 AI 待办任务</p>
        <p class="empty-hint">在任务列表中点击「入AI待办」添加任务到此处</p>
      </div>

      <!-- 卡片列表 -->
      <div v-else class="card-grid">
        <TransitionGroup name="card">
          <div
            v-for="(task, index) in todoTasks"
            :key="task.id"
            class="todo-card"
            :class="{ dragging: dragIndex === index }"
            draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent="onDragOver(index)"
            @dragend="onDragEnd"
          >
            <div class="card-rank">{{ index + 1 }}</div>
            <div class="card-body">
              <div class="card-head">
                <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
                <el-tag :type="getStatusType(task.status)" size="small" effect="dark">{{ getStatusLabel(task.status) }}</el-tag>
                <span class="card-id">#{{ task.sourceId }}</span>
              </div>
              <h3 class="card-title">{{ task.title }}</h3>
              <div class="card-meta">
                <span v-if="task.project || task.customer">{{ task.project || task.customer }}</span>
                <span v-if="task.module">{{ task.module }}</span>
                <span :class="{ overdue: isOverdue(task) }">截止 {{ formatDate(task.deadline) }}</span>
              </div>
              <div v-if="task.projectPath || task.gitBranch" class="card-config">
                <span v-if="task.projectPath" class="config-item">📁 {{ task.projectPath }}</span>
                <span v-if="task.gitBranch" class="config-item">🌿 {{ task.gitBranch }}</span>
              </div>
            </div>
            <div class="card-actions">
              <el-button type="primary" link size="small" @click="$router.push(`/tasks/${task.id}`)">
                详情
              </el-button>
              <el-button type="danger" link size="small" @click="handleRemove(task)">
                移出
              </el-button>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useTaskStore } from '@/stores/task'
import type { Task } from '@/types'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import * as THREE from 'three'

const taskStore = useTaskStore()
const bgCanvas = ref<HTMLCanvasElement | null>(null)

// --- 拖拽排序 ---
const dragIndex = ref(-1)
const dragOverIndex = ref(-1)

function onDragStart(index: number, e: DragEvent) {
  dragIndex.value = index
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragOver(index: number) {
  if (dragIndex.value === index) return
  dragOverIndex.value = index
  const list = taskStore.todoList
  const from = dragIndex.value
  const to = index
  const item = list.splice(from, 1)[0]
  list.splice(to, 0, item)
  dragIndex.value = to
  saveOrder()
}

function onDragEnd() {
  dragIndex.value = -1
  dragOverIndex.value = -1
}

function saveOrder() {
  localStorage.setItem('linesequence-todo-list', JSON.stringify(taskStore.todoList))
}

// --- 数据 ---
const todoTasks = computed(() => {
  return taskStore.todoList
    .map(id => taskStore.tasks.find(t => t.id === id))
    .filter((t): t is Task => !!t)
})

function handleRemove(task: Task) {
  taskStore.toggleTodo(task)
  ElMessage.success('已移出 AI 待办')
}

function isOverdue(task: Task) {
  return task.status !== 'completed' && new Date(task.deadline).getTime() < Date.now()
}

function formatDate(d: string) {
  return dayjs(d).format('MM-DD')
}

function getPriorityType(p: string) {
  const m: Record<string, string> = { urgent: 'danger', high: 'warning', medium: 'info', low: 'success' }
  return m[p] || 'info'
}
function getPriorityLabel(p: string) {
  const m: Record<string, string> = { urgent: '紧急', high: '高', medium: '中', low: '低' }
  return m[p] || p
}
function getStatusType(s: string) {
  const m: Record<string, string> = { pending: 'info', in_progress: 'warning', self_test: 'primary', submitted: 'success', completed: 'success', rejected: 'danger' }
  return m[s] || 'info'
}
function getStatusLabel(s: string) {
  const m: Record<string, string> = { pending: '待开发', in_progress: '开发中', self_test: '自测完成', submitted: '已提测', completed: '已完结', rejected: '已驳回' }
  return m[s] || s
}

// --- Three.js 粒子网格背景 ---
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animId = 0
let points: THREE.Points | null = null
let lineSegments: THREE.LineSegments | null = null

function initThree() {
  if (!bgCanvas.value) return
  const canvas = bgCanvas.value

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000)
  camera.position.z = 30

  resize()

  // 粒子
  const count = 600
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const c1 = new THREE.Color('#667eea')
  const c2 = new THREE.Color('#00d4ff')

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 60
    positions[i * 3 + 1] = (Math.random() - 0.5) * 40
    positions[i * 3 + 2] = (Math.random() - 0.5) * 30
    const c = c1.clone().lerp(c2, Math.random())
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.7 })
  points = new THREE.Points(geo, mat)
  scene.add(points)

  // 连线
  buildLines(positions, count)

  animate()
}

function buildLines(positions: Float32Array, count: number) {
  if (!scene) return
  if (lineSegments) scene.remove(lineSegments)

  const linePos: number[] = []
  const threshold = 6
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const dx = positions[i * 3] - positions[j * 3]
      const dy = positions[i * 3 + 1] - positions[j * 3 + 1]
      const dz = positions[i * 3 + 2] - positions[j * 3 + 2]
      if (dx * dx + dy * dy + dz * dz < threshold * threshold) {
        linePos.push(
          positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
          positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]
        )
      }
    }
  }

  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3))
  const lineMat = new THREE.LineBasicMaterial({ color: 0x667eea, transparent: true, opacity: 0.08 })
  lineSegments = new THREE.LineSegments(lineGeo, lineMat)
  scene.add(lineSegments)
}

function animate() {
  animId = requestAnimationFrame(animate)
  if (points) {
    points.rotation.y += 0.0005
    points.rotation.x += 0.0002
  }
  if (lineSegments) {
    lineSegments.rotation.y += 0.0005
    lineSegments.rotation.x += 0.0002
  }
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

function resize() {
  if (!renderer || !camera || !bgCanvas.value) return
  const w = bgCanvas.value.clientWidth
  const h = bgCanvas.value.clientHeight
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

onMounted(async () => {
  await nextTick()
  initThree()
  window.addEventListener('resize', resize)
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', resize)
  renderer?.dispose()
})
</script>

<style lang="scss" scoped>
.ai-todo-page {
  position: relative;
  min-height: calc(100vh - 96px);
  overflow: hidden;
}

.bg-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.content-layer {
  position: relative;
  z-index: 1;
  padding: 0 8px;
}

.page-header {
  text-align: center;
  padding: 24px 0 16px;
}

.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
}

.glow-text {
  background: linear-gradient(135deg, #667eea, #00d4ff, #764ba2);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: gradientShift 4s ease infinite;
}

@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.page-desc {
  margin-top: 6px;
  color: #8c8ca1;
  font-size: 13px;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 80px 0;
  color: #8c8ca1;

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
  .empty-hint {
    margin-top: 8px;
    font-size: 12px;
    color: #606266;
  }
}

/* 卡片网格 */
.card-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 860px;
  margin: 0 auto;
  padding-bottom: 40px;
}

/* 卡片 */
.todo-card {
  display: flex;
  align-items: stretch;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(102, 126, 234, 0.15);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  transition: all 0.3s ease;
  cursor: grab;
  overflow: hidden;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(102, 126, 234, 0.35);
    box-shadow: 0 4px 24px rgba(102, 126, 234, 0.15);
    transform: translateY(-2px);
  }

  &.dragging {
    opacity: 0.5;
    transform: scale(0.97);
  }
}

.card-rank {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  flex-shrink: 0;
  font-size: 20px;
  font-weight: 800;
  background: linear-gradient(180deg, rgba(102, 126, 234, 0.15), rgba(0, 212, 255, 0.08));
  color: #667eea;
  border-right: 1px solid rgba(102, 126, 234, 0.1);
}

.card-body {
  flex: 1;
  padding: 14px 16px;
  min-width: 0;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;

  .card-id {
    color: #8c8ca1;
    font-size: 12px;
    margin-left: auto;
  }
}

.card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #e0e0ef;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: #8c8ca1;

  .overdue {
    color: #f56c6c;
    font-weight: 600;
  }
}

.card-config {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  font-size: 11px;
  color: #667eea;
  opacity: 0.8;

  .config-item {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.card-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 0 12px;
}

/* TransitionGroup 动画 */
.card-enter-active {
  transition: all 0.4s ease;
}
.card-leave-active {
  transition: all 0.3s ease;
  position: absolute;
}
.card-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
.card-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}
.card-move {
  transition: transform 0.35s ease;
}
</style>
