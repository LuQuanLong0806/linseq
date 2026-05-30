<template>
  <div class="projects-page">
    <!-- 筛选栏 -->
    <div class="cyber-panel filter-card">
      <div class="filter-row">
        <div class="filter-fields">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索项目名称/路径/Git地址..."
            :prefix-icon="Search"
            clearable
            style="min-width: 150px; max-width: 260px; flex: 1"
            @clear="currentPage = 1"
            @keyup.enter="currentPage = 1"
          />
        </div>
        <div class="filter-actions">
          <el-button type="primary" :icon="Search" @click="currentPage = 1">搜索</el-button>
          <el-button :icon="RefreshRight" @click="searchKeyword = ''; currentPage = 1">重置</el-button>
          <el-button type="success" :icon="Plus" @click="openDialog()">新建项目</el-button>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <span v-if="selectedProjects.length > 0" class="selected-count">已选 {{ selectedProjects.length }} 项</span>
      <div class="toolbar-right">
        <el-button
          type="danger"
          size="small"
          :disabled="selectedProjects.length === 0"
          @click="handleBatchDelete"
        >批量删除</el-button>
      </div>
    </div>

    <!-- Table -->
    <div class="cyber-panel table-card">
      <el-table
        ref="tableRef"
        :data="paginatedProjects"
        v-loading="loading"
        stripe
        border
        style="width:100%"
        :header-cell-style="{ fontWeight: 600 }"
        empty-text="暂无项目配置，点击上方按钮新建"
        row-class-name="table-row"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="45" fixed="left" />
        <el-table-column prop="name" label="项目名称" min-width="140" align="center">
          <template #default="{ row }">
            <el-tooltip :content="row.name" placement="top" :show-after="300">
              <span class="name-text cell-ellipsis">{{ row.name }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="localPath" label="本地路径" min-width="200" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="row.localPath" :content="row.localPath" placement="top" :show-after="300">
              <span class="path-text cell-ellipsis">{{ row.localPath }}</span>
            </el-tooltip>
            <span v-else class="cell-empty">未配置</span>
          </template>
        </el-table-column>
        <el-table-column prop="gitUrl" label="Git 地址" min-width="180" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="row.gitUrl" :content="row.gitUrl" placement="top" :show-after="300">
              <span class="path-text cell-ellipsis">{{ row.gitUrl }}</span>
            </el-tooltip>
            <span v-else class="cell-empty">-</span>
          </template>
        </el-table-column>
        <el-table-column label="默认分支" min-width="120" align="center">
          <template #default="{ row }">
            <span v-if="row.defaultBranch" class="branch-plain">{{ row.defaultBranch }}</span>
            <span v-else class="cell-empty">-</span>
          </template>
        </el-table-column>
        <el-table-column label="分支" width="60" align="center">
          <template #default="{ row }">
            <span class="branch-plain">{{ row.branches?.length || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注" min-width="120" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="row.note" :content="row.note" placement="top" :show-after="300">
              <span class="cell-ellipsis">{{ row.note }}</span>
            </el-tooltip>
            <span v-else class="cell-empty">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" :fixed="'right'" align="center">
          <template #default="{ row }">
            <div class="ops">
              <span class="op" @click.stop="openDialog(row)"><el-icon><Edit /></el-icon>编辑</span>
              <span class="op op-vscode" @click.stop="openVscode(row.localPath)" :class="{ disabled: !row.localPath }">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M17.583 2.322l-5.106 4.79L7.4 2.98 2.5 6.407v11.186l4.9 3.427 5.077-4.132 5.106 4.79L21.5 18.17V5.828l-3.917-3.506zm-.353 13.945l-3.763-3.318 3.763-3.555v6.873zM7.09 15.998V8.002l3.26 3.897-3.26 4.099zM7.7 17.15l4.247-5.336L7.7 5.874V17.15z" fill="currentColor"/></svg>VS Code
              </span>
              <span class="op op-fetch" @click.stop="handleFetchBranches(row)" :class="{ disabled: row._fetching }">
                <el-icon><Refresh /></el-icon>{{ row._fetching ? '获取中' : '获取分支' }}
              </span>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-area">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="filteredProjects.length"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </div>

    <!-- Dialog -->
    <el-dialog
      v-model="showDialog"
      :title="editingId ? '编辑项目配置' : '新建项目配置'"
      width="var(--dialog-lg)"
      :close-on-click-modal="false"
      class="proj-dialog"
      destroy-on-close
    >
      <el-form label-width="110px" label-position="right" class="proj-form">
        <el-form-item label="项目名称" required>
          <el-select
            v-model="form.name"
            filterable
            allow-create
            default-first-option
            placeholder="搜索或输入项目名称（与内网任务项目名称一致）"
            style="width:100%"
          >
            <el-option
              v-for="name in availableProjectNames"
              :key="name"
              :label="name"
              :value="name"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="本地路径">
          <div class="chain-row">
            <el-input v-model="form.localPath" placeholder="粘贴完整路径，如 F:\00_project\my-project" class="chain-input" />
            <el-button @click="handleDetectGit" :loading="detecting" type="success" plain>
              检测Git
            </el-button>
          </div>
          <div v-if="detectResult" class="detect-hint">
            <el-tag v-if="detectResult.isGitRepo" type="success" size="small">Git 仓库已识别</el-tag>
            <el-tag v-else-if="detectResult.exists" type="warning" size="small">路径存在但非 Git 仓库</el-tag>
            <el-tag v-else type="danger" size="small">路径不存在</el-tag>
          </div>
        </el-form-item>

        <el-form-item label="Git 地址">
          <div class="chain-row">
            <el-input v-model="form.gitUrl" placeholder="自动检测或手动输入 Git 远程地址" class="chain-input" />
            <el-button @click="handleFetchBranchesInDialog" :loading="fetchingBranches" type="primary" plain :disabled="!editingId && !form.gitUrl">
              获取分支
            </el-button>
          </div>
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="默认分支">
              <el-select
                v-model="form.defaultBranch"
                placeholder="搜索选择或输入分支名"
                clearable
                filterable
                allow-create
                style="width:100%"
              >
                <el-option v-for="b in form.branches" :key="b" :label="b" :value="b" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input v-model="form.note" placeholder="可选备注" />
            </el-form-item>
          </el-col>
        </el-row>

        <div v-if="form.branches.length > 0" class="branches-preview">
          <span class="branches-label">已获取 {{ form.branches.length }} 个分支：</span>
          <el-tag v-for="b in form.branches.slice(0, 10)" :key="b" size="small" effect="plain" round class="branch-tag">{{ b }}</el-tag>
          <span v-if="form.branches.length > 10" class="branches-more">...等 {{ form.branches.length }} 个</span>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving" :disabled="!form.name.trim()">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { projectApi, type ProjectConfig } from '@/api/project'
import { taskApi } from '@/api/task'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, RefreshRight, Plus, Edit, Refresh, Delete } from '@element-plus/icons-vue'
import type { ElTable } from 'element-plus'

const projects = ref<(ProjectConfig & { _fetching?: boolean })[]>([])
const loading = ref(false)
const showDialog = ref(false)
const saving = ref(false)
const editingId = ref('')
const availableProjectNames = ref<string[]>([])
const searchKeyword = ref('')
const selectedProjects = ref<(ProjectConfig & { _fetching?: boolean })[]>([])
const tableRef = ref<InstanceType<typeof ElTable> | null>(null)

const detecting = ref(false)
const fetchingBranches = ref(false)
const detectResult = ref<{ exists: boolean; isGitRepo: boolean } | null>(null)
const currentPage = ref(1)
const pageSize = ref(20)

const filteredProjects = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return projects.value
  return projects.value.filter(p =>
    p.name.toLowerCase().includes(kw) ||
    (p.localPath || '').toLowerCase().includes(kw) ||
    (p.gitUrl || '').toLowerCase().includes(kw) ||
    (p.note || '').toLowerCase().includes(kw)
  )
})

const paginatedProjects = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredProjects.value.slice(start, start + pageSize.value)
})

const form = reactive({
  name: '',
  localPath: '',
  gitUrl: '',
  defaultBranch: '',
  branches: [] as string[],
  note: '',
})

async function loadProjects() {
  loading.value = true
  try {
    const res = await projectApi.list()
    projects.value = res.data
  } finally {
    loading.value = false
  }
}

async function loadProjectNames() {
  try {
    const res = await taskApi.getTasks({ pageSize: 1000 })
    const names = new Set<string>(res.data.list.map((t: any) => t.project).filter(Boolean))
    availableProjectNames.value = Array.from(names).sort()
  } catch { /* ignore */ }
}

function openDialog(row?: ProjectConfig) {
  detectResult.value = null
  if (row) {
    editingId.value = row.id
    form.name = row.name
    form.localPath = row.localPath
    form.gitUrl = row.gitUrl
    form.defaultBranch = row.defaultBranch
    form.branches = [...row.branches]
    form.note = row.note
  } else {
    editingId.value = ''
    form.name = ''
    form.localPath = ''
    form.gitUrl = ''
    form.defaultBranch = ''
    form.branches = []
    form.note = ''
  }
  showDialog.value = true
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

async function handleDetectGit() {
  if (!form.localPath.trim()) {
    ElMessage.warning('请先输入本地路径')
    return
  }
  detecting.value = true
  detectResult.value = null
  try {
    const res = await projectApi.detectGit(form.localPath.trim())
    const data = res.data
    detectResult.value = { exists: data.exists, isGitRepo: data.isGitRepo }
    if (!data.exists) { ElMessage.error('路径不存在，请检查'); return }
    if (!data.isGitRepo) { ElMessage.warning('路径存在但不是 Git 仓库'); return }
    if (data.gitUrl) { form.gitUrl = data.gitUrl; ElMessage.success(`已检测到 Git 地址: ${data.gitUrl}`) }
    if (data.branches.length > 0) {
      form.branches = data.branches
      ElMessage.success(`获取到 ${data.branches.length} 个分支`)
      if (!form.defaultBranch && data.branches.includes('main')) form.defaultBranch = 'main'
      else if (!form.defaultBranch && data.branches.includes('master')) form.defaultBranch = 'master'
    }
  } catch (err: any) { ElMessage.error(err?.message || '检测失败') }
  finally { detecting.value = false }
}

async function handleFetchBranchesInDialog() {
  if (editingId.value) {
    fetchingBranches.value = true
    try {
      const res = await projectApi.fetchBranches(editingId.value)
      form.branches = res.data.branches
      ElMessage.success(res.message)
      await loadProjects()
    } catch (err: any) { ElMessage.error(err?.message || '获取分支失败') }
    finally { fetchingBranches.value = false }
    return
  }
  if (form.localPath.trim()) { await handleDetectGit(); return }
  ElMessage.warning('请先输入本地路径并点击"检测Git"，或先保存项目后再获取远程分支')
}

async function handleSave() {
  saving.value = true
  try {
    if (editingId.value) {
      await projectApi.update(editingId.value, { ...form })
      ElMessage.success('更新成功')
    } else {
      await projectApi.create({ ...form })
      ElMessage.success('创建成功')
    }
    showDialog.value = false
    await loadProjects()
  } catch (err: any) { ElMessage.error(err?.message || '保存失败') }
  finally { saving.value = false }
}

async function handleDelete(row: ProjectConfig) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.name}」？`, '删除确认', { type: 'warning' })
    await projectApi.remove(row.id)
    ElMessage.success('已删除')
    await loadProjects()
  } catch {
    ElMessage.error('删除项目失败')
  }
}

function handleSelectionChange(rows: (ProjectConfig & { _fetching?: boolean })[]) {
  selectedProjects.value = rows
}

async function handleBatchDelete() {
  if (selectedProjects.value.length === 0) return
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${selectedProjects.value.length} 个项目？`,
      '批量删除确认',
      { type: 'warning' }
    )
    for (const row of selectedProjects.value) {
      await projectApi.remove(row.id)
    }
    ElMessage.success(`已删除 ${selectedProjects.value.length} 个项目`)
    selectedProjects.value = []
    await loadProjects()
  } catch {
    ElMessage.error('删除项目失败')
  }
}

async function handleFetchBranches(row: ProjectConfig & { _fetching?: boolean }) {
  row._fetching = true
  try {
    const res = await projectApi.fetchBranches(row.id)
    ElMessage.success(res.message)
    await loadProjects()
  } catch (err: any) { ElMessage.error(err?.message || '获取分支失败') }
  finally { row._fetching = false }
}

onMounted(() => {
  loadProjects()
  loadProjectNames()
})
</script>

<style lang="scss" scoped>
.projects-page {
  margin: 0 auto;
  position: relative;
  min-height: 100%;
}

.filter-card,
.table-card,
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
  overflow: hidden;
  border-radius: 0 !important;
  :deep(.el-table) { --el-table-border-color: var(--cyber-glass-border); }
  :deep(.table-row) {
    cursor: pointer;
    transition: background 0.2s;
    td { text-align: center; }
  }
  :deep(.table-row:hover > td) {
    background: var(--cyber-glass-border-hover) !important;
  }
  :deep(.el-table__cell) { text-align: center; }
}

.name-text { font-weight: 600; color: var(--cyber-text-primary); font-size: 14px; }
.path-text {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 13px; color: var(--cyber-text-secondary);
  word-break: break-all; line-height: 1.5;
}
.cell-empty { color: var(--cyber-text-muted); font-size: 13px; }
.cell-ellipsis {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 100%; display: inline-block; vertical-align: middle;
}
.branch-plain {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 13px; color: var(--cyber-text-secondary);
}

.ops { display: flex; align-items: center; justify-content: center; gap: 2px; }
.op {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 4px 8px; font-size: 12px; color: var(--cyber-cyan);
  cursor: pointer; border-radius: 6px; transition: color 0.15s, background 0.15s;
  .el-icon { font-size: 13px; }
  &:hover { color: var(--cyber-cyan); background: rgba(0, 229, 255, 0.12); }
  &.disabled { opacity: 0.5; pointer-events: none; }
}
.op-danger { color: #f56c6c; &:hover { background: rgba(245, 108, 108, 0.12); } }
.op-fetch { color: #67c23a; &:hover { background: rgba(103, 194, 58, 0.12); } }
.op-vscode { color: #409EFF; &:hover { background: rgba(64, 158, 255, 0.12); } }

.pagination-area { margin-top: 16px; display: flex; justify-content: flex-end; }

/* ===== Dialog ===== */
.proj-dialog :deep(.el-dialog) { border-radius: 14px; overflow: hidden; }
.proj-dialog :deep(.el-dialog__header) {
  padding: 20px 24px 16px; border-bottom: 1px solid var(--cyber-glass-border); margin-right: 0;
}
.proj-dialog :deep(.el-dialog__body) { padding: 24px; }
.proj-dialog :deep(.el-dialog__footer) {
  padding: 16px 24px; border-top: 1px solid var(--cyber-glass-border);
}
.proj-form :deep(.el-form-item__label) { font-weight: 500; color: var(--cyber-text-secondary); }
.chain-row { display: flex; gap: 8px; width: 100%; }
.chain-input { flex: 1; }
.detect-hint { margin-top: 4px; }
.branches-preview {
  padding: 10px 14px; background: var(--cyber-glass-bg);
  border: 1px solid var(--cyber-glass-border); border-radius: 8px; margin-top: 4px;
}
.branches-label { font-size: 12px; color: var(--cyber-text-secondary); margin-right: 8px; }
.branch-tag { margin: 2px 4px; }
.branches-more { font-size: 12px; color: var(--cyber-text-secondary); margin-left: 4px; }
</style>
