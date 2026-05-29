/**
 * LineSequence 核心类型定义
 * 任务自动化 + 前端自研管理系统
 */

/** 任务状态 */
export const TaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  SELF_TEST: 'self_test',
  TESTING: 'testing',
  VERIFYING: 'verifying',
  SUBMITTED: 'submitted',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
} as const
export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus]

/** 任务优先级 */
export const TaskPriority = {
  URGENT: 'urgent',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const
export type TaskPriority = typeof TaskPriority[keyof typeof TaskPriority]

/** 任务数据模型（完整 - 含内网扩展字段 + 自定义字段） */
export interface Task {
  id: string
  sourceId: string
  intranetId: string
  title: string
  description: string
  module: string
  moduleShort: string
  product: string
  priority: TaskPriority
  status: TaskStatus
  deadline: string
  createTime: string
  updateTime: string
  syncTime: string
  devLog: DevLogEntry[]
  tags: string[]
  isSynced: boolean
  // 内网业务字段
  project: string
  customer: string
  customerManager: string
  taskType: string
  bugOrReq: string
  workHours: number
  submitTime: string
  developer: string
  supervisor: string
  supervisorId: string
  productManager: string
  devLeader: string
  handler: string
  department: string
  departmentId: string
  isClosed: boolean
  intranetNode: string
  intranetNodeName: string
  nodeIndex: number
  staleDays: number
  flowDays: number
  daysSinceCreate: number
  rejectFlag: boolean
  flowId: string
  workId: string
  version: string
  // 用户自定义扩展字段（二次编辑）
  projectPath: string
  gitBranch: string
  customDescription: string
  acceptanceCriteria: string
  requirementDoc: string
  localPath: string
  taskPageUrl: string
  aiStatus: string
  reviewComment: string
  reviewTime: string
  reviewResult: string
  completeTime: string
  reworkCount: number
  aiOutput: string
  aiQuestion: string
  reqDocName: string
  reqDocUrl: string
  reqDocText: string
  groupId: string
}

/** 开发记录条目 */
export interface DevLogEntry {
  id: string
  taskId: string
  time: string
  action: string
  content: string
  author: string
  autoFixed: boolean
}

/** 同步记录 */
export interface SyncRecord {
  id: string
  syncTime: string
  status: 'success' | 'partial' | 'failed'
  totalTasks: number
  newTasks: number
  updatedTasks: number
  unchangedTasks: number
  errorMessages: string[]
}

/** 仪表盘统计 */
export interface DashboardStats {
  total: number
  pending: number
  inProgress: number
  selfTest: number
  submitted: number
  completed: number
  rejected: number
  urgentCount: number
  nearDeadline: number
  overdue: number
}

/** 同步配置 */
export interface SyncConfig {
  intranetUrl: string
  autoSync: boolean
  syncInterval: number
  lastSyncTime: string
  loginCookie: string
  cookieExpiry: string
  webhookUrl: string
}

/** API 响应结构 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

/** 用户（内网账号） */
export interface User {
  username: string
  displayName: string
  cookieExpiry: string
  lastSyncTime: string
  createdAt: string
}

/** Agent API Key */
export interface AgentKey {
  id: string
  userId: string
  key: string
  name: string
  enabled: boolean
  createdAt: string
  lastUsedAt: string
}

/** 分页参数 */
export interface PaginationParams {
  page: number
  pageSize: number
  keyword?: string
  status?: TaskStatus
  priority?: TaskPriority
  module?: string
  project?: string
  customer?: string
  projectPath?: string
  aiStatus?: string
  isClosed?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 任务更新参数（只含可编辑字段） */
export interface TaskUpdateParams {
  projectPath?: string
  gitBranch?: string
  customDescription?: string
  acceptanceCriteria?: string
  requirementDoc?: string
  taskPageUrl?: string
  status?: TaskStatus
  priority?: string
  tags?: string[]
  aiStatus?: string
  reviewComment?: string
  reviewTime?: string
  reviewResult?: string
  completeTime?: string
  reqDocText?: string
  reworkCount?: number
  aiOutput?: string
  aiQuestion?: string
  reqDocText?: string
  groupId?: string
}

/** 任务分组 */
export interface TaskGroup {
  id: string
  name: string
  taskIds: string[]
  description: string
  createdAt: string
}

/** 任务版本（AI 迭代版本管理） */
export interface TaskVersion {
  id: string
  taskId: string
  versionNumber: string
  iteration: number
  aiOutput: string
  devLogs: string[]
  aiDurationMs: number
  prevReviewComment: string
  status: 'pending_review' | 'approved' | 'rejected' | 'archived'
  isFinal: boolean
  gitCommitId: string
  gitCommitTime: string
  gitBranch: string
  createdAt: string
  filesChanged: { path: string; action: string }[]
  testResult: { passed: boolean; typeCheck: boolean; details: string }
  summary: string
  screenshots: string[]
  reportText: string
  reportPath: string
}
