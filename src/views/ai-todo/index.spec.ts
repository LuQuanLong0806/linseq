import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import AITodo from './index.vue'
import { useTaskStore } from '@/stores/task'

vi.mock('three', () => {
  function MockScene() { this.add = vi.fn(); this.children = [] }
  function MockCamera() { this.position = { z: 0 }; this.aspect = 1; this.updateProjectionMatrix = vi.fn() }
  function MockRenderer() { this.setPixelRatio = vi.fn(); this.setClearColor = vi.fn(); this.setSize = vi.fn(); this.render = vi.fn(); this.dispose = vi.fn() }
  function MockBufferGeometry() { this.setAttribute = vi.fn() }
  function MockColor() { this.clone = () => ({ lerp: () => ({ r: 0, g: 0, b: 0 }) }) }
  function MockClock() { this.getElapsedTime = () => 0 }
  function MockPoints() { this.rotation = { x: 0, y: 0, z: 0 } }
  function MockLineSegments() { this.rotation = { x: 0, y: 0, z: 0 } }
  function MockMesh() { this.rotation = { x: 0, y: 0, z: 0 } }
  return {
    Scene: MockScene, PerspectiveCamera: MockCamera, WebGLRenderer: MockRenderer,
    BufferGeometry: MockBufferGeometry, BufferAttribute: vi.fn(), Float32BufferAttribute: vi.fn(),
    PointsMaterial: vi.fn(), Points: MockPoints, LineBasicMaterial: vi.fn(),
    LineSegments: MockLineSegments, RingGeometry: vi.fn(), MeshBasicMaterial: vi.fn(),
    Mesh: MockMesh, DoubleSide: {}, Color: MockColor, Clock: MockClock,
  }
})

vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn() } }))

vi.mock('@/utils/http', () => ({
  default: { get: vi.fn().mockResolvedValue({ code: 0, data: { list: [], total: 0 } }), post: vi.fn(), patch: vi.fn().mockResolvedValue({ code: 0, data: {} }) },
}))

const stubs = {
  'el-tag': { props: ['type', 'size', 'effect'], template: '<span><slot /></span>' },
  'el-button': { props: ['type', 'size', 'link'], template: '<button><slot /></button>' },
}

const mockTask = (o = {}) => ({
  id: '1', sourceId: 'S001', title: '测试任务', description: '', module: '核心',
  moduleShort: '', product: '', priority: 'high' as const, status: 'in_progress' as const,
  deadline: '2099-12-31', createTime: '', updateTime: '', syncTime: '',
  devLog: [], tags: [], isSynced: false, project: '项目A', customer: '', customerManager: '',
  taskType: '', bugOrReq: '', workHours: 0, submitTime: '', developer: '', supervisor: '',
  supervisorId: '', productManager: '', devLeader: '', handler: '', department: '',
  departmentId: '', isClosed: false, intranetNode: '', intranetNodeName: '', nodeIndex: 0,
  staleDays: 0, flowDays: 0, daysSinceCreate: 0, rejectFlag: false, flowId: '', workId: '',
  version: '', projectPath: 'F:/dev', gitBranch: 'main', customDescription: '',
  acceptanceCriteria: '', requirementDoc: '', localPath: '', taskPageUrl: '',
  aiStatus: '', reviewComment: '', reviewTime: '', reviewResult: '',
  completeTime: '', reworkCount: 0, aiOutput: '', ...o,
})

describe('AI待办页面', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(window, 'cancelAnimationFrame').mockReturnValue()
  })

  function mountWith(setup?: (store: ReturnType<typeof useTaskStore>) => void) {
    if (setup) setup(useTaskStore())
    return mount(AITodo, { global: { plugins: [pinia], stubs }, attachTo: document.body })
  }

  it('渲染空状态', async () => {
    const w = mountWith()
    await flushPromises(); await nextTick()
    expect(w.find('.empty-state').exists()).toBe(true)
    expect(w.text()).toContain('暂无 AI 待办任务')
  })

  it('渲染待办卡片', async () => {
    const w = mountWith(s => {
      s.tasks = [mockTask({ id: 't1', sourceId: 'S100', title: '开发登录页' })]
      s.todoList = ['t1']
    })
    await flushPromises(); await nextTick()
    expect(w.find('.card-grid').exists()).toBe(true)
    expect(w.findAll('.todo-card').length).toBe(1)
    expect(w.text()).toContain('开发登录页')
    expect(w.find('.card-rank').text()).toBe('1')
  })

  it('显示项目配置信息', async () => {
    const w = mountWith(s => {
      s.tasks = [mockTask({ id: 't1', projectPath: 'F:/proj', gitBranch: 'feat/x' })]
      s.todoList = ['t1']
    })
    await flushPromises(); await nextTick()
    expect(w.text()).toContain('F:/proj')
    expect(w.text()).toContain('feat/x')
  })

  it('拖拽排序交换顺序', async () => {
    const w = mountWith(s => {
      s.tasks = [mockTask({ id: 'a', title: '任务A' }), mockTask({ id: 'b', title: '任务B' })]
      s.todoList = ['a', 'b']
    })
    await flushPromises(); await nextTick()

    const cards = w.findAll('.todo-card')
    expect(cards.length).toBe(2)
    expect(cards[0].find('.card-title').text()).toBe('任务A')
    expect(cards[1].find('.card-title').text()).toBe('任务B')

    await cards[0].trigger('dragstart', { dataTransfer: { effectAllowed: '' } })
    await cards[1].trigger('dragover')
    await cards[1].trigger('drop')
    expect(useTaskStore().todoList).toEqual(['b', 'a'])
  })

  it('移出待办', async () => {
    const w = mountWith(s => {
      s.tasks = [mockTask({ id: 't1' })]
      s.todoList = ['t1']
    })
    await flushPromises(); await nextTick()
    expect(useTaskStore().isInTodoList('t1')).toBe(true)
    await w.findAll('.card-actions button')[2].trigger('click')
    expect(useTaskStore().isInTodoList('t1')).toBe(false)
  })

  it('Three.js canvas 存在', async () => {
    const w = mountWith()
    await flushPromises()
    expect(w.find('canvas.bg-canvas').exists()).toBe(true)
  })

  it('标题渐变文字', async () => {
    const w = mountWith()
    await flushPromises()
    const glow = w.find('.glow-text')
    expect(glow.exists()).toBe(true)
    expect(glow.text()).toContain('AI 待办队列')
  })
})
