import http from '@/utils/http'

export interface SplitSubTask {
  title: string
  description: string
  module: string
  customer: string
  project: string
  bugOrReq: string
}

export interface DocGroup {
  docKey: string
  docName: string
  taskIds: string[]
  taskCount: number
  project: string
}

export interface MatchResult {
  matched: boolean
  projectConfigId: string
  projectConfigName: string
  localPath: string
  defaultBranch: string
  confidence: number
  method: string
  reason: string
  branchSuggestion?: string
}

export interface RiskResult {
  level: 'L1' | 'L2' | 'L3' | 'L4'
  score: number
  factors: string[]
  source?: 'ai' | 'rules'
  summary?: string
  acceptanceCriteria?: string
  aiError?: string
}

export interface ProjectRule {
  id: string
  project_config_id: string
  rule_type: string
  pattern: string
  field: string
  priority: number
  enabled: number
  user_id: string
  created_at: string
}

export interface ExtractResult {
  taskId: string
  title: string
  docKey: string
  extracted: boolean
  textLength: number
  fromCache: boolean
  error?: string
}

export interface BatchAnalysisItem {
  taskId: string
  title: string
  source: 'ai' | 'rules'
  projectMatch: { matched: boolean; projectConfigName: string; confidence: number; method: string } | null
  risk: RiskResult
  summary?: string
  acceptanceCriteria?: string
  aiError?: string
}

export const preprocessApi = {
  /** 文档分组（按 req_doc_name 聚合关联任务） */
  docGroups() {
    return http.post('/preprocess/doc-groups')
  },

  /** 提取单任务文档文本 */
  extractTaskDoc(taskId: string) {
    return http.post('/preprocess/extract-task-doc', { taskId })
  },

  /** 批量提取同文档组所有任务 */
  extractDocGroup(docKey: string) {
    return http.post('/preprocess/extract-doc-group', { docKey })
  },

  /** 检测并拆分多任务文档 */
  split(taskId: string) {
    return http.post('/preprocess/split', { taskId })
  },

  /** 确认拆分 */
  splitConfirm(parentTaskId: string, subTasks: SplitSubTask[]) {
    return http.post('/preprocess/split-confirm', { parentTaskId, subTasks })
  },

  /** 单任务项目匹配 */
  match(taskId: string) {
    return http.post('/preprocess/match', { taskId })
  },

  /** 确认项目关联 */
  matchConfirm(taskId: string, projectConfigId: string) {
    return http.post('/preprocess/match-confirm', { taskId, projectConfigId })
  },

  /** 风险评估 */
  assessRisk(taskId: string) {
    return http.post('/preprocess/assess-risk', { taskId })
  },

  /** 批量分析 */
  batchAnalyze(taskIds: string[]) {
    return http.post('/preprocess/batch-analyze', { taskIds })
  },

  /** 规则 CRUD */
  getRules() {
    return http.get('/preprocess/rules')
  },
  createRule(data: { projectConfigId: string; ruleType: string; pattern: string; field: string; priority?: number }) {
    return http.post('/preprocess/rules', data)
  },
  updateRule(id: string, data: Partial<ProjectRule>) {
    return http.put(`/preprocess/rules/${id}`, data)
  },
  deleteRule(id: string) {
    return http.delete(`/preprocess/rules/${id}`)
  },

  /** 匹配历史 */
  getHistory(limit?: number) {
    return http.get('/preprocess/history', { params: { limit } })
  },
}
