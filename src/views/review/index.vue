<template>
  <div class="review-page">
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>

    <div class="content-layer">
      <div class="page-header">
        <h2 class="page-title">
          <span class="glow-text">人工审核中心</span>
        </h2>
        <p class="page-desc">AI 开发完成 · 等待人工确认</p>
      </div>

      <div v-if="reviewTasks.length === 0" class="empty-state">
        <div class="empty-ring">
          <svg viewBox="0 0 80 80" fill="none"><circle cx="40" cy="40" r="36" stroke="rgba(102,126,234,0.2)" stroke-width="2"/><path d="M28 42l8 8 16-16" stroke="#667eea" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p class="empty-text">暂无待审核任务</p>
        <p class="empty-hint">AI 完成开发后将自动进入此队列</p>
      </div>

      <TransitionGroup v-else name="card" tag="div" class="card-list">
        <div v-for="task in reviewTasks" :key="task.id" class="review-card">
          <div class="card-glow"></div>

          <div class="card-top">
            <span class="card-id">#{{ task.sourceId }}</span>
            <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
            <el-tag v-if="task.reworkCount > 0" type="danger" size="small" effect="dark">返工{{ task.reworkCount }}次</el-tag>
            <span class="card-project">{{ task.project || task.customer }}</span>
          </div>

          <h3 class="card-title">{{ task.title }}</h3>

          <p v-if="task.customDescription" class="card-desc">{{ task.customDescription }}</p>

          <div class="card-meta">
            <span class="meta-item">{{ task.module }}</span>
            <span class="meta-item">{{ formatDate(task.deadline) }}</span>
          </div>

          <div v-if="task.projectPath || task.gitBranch" class="card-config">
            <span v-if="task.projectPath">{{ task.projectPath }}</span>
            <span v-if="task.gitBranch">{{ task.gitBranch }}</span>
          </div>

          <div v-if="task.aiOutput" class="card-output">
            <span class="output-label">AI 产出：</span>
            <span>{{ task.aiOutput }}</span>
          </div>

          <div class="card-actions">
            <el-button type="primary" @click="goDetail(task)">查看详情</el-button>
            <el-button type="success" @click="handleApprove(task)">审核通过</el-button>
            <el-button type="danger" @click="openRejectDialog(task)">打回修改</el-button>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <!-- 打回原因弹窗 -->
    <el-dialog v-model="rejectDialogVisible" title="打回修改" width="500px" @close="resetRejectForm">
      <el-form :model="rejectForm" label-width="90px">
        <el-form-item label="任务">
          <span>{{ rejectTask?.title }}</span>
        </el-form-item>
        <el-form-item label="不通过原因" required>
          <el-input v-model="rejectForm.comment" type="textarea" :rows="4" placeholder="请填写不通过原因和修改建议..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="handleReject" :loading="rejecting" :disabled="!rejectForm.comment.trim()">确认打回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import type { Task } from '@/types'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import * as THREE from 'three'

const router = useRouter()
const taskStore = useTaskStore()
const bgCanvas = ref<HTMLCanvasElement | null>(null)

const reviewTasks = computed(() =>
  taskStore.tasks.filter(t => t.aiStatus === 'ai_review')
)

// Reject dialog
const rejectDialogVisible = ref(false)
const rejecting = ref(false)
const rejectTask = ref<Task | null>(null)
const rejectForm = reactive({ comment: '' })

function openRejectDialog(task: Task) {
  rejectTask.value = task
  rejectForm.comment = ''
  rejectDialogVisible.value = true
}

function resetRejectForm() {
  rejectForm.comment = ''
  rejectTask.value = null
}

const PRIORITY_UPGRADE: Record<string, string> = {
  low: 'medium',
  medium: 'high',
  high: 'urgent',
  urgent: 'urgent',
}

async function handleReject() {
  if (!rejectTask.value || !rejectForm.comment.trim()) return
  rejecting.value = true
  try {
    const task = rejectTask.value
    const newPriority = PRIORITY_UPGRADE[task.priority] || 'urgent'
    const newReworkCount = (task.reworkCount || 0) + 1
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    await taskStore.updateTask(task.id, {
      aiStatus: 'ai_rework',
      priority: newPriority,
      reworkCount: newReworkCount,
      reviewComment: rejectForm.comment.trim(),
      reviewTime: now,
      reviewResult: 'rejected',
    })
    taskStore.toggleTodo(task)
    ElMessage.success(`已打回返工（第${newReworkCount}次），优先级提升为${getPriorityLabel(newPriority)}`)
    rejectDialogVisible.value = false
  } catch {
    ElMessage.error('操作失败')
  } finally {
    rejecting.value = false
  }
}

async function handleApprove(task: Task) {
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
  await taskStore.updateTask(task.id, {
    aiStatus: 'ai_done',
    reviewResult: 'approved',
    reviewTime: now,
    completeTime: now,
  })
  ElMessage.success('审核通过，任务已完成')
}

// Three.js
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

  const count = 400
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const c1 = new THREE.Color('#00e5a0')
  const c2 = new THREE.Color('#ffd700')
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
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.6 })))

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
  scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x00e5a0, transparent: true, opacity: 0.06 })))

  const ringGeo = new THREE.RingGeometry(18, 18.2, 128)
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x00e5a0, transparent: true, opacity: 0.06, side: THREE.DoubleSide }))
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
  await taskStore.fetchTasks()
  await nextTick()
  initThree()
  window.addEventListener('resize', resize)
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', resize)
  renderer?.dispose()
})

function goDetail(task: Task) {
  router.push(`/tasks/${task.id}`)
}

function getPriorityType(p: string) {
  return ({ urgent: 'danger', high: 'warning', medium: 'info', low: 'success' } as Record<string, string>)[p] || 'info'
}

function getPriorityLabel(p: string) {
  return ({ urgent: '紧急', high: '高', medium: '中', low: '低' } as Record<string, string>)[p] || p
}

function formatDate(d: string) { return dayjs(d).format('MM-DD') }
</script>

<style lang="scss" scoped>
.review-page {
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
  background: linear-gradient(135deg, #00e5a0, #ffd700, #00e5a0);
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
}

.empty-ring {
  width: 80px;
  height: 80px;
  margin: 0 auto 20px;
  animation: pulse 3s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.08); opacity: 1; }
}

.empty-text { font-size: 16px; font-weight: 600; color: #c0c0d0; }
.empty-hint { margin-top: 8px; font-size: 12px; color: #606266; }

.card-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 760px;
  margin: 0 auto;
  padding-bottom: 40px;
}

.review-card {
  position: relative;
  background: rgba(10, 10, 30, 0.55);
  border: 1px solid rgba(0, 229, 160, 0.15);
  border-radius: 14px;
  backdrop-filter: blur(14px);
  padding: 20px 24px;
  overflow: hidden;
  transition: all 0.3s ease;

  &:hover {
    border-color: rgba(0, 229, 160, 0.4);
    box-shadow: 0 0 24px rgba(0, 229, 160, 0.1), 0 0 60px rgba(255, 215, 0, 0.04);
    transform: translateY(-2px);
  }
}

.card-glow {
  position: absolute;
  inset: -1px;
  border-radius: 14px;
  background: conic-gradient(from var(--angle, 0deg), transparent 70%, rgba(0, 229, 160, 0.35), rgba(255, 215, 0, 0.25), transparent 90%);
  animation: rotateGlow 6s linear infinite;
  z-index: -1;
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
}

.review-card:hover .card-glow { opacity: 1; }

@keyframes rotateGlow { to { --angle: 360deg; } }
@property --angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.card-id { color: #8c8ca1; font-size: 12px; font-weight: 600; }
.card-project { color: #00e5a0; font-size: 12px; margin-left: auto; }

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #e0e0ef;
  line-height: 1.5;
}

.card-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: #a0a0b8;
  line-height: 1.6;
}

.card-meta {
  display: flex;
  gap: 12px;
  margin-top: 10px;
  font-size: 12px;
  color: #8c8ca1;
}

.card-config {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  font-size: 11px;
  color: #ffd700;
  opacity: 0.8;
}

.card-output {
  margin-top: 8px;
  font-size: 12px;
  color: #a0a0b8;
  .output-label { color: #00e5a0; font-weight: 600; }
}

.card-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.card-enter-active { transition: all 0.4s ease; }
.card-leave-active { transition: all 0.3s ease; position: absolute; }
.card-enter-from { opacity: 0; transform: translateY(20px) scale(0.95); }
.card-leave-to { opacity: 0; transform: translateX(-30px); }
.card-move { transition: transform 0.35s ease; }
</style>
