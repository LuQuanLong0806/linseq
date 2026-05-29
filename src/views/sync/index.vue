<template>
  <div class="sync-page">
    <el-row :gutter="20">
      <!-- 用户管理 -->
      <el-col :span="12">
        <div class="cyber-panel config-card">
          <div class="panel-header">
            <span class="card-title">用户管理</span>
            <el-tag v-if="userStore.currentUser" type="success" effect="dark" size="small" style="margin-left: 8px;">
              当前: {{ userStore.currentUser.displayName }}
            </el-tag>
          </div>

          <!-- 登录表单 -->
          <div class="login-form">
            <el-form :model="loginForm" label-width="90px" label-position="left" @submit.prevent="handleLogin">
              <el-form-item label="内网账号">
                <el-input v-model="loginForm.username" placeholder="输入内网用户名" />
              </el-form-item>
              <el-form-item label="密码">
                <el-input v-model="loginForm.password" type="password" placeholder="输入内网密码" show-password />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="handleLogin" :loading="userStore.loginLoading">
                  登录内网
                </el-button>
              </el-form-item>
            </el-form>
          </div>

          <!-- 已有用户列表 -->
          <div v-if="userStore.users.length > 0" class="user-list">
            <div class="user-list-title">已登录用户</div>
            <div
              v-for="user in userStore.users" :key="user.username"
              class="user-item"
              :class="{ active: userStore.currentUser?.username === user.username, switching: switchingUser === user.username }"
              @click="handleSwitchUser(user.username)"
            >
              <div class="user-info">
                <span class="user-name">{{ user.displayName }}</span>
                <el-tag v-if="userStore.currentUser?.username === user.username" type="success" size="small" effect="dark">当前</el-tag>
                <el-tag v-if="user.cookieExpiry && !isExpired(user.cookieExpiry)" type="info" size="small">已登录</el-tag>
                <el-tag v-else-if="user.cookieExpiry" type="warning" size="small">已过期</el-tag>
                <el-tag v-else type="danger" size="small">未登录</el-tag>
              </div>
              <div class="user-actions" @click.stop>
                <el-button link size="small" type="primary" @click="handleRefreshCookie(user.username)" :loading="refreshingUser === user.username">刷新登录</el-button>
                <el-button link size="small" type="danger" @click="handleDeleteUser(user.username)">删除</el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- 同步配置 -->
        <div class="cyber-panel config-card" style="margin-top: 20px;">
          <div class="panel-header">
            <span class="card-title">同步配置</span>
          </div>
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
            <el-form-item label="Agent 唤醒地址">
              <el-input v-model="syncStore.config.webhookUrl" placeholder="http://localhost:50439/v1/chat/completions" clearable />
              <div class="form-hint">OpenClaw Gateway 的 Chat API 地址。发补充说明时自动 POST 唤醒 Agent 处理</div>
            </el-form-item>
            <el-form-item label="OpenClaw 认证 Token" v-if="syncStore.config.webhookUrl">
              <el-input v-model="syncStore.config.openclawToken" placeholder="从 ~/.qclaw/openclaw.json 的 gateway.auth.token 复制" show-password clearable />
              <div class="form-hint">在 ~/.qclaw/openclaw.json 文件的 gateway.auth.token 字段中获取</div>
            </el-form-item>
            <el-form-item label="唤醒目标 Agent" v-if="syncStore.config.webhookUrl">
              <el-select v-model="syncStore.config.agentTarget" placeholder="选择 Agent" style="width: 100%">
                <el-option label="灵序 LINSEQ (默认)" value="agent-209e563a" />
                <el-option label="QClaw" value="main" />
                <el-option label="AI工程师" value="ua58rsb93veqtxl7" />
                <el-option label="Python全栈" value="tfxjjhfnjialcuju" />
                <el-option label="Unity架构师" value="jwag9yx1mrcclqzo" />
                <el-option label="游戏设计师" value="uafru5gofdt644lm" />
                <el-option label="小说创作专家" value="ds4ygtfdv3z7mmxn" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSaveConfig" :loading="savingConfig">保存配置</el-button>
            </el-form-item>
          </el-form>
        </div>

        <!-- Agent Key 管理 -->
        <div class="cyber-panel config-card" style="margin-top: 20px;" v-if="userStore.currentUser">
          <div class="panel-header">
            <span class="card-title">Agent Key 管理</span>
            <el-button type="primary" size="small" style="margin-left: auto;" @click="handleCreateKey" :loading="creatingKey">生成新 Key</el-button>
          </div>
          <div class="agent-key-list" v-if="userStore.agentKeys.length > 0">
            <div v-for="ak in userStore.agentKeys" :key="ak.id" class="agent-key-item">
              <div class="key-info">
                <span class="key-name">{{ ak.name || '未命名' }}</span>
                <el-tag :type="ak.enabled ? 'success' : 'info'" size="small">{{ ak.enabled ? '启用' : '禁用' }}</el-tag>
                <span class="key-time" v-if="ak.lastUsedAt">最后使用: {{ ak.lastUsedAt }}</span>
              </div>
              <div class="key-value">
                <code>{{ ak.key }}</code>
                <el-button link size="small" type="primary" @click="copyKey(ak.key)">复制</el-button>
              </div>
              <div class="key-actions">
                <el-button link size="small" :type="ak.enabled ? 'warning' : 'success'" @click="handleToggleKey(ak.id)" :loading="togglingKey === ak.id">
                  {{ ak.enabled ? '禁用' : '启用' }}
                </el-button>
                <el-button link size="small" type="danger" @click="handleDeleteKey(ak.id)">删除</el-button>
              </div>
            </div>
          </div>
          <div v-else class="empty-keys">暂无 Agent Key，点击上方按钮生成</div>
        </div>
      </el-col>

      <!-- 同步操作 & 记录 -->
      <el-col :span="12">
        <div class="cyber-panel sync-action-card">
          <div class="panel-header">
            <span class="card-title">同步操作</span>
          </div>
          <div class="sync-area">
            <el-button
              type="primary"
              size="large"
              :icon="Refresh"
              :loading="syncStore.syncing"
              :disabled="!userStore.currentUser"
              @click="handleSync"
              class="sync-btn"
            >
              {{ syncStore.syncing ? '同步中...' : '一键同步内网任务' }}
            </el-button>
            <p class="sync-hint" v-if="!userStore.currentUser">请先登录内网账号</p>
            <p class="sync-hint" v-else>将同步 {{ userStore.currentUser.displayName }} 的内网任务数据</p>
          </div>

          <!-- 登录状态 -->
          <div v-if="userStore.currentUser" class="login-info">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="当前用户">{{ userStore.currentUser.displayName }}</el-descriptions-item>
              <el-descriptions-item label="登录状态">
                <el-tag :type="isExpired(userStore.currentUser.cookieExpiry) ? 'warning' : 'success'" effect="dark" size="small">
                  {{ userStore.currentUser.cookieExpiry && !isExpired(userStore.currentUser.cookieExpiry) ? '已登录' : '需刷新' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="Cookie过期">{{ userStore.currentUser.cookieExpiry || '未登录' }}</el-descriptions-item>
              <el-descriptions-item label="上次同步">{{ userStore.currentUser.lastSyncTime || '从未同步' }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

        <div class="cyber-panel config-card" style="margin-top: 20px;">
          <div class="panel-header">
            <span class="card-title">同步记录</span>
          </div>
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
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useSyncStore } from '@/stores/sync'
import { useUserStore } from '@/stores/user'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const syncStore = useSyncStore()
const userStore = useUserStore()

const loginForm = reactive({ username: '', password: '' })
const switchingUser = ref('')
const refreshingUser = ref('')
const savingConfig = ref(false)
const creatingKey = ref(false)
const togglingKey = ref('')

function isExpired(expiry: string) {
  return !expiry || new Date(expiry).getTime() < Date.now()
}

async function handleLogin() {
  if (!loginForm.username || !loginForm.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  try {
    await userStore.login(loginForm.username, loginForm.password)
    loginForm.username = ''
    loginForm.password = ''
    ElMessage.success(`已登录为 ${userStore.currentUser?.displayName}`)
  } catch {
    ElMessage.error('登录失败，请检查用户名密码')
  }
}

async function handleSwitchUser(username: string) {
  if (userStore.currentUser?.username === username) return
  switchingUser.value = username
  try {
    await userStore.switchUser(username)
    await syncStore.fetchConfig()
    await syncStore.fetchSyncRecords()
    ElMessage.success(`已切换到 ${userStore.currentUser?.displayName}`)
  } catch {
    ElMessage.error('切换失败')
  } finally {
    switchingUser.value = ''
  }
}

async function handleDeleteUser(username: string) {
  try {
    await ElMessageBox.confirm(`确定删除用户「${username}」及其所有数据？`, '删除用户', { type: 'warning' })
    await userStore.deleteUser(username)
    ElMessage.success('已删除')
  } catch { /* cancel */ }
}

async function handleRefreshCookie(username: string) {
  refreshingUser.value = username
  try {
    await userStore.refreshCookie(username)
    ElMessage.success('登录已刷新')
  } catch {
    ElMessage.error('刷新失败，请重新登录')
  } finally {
    refreshingUser.value = ''
  }
}

async function handleSaveConfig() {
  savingConfig.value = true
  try {
    await syncStore.updateConfig({
      intranetUrl: syncStore.config.intranetUrl,
      autoSync: syncStore.config.autoSync,
      syncInterval: syncStore.config.syncInterval,
      webhookUrl: syncStore.config.webhookUrl,
      openclawToken: syncStore.config.openclawToken,
      agentTarget: syncStore.config.agentTarget,
    })
    ElMessage.success('配置已保存')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    savingConfig.value = false
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

async function handleCreateKey() {
  if (!userStore.currentUser) return
  creatingKey.value = true
  try {
    const name = `Key-${userStore.agentKeys.length + 1}`
    await userStore.createAgentKey(userStore.currentUser.username, name)
    ElMessage.success('Agent Key 已生成')
  } catch {
    ElMessage.error('生成失败')
  } finally {
    creatingKey.value = false
  }
}

async function handleToggleKey(id: string) {
  togglingKey.value = id
  try {
    await userStore.toggleAgentKey(id)
    ElMessage.success('状态已切换')
  } catch {
    ElMessage.error('操作失败')
  } finally {
    togglingKey.value = ''
  }
}

async function handleDeleteKey(id: string) {
  try {
    await ElMessageBox.confirm('确定删除该 Agent Key？删除后使用该 Key 的 Agent 将无法访问。', '删除确认', { type: 'warning' })
    await userStore.deleteAgentKey(id)
    ElMessage.success('已删除')
  } catch { /* cancel */ }
}

function copyKey(key: string) {
  navigator.clipboard.writeText(key).then(() => {
    ElMessage.success('已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

onMounted(() => {
  userStore.init().then(() => {
    if (userStore.currentUser) userStore.fetchAgentKeys(userStore.currentUser.username)
  })
  syncStore.fetchConfig()
  syncStore.fetchSyncRecords()
})
</script>

<style lang="scss" scoped>
.sync-page {
  max-width: var(--container-lg);
  margin: 0 auto;
}

.config-card, .sync-action-card {
  .panel-header {
    padding: 14px 20px;
    border-bottom: 1px solid rgba(0,229,255,0.08);
    margin-bottom: 16px;
    display: flex;
    align-items: center;
  }

  .card-title {
    font-weight: 600;
    font-size: 15px;
  }
}

.login-form {
  padding: 0 20px 16px;
}

.user-list {
  padding: 0 20px 16px;

  .user-list-title {
    font-size: 12px;
    color: #8c8ca1;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
}

.user-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0,229,255,0.08);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: rgba(0,229,255,0.2);
    background: rgba(0,229,255,0.04);
  }

  &.active {
    border-color: rgba(0,229,255,0.3);
    background: rgba(0,229,255,0.08);
  }

  &.switching {
    opacity: 0.6;
    pointer-events: none;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .user-name {
    font-size: 13px;
    font-weight: 600;
    color: #e0e0ef;
  }

  .user-actions {
    display: flex;
    gap: 4px;
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
    background: linear-gradient(135deg, #00E5FF, #9D5CFF);
    border: none;
  }

  .sync-hint {
    margin-top: 12px;
    color: var(--cyber-text-secondary);
    font-size: 13px;
  }
}

.login-info {
  padding: 0 20px 20px;
}

.sync-record {
  .record-stats {
    display: flex;
    gap: 16px;
    font-size: 13px;
    color: var(--cyber-text-secondary);

    .new { color: #00E5FF; }
    .updated { color: #FF7D00; }
    .unchanged { color: var(--cyber-text-secondary); }
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

.agent-key-list {
  padding: 0 20px 16px;
}

.agent-key-item {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0,229,255,0.08);
  margin-bottom: 8px;

  .key-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;

    .key-name {
      font-weight: 600;
      font-size: 13px;
      color: #e0e0ef;
    }

    .key-time {
      font-size: 11px;
      color: #8c8ca1;
      margin-left: auto;
    }
  }

  .key-value {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;

    code {
      flex: 1;
      font-size: 11px;
      color: #00E5FF;
      background: rgba(0,229,255,0.06);
      padding: 4px 8px;
      border-radius: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .key-actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }
}

.empty-keys {
  text-align: center;
  color: #c0c4cc;
  padding: 20px 0;
  font-size: 13px;
}
.form-hint {
  font-size: 11px;
  color: var(--cyber-text-muted);
  margin-top: 4px;
}
</style>
