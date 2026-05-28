import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Task, TaskGroup, DashboardStats, TaskStatus, TaskPriority, TaskUpdateParams } from '@/types'
import { taskApi } from '@/api/task'
import { groupApi } from '@/api/group'
import { agentApi } from '@/api/agent'
import { createPersistedRef, loadPersisted, persist } from '@/utils/persistence'

export type ViewMode = 'table' | 'card' | 'planetary' | 'holographic' | 'datastream' | 'constellation'
const validModes: ViewMode[] = ['table', 'holographic']

export const useTaskStore = defineStore('task', () => {
  // State
  const tasks = ref<Task[]>([])
  const totalTasks = ref(0)
  const loading = ref(false)
  const currentTask = ref<Task | null>(null)
  const syncing = ref(false)

  // Todo list — persisted via utility
  const todoList = createPersistedRef<string[]>('todo-list', [])

  // View mode — persisted via utility, with validation
  const rawViewMode = createPersistedRef<string>('view-mode', 'table')
  const viewMode = computed<ViewMode>({
    get: () => validModes.includes(rawViewMode.value as ViewMode) ? (rawViewMode.value as ViewMode) : 'table',
    set: (v: ViewMode) => { if (validModes.includes(v)) rawViewMode.value = v },
  })
  function setViewMode(mode: ViewMode) { viewMode.value = mode }

  // 任务分组
  const groups = ref<TaskGroup[]>([])

  async function fetchGroups() {
    const res = await groupApi.list()
    groups.value = res.data
  }

  async function createGroup(name: string, taskIds?: string[], description?: string) {
    const res = await groupApi.create({ name, taskIds, description })
    groups.value.unshift(res.data)
    return res.data
  }

  async function updateGroup(id: string, data: Partial<{ name: string; taskIds: string[]; description: string }>) {
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
  async function fetchTasks(params?: { page?: number; pageSize?: number; keyword?: string; status?: TaskStatus; aiStatus?: string; priority?: TaskPriority; module?: string; projectPath?: string }) {
    loading.value = true
    try {
      const res = await taskApi.getTasks({ pageSize: 9999, ...params })
      tasks.value = res.data.list
      totalTasks.value = res.data.total
    } finally {
      loading.value = false
    }
  }

  async function fetchMoreTasks(params?: { page?: number; pageSize?: number; keyword?: string; status?: TaskStatus; aiStatus?: string; priority?: TaskPriority; module?: string; projectPath?: string }) {
    loading.value = true
    try {
      const res = await taskApi.getTasks({ pageSize: 20, ...params })
      tasks.value = [...tasks.value, ...res.data.list]
      totalTasks.value = res.data.total
      return res.data.list.length
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
      // 清除被隐藏任务的待办引用（不阻塞主流程）
      taskApi.getTasks({ pageSize: 9999 }).then(r => {
        const visibleIds = new Set(r.data.list.map(t => t.id))
        todoList.value = todoList.value.filter(id => visibleIds.has(id))
        agentApi.saveTodoOrder(todoList.value).catch(() => {})
      }).catch(() => {})
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
    agentApi.saveTodoOrder(todoList.value).catch(() => {})
  }

  async function createAndAddTodo(data: Partial<Task>) {
    const res = await taskApi.createManualTask(data)
    tasks.value.unshift(res.data)
    todoList.value.push(res.data.id)
    agentApi.saveTodoOrder(todoList.value).catch(() => {})
    return res.data
  }

  async function republishToTodo(taskId: string, data?: Partial<Task>) {
    const res = await taskApi.republishTask(taskId, data)
    const idx = tasks.value.findIndex(t => t.id === taskId)
    if (idx !== -1) tasks.value[idx] = res.data
    else tasks.value.unshift(res.data)
    if (!todoList.value.includes(taskId)) {
      todoList.value.unshift(taskId)
    }
    agentApi.saveTodoOrder(todoList.value).catch(() => {})
    return res.data
  }

  return {
    tasks,
    totalTasks,
    loading,
    currentTask,
    syncing,
    stats,
    tasksByStatus,
    fetchTasks,
    fetchMoreTasks,
    fetchTaskById,
    updateTaskStatus,
    updateTask,
    syncTasks,
    addDevLog,
    todoList,
    isInTodoList,
    toggleTodo,
    createAndAddTodo,
    republishToTodo,
    groups,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    viewMode,
    setViewMode,
  }
})
