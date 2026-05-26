<template>
  <div class="ai-todo-page">
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>

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
            <!-- 流光边框 -->
            <div class="card-glow"></div>
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
              <el-button type="primary" link size="small" @click="$router.push(`/tasks/${task.id}`)">详情</el-button>
              <el-button type="danger" link size="small" @click="handleRemove(task)">移出</el-button>
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

const dragIndex = ref(-1)

function onDragStart(index: number, e: DragEvent) {
  dragIndex.value = index
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragOver(index: number) {
  if (dragIndex.value === index) return
  const list = taskStore.todoList
  const item = list.splice(dragIndex.value, 1)[0]
  list.splice(index, 0, item)
  dragIndex.value = index
  saveOrder()
}

function onDragEnd() { dragIndex.value = -1 }

function saveOrder() {
  localStorage.setItem('linesequence-todo-list', JSON.stringify(taskStore.todoList))
}

const todoTasks = computed(() =>
  taskStore.todoList
    .map(id => taskStore.tasks.find(t => t.id === id))
    .filter((t): t is Task => !!t)
)

function handleRemove(task: Task) {
  taskStore.toggleTodo(task)
  ElMessage.success('已移出 AI 待办')
}

function isOverdue(task: Task) {
  return task.status !== 'completed' && new Date(task.deadline).getTime() < Date.now()
}

function formatDate(d: string) { return dayjs(d).format('MM-DD') }

function getPriorityType(p: string) {
  return ({ urgent: 'danger', high: 'warning', medium: 'info', low: 'success' } as Record<string, string>)[p] || 'info'
}
function getPriorityLabel(p: string) {
  return ({ urgent: '紧急', high: '高', medium: '中', low: '低' } as Record<string, string>)[p] || p
}
function getStatusType(s: string) {
  return ({ pending: 'info', in_progress: 'warning', self_test: 'primary', submitted: 'success', completed: 'success', rejected: 'danger' } as Record<string, string>)[s] || 'info'
}
function getStatusLabel(s: string) {
  return ({ pending: '待开发', in_progress: '开发中', self_test: '自测完成', submitted: '已提测', completed: '已完结', rejected: '已驳回' } as Record<string, string>)[s] || s
}

// --- Three.js ---
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animId = 0

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

  const count = 500
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const c1 = new THREE.Color('#667eea')
  const c2 = new THREE.Color('#00d4ff')

  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 60
    pos[i * 3 + 1] = (Math.random() - 0.5) * 40
    pos[i * 3 + 2] = (Math.random() - 0.5) * 30
    const c = c1.clone().lerp(c2, Math.random())
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.7 })))

  // 连线
  const lp: number[] = []
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const dx = pos[i*3]-pos[j*3], dy = pos[i*3+1]-pos[j*3+1], dz = pos[i*3+2]-pos[j*3+2]
      if (dx*dx + dy*dy + dz*dz < 36) {
        lp.push(pos[i*3], pos[i*3+1], pos[i*3+2], pos[j*3], pos[j*3+1], pos[j*3+2])
      }
    }
  }
  const lg = new THREE.BufferGeometry()
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3))
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x667eea, transparent: true, opacity: 0.08 }))
  scene.add(lines)

  // 外圈光环
  const ringGeo = new THREE.RingGeometry(18, 18.2, 128)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x667eea, transparent: true, opacity: 0.06, side: THREE.DoubleSide })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = Math.PI / 2.5
  scene.add(ring)

  const clock = new THREE.Clock()
  function animate() {
    animId = requestAnimationFrame(animate)
    const t = clock.getElapsedTime()
    scene!.children.forEach(c => { c.rotation.y = t * 0.03; c.rotation.x = t * 0.01 })
    ring.rotation.z = t * 0.15
    renderer!.render(scene!, camera!)
  }
  animate()
}

function resize() {
  if (!renderer || !camera || !bgCanvas.value) return
  const w = bgCanvas.value.clientWidth, h = bgCanvas.value.clientHeight
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

.page-title { margin: 0; font-size: 28px; font-weight: 700; }

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

.page-desc { margin-top: 6px; color: #8c8ca1; font-size: 13px; }

.empty-state {
  text-align: center;
  padding: 80px 0;
  color: #8c8ca1;
  .empty-icon { font-size: 48px; margin-bottom: 16px; }
  .empty-hint { margin-top: 8px; font-size: 12px; color: #606266; }
}

.card-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 860px;
  margin: 0 auto;
  padding-bottom: 40px;
}

.todo-card {
  position: relative;
  display: flex;
  align-items: stretch;
  background: rgba(10, 10, 30, 0.55);
  border: 1px solid rgba(102, 126, 234, 0.15);
  border-radius: 12px;
  backdrop-filter: blur(14px);
  transition: all 0.3s ease;
  cursor: grab;
  overflow: hidden;

  &:hover {
    background: rgba(20, 20, 50, 0.65);
    border-color: rgba(102, 126, 234, 0.4);
    box-shadow:
      0 0 20px rgba(102, 126, 234, 0.12),
      0 0 60px rgba(0, 212, 255, 0.06),
      inset 0 0 30px rgba(102, 126, 234, 0.04);
    transform: translateY(-2px);
  }

  &.dragging {
    opacity: 0.45;
    transform: scale(0.97);
  }
}

.card-glow {
  position: absolute;
  inset: -1px;
  border-radius: 12px;
  background: conic-gradient(from var(--angle, 0deg), transparent 70%, rgba(102, 126, 234, 0.4), rgba(0, 212, 255, 0.3), transparent 90%);
  animation: rotateGlow 6s linear infinite;
  z-index: -1;
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
}

.todo-card:hover .card-glow { opacity: 1; }

@keyframes rotateGlow {
  to { --angle: 360deg; }
}

@property --angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

.card-rank {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  flex-shrink: 0;
  font-size: 20px;
  font-weight: 800;
  background: linear-gradient(180deg, rgba(102, 126, 234, 0.18), rgba(0, 212, 255, 0.06));
  color: #667eea;
  border-right: 1px solid rgba(102, 126, 234, 0.1);
}

.card-body { flex: 1; padding: 14px 16px; min-width: 0; }

.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  .card-id { color: #8c8ca1; font-size: 12px; margin-left: auto; }
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
  .overdue { color: #f56c6c; font-weight: 600; }
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

.card-enter-active { transition: all 0.4s ease; }
.card-leave-active { transition: all 0.3s ease; position: absolute; }
.card-enter-from { opacity: 0; transform: translateY(20px) scale(0.95); }
.card-leave-to { opacity: 0; transform: translateX(-30px); }
.card-move { transition: transform 0.35s ease; }
</style>
