/**
 * Agent 自动化路由 — 供 AI agent 自主拉取任务、开发、回写状态
 *
 * 核心端点：
 *   GET  /api/agent/next-task      — 获取下一个最紧急的待办任务
 *   GET  /api/agent/task/:id/detail — 获取任务完整详情（含需求文档、验收标准）
 *   POST /api/agent/sync           — 从内网同步全量任务
 *   POST /api/agent/task/:id/start — 开始开发（状态→in_progress）
 *   POST /api/agent/task/:id/complete — 标记完成（状态→self_test）
 *   POST /api/agent/task/:id/submit — 提交测试（状态→submitted）
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { mapDbRowToTask, addDevLog } from './tasks.js'

const router = Router()

/** Task 类型（从 tasks.ts 复用，避免循环依赖） */
interface AgentTask {
  id: string
  sourceId: string
  intranetId: string
  title: string
  description: string
  project: string
  customer: string
  priority: string
  status: string
  deadline: string
  projectPath: string
  gitBranch: string
  customDescription: string
  acceptanceCriteria: string
  requirementDoc: string
  intranetNodeName: string
  isClosed: boolean
  staleDays: number
  workHours: number
  handler: string
  developer: string
  devLeader: string
  bugOrReq: string
  workId: string
  flowId: string
  [key: string]: unknown
}

/**
 * GET /api/agent/next-task
 * 获取下一个最紧急的待办任务
 *
 * 排序策略：
 *   1. 紧急优先（A > B > C）
 *   2. 截止日期最近的优先
 *   3. 滞留天数最少的优先（新任务优先）
 *
 * 过滤条件：
 *   - 未关闭 (is_closed = 0)
 *   - 状态为 pending 或 in_progress
 *   - 待办人员为自己（可选，通过 ?handler=xxx 过滤）
 */
router.get('/next-task', (req, res) => {
  try {
    const db = getDb()
    const handler = req.query.handler as string | undefined

    let sql = `
      SELECT * FROM tasks
      WHERE is_closed = 0
        AND status IN ('pending', 'in_progress')
    `
    const params: string[] = []

    if (handler) {
      sql += ` AND handler LIKE ?`
      params.push(`%${handler}%`)
    }

    // 排序：紧急 → 截止日 → 滞留天数
    sql += `
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END ASC,
        deadline ASC,
        stale_days ASC
      LIMIT 1
    `

    const row = db.prepare(sql).get(...params) as AgentTask | undefined
    if (!row) {
      return res.json({ code: 0, message: '暂无待办任务', data: null })
    }

    const task = mapDbRowToTask(db, row)
    res.json({ code: 0, message: 'success', data: task })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * GET /api/agent/task/:id/detail
 * 获取任务完整详情（含 devLogs、自定义描述等）
 */
router.get('/task/:id/detail', (req, res) => {
  try {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }
    const task = mapDbRowToTask(db, row)
    res.json({ code: 0, message: 'success', data: task })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * GET /api/agent/tasks
 * 获取任务列表（支持过滤）
 * query: status, priority, project, limit
 */
router.get('/tasks', (req, res) => {
  try {
    const db = getDb()
    const { status, priority, project, limit = '20' } = req.query

    let sql = 'SELECT * FROM tasks WHERE 1=1'
    const params: string[] = []

    if (status) { sql += ' AND status = ?'; params.push(status as string) }
    if (priority) { sql += ' AND priority = ?'; params.push(priority as string) }
    if (project) { sql += ' AND project LIKE ?'; params.push(`%${project}%`) }

    sql += ' ORDER BY CASE priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END ASC, deadline ASC'
    sql += ` LIMIT ${parseInt(limit as string, 10) || 20}`

    const rows = db.prepare(sql).all(...params)
    const tasks = rows.map((row) => mapDbRowToTask(db, row))
    res.json({ code: 0, message: 'success', data: tasks })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * POST /api/agent/task/:id/start
 * 开始开发 — 状态 → in_progress，记录日志
 */
router.post('/task/:id/start', (req, res) => {
  try {
    const db = getDb()
    const id = req.params.id
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }

    const r = row as Record<string, unknown>
    if (r.status === 'completed' || r.status === 'submitted') {
      return res.status(400).json({ code: 400, message: `任务已${r.status === 'completed' ? '完结' : '提交'}，无法再次开始`, data: null })
    }

    db.prepare("UPDATE tasks SET status = 'in_progress', update_time = datetime('now', 'localtime') WHERE id = ?").run(id)
    addDevLog(db, id, '开始开发', `Agent 开始开发任务: ${(r.title as string).substring(0, 50)}`, 'agent', false)

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    res.json({ code: 0, message: '已开始开发', data: mapDbRowToTask(db, updated) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * POST /api/agent/task/:id/complete
 * 开发完成 — 状态 → self_test，记录日志
 * body: { summary: string } 开发总结
 */
router.post('/task/:id/complete', (req, res) => {
  try {
    const db = getDb()
    const id = req.params.id
    const { summary = '' } = req.body as { summary?: string }
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }

    const r = row as Record<string, unknown>
    if (r.status !== 'in_progress') {
      return res.status(400).json({ code: 400, message: `任务状态为 ${r.status}，不在开发中`, data: null })
    }

    db.prepare("UPDATE tasks SET status = 'self_test', update_time = datetime('now', 'localtime') WHERE id = ?").run(id)
    const logContent = summary
      ? `开发完成: ${summary}`
      : `Agent 标记开发完成，等待自测`
    addDevLog(db, id, '开发完成', logContent, 'agent', false)

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    res.json({ code: 0, message: '已标记开发完成', data: mapDbRowToTask(db, updated) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * POST /api/agent/task/:id/submit
 * 提交测试 — 状态 → submitted，记录日志
 * body: { notes: string } 提交说明
 */
router.post('/task/:id/submit', (req, res) => {
  try {
    const db = getDb()
    const id = req.params.id
    const { notes = '' } = req.body as { notes?: string }
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }

    const r = row as Record<string, unknown>
    if (r.status !== 'self_test') {
      return res.status(400).json({ code: 400, message: `任务状态为 ${r.status}，需先自测完成`, data: null })
    }

    db.prepare("UPDATE tasks SET status = 'submitted', update_time = datetime('now', 'localtime') WHERE id = ?").run(id)
    const logContent = notes
      ? `提交测试: ${notes}`
      : `Agent 提交测试`
    addDevLog(db, id, '提交测试', logContent, 'agent', false)

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    res.json({ code: 0, message: '已提交测试', data: mapDbRowToTask(db, updated) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * POST /api/agent/task/:id/log
 * 添加开发日志
 * body: { action: string, content: string }
 */
router.post('/task/:id/log', (req, res) => {
  try {
    const db = getDb()
    const id = req.params.id
    const { action = '开发', content = '' } = req.body as { action?: string; content?: string }
    if (!content) {
      return res.status(400).json({ code: 400, message: '请输入记录内容', data: null })
    }

    const row = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id)
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }

    addDevLog(db, id, action, content, 'agent', false)
    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    res.json({ code: 0, message: '日志已添加', data: mapDbRowToTask(db, updated) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * POST /api/agent/sync
 * 触发内网同步（包装 tasks 路由的 sync 逻辑）
 */
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

      if (!exists) { newTasks++ }
      else if (exists.title !== task.title || exists.status !== task.status) { updatedTasks++ }
      else { unchangedTasks++ }
    }

    db.prepare(`
      INSERT INTO sync_records (id, status, total_tasks, new_tasks, updated_tasks, unchanged_tasks)
      VALUES (?, 'success', ?, ?, ?, ?)
    `).run(uuidv4(), tasks.length, newTasks, updatedTasks, unchangedTasks)

    res.json({ code: 0, message: '同步成功', data: { totalTasks: tasks.length, newTasks, updatedTasks, unchangedTasks } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * GET /api/agent/stats
 * 获取统计概览
 */
router.get('/stats', (_req, res) => {
  try {
    const db = getDb()
    const total = (db.prepare('SELECT COUNT(*) as c FROM tasks WHERE is_closed = 0').get() as { c: number }).c
    const pending = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'pending' AND is_closed = 0").get() as { c: number }).c
    const inProgress = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'in_progress' AND is_closed = 0").get() as { c: number }).c
    const urgent = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE priority = 'urgent' AND is_closed = 0").get() as { c: number }).c
    const overdue = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE deadline < date('now','localtime') AND is_closed = 0 AND status NOT IN ('completed','rejected')").get() as { c: number }).c
    const lastSync = db.prepare("SELECT value FROM sync_config WHERE key = 'lastRawData'").get() as { value: string } | undefined

    res.json({
      code: 0,
      message: 'success',
      data: {
        total,
        pending,
        inProgress,
        urgent,
        overdue,
        lastSync: lastSync ? JSON.parse(lastSync.value) : null,
      },
    })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

export default router
