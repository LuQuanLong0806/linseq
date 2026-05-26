<template>
  <div class="task-detail-page" v-loading="taskStore.loading">
    <div v-if="taskStore.currentTask" class="detail-container">
      <!-- 头部信息 -->
      <div class="detail-header">
        <div class="header-left">
          <el-button :icon="ArrowLeft" @click="$router.back()" circle size="small" />
          <div class="title-area">
            <h2>{{ task.title }}</h2>
            <div class="meta-tags">
              <el-tag :type="getStatusType(task.status)" effect="dark" size="default">{{ getStatusLabel(task.status) }}</el-tag>
              <el-tag :type="getPriorityType(task.priority)" size="default">{{ getPriorityLabel(task.priority) }}</el-tag>
              <el-tag v-if="task.project" type="info" size="default">{{ task.project }}</el-tag>
              <el-tag v-if="task.bugOrReq" size="default" effect="plain">{{ getBugOrReqLabel(task.bugOrReq) }}</el-tag>
              <span class="meta-id">#{{ task.sourceId }}</span>
              <span v-if="task.workHours" class="meta-hours">工时: {{ task.workHours }}h</span>
            </div>
          </div>
        </div>
        <div class="header-right">
          <el-button type="primary" @click="handleStartDev" v-if="task.status === 'pending'" :icon="VideoPlay">开始开发</el-button>
          <el-button type="success" @click="handleSelfTest" v-if="task.status === 'in_progress'" :icon="CircleCheck">自测完成</el-button>
          <el-button type="warning" @click="handleSubmit" v-if="task.status === 'self_test'" :icon="Upload">提交测试</el-button>
          <el-dropdown trigger="click" @command="handleStatusCommand">
            <el-button>更多操作<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="pending">重置为待开发</el-dropdown-item>
                <el-dropdown-item command="in_progress">开发中</el-dropdown-item>
                <el-dropdown-item command="self_test">自测完成</el-dropdown-item>
                <el-dropdown-item command="completed">已完结</el-dropdown-item>
                <el-dropdown-item command="rejected">已驳回</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <el-row :gutter="20">
        <!-- 左侧：需求 + 验收标准 -->
        <el-col :span="16">
          <!-- 需求描述（内网原始 + 自定义补充） -->
          <el-card shadow="hover" class="content-card">
            <template #header>
              <span class="card-title">任务描述</span>
            </template>
            <div class="desc-section">
              <div class="desc-label">原始描述</div>
              <div class="desc-content">{{ task.description || task.title }}</div>
            </div>
            <el-divider />
            <div class="desc-section">
              <div class="desc-label">
                自定义补充
                <el-button type="primary" link size="small" @click="startEdit('customDescription')">编辑</el-button>
              </div>
              <div class="desc-content" v-if="task.customDescription" v-html="task.customDescription"></div>
              <div class="desc-content empty" v-else>点击编辑按钮补充需求描述</div>
            </div>
          </el-card>

          <!-- 需求文档 -->
          <el-card shadow="hover" class="content-card" style="margin-top:20px;">
            <template #header>
              <div class="card-header-flex">
                <span class="card-title">需求文档</span>
                <el-button type="primary" link size="small" @click="startEdit('requirementDoc')">编辑</el-button>
              </div>
            </template>
            <div class="desc-content" v-if="task.requirementDoc" v-html="task.requirementDoc"></div>
            <div class="desc-content empty" v-else>点击编辑按钮添加需求文档链接或内容</div>
          </el-card>

          <!-- 验收标准 -->
          <el-card shadow="hover" class="content-card" style="margin-top:20px;">
            <template #header>
              <div class="card-header-flex">
                <span class="card-title">验收标准</span>
                <el-button type="primary" link size="small" @click="startEdit('acceptanceCriteria')">编辑</el-button>
              </div>
            </template>
            <div class="desc-content" v-if="task.acceptanceCriteria" v-html="task.acceptanceCriteria"></div>
            <div class="desc-content empty" v-else>点击编辑按钮添加验收标准</div>
          </el-card>

          <!-- 开发记录 -->
          <el-card shadow="hover" class="content-card" style="margin-top:20px;">
            <template #header>
              <div class="card-header-flex">
                <span class="card-title">开发记录</span>
                <el-button type="primary" link size="small" @click="showAddLog = true">+ 添加</el-button>
              </div>
            </template>
            <el-timeline v-if="task.devLog?.length">
              <el-timeline-item
                v-for="log in task.devLog"
                :key="log.id"
                :timestamp="formatDateTime(log.time)"
                placement="top"
                :type="log.autoFixed ? 'warning' : 'primary'"
              >
                <div class="log-entry">
                  <el-tag size="small" :type="getLogActionType(log.action)">{{ log.action }}</el-tag>
                  <span class="log-content">{{ log.content }}</span>
                  <el-tag v-if="log.autoFixed" size="small" type="warning" effect="dark">自动</el-tag>
                </div>
              </el-timeline-item>
            </el-timeline>
            <div v-else class="empty-log">暂无开发记录</div>
          </el-card>
        </el-col>

        <!-- 右侧：信息面板 -->
        <el-col :span="8">
          <!-- 自定义字段（可编辑） -->
          <el-card shadow="hover" class="info-card">
            <template #header>
              <div class="card-header-flex">
                <span class="card-title">开发配置</span>
                <el-button type="primary" link size="small" @click="openDevConfig()">编辑</el-button>
              </div>
            </template>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="项目路径">
                <span v-if="task.projectPath" class="path-text">{{ task.projectPath }}</span>
                <span v-else class="empty-text">未设置</span>
              </el-descriptions-item>
              <el-descriptions-item label="Git 分支">
                <span v-if="task.gitBranch" class="branch-text">{{ task.gitBranch }}</span>
                <span v-else class="empty-text">未设置</span>
              </el-descriptions-item>
              <el-descriptions-item label="内网单号">{{ task.sourceId }}</el-descriptions-item>
              <el-descriptions-item label="流程状态">{{ task.intranetNodeName || '-' }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 内网任务信息（只读） -->
          <el-card shadow="hover" class="info-card" style="margin-top:20px;">
            <template #header>
              <span class="card-title">任务信息</span>
            </template>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="项目">{{ task.project || '-' }}</el-descriptions-item>
              <el-descriptions-item label="客户">{{ task.customer || '-' }}</el-descriptions-item>
              <el-descriptions-item label="客户经理">{{ task.customerManager || '-' }}</el-descriptions-item>
              <el-descriptions-item label="产品">{{ task.product || '-' }}</el-descriptions-item>
              <el-descriptions-item label="模块">{{ task.module || '-' }}</el-descriptions-item>
              <el-descriptions-item label="产品经理">{{ task.productManager || '-' }}</el-descriptions-item>
              <el-descriptions-item label="研发负责人">{{ task.devLeader || '-' }}</el-descriptions-item>
              <el-descriptions-item label="督办人">{{ task.supervisor || '-' }}</el-descriptions-item>
              <el-descriptions-item label="开发人员">{{ task.developer || '-' }}</el-descriptions-item>
              <el-descriptions-item label="计划工时">{{ task.workHours || 0 }}h</el-descriptions-item>
              <el-descriptions-item label="优先级">{{ getPriorityLabel(task.priority) }}</el-descriptions-item>
              <el-descriptions-item label="任务类型">{{ task.taskType || '-' }}</el-descriptions-item>
              <el-descriptions-item label="需求/BUG">{{ getBugOrReqLabel(task.bugOrReq) }}</el-descriptions-item>
              <el-descriptions-item label="提交日期">{{ formatDateTime(task.submitTime) }}</el-descriptions-item>
              <el-descriptions-item label="截止时间">
                <span :class="{ 'overdue-text': isOverdue }">{{ formatDate(task.deadline) }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="滞留天数">{{ task.staleDays || 0 }}天</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ formatDateTime(task.createTime) }}</el-descriptions-item>
              <el-descriptions-item label="同步时间">{{ formatDateTime(task.syncTime) }}</el-descriptions-item>
              <el-descriptions-item label="标签">
                <el-tag v-for="tag in task.tags" :key="tag" size="small" style="margin-right:4px;">{{ tag }}</el-tag>
                <span v-if="!task.tags?.length">无</span>
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 编辑开发配置弹窗 -->
    <el-dialog v-model="showEditDevConfig" title="编辑开发配置" width="600px">
      <el-form :model="devConfigForm" label-width="100px">
        <el-form-item label="项目路径">
          <el-input v-model="devConfigForm.projectPath" placeholder="如 F:\00_project\xxx" clearable />
        </el-form-item>
        <el-form-item label="Git 分支">
          <el-input v-model="devConfigForm.gitBranch" placeholder="如 feature/login" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDevConfig = false">取消</el-button>
        <el-button type="primary" @click="handleSaveDevConfig" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑富文本字段弹窗 -->
    <el-dialog v-model="showEditField" :title="editFieldTitle" width="700px">
      <el-input
        v-model="editFieldValue"
        type="textarea"
        :rows="12"
        placeholder="支持 Markdown 格式..."
      />
      <template #footer>
        <el-button @click="showEditField = false">取消</el-button>
        <el-button type="primary" @click="handleSaveField" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加开发记录弹窗 -->
    <el-dialog v-model="showAddLog" title="添加开发记录" width="500px">
      <el-form :model="logForm" label-width="80px">
        <el-form-item label="操作类型">
          <el-select v-model="logForm.action">
            <el-option label="开发" value="开发" />
            <el-option label="修复" value="修复" />
            <el-option label="自测" value="自测" />
            <el-option label="状态变更" value="状态变更" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="记录内容">
          <el-input v-model="logForm.content" type="textarea" :rows="4" placeholder="描述开发内容..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddLog = false">取消</el-button>
        <el-button type="primary" @click="handleAddLog">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { ArrowLeft, ArrowDown, VideoPlay, CircleCheck, Upload } from '@element-plus/icons-vue'
import type { TaskStatus } from '@/types'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'

const route = useRoute()
const taskStore = useTaskStore()

const saving = ref(false)
const showAddLog = ref(false)
const showEditDevConfig = ref(false)
const showEditField = ref(false)

const logForm = reactive({ action: '开发', content: '' })

const devConfigForm = reactive({
  projectPath: '',
  gitBranch: '',
})

const editFieldKey = ref('')
const editFieldValue = ref('')
const editFieldTitle = computed(() => {
  const map: Record<string, string> = {
    customDescription: '编辑自定义描述',
    requirementDoc: '编辑需求文档',
    acceptanceCriteria: '编辑验收标准',
  }
  return map[editFieldKey.value] || '编辑'
})

const task = computed(() => taskStore.currentTask!)
const isOverdue = computed(() => {
  if (!task.value) return false
  return task.value.status !== 'completed' && new Date(task.value.deadline).getTime() < Date.now()
})

function startEdit(field: string) {
  editFieldKey.value = field
  const t = task.value as Record<string, unknown>
  editFieldValue.value = (t[field] as string) || ''
  showEditField.value = true
}

async function handleSaveField() {
  saving.value = true
  try {
    await taskStore.updateTask(task.value.id, { [editFieldKey.value]: editFieldValue.value })
    showEditField.value = false
    ElMessage.success('已保存')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

function openDevConfig() {
  devConfigForm.projectPath = task.value.projectPath || ''
  devConfigForm.gitBranch = task.value.gitBranch || ''
  showEditDevConfig.value = true
}

async function handleSaveDevConfig() {
  saving.value = true
  try {
    await taskStore.updateTask(task.value.id, {
      projectPath: devConfigForm.projectPath,
      gitBranch: devConfigForm.gitBranch,
    })
    showEditDevConfig.value = false
    ElMessage.success('开发配置已保存')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

function getStatusType(status: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
    pending: 'info', in_progress: 'warning', self_test: 'primary',
    testing: 'primary', submitted: 'success', completed: 'success', rejected: 'danger',
  }
  return map[status] || 'info'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待开发', in_progress: '开发中', self_test: '自测完成',
    testing: '测试中', submitted: '已提测', completed: '已完结', rejected: '已驳回',
  }
  return labels[status] || status
}

function getPriorityType(priority: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
    urgent: 'danger', high: 'warning', medium: 'info', low: 'success',
  }
  return map[priority] || 'info'
}

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = { urgent: '紧急', high: '高', medium: '中', low: '低' }
  return labels[priority] || priority
}

function getBugOrReqLabel(val: string): string {
  const map: Record<string, string> = { requirement: '需求', bug: 'BUG', xuqiu: '需求', sheji: '设计', wendang: '文档' }
  return map[val] || val || '-'
}

function getLogActionType(action: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
    '开发': 'primary', '修复': 'warning', '自测': 'success', '状态变更': 'info',
  }
  return map[action] || 'info'
}

function formatDate(date: string): string { return dayjs(date).format('YYYY-MM-DD') }
function formatDateTime(date: string): string { return date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-' }

async function handleStartDev() {
  await taskStore.updateTaskStatus(task.value.id, 'in_progress' as TaskStatus)
  ElMessage.success('已开始开发')
}

async function handleSelfTest() {
  await taskStore.updateTaskStatus(task.value.id, 'self_test' as TaskStatus)
  ElMessage.success('已标记自测完成')
}

async function handleSubmit() {
  await taskStore.updateTaskStatus(task.value.id, 'submitted' as TaskStatus)
  ElMessage.success('已提交测试')
}

async function handleStatusCommand(command: string) {
  await taskStore.updateTaskStatus(task.value.id, command as TaskStatus)
  ElMessage.success('状态已更新')
}

async function handleAddLog() {
  if (!logForm.content) { ElMessage.warning('请输入记录内容'); return }
  try {
    await taskStore.addDevLog(task.value.id, { action: logForm.action, content: logForm.content })
    showAddLog.value = false
    logForm.content = ''
    ElMessage.success('记录已添加')
  } catch { ElMessage.error('添加失败') }
}

onMounted(() => {
  const id = route.params.id as string
  if (id) taskStore.fetchTaskById(id)
})
</script>

<style lang="scss" scoped>
.task-detail-page { max-width: 1400px; margin: 0 auto; }

.detail-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 24px; background: #fff; padding: 20px 24px;
  border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.header-left {
  display: flex; gap: 16px; align-items: flex-start;
  .title-area h2 { margin: 0 0 8px 0; font-size: 22px; color: #303133; }
  .meta-tags { display: flex; gap: 8px; align-items: center; }
  .meta-id { color: #909399; font-size: 13px; }
  .meta-hours { color: #e6a23c; font-size: 13px; font-weight: 600; }
}
.header-right { display: flex; gap: 10px; flex-shrink: 0; }

.content-card, .info-card {
  :deep .el-card__header { padding: 12px 20px; }
  .card-title { font-weight: 600; font-size: 15px; }
}
.card-header-flex { display: flex; justify-content: space-between; align-items: center; }

.desc-section { margin-bottom: 8px; }
.desc-label { font-size: 13px; color: #909399; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
.desc-content {
  line-height: 1.8; color: #303133; font-size: 14px;
  &.empty { color: #c0c4cc; font-style: italic; }
}

.path-text { font-family: Consolas, monospace; font-size: 13px; color: #409eff; word-break: break-all; }
.branch-text { font-family: Consolas, monospace; font-size: 13px; color: #67c23a; }
.empty-text { color: #c0c4cc; font-style: italic; }

.overdue-text { color: #f56c6c; font-weight: 600; }
.log-entry { display: flex; align-items: center; gap: 8px;
  .log-content { font-size: 13px; color: #606266; }
}
.empty-log { text-align: center; color: #c0c4cc; padding: 20px; }
</style>
