/**
 * 服务端类型定义（v2）
 */

export type TaskStatus = 'pending' | 'in_progress' | 'self_test' | 'testing' | 'verifying' | 'submitted' | 'completed' | 'rejected'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

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
  // 用户自定义扩展字段
  projectPath: string
  gitBranch: string
  customDescription: string
  acceptanceCriteria: string
  requirementDoc: string
  localPath: string
}

export interface DevLogEntry {
  id: string
  taskId: string
  time: string
  action: string
  content: string
  author: string
  autoFixed: boolean
}
