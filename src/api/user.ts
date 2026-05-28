import http from '@/utils/http'
import type { ApiResponse, User, AgentKey } from '@/types'

export const userApi = {
  list(): Promise<ApiResponse<User[]>> {
    return http.get('/users') as unknown as Promise<ApiResponse<User[]>>
  },
  current(): Promise<ApiResponse<User | null>> {
    return http.get('/users/current') as unknown as Promise<ApiResponse<User | null>>
  },
  login(username: string, password: string): Promise<ApiResponse<User>> {
    return http.post('/users/login', { username, password }) as unknown as Promise<ApiResponse<User>>
  },
  update(username: string, data: Partial<Pick<User, 'displayName'> & { password: string }>): Promise<ApiResponse<User>> {
    return http.put(`/users/${username}`, data) as unknown as Promise<ApiResponse<User>>
  },
  delete(username: string): Promise<ApiResponse<null>> {
    return http.delete(`/users/${username}`) as unknown as Promise<ApiResponse<null>>
  },
  switchUser(username: string): Promise<ApiResponse<null>> {
    return http.post('/users/switch', { username }) as unknown as Promise<ApiResponse<null>>
  },
  refresh(username: string): Promise<ApiResponse<User>> {
    return http.post(`/users/${username}/refresh`) as unknown as Promise<ApiResponse<User>>
  },
  // Agent Keys
  listAgentKeys(username: string): Promise<ApiResponse<AgentKey[]>> {
    return http.get(`/users/${username}/agent-keys`) as unknown as Promise<ApiResponse<AgentKey[]>>
  },
  createAgentKey(username: string, name?: string): Promise<ApiResponse<AgentKey>> {
    return http.post(`/users/${username}/agent-keys`, { name }) as unknown as Promise<ApiResponse<AgentKey>>
  },
  toggleAgentKey(id: string): Promise<ApiResponse<AgentKey>> {
    return http.patch(`/users/agent-keys/${id}/toggle`) as unknown as Promise<ApiResponse<AgentKey>>
  },
  deleteAgentKey(id: string): Promise<ApiResponse<null>> {
    return http.delete(`/users/agent-keys/${id}`) as unknown as Promise<ApiResponse<null>>
  },
}
