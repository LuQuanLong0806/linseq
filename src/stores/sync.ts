import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SyncConfig, SyncRecord } from '@/types'
import { syncApi } from '@/api/sync'

export const useSyncStore = defineStore('sync', () => {
  const config = ref<SyncConfig>({
    intranetUrl: '',
    autoSync: false,
    syncInterval: 30,
    lastSyncTime: '',
    loginCookie: '',
    cookieExpiry: '',
    webhookUrl: '',
    openclawToken: '',
    agentTarget: 'agent-209e563a',
  })
  const syncRecords = ref<SyncRecord[]>([])
  const syncing = ref(false)

  async function fetchConfig() {
    const res = await syncApi.getConfig()
    config.value = res.data
  }

  async function updateConfig(newConfig: Partial<SyncConfig>) {
    const res = await syncApi.updateConfig(newConfig)
    config.value = res.data
  }

  async function fetchSyncRecords() {
    const res = await syncApi.getRecords()
    syncRecords.value = res.data
  }

  async function triggerSync() {
    syncing.value = true
    try {
      const res = await syncApi.triggerSync()
      config.value.lastSyncTime = new Date().toISOString()
      await fetchSyncRecords()
      return res.data
    } finally {
      syncing.value = false
    }
  }

  return {
    config,
    syncRecords,
    syncing,
    fetchConfig,
    updateConfig,
    fetchSyncRecords,
    triggerSync,
  }
})
