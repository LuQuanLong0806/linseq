<template>
  <div class="cyber-panel sync-records-panel">
    <div class="panel-header">
      <span class="card-title">同步记录</span>
      <el-button link type="primary" size="small" @click="syncStore.fetchSyncRecords()">刷新</el-button>
    </div>

    <div class="records-body" v-if="syncStore.syncRecords.length > 0">
      <div v-for="record in syncStore.syncRecords" :key="record.id" class="record-card">
        <div class="record-head">
          <div class="record-status-dot" :class="record.status" />
          <span class="record-time">{{ formatDateTime(record.syncTime) }}</span>
          <el-tag
            :type="record.status === 'success' ? 'success' : record.status === 'partial' ? 'warning' : 'danger'"
            size="small" effect="dark"
          >{{ record.status === 'success' ? '成功' : record.status === 'partial' ? '部分' : '失败' }}</el-tag>
        </div>
        <div class="record-stats">
          <div class="stat"><span class="stat-value">{{ record.totalTasks }}</span><span class="stat-label">总计</span></div>
          <div class="stat cyan"><span class="stat-value">{{ record.newTasks }}</span><span class="stat-label">新增</span></div>
          <div class="stat orange"><span class="stat-value">{{ record.updatedTasks }}</span><span class="stat-label">更新</span></div>
          <div class="stat"><span class="stat-value">{{ record.unchangedTasks }}</span><span class="stat-label">不变</span></div>
        </div>
        <div v-if="record.errorMessages?.length" class="record-errors">
          <div v-for="(err, i) in record.errorMessages" :key="i" class="error-msg">{{ err }}</div>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">暂无同步记录</div>
  </div>
</template>

<script setup lang="ts">
import { useSyncStore } from '@/stores/sync'
import dayjs from 'dayjs'

const syncStore = useSyncStore()

function formatDateTime(date: string) {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '—'
}
</script>

<style lang="scss" scoped>
.sync-records-panel {
  .panel-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--cyber-glass-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .card-title { font-weight: 600; font-size: 15px; }

  .records-body { padding: 12px 20px 16px; }

  .empty-state {
    text-align: center;
    color: var(--cyber-text-muted);
    padding: 40px 0;
    font-size: 13px;
  }
}

.record-card {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--cyber-glass-border);
  margin-bottom: 8px;
  transition: border-color 0.2s;

  &:hover { border-color: var(--cyber-glass-border-hover); }

  .record-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .record-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    &.success { background: #67C23A; box-shadow: 0 0 6px rgba(103,194,58,0.4); }
    &.partial { background: #E6A23C; box-shadow: 0 0 6px rgba(230,162,60,0.4); }
    &.failed { background: #F56C6C; box-shadow: 0 0 6px rgba(245,108,108,0.4); }
  }

  .record-time {
    font-size: 12px;
    color: var(--cyber-text-secondary);
    flex: 1;
  }

  .record-stats {
    display: flex;
    gap: 16px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 40px;

    .stat-value { font-size: 16px; font-weight: 700; color: var(--cyber-text-primary); }
    .stat-label { font-size: 10px; color: var(--cyber-text-muted); margin-top: 2px; }
    &.cyan .stat-value { color: var(--cyber-cyan); }
    &.orange .stat-value { color: var(--cyber-orange); }
  }

  .record-errors {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--cyber-glass-border);
    .error-msg { font-size: 11px; color: var(--el-color-danger); line-height: 1.5; }
  }
}
</style>
