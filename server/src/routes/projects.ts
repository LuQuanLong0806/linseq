/**
 * 项目配置 API 路由
 * 管理内网项目名称与本地路径、Git 分支的关联
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { execSync } from 'child_process'
import fs from 'fs'

const router = Router()

interface ProjectConfig {
  id: string
  name: string
  localPath: string
  gitUrl: string
  branches: string[]
  defaultBranch: string
  tags: string[]
  note: string
  createdAt: string
  updatedAt: string
}

function mapRow(r: Record<string, unknown>): ProjectConfig {
  return {
    id: r.id as string,
    name: r.name as string,
    localPath: (r.local_path as string) || '',
    gitUrl: (r.git_url as string) || '',
    branches: JSON.parse((r.branches as string) || '[]'),
    defaultBranch: (r.default_branch as string) || '',
    tags: JSON.parse((r.tags as string) || '[]'),
    note: (r.note as string) || '',
    createdAt: (r.created_at as string) || '',
    updatedAt: (r.updated_at as string) || '',
  }
}

// 从本地路径检测 Git 信息（路径验证 + gitUrl + 分支）
router.post('/detect-git', (req, res) => {
  try {
    const { localPath } = req.body
    if (!localPath) return res.status(400).json({ code: 400, message: '请输入本地路径', data: null })

    const normalized = localPath.replace(/\\/g, '/')
    if (!fs.existsSync(normalized)) {
      return res.status(400).json({ code: 400, message: '路径不存在', data: { exists: false, isGitRepo: false, gitUrl: '', branches: [] } })
    }

    let isGitRepo = false
    let gitUrl = ''
    let branches: string[] = []

    try {
      gitUrl = execSync('git remote get-url origin', { cwd: normalized, encoding: 'utf-8', timeout: 5000 }).trim()
      isGitRepo = true
    } catch { /* not a git repo */ }

    if (isGitRepo) {
      try {
        const output = execSync('git branch -r', { cwd: normalized, encoding: 'utf-8', timeout: 10000 })
        branches = output.split('\n')
          .map(b => b.trim().replace(/^origin\//, ''))
          .filter(b => b && !b.includes('HEAD'))
      } catch { /* branch list failed */ }
    }

    res.json({ code: 0, message: 'success', data: { exists: true, isGitRepo, gitUrl, branches } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 根据项目名查询配置（给任务列表联动用）
router.get('/by-name/:name', (req, res) => {
  try {
    const db = getDb()
    const row = db.prepare('SELECT * FROM project_configs WHERE name = ?').get(req.params.name) as Record<string, unknown> | undefined
    if (!row) return res.json({ code: 0, message: '未找到配置', data: null })
    res.json({ code: 0, message: 'success', data: mapRow(row) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 列出所有项目配置
router.get('/', (_req, res) => {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM project_configs ORDER BY updated_at DESC').all() as Record<string, unknown>[]
    res.json({ code: 0, message: 'success', data: rows.map(mapRow) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 新建项目配置
router.post('/', (req, res) => {
  try {
    const db = getDb()
    const { name, localPath, gitUrl, defaultBranch, branches, tags, note } = req.body
    if (!name) return res.status(400).json({ code: 400, message: '项目名称不能为空', data: null })

    const id = uuidv4()
    db.prepare(`
      INSERT INTO project_configs (id, name, local_path, git_url, default_branch, branches, tags, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, localPath || '', gitUrl || '', defaultBranch || '', JSON.stringify(branches || []), JSON.stringify(tags || []), note || '')

    const row = db.prepare('SELECT * FROM project_configs WHERE id = ?').get(id) as Record<string, unknown>
    res.json({ code: 0, message: 'success', data: mapRow(row) })
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(400).json({ code: 400, message: '项目名称已存在', data: null })
    }
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 更新项目配置
router.put('/:id', (req, res) => {
  try {
    const db = getDb()
    const { name, localPath, gitUrl, defaultBranch, branches, tags, note } = req.body
    const id = req.params.id

    const existing = db.prepare('SELECT id FROM project_configs WHERE id = ?').get(id)
    if (!existing) return res.status(404).json({ code: 404, message: '项目不存在', data: null })

    db.prepare(`
      UPDATE project_configs SET name = ?, local_path = ?, git_url = ?, default_branch = ?,
        branches = ?, tags = ?, note = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      name, localPath || '', gitUrl || '', defaultBranch || '',
      JSON.stringify(branches || []), JSON.stringify(tags || []), note || '', id
    )

    const row = db.prepare('SELECT * FROM project_configs WHERE id = ?').get(id) as Record<string, unknown>
    res.json({ code: 0, message: 'success', data: mapRow(row) })
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(400).json({ code: 400, message: '项目名称已存在', data: null })
    }
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 删除项目配置
router.delete('/:id', (req, res) => {
  try {
    const db = getDb()
    db.prepare('DELETE FROM project_configs WHERE id = ?').run(req.params.id)
    res.json({ code: 0, message: 'success', data: null })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 根据 git_url 或 local_path 自动获取分支列表
router.post('/:id/fetch-branches', (req, res) => {
  try {
    const db = getDb()
    const row = db.prepare('SELECT * FROM project_configs WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
    if (!row) return res.status(404).json({ code: 404, message: '项目不存在', data: null })

    const gitUrl = (row.git_url as string) || ''
    const localPath = (row.local_path as string) || ''
    let branches: string[] = []

    if (localPath) {
      try {
        const output = execSync('git branch -r', { cwd: localPath, encoding: 'utf-8', timeout: 10000 })
        branches = output.split('\n')
          .map(b => b.trim().replace(/^origin\//, ''))
          .filter(b => b && !b.includes('HEAD'))
      } catch {
        // local git failed, try remote
      }
    }

    if (branches.length === 0 && gitUrl) {
      try {
        const output = execSync(`git ls-remote --heads "${gitUrl}"`, { encoding: 'utf-8', timeout: 15000 })
        branches = output.split('\n')
          .map(b => b.replace(/.*refs\/heads\//, '').trim())
          .filter(b => b)
      } catch {
        return res.status(400).json({ code: 400, message: '无法获取远程分支，请检查 Git 地址或本地路径', data: null })
      }
    }

    if (branches.length === 0) {
      return res.status(400).json({ code: 400, message: '请先配置本地路径或 Git 地址', data: null })
    }

    db.prepare("UPDATE project_configs SET branches = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
      .run(JSON.stringify(branches), req.params.id)

    const updated = db.prepare('SELECT * FROM project_configs WHERE id = ?').get(req.params.id) as Record<string, unknown>
    res.json({ code: 0, message: `获取到 ${branches.length} 个分支`, data: mapRow(updated) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

export default router
