<template>
  <div class="projects-page">
    <!-- Header Banner -->
    <div class="page-hero">
      <div class="hero-grid"></div>
      <div class="hero-scan"></div>
      <div class="hero-pulse"></div>
      <div class="hero-glow"></div>
      <div class="hero-content">
        <div class="hero-top">
          <div class="hero-text">
            <h1 class="hero-title">PROJECT<span class="hero-accent">.CONFIG</span></h1>
            <p class="hero-desc">维护内网项目名称与本地路径、Git 分支的关联，同步时自动填充任务信息</p>
          </div>
          <el-button type="primary" size="large" class="hero-btn" @click="openDialog()">
            <span class="btn-icon">+</span> 新建项目
          </el-button>
        </div>
        <div class="hero-stats">
          <div class="hero-stat">
            <span class="hs-num" :data-target="projects.length">{{ projects.length }}</span>
            <span class="hs-label">已配置项目</span>
          </div>
          <div class="hero-stat-divider"></div>
          <div class="hero-stat">
            <span class="hs-num">{{ projects.filter(p => p.localPath).length }}</span>
            <span class="hs-label">已关联路径</span>
          </div>
          <div class="hero-stat-divider"></div>
          <div class="hero-stat">
            <span class="hs-num">{{ projects.filter(p => p.branches?.length > 0).length }}</span>
            <span class="hs-label">已获取分支</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Table Card -->
    <div class="table-card">
      <div class="table-card-border"></div>
      <el-table
        :data="paginatedProjects"
        v-loading="loading"
        style="width:100%"
        :header-cell-style="{ background: 'rgba(102,126,234,0.04)', color: '#303133', fontWeight: 600 }"
        empty-text="暂无项目配置，点击上方按钮新建"
        row-class-name="table-row"
      >
        <el-table-column prop="name" label="项目名称" min-width="180" align="center">
          <template #default="{ row }">
            <el-tooltip :content="row.name" placement="top" :show-after="300">
              <div class="cell-name">
                <span class="name-dot"><span class="name-dot-inner"></span></span>
                <span class="name-text cell-ellipsis">{{ row.name }}</span>
              </div>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="localPath" label="本地路径" min-width="260" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="row.localPath" :content="row.localPath" placement="top" :show-after="300">
              <div class="cell-path">
                <span class="path-icon">📁</span>
                <span class="path-text cell-ellipsis">{{ row.localPath }}</span>
              </div>
            </el-tooltip>
            <span v-else class="cell-empty">未配置</span>
          </template>
        </el-table-column>
        <el-table-column prop="gitUrl" label="Git 地址" min-width="240" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="row.gitUrl" :content="row.gitUrl" placement="top" :show-after="300">
              <div class="cell-path">
                <span class="path-icon">🔗</span>
                <span class="path-text cell-ellipsis">{{ row.gitUrl }}</span>
              </div>
            </el-tooltip>
            <span v-else class="cell-empty">-</span>
          </template>
        </el-table-column>
        <el-table-column label="默认分支" width="180" align="center">
          <template #default="{ row }">
            <span v-if="row.defaultBranch" class="branch-plain">{{ row.defaultBranch }}</span>
            <span v-else class="cell-empty">-</span>
          </template>
        </el-table-column>
        <el-table-column label="分支" width="80" align="center">
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
        <el-table-column label="操作" width="200" fixed="right" align="center">
          <template #default="{ row }">
            <div class="ops-cell">
              <el-button type="primary" link size="small" @click="openDialog(row)">编辑</el-button>
              <el-button type="success" link size="small" @click="handleFetchBranches(row)" :loading="row._fetching">获取分支</el-button>
              <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-area">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="projects.length"
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
      width="720px"
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

        <!-- Step 1: 本地路径 + 检测Git -->
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

        <!-- Step 2: Git 地址（自动填充） + 获取分支 -->
        <el-form-item label="Git 地址">
          <div class="chain-row">
            <el-input v-model="form.gitUrl" placeholder="自动检测或手动输入 Git 远程地址" class="chain-input" />
            <el-button @click="handleFetchBranchesInDialog" :loading="fetchingBranches" type="primary" plain :disabled="!editingId && !form.gitUrl">
              获取分支
            </el-button>
          </div>
        </el-form-item>

        <!-- Step 3: 默认分支（搜索下拉） -->
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

const projects = ref<(ProjectConfig & { _fetching?: boolean })[]>([])
const loading = ref(false)
const showDialog = ref(false)
const saving = ref(false)
const editingId = ref('')
const availableProjectNames = ref<string[]>([])

const detecting = ref(false)
const fetchingBranches = ref(false)
const detectResult = ref<{ exists: boolean; isGitRepo: boolean } | null>(null)
const currentPage = ref(1)
const pageSize = ref(20)

const paginatedProjects = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return projects.value.slice(start, start + pageSize.value)
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
  await ElMessageBox.confirm(`确定删除「${row.name}」？`, '删除确认', { type: 'warning' })
  await projectApi.remove(row.id)
  ElMessage.success('已删除')
  await loadProjects()
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

<style scoped>
.projects-page {
  min-height: calc(100vh - 96px);
}

/* ===== Hero Banner ===== */
.page-hero {
  position: relative;
  padding: 28px 32px 24px;
  background: linear-gradient(135deg, #0a0e27 0%, #1a1040 40%, #0d1f3c 100%);
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 20px;
  border: 1px solid rgba(102,126,234,0.15);
  animation: hero-enter 0.6s ease-out;
}

@keyframes hero-enter {
  from { opacity: 0; transform: translateY(-20px); }
  to { opacity: 1; transform: translateY(0); }
}

.hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(102,126,234,0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(102,126,234,0.06) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
  animation: grid-drift 20s linear infinite;
}

@keyframes grid-drift {
  from { transform: translate(0, 0); }
  to { transform: translate(40px, 40px); }
}

.hero-scan {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #667eea, #00e5ff, #667eea, transparent);
  animation: hero-scan 4s ease-in-out infinite;
  pointer-events: none;
}

@keyframes hero-scan {
  0%, 100% { top: 0; opacity: 0; }
  10% { opacity: 1; }
  50% { top: 100%; opacity: 0.6; }
  90% { opacity: 1; }
}

.hero-pulse {
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent 0%, #00e5ff 50%, transparent 100%);
  background-size: 200% 100%;
  animation: pulse-border 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes pulse-border {
  0%, 100% { background-position: 200% 0; opacity: 0.4; }
  50% { background-position: -200% 0; opacity: 1; }
}

.hero-glow {
  position: absolute;
  top: -50%;
  right: -15%;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(102,126,234,0.12) 0%, rgba(0,229,255,0.05) 40%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
  animation: glow-breathe 6s ease-in-out infinite;
}

@keyframes glow-breathe {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.7; }
}

.hero-content { position: relative; z-index: 1; }

.hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 22px;
}

.hero-title {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 800;
  color: #e0e6ff;
  letter-spacing: 3px;
  font-family: 'Cascadia Code', Consolas, monospace;
  animation: title-glow 3s ease-in-out infinite alternate;
}

@keyframes title-glow {
  from { text-shadow: 0 0 8px rgba(102,126,234,0.3); }
  to { text-shadow: 0 0 16px rgba(102,126,234,0.5), 0 0 30px rgba(0,229,255,0.15); }
}

.hero-accent {
  color: #00e5ff;
  text-shadow: 0 0 12px rgba(0,229,255,0.4);
}

.hero-desc {
  margin: 0;
  font-size: 13px;
  color: rgba(200,210,240,0.6);
  max-width: 480px;
  line-height: 1.6;
}

.hero-btn {
  background: rgba(0,229,255,0.1) !important;
  border: 1px solid rgba(0,229,255,0.35) !important;
  color: #00e5ff !important;
  font-weight: 600;
  backdrop-filter: blur(8px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: 'Cascadia Code', Consolas, monospace;
  letter-spacing: 1px;
  position: relative;
  overflow: hidden;
}
.hero-btn::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  background: rgba(0,229,255,0.15);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: width 0.4s, height 0.4s;
}
.hero-btn:hover {
  background: rgba(0,229,255,0.2) !important;
  box-shadow: 0 0 20px rgba(0,229,255,0.15), inset 0 0 20px rgba(0,229,255,0.05);
  transform: translateY(-2px);
}
.hero-btn:hover::after {
  width: 300px;
  height: 300px;
}
.hero-btn:active {
  transform: translateY(0) scale(0.97);
}
.btn-icon { font-size: 18px; margin-right: 4px; vertical-align: middle; }

.hero-stats {
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(102,126,234,0.06);
  border: 1px solid rgba(102,126,234,0.12);
  border-radius: 10px;
  padding: 14px 0;
  backdrop-filter: blur(4px);
}

.hero-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: transform 0.3s;
}
.hero-stat:hover {
  transform: scale(1.08);
}

.hero-stat-divider {
  width: 1px;
  height: 32px;
  background: linear-gradient(transparent, rgba(102,126,234,0.3), transparent);
  flex-shrink: 0;
  animation: divider-pulse 2s ease-in-out infinite alternate;
}
@keyframes divider-pulse {
  from { opacity: 0.4; }
  to { opacity: 1; }
}

.hs-num {
  font-size: 24px;
  font-weight: 700;
  color: #00e5ff;
  font-family: 'Cascadia Code', Consolas, monospace;
  text-shadow: 0 0 10px rgba(0,229,255,0.3);
  transition: all 0.3s;
}
.hero-stat:hover .hs-num {
  text-shadow: 0 0 20px rgba(0,229,255,0.6);
  transform: scale(1.1);
}

.hs-label {
  font-size: 12px;
  color: rgba(200,210,240,0.5);
  letter-spacing: 1px;
}

/* ===== Table Card ===== */
.table-card {
  position: relative;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  border: 1px solid #ebeef5;
  padding: 4px;
  overflow: hidden;
  animation: card-enter 0.5s ease-out 0.2s both;
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.table-card-border {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #667eea, #00e5ff, #764ba2, #667eea);
  background-size: 300% 100%;
  animation: border-flow 6s linear infinite;
  z-index: 1;
}

@keyframes border-flow {
  from { background-position: 0 0; }
  to { background-position: 300% 0; }
}

.table-card :deep(.el-table) { --el-table-border-color: #f0f0f5; }

.table-card :deep(.table-row) {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.table-card :deep(.table-row:hover > td) {
  background: rgba(102,126,234,0.05) !important;
}
.table-card :deep(.table-row:hover) {
  transform: scale(1.002);
  box-shadow: 0 2px 12px rgba(102,126,234,0.08);
}

/* Staggered row entrance */
.table-card :deep(.el-table__body tr) {
  animation: row-enter 0.35s ease-out both;
}
.table-card :deep(.el-table__body tr:nth-child(1)) { animation-delay: 0.05s; }
.table-card :deep(.el-table__body tr:nth-child(2)) { animation-delay: 0.08s; }
.table-card :deep(.el-table__body tr:nth-child(3)) { animation-delay: 0.11s; }
.table-card :deep(.el-table__body tr:nth-child(4)) { animation-delay: 0.14s; }
.table-card :deep(.el-table__body tr:nth-child(5)) { animation-delay: 0.17s; }
.table-card :deep(.el-table__body tr:nth-child(6)) { animation-delay: 0.20s; }
.table-card :deep(.el-table__body tr:nth-child(7)) { animation-delay: 0.23s; }
.table-card :deep(.el-table__body tr:nth-child(8)) { animation-delay: 0.26s; }
.table-card :deep(.el-table__body tr:nth-child(9)) { animation-delay: 0.29s; }
.table-card :deep(.el-table__body tr:nth-child(10)) { animation-delay: 0.32s; }

@keyframes row-enter {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}

.cell-name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.name-dot {
  position: relative;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  flex-shrink: 0;
  transition: all 0.3s;
}
.name-dot-inner {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1px solid rgba(102,126,234,0.3);
  animation: dot-ring 2s ease-in-out infinite;
}
@keyframes dot-ring {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.3); opacity: 0; }
}
.table-row:hover .name-dot {
  transform: scale(1.2);
  box-shadow: 0 0 8px rgba(102,126,234,0.4);
}

.name-text {
  font-weight: 600;
  color: #303133;
  font-size: 14px;
  transition: color 0.2s;
}
.table-row:hover .name-text {
  color: #667eea;
}

.cell-path {
  display: flex;
  align-items: center;
  gap: 6px;
}

.path-icon { font-size: 14px; flex-shrink: 0; }

.path-text {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  color: #667eea;
  word-break: break-all;
  line-height: 1.5;
  transition: color 0.2s;
}
.table-row:hover .path-text {
  color: #4a5cf7;
}

.cell-empty { color: #c0c4cc; font-size: 13px; }

.cell-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  display: inline-block;
  vertical-align: middle;
}

.branch-plain {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  color: #667eea;
  font-weight: 500;
}

/* Operation buttons */
.ops-cell {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
}
.ops-cell :deep(.el-button) {
  transition: all 0.2s;
}
.ops-cell :deep(.el-button:hover) {
  transform: translateY(-1px);
}

.pagination-area {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* ===== Dialog ===== */
.proj-dialog :deep(.el-dialog) {
  border-radius: 14px;
  overflow: hidden;
  animation: dialog-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialog-pop {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.proj-dialog :deep(.el-dialog__header) {
  padding: 20px 24px 16px;
  border-bottom: 1px solid #f0f0f5;
  margin-right: 0;
}

.proj-dialog :deep(.el-dialog__body) {
  padding: 24px;
}

.proj-dialog :deep(.el-dialog__footer) {
  padding: 16px 24px;
  border-top: 1px solid #f0f0f5;
}

.proj-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: #606266;
}

.chain-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.chain-input { flex: 1; }

.detect-hint {
  margin-top: 4px;
  animation: hint-in 0.3s ease-out;
}

@keyframes hint-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.branches-preview {
  padding: 10px 14px;
  background: rgba(102,126,234,0.04);
  border-radius: 8px;
  margin-top: 4px;
  animation: hint-in 0.3s ease-out;
}

.branches-label {
  font-size: 12px;
  color: #909399;
  margin-right: 8px;
}

.branch-tag {
  margin: 2px 4px;
  transition: all 0.2s;
}
.branch-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(102,126,234,0.15);
}

.branches-more {
  font-size: 12px;
  color: #909399;
  margin-left: 4px;
}
</style>
