import http from '@/utils/http'
import type { TaskGroup, ApiResponse } from '@/types'

export const groupApi = {
  list(): Promise<ApiResponse<TaskGroup[]>> {
    return http.get('/groups')
  },
  create(data: { name: string; taskIds?: string[]; description?: string }): Promise<ApiResponse<TaskGroup>> {
    return http.post('/groups', data)
  },
  update(id: string, data: Partial<{ name: string; taskIds: string[]; description: string }>): Promise<ApiResponse<TaskGroup>> {
    return http.put(`/groups/${id}`, data)
  },
  remove(id: string): Promise<ApiResponse<null>> {
    return http.delete(`/groups/${id}`)
  },
}
