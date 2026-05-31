import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAll = vi.fn()
const mockGet = vi.fn()
const mockRun = vi.fn()

const mockDb = {
  prepare: () => ({
    all: mockAll,
    get: mockGet,
    run: mockRun,
    bind: vi.fn(),
  }),
  exec: vi.fn(),
}

vi.mock('../db/index.js', () => ({
  getDb: () => mockDb,
  initDatabase: vi.fn(),
}))

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-123',
}))

const userId = 'luql'

describe('Project Matcher - Title Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no results
    mockAll.mockReturnValue([])
    mockGet.mockReturnValue(undefined)
  })

  async function getModule() {
    return await import('./project-matcher.js')
  }

  it('should route "后台" tasks to 宁对接管理平台', async () => {
    const { matchProject } = await getModule()
    mockGet.mockReturnValue({
      id: 'cfg-admin', name: '宁对接管理平台', local_path: 'F:\\admin', git_url: '', branches: '[]', default_branch: 'dev_ningduijie', tags: '[]',
    })
    const result = matchProject({
      title: '【前端】后台页面样式统一调整',
      description: '',
      project: '宁对接小程序',
      module: '经济发展-企业服务-供需发布',
      customer: '新工数科',
    }, userId)
    expect(result).not.toBeNull()
    expect(result!.projectConfigName).toBe('宁对接管理平台')
    expect(result!.method).toBe('title_route')
    expect(result!.confidence).toBe(0.92)
  })

  it('should default to 宁对接小程序 for non-keyword titles', async () => {
    const { matchProject } = await getModule()
    mockGet.mockReturnValue({
      id: 'cfg-mp', name: '宁对接小程序', local_path: 'F:\\mp', git_url: '', branches: '[]', default_branch: 'dev', tags: '[]',
    })
    const result = matchProject({
      title: '【前端】活动详情页-报名列表展示',
      description: '',
      project: '宁对接小程序',
      module: '经济发展-企业服务-供需发布',
      customer: '新工数科',
    }, userId)
    expect(result).not.toBeNull()
    expect(result!.projectConfigName).toBe('宁对接小程序')
    expect(result!.method).toBe('title_route_default')
  })

  it('should route 南京场景 enterprise tasks', async () => {
    const { matchProject } = await getModule()
    mockGet.mockReturnValue({
      id: 'cfg-enterprise', name: '南京场景企业端', local_path: 'F:\\enterprise', git_url: '', branches: '[]', default_branch: 'develop', tags: '[]',
    })
    const result = matchProject({
      title: '【前端】企业端和小程序端场景能力发布表单优化',
      description: '',
      project: '南京场景创新服务平台',
      module: '经济发展-企业服务-条码服务',
      customer: '南京市场景创新发展有限责任公司',
    }, userId)
    expect(result).not.toBeNull()
    expect(result!.projectConfigName).toBe('南京场景企业端')
  })

  it('should fall through to exact match for 工信厅', async () => {
    const { matchProject } = await getModule()
    // title route: no match for 工信厅 (not in TITLE_ROUTES)
    // rules: mockAll returns []
    // history: mockAll returns []
    // exact: mockGet returns config
    mockGet.mockReturnValue({
      id: 'cfg-gxt', name: '江苏省工信厅工信系统大数据支撑服务平台', local_path: 'F:\\gxt', git_url: '', branches: '[]', default_branch: 'NanJing-LSGC', tags: '[]',
    })
    const result = matchProject({
      title: '【前端】绿色工厂-申报表单',
      description: '',
      project: '江苏省工信厅工信系统大数据支撑服务平台',
      module: '经济发展-项目申报',
      customer: '江苏省工业和信息化厅',
    }, userId)
    expect(result).not.toBeNull()
    expect(result!.projectConfigName).toBe('江苏省工信厅工信系统大数据支撑服务平台')
    expect(result!.method).toBe('exact')
  })

  it('should return null when no match at all', async () => {
    const { matchProject } = await getModule()
    // All layers return empty/undefined (default mock setup)
    const result = matchProject({
      title: '未知任务', description: '', project: '不存在的项目XYZ', module: '', customer: '',
    }, userId)
    expect(result).toBeNull()
  })
})

describe('Project Matcher - Document Groups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should group tasks by doc name with timestamp stripped', async () => {
    const { getDocumentGroups } = await import('./project-matcher.js')
    mockAll.mockReturnValue([
      { id: 't1', title: '任务A', project: '宁对接', req_doc_name: '2026052016140188_需求文档.pdf' },
      { id: 't2', title: '任务B', project: '宁对接', req_doc_name: '2026052016140188_需求文档.pdf' },
      { id: 't3', title: '任务C', project: '南京', req_doc_name: '2026050708235334_需求文档.pdf' },
    ])
    const groups = getDocumentGroups(userId)
    expect(groups.length).toBe(1)
    expect(groups[0].taskCount).toBe(3)
    expect(groups[0].docKey).toBe('需求文档.pdf')
  })

  it('should separate different document groups', async () => {
    const { getDocumentGroups } = await import('./project-matcher.js')
    mockAll.mockReturnValue([
      { id: 't1', title: 'A', project: 'P1', req_doc_name: '20260520_文档A.pdf' },
      { id: 't2', title: 'B', project: 'P1', req_doc_name: '20260520_文档B.pdf' },
    ])
    const groups = getDocumentGroups(userId)
    expect(groups.length).toBe(2)
    expect(groups.every(g => g.taskCount === 1)).toBe(true)
  })
})
