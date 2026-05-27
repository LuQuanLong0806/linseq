import http from '@/utils/http'
import type { ApiResponse } from '@/types'

export const settingsApi = {
  /** 获取报告输出目录 */
  getReportDir(): Promise<ApiResponse<{ reportOutputDir: string }>> {
    return http.get('/settings/report-dir')
  },

  /** 更新报告输出目录 */
  updateReportDir(dir: string): Promise<ApiResponse<{ reportOutputDir: string }>> {
    return http.put('/settings/report-dir', { reportOutputDir: dir })
  },
}
