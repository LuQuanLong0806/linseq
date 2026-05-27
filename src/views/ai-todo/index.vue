<template>
  <div class="ai-todo-page">
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>

    <div class="content-layer">
      <!-- 顶部统计条 -->
      <div class="stats-bar">
        <div class="stat-item todo-stat">
          <div class="stat-pulse"></div>
          <span class="stat-num">{{ todoQueueTasks.length }}</span>
          <span class="stat-label">待开发</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item dev-stat">
          <div class="stat-pulse dev-pulse"></div>
          <span class="stat-num">{{ devQueueTasks.length }}</span>
          <span class="stat-label">开发中</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num">{{ taskStore.groups.length }}</span>
          <span class="stat-label">分组</span>
        </div>
      </div>

      <div class="page-header">
        <h2 class="page-title">
          <span class="glow-text">AI 任务调度中心</span>
        </h2>
        <div class="page-header-bar">
          <p class="page-desc">QClaw 自动执行引擎 · 双队列调度</p>
          <div class="header-actions">
            <el-button type="success" size="small" @click="openPublishDialog">发布任务</el-button>
            <el-button v-if="ungroupedTodoTasks.length >= 2" type="primary" size="small" @click="showGroupDialog = true">+ 新建分组</el-button>
          </div>
        </div>
      </div>

      <!-- 双面板布局 -->
      <div class="dual-panel">
        <!-- 左面板：待办队列 -->
        <div class="panel todo-panel">
          <div class="panel-header">
            <div class="panel-icon todo-icon">
              <div class="icon-ring"></div>
              <span class="icon-dot"></span>
            </div>
            <h3 class="panel-title">待办队列</h3>
            <el-tag size="small" effect="dark" type="info" round>{{ todoQueueTasks.length }}</el-tag>
          </div>

          <div v-if="todoQueueTasks.length === 0" class="panel-empty">
            <div class="empty-pulse"></div>
            <p>队列为空</p>
          </div>

          <!-- 分组卡片 -->
          <div v-for="group in taskStore.groups" :key="group.id" class="group-card">
            <div class="group-header" @click="toggleGroup(group.id)">
              <div class="group-left">
                <span class="group-arrow" :class="{ expanded: expandedGroups.has(group.id) }">▸</span>
                <span class="group-name">{{ group.name }}</span>
                <el-tag size="small" type="info">{{ getGroupTasks(group.id).length }}</el-tag>
              </div>
              <div class="group-right" @click.stop>
                <span v-if="group.projectPath" class="group-config">📁 {{ group.projectPath }}</span>
                <el-button link type="primary" size="small" @click="editGroupSettings(group)">配置</el-button>
                <el-button link type="danger" size="small" @click="handleDeleteGroup(group)">解散</el-button>
              </div>
            </div>
            <Transition name="collapse">
              <div v-if="expandedGroups.has(group.id)" class="group-tasks">
                <div v-for="(task, idx) in getGroupTasks(group.id)" :key="task.id" class="sub-task"
                  draggable="true" @dragstart="onSubDragStart(group.id, idx, $event)" @dragover.prevent @drop="onSubDrop(group.id, idx)" @dragend="onDragEnd">
                  <span class="sub-rank">{{ idx + 1 }}</span>
                  <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
                  <span class="sub-title">{{ task.title }}</span>
                  <div class="sub-actions" @click.stop>
                    <el-button type="primary" link size="small" @click="$router.push(`/tasks/${task.id}`)">详情</el-button>
                    <el-button type="success" link size="small" @click="handleComplete(task)">完成</el-button>
                  </div>
                </div>
                <div v-if="getGroupTasks(group.id).length === 0" class="group-empty">拖入任务或解散此分组</div>
              </div>
            </Transition>
          </div>

          <!-- 未分组待办任务 -->
          <TransitionGroup v-if="ungroupedTodoTasks.length > 0" name="card" tag="div" class="card-list">
            <div v-for="(task, index) in ungroupedTodoTasks" :key="task.id"
              class="todo-card"
              :class="{ dragging: dragFrom?.type === 'ungrouped' && dragFrom?.index === index }"
              draggable="true"
              @dragstart="onDragStart(index, $event)" @dragover.prevent="onDragOver(index)" @drop="onDrop(index)" @dragend="onDragEnd">
              <div class="card-glow"></div>
              <div class="card-rank">{{ index + 1 }}</div>
              <div class="card-body">
                <div class="card-head">
                  <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
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

        <!-- 右面板：开发中 -->
        <div class="panel dev-panel">
          <div class="panel-header">
            <div class="panel-icon dev-icon">
              <div class="icon-ring dev-ring"></div>
              <span class="icon-dot dev-dot"></span>
            </div>
            <h3 class="panel-title dev-title">开发引擎</h3>
            <el-tag size="small" effect="dark" type="warning" round>{{ devQueueTasks.length }}</el-tag>
            <div v-if="devQueueTasks.length > 0" class="engine-indicator">
              <span class="engine-pulse"></span>
              <span class="engine-text">RUNNING</span>
            </div>
          </div>

          <div v-if="devQueueTasks.length === 0" class="panel-empty dev-empty">
            <div class="empty-engine"></div>
            <p>引擎待命</p>
          </div>

          <TransitionGroup v-else name="card" tag="div" class="card-list">
            <div v-for="task in devQueueTasks" :key="task.id" class="dev-card">
              <div class="dev-card-glow"></div>
              <div class="dev-status-bar">
                <div class="dev-progress"></div>
              </div>
              <div class="card-body">
                <div class="card-head">
                  <el-tag type="warning" size="small" effect="dark">开发中</el-tag>
                  <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
                  <el-tag v-if="task.reworkCount > 0" type="danger" size="small" effect="dark">返工{{ task.reworkCount }}次</el-tag>
                  <span class="card-id">#{{ task.sourceId }}</span>
                </div>
                <h3 class="card-title">{{ task.title }}</h3>
                <div class="card-meta">
                  <span v-if="task.project || task.customer">{{ task.project || task.customer }}</span>
                  <span v-if="task.module">{{ task.module }}</span>
                </div>
                <div v-if="task.projectPath || task.gitBranch" class="card-config">
                  <span v-if="task.projectPath" class="config-item">📁 {{ task.projectPath }}</span>
                  <span v-if="task.gitBranch" class="config-item">🌿 {{ task.gitBranch }}</span>
                </div>
              </div>
              <div class="card-actions">
                <el-button type="primary" link size="small" @click="$router.push(`/tasks/${task.id}`)">详情</el-button>
              </div>
            </div>
          </TransitionGroup>
        </div>
      </div>

      <!-- 弹窗部分（分组、配置、发布 - 保持原有逻辑） -->
      <el-dialog v-model="showGroupDialog" title="新建分组" width="420px" :close-on-click-modal="false">
        <el-form label-width="80px">
          <el-form-item label="分组名称">
            <el-input v-model="newGroupName" placeholder="如：宁对接前端需求" />
          </el-form-item>
          <el-form-item label="选择任务">
            <el-checkbox-group v-model="newGroupTaskIds">
              <el-checkbox v-for="t in ungroupedTodoTasks" :key="t.id" :value="t.id" :label="t.id" border size="small" style="margin:4px;">
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

      <el-dialog v-model="showGroupEdit" :title="`分组配置 - ${editingGroup?.name || ''}`" width="420px" :close-on-click-modal="false">
        <el-form label-width="80px">
          <el-form-item label="分组名称"><el-input v-model="groupEditForm.name" /></el-form-item>
          <el-form-item label="项目路径"><el-input v-model="groupEditForm.projectPath" placeholder="F:\your-project" /></el-form-item>
          <el-form-item label="Git 分支"><el-input v-model="groupEditForm.gitBranch" placeholder="feature/xxx" /></el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showGroupEdit = false">取消</el-button>
          <el-button type="primary" @click="handleSaveGroupEdit">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="showPublishDialog" title="发布任务到 AI 待办" width="620px" :close-on-click-modal="false" destroy-on-close>
        <el-radio-group v-model="publishMode" style="margin-bottom:16px">
          <el-radio-button value="new">新建任务</el-radio-button>
          <el-radio-button value="existing">关联已有任务</el-radio-button>
        </el-radio-group>
        <el-form v-if="publishMode === 'new'" label-width="100px" label-position="right">
          <el-form-item label="任务标题" required><el-input v-model="publishForm.title" placeholder="描述要完成的工作" /></el-form-item>
          <el-form-item label="项目配置">
            <el-select v-model="publishForm.projectName" placeholder="选择项目" clearable filterable style="width:100%" @change="handlePublishProjectSelect">
              <el-option v-for="p in projectConfigs" :key="p.id" :label="p.name" :value="p.name">
                <span>{{ p.name }}</span>
                <span style="float:right;color:#909399;font-size:12px">{{ p.localPath || '未配置路径' }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="本地路径"><el-input v-model="publishForm.projectPath" placeholder="F:\your-project" /></el-form-item>
          <el-form-item label="Git 分支">
            <el-select v-model="publishForm.gitBranch" placeholder="选择或输入分支" clearable filterable allow-create style="width:100%">
              <el-option v-for="b in publishBranches" :key="b" :label="b" :value="b" />
            </el-select>
          </el-form-item>
          <el-form-item label="自定义描述"><el-input v-model="publishForm.customDescription" type="textarea" :rows="3" placeholder="详细说明要做什么" /></el-form-item>
          <el-form-item label="验收标准"><el-input v-model="publishForm.acceptanceCriteria" type="textarea" :rows="2" placeholder="可选" /></el-form-item>
          <el-row :gutter="16">
            <el-col :span="12"><el-form-item label="优先级">
              <el-select v-model="publishForm.priority" style="width:100%">
                <el-option label="紧急" value="urgent" /><el-option label="高" value="high" /><el-option label="中" value="medium" /><el-option label="低" value="low" />
              </el-select>
            </el-form-item></el-col>
            <el-col :span="12"><el-form-item label="所属项目"><el-input v-model="publishForm.project" placeholder="可选" /></el-form-item></el-col>
          </el-row>
        </el-form>
        <el-form v-else label-width="100px" label-position="right">
          <el-form-item label="选择任务" required>
            <el-select v-model="publishForm.existingTaskId" placeholder="搜索任务标题或单号" filterable remote :remote-method="searchExistingTasks" :loading="searchingTasks" style="width:100%" value-key="id">
              <el-option v-for="t in searchedTasks" :key="t.id" :label="`${t.sourceId} - ${t.title}`" :value="t.id" />
            </el-select>
          </el-form-item>
          <div v-if="selectedExistingTask" class="existing-task-info">
            <el-descriptions :column="2" size="small" border>
              <el-descriptions-item label="标题">{{ selectedExistingTask.title }}</el-descriptions-item>
              <el-descriptions-item label="项目">{{ selectedExistingTask.project || '-' }}</el-descriptions-item>
            </el-descriptions>
          </div>
          <el-form-item label="补充描述"><el-input v-model="publishForm.customDescription" type="textarea" :rows="3" placeholder="补充说明这次要做什么" /></el-form-item>
          <el-form-item label="项目配置">
            <el-select v-model="publishForm.projectName" placeholder="选择项目" clearable filterable style="width:100%" @change="handlePublishProjectSelect">
              <el-option v-for="p in projectConfigs" :key="p.id" :label="p.name" :value="p.name" />
            </el-select>
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="12"><el-form-item label="本地路径"><el-input v-model="publishForm.projectPath" placeholder="F:\your-project" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="Git 分支"><el-input v-model="publishForm.gitBranch" placeholder="feature/xxx" /></el-form-item></el-col>
          </el-row>
        </el-form>
        <template #footer>
          <el-button @click="showPublishDialog = false">取消</el-button>
          <el-button type="primary" @click="handlePublish" :loading="publishing" :disabled="!canPublish">发布到 AI 待办</el-button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { useTaskStore } from '@/stores/task'
import { agentApi } from '@/api/agent'
import { projectApi, type ProjectConfig } from '@/api/project'
import { taskApi } from '@/api/task'
import type { Task, TaskGroup } from '@/types'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as THREE from 'three'

const taskStore = useTaskStore()
const bgCanvas = ref<HTMLCanvasElement | null>(null)

// Drag state
const dragFrom = ref<{ type: 'ungrouped' | 'group'; index: number; groupId?: string } | null>(null)

// Group UI
const expandedGroups = reactive(new Set<string>())
const showGroupDialog = ref(false)
const newGroupName = ref('')
const newGroupTaskIds = ref<string[]>([])
const showGroupEdit = ref(false)
const editingGroup = ref<TaskGroup | null>(null)
const groupEditForm = reactive({ name: '', projectPath: '', gitBranch: '' })

// Publish dialog
const showPublishDialog = ref(false)
const publishing = ref(false)
const publishMode = ref<'new' | 'existing'>('new')
const projectConfigs = ref<ProjectConfig[]>([])
const publishBranches = ref<string[]>([])
const searchingTasks = ref(false)
const searchedTasks = ref<Task[]>([])
const publishForm = reactive({
  title: '', projectName: '', projectPath: '', gitBranch: '',
  customDescription: '', acceptanceCriteria: '', priority: 'medium' as string,
  project: '', existingTaskId: '',
})

const selectedExistingTask = computed(() => {
  if (!publishForm.existingTaskId) return null
  return taskStore.tasks.find(t => t.id === publishForm.existingTaskId) || null
})

const canPublish = computed(() => {
  if (publishMode.value === 'new') return !!publishForm.title.trim()
  return !!publishForm.existingTaskId
})

function openPublishDialog() {
  publishMode.value = 'new'
  Object.assign(publishForm, { title: '', projectName: '', projectPath: '', gitBranch: '', customDescription: '', acceptanceCriteria: '', priority: 'medium', project: '', existingTaskId: '' })
  searchedTasks.value = []
  publishBranches.value = []
  projectApi.list().then(res => { projectConfigs.value = res.data }).catch(() => {})
  showPublishDialog.value = true
}

function handlePublishProjectSelect(name: string) {
  const config = projectConfigs.value.find(p => p.name === name)
  if (config) {
    if (config.localPath) publishForm.projectPath = config.localPath
    if (config.defaultBranch) publishForm.gitBranch = config.defaultBranch
    publishBranches.value = [...config.branches]
  } else { publishBranches.value = [] }
}

async function searchExistingTasks(query: string) {
  if (!query) { searchedTasks.value = []; return }
  searchingTasks.value = true
  try {
    const res = await taskApi.getTasks({ keyword: query, pageSize: 20 })
    searchedTasks.value = res.data.list
  } catch { searchedTasks.value = [] }
  finally { searchingTasks.value = false }
}

async function handlePublish() {
  publishing.value = true
  try {
    if (publishMode.value === 'new') {
      await taskStore.createAndAddTodo({
        title: publishForm.title, customDescription: publishForm.customDescription,
        acceptanceCriteria: publishForm.acceptanceCriteria, projectPath: publishForm.projectPath,
        gitBranch: publishForm.gitBranch, priority: publishForm.priority as any, project: publishForm.project,
      })
      ElMessage.success('任务已创建并加入 AI 待办')
    } else {
      await taskStore.republishToTodo(publishForm.existingTaskId, {
        customDescription: publishForm.customDescription, projectPath: publishForm.projectPath, gitBranch: publishForm.gitBranch,
      })
      ElMessage.success('任务已重新发布到 AI 待办')
    }
    showPublishDialog.value = false
  } catch (err: any) { ElMessage.error(err?.message || '发布失败') }
  finally { publishing.value = false }
}

// Computed: 双队列
const todoTasks = computed(() =>
  taskStore.todoList.map(id => taskStore.tasks.find(t => t.id === id)).filter((t): t is Task => !!t)
)

const todoQueueTasks = computed(() => todoTasks.value.filter(t => t.aiStatus !== 'ai_dev'))
const devQueueTasks = computed(() => todoTasks.value.filter(t => t.aiStatus === 'ai_dev'))

const ungroupedTodoTasks = computed(() => todoQueueTasks.value.filter(t => !t.groupId))

function getGroupTasks(groupId: string): Task[] {
  const group = taskStore.groups.find(g => g.id === groupId)
  if (!group) return []
  return group.taskIds.map(id => todoQueueTasks.value.find(t => t.id === id)).filter((t): t is Task => !!t)
}

function toggleGroup(id: string) {
  if (expandedGroups.has(id)) expandedGroups.delete(id)
  else expandedGroups.add(id)
}

// Group CRUD
async function handleCreateGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  const group = await taskStore.createGroup(name, newGroupTaskIds.value.length > 0 ? newGroupTaskIds.value : undefined)
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
  await ElMessageBox.confirm(`确定解散分组「${group.name}」？`, '解散分组', { type: 'warning' })
  await taskStore.deleteGroup(group.id)
  expandedGroups.delete(group.id)
  ElMessage.success('分组已解散')
}

// Drag
function onDragStart(index: number, e: DragEvent) { dragFrom.value = { type: 'ungrouped', index }; e.dataTransfer!.effectAllowed = 'move' }
function onDragOver(_index: number) { /* unused */ }
function onDrop(index: number) {
  if (dragFrom.value?.type === 'ungrouped' && dragFrom.value.index !== index) {
    const ungrouped = ungroupedTodoTasks.value
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
}

function onSubDragStart(groupId: string, index: number, e: DragEvent) { dragFrom.value = { type: 'group', index, groupId }; e.dataTransfer!.effectAllowed = 'move' }
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

function onDragEnd() { dragFrom.value = null }

function saveOrder() {
  localStorage.setItem('linesequence-todo-list', JSON.stringify(taskStore.todoList))
  agentApi.saveTodoOrder(taskStore.todoList).catch(() => {})
}

function handleRemove(task: Task) { taskStore.toggleTodo(task); ElMessage.success('已移出 AI 待办') }
async function handleComplete(task: Task) { await taskStore.updateTask(task.id, { aiStatus: 'ai_review' }); taskStore.toggleTodo(task); ElMessage.success('已提交审核') }
function isOverdue(task: Task) { return task.status !== 'completed' && new Date(task.deadline).getTime() < Date.now() }
function formatDate(d: string) { return dayjs(d).format('MM-DD') }
function getPriorityType(p: string) { return ({ urgent: 'danger', high: 'warning', medium: 'info', low: 'success' } as Record<string, string>)[p] || 'info' }
function getPriorityLabel(p: string) { return ({ urgent: '紧急', high: '高', medium: '中', low: '低' } as Record<string, string>)[p] || p }

// --- Three.js Enhanced Engine ---
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
  camera.position.z = 40
  resize()

  // Particle field
  const count = 600
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const vel = new Float32Array(count * 3)
  const c1 = new THREE.Color('#667eea')
  const c2 = new THREE.Color('#00d4ff')
  const c3 = new THREE.Color('#ff6b6b')
  for (let i = 0; i < count; i++) {
    pos[i*3] = (Math.random()-0.5)*80
    pos[i*3+1] = (Math.random()-0.5)*50
    pos[i*3+2] = (Math.random()-0.5)*40
    vel[i*3] = (Math.random()-0.5)*0.02
    vel[i*3+1] = (Math.random()-0.5)*0.02
    vel[i*3+2] = (Math.random()-0.5)*0.01
    const t = Math.random()
    const c = t < 0.5 ? c1.clone().lerp(c2, t*2) : c2.clone().lerp(c3, (t-0.5)*2)
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.6 })))

  // Connection lines
  const lp: number[] = []
  for (let i = 0; i < count; i++) {
    for (let j = i+1; j < count; j++) {
      const dx=pos[i*3]-pos[j*3], dy=pos[i*3+1]-pos[j*3+1], dz=pos[i*3+2]-pos[j*3+2]
      if (dx*dx+dy*dy+dz*dz < 25) { lp.push(pos[i*3],pos[i*3+1],pos[i*3+2],pos[j*3],pos[j*3+1],pos[j*3+2]) }
    }
  }
  const lg = new THREE.BufferGeometry()
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3))
  scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x667eea, transparent: true, opacity: 0.04 })))

  // Double helix rings
  for (let r = 0; r < 3; r++) {
    const ringGeo = new THREE.TorusGeometry(12 + r*8, 0.06, 8, 128)
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: r===0?0x667eea:r===1?0x00d4ff:0xff6b6b, transparent: true, opacity: 0.05 }))
    ring.rotation.x = Math.PI/2 + r*0.3
    ring.rotation.y = r*0.5
    scene.add(ring)
  }

  // Animate with particle movement
  const clock = new THREE.Clock()
  function animate() {
    animId = requestAnimationFrame(animate)
    const t = clock.getElapsedTime()
    // Move particles
    const pAttr = geo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < count; i++) {
      pAttr.array[i*3] += vel[i*3] + Math.sin(t+i)*0.002
      pAttr.array[i*3+1] += vel[i*3+1] + Math.cos(t+i*0.7)*0.002
      pAttr.array[i*3+2] += vel[i*3+2]
      // Bounce
      for (let a = 0; a < 3; a++) {
        const bound = a===0?40:a===1?25:20
        if (Math.abs(pAttr.array[i*3+a]) > bound) vel[i*3+a] *= -1
      }
    }
    pAttr.needsUpdate = true

    scene!.children.forEach((c, idx) => {
      c.rotation.y = t * 0.02 * (idx%2===0?1:-1)
      c.rotation.x = t * 0.01
    })
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
.ai-todo-page { position: relative; min-height: calc(100vh - 96px); overflow: hidden; }
.bg-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.content-layer { position: relative; z-index: 1; padding: 0 12px; }

// Stats bar
.stats-bar {
  display: flex; align-items: center; justify-content: center; gap: 24px;
  padding: 16px 0 8px;
}
.stat-item {
  display: flex; align-items: center; gap: 8px;
  position: relative;
}
.stat-pulse {
  width: 8px; height: 8px; border-radius: 50%; background: #667eea;
  box-shadow: 0 0 8px #667eea; animation: pulse 2s ease-in-out infinite;
  &.dev-pulse { background: #ff6b6b; box-shadow: 0 0 8px #ff6b6b; animation: pulse-red 1.5s ease-in-out infinite; }
}
.stat-num { font-size: 24px; font-weight: 800; color: #e0e0ef; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 12px; color: #8c8ca1; text-transform: uppercase; letter-spacing: 1px; }
.stat-divider { width: 1px; height: 28px; background: rgba(255,255,255,0.08); }

@keyframes pulse { 0%,100%{ opacity:0.6; transform:scale(1); } 50%{ opacity:1; transform:scale(1.3); } }
@keyframes pulse-red { 0%,100%{ opacity:0.5; transform:scale(1); } 50%{ opacity:1; transform:scale(1.5); } }

// Header
.page-header { text-align: center; padding: 8px 0 20px; }
.page-header-bar { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 8px; }
.page-title { margin: 0; font-size: 28px; font-weight: 700; }
.glow-text {
  background: linear-gradient(135deg, #667eea, #00d4ff, #ff6b6b, #667eea);
  background-size: 300% 300%;
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  animation: gradientShift 6s ease infinite;
}
@keyframes gradientShift { 0%,100%{background-position:0% 50%} 33%{background-position:100% 50%} 66%{background-position:50% 100%} }
.page-desc { color: #8c8ca1; font-size: 13px; margin: 0; }

// Dual panel
.dual-panel {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 40px;
}

.panel {
  background: rgba(10,10,30,0.4);
  border: 1px solid rgba(102,126,234,0.12);
  border-radius: 16px;
  backdrop-filter: blur(16px);
  padding: 20px;
  position: relative;
  overflow: hidden;
}

.todo-panel { border-color: rgba(102,126,234,0.15); }
.dev-panel { border-color: rgba(255,107,107,0.2); }

.todo-panel::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, #667eea, #00d4ff, transparent);
  animation: scanLine 3s linear infinite;
}
.dev-panel::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, #ff6b6b, #ffd700, transparent);
  animation: scanLine 2s linear infinite;
}
@keyframes scanLine { 0%{opacity:0.3} 50%{opacity:1} 100%{opacity:0.3} }

.panel-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
}
.panel-icon {
  width: 28px; height: 28px; position: relative;
  display: flex; align-items: center; justify-content: center;
}
.icon-ring {
  position: absolute; inset: 0; border: 2px solid #667eea; border-radius: 50%;
  animation: ringPulse 2s ease-in-out infinite;
  &.dev-ring { border-color: #ff6b6b; animation-duration: 1.2s; }
}
.icon-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #667eea;
  &.dev-dot { background: #ff6b6b; box-shadow: 0 0 10px #ff6b6b; }
}
@keyframes ringPulse { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.2);opacity:0.2} }

.panel-title { margin: 0; font-size: 16px; font-weight: 600; color: #e0e0ef; flex: 1; }
.dev-title { color: #ff6b6b; }

.engine-indicator {
  display: flex; align-items: center; gap: 6px;
  padding: 2px 10px; border-radius: 10px;
  background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.2);
}
.engine-pulse { width: 6px; height: 6px; border-radius: 50%; background: #ff6b6b; animation: pulse-red 1s ease-in-out infinite; }
.engine-text { font-size: 10px; font-weight: 700; color: #ff6b6b; letter-spacing: 2px; }

.panel-empty {
  text-align: center; padding: 40px 0; color: #8c8ca1;
  p { margin: 12px 0 0; font-size: 14px; }
}
.empty-pulse {
  width: 40px; height: 40px; margin: 0 auto; border-radius: 50%;
  border: 2px solid rgba(102,126,234,0.2); animation: ringPulse 3s ease-in-out infinite;
}
.empty-engine {
  width: 40px; height: 40px; margin: 0 auto; border-radius: 50%;
  border: 2px solid rgba(255,107,107,0.15); background: rgba(255,107,107,0.03);
}
.dev-empty p { color: #606266; }

// Group cards (inside todo panel)
.group-card {
  background: rgba(102,126,234,0.06);
  border: 1px solid rgba(102,126,234,0.12);
  border-radius: 10px;
  margin-bottom: 10px;
  overflow: hidden;
}
.group-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer; transition: background 0.2s;
  &:hover { background: rgba(102,126,234,0.08); }
}
.group-left { display: flex; align-items: center; gap: 8px; }
.group-arrow { color: #667eea; font-size: 13px; transition: transform 0.2s; &.expanded { transform: rotate(90deg); } }
.group-name { font-size: 14px; font-weight: 600; color: #e0e0ef; }
.group-right { display: flex; align-items: center; gap: 8px; }
.group-config { font-size: 11px; color: #667eea; opacity: 0.8; }
.group-tasks { border-top: 1px solid rgba(102,126,234,0.08); }
.group-empty { padding: 12px; text-align: center; color: #8c8ca1; font-size: 12px; }
.sub-task {
  display: flex; align-items: center; gap: 8px; padding: 8px 14px;
  border-bottom: 1px solid rgba(102,126,234,0.04); transition: background 0.2s; cursor: grab;
  &:last-child { border-bottom: none; }
  &:hover { background: rgba(102,126,234,0.06); }
}
.sub-rank { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: rgba(102,126,234,0.15); border-radius: 5px; font-size: 10px; font-weight: 700; color: #667eea; flex-shrink: 0; }
.sub-title { flex: 1; font-size: 12px; color: #e0e0ef; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-actions { display: flex; gap: 4px; flex-shrink: 0; }

.collapse-enter-active,.collapse-leave-active { transition: all 0.25s ease; overflow: hidden; }
.collapse-enter-from,.collapse-leave-to { opacity: 0; max-height: 0; }
.collapse-enter-to,.collapse-leave-from { max-height: 600px; }

// Card list
.card-list { display: flex; flex-direction: column; gap: 10px; }

// Todo card
.todo-card {
  position: relative; display: flex; align-items: stretch;
  background: rgba(20,20,50,0.5); border: 1px solid rgba(102,126,234,0.12);
  border-radius: 10px; transition: all 0.3s ease; cursor: grab; overflow: hidden;
  &:hover { border-color: rgba(102,126,234,0.35); box-shadow: 0 0 20px rgba(102,126,234,0.1); transform: translateY(-1px); }
  &.dragging { opacity: 0.4; transform: scale(0.97); }
}
.card-glow {
  position: absolute; inset: -1px; border-radius: 10px;
  background: conic-gradient(from var(--angle,0deg), transparent 70%, rgba(102,126,234,0.35), rgba(0,212,255,0.25), transparent 90%);
  animation: rotateGlow 6s linear infinite; z-index: -1; opacity: 0; transition: opacity 0.4s; pointer-events: none;
}
.todo-card:hover .card-glow { opacity: 1; }
@keyframes rotateGlow { to { --angle: 360deg; } }
@property --angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

.card-rank {
  display: flex; align-items: center; justify-content: center; width: 40px; flex-shrink: 0;
  font-size: 16px; font-weight: 800;
  background: linear-gradient(180deg, rgba(102,126,234,0.15), rgba(0,212,255,0.05)); color: #667eea;
  border-right: 1px solid rgba(102,126,234,0.08);
}
.card-body { flex: 1; padding: 12px 14px; min-width: 0; }
.card-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; .card-id { color: #8c8ca1; font-size: 11px; margin-left: auto; } }
.card-title { margin: 0; font-size: 14px; font-weight: 600; color: #e0e0ef; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-meta { display: flex; gap: 10px; margin-top: 6px; font-size: 11px; color: #8c8ca1; .overdue { color: #f56c6c; font-weight: 600; } }
.card-config { display: flex; gap: 10px; margin-top: 4px; font-size: 10px; color: #667eea; opacity: 0.8;
  .config-item { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.card-actions { display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 10px; }

// Dev card
.dev-card {
  position: relative; display: flex; align-items: stretch;
  background: rgba(40,15,20,0.5); border: 1px solid rgba(255,107,107,0.15);
  border-radius: 10px; overflow: hidden; transition: all 0.3s ease;
  &:hover { border-color: rgba(255,107,107,0.35); box-shadow: 0 0 24px rgba(255,107,107,0.1); transform: translateY(-1px); }
}
.dev-card-glow {
  position: absolute; inset: -1px; border-radius: 10px;
  background: conic-gradient(from var(--angle,0deg), transparent 60%, rgba(255,107,107,0.35), rgba(255,215,0,0.2), transparent 85%);
  animation: rotateGlow 4s linear infinite; z-index: -1; opacity: 0; transition: opacity 0.4s; pointer-events: none;
}
.dev-card:hover .dev-card-glow { opacity: 1; }

.dev-status-bar {
  width: 3px; flex-shrink: 0; position: relative; overflow: hidden;
  background: rgba(255,107,107,0.15);
}
.dev-progress {
  position: absolute; bottom: 0; left: 0; right: 0; height: 40%;
  background: linear-gradient(180deg, #ff6b6b, #ffd700);
  animation: progressGrow 3s ease-in-out infinite alternate;
}
@keyframes progressGrow { 0%{height:20%;opacity:0.6} 100%{height:80%;opacity:1} }

// Transitions
.card-enter-active { transition: all 0.4s ease; }
.card-leave-active { transition: all 0.3s ease; position: absolute; }
.card-enter-from { opacity: 0; transform: translateY(20px) scale(0.95); }
.card-leave-to { opacity: 0; transform: translateX(-30px); }
.card-move { transition: transform 0.35s ease; }

// Responsive
@media (max-width: 900px) {
  .dual-panel { grid-template-columns: 1fr; }
}
</style>
