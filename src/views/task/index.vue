<template>
  <div class="task-list-page">
    <!-- 筛选栏 -->
    <el-card shadow="hover" class="filter-card">
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
    </el-card>

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
      <div v-if="selectedTasks.length > 0" class="toolbar-right">
        <span class="selected-count">已选 {{ selectedTasks.length }} 项</span>
        <el-button type="primary" size="small" @click="handleBatchTodo"
          >批量移入待办</el-button
        >
        <el-dropdown trigger="click" @command="handleBatchStatusChange">
          <el-button type="warning" size="small">
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
        <el-button type="danger" size="small" @click="handleBatchRemove"
          >批量移出待办</el-button
        >
      </div>
    </div>

    <!-- 列表视图 -->
    <el-card v-show="viewMode === 'table'" shadow="hover" class="table-card">
      <el-table
        ref="tableRef"
        :data="paginatedTasks"
        stripe
        style="width: 100%"
        row-class-name="task-row"
        @row-click="handleRowClick"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="45" fixed="left" />
        <el-table-column prop="sourceId" label="单号" width="80" />
        <el-table-column
          prop="project"
          label="项目名称"
          width="140"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span>{{ row.project || row.customer || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="customDescription"
          label="任务简述"
          min-width="160"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span class="desc-text">{{
              row.customDescription || row.description?.slice(0, 60) || '-'
            }}</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="title"
          label="任务标题"
          min-width="200"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <div class="title-cell">
              <el-tag
                v-if="taskStore.isInTodoList(row.id)"
                size="small"
                class="todo-badge"
                effect="plain"
                type="warning"
                >AI待办</el-tag
              >
              <span>{{ row.title }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          prop="module"
          label="模块"
          width="100"
          show-overflow-tooltip
        />
        <el-table-column prop="priority" label="优先级" width="70">
          <template #default="{ row }">
            <el-tag :type="getPriorityType(row.priority)" size="small">{{
              getPriorityLabel(row.priority)
            }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="AI开发状态" width="110">
          <template #default="{ row }">
            <el-tag
              :type="getAiStatusType(row.aiStatus)"
              size="small"
              effect="dark"
              >{{ getAiStatusLabel(row.aiStatus) }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column prop="staleDays" label="滞留天数" width="90" sortable>
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
        <el-table-column prop="workHours" label="计划小时" width="90" sortable>
          <template #default="{ row }">
            <span>{{ row.workHours || 0 }}h</span>
          </template>
        </el-table-column>
        <el-table-column prop="deadline" label="截止时间" width="110" sortable>
          <template #default="{ row }">
            <span :class="{ 'overdue-text': isOverdue(row) }">{{
              formatDate(row.deadline)
            }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" :fixed="'right'">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              @click.stop="$router.push(`/tasks/${row.id}`)"
              >详情</el-button
            >
            <el-button link size="small" @click.stop="openProjectSettings(row)">
              <el-icon><Setting /></el-icon>配置
            </el-button>
            <el-button
              :type="taskStore.isInTodoList(row.id) ? 'success' : 'primary'"
              link
              size="small"
              @click.stop="handleToggleTodo(row)"
            >
              {{ taskStore.isInTodoList(row.id) ? 'AI待办' : '入AI待办' }}
            </el-button>
            <el-dropdown
              trigger="click"
              @command="(cmd: any) => handleStatusChange(row, cmd)"
            >
              <el-button type="warning" link size="small" @click.stop>
                状态<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="pending">待开发</el-dropdown-item>
                  <el-dropdown-item command="in_progress"
                    >开发中</el-dropdown-item
                  >
                  <el-dropdown-item command="self_test"
                    >自测完成</el-dropdown-item
                  >
                  <el-dropdown-item command="submitted"
                    >已提测</el-dropdown-item
                  >
                  <el-dropdown-item command="completed"
                    >已完结</el-dropdown-item
                  >
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-area">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="filteredTasks.length"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </el-card>

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
      title="项目配置"
      width="520px"
      @close="resetProjectForm"
    >
      <el-form :model="projectForm" label-width="110px" label-position="right">
        <el-form-item label="本地项目路径">
          <el-input
            v-model="projectForm.projectPath"
            placeholder="例: F:/projects/my-project"
            clearable
          />
        </el-form-item>
        <el-form-item label="Git 分支">
          <el-input
            v-model="projectForm.gitBranch"
            placeholder="例: feature/task-123"
            clearable
          />
        </el-form-item>
        <el-form-item label="任务页面地址">
          <el-input
            v-model="projectForm.taskPageUrl"
            placeholder="内网任务页面 URL"
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
import { ref, computed, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTaskStore } from '@/stores/task';
import {
  Search,
  RefreshRight,
  Download,
  ArrowDown,
  List,
  Grid,
  Setting
} from '@element-plus/icons-vue';
import type { TaskStatus, Task } from '@/types';
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
const projectForm = reactive({
  projectPath: '',
  gitBranch: '',
  taskPageUrl: ''
});

const modules = computed(() => {
  const set = new Set(taskStore.tasks.map((t) => t.module).filter(Boolean));
  return Array.from(set);
});

const filteredTasks = computed(() => {
  let list = [...taskStore.tasks];
  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    list = list.filter(
      (t) => t.title.toLowerCase().includes(kw) || t.sourceId.includes(kw)
    );
  }
  if (filters.status) list = list.filter((t) => t.status === filters.status);
  if (filters.priority)
    list = list.filter((t) => t.priority === filters.priority);
  if (filters.module) list = list.filter((t) => t.module === filters.module);
  return list.sort(
    (a, b) =>
      new Date(b.updateTime).getTime() - new Date(a.updateTime).getTime()
  );
});

const paginatedTasks = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredTasks.value.slice(start, start + pageSize.value);
});

const kanbanColumns = [
  { key: 'pending', label: '待开发', color: '#909399' },
  { key: 'in_progress', label: '开发中', color: '#e6a23c' },
  { key: 'self_test', label: '自测完成', color: '#409eff' },
  { key: 'submitted', label: '已提测', color: '#67c23a' },
  { key: 'completed', label: '已完结', color: '#5dbf73' },
  { key: 'rejected', label: '已驳回', color: '#f56c6c' }
];

function getTasksByStatus(status: string) {
  return filteredTasks.value.filter((t) => t.status === status);
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
}

function handleReset() {
  filters.keyword = '';
  filters.status = '';
  filters.priority = '';
  filters.module = '';
  currentPage.value = 1;
}

async function handleSync() {
  try {
    await taskStore.syncTasks();
    ElMessage.success('同步完成');
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

function handleRowClick(row: Task) {
  router.push(`/tasks/${row.id}`);
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
  ElMessageBox.confirm(
    '请确认需求信息已完善（项目路径、Git 分支、任务页面地址等），确认后将加入 AI 待办列表。',
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
function openProjectSettings(task: Task) {
  currentEditTask.value = task;
  projectForm.projectPath = task.projectPath || '';
  projectForm.gitBranch = task.gitBranch || '';
  projectForm.taskPageUrl = task.taskPageUrl || '';
  projectDialogVisible.value = true;
}

function resetProjectForm() {
  projectForm.projectPath = '';
  projectForm.gitBranch = '';
  projectForm.taskPageUrl = '';
  currentEditTask.value = null;
}

async function saveProjectSettings() {
  if (!currentEditTask.value) return;
  saving.value = true;
  try {
    await taskStore.updateTask(currentEditTask.value.id, {
      projectPath: projectForm.projectPath,
      gitBranch: projectForm.gitBranch,
      taskPageUrl: projectForm.taskPageUrl
    });
    ElMessage.success('配置已保存');
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
    ai_review: 'primary',
    ai_done: 'success'
  };
  return map[aiStatus] || 'info';
}

function getAiStatusLabel(aiStatus: string): string {
  const map: Record<string, string> = {
    '': '-',
    ai_todo: 'AI待办',
    ai_review: '待审核',
    ai_done: 'AI完成'
  };
  return map[aiStatus] || aiStatus;
}

function formatDate(date: string): string {
  return dayjs(date).format('MM-DD HH:mm');
}

onMounted(() => {
  taskStore.fetchTasks();
});
</script>

<style lang="scss" scoped>
.task-list-page {
  // max-width: 1600px;
  margin: 0 auto;
}

.filter-card {
  margin-bottom: 16px;

  :deep .el-card__body {
    padding: 16px 20px;
  }
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
  color: #409eff;
  font-size: 13px;
  font-weight: 600;
  margin-right: 4px;
}

.table-card {
  :deep .task-row {
    cursor: pointer;
    &:hover {
      background-color: #f5f7fa;
    }
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
  color: #606266;
  font-size: 13px;
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
  background: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
}

.kanban-header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 3px solid;
  background: #fff;
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
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  cursor: pointer;
  transition:
    box-shadow 0.2s,
    transform 0.2s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  border-left: 3px solid transparent;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
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
  color: #909399;
  font-size: 12px;
}

.kanban-card-title {
  font-size: 14px;
  color: #303133;
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

.kanban-deadline {
  font-size: 12px;
  color: #909399;

  &.overdue {
    color: #f56c6c;
    font-weight: 600;
  }
}
</style>
