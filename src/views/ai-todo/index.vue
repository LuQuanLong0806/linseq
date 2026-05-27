<template>
  <div class="ai-todo-page">
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
                <el-tag size="small" type="info">{{ getGroupTasks(group.id).length }}个任务</el-tag>
              </div>
              <div class="group-right" @click.stop>
                <el-button link type="primary" size="small" @click="editGroupSettings(group)">编辑</el-button>
                <el-button link type="danger" size="small" @click="handleDeleteGroup(group)">解散</el-button>
              </div>
            </div>
            <!-- 分组补充说明 -->
            <div v-if="group.description" class="group-desc" @click.stop>
              <span class="group-desc-text">{{ group.description }}</span>
            </div>
            <Transition name="collapse">
              <div v-if="expandedGroups.has(group.id)" class="group-tasks">
                <div v-for="(task, idx) in getGroupTasks(group.id)" :key="task.id" class="sub-task"
                  :draggable="editingDescId !== task.id"
                  @dragstart="onSubDragStart(group.id, idx, $event)" @dragover.prevent @drop="onSubDrop(group.id, idx)" @dragend="onDragEnd">
                  <span class="sub-rank">{{ idx + 1 }}</span>
                  <div class="sub-body">
                    <div class="sub-top">
                      <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
                      <span class="sub-title">{{ task.title }}</span>
                    </div>
                    <!-- 任务补充说明 -->
                    <div v-if="task.customDescription && editingDescId !== task.id" class="sub-desc" @click.stop="openDescEditor(task)">
                      <span>{{ task.customDescription }}</span>
                      <span class="sub-desc-edit">✎</span>
                    </div>
                    <span v-if="!task.customDescription && editingDescId !== task.id" class="sub-desc-add" @click.stop="openDescEditor(task)">+ 补充</span>
                    <div v-if="editingDescId === task.id" class="sub-desc-editor" @click.stop @mousedown.stop>
                      <el-input v-model="editingDescText" type="textarea" :rows="2" placeholder="补充需求说明..." resize="none" @keydown.escape="cancelDescEdit" />
                      <div class="sub-desc-actions">
                        <el-button size="small" @click="cancelDescEdit">取消</el-button>
                        <el-button type="primary" size="small" @click="saveDescEdit(task)" :loading="savingDesc">保存</el-button>
                      </div>
                    </div>
                  </div>
                  <div class="sub-actions" @click.stop>
                    <el-button type="primary" link size="small" @click="$router.push(`/tasks/${task.id}`)">详情</el-button>
                    <el-button type="success" link size="small" @click="handleComplete(task)">完成</el-button>
                  </div>
                </div>
                <div v-if="getGroupTasks(group.id).length === 0" class="group-empty">分组内暂无任务</div>
              </div>
            </Transition>
          </div>

          <!-- 待办任务列表 -->
          <TransitionGroup v-if="todoQueueTasks.length > 0" name="card" tag="div" class="card-list">
            <div v-for="(task, index) in todoQueueTasks" :key="task.id"
              class="todo-card"
              :class="{ dragging: dragFrom?.type === 'ungrouped' && dragFrom?.index === index, 'is-active': drawerTask?.id === task.id }"
              :draggable="!drawerTask || drawerTask.id !== task.id"
              @dragstart="onDragStart(index, $event)" @dragover.prevent="onDragOver(index)" @drop="onDrop(index)" @dragend="onDragEnd"
              @click="openDrawer(task)">
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
                <div v-if="task.customDescription" class="card-desc-preview">
                  <span class="desc-label">说明</span>
                  <span class="desc-text">{{ task.customDescription }}</span>
                </div>
              </div>
              <div class="card-actions" @click.stop>
                <el-button type="primary" link size="small" @click="openDrawer(task)">编辑</el-button>
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

      <!-- 右侧手风琴编辑面板 -->
      <Transition name="drawer-slide">
        <div v-if="drawerTask" class="task-drawer" @click.stop>
          <div class="drawer-header">
            <div class="drawer-title-area">
              <el-tag :type="getPriorityType(drawerTask.priority)" size="small">{{ getPriorityLabel(drawerTask.priority) }}</el-tag>
              <span class="drawer-id">#{{ drawerTask.sourceId }}</span>
            </div>
            <el-button link size="small" @click="drawerTask = null" class="drawer-close">✕</el-button>
          </div>
          <h3 class="drawer-task-title">{{ drawerTask.title }}</h3>

          <el-form label-width="80px" label-position="top" class="drawer-form">
            <el-form-item label="项目名称">
              <div class="drawer-field">{{ drawerTask.project || drawerTask.customer || '-' }}</div>
            </el-form-item>
            <el-form-item label="本地地址">
              <el-input v-model="drawerForm.projectPath" placeholder="如 F:\your-project" />
            </el-form-item>
            <el-form-item label="Git 分支">
              <el-input v-model="drawerForm.gitBranch" placeholder="如 feature/xxx" />
            </el-form-item>
            <el-form-item label="补充说明">
              <el-input v-model="drawerForm.customDescription" type="textarea" :rows="4" placeholder="输入补充需求说明，给 Agent 参考..." resize="none" />
            </el-form-item>
            <el-form-item label="需求文档" v-if="drawerTask.reqDocName">
              <div class="drawer-field doc-link">
                <span>{{ drawerTask.reqDocName }}</span>
                <el-button v-if="drawerTask.reqDocUrl" type="primary" link size="small" @click="openUrl(drawerTask.reqDocUrl)">查看</el-button>
              </div>
            </el-form-item>
          </el-form>

          <div class="drawer-footer">
            <el-button @click="drawerTask = null">取消</el-button>
            <el-button type="primary" @click="saveDrawer" :loading="drawerSaving">保存</el-button>
          </div>
        </div>
      </Transition>

      <!-- 遮罩层 -->
      <Transition name="fade-mask">
        <div v-if="drawerTask" class="drawer-mask" @click="drawerTask = null"></div>
      </Transition>

      <!-- 新建分组弹窗 -->
      <el-dialog v-model="showGroupDialog" title="新建分组" width="480px" :close-on-click-modal="false">
        <el-form label-width="90px">
          <el-form-item label="分组名称">
            <el-input v-model="newGroupName" placeholder="如：宁对接前端需求" />
          </el-form-item>
          <el-form-item label="补充说明">
            <el-input v-model="newGroupDesc" type="textarea" :rows="3" placeholder="告诉 Agent 分组任务的关联关系、执行顺序、注意事项...&#10;如：一个是管理端，一个是企业端，企业端填报管理端回显" />
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

      <!-- 编辑分组弹窗 -->
      <el-dialog v-model="showGroupEdit" :title="`编辑分组 - ${editingGroup?.name || ''}`" width="480px" :close-on-click-modal="false">
        <el-form label-width="90px">
          <el-form-item label="分组名称"><el-input v-model="groupEditForm.name" /></el-form-item>
          <el-form-item label="补充说明">
            <el-input v-model="groupEditForm.description" type="textarea" :rows="4" placeholder="告诉 Agent 分组任务的关联关系、执行顺序、注意事项..." />
          </el-form-item>
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

const taskStore = useTaskStore()

// Drag state
const dragFrom = ref<{ type: 'ungrouped' | 'group'; index: number; groupId?: string } | null>(null)

// Group UI
const expandedGroups = reactive(new Set<string>())
const showGroupDialog = ref(false)
const newGroupName = ref('')
const newGroupTaskIds = ref<string[]>([])
const newGroupDesc = ref('')
const showGroupEdit = ref(false)
const editingGroup = ref<TaskGroup | null>(null)
const groupEditForm = reactive({ name: '', description: '' })

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
  try {
    const group = await taskStore.createGroup(name, newGroupTaskIds.value.length > 0 ? newGroupTaskIds.value : undefined, newGroupDesc.value || undefined)
    expandedGroups.add(group.id)
    showGroupDialog.value = false
    newGroupName.value = ''
    newGroupTaskIds.value = []
    newGroupDesc.value = ''
    ElMessage.success('分组已创建')
  } catch {
    ElMessage.error('创建分组失败')
  }
}

function editGroupSettings(group: TaskGroup) {
  editingGroup.value = group
  groupEditForm.name = group.name
  groupEditForm.description = group.description
  showGroupEdit.value = true
}

async function handleSaveGroupEdit() {
  if (!editingGroup.value) return
  try {
    await taskStore.updateGroup(editingGroup.value.id, { ...groupEditForm })
    showGroupEdit.value = false
    ElMessage.success('分组配置已更新')
  } catch {
    ElMessage.error('更新分组失败')
  }
}

async function handleDeleteGroup(group: TaskGroup) {
  try {
    await ElMessageBox.confirm(`确定解散分组「${group.name}」？`, '解散分组', { type: 'warning' })
    await taskStore.deleteGroup(group.id)
    expandedGroups.delete(group.id)
    ElMessage.success('分组已解散')
  } catch (err: any) {
    if (err !== 'cancel' && err?.toString() !== 'cancel') {
      ElMessage.error('解散分组失败')
    }
  }
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
        taskStore.todoList.splice(fromIdx < toIdx ? toIdx + 1 : toIdx, 0, item)
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

// Right drawer
const drawerTask = ref<Task | null>(null)
const drawerSaving = ref(false)
const drawerForm = reactive({ projectPath: '', gitBranch: '', customDescription: '' })

function openDrawer(task: Task) {
  drawerTask.value = task
  drawerForm.projectPath = task.projectPath || ''
  drawerForm.gitBranch = task.gitBranch || ''
  drawerForm.customDescription = task.customDescription || ''
}

async function saveDrawer() {
  if (!drawerTask.value) return
  drawerSaving.value = true
  try {
    await taskStore.updateTask(drawerTask.value.id, {
      projectPath: drawerForm.projectPath,
      gitBranch: drawerForm.gitBranch,
      customDescription: drawerForm.customDescription,
    })
    ElMessage.success('已保存')
    drawerTask.value = null
  } catch { ElMessage.error('保存失败') }
  finally { drawerSaving.value = false }
}
// Description editor
const editingDescId = ref<string | null>(null)
const editingDescText = ref('')
const savingDesc = ref(false)
function openDescEditor(task: Task) {
  editingDescId.value = task.id
  editingDescText.value = task.customDescription || ''
}
function cancelDescEdit() { editingDescId.value = null; editingDescText.value = '' }
async function saveDescEdit(task: Task) {
  savingDesc.value = true
  try {
    await taskStore.updateTask(task.id, { customDescription: editingDescText.value })
    ElMessage.success('已保存')
    editingDescId.value = null
  } catch { ElMessage.error('保存失败') }
  finally { savingDesc.value = false }
}

function openUrl(url: string) { window.open(url) }

function isOverdue(task: Task) { return task.status !== 'completed' && new Date(task.deadline).getTime() < Date.now() }
function formatDate(d: string) { return dayjs(d).format('MM-DD') }
function getPriorityType(p: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' { return ({ urgent: 'danger', high: 'warning', medium: 'info', low: 'success' } as const)[p] || 'info' }
function getPriorityLabel(p: string) { return ({ urgent: '紧急', high: '高', medium: '中', low: '低' } as Record<string, string>)[p] || p }

onMounted(async () => {
  await Promise.all([taskStore.fetchTasks(), taskStore.fetchGroups()])
  // Sync todoList from backend (Agent may have completed/removed tasks)
  syncTodoFromBackend()
  // Auto-refresh every 15s to pick up Agent status changes
  pollTimer = setInterval(async () => {
    await taskStore.fetchTasks()
    syncTodoFromBackend()
  }, 15000)
  await nextTick()
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

let pollTimer: ReturnType<typeof setInterval> | null = null

async function syncTodoFromBackend() {
  try {
    const res = await agentApi.getTodoOrder()
    const backendList: string[] = res.data?.todoList || []
    // If backend list differs from local, sync
    if (JSON.stringify(backendList) !== JSON.stringify(taskStore.todoList)) {
      taskStore.todoList.splice(0, taskStore.todoList.length, ...backendList)
      localStorage.setItem('linesequence-todo-list', JSON.stringify(taskStore.todoList))
    }
  } catch { /* ignore */ }
}
</script>

<style lang="scss" scoped>
.ai-todo-page { position: relative; min-height: calc(100vh - 96px); overflow: hidden; }
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
  width: 8px; height: 8px; border-radius: 50%; background: #00E5FF;
  box-shadow: 0 0 8px #00E5FF; animation: pulse 2s ease-in-out infinite;
  &.dev-pulse { background: #FF7D00; box-shadow: 0 0 8px #FF7D00; animation: pulse-red 1.5s ease-in-out infinite; }
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
  background: linear-gradient(135deg, #00E5FF, #00E5FF, #FF7D00, #00E5FF);
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
  background: rgba(10,16,31,0.15);
  border: 1px solid rgba(0,229,255,0.12);
  border-radius: 14px;
  backdrop-filter: blur(2px);
  padding: 20px;
  position: relative;
  overflow: hidden;
}

.todo-panel { border-color: rgba(0,229,255,0.15); }
.dev-panel { border-color: rgba(255,125,0,0.2); }

.todo-panel::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, #00E5FF, #00E5FF, transparent);
  animation: scanLine 3s linear infinite;
}
.dev-panel::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, #FF7D00, #ffd700, transparent);
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
  position: absolute; inset: 0; border: 2px solid #00E5FF; border-radius: 50%;
  animation: ringPulse 2s ease-in-out infinite;
  &.dev-ring { border-color: #FF7D00; animation-duration: 1.2s; }
}
.icon-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #00E5FF;
  &.dev-dot { background: #FF7D00; box-shadow: 0 0 10px #FF7D00; }
}
@keyframes ringPulse { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.2);opacity:0.2} }

.panel-title { margin: 0; font-size: 16px; font-weight: 600; color: #e0e0ef; flex: 1; }
.dev-title { color: #FF7D00; }

.engine-indicator {
  display: flex; align-items: center; gap: 6px;
  padding: 2px 10px; border-radius: 10px;
  background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.2);
}
.engine-pulse { width: 6px; height: 6px; border-radius: 50%; background: #FF7D00; animation: pulse-red 1s ease-in-out infinite; }
.engine-text { font-size: 10px; font-weight: 700; color: #FF7D00; letter-spacing: 2px; }

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
  background: rgba(10,16,31,0.15);
  border: 1px solid rgba(157,92,255,0.15);
  border-radius: 10px;
  margin-bottom: 10px;
  overflow: hidden;
  transition: border-color 0.3s;
  &:hover { border-color: rgba(157,92,255,0.35); }
}
.group-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer; transition: background 0.2s;
  &:hover { background: rgba(157,92,255,0.08); }
}
.group-left { display: flex; align-items: center; gap: 8px; }
.group-arrow { color: #9D5CFF; font-size: 13px; transition: transform 0.2s; &.expanded { transform: rotate(90deg); } }
.group-name { font-size: 14px; font-weight: 600; color: #e0e0ef; }
.group-right { display: flex; align-items: center; gap: 8px; }
.group-desc { padding: 0 14px 8px; }
.group-desc-text { font-size: 11px; color: #9D5CFF; line-height: 1.5; opacity: 0.85; }
.group-tasks { border-top: 1px solid rgba(157,92,255,0.1); }
.group-empty { padding: 12px; text-align: center; color: #8c8ca1; font-size: 12px; }
.sub-task {
  display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px;
  border-bottom: 1px solid rgba(157,92,255,0.05); transition: background 0.2s; cursor: grab;
  &:last-child { border-bottom: none; }
  &:hover { background: rgba(157,92,255,0.06); }
}
.sub-rank { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: rgba(157,92,255,0.15); border-radius: 5px; font-size: 10px; font-weight: 700; color: #9D5CFF; flex-shrink: 0; margin-top: 2px; }
.sub-body { flex: 1; min-width: 0; }
.sub-top { display: flex; align-items: center; gap: 6px; }
.sub-title { flex: 1; font-size: 12px; color: #e0e0ef; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-desc { margin-top: 4px; font-size: 11px; color: #00E5FF; opacity: 0.8; cursor: pointer; display: flex; align-items: flex-start; gap: 4px;
  span:first-child { flex: 1; line-height: 1.4; }
  &:hover { opacity: 1; }
}
.sub-desc-edit { font-size: 10px; opacity: 0.5; flex-shrink: 0; }
.sub-desc-add { margin-top: 4px; font-size: 11px; color: #9D5CFF; cursor: pointer; opacity: 0.6; &:hover { opacity: 1; } }
.sub-desc-editor { margin-top: 6px; }
.sub-desc-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
.sub-actions { display: flex; gap: 4px; flex-shrink: 0; margin-top: 2px; }

.collapse-enter-active,.collapse-leave-active { transition: all 0.25s ease; overflow: hidden; }
.collapse-enter-from,.collapse-leave-to { opacity: 0; max-height: 0; }
.collapse-enter-to,.collapse-leave-from { max-height: 600px; }

// Card list
.card-list { display: flex; flex-direction: column; gap: 10px; }

// Todo card
.todo-card {
  position: relative; display: flex; align-items: stretch;
  background: rgba(10,16,31,0.15); border: 1px solid rgba(0,229,255,0.12);
  border-radius: 10px; transition: all 0.3s ease; cursor: grab; overflow: hidden;
  backdrop-filter: blur(2px);
  &:hover { border-color: rgba(0,229,255,0.35); box-shadow: 0 0 20px rgba(0,229,255,0.1); transform: translateY(-1px); }
  &.dragging { opacity: 0.4; transform: scale(0.97); }
  &.is-editing { cursor: default; }
}
.card-glow {
  position: absolute; inset: -1px; border-radius: 10px;
  background: conic-gradient(from var(--angle,0deg), transparent 70%, rgba(0,229,255,0.35), rgba(157,92,255,0.25), transparent 90%);
  animation: rotateGlow 6s linear infinite; z-index: -1; opacity: 0; transition: opacity 0.4s; pointer-events: none;
}
.todo-card:hover .card-glow { opacity: 1; }
@keyframes rotateGlow { to { --angle: 360deg; } }
@property --angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

.card-rank {
  display: flex; align-items: center; justify-content: center; width: 40px; flex-shrink: 0;
  font-size: 16px; font-weight: 800;
  background: linear-gradient(180deg, rgba(0,229,255,0.12), rgba(0,229,255,0.03)); color: #00E5FF;
  border-right: 1px solid rgba(0,229,255,0.08);
}
.card-body { flex: 1; padding: 12px 14px; min-width: 0; }
.card-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; .card-id { color: #8c8ca1; font-size: 11px; margin-left: auto; } }
.card-title { margin: 0; font-size: 14px; font-weight: 600; color: #e0e0ef; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-meta { display: flex; gap: 10px; margin-top: 6px; font-size: 11px; color: #8c8ca1; .overdue { color: #f56c6c; font-weight: 600; } }
.card-config { display: flex; gap: 10px; margin-top: 4px; font-size: 10px; color: #00E5FF; opacity: 0.8;
  .config-item { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.card-actions { display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 10px; }

// Card desc preview (read-only in card)
.card-desc-preview {
  margin-top: 8px; padding: 5px 10px; border-radius: 6px;
  background: rgba(0,229,255,0.06); border: 1px solid rgba(0,229,255,0.08);
  display: flex; align-items: flex-start; gap: 6px;
}
.desc-label { font-size: 10px; color: #00E5FF; white-space: nowrap; flex-shrink: 0; margin-top: 1px; }
.desc-text { flex: 1; font-size: 11px; color: #cfd3dc; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

// Card active state
.todo-card.is-active { border-color: rgba(0,229,255,0.4); box-shadow: 0 0 20px rgba(0,229,255,0.15); }

// ===== Right Drawer =====
.drawer-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 99; backdrop-filter: blur(2px);
}
.task-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: 380px; z-index: 100;
  background: rgba(10,16,31,0.92); border-left: 1px solid rgba(0,229,255,0.2);
  backdrop-filter: blur(20px); padding: 24px; overflow-y: auto;
  display: flex; flex-direction: column;
}
.drawer-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.drawer-title-area { display: flex; align-items: center; gap: 8px; }
.drawer-id { color: #8c8ca1; font-size: 12px; }
.drawer-close { font-size: 18px; color: #8c8ca1; &:hover { color: #00E5FF; } }
.drawer-task-title { margin: 0 0 20px; font-size: 16px; font-weight: 600; color: #e0e0ef; line-height: 1.4; }
.drawer-form { flex: 1; }
.drawer-field { font-size: 13px; color: #cfd3dc; padding: 6px 0; line-height: 1.5; }
.doc-link { display: flex; align-items: center; justify-content: space-between; }
.drawer-footer {
  padding-top: 16px; border-top: 1px solid rgba(0,229,255,0.1);
  display: flex; justify-content: flex-end; gap: 10px;
}

// Drawer transition
.drawer-slide-enter-active { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.drawer-slide-leave-active { transition: transform 0.2s ease-in; }
.drawer-slide-enter-from { transform: translateX(100%); }
.drawer-slide-leave-to { transform: translateX(100%); }
.fade-mask-enter-active, .fade-mask-leave-active { transition: opacity 0.25s ease; }
.fade-mask-enter-from, .fade-mask-leave-to { opacity: 0; }

// Dev card
.dev-card {
  position: relative; display: flex; align-items: stretch;
  background: rgba(10,16,31,0.15); border: 1px solid rgba(255,125,0,0.15);
  border-radius: 10px; overflow: hidden; transition: all 0.3s ease;
  backdrop-filter: blur(2px);
  &:hover { border-color: rgba(255,125,0,0.35); box-shadow: 0 0 24px rgba(255,125,0,0.1); transform: translateY(-1px); }
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
  background: linear-gradient(180deg, #FF7D00, #ffd700);
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
