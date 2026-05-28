import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { User, AgentKey } from '@/types'
import { userApi } from '@/api/user'

const STORAGE_KEY = 'linesequence-currentUser'
const TOKEN_KEY = 'linesequence-token'

function persistCurrentUser(username: string | null) {
  if (username) localStorage.setItem(STORAGE_KEY, JSON.stringify(username))
  else localStorage.removeItem(STORAGE_KEY)
}

function persistToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
  else localStorage.removeItem(TOKEN_KEY)
}

function getStoredToken(): string | null {
  try {
    const t = localStorage.getItem(TOKEN_KEY)
    return t ? JSON.parse(t) : null
  } catch { return null }
}

export const useUserStore = defineStore('user', () => {
  const users = ref<User[]>([])
  const currentUser = ref<User | null>(null)
  const token = ref<string | null>(getStoredToken())
  const loginLoading = ref(false)
  const agentKeys = ref<AgentKey[]>([])

  watch(currentUser, (u) => persistCurrentUser(u?.username || null))

  async function fetchUsers() {
    const res = await userApi.list()
    users.value = res.data
  }

  async function fetchCurrentUser() {
    const res = await userApi.current()
    if (res.data) {
      const { token: newToken, ...user } = res.data as any
      if (newToken) {
        token.value = newToken
        persistToken(newToken)
      }
      currentUser.value = user
    } else {
      currentUser.value = null
    }
  }

  async function login(username: string, password: string) {
    loginLoading.value = true
    try {
      const res = await userApi.login(username, password)
      const { token: newToken, ...user } = res.data as any
      token.value = newToken || null
      persistToken(newToken || null)
      currentUser.value = user
      await fetchUsers()
      return res.data
    } finally {
      loginLoading.value = false
    }
  }

  async function switchUser(username: string) {
    const res = await userApi.switchUser(username) as any
    if (res.data?.token) {
      token.value = res.data.token
      persistToken(res.data.token)
    }
    await fetchCurrentUser()
  }

  async function deleteUser(username: string) {
    await userApi.delete(username)
    await fetchUsers()
    if (currentUser.value?.username === username) {
      token.value = null
      persistToken(null)
      currentUser.value = users.value.length > 0 ? users.value[0] : null
      if (currentUser.value) await switchUser(currentUser.value.username)
    }
  }

  async function refreshCookie(username: string) {
    await userApi.refresh(username)
    await fetchCurrentUser()
  }

  // Agent Keys
  async function fetchAgentKeys(username: string) {
    const res = await userApi.listAgentKeys(username)
    agentKeys.value = res.data
  }

  async function createAgentKey(username: string, name?: string) {
    const res = await userApi.createAgentKey(username, name)
    await fetchAgentKeys(username)
    return res.data
  }

  async function toggleAgentKey(id: string) {
    const res = await userApi.toggleAgentKey(id)
    if (currentUser.value) await fetchAgentKeys(currentUser.value.username)
    return res.data
  }

  async function deleteAgentKey(id: string) {
    await userApi.deleteAgentKey(id)
    if (currentUser.value) await fetchAgentKeys(currentUser.value.username)
  }

  async function init() {
    await Promise.all([fetchUsers(), fetchCurrentUser()])
  }

  return {
    users, currentUser, token, loginLoading, agentKeys,
    fetchUsers, fetchCurrentUser, login, switchUser, deleteUser, refreshCookie,
    fetchAgentKeys, createAgentKey, toggleAgentKey, deleteAgentKey,
    init,
  }
})
