import axios from 'axios'
import type { ApiResponse } from '@/types'

const http = axios.create({
  baseURL: '/api',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截：注入 x-user header
http.interceptors.request.use(
  (config) => {
    try {
      const stored = localStorage.getItem('linesequence-currentUser')
      if (stored) {
        const username = JSON.parse(stored)
        if (username) config.headers['x-user'] = username
      }
    } catch { /* ignore */ }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截
http.interceptors.response.use(
  (response) => {
    const data = response.data as ApiResponse
    if (data.code !== 0) {
      return Promise.reject(new Error(data.message || '请求失败'))
    }
    return response.data
  },
  (error) => {
    console.error('[API Error]', error.message)
    return Promise.reject(error)
  }
)

export default http
