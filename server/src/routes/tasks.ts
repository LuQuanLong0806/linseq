/**
 * 任务 API 路由（v2 - 完整内网字段 + 自定义扩展字段）
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import type { Task, TaskStatus } from './types.js'

const router = Router()

// ========== 查询 ==========

router.get('/', (req, res) => {
  try {
    const db = getDb()
    const { page = '1', pageSize = '20', keyword, status, priority, project, customer, module, projectPath, isClosed } = req.query

    let whereClause = 'WHERE 1=1'
    const params: unknown[] = []

    if (keyword) {
      whereClause += ' AND (title LIKE ? OR source_id LIKE ? OR description LIKE ? OR project LIKE ? OR danjuCode LIKE ?)'
      const kw = `%${keyword}%`
      params.push(kw, kw, kw, kw, kw)
    }
    if (status) {
      whereClause += ' AND status = ?'
      params.push(status)
    }
    if (priority) {
      whereClause += ' AND priority = ?'
      params.push(priority)
    }
    if (project) {
      whereClause += ' AND project LIKE ?'
      params.push(`%${project}%`)
    }
    if (customer) {
      whereClause += ' AND customer LIKE ?'
      params.push(`%${customer}%`)
    }
    if (module) {
      whereClause += ' AND (module LIKE ? OR module_short LIKE ?)'
      params.push(`%${module}%`, `%${module}%`)
    }
    if (projectPath) {
      whereClause += ' AND project_path LIKE ?'
      params.push(`%${projectPath}%`)
    }
    if (isClosed !== undefined) {
      whereClause += ' AND is_closed = ?'
      params.push(isClosed === 'true' || isClosed === '1' ? 1 : 0)
    }

    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM tasks ${whereClause}`)
    const { total } = countStmt.get(...params) as { total: number }

    const offset = (Number(page) - 1) * Number(pageSize)
    const stmt = db.prepare(`
      SELECT * FROM tasks ${whereClause}
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        CASE is_closed WHEN 0 THEN 0 ELSE 1 END,
        stale_days DESC,
        update_time DESC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(...params, Number(pageSize), offset)
    const list = rows.map((row) => mapDbRowToTask(db, row))

    res.json({
      code: 0,
      message: 'success',
      data: { list, total, page: Number(page), pageSize: Number(pageSize), totalPages: Math.ceil(total / Number(pageSize)) },
    })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

router.get('/stats/overview', (_req, res) => {
  try {
    const db = getDb()
    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE is_closed = 0')
    const urgentStmt = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE priority = 'urgent' AND is_closed = 0")
    const inProgressStmt = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'in_progress' AND is_closed = 0")
    const selfTestStmt = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'self_test' AND is_closed = 0")
    const overdueStmt = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE deadline < date('now', 'localtime') AND is_closed = 0 AND status NOT IN ('completed', 'rejected')")
    const projectStmt = db.prepare('SELECT project, COUNT(*) as count FROM tasks WHERE is_closed = 0 GROUP BY project ORDER BY count DESC LIMIT 10')

    const total = (totalStmt.get() as { count: number }).count
    const urgent = (urgentStmt.get() as { count: number }).count
    const inProgress = (inProgressStmt.get() as { count: number }).count
    const selfTest = (selfTestStmt.get() as { count: number }).count
    const overdue = (overdueStmt.get() as { count: number }).count
    const projects = projectStmt.all()

    res.json({ code: 0, message: 'success', data: { total, urgent, inProgress, selfTest, overdue, projects } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

router.get('/:id', (req, res) => {
  try {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?')
    const row = stmt.get(req.params.id)
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }
    res.json({ code: 0, message: 'success', data: mapDbRowToTask(db, row) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 更新 ==========

router.patch('/:id/status', (req, res) => {
  try {
    const db = getDb()
    const { status } = req.body
    const id = req.params.id
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    if (!existing) return res.status(404).json({ code: 404, message: '任务不存在', data: null })

    db.prepare(`UPDATE tasks SET status = ?, update_time = datetime('now', 'localtime') WHERE id = ?`).run(status, id)
    addDevLog(db, id, '状态变更', `状态变更为 ${status}`, 'agent', false)

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    res.json({ code: 0, message: 'success', data: mapDbRowToTask(db, updated) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

router.patch('/:id', (req, res) => {
  try {
    const db = getDb()
    const updates = req.body
    const id = req.params.id
    if (Object.keys(updates).length === 0) return res.status(400).json({ code: 400, message: '没有需要更新的字段', data: null })

    const allowedFields = new Set([
      'project_path', 'git_branch', 'custom_description', 'acceptance_criteria',
      'requirement_doc', 'local_path', 'status', 'priority', 'tags', 'ai_status',
      'task_page_url', 'review_comment', 'review_time', 'review_result',
      'complete_time', 'rework_count', 'ai_output', 'req_doc_name', 'req_doc_url', 'req_doc_text', 'group_id', 'ai_question',
    ])

    const setParts: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(updates)) {
      const colName = key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`)
      if (!allowedFields.has(colName) && !allowedFields.has(key)) continue
      setParts.push(`${colName} = ?`)
      values.push(typeof value === 'object' ? JSON.stringify(value) : value)
    }

    if (setParts.length === 0) return res.status(400).json({ code: 400, message: '没有允许更新的字段', data: null })

    values.push(id)
    db.prepare(`UPDATE tasks SET ${setParts.join(', ')}, update_time = datetime('now', 'localtime') WHERE id = ?`).run(...values)

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    res.json({ code: 0, message: 'success', data: mapDbRowToTask(db, updated) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

router.post('/:id/devlog', (req, res) => {
  try {
    const db = getDb()
    const { action, content, author = 'agent', autoFixed = false } = req.body
    const taskId = req.params.id
    addDevLog(db, taskId, action, content, author, autoFixed)
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)
    res.json({ code: 0, message: 'success', data: mapDbRowToTask(db, task) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 同步（从内网） ==========

router.post('/sync', async (_req, res) => {
  try {
    const { scrapTasksFromIntranet } = await import('../scraper/intranet.js')
    const tasks = await scrapTasksFromIntranet()
    const db = getDb()

    let newTasks = 0
    let updatedTasks = 0
    let unchangedTasks = 0

    const upsertStmt = db.prepare(`
      INSERT INTO tasks (
        id, source_id, intranet_id, title, description, module, module_short, product,
        priority, status, deadline, create_time, update_time, sync_time, tags, is_synced,
        project, customer, customer_manager, task_type, bug_or_req, work_hours, submit_time,
        developer, supervisor, supervisor_id, product_manager, dev_leader, handler,
        department, department_id, is_closed, intranet_node, intranet_node_name, node_index,
        stale_days, flow_days, days_since_create, reject_flag, flow_id, work_id, version
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?, 1,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(source_id) DO UPDATE SET
        intranet_id = excluded.intranet_id,
        title = excluded.title,
        description = excluded.description,
        module = excluded.module,
        module_short = excluded.module_short,
        product = excluded.product,
        priority = excluded.priority,
        deadline = excluded.deadline,
        update_time = datetime('now', 'localtime'),
        sync_time = datetime('now', 'localtime'),
        tags = excluded.tags,
        is_synced = 1,
        project = excluded.project,
        customer = excluded.customer,
        customer_manager = excluded.customer_manager,
        task_type = excluded.task_type,
        bug_or_req = excluded.bug_or_req,
        work_hours = excluded.work_hours,
        submit_time = excluded.submit_time,
        developer = excluded.developer,
        supervisor = excluded.supervisor,
        product_manager = excluded.product_manager,
        dev_leader = excluded.dev_leader,
        handler = excluded.handler,
        is_closed = excluded.is_closed,
        intranet_node = excluded.intranet_node,
        intranet_node_name = excluded.intranet_node_name,
        stale_days = excluded.stale_days,
        flow_days = excluded.flow_days,
        days_since_create = excluded.days_since_create,
        reject_flag = excluded.reject_flag,
        version = excluded.version
    `)

    for (const task of tasks) {
      const id = uuidv4()
      const exists = db.prepare('SELECT id, title, status FROM tasks WHERE source_id = ?').get(task.sourceId) as Record<string, unknown> | undefined

      upsertStmt.run(
        id, task.sourceId, task.intranetId, task.title, task.description, task.module, task.moduleShort, task.product,
        task.priority, task.status, task.deadline, task.createTime || new Date().toISOString(), task.updateTime || new Date().toISOString(), JSON.stringify(task.tags),
        task.project, task.customer, task.customerManager, task.taskType, task.bugOrReq, task.workHours, task.submitTime,
        task.developer, task.supervisor, task.supervisorId, task.productManager, task.devLeader, task.handler,
        task.department, task.departmentId, task.isClosed ? 1 : 0, task.intranetNode, task.intranetNodeName, task.nodeIndex,
        task.staleDays, task.flowDays, task.daysSinceCreate, task.rejectFlag ? 1 : 0, task.flowId, task.workId, task.version
      )

      if (!exists) {
        newTasks++
      } else if (exists.title !== task.title || exists.status !== task.status) {
        updatedTasks++
      } else {
        unchangedTasks++
      }
    }

    // 记录同步
    db.prepare(`
      INSERT INTO sync_records (id, status, total_tasks, new_tasks, updated_tasks, unchanged_tasks)
      VALUES (?, 'success', ?, ?, ?, ?)
    `).run(uuidv4(), tasks.length, newTasks, updatedTasks, unchangedTasks)

    res.json({ code: 0, message: 'success', data: { totalTasks: tasks.length, newTasks, updatedTasks, unchangedTasks } })
  } catch (err) {
    const db = getDb()
    db.prepare(`
      INSERT INTO sync_records (id, status, total_tasks, error_messages)
      VALUES (?, 'failed', 0, ?)
    `).run(uuidv4(), JSON.stringify([String(err)]))
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 辅助函数 ==========

export function mapDbRowToTask(db: ReturnType<typeof getDb>, row: unknown): Task {
  const r = row as Record<string, unknown>
  const devLogRows = db.prepare('SELECT * FROM dev_logs WHERE task_id = ? ORDER BY time DESC').all(r.id as string)
  const devLog = devLogRows.map((lr) => {
    const l = lr as Record<string, unknown>
    return {
      id: l.id as string,
      taskId: l.task_id as string,
      time: l.time as string,
      action: l.action as string,
      content: l.content as string,
      author: l.author as string,
      autoFixed: Boolean(l.auto_fixed),
    }
  })

  return {
    id: r.id as string,
    sourceId: r.source_id as string,
    intranetId: (r.intranet_id as string) || '',
    title: r.title as string,
    description: r.description as string,
    module: r.module as string,
    moduleShort: (r.module_short as string) || '',
    product: (r.product as string) || '',
    priority: r.priority as Task['priority'],
    status: r.status as TaskStatus,
    deadline: r.deadline as string,
    createTime: r.create_time as string,
    updateTime: r.update_time as string,
    syncTime: r.sync_time as string,
    devLog,
    tags: JSON.parse((r.tags as string) || '[]'),
    isSynced: Boolean(r.is_synced),
    // 内网业务字段
    project: (r.project as string) || '',
    customer: (r.customer as string) || '',
    customerManager: (r.customer_manager as string) || '',
    taskType: (r.task_type as string) || '',
    bugOrReq: (r.bug_or_req as string) || '',
    workHours: (r.work_hours as number) || 0,
    submitTime: (r.submit_time as string) || '',
    developer: (r.developer as string) || '',
    supervisor: (r.supervisor as string) || '',
    supervisorId: (r.supervisor_id as string) || '',
    productManager: (r.product_manager as string) || '',
    devLeader: (r.dev_leader as string) || '',
    handler: (r.handler as string) || '',
    department: (r.department as string) || '',
    departmentId: (r.department_id as string) || '',
    isClosed: Boolean(r.is_closed),
    intranetNode: (r.intranet_node as string) || '',
    intranetNodeName: (r.intranet_node_name as string) || '',
    nodeIndex: (r.node_index as number) || 0,
    staleDays: (r.stale_days as number) || 0,
    flowDays: (r.flow_days as number) || 0,
    daysSinceCreate: (r.days_since_create as number) || 0,
    rejectFlag: Boolean(r.reject_flag),
    flowId: (r.flow_id as string) || '',
    workId: (r.work_id as string) || '',
    version: (r.version as string) || '',
    // 用户自定义字段
    projectPath: (r.project_path as string) || '',
    gitBranch: (r.git_branch as string) || '',
    customDescription: (r.custom_description as string) || '',
    acceptanceCriteria: (r.acceptance_criteria as string) || '',
    requirementDoc: (r.requirement_doc as string) || '',
    localPath: (r.local_path as string) || '',
    taskPageUrl: (r.task_page_url as string) || '',
    aiStatus: (r.ai_status as string) || '',
    reviewComment: (r.review_comment as string) || '',
    reviewTime: (r.review_time as string) || '',
    reviewResult: (r.review_result as string) || '',
    completeTime: (r.complete_time as string) || '',
    reworkCount: (r.rework_count as number) || 0,
    aiOutput: (r.ai_output as string) || '',
    reqDocName: (r.req_doc_name as string) || '',
    reqDocUrl: (r.req_doc_url as string) || '',
    reqDocText: (r.req_doc_text as string) || '',
    groupId: (r.group_id as string) || '',
    aiQuestion: (r.ai_question as string) || '',
  }
}

export function addDevLog(db: ReturnType<typeof getDb>, taskId: string, action: string, content: string, author: string, autoFixed: boolean): string {
  const id = uuidv4()
  db.prepare(`INSERT INTO dev_logs (id, task_id, action, content, author, auto_fixed) VALUES (?, ?, ?, ?, ?, ?)`).run(id, taskId, action, content, author, autoFixed ? 1 : 0)
  return id
}

// 提取单条任务的 PDF 文字内容
router.post('/:id/extract-pdf', async (req, res) => {
  try {
    const { extractPdfText } = await import('../scraper/intranet.js')
    const text = await extractPdfText(req.params.id)
    res.json({ code: 0, message: 'success', data: { reqDocText: text } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String((err as Error).message), data: null })
  }
})

export default router
