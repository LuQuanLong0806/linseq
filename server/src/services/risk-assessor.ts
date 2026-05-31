/**
 * 风险评估服务
 * 基于规则的风险评分，自动建议 ATEP 等级
 */

interface RiskInput {
  title: string
  description: string
  bugOrReq: string
  workHours: number
  reworkCount: number
}

interface RiskOutput {
  level: 'L1' | 'L2' | 'L3' | 'L4'
  score: number
  factors: string[]
}

const RISK_KEYWORDS: Record<string, string[]> = {
  L4: ['数据库', 'migration', '删除', '清空', '权限', '认证', '支付', '密码', 'schema', 'drop', 'truncate'],
  L3: ['重构', '重写', '优化性能', '架构', '跨模块', '迁移', 'refactor', 'rewrite', 'migration'],
  L2: ['新增', '开发', '实现', '对接', '集成'],
  L1: ['样式', '颜色', '字体', '文案', '间距', '圆角', '微调', 'style', 'css', 'text'],
}

function calcComplexity(text: string, workHours: number): { score: number; factors: string[] } {
  const factors: string[] = []
  let score = 0
  if (workHours >= 16) { score += 15; factors.push('大工时任务(≥16h)') }
  else if (workHours >= 8) { score += 8; factors.push('中等工时(≥8h)') }
  const moduleCount = (text.match(/模块|module/gi) || []).length
  if (moduleCount >= 2) { score += 10; factors.push('涉及多模块') }
  return { score: Math.min(score, 30), factors }
}

function calcRisk(text: string): { score: number; level: string; factors: string[] } {
  const lower = text.toLowerCase()
  const factors: string[] = []
  let score = 0
  let maxLevel = 'L1'

  for (const [level, keywords] of Object.entries(RISK_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        const levelScore = level === 'L4' ? 30 : level === 'L3' ? 20 : level === 'L2' ? 10 : 3
        score += levelScore
        const maxLevelRank = { L1: 1, L2: 2, L3: 3, L4: 4 } as Record<string, number>
        if ((maxLevelRank[level] || 0) > (maxLevelRank[maxLevel] || 0)) {
          maxLevel = level
        }
        factors.push(`关键词命中: "${kw}" (${level})`)
      }
    }
  }
  return { score: Math.min(score, 40), level: maxLevel, factors }
}

function calcUncertainty(description: string): { score: number; factors: string[] } {
  const factors: string[] = []
  let score = 0
  if (!description || description.length < 20) { score += 20; factors.push('需求描述过短') }
  if (description.includes('待定') || description.includes('TBD') || description.includes('TODO')) {
    score += 15; factors.push('需求有待定项')
  }
  return { score: Math.min(score, 30), factors }
}

function scoreToLevel(score: number): 'L1' | 'L2' | 'L3' | 'L4' {
  if (score <= 15) return 'L1'
  if (score <= 40) return 'L2'
  if (score <= 70) return 'L3'
  return 'L4'
}

/** 合并风险等级：取 riskCalc 的 maxLevel 和 totalScore 中更高的等级 */
function mergeLevels(riskLevel: string, scoreLevel: 'L1' | 'L2' | 'L3' | 'L4'): 'L1' | 'L2' | 'L3' | 'L4' {
  const rank = { L1: 1, L2: 2, L3: 3, L4: 4 } as Record<string, number>
  return (rank[riskLevel] || 0) >= (rank[scoreLevel] || 0) ? riskLevel as any : scoreLevel
}

export function assessRisk(input: RiskInput): RiskOutput {
  const text = `${input.title} ${input.description}`
  const complexity = calcComplexity(text, input.workHours)
  const risk = calcRisk(text)
  const uncertainty = calcUncertainty(input.description)

  let totalScore = complexity.score + risk.score + uncertainty.score
  const factors = [...complexity.factors, ...risk.factors, ...uncertainty.factors]

  // 特殊规则
  if (input.bugOrReq === 'bug') {
    totalScore = Math.max(totalScore, 16)
    factors.push('Bug修复，最低L2')
  }
  if (input.reworkCount >= 2) {
    totalScore = Math.max(totalScore, 71)
    factors.push(`返工${input.reworkCount}次，强制L4`)
  }
  if (input.workHours >= 16) {
    totalScore = Math.max(totalScore, 41)
    factors.push('工时≥16h，最低L3')
  }
  if (!input.description) {
    totalScore = Math.max(totalScore, 71)
    factors.push('无需求描述，强制L4')
  }

  const level = input.reworkCount >= 2 ? 'L4' : mergeLevels(risk.level, scoreToLevel(totalScore))

  return { level, score: Math.min(totalScore, 100), factors }
}
