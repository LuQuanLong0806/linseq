import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock APIs
vi.mock('@/api/task', () => ({
  taskApi: {
    getTasks: vi.fn().mockResolvedValue({ data: { list: [], total: 0 } }),
    syncFromIntranet: vi.fn().mockResolvedValue({ data: {} }),
    updateTask: vi.fn().mockResolvedValue({ data: {} }),
    addDevLog: vi.fn().mockResolvedValue({ data: {} }),
    createManualTask: vi.fn().mockResolvedValue({ data: { id: 'new-1', title: 'Test' } }),
    republishTask: vi.fn().mockResolvedValue({ data: { id: 'rp-1', title: 'Republish' } }),
    extractPdf: vi.fn().mockResolvedValue({ data: {} }),
  },
}))
vi.mock('@/api/group', () => ({
  groupApi: { list: vi.fn().mockResolvedValue({ data: [] }), create: vi.fn().mockResolvedValue({ data: {} }), update: vi.fn().mockResolvedValue({ data: {} }), delete: vi.fn().mockResolvedValue({}) },
}))
vi.mock('@/api/agent', () => ({
  agentApi: { saveTodoOrder: vi.fn().mockResolvedValue({}) },
}))

import { useTaskStore, type ViewMode } from './task'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('viewMode persistence', () => {
  it('defaults to table when nothing stored', () => {
    const store = useTaskStore()
    expect(store.viewMode).toBe('table')
  })

  it('restores from localStorage', () => {
    localStorage.setItem('linesequence-view-mode', JSON.stringify('planetary'))
    setActivePinia(createPinia())
    const store = useTaskStore()
    expect(store.viewMode).toBe('planetary')
  })

  it('falls back to table for invalid stored value', () => {
    localStorage.setItem('linesequence-view-mode', JSON.stringify('invalid_mode'))
    setActivePinia(createPinia())
    const store = useTaskStore()
    expect(store.viewMode).toBe('table')
  })

  it('persists via setViewMode', async () => {
    const store = useTaskStore()
    store.setViewMode('constellation')
    await new Promise(r => setTimeout(r, 0))
    expect(localStorage.getItem('linesequence-view-mode')).toBe('"constellation"')
    expect(store.viewMode).toBe('constellation')
  })

  it('supports all valid modes', () => {
    const store = useTaskStore()
    const modes: ViewMode[] = ['table', 'card', 'planetary', 'holographic', 'datastream', 'constellation']
    for (const m of modes) {
      store.setViewMode(m)
      expect(store.viewMode).toBe(m)
    }
  })
})

describe('todoList persistence', () => {
  it('defaults to empty array', () => {
    const store = useTaskStore()
    expect(store.todoList).toEqual([])
  })

  it('restores from localStorage', () => {
    localStorage.setItem('linesequence-todo-list', JSON.stringify(['a', 'b']))
    setActivePinia(createPinia())
    const store = useTaskStore()
    expect(store.todoList).toEqual(['a', 'b'])
  })

  it('isInTodoList works', () => {
    const store = useTaskStore()
    expect(store.isInTodoList('x')).toBe(false)
  })
})
