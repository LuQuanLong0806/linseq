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
import { mapDbRowToTask, addDevLog } from './tasks.js'

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
function getTodoList(): string[] {
  const db = getDb()
  const row = db.prepare("SELECT value FROM sync_config WHERE key = 'todoList'").get() as { value: string } | undefined
  if (!row) return []
  try { return JSON.parse(row.value) } catch { return [] }
}

/** 保存 todoList */
function saveTodoList(list: string[]): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO sync_config (key, value) VALUES ('todoList', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(list))
}

/** 从 todoList 移除指定任务 */
function removeFromTodoList(taskId: string): void {
  const list = getTodoList().filter(id => id !== taskId)
  saveTodoList(list)
}

// ========== 待办队列排序接口 ==========

router.get('/todo-order', (_req, res) => {
  try {
    res.json({ code: 0, message: 'success', data: { todoList: getTodoList() } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

router.post('/todo-order', (req, res) => {
  try {
    const { todoList } = req.body as { todoList: string[] }
    if (!Array.isArray(todoList)) {
      return res.status(400).json({ code: 400, message: 'todoList 必须是数组', data: null })
    }
    saveTodoList(todoList)
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
router.get('/next-task', (_req, res) => {
  try {
    const db = getDb()
    const todoList = getTodoList()

    if (todoList.length === 0) {
      return res.json({ code: 0, message: '待办队列为空', data: null })
    }

    // 优先取 ai_rework 状态的
    let taskId: string | undefined
    for (const id of todoList) {
      const r = db.prepare("SELECT ai_status FROM tasks WHERE id = ?").get(id) as { ai_status: string } | undefined
      if (r?.ai_status === 'ai_rework') { taskId = id; break }
    }
    // 没有返工任务，取第一个非 ai_question 的
    if (!taskId) {
      for (const id of todoList) {
        const r = db.prepare("SELECT ai_status FROM tasks WHERE id = ?").get(id) as { ai_status: string } | undefined
        if (r?.ai_status !== 'ai_question') { taskId = id; break }
      }
    }
    // 全部都在疑问中，队列为空
    if (!taskId) {
      return res.json({ code: 0, message: '所有任务都在等待人工回复', data: null })
    }

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined
    if (!row) {
      removeFromTodoList(taskId)
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

    // 如果是返工，取上一轮审核意见
    let prevReviewComment = ''
    let prevVersion = ''
    let prevOutput = ''
    if (row.ai_status === 'ai_rework') {
      const lastVer = db.prepare(
        "SELECT version_number, prev_review_comment, ai_output FROM task_versions WHERE task_id = ? AND status = 'rejected' ORDER BY iteration DESC LIMIT 1"
      ).get(taskId) as { version_number: string; prev_review_comment: string; ai_output: string } | undefined
      if (lastVer) {
        prevVersion = lastVer.version_number
        prevReviewComment = (row.review_comment as string) || lastVer.prev_review_comment || ''
        prevOutput = lastVer.ai_output || ''
      }
    }

    // 分组上下文
    let groupData: { id: string; name: string; description: string; taskCount: number; completedInGroup: number; siblingTasks: { taskId: string; title: string; aiStatus: string }[] } | null = null
    const groupId = (row.group_id as string) || ''
    if (groupId) {
      const groupRow = db.prepare('SELECT id, name, task_ids, description FROM task_groups WHERE id = ?').get(groupId) as { id: string; name: string; task_ids: string; description: string } | undefined
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
    const db = getDb()
    const id = req.params.id
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }

    db.prepare("UPDATE tasks SET ai_status = 'ai_dev', update_time = datetime('now', 'localtime') WHERE id = ?").run(id)
    addDevLog(db, id, '开始开发', `QClaw 开始开发任务: ${(row.title as string).substring(0, 50)}`, 'agent', false)

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

    const logId = addDevLog(db, id, action, content, 'agent', false)
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

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
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
    removeFromTodoList(id)

    addDevLog(db, id, '开发完成', summary || `完成开发，生成版本 ${versionNumber}`, 'agent', false)

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
    const db = getDb()
    const id = req.params.id
    const { question } = req.body as { question?: string }
    if (!question) {
      return res.status(400).json({ code: 400, message: '请输入疑问内容', data: null })
    }

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) {
      return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    }

    db.prepare("UPDATE tasks SET ai_status = 'ai_question', ai_question = ?, update_time = datetime('now', 'localtime') WHERE id = ?").run(question, id)
    // 从 todoList 移出，让 AI 可以继续取下一个任务
    removeFromTodoList(id)
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
router.post('/sync', async (_req, res) => {
  try {
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
        reject_flag = excluded.reject_flag, version = excluded.version
    `)

    for (const task of tasks) {
      const taskid = uuidv4()
      const exists = db.prepare('SELECT id, title, status FROM tasks WHERE source_id = ?').get(task.sourceId) as Record<string, unknown> | undefined

      upsertStmt.run(
        taskid, task.sourceId, task.intranetId, task.title, task.description, task.module, task.moduleShort, task.product,
        task.priority, task.status, task.deadline, task.createTime || new Date().toISOString(), task.updateTime || new Date().toISOString(), JSON.stringify(task.tags),
        task.project, task.customer, task.customerManager, task.taskType, task.bugOrReq, task.workHours, task.submitTime,
        task.developer, task.supervisor, task.supervisorId, task.productManager, task.devLeader, task.handler,
        task.department, task.departmentId, task.isClosed ? 1 : 0, task.intranetNode, task.intranetNodeName, task.nodeIndex,
        task.staleDays, task.flowDays, task.daysSinceCreate, task.rejectFlag ? 1 : 0, task.flowId, task.workId, task.version
      )

      if (!exists) newTasks++
      else if (exists.title !== task.title || exists.status !== task.status) updatedTasks++
      else unchangedTasks++
    }

    // 同步后自动关联项目配置
    const configs = db.prepare("SELECT name, local_path, default_branch FROM project_configs WHERE local_path != ''").all() as { name: string; local_path: string; default_branch: string }[]
    if (configs.length > 0) {
      const updateStmt = db.prepare("UPDATE tasks SET project_path = ?, git_branch = ? WHERE project = ? AND (project_path = '' OR project_path IS NULL)")
      for (const cfg of configs) {
        updateStmt.run(cfg.local_path, cfg.default_branch, cfg.name)
      }
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
 * 队列统计
 */
router.get('/stats', (_req, res) => {
  try {
    const db = getDb()
    const todoList = getTodoList()

    const total = (db.prepare('SELECT COUNT(*) as c FROM tasks WHERE is_closed = 0').get() as { c: number }).c
    const inDev = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE ai_status = 'ai_dev'").get() as { c: number }).c
    const inReview = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE ai_status = 'ai_review'").get() as { c: number }).c
    const rework = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE ai_status = 'ai_rework'").get() as { c: number }).c

    // 当前正在开发的任务
    const currentTask = db.prepare("SELECT id, title, ai_status FROM tasks WHERE ai_status = 'ai_dev' LIMIT 1").get() as { id: string; title: string; ai_status: string } | undefined

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

export default router
