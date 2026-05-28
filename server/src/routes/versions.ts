/**
 * 任务版本 API（AI 迭代版本管理）
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { getDb } from '../db/index.js'

const router = Router()

interface TaskVersion {
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

function mapRow(r: Record<string, unknown>): TaskVersion {
  return {
    id: r.id as string,
    taskId: r.task_id as string,
    versionNumber: r.version_number as string,
    iteration: r.iteration as number,
    aiOutput: (r.ai_output as string) || '',
    devLogs: JSON.parse((r.dev_logs as string) || '[]'),
    aiDurationMs: (r.ai_duration_ms as number) || 0,
    prevReviewComment: (r.prev_review_comment as string) || '',
    status: (r.status as TaskVersion['status']) || 'pending_review',
    isFinal: r.is_final === 1,
    gitCommitId: (r.git_commit_id as string) || '',
    gitCommitTime: (r.git_commit_time as string) || '',
    gitBranch: (r.git_branch as string) || '',
    createdAt: (r.created_at as string) || '',
    filesChanged: JSON.parse((r.files_changed as string) || '[]'),
    testResult: JSON.parse((r.test_result as string) || '{}'),
    summary: (r.summary as string) || '',
    screenshots: JSON.parse((r.screenshots as string) || '[]'),
    reportText: (r.report_text as string) || '',
    reportPath: (r.report_path as string) || '',
  }
}

// 获取任务的所有版本
router.get('/task/:taskId', (req, res) => {
  try {
    const db = getDb()
    // Verify task ownership
    const task = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(req.params.taskId) as { user_id: string } | undefined
    if (!task || task.user_id !== req.userId) { res.status(403).json({ code: 403, message: '无权访问', data: null }); return }
    const rows = db.prepare(
      'SELECT * FROM task_versions WHERE task_id = ? ORDER BY iteration ASC'
    ).all(req.params.taskId) as Record<string, unknown>[]
    res.json({ code: 0, message: 'success', data: rows.map(mapRow) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 创建新版本（AI 开发完成时调用）
router.post('/task/:taskId', (req, res) => {
  try {
    const db = getDb()
    const { taskId } = req.params
    const { aiOutput, devLogs, aiDurationMs, prevReviewComment } = req.body

    // Verify task ownership
    const task = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(taskId) as { user_id: string } | undefined
    if (!task || task.user_id !== req.userId) { res.status(403).json({ code: 403, message: '无权访问', data: null }); return }

    // 查当前最大 iteration
    const row = db.prepare(
      'SELECT MAX(iteration) as max_iter FROM task_versions WHERE task_id = ?'
    ).get(taskId) as { max_iter: number | null }
    const iteration = (row.max_iter ?? -1) + 1
    const major = Math.floor(iteration / 10) + 1
    const minor = iteration % 10
    const versionNumber = `V${major}.${minor}`

    // 之前的版本全部标为 archived
    db.prepare(
      "UPDATE task_versions SET status = 'archived' WHERE task_id = ? AND status = 'pending_review'"
    ).run(taskId)

    const id = uuidv4()
    db.prepare(`
      INSERT INTO task_versions (id, task_id, version_number, iteration, ai_output, dev_logs, ai_duration_ms, prev_review_comment, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review')
    `).run(
      id, taskId, versionNumber, iteration,
      aiOutput || '', JSON.stringify(devLogs || []),
      aiDurationMs || 0, prevReviewComment || ''
    )

    // 更新任务的 current version 字段
    db.prepare('UPDATE tasks SET ai_output = ?, ai_status = ? WHERE id = ?')
      .run(aiOutput || '', 'ai_review', taskId)

    const result = db.prepare('SELECT * FROM task_versions WHERE id = ?').get(id) as Record<string, unknown>
    res.json({ code: 0, message: 'success', data: mapRow(result) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 审核通过：标记为最终版本
router.post('/:id/approve', (req, res) => {
  try {
    const db = getDb()
    const version = db.prepare('SELECT * FROM task_versions WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
    if (!version) { res.status(404).json({ code: 404, message: '版本不存在', data: null }); return }

    // Verify task ownership
    const task = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(version.task_id as string) as { user_id: string } | undefined
    if (!task || task.user_id !== req.userId) { res.status(403).json({ code: 403, message: '无权访问', data: null }); return }

    db.prepare(
      "UPDATE task_versions SET status = 'approved', is_final = 1 WHERE id = ?"
    ).run(req.params.id)

    // 其他版本取消 is_final
    db.prepare(
      'UPDATE task_versions SET is_final = 0 WHERE task_id = ? AND id != ?'
    ).run(version.task_id as string, req.params.id)

    const result = db.prepare('SELECT * FROM task_versions WHERE id = ?').get(req.params.id) as Record<string, unknown>
    res.json({ code: 0, message: 'success', data: mapRow(result) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 审核打回：标记为 rejected
router.post('/:id/reject', (req, res) => {
  try {
    const db = getDb()
    const { comment } = req.body
    const version = db.prepare('SELECT * FROM task_versions WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
    if (!version) { res.status(404).json({ code: 404, message: '版本不存在', data: null }); return }

    // Verify task ownership
    const task = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(version.task_id as string) as { user_id: string } | undefined
    if (!task || task.user_id !== req.userId) { res.status(403).json({ code: 403, message: '无权访问', data: null }); return }

    db.prepare(
      "UPDATE task_versions SET status = 'rejected' WHERE id = ?"
    ).run(req.params.id)

    // 更新任务的 review 信息
    db.prepare(`
      UPDATE tasks SET ai_status = 'ai_rework', review_comment = ?, review_time = datetime('now', 'localtime'), review_result = 'rejected', rework_count = rework_count + 1
      WHERE id = ?
    `).run(comment || '', version.task_id as string)

    // 自动重新入队：把任务放回 todoList 队首（rework 优先）
    const taskRow = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(version.task_id as string) as { user_id: string } | undefined
    if (taskRow?.user_id) {
      const todoKey = `todoList_${taskRow.user_id}`
      const existing = db.prepare("SELECT value FROM sync_config WHERE key = ?").get(todoKey) as { value: string } | undefined
      let list: string[] = []
      try { list = existing ? JSON.parse(existing.value) : [] } catch { list = [] }
      const taskId = version.task_id as string
      list = list.filter(id => id !== taskId)
      list.unshift(taskId)
      db.prepare(`
        INSERT INTO sync_config (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(todoKey, JSON.stringify(list))
    }

    const result = db.prepare('SELECT * FROM task_versions WHERE id = ?').get(req.params.id) as Record<string, unknown>
    res.json({ code: 0, message: 'success', data: mapRow(result) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 下载版本的自测报告（Word 文件）— 必须在 /:id 之前注册
router.get('/:id/report', (req, res) => {
  try {
    const db = getDb()
    const row = db.prepare('SELECT report_path, task_id FROM task_versions WHERE id = ?').get(req.params.id) as { report_path: string; task_id: string } | undefined
    if (!row || !row.report_path) {
      return res.status(404).json({ code: 404, message: '报告文件不存在', data: null })
    }
    // Verify task ownership
    const task = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(row.task_id) as { user_id: string } | undefined
    if (!task || task.user_id !== req.userId) { return res.status(403).json({ code: 403, message: '无权访问', data: null }) }
    if (!fs.existsSync(row.report_path)) {
      return res.status(404).json({ code: 404, message: '报告文件已丢失', data: null })
    }
    res.download(row.report_path, path.basename(row.report_path))
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 获取单个版本详情
router.get('/:id', (req, res) => {
  try {
    const db = getDb()
    const row = db.prepare('SELECT * FROM task_versions WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
    if (!row) { res.status(404).json({ code: 404, message: '版本不存在', data: null }); return }
    // Verify task ownership
    const task = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(row.task_id as string) as { user_id: string } | undefined
    if (!task || task.user_id !== req.userId) { res.status(403).json({ code: 403, message: '无权访问', data: null }); return }
    res.json({ code: 0, message: 'success', data: mapRow(row) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

export default router
