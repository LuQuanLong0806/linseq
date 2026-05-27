import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock the DB module — avoid real SQLite
const mockPrepare = vi.fn()
const mockDb = { prepare: mockPrepare }

vi.mock('../db/index.js', () => ({
  getDb: () => mockDb,
  initDatabase: vi.fn(),
}))

// Mock intranet scraper
vi.mock('../scraper/intranet.js', () => ({
  scrapTasksFromIntranet: vi.fn().mockResolvedValue([]),
  startCookieRefresh: vi.fn(),
  stopCookieRefresh: vi.fn(),
}))

// Mock tasks.js for addDevLog
vi.mock('./tasks.js', () => ({
  mapDbRowToTask: vi.fn((_db: unknown, row: Record<string, unknown>) => row),
  addDevLog: vi.fn((_db: unknown, taskId: string, action: string, content: string) => 'log-id'),
}))

let app: express.Express

async function createApp() {
  const agentModule = await import('./agent.js')
  app = express()
  app.use(express.json())
  app.use('/api/agent', agentModule.default)
}

describe('Agent API Routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockPrepare.mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
      run: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    })
    await createApp()
  })

  // ===== GET /todo-order =====
  it('GET /todo-order 返回空列表', async () => {
    const res = await request(app).get('/api/agent/todo-order')
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.todoList).toEqual([])
  })

  it('GET /todo-order 返回已保存的列表', async () => {
    mockPrepare.mockReturnValue({
      get: vi.fn().mockReturnValue({ value: JSON.stringify(['id1', 'id2']) }),
      run: vi.fn(),
    })
    const res = await request(app).get('/api/agent/todo-order')
    expect(res.body.data.todoList).toEqual(['id1', 'id2'])
  })

  // ===== POST /todo-order =====
  it('POST /todo-order 保存成功', async () => {
    const runMock = vi.fn()
    mockPrepare.mockReturnValue({ run: runMock })
    const res = await request(app)
      .post('/api/agent/todo-order')
      .send({ todoList: ['a', 'b', 'c'] })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(runMock).toHaveBeenCalledWith(JSON.stringify(['a', 'b', 'c']))
  })

  it('POST /todo-order 拒绝非数组', async () => {
    const res = await request(app)
      .post('/api/agent/todo-order')
      .send({ todoList: 'not-array' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe(400)
  })

  // ===== GET /next-task =====
  it('GET /next-task 队列为空', async () => {
    const res = await request(app).get('/api/agent/next-task')
    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
    expect(res.body.message).toContain('为空')
  })

  it('GET /next-task 返回第一个任务', async () => {
    const mockTask = {
      id: 't1', source_id: 'S001', title: '测试任务', priority: 'high',
      ai_status: 'ai_todo', rework_count: 0, project_path: 'F:/proj',
      git_branch: 'main', req_doc_text: '需求内容', custom_description: '自定义',
      acceptance_criteria: '验收标准', review_comment: '',
    }
    let callCount = 0
    mockPrepare.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: vi.fn() }
      if (callCount === 2) return { get: vi.fn().mockReturnValue({ ai_status: 'ai_todo' }) }
      if (callCount === 3) return { get: vi.fn().mockReturnValue(mockTask) }
      if (callCount === 4) return { get: vi.fn().mockReturnValue({ max_iter: null }) }
      return { get: vi.fn().mockReturnValue(undefined), run: vi.fn(), all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app).get('/api/agent/next-task')
    expect(res.status).toBe(200)
    expect(res.body.data.taskId).toBe('t1')
    expect(res.body.data.nextVersion).toBe('V1.0')
    expect(res.body.data.requirement.docText).toBe('需求内容')
  })

  // ===== POST /task/:id/start =====
  it('POST /task/:id/start 任务不存在返回 404', async () => {
    mockPrepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined), run: vi.fn() })
    const res = await request(app).post('/api/agent/task/nonexist/start')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe(404)
  })

  it('POST /task/:id/start 标记开始开发', async () => {
    const runMock = vi.fn()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT *')) return { get: vi.fn().mockReturnValue({ id: 't1', title: '任务A' }) }
      if (sql.includes('UPDATE tasks')) return { run: runMock }
      return { get: vi.fn().mockReturnValue(undefined), run: vi.fn(), all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app).post('/api/agent/task/t1/start')
    expect(res.status).toBe(200)
    expect(res.body.data.aiStatus).toBe('ai_dev')
  })

  // ===== POST /task/:id/log =====
  it('POST /task/:id/log 缺少 content 返回 400', async () => {
    mockPrepare.mockReturnValue({ get: vi.fn().mockReturnValue({ id: 't1' }) })
    const res = await request(app)
      .post('/api/agent/task/t1/log')
      .send({ action: '开发', content: '' })
    expect(res.status).toBe(400)
  })

  it('POST /task/:id/log 成功记录日志', async () => {
    const runMock = vi.fn()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM')) return { get: vi.fn().mockReturnValue({ id: 't1' }) }
      if (sql.includes('INSERT INTO dev_logs')) return { run: runMock }
      return { get: vi.fn().mockReturnValue(undefined), run: vi.fn() }
    })

    const res = await request(app)
      .post('/api/agent/task/t1/log')
      .send({ action: '调试', content: '修复了空指针' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
  })

  // ===== POST /task/:id/complete =====
  it('POST /task/:id/complete 成功提交', async () => {
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM tasks')) return { get: vi.fn().mockReturnValue({ id: 't1', title: 'T', review_comment: '' }) }
      if (sql.includes('MAX(iteration)')) return { get: vi.fn().mockReturnValue({ max_iter: null }) }
      if (sql.includes('UPDATE task_versions')) return { run: vi.fn() }
      if (sql.includes('SELECT * FROM dev_logs')) return { all: vi.fn().mockReturnValue([]) }
      if (sql.includes('INSERT INTO task_versions')) return { run: vi.fn() }
      if (sql.includes('UPDATE tasks SET')) return { run: vi.fn() }
      if (sql.includes('INSERT INTO dev_logs')) return { run: vi.fn() }
      // getTodoList / saveTodoList / removeFromTodoList
      return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: vi.fn(), all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app)
      .post('/api/agent/task/t1/complete')
      .send({ aiOutput: '代码产出', summary: '完成', durationMs: 5000 })
    expect(res.status).toBe(200)
    expect(res.body.data.aiStatus).toBe('ai_review')
    expect(res.body.data.versionNumber).toBe('V1.0')
  })

  // ===== GET /stats =====
  it('GET /stats 返回统计信息', async () => {
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('sync_config')) return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1', 't2']) }) }
      if (sql.includes('COUNT(*)')) return { get: vi.fn().mockReturnValue({ c: 5 }) }
      if (sql.includes('SELECT id, title')) return { get: vi.fn().mockReturnValue(undefined) }
      return { get: vi.fn().mockReturnValue(undefined), run: vi.fn(), all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app).get('/api/agent/stats')
    expect(res.status).toBe(200)
    expect(res.body.data.todoCount).toBe(2)
    expect(res.body.data.inDev).toBe(5)
  })

  // ===== 新增：分组上下文 =====
  it('GET /next-task 返回分组信息', async () => {
    const mockTask = {
      id: 't1', source_id: 'S001', title: '分组任务A', priority: 'high',
      ai_status: 'ai_todo', rework_count: 0, project_path: '', git_branch: '',
      req_doc_text: '', custom_description: '', acceptance_criteria: '',
      review_comment: '', group_id: 'grp1',
    }
    let callCount = 0
    mockPrepare.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: vi.fn() }
      if (callCount === 2) return { get: vi.fn().mockReturnValue({ ai_status: 'ai_todo' }) }
      if (callCount === 3) return { get: vi.fn().mockReturnValue(mockTask) }
      if (callCount === 4) return { get: vi.fn().mockReturnValue({ max_iter: null }) }
      // group lookup
      if (callCount === 5) return { get: vi.fn().mockReturnValue({ id: 'grp1', name: '登录模块', task_ids: JSON.stringify(['t1', 't2']) }) }
      // sibling task t2
      if (callCount === 6) return { get: vi.fn().mockReturnValue({ id: 't2', title: '分组任务B', ai_status: 'ai_todo' }) }
      // completed count check for t1
      if (callCount === 7) return { get: vi.fn().mockReturnValue(undefined) }
      // completed count check for t2
      if (callCount === 8) return { get: vi.fn().mockReturnValue(undefined) }
      return { get: vi.fn().mockReturnValue(undefined), run: vi.fn(), all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app).get('/api/agent/next-task')
    expect(res.status).toBe(200)
    expect(res.body.data.group).toBeDefined()
    expect(res.body.data.group.id).toBe('grp1')
    expect(res.body.data.group.name).toBe('登录模块')
    expect(res.body.data.group.taskCount).toBe(2)
    expect(res.body.data.group.siblingTasks.length).toBe(1)
    expect(res.body.data.group.siblingTasks[0].taskId).toBe('t2')
  })

  it('GET /next-task 无分组时 group 为 null', async () => {
    const mockTask = {
      id: 't1', source_id: 'S001', title: '独立任务', priority: 'medium',
      ai_status: 'ai_todo', rework_count: 0, project_path: '', git_branch: '',
      req_doc_text: '', custom_description: '', acceptance_criteria: '',
      review_comment: '', group_id: '',
    }
    let callCount = 0
    mockPrepare.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: vi.fn() }
      if (callCount === 2) return { get: vi.fn().mockReturnValue({ ai_status: 'ai_todo' }) }
      if (callCount === 3) return { get: vi.fn().mockReturnValue(mockTask) }
      if (callCount === 4) return { get: vi.fn().mockReturnValue({ max_iter: null }) }
      return { get: vi.fn().mockReturnValue(undefined), run: vi.fn(), all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app).get('/api/agent/next-task')
    expect(res.body.data.group).toBeNull()
  })

  // ===== 新增：返工返回 prevOutput =====
  it('GET /next-task 返工任务返回 prevOutput', async () => {
    const mockTask = {
      id: 't1', source_id: 'S001', title: '返工任务', priority: 'high',
      ai_status: 'ai_rework', rework_count: 1, project_path: '', git_branch: '',
      req_doc_text: '', custom_description: '', acceptance_criteria: '',
      review_comment: '请修复空指针', group_id: '',
    }
    let callCount = 0
    mockPrepare.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: vi.fn() }
      if (callCount === 2) return { get: vi.fn().mockReturnValue({ ai_status: 'ai_rework' }) }
      if (callCount === 3) return { get: vi.fn().mockReturnValue(mockTask) }
      if (callCount === 4) return { get: vi.fn().mockReturnValue({ max_iter: 0 }) }
      if (callCount === 5) return { get: vi.fn().mockReturnValue({ version_number: 'V1.0', prev_review_comment: '', ai_output: '上一轮代码产出' }) }
      return { get: vi.fn().mockReturnValue(undefined), run: vi.fn(), all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app).get('/api/agent/next-task')
    expect(res.status).toBe(200)
    expect(res.body.data.isRework).toBe(true)
    expect(res.body.data.review.prevComment).toBe('请修复空指针')
    expect(res.body.data.review.prevOutput).toBe('上一轮代码产出')
  })

  // ===== 新增：complete 接收 filesChanged 和 testResult =====
  it('POST /task/:id/complete 带 filesChanged 和 testResult', async () => {
    const insertRunMock = vi.fn()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM tasks')) return { get: vi.fn().mockReturnValue({ id: 't1', title: 'T', review_comment: '' }) }
      if (sql.includes('MAX(iteration)')) return { get: vi.fn().mockReturnValue({ max_iter: null }) }
      if (sql.includes('UPDATE task_versions')) return { run: vi.fn() }
      if (sql.includes('SELECT * FROM dev_logs')) return { all: vi.fn().mockReturnValue([]) }
      if (sql.includes('INSERT INTO task_versions')) return { run: insertRunMock }
      if (sql.includes('UPDATE tasks SET')) return { run: vi.fn() }
      if (sql.includes('INSERT INTO dev_logs')) return { run: vi.fn() }
      return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: vi.fn(), all: vi.fn().mockReturnValue([]) }
    })

    const filesChanged = [{ path: 'src/login.vue', action: 'created' }]
    const testResult = { passed: true, typeCheck: true, details: 'all clean' }

    const res = await request(app)
      .post('/api/agent/task/t1/complete')
      .send({ aiOutput: '产出', summary: '完成登录', durationMs: 10000, filesChanged, testResult })
    expect(res.status).toBe(200)
    expect(res.body.data.versionNumber).toBe('V1.0')
    // 验证 INSERT 传入的参数包含 filesChanged 和 testResult
    expect(insertRunMock).toHaveBeenCalled()
    const callArgs = insertRunMock.mock.calls[0]
    // files_changed 是倒数第3个参数, test_result 倒数第2个, summary 倒数第1个
    expect(JSON.parse(callArgs[callArgs.length - 3])).toEqual(filesChanged)
    expect(JSON.parse(callArgs[callArgs.length - 2])).toEqual(testResult)
    expect(callArgs[callArgs.length - 1]).toBe('完成登录')
  })
})
