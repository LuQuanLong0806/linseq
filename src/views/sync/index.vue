<template>
  <div class="sync-page">
    <el-row :gutter="20">
      <!-- 同步配置 -->
      <el-col :span="12">
        <el-card shadow="hover" class="config-card">
          <template #header>
            <span class="card-title">🔗 内网同步配置</span>
          </template>
          <el-form :model="syncStore.config" label-width="100px" label-position="top">
            <el-form-item label="内网地址">
              <el-input v-model="syncStore.config.intranetUrl" placeholder="https://intranet.company.com" />
            </el-form-item>
            <el-form-item label="自动同步">
              <el-switch v-model="syncStore.config.autoSync" active-text="开启" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="同步间隔（分钟）" v-if="syncStore.config.autoSync">
              <el-input-number v-model="syncStore.config.syncInterval" :min="5" :max="1440" :step="5" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSaveConfig">保存配置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 登录状态 -->
        <el-card shadow="hover" class="config-card" style="margin-top: 20px;">
          <template #header>
            <span class="card-title">🔐 登录状态</span>
          </template>
          <div class="login-status">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="登录状态">
                <el-tag :type="loginStatus.isLoggedIn ? 'success' : 'danger'" effect="dark">
                  {{ loginStatus.isLoggedIn ? '已登录' : '未登录' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="Cookie过期时间">
                {{ syncStore.config.cookieExpiry || '未登录' }}
              </el-descriptions-item>
              <el-descriptions-item label="上次同步时间">
                {{ syncStore.config.lastSyncTime || '从未同步' }}
              </el-descriptions-item>
            </el-descriptions>
            <div class="login-actions" style="margin-top: 16px;">
              <el-button type="primary" @click="showLoginDialog = true">登录内网</el-button>
              <el-button @click="checkLogin">检查登录状态</el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 同步操作 & 记录 -->
      <el-col :span="12">
        <el-card shadow="hover" class="sync-action-card">
          <template #header>
            <span class="card-title">🔄 同步操作</span>
          </template>
          <div class="sync-area">
            <el-button
              type="primary"
              size="large"
              :icon="Refresh"
              :loading="syncStore.syncing"
              @click="handleSync"
              class="sync-btn"
            >
              {{ syncStore.syncing ? '同步中...' : '一键同步内网任务' }}
            </el-button>
            <p class="sync-hint">将从内网系统抓取最新任务数据，自动去重更新</p>
          </div>
        </el-card>

        <el-card shadow="hover" class="config-card" style="margin-top: 20px;">
          <template #header>
            <span class="card-title">📋 同步记录</span>
          </template>
          <el-timeline v-if="syncStore.syncRecords.length">
            <el-timeline-item
              v-for="record in syncStore.syncRecords"
              :key="record.id"
              :timestamp="record.syncTime"
              placement="top"
              :type="record.status === 'success' ? 'success' : record.status === 'partial' ? 'warning' : 'danger'"
            >
              <div class="sync-record">
                <div class="record-stats">
                  <span>总计: {{ record.totalTasks }}</span>
                  <span class="new">新增: {{ record.newTasks }}</span>
                  <span class="updated">更新: {{ record.updatedTasks }}</span>
                  <span class="unchanged">不变: {{ record.unchangedTasks }}</span>
                </div>
                <div v-if="record.errorMessages?.length" class="record-errors">
                  <el-tag v-for="(err, i) in record.errorMessages" :key="i" type="danger" size="small">{{ err }}</el-tag>
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>
          <div v-else class="empty-records">暂无同步记录</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 登录弹窗 -->
    <el-dialog v-model="showLoginDialog" title="登录内网系统" width="450px">
      <el-form :model="loginForm" label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="loginForm.username" placeholder="请输入内网用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="loginForm.password" type="password" placeholder="请输入密码" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showLoginDialog = false">取消</el-button>
        <el-button type="primary" @click="handleLogin" :loading="loginLoading">登录</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useSyncStore } from '@/stores/sync'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const syncStore = useSyncStore()
const showLoginDialog = ref(false)
const loginLoading = ref(false)
const loginForm = reactive({ username: '', password: '' })
const loginStatus = reactive({ isLoggedIn: false, expiry: '' })

async function handleSaveConfig() {
  try {
    await syncStore.updateConfig({
      intranetUrl: syncStore.config.intranetUrl,
      autoSync: syncStore.config.autoSync,
      syncInterval: syncStore.config.syncInterval,
    })
    ElMessage.success('配置已保存')
  } catch {
    ElMessage.error('保存失败')
  }
}

async function handleSync() {
  try {
    const result = await syncStore.triggerSync()
    ElMessage.success(`同步完成：新增${result.newTasks}，更新${result.updatedTasks}`)
  } catch {
    ElMessage.error('同步失败，请检查登录状态')
  }
}

async function checkLogin() {
  try {
    const res = await syncStore.checkLoginStatus()
    loginStatus.isLoggedIn = res.data.isLoggedIn
    loginStatus.expiry = res.data.expiry
    ElMessage.success(loginStatus.isLoggedIn ? '登录状态正常' : '未登录，请先登录')
  } catch {
    ElMessage.error('检查失败')
  }
}

async function handleLogin() {
  if (!loginForm.username || !loginForm.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loginLoading.value = true
  try {
    await syncStore.loginIntranet(loginForm.username, loginForm.password)
    showLoginDialog.value = false
    loginStatus.isLoggedIn = true
    ElMessage.success('登录成功')
  } catch {
    ElMessage.error('登录失败，请检查用户名密码')
  } finally {
    loginLoading.value = false
  }
}

onMounted(() => {
  syncStore.fetchConfig()
  syncStore.fetchSyncRecords()
})
</script>

<style lang="scss" scoped>
.sync-page {
  max-width: 1400px;
  margin: 0 auto;
}

.config-card, .sync-action-card {
  :deep .el-card__header {
    padding: 14px 20px;
  }

  .card-title {
    font-weight: 600;
    font-size: 15px;
  }
}

.sync-area {
  text-align: center;
  padding: 20px 0;

  .sync-btn {
    width: 260px;
    height: 50px;
    font-size: 16px;
    border-radius: 12px;
  }

  .sync-hint {
    margin-top: 12px;
    color: #909399;
    font-size: 13px;
  }
}

.login-status {
  .login-actions {
    display: flex;
    gap: 10px;
  }
}

.sync-record {
  .record-stats {
    display: flex;
    gap: 16px;
    font-size: 13px;
    color: #606266;

    .new { color: #67c23a; }
    .updated { color: #e6a23c; }
    .unchanged { color: #909399; }
  }

  .record-errors {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
}

.empty-records {
  text-align: center;
  color: #c0c4cc;
  padding: 40px 0;
}
</style>