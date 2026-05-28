/**
 * 内网系统爬虫模块（v3 - Cookie 缓存 + Node fetch 直调）
 * 
 * 优化策略：
 *   1. Puppeteer 登录一次 → JSESSIONID 缓存 1 小时（存 DB + 内存）
 *   2. 后续同步用 Node fetch + 缓存 cookie 直接调 API，无需启动浏览器
 *   3. cookie 过期或 API 返回 302 时自动重新登录
 */
import puppeteer, { type Browser } from 'puppeteer'
import { getDb } from '../db/index.js'

// ========== 类型定义 ==========

/** 内网 API 返回的原始任务对象 */
interface IntranetTask {
  id: string
  danjuCode: string
  rwzj: string
  rwzj2: string
  xmmc: string
  khmc: string
  cpmk: string
  rwlx: string
  bugOrXuqiu: string
  jibie: string
  gzl: number
  jhrq: string
  tjrq: string
  createDate: string
  updateDate: string
  NODEID: string
  NEXTNODENAME: string
  jiedian: number
  dbry: string
  dbryId: string
  kfry: string
  cpjl: string
  yffzr: string
  khjl: string
  daibanren: string
  deptName: string
  deptId: string
  rwsfgb: number
  chanpin: string
  mokuai: string
  flowId: string
  workId: string
  zhiliuDay: number
  liuchunDay: number
  afterCreateDayNum: number
  tuihuiFlag?: number
  version: string
  bglx: string
  rwfz: number
  iszuzhang: string
  ischanpin: string
  isbug: string
  createUserId: string
  tijiaoUserId: string
  yfzb: string
  state?: number
  sjwcrq?: string
  ENDTIME?: string
}

/** 本地统一的任务数据结构 */
export interface ScrapedTask {
  sourceId: string
  intranetId: string
  title: string
  description: string
  module: string
  moduleShort: string
  product: string
  priority: string
  status: string
  project: string
  customer: string
  customerManager: string
  taskType: string
  bugOrReq: string
  workHours: number
  deadline: string
  submitTime: string
  createTime: string
  updateTime: string
  developer: string
  supervisor: string
  supervisorId: string
  productManager: string
  devLeader: string
  handler: string
  department: string
  departmentId: string
  isClosed: boolean
  intranetNode: string
  intranetNodeName: string
  nodeIndex: number
  staleDays: number
  flowDays: number
  daysSinceCreate: number
  rejectFlag: boolean
  flowId: string
  workId: string
  version: string
  tags: string[]
}

/** API 响应格式 */
interface TaskListResponse {
  pageInfo: { pageIndex: number; pageSize: number }
  sumData: IntranetTask[]
  total: number
  data: IntranetTask[]
}

// ========== 常量 ==========

const INTRANET_BASE = 'http://10.0.12.119:8868'
const LOGIN_URL = `${INTRANET_BASE}/demo/account/login.htm`
const TASK_API = `${INTRANET_BASE}/demo/tasklist/getTasklistList.action`
const FUJIAN_API = `${INTRANET_BASE}/demo/fujian/getFujiansByPid.action`
const DEFAULT_PAGE_SIZE = 200

/** Cookie 有效期：1 小时 */
const COOKIE_TTL_MS = 60 * 60 * 1000

const LOGIN_USER = ''  // deprecated: read from users table
const LOGIN_PASS = ''  // deprecated: read from users table

// ========== 状态 ==========

let browserInstance: Browser | null = null

/** 内存缓存：{ cookie, expiryMs } */
interface CookieCache {
  cookie: string    // "JSESSIONID=xxx"
  expiryMs: number  // 过期时间戳 (Date.now() based)
}
let cookieCache: CookieCache | null = null

// ========== 映射函数 ==========

function mapPriority(jibie: string): string {
  const map: Record<string, string> = { A: 'urgent', B: 'high', C: 'medium' }
  return map[jibie] || 'low'
}

function mapStatus(nodeName: string, isClosed: number, rejectFlag?: number): string {
  if (isClosed === 1) return 'completed'
  if (rejectFlag === 1) return 'rejected'
  const map: Record<string, string> = {
    '开发完成': 'self_test',
    '测试': 'testing',
    '验收': 'verifying',
    '已结束': 'completed',
  }
  return map[nodeName] || 'pending'
}

function mapIntranetTask(task: IntranetTask): ScrapedTask {
  const tags: string[] = []
  if (task.xmmc) tags.push(task.xmmc)
  if (task.chanpin) tags.push(task.chanpin)
  if (task.bugOrXuqiu === 'bug') tags.push('BUG')

  return {
    sourceId: task.danjuCode,
    intranetId: task.id,
    title: task.rwzj,
    description: task.rwzj2 || task.rwzj,
    module: task.cpmk || '',
    moduleShort: task.mokuai || '',
    product: task.chanpin || '',
    priority: mapPriority(task.jibie),
    status: mapStatus(task.NEXTNODENAME, task.rwsfgb, task.tuihuiFlag),
    project: task.xmmc || '',
    customer: task.khmc || '',
    customerManager: task.khjl || '',
    taskType: task.rwlx || '',
    bugOrReq: task.bugOrXuqiu === 'xuqiu' ? 'requirement' : task.bugOrXuqiu === 'bug' ? 'bug' : '',
    workHours: task.gzl || 0,
    deadline: task.jhrq || '',
    submitTime: task.tjrq || '',
    createTime: task.createDate || '',
    updateTime: task.updateDate || '',
    developer: task.kfry || '',
    supervisor: task.dbry || '',
    supervisorId: task.dbryId || '',
    productManager: task.cpjl || '',
    devLeader: task.yffzr || '',
    handler: (task.daibanren || '').trim(),
    department: task.deptName || '',
    departmentId: task.deptId || '',
    isClosed: task.rwsfgb === 1,
    intranetNode: task.NODEID || '',
    intranetNodeName: task.NEXTNODENAME || '',
    nodeIndex: task.jiedian || 0,
    staleDays: task.zhiliuDay || 0,
    flowDays: task.liuchunDay || 0,
    daysSinceCreate: task.afterCreateDayNum || 0,
    rejectFlag: task.tuihuiFlag === 1,
    flowId: task.flowId || '',
    workId: task.workId || '',
    version: task.version || '',
    tags: [...new Set(tags)],
  }
}

// ========== Cookie 管理 ==========

/**
 * 从 users 表恢复指定用户的 cookie 缓存
 */
function restoreCookieFromDb(username?: string): CookieCache | null {
  try {
    const db = getDb()
    let user: { cookie: string; cookie_expiry: string } | undefined
    if (username) {
      user = db.prepare('SELECT cookie, cookie_expiry FROM users WHERE username = ?').get(username) as { cookie: string; cookie_expiry: string } | undefined
    } else {
      const curRow = db.prepare("SELECT value FROM sync_config WHERE key = 'currentUser'").get() as { value: string } | undefined
      const curUser = curRow ? JSON.parse(curRow.value) : ''
      if (curUser) {
        user = db.prepare('SELECT cookie, cookie_expiry FROM users WHERE username = ?').get(curUser) as { cookie: string; cookie_expiry: string } | undefined
      }
    }
    if (user?.cookie && user?.cookie_expiry) {
      const expiryMs = new Date(user.cookie_expiry).getTime()
      if (expiryMs > Date.now()) {
        return { cookie: user.cookie, expiryMs }
      }
    }
  } catch { /* db not ready yet */ }
  return null
}

/**
 * 从 users 表读取指定用户的内网凭据
 */
function getStoredCredentials(username?: string): { username: string; password: string } {
  const db = getDb()
  let user: { username: string; password: string } | undefined
  if (username) {
    user = db.prepare('SELECT username, password FROM users WHERE username = ?').get(username) as { username: string; password: string } | undefined
  } else {
    const curRow = db.prepare("SELECT value FROM sync_config WHERE key = 'currentUser'").get() as { value: string } | undefined
    const curUser = curRow ? JSON.parse(curRow.value) : ''
    if (curUser) {
      user = db.prepare('SELECT username, password FROM users WHERE username = ?').get(curUser) as { username: string; password: string } | undefined
    }
  }
  return { username: user?.username || '', password: user?.password || '' }
}

/**
 * 获取有效 cookie，优先内存 → DB → 重新登录
 * @param forceRelogin 强制重新登录（用于 302 等 session 失效场景，跳过缓存直接重登）
 */
export async function getValidCookie(username?: string, forceRelogin?: boolean): Promise<string> {
  if (!forceRelogin) {
    // 1. 内存缓存有效？
    if (cookieCache && cookieCache.expiryMs > Date.now()) {
      return cookieCache.cookie
    }

    // 2. DB 缓存有效？
    const dbCache = restoreCookieFromDb(username)
    if (dbCache) {
      cookieCache = dbCache
      return dbCache.cookie
    }
  }

  // 3. 重新登录（用指定用户或当前用户的凭据）
  console.log(forceRelogin ? '[intranet] session 失效，强制重新登录...' : '[intranet] cookie 过期或不存在，重新登录...')
  const result = await loginIntranet(username)
  return result.cookie
}

/**
 * 保存 cookie 到内存 + users 表
 */
function saveCookie(cookie: string, username?: string): void {
  const expiryMs = Date.now() + COOKIE_TTL_MS
  cookieCache = { cookie, expiryMs }

  const db = getDb()
  if (username) {
    db.prepare('UPDATE users SET cookie = ?, cookie_expiry = ? WHERE username = ?').run(cookie, new Date(expiryMs).toISOString(), username)
  }
}

// ========== 浏览器登录（仅在 cookie 过期时调用） ==========

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      defaultViewport: { width: 1920, height: 1080 },
    })
  }
  return browserInstance
}

/**
 * Puppeteer 登录内网，获取 JSESSIONID cookie
 * 传入用户名时读该用户凭据，无参时读当前用户
 */
export async function loginIntranet(
  username?: string,
  password?: string
): Promise<{ cookie: string; expiry: string }> {
  // 如果未传完整凭据，从 DB 读取
  if (!username || !password) {
    const stored = getStoredCredentials(username || undefined)
    username = username || stored.username
    password = password || stored.password
  }
  if (!username || !password) {
    throw new Error('未配置内网登录凭据，请先在同步中心登录')
  }

  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 })
    await page.waitForSelector('#userName', { timeout: 10000 })
    await page.click('#userName', { clickCount: 3 })
    await page.type('#userName', username, { delay: 30 })
    await page.click('#userPwd', { clickCount: 3 })
    await page.type('#userPwd', password, { delay: 30 })
    await page.click('.loginBtn')
    await page.waitForFunction(
      () => location.href.includes('index.htm'),
      { timeout: 15000 }
    )

    const cookies = await page.cookies()
    const jsessionId = cookies.find(c => c.name === 'JSESSIONID')
    if (!jsessionId) {
      throw new Error('登录后未获取到 JSESSIONID')
    }

    const cookie = `JSESSIONID=${jsessionId.value}`
    saveCookie(cookie, username)

    // 登录完关掉浏览器节省资源
    await browser.close()
    browserInstance = null

    console.log(`[intranet] 登录成功，cookie 缓存至 ${new Date(cookieCache!.expiryMs).toLocaleTimeString()}`)
    return { cookie, expiry: new Date(cookieCache!.expiryMs).toISOString() }
  } catch (err) {
    await page.close()
    throw err
  }
}

/**
 * 检查登录状态
 */
export async function checkLoginStatus(): Promise<{ isLoggedIn: boolean; expiry: string }> {
  const cache = cookieCache || restoreCookieFromDb()
  if (!cache) return { isLoggedIn: false, expiry: '' }
  if (cache) cookieCache = cache
  const isLoggedIn = cache.expiryMs > Date.now()
  return { isLoggedIn, expiry: new Date(cache.expiryMs).toISOString() }
}

// ========== Node fetch 直调 API（无需浏览器） ==========

/**
 * 用 Node fetch + 缓存 cookie 直接调内网 API
 */
async function fetchTaskListViaNode(
  cookie: string,
  pageIndex: number = 0,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<TaskListResponse> {
  const url = `${TASK_API}?pageIndex=${pageIndex}&pageSize=${pageSize}&filterDaiban=true&guanbi=0`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    redirect: 'manual', // 不自动跟随重定向，用于检测 session 过期
  })

  // 302 = session 过期，需要重新登录
  if (resp.status === 302 || resp.status === 301) {
    throw new Error('SESSION_EXPIRED')
  }

  // 非 200 直接报错
  if (resp.status !== 200) {
    const text = await resp.text()
    throw new Error(`API 返回 ${resp.status}: ${text.substring(0, 200)}`)
  }

  const text = await resp.text()
  try {
    return JSON.parse(text) as TaskListResponse
  } catch {
    throw new Error(`API 返回非 JSON: ${text.substring(0, 200)}`)
  }
}

// ========== 主同步流程 ==========

/**
 * 获取全量待办任务（Node fetch 直调，cookie 过期自动重新登录）
 */
async function fetchAllTasks(): Promise<IntranetTask[]> {
  let cookie = await getValidCookie()

  const allTasks: IntranetTask[] = []
  let pageIndex = 0
  let hasMore = true
  let retried = false

  while (hasMore) {
    try {
      const result = await fetchTaskListViaNode(cookie, pageIndex, DEFAULT_PAGE_SIZE)
      if (result.sumData?.length) {
        allTasks.push(...result.sumData)
      }
      if ((result.sumData?.length || 0) < DEFAULT_PAGE_SIZE) {
        hasMore = false
      } else {
        pageIndex++
      }
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'SESSION_EXPIRED' && !retried) {
        console.log('[intranet] session 过期，强制重新登录...')
        cookie = await getValidCookie(undefined, true)
        retried = true
        continue
      }
      throw err
    }
  }

  return allTasks
}

import { PDFParse } from 'pdf-parse'

const YULAN_API = `${INTRANET_BASE}/demo/tasklist/YulanData.action`

/**
 * 批量获取任务需求文档元数据（附件名 + URL），不下载 PDF
 */
async function fetchReqDocs(): Promise<void> {
  let cookie = await getValidCookie()
  const db = getDb()
  // 只查当前用户的任务
  const curRow = db.prepare("SELECT value FROM sync_config WHERE key = 'currentUser'").get() as { value: string } | undefined
  const curUser = curRow ? JSON.parse(curRow.value) : ''
  const tasks = db.prepare("SELECT id, intranet_id FROM tasks WHERE intranet_id != '' AND user_id = ?").all(curUser) as { id: string; intranet_id: string }[]

  const updateStmt = db.prepare("UPDATE tasks SET req_doc_name = ?, req_doc_url = ? WHERE id = ?")
  let fetched = 0
  let sessionExpired = false

  for (const task of tasks) {
    try {
      const resp = await fetch(FUJIAN_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookie,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: `pid=${task.intranet_id}`,
        redirect: 'manual',
      })

      // 302 = session 过期，刷新一次 cookie
      if ((resp.status === 302 || resp.status === 301) && !sessionExpired) {
        console.log('[intranet] fetchReqDocs 302，强制重新登录...')
        cookie = await getValidCookie(undefined, true)
        sessionExpired = true
        // 重试当前任务
        const retryResp = await fetch(FUJIAN_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: `pid=${task.intranet_id}`,
          redirect: 'manual',
        })
        if (retryResp.status !== 200) continue
        const retryData = await retryResp.json() as { list?: { fileName: string; id: string; sort: number }[]; success: boolean }
        if (!retryData.success || !retryData.list?.length) continue
        const doc = retryData.list.find(f => f.sort === 1) || retryData.list[0]
        updateStmt.run(doc.fileName || '', doc.id ? `${YULAN_API}?id=${doc.id}` : '', task.id)
        fetched++
        continue
      }

      if (resp.status !== 200) continue

      const data = await resp.json() as { list?: { fileName: string; id: string; sort: number }[]; success: boolean }
      if (!data.success || !data.list?.length) continue

      const doc = data.list.find(f => f.sort === 1) || data.list[0]
      const reqDocName = doc.fileName || ''
      const reqDocUrl = doc.id ? `${YULAN_API}?id=${doc.id}` : ''
      updateStmt.run(reqDocName, reqDocUrl, task.id)
      fetched++
    } catch {
      // skip single task error
    }
  }
  console.log(`[intranet] 需求文档元数据同步完成: ${fetched}/${tasks.length}`)
}

/**
 * 在 PDF 全文中查找任务标题位置（支持空白字符差异）
 * PDF 换行会产生多余空格，如 "管理 端" vs DB "管理端"
 */
function findTitleInText(fullText: string, title: string): number {
  if (!title || title.length < 2) return -1

  // 1. 精确匹配
  const exact = fullText.indexOf(title)
  if (exact !== -1) return exact

  // 2. 去掉所有空白字符后匹配（处理 PDF 换行导致的空格差异）
  const cleanTitle = title.replace(/\s/g, '')
  const cleanFull = fullText.replace(/\s/g, '')
  const cleanIdx = cleanFull.indexOf(cleanTitle)
  if (cleanIdx === -1) return -1

  // 映射回原始位置
  let origPos = 0
  let pos = 0
  for (let i = 0; i < fullText.length; i++) {
    if (pos >= cleanIdx) { origPos = i; break }
    if (!/\s/.test(fullText[i])) pos++
  }
  return origPos
}

/**
 * 从 PDF 全文中提取与当前任务相关的段落
 * 策略：
 *   1. 用共享同一 PDF 的所有任务标题作为分界线
 *   2. 找到当前任务标题的位置，提取到下一个任务标题之间
 *   3. 如果 PDF 只属于一个任务（无兄弟任务），返回全文
 *   4. 找不到锚点时 fallback 返回全文
 */
function extractTaskSection(fullText: string, currentTitle: string, siblingTitles: string[]): string {
  if (!fullText) return ''

  // 无兄弟任务（独立 PDF），直接返回全文
  if (siblingTitles.length === 0) return fullText

  // 找当前任务的锚点
  const anchorIdx = findTitleInText(fullText, currentTitle)
  if (anchorIdx === -1) {
    console.log(`[intranet] PDF 未找到任务标题 "${currentTitle?.substring(0, 30)}"，返回全文`)
    return fullText
  }
  console.log(`[intranet] PDF 锚点命中: title="${currentTitle.substring(0, 30)}" @${anchorIdx}`)

  // 收集所有分界点（当前任务 + 兄弟任务标题的位置）
  const boundaries: { idx: number; title: string }[] = []
  const allTitles = [currentTitle, ...siblingTitles]
  for (const title of allTitles) {
    const idx = findTitleInText(fullText, title)
    if (idx !== -1) {
      boundaries.push({ idx, title })
    }
  }

  // 按 PDF 中的位置排序，去重
  boundaries.sort((a, b) => a.idx - b.idx)
  const unique = boundaries.filter((b, i) => i === 0 || b.idx !== boundaries[i - 1].idx)

  // 找当前任务在排序后的位置
  const myPos = unique.findIndex(b => b.idx === anchorIdx)
  if (myPos === -1) return fullText

  // 起始：从当前标题的 【 符号开始
  let start = anchorIdx
  const before = fullText.substring(Math.max(0, anchorIdx - 30), anchorIdx)
  const bracketPos = before.lastIndexOf('【')
  if (bracketPos !== -1) {
    start = Math.max(0, anchorIdx - 30) + bracketPos
  }

  // 结束：下一个兄弟任务标题的位置，或 PDF 末尾
  let end = fullText.length
  if (myPos + 1 < unique.length) {
    end = unique[myPos + 1].idx
  }

  const section = fullText.substring(start, end).trim()
  console.log(`[intranet] PDF 分段提取: 全文 ${fullText.length} → 段落 ${section.length} 字符`)
  return section
}

/**
 * 提取单条任务的 PDF 文字内容（加入 AI 待办时调用）
 */
export async function extractPdfText(taskId: string): Promise<string> {
  const db = getDb()
  const row = db.prepare(
    'SELECT source_id, title, module, req_doc_name, req_doc_url, req_doc_text FROM tasks WHERE id = ?'
  ).get(taskId) as {
    source_id: string; title: string; module: string;
    req_doc_name: string; req_doc_url: string; req_doc_text: string
  } | undefined
  if (!row) throw new Error('任务不存在')
  if (row.req_doc_text) return row.req_doc_text
  if (!row.req_doc_url || !row.req_doc_name.toLowerCase().endsWith('.pdf')) return ''

  const match = row.req_doc_url.match(/[?&]id=([^&]+)/)
  if (!match) return ''

  let cookie = await getValidCookie()
  let pdfResp = await fetch(`${YULAN_API}?id=${match[1]}`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
  })

  // 302 = session 过期，强制重新登录再试一次
  if (pdfResp.status === 302 || pdfResp.status === 301) {
    console.log('[intranet] PDF 下载 302，强制重新登录...')
    cookie = await getValidCookie(undefined, true)
    pdfResp = await fetch(`${YULAN_API}?id=${match[1]}`, {
      headers: { Cookie: cookie },
      redirect: 'manual',
    })
  }

  if (pdfResp.status !== 200) throw new Error(`PDF 下载失败: ${pdfResp.status}`)

  const buf = Buffer.from(await pdfResp.arrayBuffer())
  if (buf.length > 10 * 1024 * 1024) throw new Error('PDF 文件过大，超过 10MB')

  const parser = new PDFParse({ data: buf })
  const result = await parser.getText()
  const fullText = result.text.replace(/\s+/g, ' ').trim()

  // 查找共享同一 PDF 的其他任务标题，用作分界线
  const siblings = db.prepare(
    "SELECT title FROM tasks WHERE req_doc_name = ? AND id != ?"
  ).all(row.req_doc_name, taskId) as { title: string }[]
  const siblingTitles = siblings.map(s => s.title).filter(t => t && t.length >= 2)

  const text = extractTaskSection(fullText, row.title, siblingTitles)

  db.prepare('UPDATE tasks SET req_doc_text = ? WHERE id = ?').run(text, taskId)
  console.log(`[intranet] PDF 文字提取完成: ${taskId}, 全文 ${fullText.length} → 提取 ${text.length} 字符`)
  return text
}

/**
 * 从内网抓取任务列表
 */
export async function scrapTasksFromIntranet(): Promise<ScrapedTask[]> {
  const t0 = Date.now()
  const rawTasks = await fetchAllTasks()
  const tasks = rawTasks.map(mapIntranetTask)

  // 保存元数据
  const db = getDb()
  const upsert = db.prepare(`
    INSERT INTO sync_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)
  upsert.run('lastRawData', JSON.stringify({
    count: rawTasks.length,
    fetchedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
  }))

  console.log(`[intranet] 同步完成: ${rawTasks.length} 条, 耗时 ${Date.now() - t0}ms`)

  // 同步需求文档附件
  await fetchReqDocs()

  return tasks
}

/**
 * 关闭浏览器实例
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close()
    browserInstance = null
  }
}

// ========== Cookie 自动刷新 ==========

let refreshTimer: ReturnType<typeof setInterval> | null = null
const REFRESH_INTERVAL_MS = 30 * 60 * 1000 // 30 分钟

/**
 * 启动 cookie 自动刷新定时器
 */
export function startCookieRefresh(): void {
  if (refreshTimer) return
  // 立即检查一次（使用缓存，不过期不重新登录）
  getValidCookie().then(() => {
    console.log('[intranet] 初始 cookie 已就绪')
  }).catch(err => {
    console.warn('[intranet] 初始 cookie 获取失败:', (err as Error).message)
  })
  // 每 30 分钟检查一次，仅在过期时才重新登录
  refreshTimer = setInterval(async () => {
    try {
      await getValidCookie()
    } catch (err) {
      console.warn('[intranet] cookie 检查失败:', (err as Error).message)
    }
  }, REFRESH_INTERVAL_MS)
  console.log(`[intranet] cookie 定时检查已启动，间隔 ${REFRESH_INTERVAL_MS / 60000} 分钟`)
}

/**
 * 停止 cookie 自动刷新
 */
export function stopCookieRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
    console.log('[intranet] cookie 自动刷新已停止')
  }
}
