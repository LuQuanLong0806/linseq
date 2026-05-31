/**
 * 文档提取服务
 * 基于已有 extractPdfText 增加缓存层和批量入口
 * 缓存策略：按 docKey（去时间戳前缀的文件名）缓存全文到 server/data/doc-cache/
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDb } from '../db/index.js'
import { extractPdfText } from '../scraper/intranet.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.resolve(__dirname, '../../data/doc-cache')

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
  }
}

/** 去除文件名时间戳前缀作为缓存 key */
function docKeyFromName(name: string): string {
  return name.replace(/^\d{10,}_/, '').replace(/\.pdf$/i, '.txt')
}

export interface ExtractResult {
  taskId: string
  title: string
  docKey: string
  extracted: boolean
  textLength: number
  fromCache: boolean
  error?: string
}

/**
 * 提取单个任务的文档文本（优先缓存）
 */
export async function extractTaskDoc(taskId: string): Promise<ExtractResult> {
  const db = getDb()
  const task = db.prepare(
    'SELECT id, title, req_doc_name, req_doc_text FROM tasks WHERE id = ?'
  ).get(taskId) as { id: string; title: string; req_doc_name: string; req_doc_text: string } | undefined

  if (!task) return { taskId, title: '', docKey: '', extracted: false, textLength: 0, fromCache: false, error: '任务不存在' }
  if (!task.req_doc_name) return { taskId, title: task.title, docKey: '', extracted: false, textLength: 0, fromCache: false, error: '无需求文档' }

  // 已有提取结果
  if (task.req_doc_text && task.req_doc_text.length > 20) {
    return { taskId, title: task.title, docKey: docKeyFromName(task.req_doc_name), extracted: true, textLength: task.req_doc_text.length, fromCache: true }
  }

  // 尝试从缓存读取
  const cacheKey = docKeyFromName(task.req_doc_name)
  ensureCacheDir()
  const cachePath = path.join(CACHE_DIR, cacheKey)
  if (fs.existsSync(cachePath)) {
    const cachedText = fs.readFileSync(cachePath, 'utf-8')
    if (cachedText.length > 20) {
      // 缓存命中：用缓存全文 + 按标题切片
      const sliced = sliceByTitle(cachedText, task.title, taskId)
      db.prepare('UPDATE tasks SET req_doc_text = ? WHERE id = ?').run(sliced, taskId)
      return { taskId, title: task.title, docKey: cacheKey, extracted: true, textLength: sliced.length, fromCache: true }
    }
  }

  // 缓存未命中：调用 extractPdfText（内部会下载 PDF、提取、切片、写入 req_doc_text）
  try {
    const text = await extractPdfText(taskId)
    if (text && text.length > 20) {
      // 写入缓存（存全文，不存切片）
      writeFullTextCache(task)
      return { taskId, title: task.title, docKey: cacheKey, extracted: true, textLength: text.length, fromCache: false }
    }
    return { taskId, title: task.title, docKey: cacheKey, extracted: false, textLength: 0, fromCache: false, error: 'PDF 内容为空' }
  } catch (err) {
    return { taskId, title: task.title, docKey: cacheKey, extracted: false, textLength: 0, fromCache: false, error: String(err) }
  }
}

/**
 * 批量提取同文档组的所有任务
 * 只下载一次 PDF，然后按标题切分给每个任务
 */
export async function extractDocGroup(docKey: string): Promise<ExtractResult[]> {
  const db = getDb()
  const tasks = db.prepare(`
    SELECT id, title, req_doc_name, req_doc_text FROM tasks
    WHERE user_id = (SELECT value FROM sync_config WHERE key = 'currentUser')
      AND req_doc_name != '' AND req_doc_name IS NOT NULL
  `).all() as { id: string; title: string; req_doc_name: string; req_doc_text: string }[]

  const stripTs = (n: string) => n.replace(/^\d{10,}_/, '')
  const group = tasks.filter(t => stripTs(t.req_doc_name).replace(/\.pdf$/i, '.txt') === docKey || stripTs(t.req_doc_name) === docKey.replace(/\.txt$/i, '.pdf'))

  if (group.length === 0) return []

  // 检查缓存
  ensureCacheDir()
  const cachePath = path.join(CACHE_DIR, docKey.endsWith('.txt') ? docKey : docKey.replace(/\.pdf$/i, '.txt'))
  let fullText = ''

  if (fs.existsSync(cachePath)) {
    fullText = fs.readFileSync(cachePath, 'utf-8')
  }

  if (!fullText || fullText.length < 20) {
    // 下载第一个有 URL 的任务的 PDF
    const firstWithUrl = group.find(t => {
      const task = db.prepare('SELECT req_doc_url FROM tasks WHERE id = ?').get(t.id) as { req_doc_url: string } | undefined
      return task?.req_doc_url
    })
    if (!firstWithUrl) {
      return group.map(t => ({ taskId: t.id, title: t.title, docKey, extracted: false, textLength: 0, fromCache: false, error: '无文档 URL' }))
    }
    try {
      const text = await extractPdfText(firstWithUrl.id)
      if (text && text.length > 20) {
        // extractPdfText 内部已经切片了第一个任务，我们需要拿全文缓存
        writeFullTextCache(firstWithUrl)
        fullText = fs.existsSync(cachePath) ? fs.readFileSync(cachePath, 'utf-8') : text
      }
    } catch (err) {
      return group.map(t => ({ taskId: t.id, title: t.title, docKey, extracted: false, textLength: 0, fromCache: false, error: String(err) }))
    }
  }

  // 对每个任务用缓存全文切片
  const results: ExtractResult[] = []
  const allTitles = group.map(t => t.title)
  for (const task of group) {
    if (task.req_doc_text && task.req_doc_text.length > 20) {
      results.push({ taskId: task.id, title: task.title, docKey, extracted: true, textLength: task.req_doc_text.length, fromCache: true })
      continue
    }
    const siblings = allTitles.filter(t => t !== task.title)
    const sliced = sliceByTitleDirect(fullText, task.title, siblings)
    if (sliced.length > 10) {
      db.prepare('UPDATE tasks SET req_doc_text = ? WHERE id = ?').run(sliced, task.id)
    }
    results.push({ taskId: task.id, title: task.title, docKey, extracted: sliced.length > 10, textLength: sliced.length, fromCache: true })
  }
  return results
}

/** 用缓存全文为指定任务切片（需查兄弟任务标题） */
function sliceByTitle(fullText: string, title: string, taskId: string): string {
  const db = getDb()
  const siblings = db.prepare(
    "SELECT title FROM tasks WHERE req_doc_name = (SELECT req_doc_name FROM tasks WHERE id = ?) AND id != ?"
  ).all(taskId, taskId) as { title: string }[]
  return sliceByTitleDirect(fullText, title, siblings.map(s => s.title))
}

/** 直接切片逻辑（从 intranet.ts 移植，避免循环依赖） */
function sliceByTitleDirect(fullText: string, currentTitle: string, siblingTitles: string[]): string {
  if (!fullText || fullText.length < 20) return ''
  if (siblingTitles.length === 0) return fullText

  const anchorIdx = findTitlePos(fullText, currentTitle)
  if (anchorIdx === -1) return fullText

  const boundaries: { idx: number }[] = [{ idx: anchorIdx }]
  for (const title of siblingTitles) {
    const idx = findTitlePos(fullText, title)
    if (idx !== -1 && idx !== anchorIdx) boundaries.push({ idx })
  }
  boundaries.sort((a, b) => a.idx - b.idx)

  const myPos = boundaries.findIndex(b => b.idx === anchorIdx)
  if (myPos === -1) return fullText

  let start = anchorIdx
  const before = fullText.substring(Math.max(0, anchorIdx - 30), anchorIdx)
  const bracketPos = before.lastIndexOf('【')
  if (bracketPos !== -1) start = Math.max(0, anchorIdx - 30) + bracketPos

  let end = fullText.length
  if (myPos + 1 < boundaries.length) end = boundaries[myPos + 1].idx

  return fullText.substring(start, end).trim()
}

function findTitlePos(text: string, title: string): number {
  if (!title || title.length < 2) return -1
  const exact = text.indexOf(title)
  if (exact !== -1) return exact
  const clean = text.replace(/\s/g, '')
  const cleanTitle = title.replace(/\s/g, '')
  const idx = clean.indexOf(cleanTitle)
  if (idx === -1) return -1
  let pos = 0
  for (let i = 0; i < text.length; i++) {
    if (pos >= idx) return i
    if (!/\s/.test(text[i])) pos++
  }
  return -1
}

/** 将 PDF 全文写入缓存（同一文档组只缓存一次） */
function writeFullTextCache(task: { id: string; req_doc_name: string }) {
  const db = getDb()
  // 尝试找到同文档组中 req_doc_text 最长的任务（最可能是全文）
  const best = db.prepare(`
    SELECT req_doc_text FROM tasks
    WHERE req_doc_name = ? AND LENGTH(req_doc_text) > 20
    ORDER BY LENGTH(req_doc_text) DESC LIMIT 1
  `).get(task.req_doc_name) as { req_doc_text: string } | undefined

  if (!best?.req_doc_text) return

  ensureCacheDir()
  const cacheKey = docKeyFromName(task.req_doc_name)
  const cachePath = path.join(CACHE_DIR, cacheKey)
  if (!fs.existsSync(cachePath)) {
    fs.writeFileSync(cachePath, best.req_doc_text, 'utf-8')
  }
}
