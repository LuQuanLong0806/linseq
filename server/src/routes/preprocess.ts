/**
 * 预处理 Agent API 路由
 * 文档分组 / 项目匹配 / 风险评估 / 规则管理
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { matchProject, recordHistory, getDocumentGroups } from '../services/project-matcher.js'
import { assessRisk } from '../services/risk-assessor.js'
import { extractTaskDoc, extractDocGroup } from '../services/doc-extractor.js'
import { analyzeTask, batchAnalyzeTasks } from '../services/ai-analyzer.js'

const router = Router()

// ========== 文档分组（替代原有文档拆分） ==========

/** POST /api/preprocess/doc-groups - 按需求文档名聚合关联任务 */
router.post('/doc-groups', (req, res) => {
  try {
    const groups = getDocumentGroups(req.userId!)
    const multiTaskGroups = groups.filter(g => g.taskCount > 1)
    res.json({
      code: 0, message: 'success',
      data: {
        totalGroups: groups.length,
        multiTaskGroups,
        allGroups: groups,
      }
    })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 文档提取 ==========

/** POST /api/preprocess/extract-task-doc - 提取单任务文档文本 */
router.post('/extract-task-doc', async (req, res) => {
  try {
    const { taskId } = req.body
    if (!taskId) return res.status(400).json({ code: 400, message: 'taskId 必填', data: null })
    const result = await extractTaskDoc(taskId)
    res.json({ code: 0, message: 'success', data: result })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** POST /api/preprocess/extract-doc-group - 批量提取同文档组所有任务 */
router.post('/extract-doc-group', async (req, res) => {
  try {
    const { docKey } = req.body
    if (!docKey) return res.status(400).json({ code: 400, message: 'docKey 必填', data: null })
    const results = await extractDocGroup(docKey)
    res.json({ code: 0, message: 'success', data: results })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** POST /api/preprocess/split - 检测任务是否需要拆分（保留兼容） */
router.post('/split', (req, res) => {
  try {
    const { taskId } = req.body
    if (!taskId) return res.status(400).json({ code: 400, message: 'taskId 必填', data: null })

    const db = getDb()
    const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(taskId, req.userId) as Record<string, unknown> | undefined
    if (!task) return res.status(404).json({ code: 404, message: '任务不存在', data: null })

    const description = (task.description as string) || ''
    const title = (task.title as string) || ''

    // 短描述：通过 req_doc_name 查找同文档任务组
    if (description.length < 100) {
      const reqDocName = (task.req_doc_name as string) || ''
      if (reqDocName) {
        const docKey = reqDocName.replace(/^\d{10,}_/, '')
        const siblings = db.prepare(`
          SELECT id, title, req_doc_name FROM tasks
          WHERE user_id = ? AND req_doc_name != '' AND req_doc_name IS NOT NULL
        `).all(req.userId) as { id: string; title: string; req_doc_name: string }[]

        const group = siblings.filter(s => s.req_doc_name.replace(/^\d{10,}_/, '') === docKey)
        if (group.length > 1) {
          return res.json({
            code: 0, message: 'success',
            data: {
              needsSplit: false,
              isDocGroup: true,
              docKey,
              relatedTasks: group.map(g => ({ taskId: g.id, title: g.title })),
              message: `该任务属于文档「${docKey}」分组，共 ${group.length} 个关联任务`
            }
          })
        }
      }
      return res.json({ code: 0, message: '无需拆分', data: { needsSplit: false } })
    }

    // 长描述：按编号拆分
    const hasNumbering = /\n\s*(\d+[.、)）]|[一二三四五六七八九十]+[、.)])/g.test(description)
    if (!hasNumbering) {
      return res.json({ code: 0, message: '内容无编号模式，无需拆分', data: { needsSplit: false } })
    }

    const sections = description.split(/\n\s*(?=\d+[.、)）]\s)/g).filter((s: string) => s.trim())
    if (sections.length < 2) {
      return res.json({ code: 0, message: '内容不足以拆分', data: { needsSplit: false } })
    }

    const subTasks = sections.map((section: string, i: number) => {
      const lines = section.trim().split('\n')
      const firstLine = lines[0].replace(/^\d+[.、)）]\s*/, '').trim()
      const restLines = lines.slice(1).join('\n').trim()
      const subTitle = firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine
      return {
        title: subTitle || `${title} - 第${i + 1}部分`,
        description: restLines || firstLine,
        module: (task.module as string) || '',
        customer: (task.customer as string) || '',
        project: (task.project as string) || '',
        bugOrReq: (task.bug_or_req as string) || 'req',
      }
    })

    res.json({
      code: 0, message: 'success',
      data: {
        needsSplit: true,
        parentTaskId: taskId,
        subTasks,
        confidence: subTasks.length >= 2 ? 0.85 : 0.6,
        splitReason: `按编号拆分为${subTasks.length}个独立任务`
      }
    })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** POST /api/preprocess/split-confirm - 确认拆分并创建子任务 */
router.post('/split-confirm', (req, res) => {
  try {
    const { parentTaskId, subTasks } = req.body as {
      parentTaskId: string
      subTasks: { title: string; description: string; module: string; customer: string; project: string; bugOrReq: string }[]
    }
    if (!parentTaskId || !subTasks?.length) return res.status(400).json({ code: 400, message: '参数不完整', data: null })

    const db = getDb()
    const parent = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(parentTaskId, req.userId) as Record<string, unknown> | undefined
    if (!parent) return res.status(404).json({ code: 404, message: '父任务不存在', data: null })

    const insertStmt = db.prepare(`
      INSERT INTO tasks (id, source_id, title, description, module, customer, project, priority, status,
        bug_or_req, work_hours, user_id, parent_task_id, split_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agent')
    `)
    db.prepare("UPDATE tasks SET ai_status = 'split' WHERE id = ? AND user_id = ?").run(parentTaskId, req.userId)

    const created: string[] = []
    for (const sub of subTasks) {
      const id = uuidv4()
      insertStmt.run(id, `${parent.source_id}_split_${created.length}`, sub.title, sub.description, sub.module, sub.customer, sub.project, parent.priority, 'pending', sub.bugOrReq, 0, req.userId, parentTaskId)
      created.push(id)
    }

    res.json({ code: 0, message: `拆分成功，创建${created.length}个子任务`, data: { createdIds: created } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 项目匹配 ==========

/** POST /api/preprocess/match - 单任务项目匹配（AI 优先，规则兜底） */
router.post('/match', async (req, res) => {
  try {
    const { taskId } = req.body
    if (!taskId) return res.status(400).json({ code: 400, message: 'taskId 必填', data: null })

    const result = await analyzeTask(taskId, req.userId!)
    res.json({ code: 0, message: 'success', data: result })
  } catch (err) {
    if (String(err).includes('任务不存在')) return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** POST /api/preprocess/match-confirm - 确认项目关联 */
router.post('/match-confirm', (req, res) => {
  try {
    const { taskId, projectConfigId } = req.body
    if (!taskId || !projectConfigId) return res.status(400).json({ code: 400, message: '参数不完整', data: null })

    const db = getDb()
    const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(taskId, req.userId) as Record<string, unknown> | undefined
    if (!task) return res.status(404).json({ code: 404, message: '任务不存在', data: null })

    const cfg = db.prepare("SELECT * FROM project_configs WHERE id = ? AND user_id = ?").get(projectConfigId, req.userId) as Record<string, unknown> | undefined
    if (!cfg) return res.status(404).json({ code: 404, message: '项目配置不存在', data: null })

    db.prepare("UPDATE tasks SET project_path = ?, git_branch = ? WHERE id = ? AND user_id = ?")
      .run(cfg.local_path, cfg.default_branch, taskId, req.userId)

    recordHistory({
      title: (task.title as string) || '',
      module: (task.module as string) || '',
      project: (task.project as string) || '',
      customer: (task.customer as string) || '',
    }, projectConfigId, 'manual', req.userId!)

    res.json({ code: 0, message: '关联成功', data: { projectPath: cfg.local_path, gitBranch: cfg.default_branch } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 风险评估 ==========

/** POST /api/preprocess/assess-risk - 单任务风险评估（AI 优先，规则兜底） */
router.post('/assess-risk', async (req, res) => {
  try {
    const { taskId } = req.body
    if (!taskId) return res.status(400).json({ code: 400, message: 'taskId 必填', data: null })

    const result = await analyzeTask(taskId, req.userId!)
    res.json({
      code: 0, message: 'success',
      data: {
        ...result.risk,
        source: result.source,
        summary: result.summary,
        acceptanceCriteria: result.acceptanceCriteria,
        aiError: result.aiError,
      },
    })
  } catch (err) {
    if (String(err).includes('任务不存在')) return res.status(404).json({ code: 404, message: '任务不存在', data: null })
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// ========== 规则管理 ==========

/** GET /api/preprocess/rules */
router.get('/rules', (req, res) => {
  try {
    const db = getDb()
    const rules = db.prepare("SELECT * FROM project_rules WHERE user_id = ? ORDER BY priority DESC, created_at DESC").all(req.userId)
    res.json({ code: 0, message: 'success', data: rules })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** POST /api/preprocess/rules */
router.post('/rules', (req, res) => {
  try {
    const { projectConfigId, ruleType, pattern, field, priority } = req.body
    if (!projectConfigId || !ruleType || !pattern || !field) {
      return res.status(400).json({ code: 400, message: '参数不完整', data: null })
    }
    const db = getDb()
    const id = uuidv4()
    db.prepare(`INSERT INTO project_rules (id, project_config_id, rule_type, pattern, field, priority, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, projectConfigId, ruleType, pattern, field, priority || 0, req.userId)
    const row = db.prepare("SELECT * FROM project_rules WHERE id = ?").get(id)
    res.json({ code: 0, message: 'success', data: row })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** PUT /api/preprocess/rules/:id */
router.put('/rules/:id', (req, res) => {
  try {
    const { projectConfigId, ruleType, pattern, field, priority, enabled } = req.body
    const db = getDb()
    db.prepare(`UPDATE project_rules SET project_config_id = ?, rule_type = ?, pattern = ?, field = ?, priority = ?, enabled = ?
      WHERE id = ? AND user_id = ?`).run(projectConfigId, ruleType, pattern, field, priority || 0, enabled ?? 1, req.params.id, req.userId)
    const row = db.prepare("SELECT * FROM project_rules WHERE id = ?").get(req.params.id)
    res.json({ code: 0, message: 'success', data: row })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** DELETE /api/preprocess/rules/:id */
router.delete('/rules/:id', (req, res) => {
  try {
    const db = getDb()
    db.prepare("DELETE FROM project_rules WHERE id = ? AND user_id = ?").run(req.params.id, req.userId)
    res.json({ code: 0, message: 'success', data: null })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** GET /api/preprocess/history */
router.get('/history', (req, res) => {
  try {
    const db = getDb()
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const rows = db.prepare("SELECT * FROM project_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(req.userId, limit)
    res.json({ code: 0, message: 'success', data: rows })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** POST /api/preprocess/batch-analyze - 批量分析（AI 优先，规则兜底） */
router.post('/batch-analyze', async (req, res) => {
  try {
    const { taskIds } = req.body as { taskIds: string[] }
    if (!taskIds?.length) return res.status(400).json({ code: 400, message: 'taskIds 必填', data: null })

    const results = await batchAnalyzeTasks(taskIds, req.userId!)
    res.json({ code: 0, message: 'success', data: results })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

export default router
