import { ref } from 'vue'
import { preprocessApi, type SplitSubTask, type MatchResult, type RiskResult, type BatchAnalysisItem, type DocGroup, type ExtractResult } from '@/api/preprocess'
import { ElMessage } from 'element-plus'

export function usePreprocess() {
  const splitting = ref(false)
  const matching = ref(false)
  const analyzing = ref(false)
  const extracting = ref(false)

  /** 获取文档分组 */
  async function getDocGroups(): Promise<{ multiTaskGroups: DocGroup[]; allGroups: DocGroup[]; totalGroups: number } | null> {
    try {
      const res = await preprocessApi.docGroups()
      return res.data
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || '获取文档分组失败')
      return null
    }
  }

  /** 提取单任务文档文本 */
  async function extractTaskDoc(taskId: string): Promise<ExtractResult | null> {
    extracting.value = true
    try {
      const res = await preprocessApi.extractTaskDoc(taskId)
      if (res.data?.extracted) {
        ElMessage.success(`提取成功：${res.data.textLength} 字符${res.data.fromCache ? '（缓存）' : ''}`)
      } else {
        ElMessage.warning(res.data?.error || '提取失败')
      }
      return res.data
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || '文档提取失败')
      return null
    } finally {
      extracting.value = false
    }
  }

  /** 批量提取文档组 */
  async function extractDocGroup(docKey: string): Promise<ExtractResult[]> {
    extracting.value = true
    try {
      const res = await preprocessApi.extractDocGroup(docKey)
      const results = res.data || []
      const success = results.filter(r => r.extracted).length
      ElMessage.success(`批量提取完成：${success}/${results.length} 成功`)
      return results
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || '批量提取失败')
      return []
    } finally {
      extracting.value = false
    }
  }

  /** 智能拆分/分组检测 */
  async function handleSplit(taskId: string): Promise<{ subTasks: SplitSubTask[] } | { isDocGroup: boolean; docKey: string; relatedTasks: { taskId: string; title: string }[] } | null> {
    splitting.value = true
    try {
      const res = await preprocessApi.split(taskId)
      if (res.data?.needsSplit) {
        return { subTasks: res.data.subTasks }
      }
      if (res.data?.isDocGroup) {
        return res.data
      }
      ElMessage.info('该任务无需拆分')
      return null
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || '拆分失败')
      return null
    } finally {
      splitting.value = false
    }
  }

  /** 确认拆分 */
  async function confirmSplit(parentTaskId: string, subTasks: SplitSubTask[]): Promise<string[] | null> {
    splitting.value = true
    try {
      const res = await preprocessApi.splitConfirm(parentTaskId, subTasks)
      ElMessage.success(res.message)
      return res.data?.createdIds || null
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || '确认拆分失败')
      return null
    } finally {
      splitting.value = false
    }
  }

  /** 项目匹配 */
  async function handleMatch(taskId: string): Promise<MatchResult | null> {
    matching.value = true
    try {
      const res = await preprocessApi.match(taskId)
      return res.data
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || '匹配失败')
      return null
    } finally {
      matching.value = false
    }
  }

  /** 确认关联 */
  async function confirmMatch(taskId: string, projectConfigId: string) {
    try {
      await preprocessApi.matchConfirm(taskId, projectConfigId)
      ElMessage.success('关联成功')
      return true
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || '关联失败')
      return false
    }
  }

  /** 风险评估 */
  async function handleRiskAssess(taskId: string): Promise<RiskResult | null> {
    try {
      const res = await preprocessApi.assessRisk(taskId)
      return res.data
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || '评估失败')
      return null
    }
  }

  /** 批量分析 */
  async function batchAnalyze(taskIds: string[]): Promise<BatchAnalysisItem[]> {
    if (!taskIds.length) return []
    analyzing.value = true
    try {
      const res = await preprocessApi.batchAnalyze(taskIds)
      return res.data || []
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || '批量分析失败')
      return []
    } finally {
      analyzing.value = false
    }
  }

  return {
    splitting, matching, analyzing, extracting,
    getDocGroups, extractTaskDoc, extractDocGroup,
    handleSplit, confirmSplit,
    handleMatch, confirmMatch,
    handleRiskAssess, batchAnalyze,
  }
}
