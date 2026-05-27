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
}
