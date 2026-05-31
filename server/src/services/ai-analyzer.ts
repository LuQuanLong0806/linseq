/**
 * AI 分析服务 — 规则优先 + AI 精炼
 * 规则引擎先跑一轮，高置信直接用，低置信才调 AI（只发候选，省 token）
 */
import { getDb } from '../db/index.js'
import { matchProject, recordHistory } from './project-matcher.js'
import { assessRisk } from './risk-assessor.js'

// ========== 类型 ==========

export interface AnalysisResult {
  source: 'rules' | 'ai' | 'rules+ai'
  projectMatch: {
    matched: boolean
    projectConfigId: string
    projectConfigName: string
    localPath: string
    defaultBranch: string
    confidence: number
    method: string
    reason: string
    branchSuggestion?: string
  } | null
  risk: {
    level: 'L1' | 'L2' | 'L3' | 'L4'
    score: number
    factors: string[]
  }
  summary?: string
  acceptanceCriteria?: string
  aiError?: string
}

interface AiResponse {
  projectMatch: { configId: string; configName: string; confidence: number; reason: string; branchSuggestion: string }
  riskAssessment: { level: string; score: number; factors: string[] }
  acceptanceCriteria: string
  summary: string
}

const AI_TIMEOUT = 30_000

// 精简 prompt：AI 只需在候选中做选择，不需要完整规则说明
const SYSTEM_PROMPT = `你是任务分析器。规则引擎已给出初步结果和候选项目，请综合判断并返回JSON。

严格按以下格式回复，不要输出其他内容：
{
  "projectMatch": {
    "configId": "选中的候选id，都不合适则为空字符串",
    "configName": "项目配置名",
    "confidence": 0.0到1.0,
    "reason": "选择原因",
    "branchSuggestion": "建议分支名"
  },
  "riskAssessment": {
    "level": "L1/L2/L3/L4",
    "score": 0到100,
    "factors": ["风险因素"]
  },
  "acceptanceCriteria": "验收标准，每行一条",
  "summary": "一句话摘要"
}

风险等级：L1(0-15微操作) L2(16-40常规) L3(41-70重要) L4(71-100关键)。
Bug最低L2，返工>=2强制L4，工时>=16最低L3。`

// ========== 核心函数 ==========

/**
 * 单任务分析
 * 流程：规则引擎 → 高置信直接用 → 低置信调 AI 精炼
 */
export async function analyzeTask(taskId: string, userId: string): Promise<AnalysisResult> {
  const db = getDb()

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId) as Record<string, unknown> | undefined
  if (!task) throw new Error('任务不存在')

  const title = (task.title as string) || ''
  const description = (task.description as string) || ''
  const matchInput = { title, description, project: (task.project as string) || '', module: (task.module as string) || '', customer: (task.customer as string) || '' }
  const riskInput = { title, description, bugOrReq: (task.bug_or_req as string) || '', workHours: (task.work_hours as number) || 0, reworkCount: (task.rework_count as number) || 0 }

  // ① 规则引擎先跑一轮
  const ruleMatch = matchProject(matchInput, userId)
  const ruleRisk = assessRisk(riskInput)

  // ② 高置信匹配 + 风险明确 → 直接用规则结果，不调 AI
  if (ruleMatch && ruleMatch.confidence >= 0.9) {
    const result: AnalysisResult = {
      source: 'rules',
      projectMatch: {
        matched: true, projectConfigId: ruleMatch.projectConfigId, projectConfigName: ruleMatch.projectConfigName,
        localPath: ruleMatch.localPath, defaultBranch: ruleMatch.defaultBranch,
        confidence: ruleMatch.confidence, method: ruleMatch.method, reason: ruleMatch.reason,
      },
      risk: { level: ruleRisk.level, score: ruleRisk.score, factors: ruleRisk.factors },
    }
    writeAnalysisToDb(db, taskId, userId, result)
    return result
  }

  // ③ 规则不确定 → 收集候选，调 AI 精炼
  const configs = db.prepare('SELECT id, name, local_path, default_branch, tags FROM project_configs WHERE user_id = ?').all(userId) as Array<{ id: string; name: string; local_path: string; default_branch: string; tags: string }>
  const reqDocText = (task.req_doc_text as string) || ''

  // 收集候选：规则匹配 + 同内网项目的所有配置
  const candidates = collectCandidates(ruleMatch, matchInput.project, configs)

  let aiResult: AnalysisResult | null = null
  const aiError = await tryAiRefine(task, candidates, ruleMatch, ruleRisk, reqDocText)
    .then(r => { aiResult = r; return undefined })
    .catch(err => String(err.message || err))

  if (aiResult) {
    writeAnalysisToDb(db, taskId, userId, aiResult)
    return aiResult
  }

  // AI 也失败 → 用规则结果兜底
  const fallback: AnalysisResult = {
    source: 'rules',
    projectMatch: ruleMatch ? {
      matched: true, projectConfigId: ruleMatch.projectConfigId, projectConfigName: ruleMatch.projectConfigName,
      localPath: ruleMatch.localPath, defaultBranch: ruleMatch.defaultBranch,
      confidence: ruleMatch.confidence, method: ruleMatch.method, reason: ruleMatch.reason,
    } : null,
    risk: { level: ruleRisk.level, score: ruleRisk.score, factors: ruleRisk.factors },
    aiError,
  }
  writeAnalysisToDb(db, taskId, userId, fallback)
  return fallback
}

/** 批量分析 */
export async function batchAnalyzeTasks(taskIds: string[], userId: string): Promise<Array<AnalysisResult & { taskId: string; title: string }>> {
  const results: Array<AnalysisResult & { taskId: string; title: string }> = []
  for (const id of taskIds) {
    try {
      const result = await analyzeTask(id, userId)
      const db = getDb()
      const task = db.prepare('SELECT title FROM tasks WHERE id = ?').get(id) as { title: string } | undefined
      results.push({ ...result, taskId: id, title: task?.title || '' })
    } catch {
      // 跳过不存在的任务
    }
  }
  return results
}

// ========== 候选收集 ==========

/** 收集候选项目：规则匹配的 + 同内网项目的 */
function collectCandidates(
  ruleMatch: ReturnType<typeof matchProject>,
  intranetProject: string,
  allConfigs: Array<{ id: string; name: string; local_path: string; default_branch: string; tags: string }>,
): Array<{ id: string; name: string; local_path: string; default_branch: string }> {
  const seen = new Set<string>()
  const candidates: Array<{ id: string; name: string; local_path: string; default_branch: string }> = []

  // 规则匹配到的（如果有）
  if (ruleMatch) {
    const cfg = allConfigs.find(c => c.id === ruleMatch.projectConfigId)
    if (cfg) { candidates.push(cfg); seen.add(cfg.id) }
  }

  // 同内网项目的所有配置（名称包含关系）
  for (const c of allConfigs) {
    if (seen.has(c.id)) continue
    if (c.name === intranetProject || c.name.includes(intranetProject) || intranetProject.includes(c.name)) {
      candidates.push(c)
      seen.add(c.id)
    }
  }

  // 如果候选太少（< 2），补充所有配置（最多 5 个）
  if (candidates.length < 2) {
    for (const c of allConfigs) {
      if (seen.has(c.id)) continue
      candidates.push(c)
      if (candidates.length >= 5) break
    }
  }

  return candidates
}

// ========== AI 精炼 ==========

async function tryAiRefine(
  task: Record<string, unknown>,
  candidates: Array<{ id: string; name: string; local_path: string; default_branch: string }>,
  ruleMatch: ReturnType<typeof matchProject>,
  ruleRisk: ReturnType<typeof assessRisk>,
  reqDocText: string,
): Promise<AnalysisResult> {
  const config = readAiConfig()
  if (!config.url || !config.target) throw new Error('AI 未配置')

  const title = (task.title as string) || ''
  const description = (task.description as string) || ''
  const docSnippet = reqDocText ? `\n需求文档(前1500字): ${reqDocText.substring(0, 1500)}` : ''

  const userMessage = `任务：${title}
描述：${description || '(无)'}
模块：${(task.module as string) || ''} | 内网项目：${(task.project as string) || ''} | 客户：${(task.customer as string) || ''}
类型：${(task.bug_or_req as string) === 'bug' ? 'Bug' : '需求'} | 工时：${(task.work_hours as number) || 0}h | 返工：${(task.rework_count as number) || 0}${docSnippet}

规则引擎结果：
- 项目匹配：${ruleMatch ? `${ruleMatch.projectConfigName} (${ruleMatch.method}, 置信${ruleMatch.confidence})` : '未匹配'}
- 风险评估：${ruleRisk.level} (${ruleRisk.score}分) ${ruleRisk.factors.length ? '因素: ' + ruleRisk.factors.join(', ') : ''}

候选项目配置（${candidates.length}个）：
${candidates.map(c => `- id:${c.id} 名称:${c.name} 路径:${c.local_path} 分支:${c.default_branch}`).join('\n')}

请从候选中选择最匹配的项目，调整风险评估（如需要），生成验收标准和摘要。`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT)

  try {
    const resp = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({
        model: `openclaw/${config.target}`,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        stream: false,
      }),
      signal: controller.signal,
    })

    if (!resp.ok) throw new Error(`AI 返回 ${resp.status}`)

    const body = await resp.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = body?.choices?.[0]?.message?.content
    if (!content) throw new Error('AI 返回空内容')

    return parseAiResponse(content, candidates)
  } finally {
    clearTimeout(timer)
  }
}

// ========== 配置读取 ==========

function readAiConfig(): { url: string; token: string; target: string } {
  const db = getDb()
  const getVal = (key: string) => {
    const row = db.prepare("SELECT value FROM sync_config WHERE key = ?").get(key) as { value: string } | undefined
    return row?.value ? row.value.replace(/^"|"$/g, '') : ''
  }
  return {
    url: getVal('webhookUrl'),
    token: getVal('openclawToken'),
    target: getVal('preprocessAgentTarget'),
  }
}

// ========== 响应解析 ==========

function parseAiResponse(content: string, candidates: Array<{ id: string; name: string; local_path: string; default_branch: string }>): AnalysisResult {
  let jsonStr = content.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()

  const jsonStart = jsonStr.indexOf('{')
  const jsonEnd = jsonStr.lastIndexOf('}')
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1)
  }

  let parsed: AiResponse
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('AI 返回非 JSON')
  }

  if (!parsed.riskAssessment || !parsed.projectMatch) {
    throw new Error('AI 返回结构不完整')
  }

  const validLevels = ['L1', 'L2', 'L3', 'L4']
  const level = validLevels.includes(parsed.riskAssessment.level) ? parsed.riskAssessment.level as 'L1' | 'L2' | 'L3' | 'L4' : 'L2'
  const score = Math.max(0, Math.min(100, Math.round(parsed.riskAssessment.score || 0)))
  const confidence = Math.max(0, Math.min(1, parsed.projectMatch.confidence || 0))

  let projectMatch: AnalysisResult['projectMatch'] = null
  if (parsed.projectMatch.configId && confidence >= 0.5) {
    const matched = candidates.find(c => c.id === parsed.projectMatch.configId)
    if (matched) {
      projectMatch = {
        matched: true, projectConfigId: matched.id, projectConfigName: matched.name,
        localPath: matched.local_path, defaultBranch: matched.default_branch,
        confidence, method: 'ai', reason: parsed.projectMatch.reason || 'AI 分析',
        branchSuggestion: parsed.projectMatch.branchSuggestion,
      }
    }
  }

  return {
    source: 'rules+ai',
    projectMatch,
    risk: { level, score, factors: Array.isArray(parsed.riskAssessment.factors) ? parsed.riskAssessment.factors.slice(0, 5) : [] },
    summary: parsed.summary || '',
    acceptanceCriteria: parsed.acceptanceCriteria || '',
  }
}

// ========== DB 写入 ==========

function writeAnalysisToDb(db: ReturnType<typeof getDb>, taskId: string, userId: string, result: AnalysisResult): void {
  db.prepare('UPDATE tasks SET risk_level = ?, risk_score = ? WHERE id = ? AND user_id = ?')
    .run(result.risk.level, result.risk.score, taskId, userId)

  if (result.projectMatch && result.projectMatch.localPath && result.projectMatch.confidence >= 0.7) {
    db.prepare("UPDATE tasks SET project_path = ?, git_branch = ? WHERE id = ? AND user_id = ? AND (project_path = '' OR project_path IS NULL)")
      .run(result.projectMatch.localPath, result.projectMatch.defaultBranch, taskId, userId)

    const task = db.prepare('SELECT title, module, project, customer FROM tasks WHERE id = ?').get(taskId) as Record<string, string> | undefined
    if (task) {
      recordHistory({
        title: task.title || '', module: task.module || '',
        project: task.project || '', customer: task.customer || '',
      }, result.projectMatch.projectConfigId, result.projectMatch.method, userId)
    }
  }
}
