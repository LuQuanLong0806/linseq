import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const mockPrepare = vi.fn()
const mockAll = vi.fn()
const mockRun = vi.fn()
const mockGet = vi.fn()

function createMockStmt() {
  return {
    run: mockRun,
    get: mockGet,
    all: mockAll,
    bind: vi.fn(),
  }
}

const mockDb = {
  prepare: (...args: unknown[]) => {
    mockPrepare(...args)
    return createMockStmt()
  },
  exec: vi.fn(),
}

vi.mock('../db/index.js', () => ({
  getDb: () => mockDb,
  initDatabase: vi.fn(),
}))

vi.mock('../services/project-matcher.js', () => ({
  matchProject: vi.fn().mockReturnValue(null),
  recordHistory: vi.fn(),
  batchMatchProjects: vi.fn().mockReturnValue(0),
  getDocumentGroups: vi.fn().mockReturnValue([]),
}))

vi.mock('../services/risk-assessor.js', () => ({
  assessRisk: vi.fn().mockReturnValue({ level: 'L1', score: 10, factors: [] }),
}))

vi.mock('../services/ai-analyzer.js', () => ({
  analyzeTask: vi.fn().mockResolvedValue({
    source: 'rules',
    projectMatch: null,
    risk: { level: 'L1', score: 10, factors: [] },
  }),
  batchAnalyzeTasks: vi.fn().mockResolvedValue([]),
}))

vi.mock('../services/risk-assessor.js', () => ({
  assessRisk: vi.fn().mockReturnValue({ level: 'L1', score: 10, factors: [] }),
}))

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Math.random().toString(36).slice(2, 8),
}))

let app: express.Express
const userId = 'testuser'

async function createApp() {
  const mod = await import('./preprocess.js')
  app = express()
  app.use(express.json())
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).userId = userId
    next()
  })
  app.use('/api/preprocess', mod.default)
}

describe('Preprocess API Routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await createApp()
  })

  describe('POST /api/preprocess/split', () => {
    it('should return 400 if taskId is missing', async () => {
      const res = await request(app).post('/api/preprocess/split').send({})
      expect(res.status).toBe(400)
      expect(res.body.code).toBe(400)
    })

    it('should return 404 if task not found', async () => {
      mockGet.mockReturnValueOnce(undefined)
      const res = await request(app).post('/api/preprocess/split').send({ taskId: 'not-exist' })
      expect(res.status).toBe(404)
    })

    it('should return needsSplit=false for short single-task descriptions', async () => {
      mockGet.mockReturnValueOnce({
        id: 't1', title: '小任务', description: '修改一个按钮颜色', module: 'UI', customer: 'A',
      })
      const res = await request(app).post('/api/preprocess/split').send({ taskId: 't1' })
      expect(res.status).toBe(200)
      expect(res.body.data.needsSplit).toBe(false)
    })

    it('should split multi-task document with numbering', async () => {
      const longDesc = [
        '1. 登录页面增加验证码功能，需要在登录表单中添加图形验证码功能，支持图形验证码生成和校验，需要前端组件开发以及后端验证接口的开发配合，验证码需要支持数字和字母混合，需要有过期机制和刷新功能，前端需要做验证码输入框的交互优化，包括自动聚焦、输入长度限制、错误提示等，后端需要生成验证码图片并存入缓存，校验时从缓存读取对比，验证码长度为四位，支持大小写不敏感',
        '2. 用户列表加导出功能，支持Excel和CSV格式导出，包含所有用户数据的导出功能，需要前端导出按钮、后端数据查询和文件生成接口，导出字段需要包含用户名、邮箱、手机号、注册时间、最后登录时间等，支持按日期范围筛选导出数据，大数据量导出需要分页处理，导出文件需要包含表头，Excel格式需要设置列宽和样式，CSV需要UTF8编码',
        '3. 权限管理增加角色分配页面，支持多角色分配和权限管理，包含角色创建、权限分配、用户角色关联等功能，涉及前端页面和后端权限校验接口，角色需要支持自定义名称和描述，权限需要按照菜单和操作两个维度进行分配，用户可以拥有多个角色，角色权限取并集，需要支持角色删除和修改，修改后实时生效，角色列表需要分页展示，支持按名称搜索',
        '4. 系统通知功能优化，需要在现有的通知模块基础上增加站内信和邮件通知两种方式，站内信需要支持已读未读状态标记，邮件通知需要支持自定义模板，通知触发场景包括任务分配、审批结果、系统公告等，需要前端通知列表页面和后端通知发送接口',
        '5. 数据备份功能，需要支持数据库定时自动备份和手动备份，备份文件存储在本地服务器，支持按日期查看备份列表，支持备份文件下载和恢复，需要提供备份配置页面，可以设置备份频率和保留天数',
      ].join('\n')
      mockGet.mockReturnValueOnce({
        id: 't1', title: 'XX系统V2.1需求', description: longDesc, module: 'XX系统', customer: 'A', source_id: 'src1',
      })
      const res = await request(app).post('/api/preprocess/split').send({ taskId: 't1' })
      expect(res.status).toBe(200)
      expect(res.body.data.needsSplit).toBe(true)
      expect(res.body.data.subTasks.length).toBeGreaterThanOrEqual(2)
      expect(res.body.data.confidence).toBeGreaterThan(0)
    })
  })

  describe('POST /api/preprocess/match', () => {
    it('should return 400 if taskId is missing', async () => {
      const res = await request(app).post('/api/preprocess/match').send({})
      expect(res.status).toBe(400)
    })

    it('should return null match when no rules/history match', async () => {
      const ai = await import('../services/ai-analyzer.js')
      ;(ai.analyzeTask as any).mockResolvedValueOnce({
        source: 'rules',
        projectMatch: null,
        risk: { level: 'L1', score: 10, factors: [] },
      })
      const res = await request(app).post('/api/preprocess/match').send({ taskId: 't1' })
      expect(res.status).toBe(200)
      expect(res.body.data.projectMatch).toBeNull()
    })
  })

  describe('POST /api/preprocess/assess-risk', () => {
    it('should return 400 if taskId is missing', async () => {
      const res = await request(app).post('/api/preprocess/assess-risk').send({})
      expect(res.status).toBe(400)
    })

    it('should assess risk for a normal task', async () => {
      const ai = await import('../services/ai-analyzer.js')
      ;(ai.analyzeTask as any).mockResolvedValueOnce({
        source: 'rules',
        projectMatch: null,
        risk: { level: 'L2', score: 25, factors: ['常规开发'] },
      })
      const res = await request(app).post('/api/preprocess/assess-risk').send({ taskId: 't1' })
      expect(res.status).toBe(200)
      expect(res.body.data.level).toBe('L2')
      expect(res.body.data.score).toBe(25)
      expect(res.body.data.factors).toBeInstanceOf(Array)
    })

    it('should return L4 for bug with high rework count', async () => {
      const ai = await import('../services/ai-analyzer.js')
      ;(ai.analyzeTask as any).mockResolvedValueOnce({
        source: 'rules',
        projectMatch: null,
        risk: { level: 'L4', score: 85, factors: ['多次返工', '数据库'] },
      })
      const res = await request(app).post('/api/preprocess/assess-risk').send({ taskId: 't1' })
      expect(res.status).toBe(200)
      expect(res.body.data.level).toBe('L4')
    })
  })

  describe('Rules CRUD', () => {
    it('should create a rule', async () => {
      const res = await request(app).post('/api/preprocess/rules').send({
        projectConfigId: 'cfg-1', ruleType: 'keyword', pattern: '用户', field: 'module', priority: 1,
      })
      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 for incomplete rule', async () => {
      const res = await request(app).post('/api/preprocess/rules').send({ pattern: '用户' })
      expect(res.status).toBe(400)
    })

    it('should delete a rule', async () => {
      const res = await request(app).delete('/api/preprocess/rules/rule-1')
      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('POST /api/preprocess/doc-groups', () => {
    it('should return document groups', async () => {
      const pm = await import('../services/project-matcher.js')
      ;(pm.getDocumentGroups as any).mockReturnValueOnce([
        { docKey: '宁对接需求.pdf', docName: '2026052016140188_宁对接需求.pdf', taskIds: ['t1', 't2'], taskCount: 2, project: '宁对接小程序' },
        { docKey: '场景需求.pdf', docName: '20260507_场景需求.pdf', taskIds: ['t3'], taskCount: 1, project: '南京场景' },
      ])
      const res = await request(app).post('/api/preprocess/doc-groups').send({})
      expect(res.status).toBe(200)
      expect(res.body.data.totalGroups).toBe(2)
      expect(res.body.data.multiTaskGroups.length).toBe(1)
      expect(res.body.data.multiTaskGroups[0].docKey).toBe('宁对接需求.pdf')
      expect(res.body.data.multiTaskGroups[0].taskCount).toBe(2)
    })
  })

  describe('POST /api/preprocess/split - doc group detection', () => {
    it('should detect isDocGroup for short description with req_doc_name', async () => {
      // Use a local mock to avoid state leakage from other tests
      let callCount = 0
      const localMockDb = {
        prepare: () => ({
          get: () => ({
            id: 't1', title: '任务A', description: '短描述', module: '', customer: '',
            req_doc_name: '2026052016140188_需求文档.pdf', source_id: 's1',
          }),
          all: () => [
            { id: 't1', title: '任务A', req_doc_name: '2026052016140188_需求文档.pdf' },
            { id: 't2', title: '任务B', req_doc_name: '2026052016140188_需求文档.pdf' },
          ],
          run: vi.fn(),
          bind: vi.fn(),
        }),
        exec: vi.fn(),
      }

      // Override getDb for this test only
      const dbModule = await import('../db/index.js')
      const originalGetDb = dbModule.getDb
      ;(dbModule as any).getDb = () => localMockDb

      const mod = await import('./preprocess.js')
      const testApp = express()
      testApp.use(express.json())
      testApp.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
        ;(req as any).userId = userId
        next()
      })
      testApp.use('/api/preprocess', mod.default)

      const res = await request(testApp).post('/api/preprocess/split').send({ taskId: 't1' })

      // Restore
      ;(dbModule as any).getDb = originalGetDb

      expect(res.status).toBe(200)
      expect(res.body.data.isDocGroup).toBe(true)
      expect(res.body.data.docKey).toBe('需求文档.pdf')
      expect(res.body.data.relatedTasks.length).toBe(2)
    })
  })

  describe('POST /api/preprocess/batch-analyze', () => {
    it('should return 400 if taskIds is empty', async () => {
      const res = await request(app).post('/api/preprocess/batch-analyze').send({ taskIds: [] })
      expect(res.status).toBe(400)
    })

    it('should analyze multiple tasks', async () => {
      const ai = await import('../services/ai-analyzer.js')
      ;(ai.batchAnalyzeTasks as any).mockResolvedValueOnce([
        { taskId: 't1', title: '任务A', source: 'rules', projectMatch: null, risk: { level: 'L1', score: 10, factors: [] } },
        { taskId: 't2', title: '任务B', source: 'rules', projectMatch: null, risk: { level: 'L2', score: 25, factors: ['开发'] } },
      ])
      const res = await request(app).post('/api/preprocess/batch-analyze').send({ taskIds: ['t1', 't2'] })
      expect(res.status).toBe(200)
      expect(res.body.data.length).toBe(2)
      expect(res.body.data[0].risk).toBeDefined()
    })
  })
})
