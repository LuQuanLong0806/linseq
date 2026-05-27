/**
 * 任务分组 API 路由
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'

const router = Router()

interface TaskGroup {
  id: string
  name: string
  taskIds: string[]
  projectPath: string
  gitBranch: string
  createdAt: string
}

function mapRow(r: Record<string, unknown>): TaskGroup {
  return {
    id: r.id as string,
    name: r.name as string,
    taskIds: JSON.parse((r.task_ids as string) || '[]'),
    projectPath: (r.project_path as string) || '',
    gitBranch: (r.git_branch as string) || '',
    createdAt: (r.created_at as string) || '',
  }
}

// 获取所有分组
router.get('/', (_req, res) => {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM task_groups ORDER BY created_at DESC').all() as Record<string, unknown>[]
    res.json({ code: 0, message: 'success', data: rows.map(mapRow) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 创建分组
router.post('/', (req, res) => {
  try {
    const db = getDb()
    const { name, taskIds, projectPath, gitBranch } = req.body
    const id = uuidv4()
    const ids = JSON.stringify(taskIds || [])
    db.prepare(
      'INSERT INTO task_groups (id, name, task_ids, project_path, git_branch) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name || '未命名分组', ids, projectPath || '', gitBranch || '')

    // 更新任务的 group_id
    if (Array.isArray(taskIds) && taskIds.length > 0) {
      const updateStmt = db.prepare('UPDATE tasks SET group_id = ? WHERE id = ?')
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
    const { name, taskIds, projectPath, gitBranch } = req.body

    // 获取旧分组数据
    const old = db.prepare('SELECT task_ids FROM task_groups WHERE id = ?').get(req.params.id) as { task_ids: string } | undefined
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

    db.prepare(
      `UPDATE task_groups SET name = ?, task_ids = ?, project_path = ?, git_branch = ? WHERE id = ?`
    ).run(
      name !== undefined ? name : undefined,
      taskIds !== undefined ? JSON.stringify(taskIds) : undefined,
      projectPath !== undefined ? projectPath : undefined,
      gitBranch !== undefined ? gitBranch : undefined,
      req.params.id
    )

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
    const old = db.prepare('SELECT task_ids FROM task_groups WHERE id = ?').get(req.params.id) as { task_ids: string } | undefined
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
