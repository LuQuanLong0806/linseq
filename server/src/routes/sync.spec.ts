import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock DB
const mockPrepare = vi.fn()
const mockTransaction = vi.fn((fn: () => void) => { fn(); return () => {} })
const mockDb = { prepare: mockPrepare, transaction: mockTransaction }

vi.mock('../db/index.js', () => ({
  getDb: () => mockDb,
  initDatabase: vi.fn(),
}))

// Mock intranet scraper
vi.mock('../scraper/intranet.js', () => ({
  scrapTasksFromIntranet: vi.fn().mockResolvedValue([]),
  loginIntranet: vi.fn().mockResolvedValue({ cookie: 'test-cookie', expiry: '2099-01-01' }),
  checkLoginStatus: vi.fn().mockResolvedValue({ isLoggedIn: true, expiry: '2099-01-01' }),
  getValidCookie: vi.fn().mockResolvedValue('test-cookie'),
}))

let app: express.Express

async function createApp() {
  const syncModule = await import('./sync.js')
  app = express()
  app.use(express.json())
  app.use((req: any, _res: any, next: any) => { req.userId = 'test-user'; next() })
  app.use('/api/sync', syncModule.default)
}

describe('Sync API Routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockPrepare.mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
      run: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    })
    await createApp()
  })

  // ===== GET /config =====
  it('GET /config 返回默认配置', async () => {
    mockPrepare.mockReturnValue({ all: vi.fn().mockReturnValue([]) })
    const res = await request(app).get('/api/sync/config')
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.intranetUrl).toBe('')
    expect(res.body.data.autoSync).toBe(false)
  })

  it('GET /config 返回已保存的配置', async () => {
    mockPrepare.mockReturnValue({
      all: vi.fn().mockReturnValue([
        { key: 'intranetUrl', value: '"https://intranet.test"' },
        { key: 'autoSync', value: 'true' },
        { key: 'syncInterval', value: '60' },
      ]),
    })
    const res = await request(app).get('/api/sync/config')
    expect(res.body.data.intranetUrl).toBe('https://intranet.test')
    expect(res.body.data.autoSync).toBe(true)
    expect(res.body.data.syncInterval).toBe(60)
  })

  // ===== PUT /config =====
  it('PUT /config 保存配置', async () => {
    const runMock = vi.fn()
    mockPrepare.mockReturnValue({ run: runMock })
    const res = await request(app)
      .put('/api/sync/config')
      .send({ intranetUrl: 'https://test.com', autoSync: true })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(runMock).toHaveBeenCalled()
  })

  // ===== GET /records =====
  it('GET /records 返回空列表', async () => {
    mockPrepare.mockReturnValue({ all: vi.fn().mockReturnValue([]) })
    const res = await request(app).get('/api/sync/records')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('GET /records 返回同步记录', async () => {
    mockPrepare.mockReturnValue({
      all: vi.fn().mockReturnValue([{
        id: 'r1', sync_time: '2026-05-29', status: 'success',
        total_tasks: 10, new_tasks: 3, updated_tasks: 2, unchanged_tasks: 5,
        error_messages: '[]',
      }]),
    })
    const res = await request(app).get('/api/sync/records')
    expect(res.body.data.length).toBe(1)
    expect(res.body.data[0].totalTasks).toBe(10)
    expect(res.body.data[0].newTasks).toBe(3)
  })

  // ===== POST /trigger =====
  it('POST /trigger 同步成功', async () => {
    const { scrapTasksFromIntranet } = await import('../scraper/intranet.js')
    const mockTask = {
      sourceId: 'S001', title: '测试', description: '', module: '', priority: 'high',
      status: 'in_progress', deadline: '', project: '', customer: '', taskType: '',
      bugOrReq: '', workHours: 0, developer: '', supervisor: '', productManager: '',
      devLeader: '', handler: '', isClosed: false, intranetNode: '', intranetNodeName: '',
      staleDays: 0, rejectFlag: false, tags: [],
    }
    ;(scrapTasksFromIntranet as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockTask])

    const runMock = vi.fn()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, title')) return { get: vi.fn().mockReturnValue(undefined) }
      if (sql.includes('INSERT INTO tasks')) return { run: runMock }
      if (sql.includes('sync_records')) return { run: runMock }
      if (sql.includes('project_configs')) return { all: vi.fn().mockReturnValue([]) }
      if (sql.includes('UPDATE tasks SET is_hidden')) return { run: runMock }
      return { get: vi.fn().mockReturnValue(undefined), run: runMock, all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app).post('/api/sync/trigger')
    expect(res.status).toBe(200)
    expect(res.body.data.newTasks).toBe(1)
    expect(res.body.data.totalTasks).toBe(1)
  })

  it('POST /trigger 同步失败记录错误', async () => {
    const { scrapTasksFromIntranet } = await import('../scraper/intranet.js')
    ;(scrapTasksFromIntranet as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('网络超时'))

    const runMock = vi.fn()
    mockPrepare.mockReturnValue({ run: runMock })

    const res = await request(app).post('/api/sync/trigger')
    expect(res.status).toBe(500)
    expect(res.body.message).toContain('网络超时')
    expect(runMock).toHaveBeenCalled()
  })

  // ===== POST /login =====
  it('POST /login 登录成功', async () => {
    const res = await request(app)
      .post('/api/sync/login')
      .send({ username: 'testuser', password: 'testpass' })
    expect(res.status).toBe(200)
    expect(res.body.data.cookie).toBe('test-cookie')
  })

  it('POST /login 缺少参数返回 500', async () => {
    const { loginIntranet } = await import('../scraper/intranet.js')
    ;(loginIntranet as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('缺少参数'))
    const res = await request(app)
      .post('/api/sync/login')
      .send({})
    expect(res.status).toBe(500)
  })

  // ===== GET /login-status =====
  it('GET /login-status 返回登录状态', async () => {
    const res = await request(app).get('/api/sync/login-status')
    expect(res.status).toBe(200)
    expect(res.body.data.isLoggedIn).toBe(true)
  })

  // ===== GET /req-doc =====
  it('GET /req-doc 缺少 id 返回 400', async () => {
    const res = await request(app).get('/api/sync/req-doc')
    expect(res.status).toBe(400)
  })
})
