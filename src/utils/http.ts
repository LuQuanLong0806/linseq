import axios from 'axios'
import type { ApiResponse } from '@/types'

const http = axios.create({
  baseURL: '/api',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截：注入 Authorization: Bearer <token>
http.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem('linesequence-token')
      if (token) {
        config.headers['Authorization'] = `Bearer ${JSON.parse(token)}`
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
    if (error.response?.status === 401) {
      // token 过期，清除并跳转同步中心（登录页）
      localStorage.removeItem('linesequence-token')
      localStorage.removeItem('linesequence-currentUser')
      if (window.location.pathname !== '/sync') {
        window.location.href = '/sync'
      }
      return Promise.reject(new Error('登录已过期，请重新登录'))
    }
    console.error('[API Error]', error.message)
    return Promise.reject(error)
  }
)

export default http
