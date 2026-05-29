import { ref } from 'vue'

const isDesktop = ref(false)

// 延迟检测：Tauri 注入 __TAURI__ 可能在 DOM ready 之后
if (typeof window !== 'undefined') {
  isDesktop.value = !!(window as any).__TAURI__
}

export function useDesktop() {

  async function pickFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
    if (!isDesktop.value) return null
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const result = await open({ multiple: false, filters })
      return typeof result === 'string' ? result : null
    } catch { return null }
  }

  async function pickFolder(): Promise<string | null> {
    if (!isDesktop.value) return null
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const result = await open({ directory: true })
      return typeof result === 'string' ? result : null
    } catch { return null }
  }

  async function sendNotification(title: string, body: string) {
    try {
      if (isDesktop.value) {
        const { sendNotification: tauriNotify } = await import('@tauri-apps/plugin-notification')
        tauriNotify({ title, body })
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body })
      } else if ('Notification' in window && Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission()
        if (perm === 'granted') new Notification(title, { body })
      }
    } catch { /* ignore */ }
  }

  async function openInExplorer(path: string) {
    if (!isDesktop.value) return
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      open(path)
    } catch { /* ignore */ }
  }

  return { isDesktop, pickFile, pickFolder, sendNotification, openInExplorer }
}
