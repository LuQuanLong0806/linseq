import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const mockPrepare = vi.fn()
const mockDb = { prepare: mockPrepare }

vi.mock('../db/index.js', () => ({
  getDb: () => mockDb,
  initDatabase: vi.fn(),
}))

// Don't mock child_process or fs — the detect-git and fetch-branches tests
// that need execSync/existsSync are covered by integration/E2E tests.
// Unit tests here cover CRUD + by-name endpoints.

let app: express.Express

async function createApp() {
  const projectsModule = await import('./projects.js')
  app = express()
  app.use(express.json())
  app.use('/api/projects', projectsModule.default)
}

const sampleRow = {
  id: 'p1',
  name: 'TestProject',
  local_path: 'F:/projects/test',
  git_url: 'https://github.com/test/repo.git',
  branches: '["main","dev"]',
  default_branch: 'main',
  tags: '[]',
  note: '',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

describe('Projects API Routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockPrepare.mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
      run: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    })
    await createApp()
  })

  describe('GET /', () => {
    it('返回项目列表', async () => {
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([sampleRow]),
      })
      const res = await request(app).get('/api/projects')
      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].name).toBe('TestProject')
      expect(res.body.data[0].branches).toEqual(['main', 'dev'])
    })
  })

  describe('POST /', () => {
    it('创建项目成功', async () => {
      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes('INSERT')) return { run: vi.fn() }
        return { get: vi.fn().mockReturnValue(sampleRow) }
      })
      const res = await request(app).post('/api/projects').send({ name: 'TestProject' })
      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data.name).toBe('TestProject')
    })

    it('缺少项目名称返回 400', async () => {
      const res = await request(app).post('/api/projects').send({})
      expect(res.status).toBe(400)
    })
  })

  describe('PUT /:id', () => {
    it('更新项目成功', async () => {
      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM')) return { get: vi.fn().mockReturnValue({ id: 'p1' }) }
        if (sql.includes('UPDATE')) return { run: vi.fn() }
        return { get: vi.fn().mockReturnValue(sampleRow) }
      })
      const res = await request(app).put('/api/projects/p1').send({ name: 'Updated' })
      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('项目不存在返回 404', async () => {
      mockPrepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) })
      const res = await request(app).put('/api/projects/missing').send({ name: 'X' })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /:id', () => {
    it('删除成功', async () => {
      mockPrepare.mockReturnValue({ run: vi.fn() })
      const res = await request(app).delete('/api/projects/p1')
      expect(res.status).toBe(200)
    })
  })

  describe('GET /by-name/:name', () => {
    it('查到配置', async () => {
      mockPrepare.mockReturnValue({ get: vi.fn().mockReturnValue(sampleRow) })
      const res = await request(app).get('/api/projects/by-name/TestProject')
      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('TestProject')
    })

    it('未找到返回 data null', async () => {
      mockPrepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) })
      const res = await request(app).get('/api/projects/by-name/NotFound')
      expect(res.status).toBe(200)
      expect(res.body.data).toBeNull()
    })
  })

  describe('POST /detect-git', () => {
    it('缺少路径参数返回 400', async () => {
      const res = await request(app).post('/api/projects/detect-git').send({})
      expect(res.status).toBe(400)
    })
  })

  describe('POST /:id/fetch-branches', () => {
    it('项目不存在返回 404', async () => {
      mockPrepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) })
      const res = await request(app).post('/api/projects/missing/fetch-branches')
      expect(res.status).toBe(404)
    })
  })
})
