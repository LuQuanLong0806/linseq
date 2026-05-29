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
  wakeAgent: vi.fn(),
}))

// Mock websocket
vi.mock('../websocket.js', () => ({
  broadcastToTask: vi.fn(),
  initWebSocket: vi.fn(),
}))

let app: express.Express

async function createApp() {
  const agentModule = await import('./agent.js')
  app = express()
  app.use(express.json())
  // Mock auth: 所有请求视为已登录用户 test-user
  app.use((req: any, _res: any, next: any) => { req.userId = 'test-user'; next() })
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
    expect(runMock).toHaveBeenCalledWith('todoList_test-user', JSON.stringify(['a', 'b', 'c']))
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
      acceptance_criteria: '验收标准', review_comment: '', group_id: '',
    }
    let callCount = 0
    mockPrepare.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: vi.fn() }
      if (callCount === 2) return { get: vi.fn().mockReturnValue({ ai_status: 'ai_todo' }) }
      if (callCount === 3) return { get: vi.fn().mockReturnValue({ ai_status: 'ai_todo' }) }
      if (callCount === 4) return { get: vi.fn().mockReturnValue(mockTask) }
      if (callCount === 5) return { get: vi.fn().mockReturnValue({ max_iter: null }) }
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
      if (callCount === 3) return { get: vi.fn().mockReturnValue({ ai_status: 'ai_todo' }) }
      if (callCount === 4) return { get: vi.fn().mockReturnValue(mockTask) }
      if (callCount === 5) return { get: vi.fn().mockReturnValue({ max_iter: null }) }
      // group lookup
      if (callCount === 6) return { get: vi.fn().mockReturnValue({ id: 'grp1', name: '登录模块', task_ids: JSON.stringify(['t1', 't2']) }) }
      // sibling task t2
      if (callCount === 7) return { get: vi.fn().mockReturnValue({ id: 't2', title: '分组任务B', ai_status: 'ai_todo' }) }
      // completed count check for t1
      if (callCount === 8) return { get: vi.fn().mockReturnValue(undefined) }
      // completed count check for t2
      if (callCount === 9) return { get: vi.fn().mockReturnValue(undefined) }
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
      if (callCount === 3) return { get: vi.fn().mockReturnValue({ ai_status: 'ai_todo' }) }
      if (callCount === 4) return { get: vi.fn().mockReturnValue(mockTask) }
      if (callCount === 5) return { get: vi.fn().mockReturnValue({ max_iter: null }) }
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
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('sync_config')) return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: vi.fn() }
      if (sql.includes('SELECT ai_status FROM tasks') && !sql.includes('ai_review')) return { get: vi.fn().mockReturnValue({ ai_status: 'ai_rework' }) }
      if (sql.includes('SELECT * FROM tasks WHERE id =')) return { get: vi.fn().mockReturnValue(mockTask) }
      if (sql.includes('MAX(iteration)')) return { get: vi.fn().mockReturnValue({ max_iter: 0 }) }
      if (sql.includes('task_versions') && sql.includes('rejected')) return { get: vi.fn().mockReturnValue({ version_number: 'V1.0', prev_review_comment: '', ai_output: '上一轮代码产出' }) }
      if (sql.includes('task_groups')) return { get: vi.fn().mockReturnValue(undefined) }
      if (sql.includes('SELECT id, title, ai_status') && sql.includes('WHERE id =')) return { get: vi.fn().mockReturnValue(undefined) }
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
    // 验证 INSERT 传入的参数包含 filesChanged, testResult, summary, screenshots, reportText
    expect(insertRunMock).toHaveBeenCalled()
    const callArgs = insertRunMock.mock.calls[0]
    // files_changed 倒数第5个, test_result 倒数第4个, summary 倒数第3个, screenshots 倒数第2个, report_text 倒数第1个
    expect(JSON.parse(callArgs[callArgs.length - 5])).toEqual(filesChanged)
    expect(JSON.parse(callArgs[callArgs.length - 4])).toEqual(testResult)
    expect(callArgs[callArgs.length - 3]).toBe('完成登录')
    expect(JSON.parse(callArgs[callArgs.length - 2])).toEqual([])
    expect(callArgs[callArgs.length - 1]).toBe('')
  })

  // ===== 新增：question 端点 =====
  it('POST /task/:id/question 成功提交疑问', async () => {
    const runMock = vi.fn()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM tasks')) return { get: vi.fn().mockReturnValue({ id: 't1', title: 'T' }) }
      if (sql.includes('UPDATE tasks SET')) return { run: runMock }
      if (sql.includes('INSERT INTO dev_logs')) return { run: vi.fn() }
      // getTodoList / saveTodoList / removeFromTodoList
      return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: runMock, all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app)
      .post('/api/agent/task/t1/question')
      .send({ question: '需求中提到的「用户中心」找不到对应模块' })
    expect(res.status).toBe(200)
    expect(res.body.data.aiStatus).toBe('ai_question')
    expect(res.body.message).toContain('待回复')
  })

  it('POST /task/:id/question 缺少 question 返回 400', async () => {
    const res = await request(app)
      .post('/api/agent/task/t1/question')
      .send({ question: '' })
    expect(res.status).toBe(400)
  })

  it('POST /task/:id/question 任务不存在返回 404', async () => {
    mockPrepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined), run: vi.fn() })
    const res = await request(app)
      .post('/api/agent/task/nonexist/question')
      .send({ question: '不明白需求' })
    expect(res.status).toBe(404)
  })

  // ===== chat/action: cancel_task =====
  it('POST /chat/action cancel_task 任务不存在返回 404', async () => {
    mockPrepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined), run: vi.fn() })
    const res = await request(app)
      .post('/api/agent/chat/action')
      .send({ action: 'cancel_task', taskId: 'nonexist' })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe(404)
  })

  it('POST /chat/action cancel_task 非开发中任务返回 400', async () => {
    mockPrepare.mockReturnValue({
      get: vi.fn().mockReturnValue({ id: 't1', ai_status: 'ai_review' }),
      run: vi.fn(),
    })
    const res = await request(app)
      .post('/api/agent/chat/action')
      .send({ action: 'cancel_task', taskId: 't1' })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('开发中')
  })

  it('POST /chat/action cancel_task 成功终止开发中任务', async () => {
    const runMock = vi.fn()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, ai_status FROM tasks WHERE id = ?')) return { get: vi.fn().mockReturnValue({ id: 't1', ai_status: 'ai_dev' }) }
      if (sql.includes('chat_sessions') && sql.includes('active')) return { get: vi.fn().mockReturnValue(undefined) }
      if (sql.includes('UPDATE tasks')) return { run: runMock }
      if (sql.includes('sync_config')) return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: runMock }
      return { get: vi.fn().mockReturnValue(undefined), run: runMock, all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app)
      .post('/api/agent/chat/action')
      .send({ action: 'cancel_task', taskId: 't1', message: '不需要了' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.taskId).toBe('t1')
  })

  // ===== chat/action: typing =====
  it('POST /chat/action typing 设置输入状态', async () => {
    const res = await request(app)
      .post('/api/agent/chat/action')
      .send({ action: 'typing', taskId: 't1' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
  })

  it('POST /chat/action typing_stop 清除输入状态', async () => {
    const res = await request(app)
      .post('/api/agent/chat/action')
      .send({ action: 'typing_stop', taskId: 't1' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
  })

  // ===== chat/action: send_message =====
  it('POST /chat/action send_message 带 replyTo 拼接引用前缀', async () => {
    const { wakeAgent } = await import('./tasks.js')
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('chat_sessions') && sql.includes('active')) return { get: vi.fn().mockReturnValue(undefined) }
      if (sql.includes('INSERT INTO agent_chat_logs')) return { run: vi.fn() }
      if (sql.includes('INSERT INTO task_supplements')) return { run: vi.fn() }
      if (sql.includes('sync_config')) return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: vi.fn() }
      return { get: vi.fn().mockReturnValue(undefined), run: vi.fn(), all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app)
      .post('/api/agent/chat/action')
      .send({
        action: 'send_message',
        taskId: 't1',
        message: '请检查一下',
        payload: { replyTo: '进度上报：已完成50%', replyToType: 'progress' },
      })
    expect(res.status).toBe(200)
    expect(wakeAgent).toHaveBeenCalled()
    const calls = (wakeAgent as ReturnType<typeof vi.fn>).mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1]).toContain('[回复 Agent「progress: 进度上报：已完成50%」]')
    expect(lastCall[1]).toContain('请检查一下')
  })

  it('POST /chat/action send_message 无 replyTo 发送原始消息', async () => {
    const { wakeAgent } = await import('./tasks.js')
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('chat_sessions') && sql.includes('active')) return { get: vi.fn().mockReturnValue(undefined) }
      if (sql.includes('INSERT INTO agent_chat_logs')) return { run: vi.fn() }
      if (sql.includes('INSERT INTO task_supplements')) return { run: vi.fn() }
      if (sql.includes('sync_config')) return { get: vi.fn().mockReturnValue({ value: JSON.stringify(['t1']) }), run: vi.fn() }
      return { get: vi.fn().mockReturnValue(undefined), run: vi.fn(), all: vi.fn().mockReturnValue([]) }
    })

    const res = await request(app)
      .post('/api/agent/chat/action')
      .send({ action: 'send_message', taskId: 't1', message: '你好' })
    expect(res.status).toBe(200)
    expect(wakeAgent).toHaveBeenCalled()
    const calls = (wakeAgent as ReturnType<typeof vi.fn>).mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1]).toBe('你好')
  })

  it('POST /chat/action send_message 缺少消息返回 400', async () => {
    const res = await request(app)
      .post('/api/agent/chat/action')
      .send({ action: 'send_message', taskId: 't1' })
    expect(res.status).toBe(400)
  })

  // ===== chat/action: unknown =====
  it('POST /chat/action 未知操作返回 400', async () => {
    const res = await request(app)
      .post('/api/agent/chat/action')
      .send({ action: 'unknown_action' })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('未知操作')
  })
})
