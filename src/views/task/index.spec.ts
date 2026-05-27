import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import TaskList from './index.vue'
import { useTaskStore } from '@/stores/task'

vi.mock('@/utils/http', () => ({
  default: { get: vi.fn().mockResolvedValue({ code: 0, data: { list: [], total: 0 } }), post: vi.fn(), patch: vi.fn() },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal() as any
  return { ...actual, default: actual.default, ElMessage: { success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: vi.fn().mockRejectedValue('cancel') } }
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/tasks', component: { template: '<div />' } },
    { path: '/tasks/:id', name: 'TaskDetail', component: { template: '<div />' } },
  ],
})

describe('任务列表页面', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    await router.push('/tasks')
    await router.isReady()
  })

  function mountWith(setup?: (store: ReturnType<typeof useTaskStore>) => void) {
    if (setup) setup(useTaskStore())
    return mount(TaskList, { global: { plugins: [pinia, router, ElementPlus] } })
  }

  it('渲染页面结构', async () => {
    const w = mountWith()
    await flushPromises(); await nextTick()
    expect(w.find('.task-list-page').exists()).toBe(true)
    expect(w.find('.filter-card').exists()).toBe(true)
    expect(w.find('.kanban-view').exists()).toBe(true)
  })

  it('表格列头包含新增3列', async () => {
    const w = mountWith(s => {
      s.tasks = [{ id: 't1', sourceId: 'S001', intranetId: '', title: '测试', description: '', module: '', moduleShort: '', product: '', priority: 'high' as const, status: 'in_progress' as const, deadline: '2099-12-31', createTime: '', updateTime: '', syncTime: '', devLog: [], tags: [], isSynced: false, project: 'A', customer: '', customerManager: '', taskType: '', bugOrReq: '', workHours: 8, submitTime: '', developer: '', supervisor: '', supervisorId: '', productManager: '', devLeader: '', handler: '', department: '', departmentId: '', isClosed: false, intranetNode: '', intranetNodeName: '', nodeIndex: 0, staleDays: 5, flowDays: 0, daysSinceCreate: 0, rejectFlag: false, flowId: '', workId: '', version: '', projectPath: '', gitBranch: '', customDescription: '简述', acceptanceCriteria: '', requirementDoc: '', localPath: '', taskPageUrl: '', aiStatus: '', reviewComment: '', reviewTime: '', reviewResult: '', completeTime: '', reworkCount: 0, aiOutput: '', reqDocName: '', reqDocUrl: '', reqDocText: '', groupId: '', aiQuestion: '' }]
    })
    await flushPromises(); await nextTick()
    const html = w.html()
    expect(html).toContain('任务简述')
    expect(html).toContain('滞留天数')
    expect(html).toContain('计划小时')
  })

  it('包含筛选栏、视图切换、分页', async () => {
    const w = mountWith()
    await flushPromises(); await nextTick()
    expect(w.find('.filter-card').exists()).toBe(true)
    expect(w.find('.toolbar').exists()).toBe(true)
    expect(w.find('.pagination-area').exists()).toBe(true)
  })
})
