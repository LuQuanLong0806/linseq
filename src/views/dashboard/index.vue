<template>
  <div class="dashboard">
    <!-- 统计卡片区 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <div class="stat-card total">
          <div class="stat-icon bg-gradient-blue">
            <el-icon size="28"><Tickets /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ taskStore.stats.total }}</div>
            <div class="stat-label">总任务数</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card pending">
          <div class="stat-icon bg-gradient-orange">
            <el-icon size="28"><Clock /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ taskStore.stats.pending }}</div>
            <div class="stat-label">待开发</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card progress">
          <div class="stat-icon bg-gradient-purple">
            <el-icon size="28"><Loading /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ taskStore.stats.inProgress }}</div>
            <div class="stat-label">开发中</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card completed">
          <div class="stat-icon bg-gradient-green">
            <el-icon size="28"><CircleCheck /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ taskStore.stats.completed }}</div>
            <div class="stat-label">已完成</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 第二行统计 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <div class="stat-card warning">
          <div class="stat-icon bg-gradient-red">
            <el-icon size="28"><WarningFilled /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ taskStore.stats.urgentCount }}</div>
            <div class="stat-label">紧急任务</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card danger">
          <div class="stat-icon bg-gradient-yellow">
            <el-icon size="28"><AlarmClock /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ taskStore.stats.nearDeadline }}</div>
            <div class="stat-label">即将到期</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card error">
          <div class="stat-icon bg-gradient-dark">
            <el-icon size="28"><CloseBold /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ taskStore.stats.overdue }}</div>
            <div class="stat-label">已逾期</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card rejected">
          <div class="stat-icon bg-gradient-gray">
            <el-icon size="28"><CircleClose /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ taskStore.stats.rejected }}</div>
            <div class="stat-label">已驳回</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 图表区 -->
    <el-row :gutter="20" class="chart-row">
      <el-col :span="12">
        <div class="cyber-panel chart-card">
          <div class="panel-header">
            <span class="card-title">任务状态分布</span>
          </div>
          <div ref="pieChartRef" class="chart-container"></div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="cyber-panel chart-card">
          <div class="panel-header">
            <span class="card-title">本周开发进度</span>
          </div>
          <div ref="barChartRef" class="chart-container"></div>
        </div>
      </el-col>
    </el-row>

    <!-- 最近任务列表 -->
    <el-row :gutter="20" class="table-row">
      <el-col :span="24">
        <div class="cyber-panel task-card">
          <div class="panel-header">
            <div class="card-header">
              <span class="card-title">最近更新任务</span>
              <el-button type="primary" link @click="$router.push('/tasks')">查看全部 →</el-button>
            </div>
          </div>
          <el-table :data="recentTasks" stripe border style="width: 100%">
            <el-table-column prop="sourceId" label="ID" min-width="60" />
            <el-table-column prop="title" label="任务标题" min-width="200" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" min-width="80">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" size="small">{{ getStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="priority" label="优先级" min-width="70">
              <template #default="{ row }">
                <el-tag :type="getPriorityType(row.priority)" size="small">{{ getPriorityLabel(row.priority) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="deadline" label="截止时间" min-width="100">
              <template #default="{ row }">
                {{ formatDate(row.deadline) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="80" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="$router.push(`/tasks/${row.id}`)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTaskStore } from '@/stores/task'
import { Tickets, Clock, Loading, CircleCheck, WarningFilled, AlarmClock, CloseBold, CircleClose } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import dayjs from 'dayjs'
import type { TaskStatus, TaskPriority } from '@/types'

const taskStore = useTaskStore()
const pieChartRef = ref<HTMLElement>()
const barChartRef = ref<HTMLElement>()
let pieChart: echarts.ECharts | null = null
let barChart: echarts.ECharts | null = null

const recentTasks = computed(() => 
  [...taskStore.tasks]
    .sort((a, b) => new Date(b.updateTime).getTime() - new Date(a.updateTime).getTime())
    .slice(0, 8)
)

function getStatusType(status: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
    pending: 'info',
    in_progress: 'warning',
    self_test: 'primary',
    submitted: 'success',
    completed: 'success',
    rejected: 'danger',
  }
  return map[status] || 'info'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待开发',
    in_progress: '开发中',
    self_test: '自测完成',
    submitted: '已提测',
    completed: '已完结',
    rejected: '已驳回',
  }
  return labels[status] || status
}

function getPriorityType(priority: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
    urgent: 'danger',
    high: 'warning',
    medium: 'info',
    low: 'success',
  }
  return map[priority] || 'info'
}

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    urgent: '紧急',
    high: '高',
    medium: '中',
    low: '低',
  }
  return labels[priority] || priority
}

function formatDate(date: string): string {
  return dayjs(date).format('MM-DD HH:mm')
}

function initPieChart() {
  if (!pieChartRef.value) return
  pieChart = echarts.init(pieChartRef.value)
  const option: EChartsOption = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(10,16,31,0.85)',
      borderColor: 'rgba(0,229,255,0.12)',
      textStyle: { color: '#E8F0FF' },
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      textStyle: { color: '#8c8ca1' },
    },
    series: [{
      name: '任务状态',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8, borderColor: 'rgba(0,229,255,0.15)', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold', color: '#E8F0FF' } },
      data: [
        { value: taskStore.stats.pending, name: '待开发', itemStyle: { color: '#8c8ca1' } },
        { value: taskStore.stats.inProgress, name: '开发中', itemStyle: { color: '#FF7D00' } },
        { value: taskStore.stats.selfTest, name: '自测完成', itemStyle: { color: '#00E5FF' } },
        { value: taskStore.stats.submitted, name: '已提测', itemStyle: { color: '#9D5CFF' } },
        { value: taskStore.stats.completed, name: '已完结', itemStyle: { color: '#00E5FF' } },
        { value: taskStore.stats.rejected, name: '已驳回', itemStyle: { color: '#FF7D00' } },
      ],
    }],
  }
  pieChart.setOption(option)
}

function initBarChart() {
  if (!barChartRef.value) return
  barChart = echarts.init(barChartRef.value)
  // Compute real weekly data from tasks
  const now = dayjs()
  const startOfWeek = now.startOf('week')
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = startOfWeek.add(i, 'day')
    return { label: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.day()], date: d.format('YYYY-MM-DD') }
  })
  const completed = days.map(d => taskStore.tasks.filter(t => t.aiStatus === 'ai_done' && dayjs(t.completeTime).format('YYYY-MM-DD') === d.date).length)
  const rejected = days.map(d => taskStore.tasks.filter(t => t.reviewResult === 'rejected' && dayjs(t.reviewTime).format('YYYY-MM-DD') === d.date).length)
  
  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(10,16,31,0.85)',
      borderColor: 'rgba(0,229,255,0.12)',
      textStyle: { color: '#E8F0FF' },
    },
    legend: {
      data: ['已完成', '驳回'],
      textStyle: { color: '#8c8ca1' },
    },
    xAxis: {
      type: 'category' as const,
      data: days.map(d => d.label),
      axisLabel: { color: '#8c8ca1' },
      axisLine: { lineStyle: { color: 'rgba(0,229,255,0.15)' } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#8c8ca1' },
      axisLine: { lineStyle: { color: 'rgba(0,229,255,0.15)' } },
      splitLine: { lineStyle: { color: 'rgba(0,229,255,0.06)' } },
    },
    series: [
      { name: '已完成', type: 'bar', data: completed, itemStyle: { color: '#00E5FF' }, barWidth: '30%' },
      { name: '驳回', type: 'bar', data: rejected, itemStyle: { color: '#FF7D00' }, barWidth: '30%' },
    ],
  }
  barChart.setOption(option)
}

function onResize() {
  pieChart?.resize()
  barChart?.resize()
}

onMounted(() => {
  initPieChart()
  initBarChart()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  pieChart?.dispose()
  barChart?.dispose()
  pieChart = null
  barChart = null
})
</script>

<style lang="scss" scoped>
.dashboard {
  max-width: var(--container-xl);
  margin: 0 auto;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 20px 24px;
  background: transparent;
  border-radius: 12px;
  border: 1px solid var(--cyber-glass-border);
  box-shadow: var(--cyber-glow-cyan);
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--cyber-glow-purple);
  }
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cyber-text-primary);
  margin-right: 16px;
}

.bg-gradient-blue { background: linear-gradient(135deg, #00E5FF 0%, #9D5CFF 100%); }
.bg-gradient-orange { background: linear-gradient(135deg, #9D5CFF 0%, #FF7D00 100%); }
.bg-gradient-purple { background: linear-gradient(135deg, #00E5FF 0%, #00E5FF 100%); }
.bg-gradient-green { background: linear-gradient(135deg, #9D5CFF 0%, #00E5FF 100%); }
.bg-gradient-red { background: linear-gradient(135deg, #FF7D00 0%, #9D5CFF 100%); }
.bg-gradient-yellow { background: linear-gradient(135deg, #9D5CFF 0%, #00E5FF 100%); }
.bg-gradient-dark { background: linear-gradient(135deg, #9D5CFF 0%, #FF7D00 100%); }
.bg-gradient-gray { background: linear-gradient(135deg, #FF7D00 0%, #9D5CFF 100%); }

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--cyber-text-primary);
}

.stat-label {
  font-size: 14px;
  color: var(--cyber-text-secondary);
  margin-top: 4px;
}

.chart-row {
  margin-bottom: 20px;
}

.chart-card {
  .panel-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--cyber-glass-border);
  }

  .card-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--cyber-text-primary);
  }
}

.chart-container {
  height: clamp(200px, 22vw, 280px);
}

.table-row {
  .task-card {
    backdrop-filter: none;
    .panel-header {
      padding: 14px 20px;
    }
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}
</style>