import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { loadPersisted, persist, clearPersisted, createPersistedRef } from './persistence'

beforeEach(() => {
  localStorage.clear()
})

describe('loadPersisted', () => {
  it('returns fallback when key does not exist', () => {
    expect(loadPersisted('missing', 'default')).toBe('default')
  })

  it('returns stored value when key exists', () => {
    localStorage.setItem('linesequence-mykey', JSON.stringify('hello'))
    expect(loadPersisted('mykey', 'default')).toBe('hello')
  })

  it('returns fallback on corrupt JSON', () => {
    localStorage.setItem('linesequence-bad', '{invalid}')
    expect(loadPersisted('bad', 42)).toBe(42)
  })

  it('handles array types', () => {
    localStorage.setItem('linesequence-arr', JSON.stringify([1, 2, 3]))
    expect(loadPersisted<number[]>('arr', [])).toEqual([1, 2, 3])
  })

  it('handles object types', () => {
    const obj = { name: 'test', count: 5 }
    localStorage.setItem('linesequence-obj', JSON.stringify(obj))
    expect(loadPersisted('obj', {})).toEqual(obj)
  })
})

describe('persist', () => {
  it('writes value to localStorage with prefix', () => {
    persist('test', { a: 1 })
    expect(localStorage.getItem('linesequence-test')).toBe('{"a":1}')
  })

  it('overwrites existing value', () => {
    persist('key', 'old')
    persist('key', 'new')
    expect(localStorage.getItem('linesequence-key')).toBe('"new"')
  })

  it('handles localStorage quota exceeded gracefully', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => persist('big', 'data')).not.toThrow()
    spy.mockRestore()
  })
})

describe('clearPersisted', () => {
  it('removes key from localStorage', () => {
    localStorage.setItem('linesequence-x', '1')
    clearPersisted('x')
    expect(localStorage.getItem('linesequence-x')).toBeNull()
  })

  it('does nothing when key does not exist', () => {
    expect(() => clearPersisted('nonexistent')).not.toThrow()
  })
})

describe('createPersistedRef', () => {
  it('initializes with fallback when no stored value', () => {
    const r = createPersistedRef('fresh', 'default')
    expect(r.value).toBe('default')
  })

  it('initializes from stored value', () => {
    localStorage.setItem('linesequence-saved', JSON.stringify('stored'))
    const r = createPersistedRef('saved', 'default')
    expect(r.value).toBe('stored')
  })

  it('auto-persists on value change', async () => {
    const r = createPersistedRef<string[]>('list', [])
    r.value = ['a', 'b']
    await nextTick()
    expect(localStorage.getItem('linesequence-list')).toBe('["a","b"]')
  })

  it('auto-persists array mutations', async () => {
    const r = createPersistedRef<string[]>('arr', [])
    r.value.push('x')
    await nextTick()
    expect(localStorage.getItem('linesequence-arr')).toBe('["x"]')
  })
})
