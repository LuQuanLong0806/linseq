<template>
  <div class="card-grid-view">
    <div
      v-for="task in tasks" :key="task.id"
      class="task-card"
      :class="{
        'in-todo': taskStore.isInTodoList(task.id),
        'selected': selectedIds.has(task.id),
        'streaming': streamingIds.has(task.id),
      }"
      @click="toggleSelect(task.id)"
      @animationend="onStreamEnd($event, task.id)"
    >
      <div class="card-top">
        <div class="card-tags">
          <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
          <el-tag v-if="task.aiStatus" :type="getAiStatusType(task.aiStatus)" size="small" effect="dark">{{ getAiStatusLabel(task.aiStatus) }}</el-tag>
        </div>
        <span class="card-id">#{{ task.sourceId }}</span>
      </div>

      <h3 class="card-project" v-if="task.project || task.customer">{{ task.project || task.customer }}</h3>
      <div class="card-title">{{ task.title }}</div>
      <div class="card-desc" v-if="task.customDescription || task.description">{{ task.customDescription || task.description }}</div>

      <div class="card-bottom">
        <div class="card-meta">
          <span class="meta-hours">{{ task.workHours || 0 }}h</span>
          <span :class="{ 'meta-overdue': isOverdue(task) }">截止 {{ formatDate(task.deadline) }}</span>
        </div>
        <div class="card-actions" @click.stop>
          <span class="act" @click="navDetail(task)">详情</span>
          <span class="act act-config" @click="$emit('config', task)">配置</span>
          <span class="act act-todo" @click="handleTodo(task)">
            <template v-if="streamingIds.has(task.id)">
              <span class="stream-text">传输中</span>
            </template>
            <template v-else>
              {{ taskStore.isInTodoList(task.id) ? 'AI待办' : '入待办' }}
            </template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Task } from '@/types'
import { useTaskStore } from '@/stores/task'
import dayjs from 'dayjs'

const props = defineProps<{ tasks: Task[] }>()
const emit = defineEmits<{
  config: [task: Task]
  toggleTodo: [task: Task]
  statusChange: [task: Task, status: string]
  updateSelected: [ids: string[]]
}>()
defineOptions({ inheritAttrs: false })

const router = useRouter()
const taskStore = useTaskStore()
const selectedIds = reactive(new Set<string>())
const streamingIds = reactive(new Set<string>())

watch(selectedIds, (ids) => {
  emit('updateSelected', Array.from(ids))
}, { deep: true })

function toggleSelect(id: string) {
  if (streamingIds.has(id)) return
  if (selectedIds.has(id)) selectedIds.delete(id)
  else selectedIds.add(id)
}

function handleTodo(task: Task) {
  if (streamingIds.has(task.id)) return
  streamingIds.add(task.id)
  emit('toggleTodo', task)
}

function onStreamEnd(e: AnimationEvent, id: string) {
  if (e.animationName === 'dataStream') {
    streamingIds.delete(id)
  }
}

function navDetail(task: Task) {
  router.push(`/tasks/${task.id}`)
}

function isOverdue(t: Task) { return t.status !== 'completed' && new Date(t.deadline).getTime() < Date.now() }
function formatDate(d: string) { return dayjs(d).format('MM-DD') }
type TagType = 'success' | 'primary' | 'warning' | 'danger' | 'info'
function getPriorityType(p: string): TagType { return ({ urgent: 'danger', high: 'warning', medium: 'info', low: 'success' } as Record<string, TagType>)[p] || 'info' }
function getPriorityLabel(p: string) { return ({ urgent: '紧急', high: '高', medium: '中', low: '低' } as Record<string,string>)[p] || p }
function getAiStatusType(s: string): TagType { return ({ ai_todo: 'warning', ai_rework: 'danger', ai_dev: 'primary', ai_review: 'primary', ai_done: 'success' } as Record<string, TagType>)[s] || 'info' }
function getAiStatusLabel(s: string) { return ({ ai_todo: 'AI待办', ai_rework: '待返工', ai_dev: '开发中', ai_review: '待审核', ai_done: 'AI完成' } as Record<string,string>)[s] || '未加入' }
</script>

<style lang="scss" scoped>
.card-grid-view {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.task-card {
  position: relative;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--cyber-glass-bg);
  border: 1px solid var(--cyber-glass-border);
  backdrop-filter: blur(6px);
  cursor: pointer;
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
  display: flex;
  flex-direction: column;
  gap: 8px;

  &:hover {
    border-color: var(--cyber-glass-border-hover);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
  }

  &.selected {
    border-color: var(--cyber-cyan);
    box-shadow: 0 0 0 1px var(--cyber-cyan), 0 4px 16px rgba(0, 229, 255, 0.12);
    transform: translateY(-2px);
  }

  &.in-todo {
    border-left: 3px solid var(--cyber-orange);
  }

  &.streaming {
    animation: dataStream 1.2s ease-out forwards !important;
    pointer-events: none;
  }
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-tags {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.card-id {
  color: var(--cyber-text-muted);
  font-size: 11px;
  font-family: Consolas, monospace;
  flex-shrink: 0;
}

.card-project {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--cyber-text-primary);
  line-height: 1.4;
}

.card-title {
  font-size: 13px;
  font-weight: 400;
  color: var(--cyber-text-secondary);
  line-height: 1.5;
}

.card-desc {
  font-size: 12px;
  color: var(--cyber-text-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  padding: 6px 10px;
  background: rgba(0, 229, 255, 0.03);
  border-radius: 6px;
  border: 1px solid var(--cyber-glass-border);
}

.card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  gap: 8px;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--cyber-text-secondary);

  .meta-overdue {
    color: #f56c6c;
    font-weight: 600;
  }
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.act {
  font-size: 11px;
  color: var(--cyber-cyan);
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--cyber-glass-border);
  transition: all 0.2s;
  white-space: nowrap;

  &:hover {
    background: rgba(0, 229, 255, 0.1);
    border-color: rgba(0, 229, 255, 0.3);
  }
}

.act-config {
  color: var(--cyber-purple);
  border-color: rgba(157, 92, 255, 0.2);
  &:hover {
    background: rgba(157, 92, 255, 0.1);
    border-color: rgba(157, 92, 255, 0.3);
  }
}

.act-todo {
  color: var(--cyber-orange);
  border-color: rgba(255, 125, 0, 0.2);
  &:hover {
    background: rgba(255, 125, 0, 0.1);
    border-color: rgba(255, 125, 0, 0.3);
  }
}

.stream-text {
  animation: streamBlink 0.3s ease-in-out infinite alternate;
}
@keyframes streamBlink {
  0% { opacity: 0.4; }
  100% { opacity: 1; }
}

@keyframes dataStream {
  0% { border-color: var(--cyber-cyan); box-shadow: 0 0 20px rgba(0,229,255,0.5); opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(0.96); }
  100% { opacity: 0; transform: scale(0.88) translateY(-10px); }
}
</style>
