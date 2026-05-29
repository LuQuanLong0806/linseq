<template>
  <div class="cyber-panel sync-action-panel">
    <div class="sync-action-content">
      <div class="sync-left">
        <div class="sync-icon" :class="{ pulsing: !syncStore.syncing && userStore.currentUser }">
          <el-icon :size="28"><Refresh /></el-icon>
        </div>
        <div class="sync-info">
          <div class="sync-title">一键同步内网任务</div>
          <div class="sync-desc">
            <template v-if="userStore.currentUser">
              {{ userStore.currentUser.displayName }}
              <span v-if="syncStore.config.lastSyncTime" class="sync-time-sep">·</span>
              <span v-if="syncStore.config.lastSyncTime" class="sync-time">上次 {{ formatDateTime(syncStore.config.lastSyncTime) }}</span>
            </template>
            <template v-else>请先登录内网账号</template>
          </div>
        </div>
      </div>
      <el-button
        type="primary"
        size="large"
        :loading="syncStore.syncing"
        :disabled="!userStore.currentUser"
        @click="$emit('sync')"
        class="sync-btn"
      >
        {{ syncStore.syncing ? '同步中...' : '立即同步' }}
      </el-button>
    </div>

    <div v-if="userStore.currentUser" class="sync-status-bar">
      <div class="status-item">
        <span class="status-label">登录</span>
        <el-tag
          :type="isExpired(userStore.currentUser.cookieExpiry) ? 'warning' : 'success'"
          effect="dark" size="small"
        >{{ userStore.currentUser.cookieExpiry && !isExpired(userStore.currentUser.cookieExpiry) ? '有效' : '已过期' }}</el-tag>
      </div>
      <div class="status-item">
        <span class="status-label">过期时间</span>
        <span class="status-value">{{ formatDateTime(userStore.currentUser.cookieExpiry) }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">上次同步</span>
        <span class="status-value">{{ formatDateTime(userStore.currentUser.lastSyncTime) }}</span>
      </div>
      <el-button link type="primary" size="small" @click="userStore.currentUser && $emit('refreshCookie', userStore.currentUser.username)">
        刷新登录
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSyncStore } from '@/stores/sync'
import { useUserStore } from '@/stores/user'
import { Refresh } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

defineEmits<{ sync: []; refreshCookie: [username: string] }>()

const syncStore = useSyncStore()
const userStore = useUserStore()

function isExpired(expiry: string) {
  return !expiry || new Date(expiry).getTime() < Date.now()
}

function formatDateTime(date: string) {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '—'
}
</script>

<style lang="scss" scoped>
.sync-action-panel {
  padding: 20px 24px;

  .sync-action-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .sync-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .sync-icon {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--cyber-glass-bg-strong);
    color: var(--cyber-cyan);
    flex-shrink: 0;

    &.pulsing { animation: pulse-glow 2.5s ease-in-out infinite; }
  }

  .sync-info {
    .sync-title { font-size: 16px; font-weight: 700; color: var(--cyber-text-primary); }
    .sync-desc { font-size: 13px; color: var(--cyber-text-secondary); margin-top: 4px; }
    .sync-time-sep { margin: 0 4px; color: var(--cyber-text-muted); }
    .sync-time { color: var(--cyber-text-muted); }
  }

  .sync-btn {
    min-width: 140px;
    height: 44px;
    font-size: 15px;
    border-radius: 10px;
    background: linear-gradient(135deg, #00E5FF, #9D5CFF);
    border: none;
    font-weight: 600;
  }

  .sync-status-bar {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--cyber-glass-border);
    flex-wrap: wrap;

    .status-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status-label { font-size: 12px; color: var(--cyber-text-muted); }
    .status-value { font-size: 12px; color: var(--cyber-text-secondary); }
  }
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0,229,255,0.2); }
  50% { box-shadow: 0 0 16px 4px rgba(0,229,255,0.25); }
}
</style>
