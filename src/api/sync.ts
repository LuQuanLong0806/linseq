import http from '@/utils/http'
import type { SyncConfig, SyncRecord, ApiResponse } from '@/types'

export const syncApi = {
  /** 获取同步配置 */
  getConfig(): Promise<ApiResponse<SyncConfig>> {
    return http.get('/sync/config')
  },

  /** 更新同步配置 */
  updateConfig(config: Partial<SyncConfig>): Promise<ApiResponse<SyncConfig>> {
    return http.put('/sync/config', config)
  },

  /** 获取同步记录 */
  getRecords(): Promise<ApiResponse<SyncRecord[]>> {
    return http.get('/sync/records')
  },

  /** 触发手动同步 */
  triggerSync(): Promise<ApiResponse<SyncRecord>> {
    return http.post('/sync/trigger', {}, { timeout: 120000 })
  },

  /** 内网登录 */
  login(username: string, password: string): Promise<ApiResponse<{ cookie: string; expiry: string }>> {
    return http.post('/sync/login', { username, password })
  },

  /** 检查登录状态 */
  checkLoginStatus(): Promise<ApiResponse<{ isLoggedIn: boolean; expiry: string }>> {
    return http.get('/sync/login-status')
  },
}
