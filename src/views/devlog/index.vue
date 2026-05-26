<template>
  <div class="devlog-page">
    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <span class="card-title">📝 开发记录</span>
          <el-input v-model="keyword" placeholder="搜索记录..." style="width: 250px;" :prefix-icon="Search" clearable />
        </div>
      </template>

      <el-timeline v-if="filteredLogs.length">
        <el-timeline-item
          v-for="log in filteredLogs"
          :key="log.id"
          :timestamp="formatDateTime(log.time)"
          placement="top"
          :type="getLogType(log.action)"
        >
          <el-card shadow="never" class="log-card">
            <div class="log-header">
              <el-tag size="small" :type="getActionType(log.action)">{{ log.action }}</el-tag>
              <span class="log-author">{{ log.author === 'agent' ? '🤖 Agent' : '👤 手动' }}</span>
              <el-tag v-if="log.autoFixed" size="small" type="warning" effect="dark">自动修复</el-tag>
              <span class="log-task">任务: {{ log.taskId }}</span>
            </div>
            <div class="log-content">{{ log.content }}</div>
          </el-card>
        </el-timeline-item>
      </el-timeline>

      <el-empty v-else description="暂无开发记录" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTaskStore } from '@/stores/task'
import { Search } from '@element-plus/icons-vue'
import type { DevLogEntry } from '@/types'
import dayjs from 'dayjs'

const taskStore = useTaskStore()
const keyword = ref('')

const allLogs = computed<DevLogEntry[]>(() => {
  const logs: DevLogEntry[] = []
  for (const task of taskStore.tasks) {
    logs.push(...task.devLog)
  }
  return logs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
})

const filteredLogs = computed(() => {
  if (!keyword.value) return allLogs.value
  const kw = keyword.value.toLowerCase()
  return allLogs.value.filter(l => 
    l.content.toLowerCase().includes(kw) || 
    l.action.toLowerCase().includes(kw) ||
    l.taskId.includes(kw)
  )
})

function formatDateTime(date: string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

function getLogType(action: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
    '开发': 'primary', '修复': 'warning', '自测': 'success', '状态变更': 'info',
  }
  return map[action] || 'info'
}

function getActionType(action: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
    '开发': 'primary', '修复': 'warning', '自测': 'success', '状态变更': 'info',
  }
  return map[action] || 'info'
}

onMounted(() => {
  taskStore.fetchTasks()
})
</script>

<style lang="scss" scoped>
.devlog-page {
  max-width: 1000px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  .card-title { font-weight: 600; }
}

.log-card {
  :deep .el-card__body {
    padding: 14px 18px;
  }
}

.log-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;

  .log-author { font-size: 13px; color: #606266; }
  .log-task { font-size: 12px; color: #909399; margin-left: auto; }
}

.log-content {
  font-size: 14px;
  color: #303133;
  line-height: 1.6;
}
</style>