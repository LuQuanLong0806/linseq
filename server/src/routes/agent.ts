/**
 * Agent 自动化路由（v2 — QClaw 集成）
 *
 * 核心端点：
 *   GET  /api/agent/next-task           — 从待办队列取下一个任务（含完整开发上下文）
 *   POST /api/agent/task/:id/start      — 标记开始开发
 *   POST /api/agent/task/:id/log        — 上报开发日志（可多次）
 *   POST /api/agent/task/:id/complete   — 提交产出 + 自动建版本 + 移入审核
 *   GET  /api/agent/stats               — 队列统计
 *   POST /api/agent/task/:id/question   — AI 上报疑问，暂停等待人工回复
 *   POST /api/agent/sync                — 触发内网同步
 *   POST /api/agent/todo-order          — 保存待办队列排序
 *   GET  /api/agent/todo-order          — 获取待办队列排序
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { getDb } from '../db/index.js'
import { addDevLog, wakeAgent } from './tasks.js'
import { broadcastToTask } from '../websocket.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotsDir = path.resolve(__dirname, '../../data/screenshots')

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const taskId = _req.params.id
      const dir = path.join(screenshotsDir, taskId)
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png'
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
})

const router = Router()

// ========== 待办队列持久化 ==========

/** 读取 todoList */
function getTodoList(userId: string): string[] {
  const db = getDb()
  const row = db.prepare("SELECT value FROM sync_config WHERE key = ?").get(`todoList_${userId}`) as { value: string } | undefined
  if (!row) return []
  try { return JSON.parse(row.value) } catch { return [] }
}

/** 保存 todoList */
function saveTodoList(list: string[], userId: string): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO sync_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(`todoList_${userId}`, JSON.stringify(list))
}

/** 从 todoList 移除指定任务 */
function removeFromTodoList(taskId: string, userId: string): void {
  const list = getTodoList(userId).filter(id => id !== taskId)
  saveTodoList(list, userId)
}

// ========== 待办队列排序接口 ==========

router.get('/todo-order', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    res.json({ code: 0, message: 'success', data: { todoList: getTodoList(req.userId) } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

router.post('/todo-order', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const { todoList } = req.body as { todoList: string[] }
    if (!Array.isArray(todoList)) {
      return res.status(400).json({ code: 400, message: 'todoList 必须是数组', data: null })
    }
    saveTodoList(todoList, req.userId)
    res.json({ code: 0, message: 'success', data: null })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 核心接口 ==========

/**
 * GET /api/agent/next-task
 * 从待办队列取下一个任务，返回完整开发上下文
 */
router.get('/next-task', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const db = getDb()
    const todoList = getTodoList(req.userId)

    if (todoList.length === 0) {
      return res.json({ code: 0, message: '待办队列为空', data: null })
    }

    // 优先取 ai_rework 状态的
    let taskId: string | undefined
    for (const id of todoList) {
      const r = db.prepare("SELECT ai_status FROM tasks WHERE id = ? AND user_id = ?").get(id, req.userId) as { ai_status: string } | undefined
      if (r?.ai_status === 'ai_rework') { taskId = id; break }
    }
    // 没有返工任务，取第一个非 ai_question 的
    if (!taskId) {
      for (const id of todoList) {
        const r = db.prepare("SELECT ai_status FROM tasks WHERE id = ? AND user_id = ?").get(id, req.userId) as { ai_status: string } | undefined
        if (r?.ai_status !== 'ai_question') { taskId = id; break }
      }
    }
    // 全部都在疑问中，队列为空
    if (!taskId) {
      return res.json({ code: 0, message: '所有任务都在等待人工回复', data: null })
    }

    const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.userId) as Record<string, unknown> | undefined
    if (!row) {
      removeFromTodoList(taskId, req.userId)
      return res.json({ code: 0, message: '任务不存在，已从队列移除', data: null })
    }

    // 查版本信息
    const maxVer = db.prepare(
      'SELECT MAX(iteration) as max_iter FROM task_versions WHERE task_id = ?'
    ).get(taskId) as { max_iter: number | null }
    const nextIteration = (maxVer.max_iter ?? -1) + 1
    const major = Math.floor(nextIteration / 10) + 1
    const minor = nextIteration % 10
    const nextVersion = `V${major}.${minor}`

    // 如果是返工，取上一轮审核意见和变更文件
    let prevReviewComment = ''
    let prevVersion = ''
    let prevOutput = ''
    let prevFilesChanged: { path: string; action: string }[] = []
    if (row.ai_status === 'ai_rework') {
      const lastVer = db.prepare(
        "SELECT version_number, prev_review_comment, ai_output, files_changed FROM task_versions WHERE task_id = ? AND status = 'rejected' ORDER BY iteration DESC LIMIT 1"
      ).get(taskId) as { version_number: string; prev_review_comment: string; ai_output: string; files_changed: string } | undefined
      if (lastVer) {
        prevVersion = lastVer.version_number
        prevReviewComment = (row.review_comment as string) || lastVer.prev_review_comment || ''
        prevOutput = lastVer.ai_output || ''
        try { prevFilesChanged = JSON.parse(lastVer.files_changed || '[]') } catch { prevFilesChanged = [] }
      }
    }

    // 分组上下文
    let groupData: { id: string; name: string; description: string; taskCount: number; completedInGroup: number; siblingTasks: { taskId: string; title: string; aiStatus: string }[] } | null = null
    const groupId = (row.group_id as string) || ''
    if (groupId) {
      const groupRow = db.prepare('SELECT id, name, task_ids, description FROM task_groups WHERE id = ? AND user_id = ?').get(groupId, req.userId) as { id: string; name: string; task_ids: string; description: string } | undefined
      if (groupRow) {
        const groupTaskIds: string[] = JSON.parse(groupRow.task_ids || '[]')
        const siblings = groupTaskIds
          .filter(tid => tid !== taskId)
          .map(tid => {
            const t = db.prepare('SELECT id, title, ai_status FROM tasks WHERE id = ?').get(tid) as { id: string; title: string; ai_status: string } | undefined
            return t ? { taskId: t.id, title: t.title, aiStatus: t.ai_status || '' } : null
          })
          .filter((s): s is { taskId: string; title: string; aiStatus: string } => !!s)
        const completedCount = groupTaskIds.filter(tid => {
          const t = db.prepare("SELECT ai_status FROM tasks WHERE id = ? AND ai_status = 'ai_review'").get(tid)
          return !!t
        }).length
        groupData = { id: groupRow.id, name: groupRow.name, description: groupRow.description || '', taskCount: groupTaskIds.length, completedInGroup: completedCount, siblingTasks: siblings }
      }
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        taskId: row.id,
        sourceId: row.source_id,
        title: row.title,
        priority: row.priority,
        isRework: row.ai_status === 'ai_rework',
        reworkCount: row.rework_count || 0,

        requirement: {
          docText: row.req_doc_text || '',
          customDescription: row.custom_description || '',
          acceptanceCriteria: row.acceptance_criteria || '',
        },

        project: {
          path: row.project_path || '',
          gitBranch: row.git_branch || '',
        },

        review: {
          prevComment: prevReviewComment,
          prevVersion,
          prevOutput,
          prevFilesChanged,
        },

        group: groupData,

        nextVersion,
      },
    })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * POST /api/agent/task/:id/start
 * 标记开始开发
 */
router.post('/task/:id/start', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const db = getDb()
    const id = req.params.id
    const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.userId) as Record<string, unknown> | undefined
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }

    db.prepare("UPDATE tasks SET ai_status = 'ai_dev', update_time = datetime('now', 'localtime') WHERE id = ?").run(id)
    addDevLog(db, id, '开始开发', `QClaw 开始开发任务: ${(row.title as string).substring(0, 50)}`, 'agent', false)

    // 同步写入 chat_log
    const activeSession = getActiveSession(db, req.userId)
    if (activeSession) {
      // 关联任务到 session
      const taskIds = JSON.parse(activeSession.task_ids || '[]') as string[]
      if (!taskIds.includes(id)) {
        taskIds.push(id)
        db.prepare('UPDATE chat_sessions SET task_ids = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(JSON.stringify(taskIds), activeSession.id)
      }
      insertChatLog(db, req.userId, activeSession.id, 'system', 'status_change', `Agent 开始开发任务: ${(row.title as string).substring(0, 50)}`, id)
    }

    res.json({ code: 0, message: '已开始开发', data: { taskId: id, aiStatus: 'ai_dev' } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * POST /api/agent/task/:id/log
 * 上报开发日志
 */
router.post('/task/:id/log', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const db = getDb()
    const id = req.params.id
    const { action = '开发', content = '' } = req.body as { action?: string; content?: string }
    if (!content) {
      return res.status(400).json({ code: 400, message: '请输入记录内容', data: null })
    }
    const row = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }

    const logId = addDevLog(db, id, action, content, 'agent', false)
    broadcastToTask(id, 'devlog', { logId, action, content, author: 'agent' })

    // 同步写入 chat_log（关联 session）
    const activeSession = getActiveSession(db, req.userId)
    if (activeSession) {
      const chatType = mapActionToType(action)
      insertChatLog(db, req.userId, activeSession.id, 'agent', chatType, content, id)
    }
    res.json({ code: 0, message: 'success', data: { logId } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * POST /api/agent/task/:id/complete
 * QClaw 开发完成：提交产出 + 截图上传 + 自动建版本 + 生成自测报告 + 移入审核
 * 支持 multipart/form-data（截图文件）和 JSON body 两种模式
 */
router.post('/task/:id/complete', upload.array('screenshots', 10), async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const db = getDb()
    const id = req.params.id

    // 兼容 multipart 和 JSON 两种模式
    let aiOutput = '', summary = '', durationMs = 0, reportText = ''
    let filesChanged: { path: string; action: string }[] = []
    let testResult: { passed: boolean; typeCheck: boolean; details: string } = { passed: false, typeCheck: false, details: '' }

    if (req.is('multipart/form-data')) {
      const body = req.body as Record<string, string>
      aiOutput = body.aiOutput || ''
      summary = body.summary || ''
      durationMs = Number(body.durationMs) || 0
      reportText = body.reportText || ''
      try { filesChanged = JSON.parse(body.filesChanged || '[]') } catch { /* ignore */ }
      try { testResult = JSON.parse(body.testResult || '{}') } catch { /* ignore */ }
    } else {
      const body = req.body as Record<string, unknown>
      aiOutput = (body.aiOutput as string) || ''
      summary = (body.summary as string) || ''
      durationMs = (body.durationMs as number) || 0
      reportText = (body.reportText as string) || ''
      filesChanged = (body.filesChanged as { path: string; action: string }[]) || []
      testResult = (body.testResult as { passed: boolean; typeCheck: boolean; details: string }) || { passed: false, typeCheck: false, details: '' }
    }

    const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.userId) as Record<string, unknown> | undefined
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }

    // 查版本递增
    const maxVer = db.prepare(
      'SELECT MAX(iteration) as max_iter FROM task_versions WHERE task_id = ?'
    ).get(id) as { max_iter: number | null }
    const iteration = (maxVer.max_iter ?? -1) + 1
    const major = Math.floor(iteration / 10) + 1
    const minor = iteration % 10
    const versionNumber = `V${major}.${minor}`

    // 之前版本标为 archived
    db.prepare(
      "UPDATE task_versions SET status = 'archived' WHERE task_id = ? AND status = 'pending_review'"
    ).run(id)

    // 取上轮审核意见（返工场景）
    const prevComment = (row.review_comment as string) || ''

    // 获取本轮开发日志
    const devLogs = db.prepare(
      "SELECT * FROM dev_logs WHERE task_id = ? ORDER BY time ASC"
    ).all(id) as Record<string, unknown>[]

    // 截图文件名列表
    const screenshotFiles = (req.files as Express.Multer.File[] || []).map(f => f.filename)

    // 创建版本记录（含截图和报告）
    const versionId = uuidv4()
    db.prepare(`
      INSERT INTO task_versions (id, task_id, version_number, iteration, ai_output, dev_logs, ai_duration_ms, prev_review_comment, status, files_changed, test_result, summary, screenshots, report_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ?, ?)
    `).run(versionId, id, versionNumber, iteration, aiOutput, JSON.stringify(devLogs), durationMs, prevComment,
      JSON.stringify(filesChanged), JSON.stringify(testResult), summary,
      JSON.stringify(screenshotFiles), reportText)

    // 更新任务状态
    db.prepare(`
      UPDATE tasks SET ai_status = 'ai_review', ai_output = ?, update_time = datetime('now', 'localtime')
      WHERE id = ?
    `).run(aiOutput, id)

    // 从 todoList 移除
    removeFromTodoList(id, req.userId)

    addDevLog(db, id, '开发完成', summary || `完成开发，生成版本 ${versionNumber}`, 'agent', false)

    // 同步写入 chat_log（关联 session）
    const completeSession = getActiveSession(db, req.userId)
    if (completeSession) {
      insertChatLog(db, req.userId, completeSession.id, 'agent', 'completion', summary || `完成开发，生成版本 ${versionNumber}`, id, {
        versionNumber, screenshots: screenshotFiles, filesChanged,
      })
    }

    // 异步生成 Word 自测报告（不阻塞响应）
    generateDocxReport({
      sourceId: row.source_id as string,
      title: row.title as string,
      versionNumber,
      reportText: reportText || summary,
      screenshots: (req.files as Express.Multer.File[] || []),
      filesChanged,
    }).then(reportPath => {
      if (reportPath) {
        db.prepare('UPDATE task_versions SET report_path = ? WHERE id = ?').run(reportPath, versionId)
      }
    }).catch(err => console.error('[Report] 生成自测报告失败:', err))

    res.json({
      code: 0,
      message: 'success',
      data: {
        versionId,
        versionNumber,
        taskId: id,
        aiStatus: 'ai_review',
        screenshots: screenshotFiles,
      },
    })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * POST /api/agent/task/:id/question
 * AI 上报疑问，移出待办队列，AI 继续取下一个任务
 * 用户在前端回复后，任务重新入列继续开发
 */
router.post('/task/:id/question', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const db = getDb()
    const id = req.params.id
    const { question } = req.body as { question?: string }
    if (!question) {
      return res.status(400).json({ code: 400, message: '请输入疑问内容', data: null })
    }

    const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.userId) as Record<string, unknown> | undefined
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }

    db.prepare("UPDATE tasks SET ai_status = 'ai_question', ai_question = ?, update_time = datetime('now', 'localtime') WHERE id = ?").run(question, id)
    // 从 todoList 移出，让 AI 可以继续取下一个任务
    removeFromTodoList(id, req.userId)
    addDevLog(db, id, '疑问', `AI 提出疑问: ${question}`, 'agent', false)

    res.json({ code: 0, message: '已提交疑问并移至待回复列表', data: { taskId: id, aiStatus: 'ai_question' } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * POST /api/agent/sync
 * 触发内网同步
 */
router.post('/sync', async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const { scrapTasksFromIntranet } = await import('../scraper/intranet.js')
    const tasks = await scrapTasksFromIntranet()
    const db = getDb()

    let newTasks = 0, updatedTasks = 0, unchangedTasks = 0

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
        intranet_id = excluded.intranet_id, title = excluded.title, description = excluded.description,
        module = excluded.module, module_short = excluded.module_short, product = excluded.product,
        priority = excluded.priority, deadline = excluded.deadline,
        update_time = datetime('now', 'localtime'), sync_time = datetime('now', 'localtime'),
        tags = excluded.tags, is_synced = 1, project = excluded.project, customer = excluded.customer,
        customer_manager = excluded.customer_manager, task_type = excluded.task_type,
        bug_or_req = excluded.bug_or_req, work_hours = excluded.work_hours, submit_time = excluded.submit_time,
        developer = excluded.developer, supervisor = excluded.supervisor, supervisor_id = excluded.supervisor_id,
        product_manager = excluded.product_manager, dev_leader = excluded.dev_leader, handler = excluded.handler,
        is_closed = excluded.is_closed, intranet_node = excluded.intranet_node,
        intranet_node_name = excluded.intranet_node_name, stale_days = excluded.stale_days,
        flow_days = excluded.flow_days, days_since_create = excluded.days_since_create,
        reject_flag = excluded.reject_flag, version = excluded.version,
        user_id = excluded.user_id
    `)

    for (const task of tasks) {
      const taskid = uuidv4()
      const exists = db.prepare('SELECT id, title, status FROM tasks WHERE source_id = ? AND user_id = ?').get(task.sourceId, req.userId) as Record<string, unknown> | undefined

      upsertStmt.run(
        taskid, task.sourceId, task.intranetId, task.title, task.description, task.module, task.moduleShort, task.product,
        task.priority, task.status, task.deadline, task.createTime || new Date().toISOString(), task.updateTime || new Date().toISOString(), JSON.stringify(task.tags),
        task.project, task.customer, task.customerManager, task.taskType, task.bugOrReq, task.workHours, task.submitTime,
        task.developer, task.supervisor, task.supervisorId, task.productManager, task.devLeader, task.handler,
        task.department, task.departmentId, task.isClosed ? 1 : 0, task.intranetNode, task.intranetNodeName, task.nodeIndex,
        task.staleDays, task.flowDays, task.daysSinceCreate, task.rejectFlag ? 1 : 0, task.flowId, task.workId, task.version,
        req.userId
      )

      if (!exists) newTasks++
      else if (exists.title !== task.title || exists.status !== task.status) updatedTasks++
      else unchangedTasks++
    }

    // 同步后自动关联项目配置
    const configs = db.prepare("SELECT name, local_path, default_branch FROM project_configs WHERE local_path != '' AND user_id = ?").all(req.userId) as { name: string; local_path: string; default_branch: string }[]
    if (configs.length > 0) {
      const updateStmt = db.prepare("UPDATE tasks SET project_path = ?, git_branch = ? WHERE project = ? AND user_id = ? AND (project_path = '' OR project_path IS NULL)")
      for (const cfg of configs) {
        updateStmt.run(cfg.local_path, cfg.default_branch, cfg.name, req.userId)
      }
    }

    db.prepare(`
      INSERT INTO sync_records (id, status, total_tasks, new_tasks, updated_tasks, unchanged_tasks, user_id)
      VALUES (?, 'success', ?, ?, ?, ?, ?)
    `).run(uuidv4(), tasks.length, newTasks, updatedTasks, unchangedTasks, req.userId)

    res.json({ code: 0, message: '同步成功', data: { totalTasks: tasks.length, newTasks, updatedTasks, unchangedTasks } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * GET /api/agent/stats
 * 队列统计
 */
router.get('/stats', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const db = getDb()
    const todoList = getTodoList(req.userId)

    const total = (db.prepare('SELECT COUNT(*) as c FROM tasks WHERE is_closed = 0 AND user_id = ?').get(req.userId) as { c: number }).c
    const inDev = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE ai_status = 'ai_dev' AND user_id = ?").get(req.userId) as { c: number }).c
    const inReview = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE ai_status = 'ai_review' AND user_id = ?").get(req.userId) as { c: number }).c
    const rework = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE ai_status = 'ai_rework' AND user_id = ?").get(req.userId) as { c: number }).c

    // 当前正在开发的任务
    const currentTask = db.prepare("SELECT id, title, ai_status FROM tasks WHERE ai_status = 'ai_dev' AND user_id = ? LIMIT 1").get(req.userId) as { id: string; title: string; ai_status: string } | undefined

    res.json({
      code: 0,
      message: 'success',
      data: {
        todoCount: todoList.length,
        inDev,
        inReview,
        rework,
        totalTasks: total,
        currentTask: currentTask || null,
      },
    })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 自测报告生成（Word .docx） ==========

interface ReportParams {
  sourceId: string
  title: string
  versionNumber: string
  reportText: string
  screenshots: Express.Multer.File[]
  filesChanged: { path: string; action: string }[]
}

async function generateDocxReport(params: ReportParams): Promise<string | null> {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun, HeadingLevel, AlignmentType } = await import('docx')
  const db = getDb()

  // 读取报告输出目录
  const cfgRow = db.prepare("SELECT value FROM sync_config WHERE key = 'reportOutputDir'").get() as { value: string } | undefined
  const outputDir = cfgRow?.value ? JSON.parse(cfgRow.value) : 'F:\\0_workspace\\00_Agent自测报告'
  fs.mkdirSync(outputDir, { recursive: true })

  const sanitizedName = params.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 80)
  const filename = `${params.sourceId}_${sanitizedName}_${params.versionNumber}.docx`
  const filePath = path.join(outputDir, filename)

  // 构建文档内容（混合 Paragraph 和 Table）
  const children: InstanceType<typeof Paragraph | typeof Table>[] = []

  // 标题
  children.push(new Paragraph({
    text: '自测报告',
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }))

  // 任务信息表格
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: '任务单号', bold: true, size: 22 })] })] }),
          new TableCell({ width: { size: 75, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: params.sourceId, size: 22 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: '任务标题', bold: true, size: 22 })] })] }),
          new TableCell({ width: { size: 75, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: params.title, size: 22 })] })] }),
        ],
      }),
    ],
  }))

  // 开发说明
  if (params.reportText) {
    children.push(new Paragraph({ text: '', spacing: { before: 300 } }))
    children.push(new Paragraph({
      text: '开发说明',
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 100 },
    }))
    for (const line of params.reportText.split('\n')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, size: 22 })],
        spacing: { after: 60 },
      }))
    }
  }

  // 变更文件列表
  if (params.filesChanged.length > 0) {
    children.push(new Paragraph({ text: '', spacing: { before: 300 } }))
    children.push(new Paragraph({
      text: '变更文件',
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 100 },
    }))
    for (const f of params.filesChanged) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `[${f.action}] `, bold: true, size: 22 }),
          new TextRun({ text: f.path, size: 22 }),
        ],
        spacing: { after: 40 },
      }))
    }
  }

  // 页面截图
  if (params.screenshots.length > 0) {
    children.push(new Paragraph({ text: '', spacing: { before: 300 } }))
    children.push(new Paragraph({
      text: '页面截图',
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 100 },
    }))
    for (const img of params.screenshots) {
      const imgBuffer = fs.readFileSync(img.path)
      const imgExt = path.extname(img.originalname).toLowerCase()
      if (!['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(imgExt)) continue
      children.push(new Paragraph({
        children: [
          new ImageRun({
            data: imgBuffer,
            transformation: { width: 500, height: 350 },
            type: imgExt === '.png' ? 'png' : imgExt === '.gif' ? 'gif' : imgExt === '.bmp' ? 'bmp' : 'jpg',
          }),
        ],
        spacing: { after: 200 },
        alignment: AlignmentType.CENTER,
      }))
    }
  }

  const doc = new Document({
    sections: [{ children: children as InstanceType<typeof Paragraph>[] }],
  })

  const buffer = await Packer.toBuffer(doc)
  fs.writeFileSync(filePath, buffer)
  console.log(`[Report] 自测报告已生成: ${filePath}`)
  return filePath
}

// ========== 唤醒 & 对话接口 ==========

/** POST /api/agent/wake — 唤醒 Agent 执行指令 */
router.post('/wake', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const { command } = req.body as { command?: string }
    if (!command) return res.status(400).json({ code: 400, message: '缺少 command', data: null })
    const db = getDb()

    // 拼接队列上下文
    let message = command
    if (command === '开始工作' || command === '取任务' || command === '干活了') {
      const todoList = getTodoList(req.userId)
      const count = todoList.length
      message = count > 0
        ? `开始工作。队列中有 ${count} 个待办任务，请调用 GET /next-task 开始执行。`
        : '开始工作。当前队列为空，请调用 GET /next-task 确认。'
    }

    wakeAgent(db, message)
    res.json({ code: 0, message: '已发送唤醒指令', data: { command, message } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** POST /api/agent/chat — 对话模式：发送消息给 Agent */
router.post('/chat', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const { message } = req.body as { message?: string }
    if (!message?.trim()) return res.status(400).json({ code: 400, message: '消息不能为空', data: null })
    const db = getDb()

    // 保存用户消息到 agent_chat_logs
    const chatId = uuidv4()
    db.prepare(
      'INSERT INTO agent_chat_logs (id, user_id, role, content) VALUES (?, ?, ?, ?)'
    ).run(chatId, req.userId, 'user', message.trim())

    broadcastToTask('*', 'chat', { id: chatId, role: 'user', content: message.trim(), time: new Date().toISOString() })
    wakeAgent(db, message.trim())

    res.json({ code: 0, message: 'success', data: { id: chatId } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** GET /api/agent/chat — 获取对话历史 */
router.get('/chat', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const db = getDb()
    const rows = db.prepare(
      'SELECT id, role, content, created_at FROM agent_chat_logs WHERE user_id = ? ORDER BY created_at ASC LIMIT 200'
    ).all(req.userId) as { id: string; role: string; content: string; created_at: string }[]
    res.json({ code: 0, message: 'success', data: rows })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 聊天会话接口 ==========

/** 获取当前用户活跃 session，没有则返回 null */
function getActiveSession(db: ReturnType<typeof getDb>, userId: string): { id: string; title: string; task_ids: string; status: string } | null {
  return (db.prepare("SELECT id, title, task_ids, status FROM chat_sessions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(userId) as { id: string; title: string; task_ids: string; status: string } | undefined) ?? null
}

/** 将 dev_log action 映射为聊天消息 type */
function mapActionToType(action: string): string {
  if (action === '开始开发') return 'status_change'
  if (action === 'plan') return 'plan'
  if (['开发', '调试', '重构', '自测'].includes(action)) return 'progress'
  if (action === '回复') return 'text'
  if (action === '开发完成') return 'completion'
  if (action === '疑问') return 'question'
  return 'text'
}

/** 插入 chat_log 并广播 */
function insertChatLog(db: ReturnType<typeof getDb>, userId: string, sessionId: string, role: string, type: string, content: string, taskId: string = '', metadata: Record<string, unknown> = {}) {
  const chatId = uuidv4()
  db.prepare(
    'INSERT INTO agent_chat_logs (id, user_id, role, content, session_id, type, task_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(chatId, userId, role, content, sessionId, type, taskId, JSON.stringify(metadata))
  broadcastToTask('*', 'chat', {
    id: chatId, role, content, type, sessionId, taskId, metadata, time: new Date().toISOString(),
  })
  return chatId
}

/**
 * GET /api/agent/chat/context
 * 获取聊天上下文：当前 session + 统一消息流 + 统计 + 历史会话列表
 */
router.get('/chat/context', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const db = getDb()
    const sessionId = req.query.session_id as string | undefined
    const cursor = req.query.cursor as string | undefined
    const limit = Math.min(Number(req.query.limit) || 50, 100)

    // 获取或创建活跃 session
    let session = getActiveSession(db, req.userId)
    if (sessionId && sessionId !== session?.id) {
      // 查指定 session（只读）
      session = (db.prepare('SELECT id, title, task_ids, status FROM chat_sessions WHERE id = ? AND user_id = ?').get(sessionId, req.userId) as { id: string; title: string; task_ids: string; status: string } | undefined) ?? null
    }

    let messages: Record<string, unknown>[] = []
    let nextCursor = ''
    let hasMore = false

    if (session) {
      const taskIds: string[] = JSON.parse(session.task_ids || '[]')

      // 统一消息流：agent_chat_logs + dev_logs（UNION ALL）
      const cursorFilter = cursor ? " AND a.created_at < ?" : ''
      const params = cursor
        ? [session.id, ...taskIds, ...taskIds, cursor, String(limit + 1)]
        : [session.id, ...taskIds, ...taskIds, String(limit + 1)]

      // 构建 dev_logs 的 task_id 占位符
      const taskPlaceholders = taskIds.length > 0 ? taskIds.map(() => '?').join(',') : "'__none__'"

      messages = db.prepare(`
        SELECT * FROM (
          SELECT id, role, content, created_at AS time, session_id, type, task_id, metadata, 'chat' AS source
          FROM agent_chat_logs
          WHERE session_id = ?${cursorFilter}
          UNION ALL
          SELECT id,
            CASE WHEN action IN ('补充说明') THEN 'user'
                 WHEN action IN ('开始开发') THEN 'system'
                 ELSE 'agent' END AS role,
            content, time, '' AS session_id,
            CASE WHEN action = '开始开发' THEN 'status_change'
                 WHEN action = 'plan' THEN 'plan'
                 WHEN action IN ('开发','调试','重构','自测') THEN 'progress'
                 WHEN action = '回复' THEN 'text'
                 WHEN action = '开发完成' THEN 'completion'
                 WHEN action = '疑问' THEN 'question'
                 WHEN action = '补充说明' THEN 'text'
                 ELSE 'text' END AS type,
            task_id, '{}' AS metadata, 'devlog' AS source
          FROM dev_logs
          WHERE task_id IN (${taskPlaceholders})
            AND action IN ('开始开发','plan','开发','调试','重构','自测','回复','开发完成','疑问','补充说明')
            ${cursorFilter.replace(/a\./g, 'dev_logs.')}
        )
        ORDER BY time ASC
        LIMIT ?
      `).all(...params) as Record<string, unknown>[]

      if (messages.length > limit) {
        hasMore = true
        nextCursor = messages[messages.length - 1].time as string
        messages = messages.slice(0, limit)
      }
    }

    // 统计
    const todoList = getTodoList(req.userId)
    const inDev = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE ai_status = 'ai_dev' AND user_id = ?").get(req.userId) as { c: number }).c
    const inReview = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE ai_status = 'ai_review' AND user_id = ?").get(req.userId) as { c: number }).c
    const currentTask = db.prepare("SELECT id, title, ai_status FROM tasks WHERE ai_status = 'ai_dev' AND user_id = ? LIMIT 1").get(req.userId) as { id: string; title: string; ai_status: string } | undefined

    // 历史会话列表
    const sessions = db.prepare(
      "SELECT id, title, task_ids, status, created_at, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20"
    ).all(req.userId) as { id: string; title: string; task_ids: string; status: string; created_at: string; updated_at: string }[]

    res.json({
      code: 0,
      message: 'success',
      data: {
        session: session ? { id: session.id, title: session.title, taskIds: JSON.parse(session.task_ids || '[]'), status: session.status } : null,
        messages,
        stats: { todoCount: todoList.length, inDev, inReview, currentTask: currentTask || null },
        sessions: sessions.map(s => ({
          id: s.id, title: s.title, status: s.status, createdAt: s.created_at, updatedAt: s.updated_at,
          taskCount: (JSON.parse(s.task_ids || '[]') as string[]).length,
        })),
        cursor: nextCursor,
        hasMore,
      },
    })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * POST /api/agent/chat/action
 * 统一操作接口：wake / stop_session / send_message / approve / reject / redirect / answer_question / supplement
 */
router.post('/chat/action', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const db = getDb()
    const { action, sessionId: reqSessionId, taskId, message, payload } = req.body as {
      action: string; sessionId?: string; taskId?: string; message?: string; payload?: Record<string, unknown>
    }

    switch (action) {
      case 'wake': {
        // 结束之前的活跃 session
        const activeSession = getActiveSession(db, req.userId)
        if (activeSession) {
          db.prepare("UPDATE chat_sessions SET status = 'archived', updated_at = datetime('now', 'localtime') WHERE id = ?").run(activeSession.id)
        }
        // 创建新 session
        const sId = uuidv4()
        const now = new Date()
        const title = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        db.prepare('INSERT INTO chat_sessions (id, user_id, title, task_ids, status) VALUES (?, ?, ?, ?, ?)').run(sId, req.userId, title, '[]', 'active')

        // 存 user 消息
        const wakeMsg = message || '开始工作'
        insertChatLog(db, req.userId, sId, 'user', 'text', wakeMsg)

        // 唤醒 Agent
        const todoList = getTodoList(req.userId)
        const agentMsg = todoList.length > 0
          ? `开始工作。队列中有 ${todoList.length} 个待办任务，请调用 GET /next-task 开始执行。`
          : '开始工作。当前队列为空，请调用 GET /next-task 确认。'
        wakeAgent(db, agentMsg)

        res.json({ code: 0, message: '已创建新会话并唤醒 Agent', data: { sessionId: sId, title } })
        break
      }

      case 'stop_session': {
        const sId = reqSessionId || getActiveSession(db, req.userId)?.id
        if (!sId) return res.status(400).json({ code: 400, message: '无活跃会话', data: null })
        db.prepare("UPDATE chat_sessions SET status = 'archived', updated_at = datetime('now', 'localtime') WHERE id = ? AND user_id = ?").run(sId, req.userId)
        insertChatLog(db, req.userId, sId, 'system', 'status_change', '用户停止了工作会话')
        res.json({ code: 0, message: '会话已结束', data: { sessionId: sId } })
        break
      }

      case 'send_message': {
        if (!message?.trim()) return res.status(400).json({ code: 400, message: '消息不能为空', data: null })
        const active = getActiveSession(db, req.userId)
        const sId = active?.id || ''
        insertChatLog(db, req.userId, sId, 'user', 'text', message.trim(), taskId || '')

        // 先存补充说明（确保 resolve 时能查到未读消息）
        if (taskId) {
          db.prepare('INSERT INTO task_supplements (id, task_id, content) VALUES (?, ?, ?)').run(uuidv4(), taskId, message.trim())
          addDevLog(db, taskId, '补充说明', message.trim(), 'user', false)
        }

        // 解析 pending /report（带 taskId 或找当前用户任意 pending 的）
        if (taskId) {
          resolvePendingReport(taskId, { action: 'redirect', instruction: message.trim() })
        } else {
          // 没有 taskId 时，检查是否有该用户的 pending report，作为 redirect 解析
          for (const [, pending] of pendingReports) {
            if (pending.userId === req.userId) {
              resolvePendingReport(pending.taskId, { action: 'redirect', instruction: message.trim() })
              break
            }
          }
        }

        // 补充说明已在上面存储
        wakeAgent(db, message.trim())
        res.json({ code: 0, message: 'success', data: null })
        break
      }

      case 'approve': {
        if (!taskId) return res.status(400).json({ code: 400, message: '缺少 taskId', data: null })
        const active = getActiveSession(db, req.userId)
        const sId = active?.id || ''

        // 检查是否有 pending_review 的版本（区分计划审批 vs 完成审批）
        const version = db.prepare(
          "SELECT id, version_number FROM task_versions WHERE task_id = ? AND status = 'pending_review' ORDER BY iteration DESC LIMIT 1"
        ).get(taskId) as { id: string; version_number: string } | undefined

        const comment = (payload?.comment as string) || '批准'

        if (version) {
          // 完成审批：批准版本 + 标记任务完成
          db.prepare("UPDATE task_versions SET status = 'approved', is_final = 1 WHERE id = ?").run(version.id)
          db.prepare("UPDATE tasks SET ai_status = 'ai_done', review_result = 'approved', review_time = datetime('now', 'localtime'), update_time = datetime('now', 'localtime') WHERE id = ?").run(taskId)
          insertChatLog(db, req.userId, sId, 'system', 'approval', `已批准任务 — ${comment}`, taskId, { versionNumber: version.version_number, result: 'approved' })
          wakeAgent(db, `任务 ${taskId} 已批准。请调用 GET /next-task 继续执行下一个任务。`)
        } else {
          // 计划审批：只解析 pending /report，不改变任务状态
          insertChatLog(db, req.userId, sId, 'system', 'approval', `已批准计划 — ${comment}`, taskId, { result: 'plan_approved' })
        }

        // 解析 pending /report（如果 Agent 正在等待）
        resolvePendingReport(taskId, { action: 'continue', instruction: '' })

        res.json({ code: 0, message: '已批准', data: { taskId, versionNumber: version?.version_number } })
        break
      }

      case 'reject': {
        if (!taskId) return res.status(400).json({ code: 400, message: '缺少 taskId', data: null })
        const active = getActiveSession(db, req.userId)
        const sId = active?.id || ''

        const version = db.prepare(
          "SELECT id, version_number FROM task_versions WHERE task_id = ? AND status = 'pending_review' ORDER BY iteration DESC LIMIT 1"
        ).get(taskId) as { id: string; version_number: string } | undefined
        if (version) {
          db.prepare("UPDATE task_versions SET status = 'rejected' WHERE id = ?").run(version.id)
        }
        const comment = (payload?.comment as string) || ''
        db.prepare("UPDATE tasks SET ai_status = 'ai_rework', review_comment = ?, review_result = 'rejected', review_time = datetime('now', 'localtime'), update_time = datetime('now', 'localtime') WHERE id = ?").run(comment, taskId)

        // 重新加入待办队列（头部插入）
        const todoList = getTodoList(req.userId)
        if (!todoList.includes(taskId)) {
          todoList.unshift(taskId)
          saveTodoList(todoList, req.userId)
        }

        insertChatLog(db, req.userId, sId, 'system', 'approval', `已拒绝任务，需要返工 — ${comment}`, taskId, { versionNumber: version?.version_number, result: 'rejected' })

        // 解析 pending /report（如果 Agent 正在等待）
        resolvePendingReport(taskId, { action: 'abort', instruction: comment || '任务被拒绝，需要返工' })

        wakeAgent(db, `任务 ${taskId} 被拒绝，原因: ${comment}。请调用 GET /next-task 重新开发。`)
        res.json({ code: 0, message: '已拒绝，任务将返工', data: { taskId } })
        break
      }

      case 'redirect': {
        if (!taskId) return res.status(400).json({ code: 400, message: '缺少 taskId', data: null })
        const active = getActiveSession(db, req.userId)
        const sId = active?.id || ''
        const redirectMsg = message || (payload?.instruction as string) || '请调整方向'
        insertChatLog(db, req.userId, sId, 'user', 'text', redirectMsg, taskId)

        // 先存补充说明（确保 resolve 时能查到未读消息）
        db.prepare('INSERT INTO task_supplements (id, task_id, content) VALUES (?, ?, ?)').run(uuidv4(), taskId, redirectMsg)
        addDevLog(db, taskId, '补充说明', redirectMsg, 'user', false)

        // 解析 pending /report（如果 Agent 正在等待）
        resolvePendingReport(taskId, { action: 'redirect', instruction: redirectMsg })

        wakeAgent(db, redirectMsg)
        res.json({ code: 0, message: '已发送调整指令', data: null })
        break
      }

      case 'answer_question': {
        if (!taskId) return res.status(400).json({ code: 400, message: '缺少 taskId', data: null })
        if (!message?.trim()) return res.status(400).json({ code: 400, message: '回答不能为空', data: null })
        const active = getActiveSession(db, req.userId)
        const sId = active?.id || ''

        // 清除疑问状态，重新入队
        db.prepare("UPDATE tasks SET ai_status = 'ai_todo', ai_question = '', update_time = datetime('now', 'localtime') WHERE id = ?").run(taskId)
        const todoList = getTodoList(req.userId)
        if (!todoList.includes(taskId)) {
          todoList.unshift(taskId)
          saveTodoList(todoList, req.userId)
        }

        insertChatLog(db, req.userId, sId, 'user', 'text', message.trim(), taskId)
        addDevLog(db, taskId, '回复', message.trim(), 'user', false)
        wakeAgent(db, `用户回答了问题: ${message.trim()}。请调用 GET /next-task 继续执行。`)
        res.json({ code: 0, message: '已回答，任务重新入队', data: { taskId } })
        break
      }

      case 'supplement': {
        if (!taskId) return res.status(400).json({ code: 400, message: '缺少 taskId', data: null })
        if (!message?.trim()) return res.status(400).json({ code: 400, message: '补充说明不能为空', data: null })
        const active = getActiveSession(db, req.userId)
        const sId = active?.id || ''

        db.prepare('INSERT INTO task_supplements (id, task_id, content) VALUES (?, ?, ?)').run(uuidv4(), taskId, message.trim())
        addDevLog(db, taskId, '补充说明', message.trim(), 'user', false)
        insertChatLog(db, req.userId, sId, 'user', 'text', message.trim(), taskId)

        // 解析 pending /report
        resolvePendingReport(taskId, { action: 'redirect', instruction: message.trim() })

        broadcastToTask(taskId, 'supplement', { taskId, content: message.trim() })
        wakeAgent(db, `[补充说明] 任务 ${taskId}: ${message.trim()}`)
        res.json({ code: 0, message: '已发送补充说明', data: null })
        break
      }

      case 'cancel_task': {
        if (!taskId) return res.status(400).json({ code: 400, message: '缺少 taskId', data: null })
        const cancelTask = db.prepare('SELECT id, ai_status FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.userId) as { id: string; ai_status: string } | undefined
        if (!cancelTask) return res.status(404).json({ code: 404, message: '任务不存在', data: null })
        if (cancelTask.ai_status !== 'ai_dev') return res.status(400).json({ code: 400, message: '只能终止开发中的任务', data: null })

        const active = getActiveSession(db, req.userId)
        const sId = active?.id || ''
        const cancelReason = message || '人工终止任务'

        // 解析 pending /report（如果 Agent 正在等待）
        resolvePendingReport(taskId, { action: 'abort', instruction: `任务已被人工终止：${cancelReason}` })

        // 更新任务状态为 ai_cancelled
        db.prepare("UPDATE tasks SET ai_status = 'ai_cancelled', update_time = datetime('now', 'localtime') WHERE id = ?").run(taskId)
        removeFromTodoList(taskId, req.userId)
        addDevLog(db, taskId, '终止', `任务被人工终止：${cancelReason}`, 'system', false)
        insertChatLog(db, req.userId, sId, 'system', 'status_change', `⛔ 任务已终止 — ${cancelReason}`, taskId, { result: 'cancelled' })

        // 唤醒 Agent 取下一个任务
        wakeAgent(db, `任务 ${taskId} 已被人工终止。请调用 GET /next-task 继续执行下一个任务。`)
        res.json({ code: 0, message: '任务已终止', data: { taskId } })
        break
      }

      case 'typing': {
        // 输入中状态心跳
        if (taskId) setTyping(taskId, true)
        res.json({ code: 0, message: 'success', data: null })
        break
      }

      case 'typing_stop': {
        // 停止输入
        if (taskId) setTyping(taskId, false)
        res.json({ code: 0, message: 'success', data: null })
        break
      }

      default:
        res.status(400).json({ code: 400, message: `未知操作: ${action}`, data: null })
    }
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/**
 * GET /api/agent/chat/sessions
 * 获取历史会话列表（分页）
 */
router.get('/chat/sessions', (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const db = getDb()
    const page = Math.max(Number(req.query.page) || 1, 1)
    const pageSize = Math.min(Number(req.query.pageSize) || 20, 50)
    const offset = (page - 1) * pageSize

    const total = (db.prepare('SELECT COUNT(*) as c FROM chat_sessions WHERE user_id = ?').get(req.userId) as { c: number }).c
    const sessions = db.prepare(
      'SELECT id, title, task_ids, status, created_at, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(req.userId, pageSize, offset) as { id: string; title: string; task_ids: string; status: string; created_at: string; updated_at: string }[]

    // 每条 session 取最后一条消息作摘要
    const result = sessions.map(s => {
      const taskIds = JSON.parse(s.task_ids || '[]') as string[]
      const lastMsg = db.prepare(
        'SELECT content FROM agent_chat_logs WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
      ).get(s.id) as { content: string } | undefined
      // 统计完成的任务数
      let completedCount = 0
      if (taskIds.length > 0) {
        completedCount = (db.prepare(
          `SELECT COUNT(*) as c FROM tasks WHERE id IN (${taskIds.map(() => '?').join(',')}) AND ai_status IN ('ai_done', 'ai_review')`
        ).get(...taskIds) as { c: number }).c
      }
      return {
        id: s.id,
        title: s.title,
        status: s.status,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        taskCount: taskIds.length,
        completedCount,
        lastMessage: lastMsg?.content?.substring(0, 60) || '',
      }
    })

    res.json({
      code: 0,
      message: 'success',
      data: { sessions: result, total, page, pageSize },
    })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== ATEP 同步阻塞上报接口 ==========

/** 解析 pending /report 请求，合并所有未读补充说明一并返回 */
function resolvePendingReport(taskId: string, baseResult: { action: string; instruction: string }) {
  const pending = pendingReports.get(taskId)
  if (pending) {
    if (pending.timer) clearTimeout(pending.timer)
    pendingReports.delete(taskId)

    // 查询该任务所有未读补充说明
    const db = getDb()
    const unreadSupplements = db.prepare(
      'SELECT id, content, created_at FROM task_supplements WHERE task_id = ? AND read_by_agent = 0 ORDER BY created_at ASC'
    ).all(taskId) as { id: string; content: string; created_at: string }[]

    // 标记为已读 + 清理输入中状态
    if (unreadSupplements.length > 0) {
      db.prepare('UPDATE task_supplements SET read_by_agent = 1 WHERE task_id = ? AND read_by_agent = 0').run(taskId)
    }
    typingState.delete(taskId)

    // 合并：baseResult.instruction + 所有未读补充说明
    const allMessages: { id: string; content: string; time: string }[] = []
    if (baseResult.instruction) {
      allMessages.push({ id: '', content: baseResult.instruction, time: '' })
    }
    for (const s of unreadSupplements) {
      allMessages.push({ id: s.id, content: s.content, time: s.created_at })
    }

    const mergedInstruction = allMessages.map(m => m.content).join('\n')
    pending.resolve({
      action: baseResult.action,
      instruction: mergedInstruction,
      messages: allMessages,
      attachments: [],
    })
  }
}

/** 待处理的 /report 请求（taskId → resolve 函数） */
interface ReportResult {
  action: string
  instruction: string
  messages?: { id: string; content: string; time: string }[]
  attachments?: { type: string; url: string; name: string }[]
}

interface PendingReport {
  resolve: (result: ReportResult) => void
  timer: ReturnType<typeof setTimeout> | null
  taskId: string
  userId: string
  level: string
  reportAction: string
  createdAt: number
}
const pendingReports = new Map<string, PendingReport>()

/** 人类输入中状态：taskId → { isTyping, lastTypingAt, extensions } */
const typingState = new Map<string, { isTyping: boolean; lastTypingAt: number; extensions: number }>()
const TYPING_EXTEND_MS = 15_000   // 每次输入心跳延长 15 秒
const TYPING_MAX_EXTEND = 300_000  // 最多累计延长 5 分钟

/** 标记输入中状态 */
function setTyping(taskId: string, typing: boolean) {
  if (typing) {
    typingState.set(taskId, {
      isTyping: true,
      lastTypingAt: Date.now(),
      extensions: (typingState.get(taskId)?.extensions ?? 0) + 1,
    })
  } else {
    typingState.delete(taskId)
  }
}

/** 检查是否正在输入 */
function isUserTyping(taskId: string): boolean {
  const s = typingState.get(taskId)
  if (!s) return false
  // 超过 10 秒没收到心跳视为停止输入
  if (Date.now() - s.lastTypingAt > 10_000) {
    typingState.delete(taskId)
    return false
  }
  return s.isTyping
}

/** ATEP 超时配置（毫秒），L4 超时后跳过任务并转为 ai_question */
const ATEP_TIMEOUTS: Record<string, number> = {
  L1: 0,        // 立即返回
  L2: 10_000,   // 10 秒
  L3: 30_000,   // 30 秒
  L4: 120_000,  // 2 分钟，超时后跳过任务
}

/** completion 独立超时：1 分钟（不受 L2/L3 影响） */
const COMPLETION_TIMEOUT = 60_000

/**
 * POST /api/agent/task/:id/report
 * ATEP 同步阻塞上报：一次调用完成 — 上报内容 + 更新任务状态 + 推送前端 + 阻塞等待人类响应
 *
 * 请求体:
 *   action:    "plan" | "progress" | "completion" | "question"
 *   content:   上报内容（计划/进度/完成报告/疑问）
 *   level:     "L1" | "L2" | "L3" | "L4"（action=plan/completion 时必填）
 *   aiStatus:  可选，同时更新任务状态：ai_dev | ai_review | ai_question
 *   metadata:  可选，附加信息（filesChanged, testResult, screenshots 等）
 */
router.post('/task/:id/report', async (req, res) => {
  const id = req.params.id
  try {
    if (!req.userId) return res.status(401).json({ code: 401, message: '未登录', data: null })
    const db = getDb()
    const {
      action: reportAction,
      content,
      level,
      aiStatus,
      metadata: reqMetadata,
    } = req.body as {
      action?: string; content?: string; level?: string; aiStatus?: string; metadata?: Record<string, unknown>
    }

    if (!reportAction || !content) {
      return res.status(400).json({ code: 400, message: '缺少 action 或 content', data: null })
    }

    const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.userId) as Record<string, unknown> | undefined
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }

    const reportLevel = (level || 'L2').toUpperCase()
    // completion 使用独立超时（1 分钟），plan 使用 ATEP 等级超时
    const timeout = reportAction === 'completion' ? COMPLETION_TIMEOUT : (ATEP_TIMEOUTS[reportLevel] ?? 10_000)
    const mergedMetadata: Record<string, unknown> = { level: reportLevel, ...reqMetadata }

    // ===== 1. 更新任务状态 =====
    // question action 自动更新为 ai_question
    const effectiveAiStatus = reportAction === 'question' ? 'ai_question' : aiStatus
    if (effectiveAiStatus) {
      switch (effectiveAiStatus) {
        case 'ai_dev':
          db.prepare("UPDATE tasks SET ai_status = 'ai_dev', update_time = datetime('now', 'localtime') WHERE id = ?").run(id)
          break
        case 'ai_review':
          db.prepare("UPDATE tasks SET ai_status = 'ai_review', update_time = datetime('now', 'localtime') WHERE id = ?").run(id)
          break
        case 'ai_question':
          db.prepare("UPDATE tasks SET ai_status = 'ai_question', ai_question = ?, update_time = datetime('now', 'localtime') WHERE id = ?").run(content, id)
          removeFromTodoList(id, req.userId!)
          break
      }
    }

    // ===== 2. 写入 dev_log =====
    const logAction = reportAction === 'plan' ? 'plan'
      : reportAction === 'progress' ? '开发'
      : reportAction === 'completion' ? '开发完成'
      : reportAction === 'question' ? '疑问'
      : reportAction
    addDevLog(db, id, logAction, content, 'agent', false)

    // ===== 3. 写入 chat_log + 推送前端 =====
    const chatType = reportAction === 'plan' ? 'plan'
      : reportAction === 'progress' ? 'progress'
      : reportAction === 'completion' ? 'completion'
      : reportAction === 'question' ? 'question'
      : 'text'
    const activeSession = getActiveSession(db, req.userId)
    if (activeSession) {
      // 确保任务关联到 session
      const taskIds = JSON.parse(activeSession.task_ids || '[]') as string[]
      if (!taskIds.includes(id)) {
        taskIds.push(id)
        db.prepare('UPDATE chat_sessions SET task_ids = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(JSON.stringify(taskIds), activeSession.id)
      }
      insertChatLog(db, req.userId, activeSession.id, 'agent', chatType, content, id, mergedMetadata)
      // 状态变更额外推送一条系统消息
      if (effectiveAiStatus) {
        const statusText = effectiveAiStatus === 'ai_dev' ? 'Agent 开始开发'
          : effectiveAiStatus === 'ai_review' ? 'Agent 提交审核'
          : aiStatus === 'ai_question' ? 'Agent 提出疑问'
          : ''
        if (statusText) {
          insertChatLog(db, req.userId, activeSession.id, 'system', 'status_change', statusText, id)
        }
      }
    } else {
      broadcastToTask('*', 'chat', {
        id: uuidv4(), role: 'agent', content, type: chatType, taskId: id, metadata: mergedMetadata, time: new Date().toISOString(),
      })
    }

    // ===== 4. question 立即返回 abort，任务已标记为 ai_question =====
    if (reportAction === 'question') {
      return res.json({ code: 0, message: 'success', data: { action: 'abort', instruction: '任务已转为疑问状态，等待人工回复', messages: [], attachments: [] } })
    }

    // ===== 5. L1 或 progress：立即返回 continue =====
    if (reportAction === 'progress' || timeout === 0) {
      return res.json({ code: 0, message: 'success', data: { action: 'continue', instruction: '', messages: [], attachments: [] } })
    }

    // ===== 6. L2/L3/L4 plan/completion：阻塞等待人类响应 =====
    await new Promise<ReportResult>((resolve) => {
      // 清理该任务之前的 pending report
      const existing = pendingReports.get(id)
      if (existing) {
        if (existing.timer) clearTimeout(existing.timer)
        existing.resolve({ action: 'continue', instruction: '', messages: [], attachments: [] })
        pendingReports.delete(id)
      }

      const entry: PendingReport = {
        resolve,
        timer: null,
        taskId: id,
        userId: req.userId!,
        level: reportLevel,
        reportAction,
        createdAt: Date.now(),
      }

      // 设置超时（支持输入中状态延时）
      function fireTimeout() {
        pendingReports.delete(id)
        typingState.delete(id)
        if (reportLevel === 'L4' && reportAction !== 'completion') {
          const questionContent = `[ATEP 超时] Agent 上报了关键操作（L4），等待 2 分钟无人类响应，任务已暂停。原始内容: ${(content || '').substring(0, 100)}`
          db.prepare("UPDATE tasks SET ai_status = 'ai_question', ai_question = ?, update_time = datetime('now', 'localtime') WHERE id = ?").run(questionContent, id)
          removeFromTodoList(id, req.userId!)
          addDevLog(db, id, '疑问', questionContent, 'system', false)
          if (activeSession) {
            insertChatLog(db, req.userId!, activeSession.id, 'system', 'status_change', `⚠️ L4 上报超时（2 分钟无人响应），任务已暂停等待人工处理`, id)
          }
          resolve({ action: 'abort', instruction: 'L4 超时，任务已暂停等待人工处理', messages: [], attachments: [] })
        } else {
          resolve({ action: 'continue', instruction: '', messages: [], attachments: [] })
        }
      }

      function scheduleTimeout() {
        entry.timer = setTimeout(() => {
          // 超时前检查：人类是否正在输入
          if (isUserTyping(id)) {
            const state = typingState.get(id)
            const totalExtended = (state?.extensions ?? 0) * TYPING_EXTEND_MS
            if (totalExtended < TYPING_MAX_EXTEND) {
              // 人类还在输入，延长等待
              entry.timer = setTimeout(scheduleTimeout, TYPING_EXTEND_MS)
              return
            }
          }
          fireTimeout()
        }, timeout)
      }
      scheduleTimeout()

      pendingReports.set(id, entry)
    }).then((result) => {
      res.json({ code: 0, message: 'success', data: result })
    })
  } catch (err) {
    const pending = pendingReports.get(id)
    if (pending) {
      if (pending.timer) clearTimeout(pending.timer)
      pendingReports.delete(id)
    }
    if (!res.headersSent) {
      res.status(500).json({ code: 500, message: String(err), data: null })
    }
  }
})

// ========== 补充说明接口 ==========

// Agent 获取未读补充说明
router.get('/task/:id/supplements', (req, res) => {
  try {
    const db = getDb()
    const { id } = req.params
    const task = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(id) as { user_id: string } | undefined
    if (!task || task.user_id !== req.userId) {
      return res.status(403).json({ code: 403, message: '无权访问', data: null })
    }
    // 只返回未读的补充说明
    const rows = db.prepare(
      'SELECT id, content, created_at FROM task_supplements WHERE task_id = ? AND read_by_agent = 0 ORDER BY created_at ASC'
    ).all(id) as { id: string; content: string; created_at: string }[]

    // 自动标记为已读
    if (rows.length > 0) {
      db.prepare('UPDATE task_supplements SET read_by_agent = 1 WHERE task_id = ? AND read_by_agent = 0').run(id)
    }

    res.json({ code: 0, message: 'success', data: rows })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

export default router
