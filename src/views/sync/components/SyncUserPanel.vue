<template>
  <div class="cyber-panel sync-user-panel">
    <div class="panel-header">
      <span class="card-title">用户管理</span>
      <el-tag v-if="userStore.currentUser" type="success" effect="dark" size="small">{{ userStore.currentUser.displayName }}</el-tag>
      <el-button v-if="userStore.users.length > 0" link type="primary" size="small" style="margin-left: auto;" @click="showLogin = !showLogin">
        {{ showLogin ? '收起' : '添加账号' }}
      </el-button>
    </div>

    <!-- 登录表单（可折叠） -->
    <el-collapse-transition>
      <div v-if="showLogin || userStore.users.length === 0" class="login-form">
        <el-form :model="loginForm" label-width="80px" label-position="left" @submit.prevent="handleLogin">
          <el-form-item label="内网账号">
            <el-input v-model="loginForm.username" placeholder="输入用户名" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="loginForm.password" type="password" placeholder="输入密码" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleLogin" :loading="userStore.loginLoading">登录内网</el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-collapse-transition>

    <!-- 用户列表（级联展开 Keys） -->
    <div v-if="userStore.users.length > 0" class="user-list">
      <div class="section-label">已登录账号</div>
      <div
        v-for="user in userStore.users" :key="user.username"
        class="user-card"
        :class="{
          active: userStore.currentUser?.username === user.username,
          expanded: expandedUser === user.username,
          switching: switchingUser === user.username,
        }"
      >
        <!-- 用户主行 -->
        <div class="user-row" @click="toggleExpand(user.username)">
          <div class="user-avatar" :class="{ 'avatar-active': userStore.currentUser?.username === user.username }">
            <span class="avatar-text">{{ user.displayName?.charAt(0) || '?' }}</span>
            <span class="avatar-status" :class="loginStatusClass(user)" />
          </div>
          <div class="user-info" @click.stop="handleSwitchUser(user.username)">
            <div class="user-name-row">
              <span class="user-name">{{ user.displayName }}</span>
              <span v-if="userStore.currentUser?.username === user.username" class="current-badge">当前</span>
              <span v-if="getKeyCount(user.username) > 0" class="key-badge">{{ getKeyCount(user.username) }} Key</span>
            </div>
            <div class="user-sub">
              <span class="login-status" :class="loginStatusClass(user)">{{ loginStatusText(user) }}</span>
              <span v-if="user.cookieExpiry" class="cookie-expiry">{{ formatExpiry(user.cookieExpiry) }}</span>
            </div>
          </div>
          <div class="user-actions" @click.stop>
            <el-tooltip content="生成 Key" placement="top">
              <button class="icon-btn" @click="handleCreateKey(user.username)" :disabled="creatingKey"><el-icon><Plus /></el-icon></button>
            </el-tooltip>
            <el-tooltip content="刷新登录" placement="top">
              <button class="icon-btn" @click="$emit('refreshCookie', user.username)" :disabled="refreshingUser === user.username"><el-icon><RefreshRight /></el-icon></button>
            </el-tooltip>
            <el-tooltip content="删除用户" placement="top">
              <button class="icon-btn danger" @click="handleDeleteUser(user.username)"><el-icon><Delete /></el-icon></button>
            </el-tooltip>
          </div>
          <el-icon class="expand-arrow" :class="{ open: expandedUser === user.username }"><ArrowDown /></el-icon>
        </div>

        <!-- 级联：该用户的 Agent Keys -->
        <el-collapse-transition>
          <div v-if="expandedUser === user.username" class="key-section">
            <div class="key-header">
              <span class="section-label">Agent Key</span>
            </div>
            <div v-if="getKeys(user.username).length" class="key-list">
              <div v-for="ak in getKeys(user.username)" :key="ak.id" class="key-item">
                <div class="key-head">
                  <span class="key-name">{{ ak.name || '未命名' }}</span>
                  <el-tag :type="ak.enabled ? 'success' : 'info'" size="small">{{ ak.enabled ? '启用' : '禁用' }}</el-tag>
                  <span class="key-time" v-if="ak.lastUsedAt">{{ formatDateTime(ak.lastUsedAt) }}</span>
                </div>
                <div class="key-value">
                  <code class="key-code" :class="{ masked: !revealedKeys.has(ak.id) }" @click="toggleReveal(ak.id)">
                    {{ revealedKeys.has(ak.id) ? ak.key : ak.key.substring(0, 8) + '••••••••' }}
                  </code>
                  <el-button link size="small" type="primary" @click="copyKey(ak.key)">复制</el-button>
                </div>
                <div class="key-actions">
                  <el-button link size="small" :type="ak.enabled ? 'warning' : 'success'" @click="handleToggleKey(ak.id, user.username)" :loading="togglingKey === ak.id">
                    {{ ak.enabled ? '禁用' : '启用' }}
                  </el-button>
                  <el-button link size="small" type="danger" @click="handleDeleteKey(ak.id, user.username)">删除</el-button>
                </div>
              </div>
            </div>
            <div v-else-if="!keysLoading" class="empty-keys">暂无 Key</div>
          </div>
        </el-collapse-transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Plus, RefreshRight, Delete } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import type { AgentKey } from '@/types'

defineEmits<{ refreshCookie: [username: string] }>()

const userStore = useUserStore()
const showLogin = ref(false)
const switchingUser = ref('')
const refreshingUser = ref('')
const creatingKey = ref(false)
const togglingKey = ref('')
const expandedUser = ref('')
const keysLoading = ref(false)
const revealedKeys = ref(new Set<string>())
const keysCache = ref(new Map<string, AgentKey[]>())
const loginForm = reactive({ username: '', password: '' })

function isExpired(expiry: string) {
  return !expiry || new Date(expiry).getTime() < Date.now()
}

function formatExpiry(expiry: string): string {
  if (!expiry) return ''
  const dateStr = dayjs(expiry).format('YYYY-MM-DD HH:mm')
  const diff = dayjs(expiry).diff(dayjs(), 'millisecond')
  if (diff <= 0) return `到期时间：${dateStr}（已过期）`
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `到期时间：${dateStr}（${hours}小时后）`
  return `到期时间：${dateStr}（${Math.floor(hours / 24)}天后）`
}

function formatDateTime(date: string) {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm') : ''
}

type UserLike = { cookieExpiry: string }
function loginStatusClass(user: UserLike): string {
  if (user.cookieExpiry && !isExpired(user.cookieExpiry)) return 'status-online'
  if (user.cookieExpiry) return 'status-expired'
  return 'status-offline'
}
function loginStatusText(user: UserLike): string {
  if (user.cookieExpiry && !isExpired(user.cookieExpiry)) return '在线'
  if (user.cookieExpiry) return '已过期'
  return '未登录'
}

function getKeys(username: string): AgentKey[] {
  return keysCache.value.get(username) || []
}

function getKeyCount(username: string): number {
  return keysCache.value.get(username)?.length ?? 0
}

// 预加载所有用户的 Key 数量
async function preloadKeyCounts() {
  for (const user of userStore.users) {
    if (!keysCache.value.has(user.username)) {
      try {
        await userStore.fetchAgentKeys(user.username)
        keysCache.value.set(user.username, [...userStore.agentKeys])
      } catch { /* ignore */ }
    }
  }
}

watch(() => userStore.users, () => preloadKeyCounts(), { immediate: true })

async function toggleExpand(username: string) {
  if (expandedUser.value === username) {
    expandedUser.value = ''
    return
  }
  expandedUser.value = username
  if (!keysCache.value.has(username)) {
    keysLoading.value = true
    try {
      await userStore.fetchAgentKeys(username)
      keysCache.value.set(username, [...userStore.agentKeys])
    } finally {
      keysLoading.value = false
    }
  }
}

function refreshCache(username: string) {
  keysCache.value.set(username, [...userStore.agentKeys])
}

function toggleReveal(id: string) {
  if (revealedKeys.value.has(id)) revealedKeys.value.delete(id)
  else revealedKeys.value.add(id)
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
    showLogin.value = false
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
    keysCache.value.delete(username)
    if (expandedUser.value === username) expandedUser.value = ''
    ElMessage.success('已删除')
  } catch { /* cancel */ }
}

async function handleCreateKey(username: string) {
  creatingKey.value = true
  try {
    const cached = keysCache.value.get(username) || []
    await userStore.createAgentKey(username, `Key-${cached.length + 1}`)
    refreshCache(username)
    ElMessage.success('已生成')
  } catch { ElMessage.error('生成失败') }
  finally { creatingKey.value = false }
}

async function handleToggleKey(id: string, username: string) {
  togglingKey.value = id
  try {
    await userStore.toggleAgentKey(id)
    await userStore.fetchAgentKeys(username)
    refreshCache(username)
    ElMessage.success('已切换')
  } catch { ElMessage.error('操作失败') }
  finally { togglingKey.value = '' }
}

async function handleDeleteKey(id: string, username: string) {
  try {
    await ElMessageBox.confirm('确定删除该 Key？使用该 Key 的 Agent 将无法访问。', '删除确认', { type: 'warning' })
    await userStore.deleteAgentKey(id)
    await userStore.fetchAgentKeys(username)
    refreshCache(username)
    ElMessage.success('已删除')
  } catch { /* cancel */ }
}

function copyKey(key: string) {
  navigator.clipboard.writeText(key).then(() => ElMessage.success('已复制')).catch(() => ElMessage.error('复制失败'))
}
</script>

<style lang="scss" scoped>
.sync-user-panel {
  .panel-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--cyber-glass-border);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .card-title { font-weight: 600; font-size: 15px; }
  .login-form { padding: 16px 20px; border-bottom: 1px solid var(--cyber-glass-border); }
  .user-list { padding: 16px 20px; }

  .section-label {
    font-size: 11px;
    color: var(--cyber-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 14px;
  }
}

/* ===== 用户卡片 ===== */
.user-card {
  border-radius: 12px;
  border: 1px solid var(--cyber-glass-border);
  margin-bottom: 10px;
  overflow: hidden;
  transition: border-color 0.25s, box-shadow 0.25s;

  &:hover {
    border-color: var(--cyber-glass-border-hover);
  }

  &.active {
    border-color: var(--cyber-cyan);
    box-shadow: 0 0 12px var(--cyber-glow-cyan);
  }

  &.switching {
    opacity: 0.5;
    pointer-events: none;
  }

  &.expanded {
    border-color: var(--cyber-glass-border-hover);
  }
}

.user-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover { background: var(--cyber-glass-bg); }
}

/* --- 头像 --- */
.user-avatar {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--cyber-glass-bg-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.3s;

  .avatar-text {
    font-size: 17px;
    font-weight: 800;
    color: var(--cyber-cyan);
    user-select: none;
  }

  &.avatar-active {
    background: linear-gradient(135deg, var(--cyber-cyan), var(--cyber-purple));

    .avatar-text { color: #fff; }
  }

  .avatar-status {
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--cyber-bg);

    &.status-online  { background: #67C23A; }
    &.status-expired { background: #E6A23C; }
    &.status-offline { background: #909399; }
  }
}

/* --- 信息区 --- */
.user-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.user-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--cyber-text-primary);
}

.current-badge {
  font-size: 10px;
  font-weight: 600;
  color: #67C23A;
  background: rgba(103, 194, 58, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.6;
}

.key-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--cyber-cyan);
  background: var(--el-color-primary-light-9);
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.6;
}

.user-sub {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 3px;
  white-space: nowrap;
}

.login-status {
  font-size: 12px;

  &.status-online  { color: #67C23A; }
  &.status-expired { color: #E6A23C; }
  &.status-offline { color: var(--cyber-text-muted); }

  &::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: middle;
  }
  &.status-online::before  { background: #67C23A; }
  &.status-expired::before { background: #E6A23C; }
  &.status-offline::before { background: #909399; }
}

.cookie-expiry {
  font-size: 11px;
  color: var(--cyber-text-muted);
}

/* --- 操作按钮 --- */
.user-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid var(--cyber-glass-border);
  background: var(--cyber-glass-bg);
  color: var(--cyber-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;

  &:hover {
    border-color: var(--cyber-glass-border-hover);
    color: var(--cyber-cyan);
    background: var(--el-color-primary-light-9);
  }

  &.danger:hover {
    color: var(--el-color-danger);
    border-color: var(--el-color-danger-light-5);
    background: var(--el-color-danger-light-9);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.expand-arrow {
  color: var(--cyber-text-muted);
  font-size: 14px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;

  &.open { transform: rotate(180deg); color: var(--cyber-cyan); }
}

/* ===== Key 区域 ===== */
.key-section {
  padding: 12px 16px 16px;
  border-top: 1px solid var(--cyber-glass-border);

  .key-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    .section-label { margin-bottom: 0; }
  }
}

.key-item {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--cyber-glass-border);
  margin-bottom: 8px;
  background: var(--cyber-glass-bg);
  transition: border-color 0.2s;

  &:hover { border-color: var(--cyber-glass-border-hover); }

  .key-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .key-name { font-weight: 600; font-size: 13px; color: var(--cyber-text-primary); }
  .key-time { font-size: 11px; color: var(--cyber-text-muted); margin-left: auto; }

  .key-value { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }

  .key-code {
    flex: 1;
    font-size: 11px;
    font-family: monospace;
    color: var(--cyber-cyan);
    background: var(--el-fill-color-blank);
    padding: 5px 10px;
    border-radius: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.2s;
    user-select: none;
    &:hover { background: var(--el-border-color); }
    &.masked { letter-spacing: 1px; }
  }

  .key-actions { display: flex; gap: 6px; justify-content: flex-end; }
}

.empty-keys {
  text-align: center;
  color: var(--cyber-text-muted);
  padding: 16px 0;
  font-size: 13px;
}
</style>
