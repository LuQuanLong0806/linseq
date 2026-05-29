/**
 * LineSequence 后端服务入口
 * 任务自动化 + 内网同步 + SQLite 持久化
 */
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { initDatabase } from './db/index.js'
import { currentUser } from './middleware/auth.js'
import taskRoutes from './routes/tasks.js'
import syncRoutes from './routes/sync.js'
import devlogRoutes from './routes/devlogs.js'
import agentRoutes from './routes/agent.js'
import groupRoutes from './routes/groups.js'
import versionRoutes from './routes/versions.js'
import projectRoutes from './routes/projects.js'
import settingsRoutes from './routes/settings.js'
import userRoutes from './routes/users.js'
import { startCookieRefresh, stopCookieRefresh } from './scraper/intranet.js'
import { initWebSocket } from './websocket.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3201

// 中间件
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(currentUser)

// 请求日志
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
  next()
})

// 静态文件：截图访问
app.use('/api/screenshots', express.static(path.resolve(__dirname, '../data/screenshots')))

// 路由
app.use('/api/users', userRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/sync', syncRoutes)
app.use('/api/devlogs', devlogRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/groups', groupRoutes)
app.use('/api/versions', versionRoutes)
app.use('/api/projects', projectRoutes)

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { status: 'running', uptime: process.uptime() } })
})

// 错误处理
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err)
  res.status(500).json({ code: 500, message: err.message || '服务器内部错误', data: null })
})

// 初始化数据库并启动
async function start() {
  try {
    await initDatabase()
    startCookieRefresh()
    const server = createServer(app)
    initWebSocket(server)
    server.listen(PORT, () => {
      console.log(`\n⚡ 灵序 LINSEQ Server running at http://localhost:${PORT}`)
      console.log(`   API: http://localhost:${PORT}/api`)
      console.log(`   Health: http://localhost:${PORT}/api/health\n`)
    })
  } catch (err) {
    console.error('启动失败:', err)
    process.exit(1)
  }
}

start()
