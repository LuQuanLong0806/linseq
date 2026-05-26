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
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <span class="card-title">任务状态分布</span>
          </template>
          <div ref="pieChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <span class="card-title">本周开发进度</span>
          </template>
          <div ref="barChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最近任务列表 -->
    <el-row :gutter="20" class="table-row">
      <el-col :span="24">
        <el-card shadow="hover" class="task-card">
          <template #header>
            <div class="card-header">
              <span class="card-title">最近更新任务</span>
              <el-button type="primary" link @click="$router.push('/tasks')">查看全部 →</el-button>
            </div>
          </template>
          <el-table :data="recentTasks" stripe style="width: 100%">
            <el-table-column prop="sourceId" label="ID" width="80" />
            <el-table-column prop="title" label="任务标题" min-width="250" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" size="small">{{ getStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="priority" label="优先级" width="80">
              <template #default="{ row }">
                <el-tag :type="getPriorityType(row.priority)" size="small">{{ getPriorityLabel(row.priority) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="deadline" label="截止时间" width="120">
              <template #default="{ row }">
                {{ formatDate(row.deadline) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="$router.push(`/tasks/${row.id}`)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTaskStore } from '@/stores/task'
import { Tickets, Clock, Loading, CircleCheck, WarningFilled, AlarmClock, CloseBold, CircleClose } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import dayjs from 'dayjs'
import type { TaskStatus, TaskPriority } from '@/types'

const taskStore = useTaskStore()
const pieChartRef = ref<HTMLElement>()
const barChartRef = ref<HTMLElement>()

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
  const chart = echarts.init(pieChartRef.value)
  const option: EChartsOption = {
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [{
      name: '任务状态',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
      data: [
        { value: taskStore.stats.pending, name: '待开发', itemStyle: { color: '#909399' } },
        { value: taskStore.stats.inProgress, name: '开发中', itemStyle: { color: '#e6a23c' } },
        { value: taskStore.stats.selfTest, name: '自测完成', itemStyle: { color: '#409eff' } },
        { value: taskStore.stats.submitted, name: '已提测', itemStyle: { color: '#67c23a' } },
        { value: taskStore.stats.completed, name: '已完结', itemStyle: { color: '#5dbf73' } },
        { value: taskStore.stats.rejected, name: '已驳回', itemStyle: { color: '#f56c6c' } },
      ],
    }],
  }
  chart.setOption(option)
}

function initBarChart() {
  if (!barChartRef.value) return
  const chart = echarts.init(barChartRef.value)
  // 模拟本周数据
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const completed = [3, 5, 2, 6, 4, 1, 0]
  const rejected = [0, 1, 0, 0, 1, 0, 0]
  
  const option: EChartsOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['已完成', '驳回'] },
    xAxis: { type: 'category', data: days },
    yAxis: { type: 'value' },
    series: [
      { name: '已完成', type: 'bar', data: completed, itemStyle: { color: '#67c23a' }, barWidth: '30%' },
      { name: '驳回', type: 'bar', data: rejected, itemStyle: { color: '#f56c6c' }, barWidth: '30%' },
    ],
  }
  chart.setOption(option)
}

onMounted(() => {
  taskStore.fetchTasks().then(() => {
    initPieChart()
    initBarChart()
  })
})
</script>

<style lang="scss" scoped>
.dashboard {
  max-width: 1600px;
  margin: 0 auto;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 20px 24px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  }
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  margin-right: 16px;
}

.bg-gradient-blue { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.bg-gradient-orange { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
.bg-gradient-purple { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
.bg-gradient-green { background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); }
.bg-gradient-red { background: linear-gradient(135deg, #ff0844 0%, #ffb199 100%); }
.bg-gradient-yellow { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); }
.bg-gradient-dark { background: linear-gradient(135deg, #434343 0%, #000000 100%); }
.bg-gradient-gray { background: linear-gradient(135deg, #868f96 0%, #596164 100%); }

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

.chart-row {
  margin-bottom: 20px;
}

.chart-card {
  :deep .el-card__header {
    padding: 14px 20px;
    border-bottom: 1px solid #ebeef5;
  }
  
  .card-title {
    font-size: 16px;
    font-weight: 600;
    color: #303133;
  }
}

.chart-container {
  height: 280px;
}

.table-row {
  .task-card {
    :deep .el-card__header {
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