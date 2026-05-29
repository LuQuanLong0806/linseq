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
        <!-- 唤醒 Agent -->
        <div class="wake-bar" v-if="todoQueueTasks.length > 0 && devQueueTasks.length === 0">
          <span class="wake-hint">队列中有 {{ todoQueueTasks.length }} 个待办任务</span>
          <el-button type="primary" @click="handleWakeAgent" :loading="waking" class="wake-btn-sm">
            唤醒 Agent 开始任务
          </el-button>
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
          <div class="panel-scroll" @dragover.prevent>
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
                      <el-tag v-if="isManualTask(task)" size="small" effect="plain" class="manual-tag">手动</el-tag>
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
          <TransitionGroup v-if="ungroupedTodoTasks.length > 0" name="card" tag="div" class="card-list">
            <div v-for="(task, index) in ungroupedTodoTasks" :key="task.id"
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
                  <el-tag v-if="isManualTask(task)" size="small" effect="plain" class="manual-tag">手动发布</el-tag>
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
          <div class="panel-scroll" @dragover.prevent>

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
              <div class="dev-card-inner">
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
                  <el-button type="primary" link size="small" @click="openAgentChat(task)">对话</el-button>
                  <el-button type="primary" link size="small" @click="$router.push(`/tasks/${task.id}`)">详情</el-button>
                </div>
              </div>
            </div>
          </TransitionGroup>
          </div>
        </div>
      </div>

      <!-- 配置弹窗 -->
      <Teleport to="body">
        <Transition name="fade-mask">
          <div v-if="drawerTask" class="config-modal-mask" @click.self="drawerTask = null">
            <div class="config-modal">
              <div class="config-modal-header">
                <div class="config-modal-title">
                  <el-tag :type="getPriorityType(drawerTask.priority)" size="small">{{ getPriorityLabel(drawerTask.priority) }}</el-tag>
                  <span class="config-modal-id">#{{ drawerTask.sourceId }}</span>
                  <span class="config-modal-name">{{ drawerTask.title }}</span>
                </div>
                <el-button link size="small" @click="drawerTask = null" class="config-modal-close">✕</el-button>
              </div>
              <div class="config-modal-body">
                <el-form label-width="80px" label-position="top" class="config-form">
                  <el-form-item label="项目名称">
                    <div class="config-field">{{ drawerTask.project || drawerTask.customer || '-' }}</div>
                  </el-form-item>
                  <el-row :gutter="16">
                    <el-col :span="12">
                      <el-form-item label="本地路径">
                        <el-input v-model="drawerForm.projectPath" placeholder="如 F:\your-project" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="Git 分支">
                        <el-input v-model="drawerForm.gitBranch" placeholder="如 feature/xxx" />
                      </el-form-item>
                    </el-col>
                  </el-row>
                  <el-form-item label="补充说明">
                    <el-input v-model="drawerForm.customDescription" type="textarea" :rows="4" placeholder="输入补充需求说明，给 Agent 参考..." resize="none" />
                  </el-form-item>
                  <el-form-item label="需求文档" v-if="drawerTask.reqDocName">
                    <div class="config-field doc-link">
                      <span>{{ drawerTask.reqDocName }}</span>
                      <el-button v-if="drawerTask.reqDocUrl" type="primary" link size="small" @click="openUrl(drawerTask.reqDocUrl)">查看</el-button>
                    </div>
                  </el-form-item>
                </el-form>
              </div>
              <div class="config-modal-footer">
                <el-button @click="drawerTask = null">取消</el-button>
                <el-button type="primary" @click="saveDrawer" :loading="drawerSaving">保存</el-button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- 新建分组弹窗 -->
      <el-dialog v-model="showGroupDialog" title="新建分组" width="var(--dialog-sm)" :close-on-click-modal="false">
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
      <el-dialog v-model="showGroupEdit" :title="`编辑分组 - ${editingGroup?.name || ''}`" width="var(--dialog-sm)" :close-on-click-modal="false">
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

      <el-dialog v-model="showPublishDialog" title="发布任务到 AI 待办" width="var(--dialog-md)" :close-on-click-modal="false" destroy-on-close>
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
import { ref, computed, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useTaskStore } from '@/stores/task'
import { agentApi } from '@/api/agent'
import { projectApi, type ProjectConfig } from '@/api/project'
import { taskApi } from '@/api/task'
import type { Task, TaskGroup } from '@/types'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatWs } from '@/composables/useChatWs'
import { useAgentChat } from '@/composables/useAgentChat'

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
function onDragOver(_index: number) { /* unused */ }
function onDrop(index: number) {
  if (dragFrom.value?.type === 'ungrouped' && dragFrom.value.index !== index) {
    const tasks = ungroupedTodoTasks.value
    const fromTask = tasks[dragFrom.value.index]
    const toTask = tasks[index]
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

function onDragEnd() { dragFrom.value = null; stopAutoScroll(); document.removeEventListener('dragover', onDragMove) }

// Auto-scroll during drag
let scrollRAF = 0
function stopAutoScroll() { cancelAnimationFrame(scrollRAF) }

function onDragStart(index: number, e: DragEvent) {
  dragFrom.value = { type: 'ungrouped', index }; e.dataTransfer!.effectAllowed = 'move'
  document.addEventListener('dragover', onDragMove)
}
function onDragMove(e: DragEvent) {
  if (!dragFrom.value) return
  stopAutoScroll()
  const tick = () => {
    const panels = document.querySelectorAll('.panel-scroll')
    for (const el of panels) {
      const rect = (el as HTMLElement).getBoundingClientRect()
      const y = e.clientY
      const edge = 40
      if (y >= rect.top && y <= rect.bottom) {
        if (y < rect.top + edge) (el as HTMLElement).scrollTop -= 8
        else if (y > rect.bottom - edge) (el as HTMLElement).scrollTop += 8
      }
    }
    if (dragFrom.value) scrollRAF = requestAnimationFrame(tick)
  }
  scrollRAF = requestAnimationFrame(tick)
}

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
function formatLogTime(t: string) { return dayjs(t).format('HH:mm') }
function isManualTask(task: Task) { return task.sourceId?.startsWith('manual_') }
function getPriorityType(p: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' { return ({ urgent: 'danger', high: 'warning', medium: 'info', low: 'success' } as const)[p] || 'info' }
function getPriorityLabel(p: string) { return ({ urgent: '紧急', high: '高', medium: '中', low: '低' } as Record<string, string>)[p] || p }

// ========== 补充说明（开发中追加指令，聊天式交互） ==========
interface SupplementMsg {
  id: string
  content: string
  created_at: string
  read_by_agent: number
  type: 'user' | 'agent'
  action?: string
}
const supplementMap = reactive<Record<string, SupplementMsg[]>>({})
const supplementInput = ref('')
const supplementSending = ref(false)
const waitingAgentReply = ref(false)

// ========== Agent Chat Panel ==========
const agentChat = useAgentChat()

function openAgentChat(task: Task) {
  agentChat.openPanel()
}

async function loadSupplementHistory(taskId: string) {
  try {
    const res = await taskApi.getSupplements(taskId)
    const task = taskStore.tasks.find(t => t.id === taskId)
    const logs = (task?.devLog || [])
      .filter(l => l.action !== '补充说明')
      .map(l => ({
        id: l.id, content: l.content, created_at: l.time, read_by_agent: 1, type: 'agent' as const, action: l.action
      }))
    const sups = (res.data || []).map(s => ({
      ...s, type: 'user' as const
    }))
    const merged = [...logs, ...sups].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    supplementMap[taskId] = merged
  } catch { /* ignore */ }
}

async function sendSupplement(task: Task) {
  const text = supplementInput.value.trim()
  if (!text) return
  supplementSending.value = true
  try {
    await taskApi.addSupplement(task.id, text)
    supplementInput.value = ''
    waitingAgentReply.value = true
    await loadSupplementHistory(task.id)
    await nextTick()
  } catch { ElMessage.error('发送失败') }
  finally { supplementSending.value = false }
}

function formatSupplementTime(t: string) {
  const d = dayjs(t)
  return d.format('MM-DD HH:mm')
}

// ========== 唤醒 Agent ==========
const waking = ref(false)
async function handleWakeAgent() {
  waking.value = true
  try {
    await agentChat.executeAction('wake', { message: '开始工作' })
    agentChat.openPanel()
    ElMessage.success('已唤醒 Agent')
  } catch { ElMessage.error('唤醒失败，请检查同步中心配置') }
  finally { waking.value = false }
}

// ========== WebSocket 实时消息 ==========
const { connected: wsConnected, startWs, updateSubscription, subscribeGlobal } = useChatWs((event, taskId, data) => {
  if (event === 'chat') {
    agentChat.handleWsMessage(event, data)
  }
  if (event === 'supplement') {
    // 自己发的补充说明通过 HTTP 已处理
  }
})

onMounted(async () => {
  await taskStore.fetchTasks()
  syncTodoFromBackend()
  startWs()
  subscribeGlobal()
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
  padding: 8px 0 4px;
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
.stat-num { font-size: 24px; font-weight: 800; color: var(--cyber-text-primary); font-variant-numeric: tabular-nums; }
.stat-label { font-size: 12px; color: var(--cyber-text-secondary); text-transform: uppercase; letter-spacing: 1px; }
.stat-divider { width: 1px; height: 28px; background: rgba(255,255,255,0.08); }

@keyframes pulse { 0%,100%{ opacity:0.6; transform:scale(1); } 50%{ opacity:1; transform:scale(1.3); } }
@keyframes pulse-red { 0%,100%{ opacity:0.5; transform:scale(1); } 50%{ opacity:1; transform:scale(1.5); } }

// Header
.page-header { text-align: center; padding: 4px 0 12px; }
.page-header-bar { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 4px; }
.page-title { margin: 0; font-size: 28px; font-weight: 700; }
.glow-text {
  background: linear-gradient(135deg, #00E5FF, #00E5FF, #FF7D00, #00E5FF);
  background-size: 300% 300%;
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  animation: gradientShift 6s ease infinite;
}
@keyframes gradientShift { 0%,100%{background-position:0% 50%} 33%{background-position:100% 50%} 66%{background-position:50% 100%} }
.page-desc { color: var(--cyber-text-secondary); font-size: 13px; margin: 0; }

// Dual panel
.dual-panel {
  display: grid;
  grid-template-columns: 1fr clamp(280px, 30vw, 380px);
  gap: 20px;
  max-width: var(--container-md);
  margin: 0 auto;
  padding-bottom: 40px;
}

.panel {
  background: var(--cyber-glass-bg);
  border: 1px solid var(--cyber-glass-border);
  border-radius: 14px;
  backdrop-filter: blur(2px);
  padding: 20px;
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 240px);
}

.todo-panel { border-color: var(--cyber-glass-border); }
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
  display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-shrink: 0;
}
.panel-scroll {
  flex: 1; overflow-y: auto; padding-right: 4px;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 4px; }
  &::-webkit-scrollbar-thumb:hover { background: rgba(0,229,255,0.3); }
}
.panel-icon {
  width: 28px; height: 28px; position: relative;
  display: flex; align-items: center; justify-content: center;
}
.icon-ring {
  position: absolute; inset: 0; border: 2px solid var(--cyber-cyan); border-radius: 50%;
  animation: ringPulse 2s ease-in-out infinite;
  &.dev-ring { border-color: var(--cyber-orange); animation-duration: 1.2s; }
}
.icon-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #00E5FF;
  &.dev-dot { background: #FF7D00; box-shadow: 0 0 10px #FF7D00; }
}
@keyframes ringPulse { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.2);opacity:0.2} }

.panel-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--cyber-text-primary); flex: 1; }
.dev-title { color: var(--cyber-orange); }

.engine-indicator {
  display: flex; align-items: center; gap: 6px;
  padding: 2px 10px; border-radius: 10px;
  background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.2);
}
.engine-pulse { width: 6px; height: 6px; border-radius: 50%; background: #FF7D00; animation: pulse-red 1s ease-in-out infinite; }
.engine-text { font-size: 10px; font-weight: 700; color: var(--cyber-orange); letter-spacing: 2px; }

.panel-empty {
  text-align: center; padding: 40px 0; color: var(--cyber-text-secondary);
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
.dev-empty p { color: var(--cyber-text-muted); }

// Group cards (inside todo panel)
.group-card {
  background: var(--cyber-glass-bg);
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
.group-arrow { color: var(--cyber-purple); font-size: 13px; transition: transform 0.2s; &.expanded { transform: rotate(90deg); } }
.group-name { font-size: 14px; font-weight: 600; color: var(--cyber-text-primary); }
.group-right { display: flex; align-items: center; gap: 8px; }
.group-desc { padding: 0 14px 8px; }
.group-desc-text { font-size: 11px; color: var(--cyber-purple); line-height: 1.5; opacity: 0.85; }
.group-tasks { border-top: 1px solid rgba(157,92,255,0.1); }
.group-empty { padding: 12px; text-align: center; color: var(--cyber-text-secondary); font-size: 12px; }
.sub-task {
  display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px;
  border-bottom: 1px solid rgba(157,92,255,0.05); transition: background 0.2s; cursor: grab;
  &:last-child { border-bottom: none; }
  &:hover { background: rgba(157,92,255,0.06); }
}
.sub-rank { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: rgba(157,92,255,0.15); border-radius: 5px; font-size: 10px; font-weight: 700; color: var(--cyber-purple); flex-shrink: 0; margin-top: 2px; }
.sub-body { flex: 1; min-width: 0; }
.sub-top { display: flex; align-items: center; gap: 6px; }
.sub-title { flex: 1; font-size: 12px; color: var(--cyber-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-desc { margin-top: 4px; font-size: 11px; color: var(--cyber-cyan); opacity: 0.8; cursor: pointer; display: flex; align-items: flex-start; gap: 4px;
  span:first-child { flex: 1; line-height: 1.4; }
  &:hover { opacity: 1; }
}
.sub-desc-edit { font-size: 10px; opacity: 0.5; flex-shrink: 0; }
.sub-desc-add { margin-top: 4px; font-size: 11px; color: var(--cyber-purple); cursor: pointer; opacity: 0.6; &:hover { opacity: 1; } }
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
  background: var(--cyber-glass-bg); border: 1px solid var(--cyber-glass-border);
  border-radius: 10px; transition: all 0.3s ease; cursor: grab; overflow: hidden;
  backdrop-filter: blur(2px);
  &:hover { border-color: var(--cyber-glass-border-hover); box-shadow: 0 0 20px rgba(0,229,255,0.1); transform: translateY(-1px); }
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
  background: linear-gradient(180deg, rgba(0,229,255,0.12), rgba(0,229,255,0.03)); color: var(--cyber-cyan);
  border-right: 1px solid var(--cyber-glass-border);
}
.card-body { flex: 1; padding: 12px 14px; min-width: 0; }
.card-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; .card-id { color: var(--cyber-text-secondary); font-size: 11px; margin-left: auto; } }
.card-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--cyber-text-primary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-meta { display: flex; gap: 10px; margin-top: 6px; font-size: 11px; color: var(--cyber-text-secondary); .overdue { color: #f56c6c; font-weight: 600; } }
.card-config { display: flex; gap: 10px; margin-top: 4px; font-size: 10px; color: var(--cyber-cyan); opacity: 0.8;
  .config-item { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.card-actions { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px; padding: 0 10px; border-left: 1px solid var(--cyber-glass-border); }

// Card desc preview (read-only in card)
.card-desc-preview {
  margin-top: 8px; padding: 5px 10px; border-radius: 6px;
  background: var(--cyber-glass-border); border: 1px solid var(--cyber-glass-border);
  display: flex; align-items: flex-start; gap: 6px;
}
.desc-label { font-size: 10px; color: var(--cyber-cyan); white-space: nowrap; flex-shrink: 0; margin-top: 1px; }
.desc-text { flex: 1; font-size: 11px; color: var(--cyber-text-muted); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

// Card active state
.todo-card.is-active { border-color: rgba(0,229,255,0.4); box-shadow: 0 0 20px rgba(0,229,255,0.15); }

// ===== Config Modal =====
.config-modal-mask {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.config-modal {
  width: var(--dialog-lg); max-height: 80vh; border-radius: 14px; overflow: hidden;
  background: var(--cyber-glass-bg-strong); border: 1px solid var(--cyber-glass-border);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
  display: flex; flex-direction: column;
  animation: modal-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.config-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 24px; border-bottom: 1px solid var(--cyber-glass-border);
}
.config-modal-title {
  display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;
}
.config-modal-id { color: var(--cyber-text-secondary); font-size: 12px; }
.config-modal-name {
  font-size: 15px; font-weight: 600; color: var(--cyber-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.config-modal-close { font-size: 18px; color: var(--cyber-text-secondary); &:hover { color: var(--cyber-cyan); } }
.config-modal-body {
  flex: 1; overflow-y: auto; padding: 20px 24px;
}
.config-form :deep(.el-form-item__label) { font-weight: 500; }
.config-field { font-size: 13px; color: var(--cyber-text-primary); padding: 6px 0; line-height: 1.5; }
.doc-link { display: flex; align-items: center; justify-content: space-between; }
.config-modal-footer {
  padding: 16px 24px; border-top: 1px solid var(--cyber-glass-border);
  display: flex; justify-content: flex-end; gap: 10px;
}

.fade-mask-enter-active, .fade-mask-leave-active { transition: opacity 0.2s ease; }
.fade-mask-enter-from, .fade-mask-leave-to { opacity: 0; }

// Dev card
.dev-card {
  position: relative; display: flex; flex-direction: column;
  background: var(--cyber-glass-bg); border: 1px solid rgba(255,125,0,0.15);
  border-radius: 10px; overflow: hidden; transition: all 0.3s ease;
  backdrop-filter: blur(2px);
  &:hover { border-color: rgba(255,125,0,0.35); box-shadow: 0 0 24px rgba(255,125,0,0.1); transform: translateY(-1px); }
}
.dev-card-inner {
  display: flex; align-items: stretch; flex: 1;
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

// Dev log section
.dev-log-section {
  border-top: 1px solid rgba(255,125,0,0.12);
  background: rgba(255,125,0,0.03);
}
.dev-log-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px 4px;
}
.dev-log-title {
  font-size: 11px; font-weight: 600; color: rgba(255,125,0,0.7);
  text-transform: uppercase; letter-spacing: 1px;
}
.dev-log-count {
  font-size: 10px; color: rgba(255,125,0,0.5); background: rgba(255,125,0,0.1);
  padding: 1px 6px; border-radius: 8px;
}
.dev-log-list { padding: 0 14px 10px; }
.dev-log-item {
  display: flex; gap: 8px; padding: 5px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  &:last-child { border-bottom: none; }
}
.log-indicator {
  width: 3px; border-radius: 2px; flex-shrink: 0; margin-top: 3px;
  background: rgba(255,125,0,0.5); min-height: 20px;
  &.开发 { background: rgba(0,229,255,0.5); }
  &.调试 { background: rgba(229,162,27,0.5); }
  &.重构 { background: rgba(157,92,255,0.5); }
  &.自测 { background: rgba(46,184,92,0.5); }
  &.异常 { background: rgba(245,108,108,0.5); }
  &.暂停 { background: rgba(144,147,153,0.5); }
}
.log-body { flex: 1; min-width: 0; }
.log-top { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.log-action {
  font-size: 10px; font-weight: 600; color: rgba(255,125,0,0.8);
  background: rgba(255,125,0,0.08); padding: 1px 5px; border-radius: 3px;
}
.log-time { font-size: 10px; color: rgba(140,140,161,0.5); font-family: 'Courier New', monospace; }
.log-content {
  font-size: 11px; color: rgba(207,211,220,0.8); line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.log-more {
  text-align: center; font-size: 10px; color: rgba(140,140,161,0.4);
  padding: 4px 0 2px; font-style: italic;
}

// ========== 聊天终端 Modal ==========
.chat-modal-mask {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
}
.chat-terminal {
  position: relative; width: var(--chat-terminal-width); max-height: 80vh; border-radius: 16px; overflow: hidden;
  background: rgba(10,16,31,0.96); border: 1px solid var(--cyber-glass-border-hover);
  box-shadow: 0 0 60px rgba(0,229,255,0.12), 0 0 120px rgba(157,92,255,0.06);
  display: flex; flex-direction: column; animation: terminal-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.terminal-rain {
  position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0.5;
}
@keyframes terminal-in {
  from { opacity: 0; transform: scale(0.92) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.terminal-header {
  position: relative; z-index: 1; padding: 14px 20px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--cyber-glass-border);
  background: linear-gradient(180deg, rgba(0,229,255,0.04), transparent);
}
.terminal-title-area {
  display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;
}
.terminal-status-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #FF7D00; flex-shrink: 0;
  box-shadow: 0 0 8px #FF7D00; animation: pulse 1.5s ease-in-out infinite;
}
.terminal-task-name {
  font-size: 14px; font-weight: 600; color: var(--cyber-text-primary);
  max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.terminal-tag { flex-shrink: 0; }
.terminal-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.terminal-link { color: rgba(0,229,255,0.6); &:hover { color: var(--cyber-cyan); } }
.terminal-close { font-size: 16px; color: var(--cyber-text-secondary); &:hover { color: var(--cyber-cyan); } }

.terminal-messages {
  position: relative; z-index: 1; flex: 1; overflow-y: auto; padding: 16px 20px;
  min-height: 300px; max-height: 50vh;
  display: flex; flex-direction: column; gap: 10px;
  &::-webkit-scrollbar { width: 3px; }
  &::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 3px; }
}
.chat-empty {
  text-align: center; padding: 50px 0;
  .empty-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.4; }
  p { font-size: 14px; color: var(--cyber-text-primary); margin: 0 0 6px; }
  span { font-size: 12px; color: rgba(140,140,161,0.4); }
}
.chat-bubble {
  max-width: 85%; padding: 10px 14px; border-radius: 12px;
  font-size: 12px; line-height: 1.6; position: relative;
  animation: bubble-in 0.25s ease-out;
}
.bubble-user {
  align-self: flex-end;
  background: var(--cyber-glass-border); border: 1px solid var(--cyber-glass-border-hover);
  border-bottom-right-radius: 3px;
}
.bubble-agent {
  align-self: flex-start;
  background: rgba(157,92,255,0.08); border: 1px solid rgba(157,92,255,0.15);
  border-bottom-left-radius: 3px;
}
.bubble-reply {
  align-self: flex-start;
  background: var(--cyber-glass-border); border: 1px solid var(--cyber-glass-border-hover);
  border-bottom-left-radius: 3px;
  .bubble-role { color: rgba(0,229,255,0.85) !important; }
}
.bubble-waiting {
  align-self: flex-start;
  background: rgba(157,92,255,0.06); border: 1px solid rgba(157,92,255,0.12);
  border-bottom-left-radius: 3px;
}
.bubble-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.bubble-role {
  font-size: 10px; font-weight: 600; letter-spacing: 0.5px;
  .bubble-user & { color: rgba(0,229,255,0.7); }
  .bubble-agent & { color: rgba(157,92,255,0.7); }
  .bubble-waiting & { color: rgba(157,92,255,0.6); }
}
.bubble-time { font-size: 9px; color: rgba(140,140,161,0.4); font-family: 'Courier New', monospace; }
.bubble-content { color: rgba(207,211,220,0.85); word-break: break-word; white-space: pre-wrap; }
.bubble-unread {
  position: absolute; top: 6px; right: 8px;
  font-size: 9px; color: rgba(245,108,108,0.7);
  background: rgba(245,108,108,0.08); padding: 1px 5px; border-radius: 6px;
}
@keyframes bubble-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
// Loading 等待动画
.waiting-dots {
  display: flex; gap: 5px; padding: 4px 0;
  .dot {
    width: 7px; height: 7px; border-radius: 50%; background: rgba(157,92,255,0.5);
    animation: dotBounce 1.4s ease-in-out infinite;
    &:nth-child(2) { animation-delay: 0.15s; }
    &:nth-child(3) { animation-delay: 0.3s; }
  }
}
@keyframes dotBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
  30% { transform: translateY(-8px); opacity: 1; }
}
.terminal-input {
  position: relative; z-index: 1; padding: 14px 20px; border-top: 1px solid var(--cyber-glass-border);
  background: rgba(0,15,30,0.5); position: relative;
  &.drag-over { border-color: rgba(0,229,255,0.4); background: rgba(0,229,255,0.04); }
  :deep(.el-textarea__inner) {
    background: rgba(0,20,40,0.6) !important;
    border-color: var(--cyber-glass-border) !important;
    color: var(--cyber-text-muted) !important; font-size: 12px;
    &:focus { border-color: rgba(0,229,255,0.3) !important; }
  }
}
.drop-overlay {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: var(--cyber-glass-border); color: var(--cyber-cyan); font-size: 13px; z-index: 1;
  border: 2px dashed rgba(0,229,255,0.3); border-radius: 6px; margin: 6px;
}
.terminal-input-actions {
  display: flex; align-items: center; justify-content: space-between; margin-top: 8px;
}
.input-hint { font-size: 10px; color: rgba(140,140,161,0.3); }

// Manual task tag
.manual-tag {
  border-color: rgba(46,184,92,0.3) !important;
  color: rgba(46,184,92,0.8) !important;
  background: rgba(46,184,92,0.06) !important;
}

// Responsive
@media (max-width: 900px) {
  .dual-panel { grid-template-columns: 1fr; }
}

// ===== Wake Bar =====
.wake-bar {
  display: flex; align-items: center; justify-content: center; gap: 14px;
  margin-top: 8px; padding: 8px 16px; border-radius: 10px;
  background: rgba(0,229,255,0.04); border: 1px solid rgba(0,229,255,0.12);
}
.wake-btn-sm {
  border-radius: 8px;
  background: linear-gradient(135deg, #00E5FF, #9D5CFF); border: none;
  box-shadow: 0 0 16px rgba(0,229,255,0.2);
  transition: box-shadow 0.3s, transform 0.2s;
  &:hover { box-shadow: 0 0 24px rgba(0,229,255,0.35); transform: translateY(-1px); }
}
.wake-hint { font-size: 13px; color: var(--cyber-text-secondary); }

// ===== Chat Panel =====
.chat-panel {
  max-width: var(--container-sm); margin: 0 auto;
  display: flex; flex-direction: column; height: calc(100vh - 220px);
  background: rgba(10,16,31,0.2); border: 1px solid var(--cyber-glass-border);
  border-radius: 14px; overflow: hidden;
}
.chat-messages {
  flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px;
}
.chat-empty-state {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--cyber-text-secondary);
  .chat-empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
  p { font-size: 16px; font-weight: 600; color: var(--cyber-text-primary); margin: 0 0 4px; }
  span { font-size: 12px; }
}
.chat-bubble-item {
  display: flex; gap: 10px; max-width: 85%;
  &.cb-user { align-self: flex-end; flex-direction: row-reverse; }
  &.cb-agent { align-self: flex-start; }
}
.cb-role {
  width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
  font-size: 16px; flex-shrink: 0;
  .cb-user & { background: var(--cyber-glass-border); border: 1px solid var(--cyber-glass-border-hover); }
  .cb-agent & { background: rgba(157,92,255,0.12); border: 1px solid rgba(157,92,255,0.2); }
}
.cb-content {
  padding: 10px 14px; border-radius: 12px; line-height: 1.5;
  .cb-user & { background: var(--cyber-glass-border); border: 1px solid var(--cyber-glass-border); }
  .cb-agent & { background: rgba(157,92,255,0.06); border: 1px solid rgba(157,92,255,0.12); }
}
.cb-text { font-size: 13px; color: var(--cyber-text-primary); white-space: pre-wrap; word-break: break-word; }
.cb-time { font-size: 10px; color: var(--cyber-text-secondary); margin-top: 4px; }
.cb-typing {
  display: flex; gap: 4px; padding: 4px 0;
  span {
    width: 6px; height: 6px; border-radius: 50%; background: var(--cyber-purple);
    animation: typingBounce 1.2s ease-in-out infinite;
    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }
}
@keyframes typingBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
.chat-input-bar {
  display: flex; gap: 10px; padding: 14px 16px;
  border-top: 1px solid var(--cyber-glass-border);
  background: rgba(10,16,31,0.4);
}
</style>
