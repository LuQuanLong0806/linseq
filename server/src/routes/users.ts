/**
 * 用户管理路由（内网账号级别）
 * 登录即注册：用内网凭据登录，成功后自动创建/更新用户
 */
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { loginIntranet } from '../scraper/intranet.js'
import crypto from 'crypto'

const router = Router()

/** 登录即注册：用内网凭据登录，成功后自动创建用户 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body as { username: string; password: string }
    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '请输入用户名和密码', data: null })
    }

    // Puppeteer 登录内网
    const result = await loginIntranet(username, password)

    // 登录成功，创建或更新用户
    const db = getDb()
    const displayName = username
    db.prepare(`
      INSERT INTO users (username, password, display_name, cookie, cookie_expiry)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        password = excluded.password,
        cookie = excluded.cookie,
        cookie_expiry = excluded.cookie_expiry
    `).run(username, password, displayName, result.cookie, result.expiry)

    // 设为当前用户
    db.prepare(`
      INSERT INTO sync_config (key, value) VALUES ('currentUser', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify(username))

    const user = db.prepare('SELECT username, display_name, cookie_expiry, last_sync_time, created_at FROM users WHERE username = ?').get(username)
    res.json({ code: 0, message: 'success', data: mapUserRow(user) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** 用户列表（不返回密码和 cookie） */
router.get('/', (_req, res) => {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT username, display_name, cookie_expiry, last_sync_time, created_at FROM users ORDER BY created_at ASC').all()
    res.json({ code: 0, message: 'success', data: rows.map(mapUserRow) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** 获取当前用户 */
router.get('/current', (_req, res) => {
  try {
    const db = getDb()
    const curRow = db.prepare("SELECT value FROM sync_config WHERE key = 'currentUser'").get() as { value: string } | undefined
    const username = curRow ? JSON.parse(curRow.value) : ''
    if (!username) {
      return res.json({ code: 0, message: 'success', data: null })
    }
    const user = db.prepare('SELECT username, display_name, cookie_expiry, last_sync_time, created_at FROM users WHERE username = ?').get(username)
    res.json({ code: 0, message: 'success', data: user ? mapUserRow(user) : null })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** 更新用户 */
router.put('/:username', (req, res) => {
  try {
    const db = getDb()
    const { password, displayName } = req.body as { password?: string; displayName?: string }
    const username = req.params.username

    const existing = db.prepare('SELECT username FROM users WHERE username = ?').get(username)
    if (!existing) return res.status(404).json({ code: 404, message: '用户不存在', data: null })

    const updates: string[] = []
    const values: unknown[] = []
    if (password !== undefined) { updates.push('password = ?'); values.push(password) }
    if (displayName !== undefined) { updates.push('display_name = ?'); values.push(displayName) }

    if (updates.length > 0) {
      values.push(username)
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE username = ?`).run(...values)
    }

    const user = db.prepare('SELECT username, display_name, cookie_expiry, last_sync_time, created_at FROM users WHERE username = ?').get(username)
    res.json({ code: 0, message: 'success', data: mapUserRow(user) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** 删除用户（级联清理其数据） */
router.delete('/:username', (req, res) => {
  try {
    const db = getDb()
    const username = req.params.username

    // 清理该用户的数据
    const taskIds = db.prepare('SELECT id FROM tasks WHERE user_id = ?').all(username) as { id: string }[]
    for (const { id } of taskIds) {
      db.prepare('DELETE FROM dev_logs WHERE task_id = ?').run(id)
      db.prepare('DELETE FROM task_versions WHERE task_id = ?').run(id)
    }
    db.prepare('DELETE FROM tasks WHERE user_id = ?').run(username)
    db.prepare("DELETE FROM sync_config WHERE user_id = ? AND key != 'currentUser'").run(username)
    db.prepare('DELETE FROM sync_records WHERE user_id = ?').run(username)
    db.prepare('DELETE FROM project_configs WHERE user_id = ?').run(username)
    db.prepare('DELETE FROM task_groups WHERE user_id = ?').run(username)
    db.prepare('DELETE FROM users WHERE username = ?').run(username)

    // 如果删除的是当前用户，切换到第一个剩余用户
    const curRow = db.prepare("SELECT value FROM sync_config WHERE key = 'currentUser'").get() as { value: string } | undefined
    if (curRow && JSON.parse(curRow.value) === username) {
      const first = db.prepare('SELECT username FROM users ORDER BY created_at ASC LIMIT 1').get() as { username: string } | undefined
      db.prepare(`
        INSERT INTO sync_config (key, value) VALUES ('currentUser', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(JSON.stringify(first?.username || ''))
    }

    res.json({ code: 0, message: 'success', data: null })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** 切换当前用户 */
router.post('/switch', (req, res) => {
  try {
    const db = getDb()
    const { username } = req.body as { username: string }
    if (!username) return res.status(400).json({ code: 400, message: '请指定用户名', data: null })

    const user = db.prepare('SELECT username FROM users WHERE username = ?').get(username)
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在', data: null })

    db.prepare(`
      INSERT INTO sync_config (key, value) VALUES ('currentUser', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify(username))

    res.json({ code: 0, message: 'success', data: null })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** 用存储的凭据重新登录刷新 cookie */
router.post('/:username/refresh', async (req, res) => {
  try {
    const db = getDb()
    const username = req.params.username
    const user = db.prepare('SELECT username, password FROM users WHERE username = ?').get(username) as { username: string; password: string } | undefined
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在', data: null })

    const result = await loginIntranet(user.username, user.password)

    db.prepare('UPDATE users SET cookie = ?, cookie_expiry = ? WHERE username = ?').run(result.cookie, result.expiry, username)

    const updated = db.prepare('SELECT username, display_name, cookie_expiry, last_sync_time, created_at FROM users WHERE username = ?').get(username)
    res.json({ code: 0, message: 'success', data: mapUserRow(updated) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

function mapUserRow(row: unknown) {
  if (!row) return null
  const r = row as Record<string, unknown>
  return {
    username: r.username as string,
    displayName: (r.display_name as string) || '',
    cookieExpiry: (r.cookie_expiry as string) || '',
    lastSyncTime: (r.last_sync_time as string) || '',
    createdAt: (r.created_at as string) || '',
  }
}

// ========== Agent Key 管理 ==========

function generateApiKey(): string {
  return `qcl_${crypto.randomBytes(24).toString('hex')}`
}

function mapAgentKeyRow(row: unknown) {
  if (!row) return null
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    userId: r.user_id as string,
    key: r.key as string,
    name: (r.name as string) || '',
    enabled: Boolean(r.enabled),
    createdAt: (r.created_at as string) || '',
    lastUsedAt: (r.last_used_at as string) || '',
  }
}

/** 列出指定用户的 agent keys */
router.get('/:username/agent-keys', (req, res) => {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM agent_keys WHERE user_id = ? ORDER BY created_at DESC').all(req.params.username)
    res.json({ code: 0, message: 'success', data: rows.map(mapAgentKeyRow) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** 为指定用户生成新的 agent key */
router.post('/:username/agent-keys', (req, res) => {
  try {
    const db = getDb()
    const username = req.params.username
    const { name } = req.body as { name?: string }

    const user = db.prepare('SELECT username FROM users WHERE username = ?').get(username)
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在', data: null })

    const id = uuidv4()
    const key = generateApiKey()
    db.prepare('INSERT INTO agent_keys (id, user_id, key, name) VALUES (?, ?, ?, ?)').run(id, username, key, name || '')
    const row = db.prepare('SELECT * FROM agent_keys WHERE id = ?').get(id)
    res.json({ code: 0, message: 'success', data: mapAgentKeyRow(row) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** 禁用/启用 agent key */
router.patch('/agent-keys/:id/toggle', (req, res) => {
  try {
    const db = getDb()
    const row = db.prepare('SELECT * FROM agent_keys WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
    if (!row) return res.status(404).json({ code: 404, message: 'Key 不存在', data: null })

    const newEnabled = row.enabled ? 0 : 1
    db.prepare('UPDATE agent_keys SET enabled = ? WHERE id = ?').run(newEnabled, req.params.id)
    const updated = db.prepare('SELECT * FROM agent_keys WHERE id = ?').get(req.params.id)
    res.json({ code: 0, message: 'success', data: mapAgentKeyRow(updated) })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

/** 删除 agent key */
router.delete('/agent-keys/:id', (req, res) => {
  try {
    const db = getDb()
    db.prepare('DELETE FROM agent_keys WHERE id = ?').run(req.params.id)
    res.json({ code: 0, message: 'success', data: null })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

export default router
