<template>
  <div class="sync-page">
    <!-- 顶部：一键同步 -->
    <SyncActionPanel @sync="handleSync" @refresh-cookie="handleRefreshCookie" />

    <!-- 中间两栏：用户管理（含 Key） + 同步配置 -->
    <div class="sync-grid">
      <SyncUserPanel @refresh-cookie="handleRefreshCookie" />
      <SyncConfigPanel />
    </div>

    <!-- Agent 唤醒配置 -->
    <SyncAgentPanel />

    <!-- 同步记录 -->
    <SyncRecordsPanel />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useSyncStore } from '@/stores/sync'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import SyncActionPanel from './components/SyncActionPanel.vue'
import SyncUserPanel from './components/SyncUserPanel.vue'
import SyncConfigPanel from './components/SyncConfigPanel.vue'
import SyncAgentPanel from './components/SyncAgentPanel.vue'
import SyncRecordsPanel from './components/SyncRecordsPanel.vue'

const syncStore = useSyncStore()
const userStore = useUserStore()

async function handleSync() {
  try {
    const result = await syncStore.triggerSync()
    ElMessage.success(`同步完成：新增${result.newTasks}，更新${result.updatedTasks}`)
  } catch {
    ElMessage.error('同步失败，请检查登录状态')
  }
}

async function handleRefreshCookie(username: string) {
  try {
    await userStore.refreshCookie(username)
    ElMessage.success('登录已刷新')
  } catch {
    ElMessage.error('刷新失败，请重新登录')
  }
}

onMounted(() => {
  userStore.init()
  syncStore.fetchConfig()
  syncStore.fetchSyncRecords()
})
</script>

<style lang="scss" scoped>
.sync-page {
  max-width: var(--container-lg);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sync-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 900px) {
  .sync-grid {
    grid-template-columns: 1fr;
  }
}
</style>
