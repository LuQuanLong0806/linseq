import http from '@/utils/http'

export interface ProjectConfig {
  id: string
  name: string
  localPath: string
  gitUrl: string
  branches: string[]
  defaultBranch: string
  tags: string[]
  note: string
  createdAt: string
  updatedAt: string
}

export const projectApi = {
  list(): Promise<{ code: number; message: string; data: ProjectConfig[] }> {
    return http.get('/projects')
  },

  create(data: Partial<ProjectConfig>): Promise<{ code: number; message: string; data: ProjectConfig }> {
    return http.post('/projects', data)
  },

  update(id: string, data: Partial<ProjectConfig>): Promise<{ code: number; message: string; data: ProjectConfig }> {
    return http.put(`/projects/${id}`, data)
  },

  remove(id: string): Promise<{ code: number; message: string; data: null }> {
    return http.delete(`/projects/${id}`)
  },

  fetchBranches(id: string): Promise<{ code: number; message: string; data: ProjectConfig }> {
    return http.post(`/projects/${id}/fetch-branches`)
  },

  detectGit(localPath: string): Promise<{ code: number; message: string; data: { exists: boolean; isGitRepo: boolean; gitUrl: string; branches: string[] } }> {
    return http.post('/projects/detect-git', { localPath })
  },

  getByName(name: string): Promise<{ code: number; message: string; data: ProjectConfig | null }> {
    return http.get(`/projects/by-name/${encodeURIComponent(name)}`)
  },
}
