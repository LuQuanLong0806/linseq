/**
 * 开发记录 API 路由
 */
import { Router } from 'express'
import { getDb } from '../db/index.js'
import type { DevLogEntry } from './types.js'

const router = Router()

// 获取所有开发记录（跨任务，支持分页和搜索）
router.get('/', (req, res) => {
  try {
    const db = getDb()
    const { keyword, action, taskId, page = '1', pageSize = '50' } = req.query

    let whereClause = 'WHERE 1=1'
    const params: unknown[] = []

    if (keyword) {
      whereClause += ' AND (dl.content LIKE ? OR dl.action LIKE ? OR t.title LIKE ?)'
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    }
    if (action) {
      whereClause += ' AND dl.action = ?'
      params.push(action)
    }
    if (taskId) {
      whereClause += ' AND dl.task_id = ?'
      params.push(taskId)
    }

    // 总数
    const countStmt = db.prepare(`
      SELECT COUNT(*) as total FROM dev_logs dl
      LEFT JOIN tasks t ON dl.task_id = t.id
      ${whereClause}
    `)
    const { total } = countStmt.get(...params) as { total: number }

    // 分页查询
    const offset = (Number(page) - 1) * Number(pageSize)
    const stmt = db.prepare(`
      SELECT dl.*, t.title as task_title
      FROM dev_logs dl
      LEFT JOIN tasks t ON dl.task_id = t.id
      ${whereClause}
      ORDER BY dl.time DESC
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(...params, Number(pageSize), offset)

    const list = rows.map(mapDbRowToDevLog)

    res.json({
      code: 0,
      message: 'success',
      data: { list, total, page: Number(page), pageSize: Number(pageSize), totalPages: Math.ceil(total / Number(pageSize)) },
    })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 获取某个任务的开发记录
router.get('/task/:taskId', (req, res) => {
  try {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT dl.*, t.title as task_title
      FROM dev_logs dl
      LEFT JOIN tasks t ON dl.task_id = t.id
      WHERE dl.task_id = ?
      ORDER BY dl.time DESC
    `)
    const rows = stmt.all(req.params.taskId)
    const list = rows.map(mapDbRowToDevLog)

    res.json({ code: 0, message: 'success', data: list })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 删除开发记录
router.delete('/:id', (req, res) => {
  try {
    const db = getDb()
    const stmt = db.prepare('DELETE FROM dev_logs WHERE id = ?')
    const result = stmt.run(req.params.id)

    if (result.changes === 0) {
      return res.status(404).json({ code: 404, message: '记录不存在', data: null })
    }

    res.json({ code: 0, message: 'success', data: null })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 映射数据库行到开发记录对象
function mapDbRowToDevLog(row: unknown): DevLogEntry & { taskTitle?: string } {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    taskId: r.task_id as string,
    time: r.time as string,
    action: r.action as string,
    content: r.content as string,
    author: r.author as string,
    autoFixed: Boolean(r.auto_fixed),
    taskTitle: r.task_title as string | undefined,
  }
}

export default router
