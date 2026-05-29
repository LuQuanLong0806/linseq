import http from '@/utils/http'
import type { ApiResponse } from '@/types'

// ========== 聊天会话类型 ==========

export interface ChatSession {
  id: string
  title: string
  taskIds: string[]
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface ChatSessionSummary {
  id: string
  title: string
  status: string
  createdAt: string
  updatedAt: string
  taskCount: number
  completedCount: number
  lastMessage: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'system'
  content: string
  type: 'text' | 'plan' | 'progress' | 'completion' | 'question' | 'status_change' | 'approval'
  sessionId: string
  taskId: string
  metadata: Record<string, unknown>
  time: string
  source: 'chat' | 'devlog'
}

export interface AgentStats {
  todoCount: number
  inDev: number
  inReview: number
  currentTask: { id: string; title: string; aiStatus: string } | null
}

export interface ChatContext {
  session: ChatSession | null
  messages: ChatMessage[]
  stats: AgentStats
  sessions: ChatSessionSummary[]
  cursor: string
  hasMore: boolean
}

export interface ChatSessionsResponse {
  sessions: ChatSessionSummary[]
  total: number
  page: number
  pageSize: number
}

// ========== API ==========

export const agentApi = {
  saveTodoOrder(todoList: string[]): Promise<ApiResponse<null>> {
    return http.post('/agent/todo-order', { todoList })
  },

  getTodoOrder(): Promise<ApiResponse<{ todoList: string[] }>> {
    return http.get('/agent/todo-order')
  },

  wake(command: string): Promise<ApiResponse<{ command: string; message: string }>> {
    return http.post('/agent/wake', { command })
  },

  sendChat(message: string): Promise<ApiResponse<{ id: string }>> {
    return http.post('/agent/chat', { message })
  },

  getChatHistory(): Promise<ApiResponse<{ id: string; role: string; content: string; created_at: string }[]>> {
    return http.get('/agent/chat')
  },

  // ========== 聊天会话 API ==========

  getChatContext(sessionId?: string, cursor?: string, limit?: number): Promise<ApiResponse<ChatContext>> {
    const params: Record<string, string | number> = {}
    if (sessionId) params.session_id = sessionId
    if (cursor) params.cursor = cursor
    if (limit) params.limit = limit
    return http.get('/agent/chat/context', { params })
  },

  chatAction(action: string, opts?: { sessionId?: string; taskId?: string; message?: string; payload?: Record<string, unknown> }): Promise<ApiResponse<unknown>> {
    return http.post('/agent/chat/action', { action, ...opts })
  },

  getChatSessions(page?: number, pageSize?: number): Promise<ApiResponse<ChatSessionsResponse>> {
    const params: Record<string, number> = {}
    if (page) params.page = page
    if (pageSize) params.pageSize = pageSize
    return http.get('/agent/chat/sessions', { params })
  },
}
