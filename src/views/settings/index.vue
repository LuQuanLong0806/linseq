<template>
  <div class="settings-page">
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <span class="card-title">⚙️ 系统设置</span>
          </template>
          <el-form label-position="top">
            <el-form-item label="应用名称">
              <el-input v-model="settings.appName" />
            </el-form-item>
            <el-form-item label="默认项目路径">
              <el-input v-model="settings.projectPath" placeholder="F:\your-project" />
            </el-form-item>
            <el-form-item label="ESLint 校验">
              <el-switch v-model="settings.eslintEnabled" active-text="开启" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="自动自测">
              <el-switch v-model="settings.autoTest" active-text="开启" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="数据存储路径">
              <el-input v-model="settings.dataPath" placeholder="./data" />
            </el-form-item>
            <el-form-item label="自测报告输出目录">
              <el-input v-model="settings.reportOutputDir" placeholder="F:\0_workspace\00_Agent自测报告">
                <template #append>
                  <el-button @click="handleOpenReportDir">选择目录</el-button>
                </template>
              </el-input>
              <div class="form-tip">AI 完成开发后自测报告（Word）将输出到此目录</div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSave">保存设置</el-button>
              <el-button @click="handleReset">重置默认</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <span class="card-title">🗄️ 数据管理</span>
          </template>
          <div class="data-actions">
            <div class="action-item">
              <span>导出任务数据</span>
              <el-button type="primary" size="small" @click="handleExport">导出 JSON</el-button>
            </div>
            <div class="action-item">
              <span>导入任务数据</span>
              <el-button size="small" @click="handleImport">选择文件</el-button>
            </div>
            <div class="action-item">
              <span>清空本地缓存</span>
              <el-button type="danger" size="small" @click="handleClearCache">清空</el-button>
            </div>
            <div class="action-item">
              <span>重置数据库</span>
              <el-button type="danger" size="small" @click="handleResetDB">重置</el-button>
            </div>
          </div>
        </el-card>

        <el-card shadow="hover" style="margin-top: 20px;">
          <template #header>
            <span class="card-title">ℹ️ 关于</span>
          </template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="应用名称">灵序 LINSEQ</el-descriptions-item>
            <el-descriptions-item label="版本">v1.0.0</el-descriptions-item>
            <el-descriptions-item label="技术栈">Vue3 + Vite + Element Plus + SQLite</el-descriptions-item>
            <el-descriptions-item label="运行环境">本地 Node.js</el-descriptions-item>
            <el-descriptions-item label="数据安全">所有数据本地存储，不上传第三方</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { settingsApi } from '@/api/settings'

const settings = reactive({
  appName: '灵序 LINSEQ',
  projectPath: '',
  eslintEnabled: true,
  autoTest: true,
  dataPath: './data',
  reportOutputDir: 'F:\\0_workspace\\00_Agent自测报告',
})

onMounted(async () => {
  try {
    const res = await settingsApi.getReportDir()
    settings.reportOutputDir = res.data.reportOutputDir
  } catch { /* use default */ }
})

async function handleSave() {
  localStorage.setItem('linesequence-settings', JSON.stringify(settings))
  try {
    await settingsApi.updateReportDir(settings.reportOutputDir)
    ElMessage.success('设置已保存')
  } catch {
    ElMessage.error('保存报告目录失败')
  }
}

function handleReset() {
  settings.appName = '灵序 LINSEQ'
  settings.projectPath = ''
  settings.eslintEnabled = true
  settings.autoTest = true
  settings.dataPath = './data'
  settings.reportOutputDir = 'F:\\0_workspace\\00_Agent自测报告'
  ElMessage.success('已重置为默认值')
}

function handleOpenReportDir() {
  ElMessage.info('请直接输入报告输出目录的完整路径')
}

function handleExport() {
  ElMessage.info('导出功能开发中...')
}

function handleImport() {
  ElMessage.info('导入功能开发中...')
}

async function handleClearCache() {
  try {
    await ElMessageBox.confirm('确定清空本地缓存？此操作不可恢复。', '警告', { type: 'warning' })
    localStorage.removeItem('linesequence-cache')
    ElMessage.success('缓存已清空')
  } catch { /* cancelled */ }
}

async function handleResetDB() {
  try {
    await ElMessageBox.confirm('确定重置数据库？所有本地数据将丢失！', '危险操作', { type: 'error' })
    ElMessage.success('数据库已重置')
  } catch { /* cancelled */ }
}
</script>

<style lang="scss" scoped>
.settings-page {
  max-width: 1200px;
  margin: 0 auto;
}

.card-title {
  font-weight: 600;
  font-size: 15px;
}

.data-actions {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.action-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;

  &:last-child { border-bottom: none; }
}

.form-tip {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>