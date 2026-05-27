import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Task, TaskGroup, DashboardStats, TaskStatus, TaskUpdateParams } from '@/types'
import { taskApi } from '@/api/task'
import { groupApi } from '@/api/group'
import { agentApi } from '@/api/agent'

export const useTaskStore = defineStore('task', () => {
  // State
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const currentTask = ref<Task | null>(null)
  const syncing = ref(false)

  // Todo list (localStorage persisted, for QClaw automation)
  const todoList = ref<string[]>([])
  try {
    todoList.value = JSON.parse(localStorage.getItem('linesequence-todo-list') || '[]')
  } catch { /* ignore parse error */ }

  // 任务分组
  const groups = ref<TaskGroup[]>([])

  async function fetchGroups() {
    const res = await groupApi.list()
    groups.value = res.data
  }

  async function createGroup(name: string, taskIds?: string[]) {
    const res = await groupApi.create({ name, taskIds })
    groups.value.unshift(res.data)
    return res.data
  }

  async function updateGroup(id: string, data: Partial<{ name: string; taskIds: string[]; projectPath: string; gitBranch: string }>) {
    const res = await groupApi.update(id, data)
    const idx = groups.value.findIndex(g => g.id === id)
    if (idx !== -1) groups.value[idx] = res.data
    return res.data
  }

  async function deleteGroup(id: string) {
    await groupApi.remove(id)
    groups.value = groups.value.filter(g => g.id !== id)
  }

  // Getters
  const stats = computed<DashboardStats>(() => {
    const list = tasks.value
    const now = new Date().getTime()
    const threeDaysLater = now + 3 * 24 * 60 * 60 * 1000

    return {
      total: list.length,
      pending: list.filter(t => t.status === 'pending').length,
      inProgress: list.filter(t => t.status === 'in_progress').length,
      selfTest: list.filter(t => t.status === 'self_test').length,
      submitted: list.filter(t => t.status === 'submitted').length,
      completed: list.filter(t => t.status === 'completed').length,
      rejected: list.filter(t => t.status === 'rejected').length,
      urgentCount: list.filter(t => t.priority === 'urgent').length,
      nearDeadline: list.filter(t => {
        const dl = new Date(t.deadline).getTime()
        return dl > now && dl <= threeDaysLater && t.status !== 'completed'
      }).length,
      overdue: list.filter(t => {
        return new Date(t.deadline).getTime() < now && t.status !== 'completed'
      }).length,
    }
  })

  const tasksByStatus = computed(() => {
    const map: Record<string, Task[]> = {}
    for (const task of tasks.value) {
      if (!map[task.status]) map[task.status] = []
      map[task.status].push(task)
    }
    return map
  })

  // Actions
  async function fetchTasks() {
    loading.value = true
    try {
      const res = await taskApi.getTasks()
      tasks.value = res.data.list
    } finally {
      loading.value = false
    }
  }

  async function fetchTaskById(id: string) {
    loading.value = true
    try {
      const res = await taskApi.getTaskById(id)
      currentTask.value = res.data
    } finally {
      loading.value = false
    }
  }

  async function updateTaskStatus(id: string, status: TaskStatus) {
    const res = await taskApi.updateStatus(id, status)
    const idx = tasks.value.findIndex(t => t.id === id)
    if (idx !== -1) {
      tasks.value[idx] = res.data
    }
    if (currentTask.value?.id === id) {
      currentTask.value = res.data
    }
  }

  async function updateTask(id: string, data: TaskUpdateParams) {
    const res = await taskApi.updateTask(id, data)
    const idx = tasks.value.findIndex(t => t.id === id)
    if (idx !== -1) {
      tasks.value[idx] = res.data
    }
    if (currentTask.value?.id === id) {
      currentTask.value = res.data
    }
  }

  async function syncTasks() {
    syncing.value = true
    try {
      const res = await taskApi.syncFromIntranet()
      await fetchTasks()
      return res.data
    } finally {
      syncing.value = false
    }
  }

  async function addDevLog(taskId: string, entry: { action: string; content: string }) {
    const res = await taskApi.addDevLog(taskId, entry)
    if (currentTask.value?.id === taskId) {
      currentTask.value = res.data
    }
    await fetchTasks()
  }

  function isInTodoList(id: string): boolean {
    return todoList.value.includes(id)
  }

  function toggleTodo(task: Task) {
    const idx = todoList.value.indexOf(task.id)
    if (idx === -1) {
      const isRework = task.aiStatus === 'ai_rework'
      if (isRework) {
        todoList.value.unshift(task.id)
      } else {
        todoList.value.push(task.id)
      }
      updateTask(task.id, { aiStatus: isRework ? 'ai_rework' : 'ai_todo' })
      // 后台提取 PDF 文字，不阻塞 UI
      if (!task.reqDocText && task.reqDocName) {
        taskApi.extractPdf(task.id).then(res => {
          if (res.data?.reqDocText) {
            const t = tasks.value.find(t => t.id === task.id)
            if (t) t.reqDocText = res.data.reqDocText
          }
        }).catch(() => {})
      }
    } else {
      todoList.value.splice(idx, 1)
      updateTask(task.id, { aiStatus: '' })
    }
    localStorage.setItem('linesequence-todo-list', JSON.stringify(todoList.value))
    agentApi.saveTodoOrder(todoList.value).catch(() => {})
  }

  return {
    tasks,
    loading,
    currentTask,
    syncing,
    stats,
    tasksByStatus,
    fetchTasks,
    fetchTaskById,
    updateTaskStatus,
    updateTask,
    syncTasks,
    addDevLog,
    todoList,
    isInTodoList,
    toggleTodo,
    groups,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
  }
})
