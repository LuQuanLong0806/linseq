/**
 * 项目匹配服务
 * 匹配优先级：标题关键词路由 → 规则引擎 → 历史学习 → 精确匹配 → 多仓库模糊
 */
import { getDb } from '../db/index.js'
import { v4 as uuidv4 } from 'uuid'

interface MatchResult {
  matched: boolean
  projectConfigId: string
  projectConfigName: string
  localPath: string
  defaultBranch: string
  confidence: number
  method: string
  reason: string
}

interface ProjectConfigRow {
  id: string
  name: string
  local_path: string
  git_url: string
  branches: string
  default_branch: string
  tags: string
}

/**
 * 标题关键词路由规则
 * 当内网 project 对应多个代码仓库时，按标题关键词路由到正确的仓库
 *
 * 规则：每个内网 project 映射到多个 project_config，
 *       每个配置有一组命中关键词，匹配到的返回
 *       无命中时返回 null，让后续层继续尝试
 */
interface TitleRoute {
  /** 内网 project 名称 */
  intranetProject: string
  /** 该内网 project 下所有可能的代码仓库配置名前缀 */
  configNames: string[]
  /** 关键词 → 配置名 的映射 */
  routes: { keywords: string[]; configName: string }[]
  /** 默认配置名（无关键词命中时使用） */
  defaultConfigName?: string
}

const TITLE_ROUTES: TitleRoute[] = [
  {
    intranetProject: '宁对接小程序',
    configNames: ['宁对接小程序', '宁对接管理平台', '宁对接个人中心'],
    routes: [
      { keywords: ['后台', '管理端', '管理平台', 'iframe', '后台页面'], configName: '宁对接管理平台' },
    ],
    defaultConfigName: '宁对接小程序',
  },
  {
    intranetProject: '南京场景创新服务平台',
    configNames: ['南京场景服务平台', '南京场景企业端', '南京场景移动端', '南京场景企业端个人中心'],
    routes: [
      { keywords: ['企业端', '小程序端'], configName: '南京场景企业端' },
      { keywords: ['移动端', '移动', '小程序端'], configName: '南京场景移动端' },
      { keywords: ['个人中心', '用户中心'], configName: '南京场景企业端个人中心' },
    ],
    defaultConfigName: '南京场景服务平台',
  },
]

/** 第一层：标题关键词路由（处理一个内网project对应多个代码仓库） */
function matchByTitleRoute(task: { title: string; project: string }, userId: string): MatchResult | null {
  const route = TITLE_ROUTES.find(r => r.intranetProject === task.project)
  if (!route) return null

  const title = task.title || ''
  for (const r of route.routes) {
    if (r.keywords.some(kw => title.includes(kw))) {
      const cfg = findConfigByName(r.configName, userId)
      if (cfg) {
        return {
          matched: true, projectConfigId: cfg.id, projectConfigName: cfg.name,
          localPath: cfg.local_path, defaultBranch: cfg.default_branch,
          confidence: 0.92, method: 'title_route',
          reason: `标题路由: "${title}" 包含关键词命中 → ${cfg.name}`
        }
      }
    }
  }

  // 使用默认配置
  if (route.defaultConfigName) {
    const cfg = findConfigByName(route.defaultConfigName, userId)
    if (cfg) {
      return {
        matched: true, projectConfigId: cfg.id, projectConfigName: cfg.name,
        localPath: cfg.local_path, defaultBranch: cfg.default_branch,
        confidence: 0.7, method: 'title_route_default',
        reason: `标题路由(默认): "${title}" 无关键词命中 → 默认 ${cfg.name}`
      }
    }
  }

  return null
}

function findConfigByName(name: string, userId: string): ProjectConfigRow | undefined {
  const db = getDb()
  return db.prepare("SELECT * FROM project_configs WHERE name = ? AND user_id = ?").get(name, userId) as ProjectConfigRow | undefined
}

/** 第二层：规则引擎匹配 */
function matchByRules(task: { title: string; description: string; project: string; module: string; customer: string }, userId: string): MatchResult | null {
  const db = getDb()
  const rules = db.prepare(
    "SELECT * FROM project_rules WHERE user_id = ? AND enabled = 1 ORDER BY priority DESC"
  ).all(userId) as { id: string; project_config_id: string; rule_type: string; pattern: string; field: string }[]

  for (const rule of rules) {
    const value = getField(task, rule.field)
    if (!value) continue
    const hit = rule.rule_type === 'regex'
      ? new RegExp(rule.pattern, 'i').test(value)
      : value.toLowerCase().includes(rule.pattern.toLowerCase())
    if (hit) {
      const cfg = db.prepare("SELECT * FROM project_configs WHERE id = ?").get(rule.project_config_id) as ProjectConfigRow | undefined
      if (cfg) {
        return {
          matched: true, projectConfigId: cfg.id, projectConfigName: cfg.name,
          localPath: cfg.local_path, defaultBranch: cfg.default_branch,
          confidence: 0.9, method: 'rule',
          reason: `规则匹配: ${rule.field} ${rule.rule_type === 'regex' ? '~' : '∋'} "${rule.pattern}"`
        }
      }
    }
  }
  return null
}

/** 第三层：历史学习匹配 */
function matchByHistory(task: { module: string; project: string; customer: string; title: string }, userId: string): MatchResult | null {
  const db = getDb()
  const rows = db.prepare(`
    SELECT assigned_project_config_id, COUNT(*) as cnt
    FROM project_history
    WHERE user_id = ? AND (
      task_module = ? OR task_customer = ? OR task_project = ?
    )
    GROUP BY assigned_project_config_id
    ORDER BY cnt DESC
    LIMIT 3
  `).all(userId, task.module, task.customer, task.project) as { assigned_project_config_id: string; cnt: number }[]

  if (rows.length === 0) return null

  const best = rows[0]
  const total = rows.reduce((s, r) => s + r.cnt, 0)
  const confidence = Math.min(0.85, 0.5 + (best.cnt / total) * 0.35)

  const cfg = db.prepare("SELECT * FROM project_configs WHERE id = ?").get(best.assigned_project_config_id) as ProjectConfigRow | undefined
  if (!cfg) return null

  return {
    matched: true, projectConfigId: cfg.id, projectConfigName: cfg.name,
    localPath: cfg.local_path, defaultBranch: cfg.default_branch,
    confidence, method: 'history',
    reason: `历史学习: ${best.cnt}次关联`
  }
}

/** 第四层：精确匹配（内网 project = config name） */
function matchExact(task: { project: string }, userId: string): MatchResult | null {
  const db = getDb()
  const cfg = db.prepare("SELECT * FROM project_configs WHERE name = ? AND user_id = ?").get(task.project, userId) as ProjectConfigRow | undefined
  if (!cfg) return null
  return {
    matched: true, projectConfigId: cfg.id, projectConfigName: cfg.name,
    localPath: cfg.local_path, defaultBranch: cfg.default_branch,
    confidence: 0.95, method: 'exact',
    reason: '精确匹配: project名一致'
  }
}

/** 第五层：模糊匹配（内网 project 包含 config name 或反之） */
function matchFuzzy(task: { project: string }, userId: string): MatchResult | null {
  const db = getDb()
  const configs = db.prepare("SELECT * FROM project_configs WHERE user_id = ?").all(userId) as ProjectConfigRow[]
  for (const cfg of configs) {
    if (task.project.includes(cfg.name) || cfg.name.includes(task.project)) {
      return {
        matched: true, projectConfigId: cfg.id, projectConfigName: cfg.name,
        localPath: cfg.local_path, defaultBranch: cfg.default_branch,
        confidence: 0.5, method: 'fuzzy',
        reason: `模糊匹配: "${task.project}" ↔ "${cfg.name}"`
      }
    }
  }
  return null
}

function getField(task: Record<string, string>, field: string): string {
  return (task[field] || '') as string
}

/** 主匹配入口：按优先级尝试所有层 */
export function matchProject(task: { title: string; description: string; project: string; module: string; customer: string }, userId: string): MatchResult | null {
  // 0. 标题关键词路由（优先级最高，处理一对多仓库）
  const routeMatch = matchByTitleRoute(task, userId)
  if (routeMatch) return routeMatch
  // 1. 规则匹配
  const ruleMatch = matchByRules(task, userId)
  if (ruleMatch) return ruleMatch
  // 2. 历史学习
  const historyMatch = matchByHistory(task, userId)
  if (historyMatch) return historyMatch
  // 3. 精确匹配
  if (task.project) {
    const exact = matchExact(task, userId)
    if (exact) return exact
  }
  // 4. 模糊匹配
  return matchFuzzy(task, userId)
}

/** 记录手动关联到历史 */
export function recordHistory(task: { module: string; project: string; customer: string; title: string }, projectConfigId: string, method: string, userId: string): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO project_history (id, task_module, task_project, task_customer, task_title_keyword, assigned_project_config_id, match_method, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), task.module || '', task.project || '', task.customer || '', extractKeywords(task.title), projectConfigId, method, userId)
}

function extractKeywords(title: string): string {
  return title.replace(/[^一-龥a-zA-Z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 1).slice(0, 5).join(',')
}

/** 批量匹配任务列表（同步后调用） */
export function batchMatchProjects(taskIds: string[], userId: string): number {
  const db = getDb()
  let matched = 0
  const updateStmt = db.prepare("UPDATE tasks SET project_path = ?, git_branch = ? WHERE id = ? AND user_id = ? AND (project_path = '' OR project_path IS NULL)")
  for (const id of taskIds) {
    const task = db.prepare("SELECT title, description, project, module, customer FROM tasks WHERE id = ? AND user_id = ?").get(id, userId) as Record<string, string> | undefined
    if (!task) continue
    const result = matchProject({ title: task.title, description: task.description, project: task.project, module: task.module, customer: task.customer }, userId)
    if (result && result.localPath) {
      updateStmt.run(result.localPath, result.defaultBranch, id, userId)
      matched++
    }
  }
  return matched
}

/** 获取文档分组：按 req_doc_name 去时间戳前缀聚合 */
export function getDocumentGroups(userId: string): Array<{ docKey: string; docName: string; taskIds: string[]; taskCount: number; project: string }> {
  const db = getDb()
  const tasks = db.prepare(`
    SELECT id, title, project, req_doc_name
    FROM tasks
    WHERE user_id = ? AND req_doc_name != '' AND req_doc_name IS NOT NULL
    ORDER BY project, req_doc_name
  `).all(userId) as { id: string; title: string; project: string; req_doc_name: string }[]

  const groups = new Map<string, { docKey: string; docName: string; taskIds: string[]; project: string }>()
  for (const t of tasks) {
    const key = stripTimestamp(t.req_doc_name)
    if (!groups.has(key)) {
      groups.set(key, { docKey: key, docName: t.req_doc_name, taskIds: [], project: t.project })
    }
    groups.get(key)!.taskIds.push(t.id)
  }

  return Array.from(groups.values()).map(g => ({ ...g, taskCount: g.taskIds.length }))
}

/** 去除文档名前的时间戳前缀：2026050708235334_绿色工厂申报.pdf → 绿色工厂申报.pdf */
function stripTimestamp(name: string): string {
  return name.replace(/^\d{10,}_/, '')
}
