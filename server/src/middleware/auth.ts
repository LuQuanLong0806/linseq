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
 * 用户身份识别中间件（优先级：x-agent-key > Bearer token > x-user > DB fallback）
 * 1. x-agent-key: Agent 调用时传的 API Key，查 agent_keys 表获取 user_id
 * 2. Authorization: Bearer <token>: 前端登录后签发的 token，查 users 表
 * 3. x-user: 前端请求时的用户名 header（deprecated，兼容旧版）
 * 4. fallback: 从 sync_config 读 currentUser（兼容旧 Agent 调用）
 */
export function currentUser(req: Request, _res: Response, next: NextFunction): void {
  // 免认证路由白名单
  const publicPaths = ['/api/users/login', '/api/health', '/api/sync/login', '/api/sync/login-status', '/api/sync/req-doc']
  if (publicPaths.some(p => req.path.startsWith(p))) {
    return next()
  }

  // 优先级 1：agent key
  const agentKey = req.headers['x-agent-key'] as string | undefined
  if (agentKey) {
    try {
      const db = getDb()
      const row = db.prepare('SELECT user_id FROM agent_keys WHERE key = ? AND enabled = 1').get(agentKey) as { user_id: string } | undefined
      if (row) {
        req.userId = row.user_id
        db.prepare("UPDATE agent_keys SET last_used_at = datetime('now', 'localtime') WHERE key = ?").run(agentKey)
        return next()
      }
    } catch { /* ignore */ }
  }

  // 优先级 2：Bearer token（前端登录签发）
  const authHeader = req.headers['authorization'] as string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token) {
      try {
        const db = getDb()
        const row = db.prepare('SELECT username, token_expiry FROM users WHERE token = ?').get(token) as { username: string; token_expiry: string } | undefined
        if (row) {
          // 检查 token 是否过期
          if (row.token_expiry && new Date(row.token_expiry).getTime() < Date.now()) {
            db.prepare('UPDATE users SET token = ?, token_expiry = ? WHERE username = ?').run('', '', row.username)
            _res.status(401).json({ code: 401, message: '登录已过期，请重新登录', data: null })
            return
          }
          req.userId = row.username
          // 滑动续期：每次请求延长 token 有效期
          const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          db.prepare('UPDATE users SET token_expiry = ? WHERE username = ?').run(newExpiry, row.username)
          return next()
        }
        // token 不匹配任何用户
        _res.status(401).json({ code: 401, message: '无效的认证凭据', data: null })
        return
      } catch { /* ignore */ }
    }
    // Authorization header 存在但 token 为空
    _res.status(401).json({ code: 401, message: '无效的认证凭据', data: null })
    return
  }

  // 优先级 3：x-user header（deprecated）
  const headerUser = req.headers['x-user'] as string | undefined
  if (headerUser) {
    req.userId = headerUser
    return next()
  }

  // 优先级 4：fallback DB 当前用户
  try {
    const db = getDb()
    const row = db.prepare("SELECT value FROM sync_config WHERE key = 'currentUser'").get() as { value: string } | undefined
    req.userId = row ? JSON.parse(row.value) : ''
  } catch {
    req.userId = ''
  }
  next()
}
