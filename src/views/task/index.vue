<template>
  <div class="task-list-page">
    <!-- 筛选栏 -->
    <div class="cyber-panel filter-card">
      <div class="filter-row">
        <div class="filter-fields">
          <el-input
            v-model="filters.keyword"
            placeholder="搜索任务标题/ID..."
            :prefix-icon="Search"
            clearable
            style="min-width: 150px; max-width: 220px; flex: 1"
            @clear="handleSearch"
            @keyup.enter="handleSearch"
          />
          <el-select
            v-model="filters.aiStatus"
            placeholder="AI开发状态"
            clearable
            style="min-width: 120px; max-width: 150px"
            @change="handleSearch"
          >
            <el-option label="AI待办" value="ai_todo" />
            <el-option label="开发中" value="ai_dev" />
            <el-option label="待审核" value="ai_review" />
            <el-option label="待返工" value="ai_rework" />
            <el-option label="已完成" value="ai_done" />
            <el-option label="未加入" value="none" />
          </el-select>
        </div>
        <div class="filter-actions">
          <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
          <el-button :icon="RefreshRight" @click="handleReset">重置</el-button>
          <el-button type="success" :icon="Download" @click="handleSync" :loading="taskStore.syncing">同步</el-button>
        </div>
      </div>
    </div>

    <!-- 操作栏：左侧视图切换，右侧批量操作 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <ViewModeSelector :model-value="taskStore.viewMode" @update:model-value="taskStore.setViewMode" />
      </div>
      <div class="toolbar-right">
        <span v-if="activeSelected.length > 0" class="selected-count"
          >已选 {{ activeSelected.length }} 项</span
        >
        <el-button
          type="primary"
          size="small"
          :disabled="activeSelected.length === 0"
          @click="handleBatchTodo"
          >批量入AI待办</el-button
        >
        <el-button
          type="success"
          size="small"
          :disabled="activeSelected.length === 0"
          @click="handleBatchSettings"
          >批量设置</el-button
        >
        <!-- 隐藏：批量修改状态 -->
        <!-- <el-dropdown trigger="click" @command="handleBatchStatusChange">
          <el-button type="warning" size="small" :disabled="activeSelected.length === 0">
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
        </el-dropdown> -->
        <el-button
          type="danger"
          size="small"
          :disabled="activeSelected.length === 0"
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
        <el-table-column prop="sourceId" label="单号" width="90" />
        <el-table-column
          prop="project"
          label="项目名称"
          min-width="140"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span>{{ row.project || row.customer || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="customDescription"
          label="任务简述"
          min-width="180"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span class="desc-text">{{
              row.customDescription || row.description?.slice(0, 60) || '-'
            }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="AI开发状态" width="100">
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
        <!-- <el-table-column
          prop="module"
          label="模块"
          min-width="100"
          show-overflow-tooltip
        /> -->
        <el-table-column prop="priority" label="优先级" width="80">
          <template #default="{ row }">
            <el-tag :type="getPriorityType(row.priority)" size="small">{{
              getPriorityLabel(row.priority)
            }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="workHours" label="计划小时" width="75" sortable>
          <template #default="{ row }">
            <span>{{ row.workHours || 0 }}h</span>
          </template>
        </el-table-column>
        <el-table-column prop="staleDays" label="滞留天数" width="80" sortable>
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
        <el-table-column prop="deadline" label="截止时间" width="95" sortable>
          <template #default="{ row }">
            <span :class="{ 'overdue-text': isOverdue(row) }">{{
              formatDate(row.deadline)
            }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" :fixed="'right'">
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
              <span
                class="op op-vscode"
                :class="{ disabled: !row.projectPath }"
                @click.stop="openVscode(row.projectPath)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M17.583 2.322l-5.106 4.79L7.4 2.98 2.5 6.407v11.186l4.9 3.427 5.077-4.132 5.106 4.79L21.5 18.17V5.828l-3.917-3.506zm-.353 13.945l-3.763-3.318 3.763-3.555v6.873zM7.09 15.998V8.002l3.26 3.897-3.26 4.099zM7.7 17.15l4.247-5.336L7.7 5.874V17.15z" fill="currentColor"/></svg>VS Code
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

    <!-- 以下视图暂时隐藏，保留组件文件：card / planetary / datastream / constellation -->

    <!-- 全息HUD视图 -->
    <div v-show="taskStore.viewMode === 'holographic'" class="holo-scroll-wrapper" ref="holoScrollRef">
      <HolographicHudView
        :tasks="taskStore.tasks"
        @config="openProjectSettings"
        @toggle-todo="handleToggleTodo"
        @status-change="handleStatusChangeWrapper"
        @update-selected="handleHoloSelection"
      />
      <div ref="holoSentinel" class="holo-sentinel"></div>
      <div v-if="holoLoading" class="holo-loading">加载中...</div>
      <div v-if="!holoHasMore && taskStore.tasks.length > 0" class="holo-loading">已加载全部</div>
    </div>

    <!-- 配置弹窗 -->
    <Teleport to="body">
      <Transition name="fade-mask">
        <div v-if="drawerOpen" class="config-modal-mask" @click.self="drawerOpen = false">
          <div class="config-modal">
            <div class="config-modal-header">
              <div class="config-modal-title">
                <template v-if="isBatchMode">
                  <el-tag type="info" size="small">已选 {{ activeSelected.length }} 项</el-tag>
                  <span class="config-modal-batch">{{ batchProjectName }}</span>
                </template>
                <template v-else-if="currentEditTask">
                  <el-tag :type="getPriorityType(currentEditTask.priority)" size="small">{{ getPriorityLabel(currentEditTask.priority) }}</el-tag>
                  <span class="config-modal-id">#{{ currentEditTask.sourceId }}</span>
                  <span class="config-modal-name">{{ currentEditTask.title }}</span>
                </template>
              </div>
              <el-button link size="small" @click="drawerOpen = false" class="config-modal-close">✕</el-button>
            </div>

            <div class="config-modal-body">
              <el-form label-width="80px" label-position="top" class="config-form">
                <el-form-item v-if="currentEditTask && !isBatchMode" label="项目名称">
                  <div class="config-field">{{ currentEditTask.project || currentEditTask.customer || '-' }}</div>
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
                      <span style="float:right;color:var(--cyber-text-muted);font-size:12px">{{ p.localPath || '未配置路径' }}</span>
                    </el-option>
                  </el-select>
                </el-form-item>
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="本地项目路径">
                      <el-input v-model="projectForm.projectPath" placeholder="例: F:/projects/my-project" clearable />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="Git 分支">
                      <el-select v-model="projectForm.gitBranch" placeholder="选择或输入分支" clearable filterable allow-create style="width:100%">
                        <el-option v-for="b in selectedProjectBranches" :key="b" :label="b" :value="b" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-form-item v-if="!isBatchMode" label="补充说明">
                  <el-input v-model="projectForm.customDescription" type="textarea" :rows="4" placeholder="输入补充需求说明，支持拖拽文件/文件夹获取路径..." resize="none"
                    @dragover.prevent @drop.prevent="e => handleDrop(e, 'desc')" />
                </el-form-item>
              </el-form>

              <!-- 需求文档 -->
              <div v-if="currentEditTask && !isBatchMode" class="req-doc-section">
                <div class="req-doc-header">
                  <span class="req-doc-title">需求文档</span>
                  <div class="req-doc-actions">
                    <a
                      v-if="currentEditTask.reqDocUrl"
                      :href="`/api/sync/req-doc?url=${encodeURIComponent(currentEditTask.reqDocUrl)}`"
                      target="_blank"
                      class="req-doc-link"
                    >查看原文</a>
                    <span v-if="extractingPdf" class="req-doc-hint">正在提取文字...</span>
                  </div>
                </div>
                <div v-if="currentEditTask.reqDocName" class="req-doc-name">{{ currentEditTask.reqDocName }}</div>
                <template v-if="docEditText !== null">
                  <el-input v-model="docEditText" type="textarea" :autosize="{ minRows: 4, maxRows: 20 }" placeholder="编辑需求文档内容，支持拖拽文件/文件夹获取路径..."
                    @dragover.prevent @drop.prevent="e => handleDrop(e, 'doc')" />
                </template>
                <div v-else class="req-doc-empty">暂无需求文档</div>
              </div>
            </div>

            <div class="config-modal-footer">
              <el-button @click="drawerOpen = false">取消</el-button>
              <el-button type="primary" @click="saveProjectSettings" :loading="saving">保存</el-button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTaskStore } from '@/stores/task';
import ViewModeSelector from './components/ViewModeSelector.vue'
// import PlanetaryOrbitView from './components/PlanetaryOrbitView.vue'
import HolographicHudView from './components/HolographicHudView.vue'
// import CyberDataStreamView from './components/CyberDataStreamView.vue'
// import ConstellationMapView from './components/ConstellationMapView.vue'
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
import type { TaskStatus, TaskPriority, Task } from '@/types';
import { projectApi, type ProjectConfig } from '@/api/project';
import { taskApi } from '@/api/task';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ElTable } from 'element-plus';

const router = useRouter();
const taskStore = useTaskStore();

const currentPage = ref(1);
const pageSize = ref(20);
const tableRef = ref<InstanceType<typeof ElTable> | null>(null);

// 全息模式滚动加载
const holoPage = ref(1)
const holoHasMore = ref(true)
const holoLoading = ref(false)
const holoScrollRef = ref<HTMLElement | null>(null)
const holoSentinel = ref<HTMLElement | null>(null)
let holoObserver: IntersectionObserver | null = null
const selectedTasks = ref<Task[]>([]);
const holoSelectedIds = ref<string[]>([]);
const activeSelected = computed<Task[]>(() => {
  if (taskStore.viewMode === 'holographic') {
    return taskStore.tasks.filter((t: Task) => holoSelectedIds.value.includes(t.id))
  }
  return selectedTasks.value
})

const filters = reactive({
  keyword: '',
  status: '' as string,
  aiStatus: '' as string,
  priority: '' as string,
  module: '' as string
});

// Right drawer
const drawerOpen = ref(false);
const saving = ref(false);
const extractingPdf = ref(false);
const docEditText = ref<string | null>(null);
const currentEditTask = ref<Task | null>(null);
const isBatchMode = ref(false);
const batchProjectName = ref('');
const projectConfigs = ref<ProjectConfig[]>([]);
const selectedProjectName = ref('');
const selectedProjectBranches = ref<string[]>([]);
const projectForm = reactive({
  projectPath: '',
  gitBranch: '',
  customDescription: ''
});

const modules = ref<string[]>([]);

async function loadData() {
  await taskStore.fetchTasks({
    page: currentPage.value,
    pageSize: pageSize.value,
    keyword: filters.keyword || undefined,
    status: (filters.status || undefined) as TaskStatus | undefined,
    aiStatus: (filters.aiStatus || undefined) as string | undefined,
    priority: (filters.priority || undefined) as TaskPriority | undefined,
    module: filters.module || undefined,
  });
  const set = new Set<string>(taskStore.tasks.map((t: Task) => t.module).filter(Boolean));
  modules.value = Array.from(set);
}

function handleSelectionChange(rows: Task[]) {
  selectedTasks.value = rows;
}

function handleHoloSelection(ids: string[]) {
  holoSelectedIds.value = ids;
}

async function handleBatchTodo() {
  const count = activeSelected.value.length;
  for (const task of activeSelected.value) {
    if (!taskStore.isInTodoList(task.id)) taskStore.toggleTodo(task);
  }
  ElMessage.success(`已将 ${count} 个任务移入 AI 待办`);
}

async function handleBatchRemove() {
  const count = activeSelected.value.length;
  for (const task of activeSelected.value) {
    if (taskStore.isInTodoList(task.id)) taskStore.toggleTodo(task);
  }
  ElMessage.success(`已将 ${count} 个任务移出 AI 待办`);
}

async function handleBatchStatusChange(status: string) {
  const label = getStatusLabel(status);
  try {
    for (const task of activeSelected.value) {
      await taskStore.updateTaskStatus(task.id, status as TaskStatus);
    }
    ElMessage.success(
      `已将 ${activeSelected.value.length} 个任务状态修改为「${label}」`
    );
  } catch {
    ElMessage.error('批量修改状态失败');
  }
}

function handleSearch() {
  if (taskStore.viewMode === 'holographic') {
    loadHoloFirst()
  } else {
    currentPage.value = 1;
    loadData();
  }
}

function handleReset() {
  filters.keyword = '';
  filters.status = '';
  filters.priority = '';
  filters.module = '';
  if (taskStore.viewMode === 'holographic') {
    loadHoloFirst()
  } else {
    currentPage.value = 1;
    loadData();
  }
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

async function handleExtractPdf() {
  if (!currentEditTask.value) return
  extractingPdf.value = true
  try {
    const res = await taskApi.extractPdf(currentEditTask.value.id)
    if (res.data?.reqDocText) {
      currentEditTask.value = { ...currentEditTask.value, reqDocText: res.data.reqDocText }
      docEditText.value = res.data.reqDocText
    }
  } catch {
    ElMessage.error('PDF 文字提取失败')
  } finally {
    extractingPdf.value = false
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

async function handleStatusChangeWrapper(task: Task, status: string) {
  await handleStatusChange(task, status)
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

async function openVscode(path: string) {
  if (!path) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_in_vscode', { path })
  } catch {
    window.open('vscode://file/' + path, '_blank')
  }
}

function handleDrop(e: DragEvent, target: 'desc' | 'doc') {
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const paths: string[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    // webkitRelativePath has folder info; path may be available in Electron/Tauri
    const p = (f as any).path || f.name
    if (p) paths.push(p)
  }
  if (paths.length === 0) return
  const text = paths.join('\n')
  if (target === 'desc') {
    projectForm.customDescription = projectForm.customDescription
      ? projectForm.customDescription + '\n' + text
      : text
  } else if (docEditText.value !== null) {
    docEditText.value = docEditText.value
      ? docEditText.value + '\n' + text
      : text
  }
}

async function openProjectSettings(task: Task) {
  isBatchMode.value = false;
  batchProjectName.value = '';
  currentEditTask.value = task;
  projectForm.projectPath = task.projectPath || '';
  projectForm.gitBranch = task.gitBranch || '';
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

  // 需求文档：已有文字直接编辑，有文件名但未提取则自动提取
  if (task.reqDocText) {
    docEditText.value = task.reqDocText
  } else if (task.reqDocName) {
    docEditText.value = ''
    await handleExtractPdf()
  } else {
    docEditText.value = null
  }

  drawerOpen.value = true;
}

async function handleBatchSettings() {
  const selected = activeSelected.value;
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
    if (projectForm.customDescription) payload.customDescription = projectForm.customDescription;

    if (isBatchMode.value) {
      for (const task of activeSelected.value) {
        await taskStore.updateTask(task.id, payload);
      }
      ElMessage.success(`已批量配置 ${activeSelected.value.length} 个任务`);
    } else if (currentEditTask.value) {
      if (docEditText.value !== null) {
        payload.reqDocText = docEditText.value
      }
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

// 全息模式：加载首页
async function loadHoloFirst() {
  holoPage.value = 1
  holoHasMore.value = true
  await taskStore.fetchTasks({
    page: 1,
    pageSize: 20,
    keyword: filters.keyword || undefined,
    aiStatus: (filters.aiStatus || undefined) as string | undefined,
    priority: (filters.priority || undefined) as TaskPriority | undefined,
    module: filters.module || undefined,
  })
  holoHasMore.value = taskStore.tasks.length < taskStore.totalTasks
  setupHoloObserver()
}

// 全息模式：加载下一页
async function loadHoloMore() {
  if (holoLoading.value || !holoHasMore.value) return
  holoLoading.value = true
  holoPage.value++
  try {
    const count = await taskStore.fetchMoreTasks({
      page: holoPage.value,
      pageSize: 20,
      keyword: filters.keyword || undefined,
      aiStatus: (filters.aiStatus || undefined) as string | undefined,
      priority: (filters.priority || undefined) as TaskPriority | undefined,
      module: filters.module || undefined,
    })
    holoHasMore.value = count >= 20
  } finally {
    holoLoading.value = false
  }
}

function setupHoloObserver() {
  if (holoObserver) holoObserver.disconnect()
  if (!holoSentinel.value) return
  holoObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) loadHoloMore()
  }, { rootMargin: '200px' })
  holoObserver.observe(holoSentinel.value)
}

// 视图切换时处理数据加载
watch(() => taskStore.viewMode, (mode) => {
  if (mode === 'holographic') {
    loadHoloFirst()
  } else {
    if (holoObserver) holoObserver.disconnect()
    loadData()
  }
})

onMounted(() => {
  if (taskStore.viewMode === 'holographic') {
    loadHoloFirst()
  } else {
    loadData()
  }
});

onUnmounted(() => {
  if (holoObserver) holoObserver.disconnect()
})
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

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.filter-fields {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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
  backdrop-filter: none;
  :deep .task-row {
    cursor: pointer;
    td {
      text-align: center;
    }
    &:hover {
      background-color: var(--cyber-glass-border);
    }
  }
  :deep .el-table__cell {
    text-align: center;
  }
}

.op-vscode { color: #409EFF; &:hover { background: rgba(64, 158, 255, 0.12); } }

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
  background: var(--cyber-glass-bg); border: 1px solid var(--cyber-glass-border);
  border-radius: 10px; transition: all 0.3s ease; cursor: pointer; overflow: hidden;
  backdrop-filter: blur(2px);
  &:hover { border-color: var(--cyber-glass-border-hover); transform: translateY(-1px); }
  &.in-todo { border-left: 3px solid var(--cyber-orange); }
}

.card-glow {
  display: none;
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
  background: linear-gradient(180deg, rgba(0,229,255,0.12), rgba(0,229,255,0.03)); color: var(--cyber-cyan);
  border-right: 1px solid var(--cyber-glass-border);
}

.card-body { flex: 1; padding: 12px 14px; min-width: 0; }

.card-head {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
  .card-id { color: var(--cyber-text-secondary); font-size: 11px; margin-left: auto; }
}

.card-title {
  margin: 0; font-size: 14px; font-weight: 600; color: var(--cyber-text-primary); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.card-meta {
  display: flex; gap: 10px; margin-top: 6px; font-size: 11px; color: var(--cyber-text-secondary);
  .overdue { color: #f56c6c; font-weight: 600; }
}

.card-desc-preview {
  margin-top: 8px; padding: 5px 10px; border-radius: 6px;
  background: rgba(0,229,255,0.06); border: 1px solid var(--cyber-glass-border);
  display: flex; align-items: flex-start; gap: 6px;
}
.desc-label { font-size: 10px; color: var(--cyber-cyan); white-space: nowrap; flex-shrink: 0; margin-top: 1px; }
.desc-text {
  flex: 1; font-size: 11px; color: var(--cyber-text-primary); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.card-ops {
  display: flex; align-items: center; gap: 2px; padding: 0 12px;
  border-left: 1px solid var(--cyber-glass-border);
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
  color: var(--cyber-cyan);
  cursor: pointer;
  border-radius: 6px;
  transition:
    color 0.15s,
    background 0.15s,
    text-shadow 0.15s;
  user-select: none;

  .el-icon { font-size: 13px; }
  &:hover {
    color: var(--cyber-cyan);
    background: rgba(0, 229, 255, 0.12);
    text-shadow: 0 0 8px rgba(0, 229, 255, 0.4);
  }
}

.op-todo {
  color: var(--cyber-cyan);
  font-weight: 500;
  &:hover {
    background: rgba(0, 229, 255, 0.08);
  }
}

.op-active {
  color: var(--cyber-purple);
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

// ===== Config Modal =====
.config-modal-mask {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.config-modal {
  width: clamp(620px, 65vw, 900px); max-height: 85vh; border-radius: 14px; overflow: hidden;
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
.config-modal-batch { color: var(--cyber-text-primary); font-size: 13px; font-weight: 600; }
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
.config-modal-footer {
  padding: 16px 24px; border-top: 1px solid var(--cyber-glass-border);
  display: flex; justify-content: flex-end; gap: 10px;
}

.req-doc-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--cyber-glass-border);
}

.req-doc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.req-doc-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--cyber-text-primary);
}

.req-doc-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.req-doc-link {
  font-size: 12px;
  color: var(--cyber-cyan);
  text-decoration: none;
  &:hover { text-decoration: underline; }
}

.req-doc-name {
  font-size: 12px;
  color: var(--cyber-text-secondary);
  margin-bottom: 10px;
}

.req-doc-content {
  max-height: 300px;
  overflow-y: auto;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--cyber-glass-border);
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--cyber-text-muted);
}

.req-doc-line {
  padding: 2px 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.req-doc-hint { font-size: 12px; color: rgba(0,229,255,0.6); }

.req-doc-empty {
  text-align: center;
  color: #606266;
  font-size: 12px;
  padding: 20px 0;
}

.fade-mask-enter-active, .fade-mask-leave-active { transition: opacity 0.2s ease; }
.fade-mask-enter-from, .fade-mask-leave-to { opacity: 0; }

// ===== Holographic Scroll Loading =====
.holo-scroll-wrapper {
  position: relative; z-index: 1;
  max-height: calc(100vh - 240px);
  padding: 4px 0;
  overflow-y: auto;
  overflow-x: hidden;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background: var(--cyber-glass-border-hover); border-radius: 3px; }
}

.holo-sentinel { height: 1px; }

.holo-loading {
  text-align: center; padding: 20px 0; font-size: 13px;
  color: rgba(0,229,255,0.5);
}
</style>
