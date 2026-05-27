import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()

vi.mock('@/utils/http', () => ({
  default: { get: mockGet, post: mockPost },
}))

describe('agentApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-import to get fresh module with fresh mock refs
    vi.resetModules()
  })

  it('saveTodoOrder 调用 POST /agent/todo-order', async () => {
    mockPost.mockResolvedValue({ code: 0, data: null })
    const { agentApi } = await import('@/api/agent')
    await agentApi.saveTodoOrder(['a', 'b'])
    expect(mockPost).toHaveBeenCalledWith('/agent/todo-order', { todoList: ['a', 'b'] })
  })

  it('getTodoOrder 调用 GET /agent/todo-order', async () => {
    mockGet.mockResolvedValue({ code: 0, data: { todoList: ['x'] } })
    const { agentApi } = await import('@/api/agent')
    const res = await agentApi.getTodoOrder()
    expect(mockGet).toHaveBeenCalledWith('/agent/todo-order')
    expect(res.data.todoList).toEqual(['x'])
  })
})
