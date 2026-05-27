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
        <div class="view-switch">
          <button
            class="view-btn"
            :class="{ active: taskStore.viewMode === 'table' }"
            @click="taskStore.setViewMode('table')"
            title="列表视图"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4">
              <rect x="2" y="3" width="16" height="3" rx="1" />
              <rect x="2" y="8.5" width="16" height="3" rx="1" />
              <rect x="2" y="14" width="16" height="3" rx="1" />
            </svg>
          </button>
          <button
            class="view-btn"
            :class="{ active: taskStore.viewMode === 'card' }"
            @click="taskStore.setViewMode('card')"
            title="卡片视图"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4">
              <rect x="2" y="2" width="7" height="7" rx="1.5" />
              <rect x="11" y="2" width="7" height="7" rx="1.5" />
              <rect x="2" y="11" width="7" height="7" rx="1.5" />
              <rect x="11" y="11" width="7" height="7" rx="1.5" />
            </svg>
          </button>
        </div>
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
    <div v-show="taskStore.viewMode === 'table'" class="cyber-panel table-card">
      <el-table
        ref="tableRef"
        :data="taskStore.tasks"
        stripe
        border
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
          :current-page="currentPage"
          :page-size="pageSize"
          :total="taskStore.totalTasks"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </div>

    <!-- 卡片视图 -->
    <div v-show="taskStore.viewMode === 'card'" class="card-view">
      <div
        v-for="(task, idx) in taskStore.tasks"
        :key="task.id"
        class="cyber-card"
        :class="{ 'in-todo': taskStore.isInTodoList(task.id) }"
        @click="$router.push(`/tasks/${task.id}`)"
      >
        <div class="card-glow"></div>
        <div class="card-rank">{{ idx + 1 + (currentPage - 1) * pageSize }}</div>
        <div class="card-body">
          <div class="card-head">
            <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
            <el-tag v-if="task.aiStatus" :type="getAiStatusType(task.aiStatus)" size="small" effect="dark">{{ getAiStatusLabel(task.aiStatus) }}</el-tag>
            <el-tag v-if="task.reworkCount > 0" type="danger" size="small" effect="dark">返工{{ task.reworkCount }}次</el-tag>
            <span class="card-id">#{{ task.sourceId }}</span>
          </div>
          <h3 class="card-title">{{ task.title }}</h3>
          <div class="card-meta">
            <span v-if="task.project || task.customer">{{ task.project || task.customer }}</span>
            <span v-if="task.module">{{ task.module }}</span>
            <span>{{ task.workHours || 0 }}h</span>
            <span :class="{ overdue: isOverdue(task) }">{{ formatDate(task.deadline) }}</span>
          </div>
          <div v-if="task.customDescription" class="card-desc-preview">
            <span class="desc-label">说明</span>
            <span class="desc-text">{{ task.customDescription }}</span>
          </div>
        </div>
        <div class="card-ops" @click.stop>
          <span class="op" @click="$router.push(`/tasks/${task.id}`)">
            <el-icon><View /></el-icon>详情
          </span>
          <span class="op" @click="openProjectSettings(task)">
            <el-icon><Setting /></el-icon>配置
          </span>
          <span
            class="op"
            :class="taskStore.isInTodoList(task.id) ? 'op-active' : 'op-todo'"
            @click="handleToggleTodo(task)"
          >
            <el-icon><Promotion /></el-icon>{{ taskStore.isInTodoList(task.id) ? 'AI待办' : '入待办' }}
          </span>
          <el-dropdown trigger="click" @command="(cmd) => handleStatusChange(task, cmd)">
            <span class="op" @click.stop><el-icon><Switch /></el-icon>状态</span>
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
      </div>
    </div>

    <!-- 右侧抽屉配置面板 -->
    <Transition name="fade-mask">
      <div v-if="drawerOpen" class="drawer-mask" @click="drawerOpen = false"></div>
    </Transition>
    <Transition name="drawer-slide">
      <div v-if="drawerOpen" class="task-drawer" @click.stop>
        <div class="drawer-header">
          <div class="drawer-title-area">
            <template v-if="isBatchMode">
              <el-tag type="info" size="small">已选 {{ selectedTasks.length }} 项</el-tag>
              <span class="drawer-batch-name">{{ batchProjectName }}</span>
            </template>
            <template v-else-if="currentEditTask">
              <el-tag :type="getPriorityType(currentEditTask.priority)" size="small">{{ getPriorityLabel(currentEditTask.priority) }}</el-tag>
              <span class="drawer-id">#{{ currentEditTask.sourceId }}</span>
            </template>
          </div>
          <el-button link size="small" @click="drawerOpen = false" class="drawer-close">✕</el-button>
        </div>
        <h3 v-if="currentEditTask && !isBatchMode" class="drawer-task-title">{{ currentEditTask.title }}</h3>

        <el-form label-width="80px" label-position="top" class="drawer-form">
          <el-form-item v-if="currentEditTask && !isBatchMode" label="项目名称">
            <div class="drawer-field">{{ currentEditTask.project || currentEditTask.customer || '-' }}</div>
          </el-form-item>
          <el-form-item label="项目配置">
            <el-select
              v-model="selectedProjectName"
              placeholder="选择项目自动填充路径和分支"
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
            <el-input v-model="projectForm.projectPath" placeholder="例: F:/projects/my-project" clearable />
          </el-form-item>
          <el-form-item label="Git 分支">
            <el-select v-model="projectForm.gitBranch" placeholder="选择或输入分支" clearable filterable allow-create style="width:100%">
              <el-option v-for="b in selectedProjectBranches" :key="b" :label="b" :value="b" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="!isBatchMode" label="需求文件路径">
            <el-input v-model="projectForm.taskPageUrl" placeholder="如 src/views/login/index.vue" clearable />
          </el-form-item>
          <el-form-item v-if="!isBatchMode" label="补充说明">
            <el-input v-model="projectForm.customDescription" type="textarea" :rows="4" placeholder="输入补充需求说明..." resize="none" />
          </el-form-item>
        </el-form>

        <div class="drawer-footer">
          <el-button @click="drawerOpen = false">取消</el-button>
          <el-button type="primary" @click="saveProjectSettings" :loading="saving">保存</el-button>
        </div>
      </div>
    </Transition>
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

// Right drawer
const drawerOpen = ref(false);
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
  taskPageUrl: '',
  customDescription: ''
});

const modules = ref<string[]>([]);

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
  projectForm.customDescription = task.customDescription || '';
  selectedProjectName.value = '';
  selectedProjectBranches.value = [];

  await loadProjectConfigs();

  const projectName = task.project || task.customer || '';
  const match = projectConfigs.value.find(p => p.name === projectName);
  if (match) {
    selectedProjectName.value = match.name;
    selectedProjectBranches.value = [...match.branches];
    if (!projectForm.projectPath && match.localPath) projectForm.projectPath = match.localPath;
    if (!projectForm.gitBranch && match.defaultBranch) projectForm.gitBranch = match.defaultBranch;
  }

  drawerOpen.value = true;
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
  projectForm.customDescription = '';
  selectedProjectName.value = '';
  selectedProjectBranches.value = [];

  await loadProjectConfigs();

  const match = projectConfigs.value.find(p => p.name === projectName);
  if (match) {
    selectedProjectName.value = match.name;
    selectedProjectBranches.value = [...match.branches];
    if (match.localPath) projectForm.projectPath = match.localPath;
    if (match.defaultBranch) projectForm.gitBranch = match.defaultBranch;
  }

  drawerOpen.value = true;
}

async function saveProjectSettings() {
  saving.value = true;
  try {
    const payload: Record<string, string> = {};
    if (projectForm.projectPath) payload.projectPath = projectForm.projectPath;
    if (projectForm.gitBranch) payload.gitBranch = projectForm.gitBranch;
    if (projectForm.taskPageUrl) payload.taskPageUrl = projectForm.taskPageUrl;
    if (projectForm.customDescription) payload.customDescription = projectForm.customDescription;

    if (isBatchMode.value) {
      for (const task of selectedTasks.value) {
        await taskStore.updateTask(task.id, payload);
      }
      ElMessage.success(`已批量配置 ${selectedTasks.value.length} 个任务`);
    } else if (currentEditTask.value) {
      await taskStore.updateTask(currentEditTask.value.id, payload);
      ElMessage.success('配置已保存');
    }
    drawerOpen.value = false;
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

function handleSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
  loadData()
}

function handlePageChange(page: number) {
  currentPage.value = page
  loadData()
}

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

.view-switch {
  display: flex; gap: 4px;
  background: rgba(10,16,31,0.4); border: 1px solid rgba(0,229,255,0.12);
  border-radius: 8px; padding: 3px; backdrop-filter: blur(8px);
}

.view-btn {
  width: 32px; height: 28px; border: none; background: transparent;
  border-radius: 6px; cursor: pointer; color: #8c8ca1; display: flex;
  align-items: center; justify-content: center; transition: all 0.25s ease;
  svg { width: 16px; height: 16px; }

  &:hover { color: #00E5FF; background: rgba(0,229,255,0.08); }
  &.active {
    color: #00E5FF; background: rgba(0,229,255,0.15);
    box-shadow: 0 0 8px rgba(0,229,255,0.2);
  }
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
  backdrop-filter: none;
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

/* ===== Card View ===== */
.card-view {
  display: flex; flex-direction: column; gap: 8px;
  position: relative; z-index: 1;
}

.cyber-card {
  position: relative; display: flex; align-items: stretch;
  background: rgba(10,16,31,0.15); border: 1px solid rgba(0,229,255,0.12);
  border-radius: 10px; transition: all 0.3s ease; cursor: pointer; overflow: hidden;
  backdrop-filter: blur(2px);
  &:hover { border-color: rgba(0,229,255,0.35); box-shadow: 0 0 20px rgba(0,229,255,0.1); transform: translateY(-1px); }
  &.in-todo { border-left: 3px solid #FF7D00; }
}

.card-glow {
  position: absolute; top: 0; bottom: 0; left: 42px; width: 120px;
  background: linear-gradient(90deg,
    rgba(0,229,255,0.18) 0%,
    rgba(0,229,255,0.06) 30%,
    transparent 100%
  );
  pointer-events: none; z-index: 0;
  animation: cardBeamSweep 3s ease-in-out infinite;
}

@keyframes cardBeamSweep {
  0%   { opacity: 0.4; }
  50%  { opacity: 1; }
  100% { opacity: 0.4; }
}

.card-rank {
  display: flex; align-items: center; justify-content: center; width: 42px; flex-shrink: 0;
  font-size: 15px; font-weight: 800;
  background: linear-gradient(180deg, rgba(0,229,255,0.12), rgba(0,229,255,0.03)); color: #00E5FF;
  border-right: 1px solid rgba(0,229,255,0.08);
}

.card-body { flex: 1; padding: 12px 14px; min-width: 0; }

.card-head {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
  .card-id { color: #8c8ca1; font-size: 11px; margin-left: auto; }
}

.card-title {
  margin: 0; font-size: 14px; font-weight: 600; color: #e0e0ef; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.card-meta {
  display: flex; gap: 10px; margin-top: 6px; font-size: 11px; color: #8c8ca1;
  .overdue { color: #f56c6c; font-weight: 600; }
}

.card-desc-preview {
  margin-top: 8px; padding: 5px 10px; border-radius: 6px;
  background: rgba(0,229,255,0.06); border: 1px solid rgba(0,229,255,0.08);
  display: flex; align-items: flex-start; gap: 6px;
}
.desc-label { font-size: 10px; color: #00E5FF; white-space: nowrap; flex-shrink: 0; margin-top: 1px; }
.desc-text {
  flex: 1; font-size: 11px; color: #cfd3dc; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.card-ops {
  display: flex; align-items: center; gap: 2px; padding: 0 12px;
  border-left: 1px solid rgba(0,229,255,0.06);
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

// ===== Right Drawer =====
.drawer-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 99; backdrop-filter: blur(2px);
}
.task-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: 420px; z-index: 100;
  background: rgba(10,16,31,0.92); border-left: 1px solid rgba(0,229,255,0.2);
  backdrop-filter: blur(20px); padding: 24px; overflow-y: auto;
  display: flex; flex-direction: column;
}
.drawer-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.drawer-title-area { display: flex; align-items: center; gap: 8px; }
.drawer-batch-name { color: #e0e0ef; font-size: 13px; font-weight: 600; }
.drawer-id { color: #8c8ca1; font-size: 12px; }
.drawer-close { font-size: 18px; color: #8c8ca1; &:hover { color: #00E5FF; } }
.drawer-task-title { margin: 0 0 20px; font-size: 16px; font-weight: 600; color: #e0e0ef; line-height: 1.4; }
.drawer-form { flex: 1; }
.drawer-field { font-size: 13px; color: #cfd3dc; padding: 6px 0; line-height: 1.5; }
.drawer-footer {
  padding-top: 16px; border-top: 1px solid rgba(0,229,255,0.1);
  display: flex; justify-content: flex-end; gap: 10px;
}

.drawer-slide-enter-active { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.drawer-slide-leave-active { transition: transform 0.2s ease-in; }
.drawer-slide-enter-from { transform: translateX(100%); }
.drawer-slide-leave-to { transform: translateX(100%); }
.fade-mask-enter-active, .fade-mask-leave-active { transition: opacity 0.25s ease; }
.fade-mask-enter-from, .fade-mask-leave-to { opacity: 0; }
</style>
