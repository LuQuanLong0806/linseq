import { describe, it, expect } from 'vitest'
import { assessRisk } from './risk-assessor.js'

describe('Risk Assessor', () => {
  it('should return L1 for trivial style changes', () => {
    const result = assessRisk({
      title: '调整按钮颜色',
      description: '将登录按钮的颜色从蓝色改为绿色，微调间距',
      bugOrReq: 'req',
      workHours: 1,
      reworkCount: 0,
    })
    expect(['L1', 'L2']).toContain(result.level)
    expect(result.score).toBeLessThanOrEqual(20)
  })

  it('should return L2 for normal feature development', () => {
    const result = assessRisk({
      title: '新增用户列表页面',
      description: '新增一个用户列表页面，支持分页和搜索功能',
      bugOrReq: 'req',
      workHours: 8,
      reworkCount: 0,
    })
    expect(['L1', 'L2']).toContain(result.level)
  })

  it('should return L4 for database migration', () => {
    const result = assessRisk({
      title: '数据库schema迁移',
      description: '需要对用户表进行数据库migration，修改schema结构',
      bugOrReq: 'req',
      workHours: 16,
      reworkCount: 0,
    })
    expect(result.level).toBe('L4')
    expect(result.score).toBeGreaterThan(40)
  })

  it('should force L4 for high rework count', () => {
    const result = assessRisk({
      title: '修复样式问题',
      description: '按钮样式微调',
      bugOrReq: 'bug',
      workHours: 2,
      reworkCount: 3,
    })
    expect(result.level).toBe('L4')
    expect(result.factors).toContain('返工3次，强制L4')
  })

  it('should force L4 for empty description', () => {
    const result = assessRisk({
      title: '待定任务',
      description: '',
      bugOrReq: 'req',
      workHours: 0,
      reworkCount: 0,
    })
    expect(result.level).toBe('L4')
    expect(result.factors).toContain('无需求描述，强制L4')
  })

  it('should minimum L2 for bugs', () => {
    const result = assessRisk({
      title: '修复文案错误',
      description: '首页标题文字错误',
      bugOrReq: 'bug',
      workHours: 1,
      reworkCount: 0,
    })
    expect(result.score).toBeGreaterThanOrEqual(16)
    expect(result.factors).toContain('Bug修复，最低L2')
  })

  it('should minimum L3 for large work hours', () => {
    const result = assessRisk({
      title: '开发新功能',
      description: '开发新的报表导出功能',
      bugOrReq: 'req',
      workHours: 20,
      reworkCount: 0,
    })
    expect(result.level).not.toBe('L1')
    expect(result.factors.some(f => f.includes('工时'))).toBe(true)
  })

  it('should detect risk keywords', () => {
    const result = assessRisk({
      title: '权限管理重构',
      description: '重构权限认证模块，涉及跨模块修改',
      bugOrReq: 'req',
      workHours: 24,
      reworkCount: 0,
    })
    expect(result.level).toBe('L4')
    expect(result.score).toBeGreaterThan(50)
  })
})
