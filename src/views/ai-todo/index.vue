<template>
  <div class="ai-todo-page">
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>

    <div class="content-layer">
      <div class="page-header">
        <h2 class="page-title">
          <span class="glow-text">AI 待办队列</span>
        </h2>
        <div class="page-header-bar">
          <p class="page-desc">QClaw 自动执行队列 · 拖拽排序调整优先级</p>
          <el-button v-if="ungroupedTasks.length >= 2" type="primary" size="small" @click="showGroupDialog = true">
            + 新建分组
          </el-button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="todoTasks.length === 0" class="empty-state">
        <div class="empty-icon">📋</div>
        <p>暂无 AI 待办任务</p>
        <p class="empty-hint">在任务列表中点击「入AI待办」添加任务到此处</p>
      </div>

      <!-- 分组卡片 -->
      <div v-for="group in taskStore.groups" :key="group.id" class="group-card">
        <div class="group-header" @click="toggleGroup(group.id)">
          <div class="group-left">
            <span class="group-arrow" :class="{ expanded: expandedGroups.has(group.id) }">▸</span>
            <span class="group-name">{{ group.name }}</span>
            <el-tag size="small" type="info">{{ getGroupTasks(group.id).length }} 个任务</el-tag>
          </div>
          <div class="group-right" @click.stop>
            <span v-if="group.projectPath" class="group-config">📁 {{ group.projectPath }}</span>
            <span v-if="group.gitBranch" class="group-config">🌿 {{ group.gitBranch }}</span>
            <el-button link type="primary" size="small" @click="editGroupSettings(group)">配置</el-button>
            <el-button link type="danger" size="small" @click="handleDeleteGroup(group)">解散</el-button>
          </div>
        </div>
        <Transition name="collapse">
          <div v-if="expandedGroups.has(group.id)" class="group-tasks">
            <div
              v-for="(task, idx) in getGroupTasks(group.id)"
              :key="task.id"
              class="sub-task"
              :class="{ dragging: dragFrom?.type === 'group' && dragFrom?.groupId === group.id && dragFrom?.index === idx }"
              draggable="true"
              @dragstart="onSubDragStart(group.id, idx, $event)"
              @dragover.prevent
              @drop="onSubDrop(group.id, idx)"
              @dragend="onDragEnd"
            >
              <span class="sub-rank">{{ idx + 1 }}</span>
              <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
              <span class="sub-title">{{ task.title }}</span>
              <span class="sub-meta">#{{ task.sourceId }} · {{ task.module }}</span>
              <div class="sub-actions" @click.stop>
                <el-button type="primary" link size="small" @click="$router.push(`/tasks/${task.id}`)">详情</el-button>
                <el-button type="success" link size="small" @click="handleComplete(task)">完成</el-button>
              </div>
            </div>
            <div v-if="getGroupTasks(group.id).length === 0" class="group-empty">
              拖入任务或解散此分组
            </div>
          </div>
        </Transition>
      </div>

      <!-- 未分组任务 -->
      <div v-if="ungroupedTasks.length > 0" class="card-grid">
        <div class="ungrouped-label" v-if="taskStore.groups.length > 0">未分组任务</div>
        <TransitionGroup name="card">
          <div
            v-for="(task, index) in ungroupedTasks"
            :key="task.id"
            class="todo-card"
            :class="{ dragging: dragFrom?.type === 'ungrouped' && dragFrom?.index === index, 'drop-target': dropTarget === index && !(dragFrom?.type === 'ungrouped' && dragFrom?.index === index) }"
            draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent="onDragOver(index)"
            @drop="onDrop(index)"
            @dragend="onDragEnd"
          >
            <div class="card-glow"></div>
            <div class="card-rank">{{ getUngroupedRank(index) }}</div>
            <div class="card-body">
              <div class="card-head">
                <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
                <el-tag :type="getStatusType(task.status)" size="small" effect="dark">{{ getStatusLabel(task.status) }}</el-tag>
                <el-tag v-if="task.reworkCount > 0" type="danger" size="small" effect="dark">返工{{ task.reworkCount }}次</el-tag>
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
              <el-button type="success" link size="small" @click="handleComplete(task)">完成</el-button>
              <el-button type="danger" link size="small" @click="handleRemove(task)">移出</el-button>
            </div>
          </div>
        </TransitionGroup>
      </div>

      <!-- 新建分组弹窗 -->
      <el-dialog v-model="showGroupDialog" title="新建分组" width="420px" :close-on-click-modal="false">
        <el-form label-width="80px">
          <el-form-item label="分组名称">
            <el-input v-model="newGroupName" placeholder="如：宁对接前端需求" />
          </el-form-item>
          <el-form-item label="选择任务">
            <el-checkbox-group v-model="newGroupTaskIds">
              <el-checkbox v-for="t in ungroupedTasks" :key="t.id" :value="t.id" :label="t.id" border size="small" style="margin:4px;">
                {{ t.title.substring(0, 20) }}{{ t.title.length > 20 ? '...' : '' }}
              </el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showGroupDialog = false">取消</el-button>
          <el-button type="primary" @click="handleCreateGroup" :disabled="!newGroupName.trim()">创建</el-button>
        </template>
      </el-dialog>

      <!-- 分组配置弹窗 -->
      <el-dialog v-model="showGroupEdit" :title="`分组配置 - ${editingGroup?.name || ''}`" width="420px" :close-on-click-modal="false">
        <el-form label-width="80px">
          <el-form-item label="分组名称">
            <el-input v-model="groupEditForm.name" />
          </el-form-item>
          <el-form-item label="项目路径">
            <el-input v-model="groupEditForm.projectPath" placeholder="F:\your-project" />
          </el-form-item>
          <el-form-item label="Git 分支">
            <el-input v-model="groupEditForm.gitBranch" placeholder="feature/xxx" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showGroupEdit = false">取消</el-button>
          <el-button type="primary" @click="handleSaveGroupEdit">保存</el-button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { useTaskStore } from '@/stores/task'
import { agentApi } from '@/api/agent'
import type { Task, TaskGroup } from '@/types'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as THREE from 'three'

const taskStore = useTaskStore()
const bgCanvas = ref<HTMLCanvasElement | null>(null)

// Drag state
const dragFrom = ref<{ type: 'ungrouped' | 'group'; index: number; groupId?: string } | null>(null)
const dropTarget = ref(-1)

// Group UI state
const expandedGroups = reactive(new Set<string>())
const showGroupDialog = ref(false)
const newGroupName = ref('')
const newGroupTaskIds = ref<string[]>([])
const showGroupEdit = ref(false)
const editingGroup = ref<TaskGroup | null>(null)
const groupEditForm = reactive({ name: '', projectPath: '', gitBranch: '' })

// Computed
const todoTasks = computed(() =>
  taskStore.todoList
    .map(id => taskStore.tasks.find(t => t.id === id))
    .filter((t): t is Task => !!t)
)

const ungroupedTasks = computed(() => todoTasks.value.filter(t => !t.groupId))

function getGroupTasks(groupId: string): Task[] {
  const group = taskStore.groups.find(g => g.id === groupId)
  if (!group) return []
  return group.taskIds
    .map(id => todoTasks.value.find(t => t.id === id))
    .filter((t): t is Task => !!t)
}

function getUngroupedRank(index: number): number {
  return taskStore.groups.reduce((sum, g) => sum + g.taskIds.length, 0) + index + 1
}

function toggleGroup(id: string) {
  if (expandedGroups.has(id)) expandedGroups.delete(id)
  else expandedGroups.add(id)
}

// Group CRUD
async function handleCreateGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  const ids = newGroupTaskIds.value.length > 0 ? newGroupTaskIds.value : undefined
  const group = await taskStore.createGroup(name, ids)
  expandedGroups.add(group.id)
  showGroupDialog.value = false
  newGroupName.value = ''
  newGroupTaskIds.value = []
  ElMessage.success('分组已创建')
}

function editGroupSettings(group: TaskGroup) {
  editingGroup.value = group
  groupEditForm.name = group.name
  groupEditForm.projectPath = group.projectPath
  groupEditForm.gitBranch = group.gitBranch
  showGroupEdit.value = true
}

async function handleSaveGroupEdit() {
  if (!editingGroup.value) return
  await taskStore.updateGroup(editingGroup.value.id, { ...groupEditForm })
  showGroupEdit.value = false
  ElMessage.success('分组配置已更新')
}

async function handleDeleteGroup(group: TaskGroup) {
  await ElMessageBox.confirm(`确定解散分组「${group.name}」？任务将回到未分组列表。`, '解散分组', { type: 'warning' })
  await taskStore.deleteGroup(group.id)
  expandedGroups.delete(group.id)
  ElMessage.success('分组已解散')
}

// Drag: ungrouped tasks
function onDragStart(index: number, e: DragEvent) {
  dragFrom.value = { type: 'ungrouped', index }
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragOver(index: number) { dropTarget.value = index }

function onDrop(index: number) {
  if (dropTarget.value < 0) return
  if (dragFrom.value?.type === 'ungrouped' && dragFrom.value.index !== index) {
    const ungrouped = ungroupedTasks.value
    const fromTask = ungrouped[dragFrom.value.index]
    const toTask = ungrouped[index]
    if (fromTask && toTask) {
      const fromIdx = taskStore.todoList.indexOf(fromTask.id)
      const toIdx = taskStore.todoList.indexOf(toTask.id)
      if (fromIdx !== -1 && toIdx !== -1) {
        const item = taskStore.todoList.splice(fromIdx, 1)[0]
        taskStore.todoList.splice(fromIdx < toIdx ? toIdx : toIdx, 0, item)
        saveOrder()
      }
    }
  }
  dragFrom.value = null
  dropTarget.value = -1
}

// Drag: sub-tasks within group
function onSubDragStart(groupId: string, index: number, e: DragEvent) {
  dragFrom.value = { type: 'group', index, groupId }
  e.dataTransfer!.effectAllowed = 'move'
}

function onSubDrop(groupId: string, index: number) {
  if (dragFrom.value?.type === 'group' && dragFrom.value.groupId === groupId && dragFrom.value.index !== index) {
    const group = taskStore.groups.find(g => g.id === groupId)
    if (group) {
      const item = group.taskIds.splice(dragFrom.value.index, 1)[0]
      group.taskIds.splice(index, 0, item)
      taskStore.updateGroup(groupId, { taskIds: group.taskIds })
    }
  }
  dragFrom.value = null
}

function onDragEnd() { dragFrom.value = null; dropTarget.value = -1 }

function saveOrder() {
  localStorage.setItem('linesequence-todo-list', JSON.stringify(taskStore.todoList))
  agentApi.saveTodoOrder(taskStore.todoList).catch(() => {})
}

function handleRemove(task: Task) {
  taskStore.toggleTodo(task)
  ElMessage.success('已移出 AI 待办')
}

async function handleComplete(task: Task) {
  await taskStore.updateTask(task.id, { aiStatus: 'ai_review' })
  taskStore.toggleTodo(task)
  ElMessage.success('已提交审核')
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
  scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x667eea, transparent: true, opacity: 0.08 })))

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
  await taskStore.fetchGroups()
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

.page-header-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 8px;
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

.page-desc { color: #8c8ca1; font-size: 13px; margin: 0; }

.empty-state {
  text-align: center;
  padding: 80px 0;
  color: #8c8ca1;
  .empty-icon { font-size: 48px; margin-bottom: 16px; }
  .empty-hint { margin-top: 8px; font-size: 12px; color: #606266; }
}

// ===== 分组卡片 =====
.group-card {
  max-width: 860px;
  margin: 0 auto 12px;
  background: rgba(10, 10, 30, 0.55);
  border: 1px solid rgba(102, 126, 234, 0.25);
  border-radius: 12px;
  backdrop-filter: blur(14px);
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s;
  &:hover { background: rgba(102, 126, 234, 0.08); }
}

.group-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-arrow {
  color: #667eea;
  font-size: 14px;
  transition: transform 0.2s;
  &.expanded { transform: rotate(90deg); }
}

.group-name {
  font-size: 15px;
  font-weight: 600;
  color: #e0e0ef;
}

.group-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-config {
  font-size: 11px;
  color: #667eea;
  opacity: 0.8;
}

.group-tasks {
  border-top: 1px solid rgba(102, 126, 234, 0.1);
}

.group-empty {
  padding: 16px;
  text-align: center;
  color: #8c8ca1;
  font-size: 13px;
}

.sub-task {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(102, 126, 234, 0.06);
  transition: background 0.2s;
  cursor: grab;
  &:last-child { border-bottom: none; }
  &:hover { background: rgba(102, 126, 234, 0.06); }
  &.dragging { opacity: 0.4; }
}

.sub-rank {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(102, 126, 234, 0.15);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #667eea;
  flex-shrink: 0;
}

.sub-title {
  flex: 1;
  font-size: 13px;
  color: #e0e0ef;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-meta {
  font-size: 11px;
  color: #8c8ca1;
  flex-shrink: 0;
}

.sub-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.collapse-enter-active, .collapse-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.collapse-enter-from, .collapse-leave-to {
  opacity: 0;
  max-height: 0;
}
.collapse-enter-to, .collapse-leave-from {
  max-height: 600px;
}

// ===== 未分组 =====
.ungrouped-label {
  font-size: 12px;
  color: #8c8ca1;
  padding: 8px 0 4px;
  border-bottom: 1px solid rgba(102, 126, 234, 0.1);
  margin-bottom: 12px;
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

  &.dragging { opacity: 0.45; transform: scale(0.97); }
  &.drop-target { border-color: rgba(0, 212, 255, 0.6); box-shadow: 0 0 16px rgba(0, 212, 255, 0.2); }
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

@keyframes rotateGlow { to { --angle: 360deg; } }

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
