/**
 * 任务 API 路由（v2 - 完整内网字段 + 自定义扩展字段）
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { broadcastToTask } from '../websocket.js'
import type { Task, TaskStatus } from './types.js'

/** 通过 OpenClaw Gateway 唤醒 Agent，发送消息 */
function wakeAgent(db: ReturnType<typeof getDb>, message: string) {
  try {
    const urlRow = db.prepare("SELECT value FROM sync_config WHERE key = 'webhookUrl'").get() as { value: string } | undefined
    if (!urlRow?.value) return
    const url = (urlRow.value as string).replace(/^"|"$/g, '')
    const tokenRow = db.prepare("SELECT value FROM sync_config WHERE key = 'openclawToken'").get() as { value: string } | undefined
    const token = tokenRow?.value ? (tokenRow.value as string).replace(/^"|"$/g, '') : ''
    const targetRow = db.prepare("SELECT value FROM sync_config WHERE key = 'agentTarget'").get() as { value: string } | undefined
    const target = targetRow?.value ? (targetRow.value as string).replace(/^"|"$/g, '') : 'agent-209e563a'
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: `openclaw/${target}`,
        messages: [{ role: 'user', content: message }],
        stream: false,
      }),
    }).catch(() => {})
  } catch { /* 非阻塞 */ }
}

/** 补充说明时唤醒 Agent */
function triggerWebhook(db: ReturnType<typeof getDb>, userId: string, taskId: string, content: string) {
  wakeAgent(db, `[系统通知] 任务 ${taskId} 收到新的补充说明：${content.substring(0, 200)}${content.length > 200 ? '...' : ''}\n\n请立即执行 GET /task/${taskId}/supplements 检查并处理。`)
}

/** 导出 wakeAgent 供 agent 路由使用 */
export { wakeAgent }

const router = Router()

// ========== 手动创建任务 ==========

router.post('/manual', (req, res) => {
  try {
    const db = getDb()
    const { title, description, customDescription, acceptanceCriteria, projectPath, gitBranch, project, module, priority, deadline } = req.body
    if (!title) return res.status(400).json({ code: 400, message: '任务标题不能为空', data: null })

    const id = uuidv4()
    const sourceId = `manual_${Date.now()}`
    db.prepare(`
      INSERT INTO tasks (id, source_id, title, description, module, priority, status, deadline,
        project, project_path, git_branch, custom_description, acceptance_criteria, ai_status,
        user_id, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 'ai_todo', ?,
        datetime('now','localtime'), datetime('now','localtime'))
    `).run(id, sourceId, title, description || '', module || '', priority || 'medium', deadline || '',
      project || '', projectPath || '', gitBranch || '', customDescription || '', acceptanceCriteria || '',
      req.userId)

    const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.userId)
    res.json({ code: 0, message: 'success', data: mapDbRowToTask(db, row) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 重新发布任务到 AI 待办 ==========

router.post('/:id/republish', (req, res) => {
  try {
    const db = getDb()
    const id = req.params.id
    const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!row) return res.status(404).json({ code: 404, message: '任务不存在', data: null })

    const { customDescription, projectPath, gitBranch } = req.body
    const reworkCount = ((row as Record<string, unknown>).rework_count as number || 0) + 1

    const updates: string[] = ['ai_status = ?', 'rework_count = ?', 'update_time = datetime(\'now\',\'localtime\')']
    const values: unknown[] = ['ai_rework', reworkCount]

    if (customDescription) { updates.push('custom_description = ?'); values.push(customDescription) }
    if (projectPath) { updates.push('project_path = ?'); values.push(projectPath) }
    if (gitBranch) { updates.push('git_branch = ?'); values.push(gitBranch) }

    values.push(id, req.userId)
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values)

    addDevLog(db, id, '重新发布', `第 ${reworkCount} 次发布到 AI 待办`, 'user', false)

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.userId)
    res.json({ code: 0, message: 'success', data: mapDbRowToTask(db, updated) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 查询 ==========

router.get('/', (req, res) => {
  try {
    const db = getDb()
    const { page = '1', pageSize = '20', keyword, status, aiStatus, priority, project, customer, module, projectPath, isClosed } = req.query

    let whereClause = 'WHERE is_hidden = 0 AND user_id = ?'
    const params: unknown[] = [req.userId]

    if (keyword) {
      whereClause += ' AND (title LIKE ? OR source_id LIKE ? OR description LIKE ? OR project LIKE ? OR module LIKE ?)'
      const kw = `%${keyword}%`
      params.push(kw, kw, kw, kw, kw)
    }
    if (status) {
      whereClause += ' AND status = ?'
      params.push(status)
    }
    if (aiStatus) {
      if (aiStatus === 'none') {
        whereClause += ' AND (ai_status = "" OR ai_status IS NULL)'
      } else {
        whereClause += ' AND ai_status = ?'
        params.push(aiStatus)
      }
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

router.get('/stats/overview', (req, res) => {
  try {
    const db = getDb()
    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE is_closed = 0 AND user_id = ?')
    const urgentStmt = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE priority = 'urgent' AND is_closed = 0 AND user_id = ?")
    const inProgressStmt = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'in_progress' AND is_closed = 0 AND user_id = ?")
    const selfTestStmt = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'self_test' AND is_closed = 0 AND user_id = ?")
    const overdueStmt = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE deadline < date('now', 'localtime') AND is_closed = 0 AND status NOT IN ('completed', 'rejected') AND user_id = ?")
    const projectStmt = db.prepare('SELECT project, COUNT(*) as count FROM tasks WHERE is_closed = 0 AND user_id = ? GROUP BY project ORDER BY count DESC LIMIT 10')

    const total = (totalStmt.get(req.userId) as { count: number }).count
    const urgent = (urgentStmt.get(req.userId) as { count: number }).count
    const inProgress = (inProgressStmt.get(req.userId) as { count: number }).count
    const selfTest = (selfTestStmt.get(req.userId) as { count: number }).count
    const overdue = (overdueStmt.get(req.userId) as { count: number }).count
    const projects = projectStmt.all(req.userId)

    res.json({ code: 0, message: 'success', data: { total, urgent, inProgress, selfTest, overdue, projects } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

router.get('/:id', (req, res) => {
  try {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
    const row = stmt.get(req.params.id, req.userId)
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
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!existing) return res.status(404).json({ code: 404, message: '任务不存在', data: null })

    db.prepare(`UPDATE tasks SET status = ?, update_time = datetime('now', 'localtime') WHERE id = ? AND user_id = ?`).run(status, id, req.userId)
    addDevLog(db, id, '状态变更', `状态变更为 ${status}`, 'agent', false)

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.userId)
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

    values.push(id, req.userId)
    db.prepare(`UPDATE tasks SET ${setParts.join(', ')}, update_time = datetime('now', 'localtime') WHERE id = ? AND user_id = ?`).run(...values)

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.userId)
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
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.userId)
    res.json({ code: 0, message: 'success', data: mapDbRowToTask(db, task) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 任务补充说明（开发中追加指令） ==========

// 获取任务的补充说明列表
router.get('/:id/supplements', (req, res) => {
  try {
    const db = getDb()
    const taskId = req.params.id
    const task = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(taskId) as { user_id: string } | undefined
    if (!task || task.user_id !== req.userId) {
      return res.status(403).json({ code: 403, message: '无权访问', data: null })
    }
    const rows = db.prepare(
      'SELECT id, content, created_at, read_by_agent FROM task_supplements WHERE task_id = ? ORDER BY created_at ASC'
    ).all(taskId)
    res.json({ code: 0, message: 'success', data: rows })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 添加补充说明
router.post('/:id/supplements', (req, res) => {
  try {
    const db = getDb()
    const taskId = req.params.id
    const { content } = req.body as { content: string }
    if (!content?.trim()) {
      return res.status(400).json({ code: 400, message: '内容不能为空', data: null })
    }
    const task = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(taskId) as { user_id: string } | undefined
    if (!task || task.user_id !== req.userId) {
      return res.status(403).json({ code: 403, message: '无权访问', data: null })
    }
    const id = uuidv4()
    db.prepare(
      'INSERT INTO task_supplements (id, task_id, content) VALUES (?, ?, ?)'
    ).run(id, taskId, content.trim())
    addDevLog(db, taskId, '补充说明', `用户追加了补充说明: ${content.trim().substring(0, 50)}${content.trim().length > 50 ? '...' : ''}`, 'user', false)
    const row = db.prepare('SELECT * FROM task_supplements WHERE id = ?').get(id)
    broadcastToTask(taskId, 'supplement', { id, taskId, content: content.trim(), type: 'user' })
    // Webhook 回调：通知 Agent 有新补充说明
    triggerWebhook(db, req.userId!, taskId, content.trim())
    res.json({ code: 0, message: 'success', data: row })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 同步（从内网） ==========

router.post('/sync', async (req, res) => {
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
        stale_days, flow_days, days_since_create, reject_flag, flow_id, work_id, version, user_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?, 1,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?
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
      const exists = db.prepare('SELECT id, title, status FROM tasks WHERE source_id = ? AND user_id = ?').get(task.sourceId, req.userId) as Record<string, unknown> | undefined

      upsertStmt.run(
        id, task.sourceId, task.intranetId, task.title, task.description, task.module, task.moduleShort, task.product,
        task.priority, task.status, task.deadline, task.createTime || new Date().toISOString(), task.updateTime || new Date().toISOString(), JSON.stringify(task.tags),
        task.project, task.customer, task.customerManager, task.taskType, task.bugOrReq, task.workHours, task.submitTime,
        task.developer, task.supervisor, task.supervisorId, task.productManager, task.devLeader, task.handler,
        task.department, task.departmentId, task.isClosed ? 1 : 0, task.intranetNode, task.intranetNodeName, task.nodeIndex,
        task.staleDays, task.flowDays, task.daysSinceCreate, task.rejectFlag ? 1 : 0, task.flowId, task.workId, task.version, req.userId
      )

      if (!exists) {
        newTasks++
      } else if (exists.title !== task.title || exists.status !== task.status) {
        updatedTasks++
      } else {
        unchangedTasks++
      }
    }

    // 隐藏不在本次同步中的旧任务（手动创建的除外），并清除其 AI 待办状态
    // 同步数据中已有的任务确保显示（is_hidden = 0）
    if (tasks.length > 0) {
      const syncedIds = tasks.map(t => t.sourceId)
      const placeholders = syncedIds.map(() => '?').join(',')
      // 仅隐藏非手动创建、且不在本次同步中的任务
      db.prepare(`UPDATE tasks SET is_hidden = 1, ai_status = '' WHERE source_id NOT IN (${placeholders}) AND is_hidden = 0 AND source_id NOT LIKE 'manual_%' AND user_id = ?`).run(...syncedIds, req.userId)
      // 同步数据中存在的任务确保可见
      db.prepare(`UPDATE tasks SET is_hidden = 0 WHERE source_id IN (${placeholders}) AND user_id = ?`).run(...syncedIds, req.userId)
    }

    // 同步后自动关联项目配置
    const configs = db.prepare("SELECT name, local_path, default_branch FROM project_configs WHERE local_path != ''").all() as { name: string; local_path: string; default_branch: string }[]
    if (configs.length > 0) {
      const updateStmt = db.prepare("UPDATE tasks SET project_path = ?, git_branch = ? WHERE project = ? AND (project_path = '' OR project_path IS NULL)")
      for (const cfg of configs) {
        updateStmt.run(cfg.local_path, cfg.default_branch, cfg.name)
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
