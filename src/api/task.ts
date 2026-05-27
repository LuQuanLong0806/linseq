import http from '@/utils/http'
import type { Task, TaskStatus, TaskUpdateParams, PaginatedResponse, PaginationParams, ApiResponse } from '@/types'

export const taskApi = {
  /** 获取任务列表（分页） */
  getTasks(params?: Partial<PaginationParams>): Promise<ApiResponse<PaginatedResponse<Task>>> {
    return http.get('/tasks', { params })
  },

  /** 获取单个任务详情 */
  getTaskById(id: string): Promise<ApiResponse<Task>> {
    return http.get(`/tasks/${id}`)
  },

  /** 更新任务状态 */
  updateStatus(id: string, status: TaskStatus): Promise<ApiResponse<Task>> {
    return http.patch(`/tasks/${id}/status`, { status })
  },

  /** 更新任务信息 */
  updateTask(id: string, data: Partial<TaskUpdateParams>): Promise<ApiResponse<Task>> {
    return http.patch(`/tasks/${id}`, data)
  },

  /** 从内网同步任务 */
  syncFromIntranet(): Promise<ApiResponse<SyncResult>> {
    return http.post('/tasks/sync', {}, { timeout: 120000 })
  },

  /** 添加开发记录 */
  addDevLog(taskId: string, entry: { action: string; content: string }): Promise<ApiResponse<Task>> {
    return http.post(`/tasks/${taskId}/devlog`, entry)
  },

  /** 提取 PDF 文字内容 */
  extractPdf(taskId: string): Promise<ApiResponse<{ reqDocText: string }>> {
    return http.post(`/tasks/${taskId}/extract-pdf`)
  },

  /** 手动创建任务 */
  createManualTask(data: Partial<Task>): Promise<ApiResponse<Task>> {
    return http.post('/tasks/manual', data)
  },

  /** 重新发布任务到 AI 待办 */
  republishTask(id: string, data?: Partial<Task>): Promise<ApiResponse<Task>> {
    return http.post(`/tasks/${id}/republish`, data)
  },
}

interface SyncResult {
  totalTasks: number
  newTasks: number
  updatedTasks: number
  unchangedTasks: number
}
