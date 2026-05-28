/**
 * 同步 API 路由（改造版 - 适配内网扩展字段）
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { loginIntranet, checkLoginStatus, getValidCookie, type ScrapedTask } from '../scraper/intranet.js'

const router = Router()

// 获取同步配置
router.get('/config', (req, res) => {
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
router.get('/records', (req, res) => {
  try {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM sync_records WHERE user_id = ? ORDER BY sync_time DESC LIMIT 20')
    const rows = stmt.all(req.userId)

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
function upsertTask(db: ReturnType<typeof getDb>, task: ScrapedTask, userId: string): 'new' | 'updated' | 'unchanged' {
  const checkStmt = db.prepare('SELECT id, title, status, is_closed FROM tasks WHERE source_id = ? AND user_id = ?')
  const existing = checkStmt.get(task.sourceId, userId) as Record<string, unknown> | undefined

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
      WHERE source_id = ? AND is_closed = 0 AND user_id = ?
    `)
    const r = updateStmt.run(
      task.title, task.description, task.module, task.priority, task.status,
      task.deadline, task.project, task.customer, task.taskType, task.bugOrReq,
      task.workHours, task.developer, task.supervisor, task.productManager,
      task.devLeader, task.handler, task.isClosed ? 1 : 0, task.intranetNode,
      task.intranetNodeName, task.staleDays, task.rejectFlag ? 1 : 0,
      task.sourceId, userId
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
        requirement_doc, acceptance_criteria, user_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, datetime('now', 'localtime'), datetime('now', 'localtime'), ?, 1,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
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
      '', '', userId
    )
    return 'new'
  }
}

// 触发同步（复用 tasks 路由中的完整同步逻辑，含隐藏/项目关联）
router.post('/trigger', async (req, res) => {
  try {
    const { scrapTasksFromIntranet } = await import('../scraper/intranet.js')
    const tasks = await scrapTasksFromIntranet()
    const db = getDb()
    const userId = req.userId || ''

    let newTasks = 0
    let updatedTasks = 0
    let unchangedTasks = 0

    for (const task of tasks) {
      const result = upsertTask(db, task, userId)
      if (result === 'new') newTasks++
      else if (result === 'updated') updatedTasks++
      else unchangedTasks++
    }

    // 隐藏不在本次同步中的旧任务（手动创建的除外），并清除其 AI 待办状态
    if (tasks.length > 0) {
      const syncedIds = tasks.map(t => t.sourceId)
      const placeholders = syncedIds.map(() => '?').join(',')
      db.prepare(`UPDATE tasks SET is_hidden = 1, ai_status = '' WHERE source_id NOT IN (${placeholders}) AND is_hidden = 0 AND source_id NOT LIKE 'manual_%' AND user_id = ?`).run(...syncedIds, userId)
      db.prepare(`UPDATE tasks SET is_hidden = 0 WHERE source_id IN (${placeholders}) AND user_id = ?`).run(...syncedIds, userId)
    }

    // 同步后自动关联项目配置
    const configs = db.prepare("SELECT name, local_path, default_branch FROM project_configs WHERE local_path != ''").all() as { name: string; local_path: string; default_branch: string }[]
    if (configs.length > 0) {
      const updateStmt = db.prepare("UPDATE tasks SET project_path = ?, git_branch = ? WHERE project = ? AND (project_path = '' OR project_path IS NULL) AND user_id = ?")
      for (const cfg of configs) {
        updateStmt.run(cfg.local_path, cfg.default_branch, cfg.name, userId)
      }
    }

    // 记录
    const recordId = uuidv4()
    db.prepare(`
      INSERT INTO sync_records (id, status, total_tasks, new_tasks, updated_tasks, unchanged_tasks, user_id)
      VALUES (?, 'success', ?, ?, ?, ?, ?)
    `).run(recordId, tasks.length, newTasks, updatedTasks, unchangedTasks, userId)

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
    const db = getDb()
    db.prepare(`
      INSERT INTO sync_records (id, status, total_tasks, error_messages, user_id)
      VALUES (?, 'failed', 0, ?, ?)
    `).run(uuidv4(), JSON.stringify([String(err)]), req.userId)
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

// 代理内网需求文档预览（浏览器无需 cookie）
router.get('/req-doc', async (req, res) => {
  try {
    const docId = req.query.id as string
    if (!docId) {
      res.status(400).json({ code: 400, message: '缺少 id 参数', data: null })
      return
    }
    const cookie = await getValidCookie()
    const intranetUrl = `http://10.0.12.119:8868/demo/tasklist/YulanData.action?id=${docId}`
    let resp = await fetch(intranetUrl, {
      headers: { Cookie: cookie },
      redirect: 'manual',
    })

    // 302 = session 过期，强制重新登录再试一次
    if (resp.status === 302 || resp.status === 301) {
      const freshCookie = await getValidCookie(undefined, true)
      resp = await fetch(intranetUrl, {
        headers: { Cookie: freshCookie },
        redirect: 'manual',
      })
    }

    if (resp.status === 302 || resp.status === 301) {
      res.status(502).json({ code: 502, message: '内网 session 已过期且重新登录失败', data: null })
      return
    }
    if (resp.status !== 200) {
      res.status(502).json({ code: 502, message: `内网返回 ${resp.status}`, data: null })
      return
    }
    const contentType = resp.headers.get('content-type') || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    const contentLength = resp.headers.get('content-length')
    if (contentLength) res.setHeader('Content-Length', contentLength)
    const buf = Buffer.from(await resp.arrayBuffer())
    res.send(buf)
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

export default router
