import http from '@/utils/http'
import type { ApiResponse } from '@/types'

export const agentApi = {
  /** 同步待办队列到后端 */
  saveTodoOrder(todoList: string[]): Promise<ApiResponse<null>> {
    return http.post('/agent/todo-order', { todoList })
  },

  /** 获取待办队列 */
  getTodoOrder(): Promise<ApiResponse<{ todoList: string[] }>> {
    return http.get('/agent/todo-order')
  },

  /** 唤醒 Agent */
  wake(command: string): Promise<ApiResponse<{ command: string; message: string }>> {
    return http.post('/agent/wake', { command })
  },

  /** 对话模式发送消息 */
  sendChat(message: string): Promise<ApiResponse<{ id: string }>> {
    return http.post('/agent/chat', { message })
  },

  /** 获取对话历史 */
  getChatHistory(): Promise<ApiResponse<{ id: string; role: string; content: string; created_at: string }[]>> {
    return http.get('/agent/chat')
  },
}
