import axios from 'axios'
import type { ApiResponse } from '@/types'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截
http.interceptors.request.use(
  (config) => config,
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
