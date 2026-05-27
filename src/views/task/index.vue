<template>
  <div class="task-list-page">
    <!-- 筛选栏 -->
    <div class="cyber-panel filter-card">
      <el-row :gutter="16" align="middle">
        <el-col :span="6">
          <el-input
            v-model="filters.keyword"
            placeholder="搜索任务标题/ID..."
            :prefix-icon="Search"
            clearable
            @clear="handleSearch"
            @keyup.enter="handleSearch"
          />
        </el-col>
        <el-col :span="4">
          <el-select
            v-model="filters.status"
            placeholder="任务状态"
            clearable
            @change="handleSearch"
          >
            <el-option label="待开发" value="pending" />
            <el-option label="开发中" value="in_progress" />
            <el-option label="自测完成" value="self_test" />
            <el-option label="已提测" value="submitted" />
            <el-option label="已完结" value="completed" />
            <el-option label="已驳回" value="rejected" />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-select
            v-model="filters.priority"
            placeholder="优先级"
            clearable
            @change="handleSearch"
          >
            <el-option label="紧急" value="urgent" />
            <el-option label="高" value="high" />
            <el-option label="中" value="medium" />
            <el-option label="低" value="low" />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-select
            v-model="filters.module"
            placeholder="所属模块"
            clearable
            @change="handleSearch"
          >
            <el-option v-for="m in modules" :key="m" :label="m" :value="m" />
          </el-select>
        </el-col>
        <el-col :span="6" style="text-align: right">
          <el-button type="primary" :icon="Search" @click="handleSearch"
            >搜索</el-button
          >
          <el-button :icon="RefreshRight" @click="handleReset">重置</el-button>
          <el-button
            type="success"
            :icon="Download"
            @click="handleSync"
            :loading="taskStore.syncing"
            >同步</el-button
          >
        </el-col>
      </el-row>
    </div>

    <!-- 操作栏：左侧视图切换，右侧批量操作 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-button-group>
          <el-button
            :type="viewMode === 'table' ? 'primary' : 'default'"
            size="small"
            @click="viewMode = 'table'"
          >
            <el-icon><List /></el-icon>
          </el-button>
          <el-button
            :type="viewMode === 'kanban' ? 'primary' : 'default'"
            size="small"
            @click="viewMode = 'kanban'"
          >
            <el-icon><Grid /></el-icon>
          </el-button>
        </el-button-group>
      </div>
      <div class="toolbar-right">
        <span v-if="selectedTasks.length > 0" class="selected-count"
          >已选 {{ selectedTasks.length }} 项</span
        >
        <el-button
          type="primary"
          size="small"
          :disabled="selectedTasks.length === 0"
          @click="handleBatchTodo"
          >批量入AI待办</el-button
        >
        <el-button
          type="success"
          size="small"
          :disabled="selectedTasks.length === 0"
          @click="handleBatchSettings"
          >批量设置</el-button
        >
        <el-dropdown trigger="click" @command="handleBatchStatusChange">
          <el-button
            type="warning"
            size="small"
            :disabled="selectedTasks.length === 0"
          >
            批量修改状态<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="pending">待开发</el-dropdown-item>
              <el-dropdown-item command="in_progress">开发中</el-dropdown-item>
              <el-dropdown-item command="self_test">自测完成</el-dropdown-item>
              <el-dropdown-item command="submitted">已提测</el-dropdown-item>
              <el-dropdown-item command="completed">已完结</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button
          type="danger"
          size="small"
          :disabled="selectedTasks.length === 0"
          @click="handleBatchRemove"
          >批量移出待办</el-button
        >
      </div>
    </div>

    <!-- 列表视图 -->
    <div v-show="viewMode === 'table'" class="cyber-panel table-card">
      <el-table
        ref="tableRef"
        :data="taskStore.tasks"
        stripe
        style="width: 100%"
        row-class-name="task-row"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="45" fixed="left" />
        <el-table-column prop="sourceId" label="单号" width="140" />
        <el-table-column
          prop="project"
          label="项目名称"
          min-width="260"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span>{{ row.project || row.customer || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="customDescription"
          label="任务简述"
          min-width="360"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span class="desc-text">{{
              row.customDescription || row.description?.slice(0, 60) || '-'
            }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="AI开发状态" width="130">
          <template #default="{ row }">
            <el-tag
              v-if="row.aiStatus"
              :type="getAiStatusType(row.aiStatus)"
              size="small"
              effect="dark"
              >{{ getAiStatusLabel(row.aiStatus) }}</el-tag
            >
            <span v-else class="status-idle">未加入</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="module"
          label="模块"
          width="200"
          show-overflow-tooltip
        />
        <el-table-column prop="priority" label="优先级" width="120">
          <template #default="{ row }">
            <el-tag :type="getPriorityType(row.priority)" size="small">{{
              getPriorityLabel(row.priority)
            }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="workHours" label="计划小时" width="120" sortable>
          <template #default="{ row }">
            <span>{{ row.workHours || 0 }}h</span>
          </template>
        </el-table-column>
        <el-table-column prop="staleDays" label="滞留天数" width="120" sortable>
          <template #default="{ row }">
            <span
              :class="{
                'stale-warn': row.staleDays > 3,
                'stale-danger': row.staleDays > 7
              }"
              >{{ row.staleDays || 0 }}天</span
            >
          </template>
        </el-table-column>
        <el-table-column prop="deadline" label="截止时间" width="140" sortable>
          <template #default="{ row }">
            <span :class="{ 'overdue-text': isOverdue(row) }">{{
              formatDate(row.deadline)
            }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" :fixed="'right'">
          <template #default="{ row }">
            <div class="ops">
              <span class="op" @click.stop="$router.push(`/tasks/${row.id}`)">
                <el-icon><View /></el-icon>详情
              </span>
              <span class="op" @click.stop="openProjectSettings(row)">
                <el-icon><Setting /></el-icon>配置
              </span>
              <span
                class="op"
                :class="taskStore.isInTodoList(row.id) ? 'op-active' : 'op-todo'"
                @click.stop="handleToggleTodo(row)"
              >
                <el-icon><Promotion /></el-icon>{{ taskStore.isInTodoList(row.id) ? 'AI待办' : '入待办' }}
              </span>
              <el-dropdown trigger="click" @command="(cmd) => handleStatusChange(row, cmd)">
                <span class="op" @click.stop>
                  <el-icon><Switch /></el-icon>状态
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="pending">待开发</el-dropdown-item>
                    <el-dropdown-item command="in_progress">开发中</el-dropdown-item>
                    <el-dropdown-item command="self_test">自测完成</el-dropdown-item>
                    <el-dropdown-item command="submitted">已提测</el-dropdown-item>
                    <el-dropdown-item command="completed">已完结</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-area">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="taskStore.totalTasks"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </div>

    <!-- 看板视图 -->
    <div v-show="viewMode === 'kanban'" class="kanban-view">
      <div
        v-for="status in kanbanColumns"
        :key="status.key"
        class="kanban-column"
      >
        <div class="kanban-header" :style="{ borderTopColor: status.color }">
          <span class="kanban-title">{{ status.label }}</span>
          <el-tag size="small" round>{{
            getTasksByStatus(status.key).length
          }}</el-tag>
        </div>
        <div class="kanban-body">
          <div
            v-for="task in getTasksByStatus(status.key).slice(0, 10)"
            :key="task.id"
            class="kanban-card"
            :class="{ 'in-todo': taskStore.isInTodoList(task.id) }"
            @click="$router.push(`/tasks/${task.id}`)"
          >
            <div class="kanban-card-header">
              <div class="kanban-left">
                <el-tag :type="getPriorityType(task.priority)" size="small">{{
                  getPriorityLabel(task.priority)
                }}</el-tag>
                <el-tag
                  v-if="taskStore.isInTodoList(task.id)"
                  size="small"
                  type="warning"
                  effect="plain"
                  >AI待办</el-tag
                >
              </div>
              <span class="kanban-id">#{{ task.sourceId }}</span>
            </div>
            <div class="kanban-card-title">{{ task.title }}</div>
            <div class="kanban-card-footer">
              <span
                class="kanban-deadline"
                :class="{ overdue: isOverdue(task) }"
              >
                {{ formatDate(task.deadline) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 项目配置对话框 -->
    <el-dialog
      v-model="projectDialogVisible"
      :title="isBatchMode ? '批量项目配置' : '项目配置'"
      width="560px"
      @close="resetProjectForm"
    >
      <div v-if="isBatchMode" class="batch-info">
        <el-tag type="info" size="small"
          >已选 {{ selectedTasks.length }} 项 · {{ batchProjectName }}</el-tag
        >
      </div>
      <el-form :model="projectForm" label-width="110px" label-position="right">
        <el-form-item label="项目配置">
          <el-select
            v-model="selectedProjectName"
            placeholder="选择已配置的项目（自动填充路径和分支）"
            clearable
            filterable
            style="width:100%"
            @change="handleProjectSelect"
          >
            <el-option
              v-for="p in projectConfigs"
              :key="p.id"
              :label="p.name"
              :value="p.name"
            >
              <span>{{ p.name }}</span>
              <span style="float:right;color:#909399;font-size:12px">{{ p.localPath || '未配置路径' }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="本地项目路径">
          <el-input
            v-model="projectForm.projectPath"
            placeholder="例: F:/projects/my-project"
            clearable
          />
        </el-form-item>
        <el-form-item label="Git 分支">
          <el-select
            v-model="projectForm.gitBranch"
            placeholder="选择或输入分支"
            clearable
            filterable
            allow-create
            style="width:100%"
          >
            <el-option
              v-for="b in selectedProjectBranches"
              :key="b"
              :label="b"
              :value="b"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isBatchMode" label="需求文件路径">
          <el-input
            v-model="projectForm.taskPageUrl"
            placeholder="需求对应的项目文件路径，如 src/views/login/index.vue"
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projectDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveProjectSettings" :loading="saving"
          >保存</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTaskStore } from '@/stores/task';
import {
  Search,
  RefreshRight,
  Download,
  ArrowDown,
  List,
  Grid,
  Setting,
  View,
  Promotion,
  Switch
} from '@element-plus/icons-vue';
import type { TaskStatus, Task } from '@/types';
import { projectApi, type ProjectConfig } from '@/api/project';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ElTable } from 'element-plus';

const router = useRouter();
const taskStore = useTaskStore();

const viewMode = ref<'table' | 'kanban'>('table');
const currentPage = ref(1);
const pageSize = ref(20);
const tableRef = ref<InstanceType<typeof ElTable> | null>(null);
const selectedTasks = ref<Task[]>([]);

const filters = reactive({
  keyword: '',
  status: '' as string,
  priority: '' as string,
  module: '' as string
});

// Project settings dialog
const projectDialogVisible = ref(false);
const saving = ref(false);
const currentEditTask = ref<Task | null>(null);
const isBatchMode = ref(false);
const batchProjectName = ref('');
const projectConfigs = ref<ProjectConfig[]>([]);
const selectedProjectName = ref('');
const selectedProjectBranches = ref<string[]>([]);
const projectForm = reactive({
  projectPath: '',
  gitBranch: '',
  taskPageUrl: ''
});

const modules = ref<string[]>([]);

const kanbanColumns = [
  { key: 'pending', label: '待开发', color: '#909399' },
  { key: 'in_progress', label: '开发中', color: '#e6a23c' },
  { key: 'self_test', label: '自测完成', color: '#409eff' },
  { key: 'submitted', label: '已提测', color: '#67c23a' },
  { key: 'completed', label: '已完结', color: '#5dbf73' },
  { key: 'rejected', label: '已驳回', color: '#f56c6c' }
];

async function loadData() {
  await taskStore.fetchTasks({
    page: currentPage.value,
    pageSize: pageSize.value,
    keyword: filters.keyword || undefined,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    module: filters.module || undefined,
  });
  const set = new Set<string>(taskStore.tasks.map((t: Task) => t.module).filter(Boolean));
  modules.value = Array.from(set);
}

function getTasksByStatus(status: string) {
  return taskStore.tasks.filter((t) => t.status === status);
}

function handleSelectionChange(rows: Task[]) {
  selectedTasks.value = rows;
}

async function handleBatchTodo() {
  const count = selectedTasks.value.length;
  for (const task of selectedTasks.value) {
    if (!taskStore.isInTodoList(task.id)) taskStore.toggleTodo(task);
  }
  ElMessage.success(`已将 ${count} 个任务移入 AI 待办`);
}

async function handleBatchRemove() {
  const count = selectedTasks.value.length;
  for (const task of selectedTasks.value) {
    if (taskStore.isInTodoList(task.id)) taskStore.toggleTodo(task);
  }
  ElMessage.success(`已将 ${count} 个任务移出 AI 待办`);
}

async function handleBatchStatusChange(status: string) {
  const label = getStatusLabel(status);
  try {
    for (const task of selectedTasks.value) {
      await taskStore.updateTaskStatus(task.id, status as TaskStatus);
    }
    ElMessage.success(
      `已将 ${selectedTasks.value.length} 个任务状态修改为「${label}」`
    );
  } catch {
    ElMessage.error('批量修改状态失败');
  }
}

function handleSearch() {
  currentPage.value = 1;
  loadData();
}

function handleReset() {
  filters.keyword = '';
  filters.status = '';
  filters.priority = '';
  filters.module = '';
  currentPage.value = 1;
  loadData();
}

async function handleSync() {
  try {
    await taskStore.syncTasks();
    ElMessage.success('同步完成');
    await loadData();
  } catch {
    ElMessage.error('同步失败');
  }
}

async function handleStatusChange(task: Task, status: string) {
  try {
    await taskStore.updateTaskStatus(task.id, status as TaskStatus);
    ElMessage.success('状态已更新');
  } catch {
    ElMessage.error('状态更新失败');
  }
}

function isOverdue(task: Task) {
  return (
    task.status !== 'completed' &&
    new Date(task.deadline).getTime() < Date.now()
  );
}

function handleToggleTodo(task: Task) {
  if (taskStore.isInTodoList(task.id)) {
    taskStore.toggleTodo(task);
    ElMessage.success('已移出 AI 待办');
    return;
  }
  if (!task.customDescription) {
    ElMessage.warning('请先补充「自定义描述」后再加入 AI 待办');
    return;
  }
  if (!task.projectPath) {
    ElMessage.warning('请先设置「本地项目路径」后再加入 AI 待办');
    return;
  }
  if (!task.gitBranch) {
    ElMessage.warning('请先设置「Git 分支」后再加入 AI 待办');
    return;
  }
  ElMessageBox.confirm(
    '请确认需求信息已完善（项目路径、Git 分支、需求文件路径等），确认后将加入 AI 待办列表。',
    '确认加入 AI 待办',
    { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
  )
    .then(() => {
      taskStore.toggleTodo(task);
      ElMessage.success('已加入 AI 待办');
    })
    .catch(() => {});
}

// Project settings
async function loadProjectConfigs() {
  try {
    const res = await projectApi.list();
    projectConfigs.value = res.data;
  } catch { /* ignore */ }
}

function handleProjectSelect(name: string) {
  const config = projectConfigs.value.find(p => p.name === name);
  if (config) {
    if (config.localPath) projectForm.projectPath = config.localPath;
    if (config.defaultBranch) projectForm.gitBranch = config.defaultBranch;
    selectedProjectBranches.value = [...config.branches];
  } else {
    selectedProjectBranches.value = [];
  }
}

async function openProjectSettings(task: Task) {
  isBatchMode.value = false;
  batchProjectName.value = '';
  currentEditTask.value = task;
  projectForm.projectPath = task.projectPath || '';
  projectForm.gitBranch = task.gitBranch || '';
  projectForm.taskPageUrl = task.taskPageUrl || '';
  selectedProjectName.value = '';
  selectedProjectBranches.value = [];

  await loadProjectConfigs();

  // Auto-select matching project config
  const projectName = task.project || task.customer || '';
  const match = projectConfigs.value.find(p => p.name === projectName);
  if (match) {
    selectedProjectName.value = match.name;
    selectedProjectBranches.value = [...match.branches];
    if (!projectForm.projectPath && match.localPath) projectForm.projectPath = match.localPath;
    if (!projectForm.gitBranch && match.defaultBranch) projectForm.gitBranch = match.defaultBranch;
  }

  projectDialogVisible.value = true;
}

async function handleBatchSettings() {
  const selected = selectedTasks.value;
  const projectName = selected[0]?.project || selected[0]?.customer || '';
  const sameProject = selected.every(
    (t) => (t.project || t.customer) === projectName
  );
  if (!sameProject) {
    ElMessage.warning('所选任务必须属于同一项目才能批量设置');
    return;
  }
  isBatchMode.value = true;
  batchProjectName.value = projectName;
  projectForm.projectPath = '';
  projectForm.gitBranch = '';
  projectForm.taskPageUrl = '';
  selectedProjectName.value = '';
  selectedProjectBranches.value = [];

  await loadProjectConfigs();

  // Auto-select matching project config
  const match = projectConfigs.value.find(p => p.name === projectName);
  if (match) {
    selectedProjectName.value = match.name;
    selectedProjectBranches.value = [...match.branches];
    if (match.localPath) projectForm.projectPath = match.localPath;
    if (match.defaultBranch) projectForm.gitBranch = match.defaultBranch;
  }

  projectDialogVisible.value = true;
}

function resetProjectForm() {
  projectForm.projectPath = '';
  projectForm.gitBranch = '';
  projectForm.taskPageUrl = '';
  currentEditTask.value = null;
  selectedProjectName.value = '';
  selectedProjectBranches.value = [];
}

async function saveProjectSettings() {
  saving.value = true;
  try {
    const payload: Record<string, string> = {};
    if (projectForm.projectPath) payload.projectPath = projectForm.projectPath;
    if (projectForm.gitBranch) payload.gitBranch = projectForm.gitBranch;
    if (projectForm.taskPageUrl) payload.taskPageUrl = projectForm.taskPageUrl;

    if (isBatchMode.value) {
      for (const task of selectedTasks.value) {
        await taskStore.updateTask(task.id, payload);
      }
      ElMessage.success(`已批量配置 ${selectedTasks.value.length} 个任务`);
    } else if (currentEditTask.value) {
      await taskStore.updateTask(currentEditTask.value.id, payload);
      ElMessage.success('配置已保存');
    }
    projectDialogVisible.value = false;
  } catch {
    ElMessage.error('保存失败');
  } finally {
    saving.value = false;
  }
}

// Utility functions
function getStatusType(
  status: string
): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<
    string,
    'success' | 'primary' | 'warning' | 'danger' | 'info'
  > = {
    pending: 'info',
    in_progress: 'warning',
    self_test: 'primary',
    submitted: 'success',
    completed: 'success',
    rejected: 'danger'
  };
  return map[status] || 'info';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待开发',
    in_progress: '开发中',
    self_test: '自测完成',
    submitted: '已提测',
    completed: '已完结',
    rejected: '已驳回'
  };
  return labels[status] || status;
}

function getPriorityType(
  priority: string
): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<
    string,
    'success' | 'primary' | 'warning' | 'danger' | 'info'
  > = {
    urgent: 'danger',
    high: 'warning',
    medium: 'info',
    low: 'success'
  };
  return map[priority] || 'info';
}

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    urgent: '紧急',
    high: '高',
    medium: '中',
    low: '低'
  };
  return labels[priority] || priority;
}

function getAiStatusType(
  aiStatus: string
): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<
    string,
    'success' | 'primary' | 'warning' | 'danger' | 'info'
  > = {
    '': 'info',
    ai_todo: 'warning',
    ai_rework: 'danger',
    ai_dev: 'primary',
    ai_review: 'primary',
    ai_done: 'success',
    ai_question: 'warning'
  };
  return map[aiStatus] || 'info';
}

function getAiStatusLabel(aiStatus: string): string {
  const map: Record<string, string> = {
    '': '-',
    ai_todo: 'AI待办',
    ai_rework: '待返工',
    ai_dev: '开发中',
    ai_review: '待审核',
    ai_question: '待回复',
    ai_done: 'AI完成'
  };
  return map[aiStatus] || '未加入';
}

function formatDate(date: string): string {
  return dayjs(date).format('MM-DD HH:mm');
}

watch([currentPage, pageSize], () => { loadData(); });

onMounted(() => {
  loadData();
});
</script>

<style lang="scss" scoped>
.task-list-page {
  margin: 0 auto;
  position: relative;
  min-height: 100%;
}

.filter-card,
.table-card,
.kanban-view,
.pagination-area,
.toolbar {
  position: relative;
  z-index: 1;
}

.filter-card {
  margin-bottom: 16px;
  padding: 16px 20px;
}

.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selected-count {
  color: var(--cyber-cyan, #00E5FF);
  font-size: 13px;
  font-weight: 600;
  margin-right: 4px;
}

.table-card {
  :deep .task-row {
    cursor: pointer;
    td {
      text-align: center;
    }
    &:hover {
      background-color: rgba(0, 229, 255, 0.06);
    }
  }
  :deep .el-table__cell {
    text-align: center;
  }
}

.title-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.todo-badge {
  flex-shrink: 0;
}

.overdue-text {
  color: #f56c6c;
  font-weight: 600;
}

.desc-text {
  color: var(--cyber-text-secondary);
  font-size: 13px;
}

.status-idle {
  color: var(--cyber-text-secondary);
  font-size: 12px;
}

.stale-warn {
  color: #e6a23c;
  font-weight: 600;
}

.stale-danger {
  color: #f56c6c;
  font-weight: 600;
}

.pagination-area {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 看板视图 */
.kanban-view {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 16px;
}

.kanban-column {
  min-width: 280px;
  max-width: 320px;
  flex-shrink: 0;
  background: rgba(10, 16, 31, 0.15);
  border: 1px solid var(--cyber-glass-border);
  border-radius: 8px;
  overflow: hidden;
  backdrop-filter: blur(12px);
}

.kanban-header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 3px solid;
  background: transparent;
  color: var(--cyber-text-primary);
  font-weight: 600;
  font-size: 14px;
}

.kanban-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100vh - 340px);
  overflow-y: auto;
}

.kanban-card {
  background: rgba(10, 16, 31, 0.15);
  border: 1px solid var(--cyber-glass-border);
  border-radius: 8px;
  padding: 14px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition:
    box-shadow 0.2s,
    transform 0.2s;
  box-shadow: none;
  border-left: 3px solid transparent;

  &:hover {
    transform: translateY(-1px);
    box-shadow: var(--cyber-glow-cyan);
  }

  &.in-todo {
    border-left-color: #e6a23c;
  }
}

.kanban-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.kanban-left {
  display: flex;
  gap: 4px;
}

.kanban-id {
  color: var(--cyber-text-secondary);
  font-size: 12px;
}

.kanban-card-title {
  font-size: 14px;
  color: var(--cyber-text-primary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.kanban-card-footer {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.ops {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.op {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  font-size: 12px;
  color: #00E5FF;
  cursor: pointer;
  border-radius: 6px;
  transition:
    color 0.15s,
    background 0.15s,
    text-shadow 0.15s;
  user-select: none;

  .el-icon { font-size: 13px; }
  &:hover {
    color: #00E5FF;
    background: rgba(0, 229, 255, 0.12);
    text-shadow: 0 0 8px rgba(0, 229, 255, 0.4);
  }
}

.op-todo {
  color: #00E5FF;
  font-weight: 500;
  &:hover {
    background: rgba(0, 229, 255, 0.08);
  }
}

.op-active {
  color: #9D5CFF;
  font-weight: 500;
  &:hover {
    background: rgba(157, 92, 255, 0.08);
  }
}

.kanban-deadline {
  font-size: 12px;
  color: var(--cyber-text-secondary);

  &.overdue {
    color: #f56c6c;
    font-weight: 600;
  }
}

.batch-info {
  margin-bottom: 16px;
}

.linked-config-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: rgba(0, 229, 255, 0.08);
  border: 1px solid var(--cyber-glass-border);
  border-radius: 6px;
}
</style>
