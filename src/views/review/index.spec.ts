import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import ReviewPage from './index.vue'
import { useTaskStore } from '@/stores/task'
import type { Task, TaskVersion } from '@/types'

// Mock Three.js
vi.mock('three', () => {
  function MockWebGLRenderer() { this.setPixelRatio = vi.fn(); this.setClearColor = vi.fn(); this.setSize = vi.fn(); this.render = vi.fn(); this.dispose = vi.fn(); this.forceContextLoss = vi.fn(); this.domElement = document.createElement('canvas') }
  function MockScene() { this.add = vi.fn(); this.children = []; this.traverse = vi.fn() }
  function MockCamera() { this.position = { set: vi.fn(), z: 0 }; this.lookAt = vi.fn(); this.aspect = 1; this.updateProjectionMatrix = vi.fn() }
  function MockBufferGeometry() { this.setAttribute = vi.fn(); this.getAttribute = vi.fn(() => ({ array: new Float32Array(0), needsUpdate: false })) }
  function MockClock() { this.getElapsedTime = () => 0 }
  function MockColor() { this.clone = () => ({ lerp: () => ({ r: 0, g: 0, b: 0 }) }) }
  function MockMesh() { this.position = { x: 0, y: 0, z: 0 }; this.rotation = { x: 0, y: 0, z: 0 }; this.material = { opacity: 1, color: { lerp: vi.fn() }, dispose: vi.fn() }; this.geometry = { dispose: vi.fn() } }
  return {
    Scene: MockScene, PerspectiveCamera: MockCamera, WebGLRenderer: MockWebGLRenderer,
    BufferGeometry: MockBufferGeometry, BufferAttribute: vi.fn(), Float32BufferAttribute: vi.fn(),
    PointsMaterial: vi.fn(), Points: vi.fn(), LineBasicMaterial: vi.fn(), LineSegments: vi.fn(),
    RingGeometry: vi.fn(), MeshBasicMaterial: vi.fn(), Mesh: MockMesh, DoubleSide: {},
    Clock: MockClock, Color: MockColor, AdditiveBlending: 2,
  }
})

// Mock APIs
vi.mock('@/api/version', () => ({
  versionApi: {
    list: vi.fn(),
    approve: vi.fn().mockResolvedValue({ code: 0, data: {} }),
    reject: vi.fn().mockResolvedValue({ code: 0, data: {} }),
    get: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('@/utils/http', () => ({
  default: { get: vi.fn().mockResolvedValue({ code: 0, data: { list: [], total: 0 } }), post: vi.fn(), patch: vi.fn() },
}))

function createMockRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/tasks/:id', component: { template: '<div/>' } }] })
}

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1', sourceId: 'SRC-001', intranetId: '', title: '测试任务', description: '',
    module: '', moduleShort: '', product: '', priority: 'medium', status: 'in_progress',
    deadline: '2026-06-30', createTime: '', updateTime: '', syncTime: '', tags: [], isSynced: true,
    project: '测试项目', customer: '', customerManager: '', taskType: '', bugOrReq: '',
    workHours: 8, submitTime: '', developer: '', supervisor: '', supervisorId: '',
    productManager: '', devLeader: '', handler: '', department: '', departmentId: '',
    isClosed: false, intranetNode: '', intranetNodeName: '', nodeIndex: 0,
    staleDays: 0, flowDays: 0, daysSinceCreate: 0, rejectFlag: false,
    flowId: '', workId: '', version: '',
    projectPath: 'F:/test', gitBranch: 'main', customDescription: '', acceptanceCriteria: '',
    requirementDoc: '', localPath: '', taskPageUrl: '',
    aiStatus: 'ai_review', reviewComment: '', reviewTime: '', reviewResult: '',
    completeTime: '', reworkCount: 0, aiOutput: '产出描述', aiQuestion: '',
    reqDocName: '', reqDocUrl: '', reqDocText: '', groupId: '',
    ...overrides,
  }
}

describe('ReviewPage - approve flow', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('calls versionApi.approve + updates task to ai_done', async () => {
    const { versionApi } = await import('@/api/version')
    const store = useTaskStore()
    const task = createMockTask({ id: 't1', aiStatus: 'ai_review' })
    store.tasks = [task]

    const router = createMockRouter()
    router.push('/review')
    await router.isReady()

    const wrapper = mount(ReviewPage, {
      global: { plugins: [ElementPlus, router] },
    })
    await flushPromises()

    // Set version in map
    const version: TaskVersion = {
      id: 'ver-1', taskId: 't1', versionNumber: 'V1.0', iteration: 0,
      aiOutput: '', devLogs: [], aiDurationMs: 0, prevReviewComment: '',
      status: 'pending_review', isFinal: false, gitCommitId: '', gitCommitTime: '',
      gitBranch: '', createdAt: '', filesChanged: [], testResult: { passed: true, typeCheck: true, details: '' },
      summary: '', screenshots: [], reportText: '', reportPath: '',
    }
    wrapper.vm.versionMap = { t1: version }

    // Mock updateTask
    store.updateTask = vi.fn().mockResolvedValue({ data: task })

    // Call handleApprove directly
    await wrapper.vm.handleApprove(task)
    await flushPromises()

    expect(versionApi.approve).toHaveBeenCalledWith('ver-1')
    expect(store.updateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ aiStatus: 'ai_done' }))
  })
})

describe('ReviewPage - reject flow', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('calls versionApi.reject and re-adds to todoList without overwriting ai_rework', async () => {
    const { versionApi } = await import('@/api/version')
    const store = useTaskStore()
    const task = createMockTask({ id: 't2', aiStatus: 'ai_review', reworkCount: 0, priority: 'medium' })
    store.tasks = [task]

    const router = createMockRouter()
    router.push('/review')
    await router.isReady()

    const wrapper = mount(ReviewPage, {
      global: { plugins: [ElementPlus, router] },
    })
    await flushPromises()

    // Set version in map
    const version: TaskVersion = {
      id: 'ver-2', taskId: 't2', versionNumber: 'V1.0', iteration: 0,
      aiOutput: '', devLogs: [], aiDurationMs: 0, prevReviewComment: '',
      status: 'pending_review', isFinal: false, gitCommitId: '', gitCommitTime: '',
      gitBranch: '', createdAt: '', filesChanged: [], testResult: { passed: true, typeCheck: true, details: '' },
      summary: '', screenshots: [], reportText: '', reportPath: '',
    }
    wrapper.vm.versionMap = { t2: version }

    // Set reject form state
    wrapper.vm.rejectTask = task
    wrapper.vm.rejectForm.comment = '需要修改XXX'

    // Mock updateTask
    store.updateTask = vi.fn().mockResolvedValue({ data: task })
    store.fetchTasks = vi.fn().mockResolvedValue(undefined)

    await wrapper.vm.handleReject()
    await flushPromises()

    // versionApi.reject should be called with version id and comment
    expect(versionApi.reject).toHaveBeenCalledWith('ver-2', '需要修改XXX')
    // Task should be in todoList
    expect(store.todoList).toContain('t2')
    // toggleTodo should NOT be called (which would overwrite ai_rework with '')
    // Priority should be upgraded
    expect(store.updateTask).toHaveBeenCalledWith('t2', expect.objectContaining({ priority: 'high' }))
  })

  it('fallback to direct update when no version exists', async () => {
    const store = useTaskStore()
    const task = createMockTask({ id: 't3', aiStatus: 'ai_review', reworkCount: 0 })
    store.tasks = [task]

    const router = createMockRouter()
    router.push('/review')
    await router.isReady()

    const wrapper = mount(ReviewPage, {
      global: { plugins: [ElementPlus, router] },
    })
    await flushPromises()

    // No version in map
    wrapper.vm.rejectTask = task
    wrapper.vm.rejectForm.comment = '问题'

    store.updateTask = vi.fn().mockResolvedValue({ data: task })
    store.fetchTasks = vi.fn().mockResolvedValue(undefined)

    await wrapper.vm.handleReject()
    await flushPromises()

    // Should have called updateTask with ai_rework directly
    expect(store.updateTask).toHaveBeenCalledWith('t3', expect.objectContaining({
      aiStatus: 'ai_rework',
      reworkCount: 1,
    }))
  })
})
