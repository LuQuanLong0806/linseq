import http from '@/utils/http'
import type { TaskVersion, ApiResponse } from '@/types'

export const versionApi = {
  list(taskId: string): Promise<ApiResponse<TaskVersion[]>> {
    return http.get(`/versions/task/${taskId}`)
  },

  create(taskId: string, data: { aiOutput?: string; devLogs?: string[]; aiDurationMs?: number; prevReviewComment?: string }): Promise<ApiResponse<TaskVersion>> {
    return http.post(`/versions/task/${taskId}`, data)
  },

  approve(id: string): Promise<ApiResponse<TaskVersion>> {
    return http.post(`/versions/${id}/approve`)
  },

  reject(id: string, comment: string): Promise<ApiResponse<TaskVersion>> {
    return http.post(`/versions/${id}/reject`, { comment })
  },

  get(id: string): Promise<ApiResponse<TaskVersion>> {
    return http.get(`/versions/${id}`)
  },
}
