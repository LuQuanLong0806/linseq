import { ref, computed } from 'vue'
import { agentApi, type ChatSession, type ChatMessage, type ChatSessionSummary, type AgentStats } from '@/api/agent'

const panelOpen = ref(false)
const currentSession = ref<ChatSession | null>(null)
const sessions = ref<ChatSessionSummary[]>([])
const messages = ref<ChatMessage[]>([])
const stats = ref<AgentStats | null>(null)
const sending = ref(false)
const loading = ref(false)
const cursor = ref('')
const hasMore = ref(false)
const collapsed = ref(true)

export function useAgentChat() {
  const currentTask = computed(() => stats.value?.currentTask ?? null)
  const todoCount = computed(() => stats.value?.todoCount ?? 0)
  const inDev = computed(() => stats.value?.inDev ?? 0)
  const inReview = computed(() => stats.value?.inReview ?? 0)

  const activeSessionStatus = computed(() => {
    if (!currentSession.value) return 'idle'
    if (currentSession.value.status === 'archived') return 'archived'
    // 检查最后一条消息是否是等待审批的 plan 或 question
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg?.type === 'plan' && lastMsg?.role === 'agent') return 'awaiting_plan'
    if (lastMsg?.type === 'question' && lastMsg?.role === 'agent') return 'awaiting_question'
    if (inReview.value > 0) return 'awaiting_review'
    if (inDev.value > 0) return 'developing'
    if (todoCount.value > 0) return 'ready'
    return 'idle'
  })

  // 按 taskId 分组消息
  const messagesByTask = computed(() => {
    const groups: { taskId: string; taskTitle: string; msgs: ChatMessage[] }[] = []
    let currentGroup: { taskId: string; taskTitle: string; msgs: ChatMessage[] } | null = null

    for (const msg of messages.value) {
      const tid = msg.taskId || ''
      if (!currentGroup || currentGroup.taskId !== tid) {
        currentGroup = { taskId: tid, taskTitle: '', msgs: [] }
        groups.push(currentGroup)
      }
      currentGroup.msgs.push(msg)
    }
    return groups
  })

  // 折叠后的可见消息
  const visibleMessages = computed(() => {
    if (messages.value.length <= 40 || !collapsed.value) return messages.value
    return messages.value.slice(40)
  })

  const hasOlderMessages = computed(() => messages.value.length > 40)

  // 等待审批的消息
  const activeApprovals = computed(() => {
    const result: ChatMessage[] = []
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const msg = messages.value[i]
      if (msg.type === 'completion' && msg.role === 'agent') {
        result.push(msg)
        break
      }
    }
    return result
  })

  async function openPanel() {
    panelOpen.value = true
    await loadContext()
  }

  function closePanel() {
    panelOpen.value = false
  }

  async function loadContext(sessionId?: string) {
    loading.value = true
    try {
      const res = await agentApi.getChatContext(sessionId, undefined, 50)
      const data = res.data
      currentSession.value = data.session
      messages.value = data.messages
      stats.value = data.stats
      sessions.value = data.sessions
      cursor.value = data.cursor
      hasMore.value = data.hasMore
      collapsed.value = true
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || !cursor.value) return
    loading.value = true
    try {
      const res = await agentApi.getChatContext(currentSession.value?.id, cursor.value, 50)
      const data = res.data
      messages.value = [...data.messages, ...messages.value]
      cursor.value = data.cursor
      hasMore.value = data.hasMore
    } finally {
      loading.value = false
    }
  }

  async function executeAction(action: string, opts?: { taskId?: string; message?: string; payload?: Record<string, unknown> }) {
    sending.value = true
    try {
      const res = await agentApi.chatAction(action, {
        sessionId: currentSession.value?.id,
        ...opts,
      })
      // wake 和 stop_session 需要刷新 context
      if (action === 'wake' || action === 'stop_session') {
        const data = res.data as { sessionId?: string }
        await loadContext(data?.sessionId)
      }
      return res
    } finally {
      sending.value = false
    }
  }

  function handleWsMessage(event: string, data: any) {
    if (event !== 'chat') return
    // 追加新消息到列表
    const msg: ChatMessage = {
      id: data.id,
      role: data.role,
      content: data.content,
      type: data.type || 'text',
      sessionId: data.sessionId || '',
      taskId: data.taskId || '',
      metadata: data.metadata ? (typeof data.metadata === 'string' ? JSON.parse(data.metadata) : data.metadata) : {},
      time: data.time || new Date().toISOString(),
      source: 'chat',
    }
    // 去重
    if (!messages.value.find(m => m.id === msg.id)) {
      messages.value.push(msg)
    }
  }

  function expandMessages() {
    collapsed.value = false
  }

  return {
    panelOpen,
    currentSession,
    sessions,
    messages,
    stats,
    sending,
    loading,
    cursor,
    hasMore,
    collapsed,
    currentTask,
    todoCount,
    inDev,
    inReview,
    activeSessionStatus,
    messagesByTask,
    visibleMessages,
    hasOlderMessages,
    activeApprovals,
    openPanel,
    closePanel,
    loadContext,
    loadMore,
    executeAction,
    handleWsMessage,
    expandMessages,
  }
}
