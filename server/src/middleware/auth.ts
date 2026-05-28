import { Request, Response, NextFunction } from 'express'
import { getDb } from '../db/index.js'

declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

/**
 * 用户身份识别中间件（优先级：x-agent-key > x-user > DB fallback）
 * 1. x-agent-key: Agent 调用时传的 API Key，查 agent_keys 表获取 user_id
 * 2. x-user: 前端请求时的用户名 header
 * 3. fallback: 从 sync_config 读 currentUser（兼容旧 Agent 调用）
 */
export function currentUser(req: Request, _res: Response, next: NextFunction): void {
  // 优先级 1：agent key
  const agentKey = req.headers['x-agent-key'] as string | undefined
  if (agentKey) {
    try {
      const db = getDb()
      const row = db.prepare('SELECT user_id FROM agent_keys WHERE key = ? AND enabled = 1').get(agentKey) as { user_id: string } | undefined
      if (row) {
        req.userId = row.user_id
        // 更新 last_used_at
        db.prepare("UPDATE agent_keys SET last_used_at = datetime('now', 'localtime') WHERE key = ?").run(agentKey)
        return next()
      }
    } catch { /* ignore */ }
  }

  // 优先级 2：x-user header
  const headerUser = req.headers['x-user'] as string | undefined
  if (headerUser) {
    req.userId = headerUser
    return next()
  }

  // 优先级 3：fallback DB 当前用户
  try {
    const db = getDb()
    const row = db.prepare("SELECT value FROM sync_config WHERE key = 'currentUser'").get() as { value: string } | undefined
    req.userId = row ? JSON.parse(row.value) : ''
  } catch {
    req.userId = ''
  }
  next()
}
