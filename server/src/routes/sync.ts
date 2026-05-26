/**
 * 同步 API 路由（改造版 - 适配内网扩展字段）
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { loginIntranet, checkLoginStatus, type ScrapedTask } from '../scraper/intranet.js'

const router = Router()

// 获取同步配置
router.get('/config', (_req, res) => {
  try {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM sync_config')
    const rows = stmt.all() as { key: string; value: string }[]

    const config: Record<string, unknown> = {
      intranetUrl: '',
      autoSync: false,
      syncInterval: 30,
      lastSyncTime: '',
      loginCookie: '',
      cookieExpiry: '',
    }

    for (const row of rows) {
      try {
        config[row.key] = JSON.parse(row.value)
      } catch {
        config[row.key] = row.value
      }
    }

    res.json({ code: 0, message: 'success', data: config })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 更新同步配置
router.put('/config', (req, res) => {
  try {
    const db = getDb()
    const config = req.body

    const upsertStmt = db.prepare(`
      INSERT INTO sync_config (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(config)) {
        upsertStmt.run(key, JSON.stringify(value))
      }
    })
    transaction()

    res.json({ code: 0, message: 'success', data: config })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 获取同步记录
router.get('/records', (_req, res) => {
  try {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM sync_records ORDER BY sync_time DESC LIMIT 20')
    const rows = stmt.all()

    const records = rows.map(r => {
      const row = r as Record<string, unknown>
      return {
        id: row.id,
        syncTime: row.sync_time,
        status: row.status,
        totalTasks: row.total_tasks,
        newTasks: row.new_tasks,
        updatedTasks: row.updated_tasks,
        unchangedTasks: row.unchanged_tasks,
        errorMessages: JSON.parse(row.error_messages as string || '[]'),
      }
    })

    res.json({ code: 0, message: 'success', data: records })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * 将 ScrapedTask 写入数据库的通用逻辑
 */
function upsertTask(db: ReturnType<typeof getDb>, task: ScrapedTask): 'new' | 'updated' | 'unchanged' {
  const checkStmt = db.prepare('SELECT id, title, status, is_closed FROM tasks WHERE source_id = ?')
  const existing = checkStmt.get(task.sourceId) as Record<string, unknown> | undefined

  if (existing) {
    const updateStmt = db.prepare(`
      UPDATE tasks SET
        title = ?, description = ?, module = ?, priority = ?, status = ?,
        deadline = ?, project = ?, customer = ?, task_type = ?, bug_or_req = ?,
        work_hours = ?, developer = ?, supervisor = ?, product_manager = ?,
        dev_leader = ?, handler = ?, is_closed = ?, intranet_node = ?,
        intranet_node_name = ?, stale_days = ?, reject_flag = ?,
        update_time = datetime('now', 'localtime'),
        sync_time = datetime('now', 'localtime'), is_synced = 1
      WHERE source_id = ? AND is_closed = 0
    `)
    const r = updateStmt.run(
      task.title, task.description, task.module, task.priority, task.status,
      task.deadline, task.project, task.customer, task.taskType, task.bugOrReq,
      task.workHours, task.developer, task.supervisor, task.productManager,
      task.devLeader, task.handler, task.isClosed ? 1 : 0, task.intranetNode,
      task.intranetNodeName, task.staleDays, task.rejectFlag ? 1 : 0,
      task.sourceId
    )
    return r.changes > 0 ? 'updated' : 'unchanged'
  } else {
    const insertStmt = db.prepare(`
      INSERT INTO tasks (
        id, source_id, title, description, module, priority, status, deadline,
        create_time, update_time, sync_time, tags, is_synced,
        project, customer, task_type, bug_or_req, work_hours,
        developer, supervisor, product_manager, dev_leader, handler,
        is_closed, intranet_node, intranet_node_name, stale_days, reject_flag,
        requirement_doc, acceptance_criteria
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, datetime('now', 'localtime'), datetime('now', 'localtime'), ?, 1,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      )
    `)
    insertStmt.run(
      uuidv4(), task.sourceId, task.title, task.description, task.module, task.priority,
      task.status, task.deadline,
      task.createTime || new Date().toISOString(),
      JSON.stringify(task.tags || []),
      task.project, task.customer, task.taskType, task.bugOrReq, task.workHours,
      task.developer, task.supervisor, task.productManager, task.devLeader, task.handler,
      task.isClosed ? 1 : 0, task.intranetNode, task.intranetNodeName, task.staleDays, task.rejectFlag ? 1 : 0,
      '', ''
    )
    return 'new'
  }
}

// 触发同步
router.post('/trigger', async (_req, res) => {
  try {
    const { scrapTasksFromIntranet } = await import('../scraper/intranet.js')
    const tasks = await scrapTasksFromIntranet()
    const db = getDb()

    let newTasks = 0
    let updatedTasks = 0

    for (const task of tasks) {
      const result = upsertTask(db, task)
      if (result === 'new') newTasks++
      else if (result === 'updated') updatedTasks++
    }

    const unchangedTasks = tasks.length - newTasks - updatedTasks

    // 记录
    const recordStmt = db.prepare(`
      INSERT INTO sync_records (id, status, total_tasks, new_tasks, updated_tasks, unchanged_tasks)
      VALUES (?, 'success', ?, ?, ?, ?)
    `)
    const recordId = uuidv4()
    recordStmt.run(recordId, tasks.length, newTasks, updatedTasks, unchangedTasks)

    const record = {
      id: recordId,
      syncTime: new Date().toISOString(),
      status: 'success',
      totalTasks: tasks.length,
      newTasks,
      updatedTasks,
      unchangedTasks,
      errorMessages: [],
    }

    res.json({ code: 0, message: 'success', data: record })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 登录内网
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    const result = await loginIntranet(username, password)
    res.json({ code: 0, message: 'success', data: result })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 检查登录状态
router.get('/login-status', async (_req, res) => {
  try {
    const status = await checkLoginStatus()
    res.json({ code: 0, message: 'success', data: status })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

export default router
