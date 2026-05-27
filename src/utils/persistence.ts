import { ref, watch, type Ref } from 'vue'

const PREFIX = 'linesequence-'

/** Read a value from localStorage, parsed as JSON. Returns fallback on miss/error. */
export function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw !== null ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Write a value to localStorage as JSON. */
export function persist<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch { /* quota exceeded */ }
}

/** Remove a persisted key. */
export function clearPersisted(key: string): void {
  localStorage.removeItem(PREFIX + key)
}

/**
 * Create a reactive ref initialized from localStorage and auto-persisted on change.
 * Call inside setup() or a composable.
 */
export function createPersistedRef<T>(key: string, fallback: T): Ref<T> {
  const r = ref<T>(loadPersisted(key, fallback))
  watch(r, (v) => persist(key, v), { deep: true })
  return r
}
