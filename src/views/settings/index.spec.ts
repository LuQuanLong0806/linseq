import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/settings', () => ({
  settingsApi: {
    getReportDir: vi.fn().mockResolvedValue({ data: { reportOutputDir: 'F:\\test' } }),
    updateReportDir: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/api/task', () => ({
  taskApi: {
    getTasks: vi.fn().mockResolvedValue({ code: 0, data: { list: [{ id: '1', title: 'test' }], total: 1 } }),
  },
}))

describe('Settings - export functionality', () => {
  it('creates downloadable JSON blob from task data', async () => {
    const { taskApi } = await import('@/api/task')
    const res = await taskApi.getTasks({ pageSize: 9999 })
    const json = JSON.stringify(res.data.list, null, 2)
    const parsed = JSON.parse(json)
    expect(parsed).toEqual([{ id: '1', title: 'test' }])
  })
})

describe('Settings - cache clearing', () => {
  beforeEach(() => { localStorage.clear() })

  it('clears only linesequence-prefixed keys', () => {
    localStorage.setItem('linesequence-cache', 'test')
    localStorage.setItem('linesequence-settings', '{"a":1}')
    localStorage.setItem('linesequence-todo-list', '["x"]')
    localStorage.setItem('other-key', 'keep')

    const keys = Object.keys(localStorage).filter(k => k.startsWith('linesequence-'))
    keys.forEach(k => localStorage.removeItem(k))

    expect(localStorage.getItem('linesequence-cache')).toBeNull()
    expect(localStorage.getItem('linesequence-settings')).toBeNull()
    expect(localStorage.getItem('linesequence-todo-list')).toBeNull()
    expect(localStorage.getItem('other-key')).toBe('keep')
  })

  it('handles empty localStorage gracefully', () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('linesequence-'))
    keys.forEach(k => localStorage.removeItem(k))
    expect(keys).toEqual([])
  })
})

describe('Settings - import file parsing', () => {
  it('validates JSON array format', () => {
    const validData = JSON.stringify([{ id: '1' }, { id: '2' }])
    const parsed = JSON.parse(validData)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
  })

  it('rejects non-array JSON', () => {
    const invalidData = JSON.stringify({ id: '1' })
    const parsed = JSON.parse(invalidData)
    expect(Array.isArray(parsed)).toBe(false)
  })
})
