/**
 * 任务分组 API 路由（v2 — 分组补充说明 + 任务排序）
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'

const router = Router()

interface TaskGroup {
  id: string
  name: string
  taskIds: string[]
  description: string
  createdAt: string
}

function mapRow(r: Record<string, unknown>): TaskGroup {
  return {
    id: r.id as string,
    name: r.name as string,
    taskIds: JSON.parse((r.task_ids as string) || '[]'),
    description: (r.description as string) || '',
    createdAt: (r.created_at as string) || '',
  }
}

// 获取所有分组
router.get('/', (req, res) => {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM task_groups WHERE user_id = ? ORDER BY created_at DESC').all(req.userId) as Record<string, unknown>[]
    res.json({ code: 0, message: 'success', data: rows.map(mapRow) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 创建分组
router.post('/', (req, res) => {
  try {
    const db = getDb()
    const { name, taskIds, description } = req.body
    if (!name) return res.status(400).json({ code: 400, message: '分组名称不能为空', data: null })
    const id = uuidv4()
    const ids = JSON.stringify(taskIds || [])
    db.prepare(
      'INSERT INTO task_groups (id, name, task_ids, description, user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name, ids, description || '', req.userId)

    // 更新任务的 group_id
    if (Array.isArray(taskIds) && taskIds.length > 0) {
      const updateStmt = db.prepare("UPDATE tasks SET group_id = ? WHERE id = ?")
      for (const tid of taskIds) {
        updateStmt.run(id, tid)
      }
    }

    const row = db.prepare('SELECT * FROM task_groups WHERE id = ?').get(id) as Record<string, unknown>
    res.json({ code: 0, message: 'success', data: mapRow(row) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 更新分组
router.put('/:id', (req, res) => {
  try {
    const db = getDb()
    const { name, taskIds, description } = req.body

    // 获取旧分组数据
    const old = db.prepare('SELECT task_ids FROM task_groups WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as { task_ids: string } | undefined
    if (!old) { res.status(404).json({ code: 404, message: '分组不存在', data: null }); return }

    const oldIds: string[] = JSON.parse(old.task_ids || '[]')

    if (taskIds !== undefined) {
      // 清除旧任务的 group_id
      const clearStmt = db.prepare("UPDATE tasks SET group_id = '' WHERE id = ?")
      for (const tid of oldIds) {
        clearStmt.run(tid)
      }
      // 设置新任务的 group_id
      const setStmt = db.prepare('UPDATE tasks SET group_id = ? WHERE id = ?')
      for (const tid of taskIds) {
        setStmt.run(req.params.id, tid)
      }
    }

    const updates: string[] = []
    const values: unknown[] = []
    if (name !== undefined) { updates.push('name = ?'); values.push(name) }
    if (taskIds !== undefined) { updates.push('task_ids = ?'); values.push(JSON.stringify(taskIds)) }
    if (description !== undefined) { updates.push('description = ?'); values.push(description) }

    if (updates.length > 0) {
      values.push(req.params.id)
      db.prepare(`UPDATE task_groups SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    }

    const row = db.prepare('SELECT * FROM task_groups WHERE id = ?').get(req.params.id) as Record<string, unknown>
    res.json({ code: 0, message: 'success', data: mapRow(row) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 删除分组（任务保留，清除 group_id）
router.delete('/:id', (req, res) => {
  try {
    const db = getDb()
    const old = db.prepare('SELECT task_ids FROM task_groups WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as { task_ids: string } | undefined
    if (old) {
      const oldIds: string[] = JSON.parse(old.task_ids || '[]')
      const clearStmt = db.prepare("UPDATE tasks SET group_id = '' WHERE id = ?")
      for (const tid of oldIds) {
        clearStmt.run(tid)
      }
    }
    db.prepare('DELETE FROM task_groups WHERE id = ?').run(req.params.id)
    res.json({ code: 0, message: 'success', data: null })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

export default router
