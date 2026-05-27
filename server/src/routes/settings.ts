/**
 * 系统设置 API
 */
import { Router } from 'express'
import { getDb } from '../db/index.js'

const router = Router()

// 获取报告输出目录
router.get('/report-dir', (_req, res) => {
  try {
    const db = getDb()
    const row = db.prepare("SELECT value FROM sync_config WHERE key = 'reportOutputDir'").get() as { value: string } | undefined
    const dir = row?.value ? JSON.parse(row.value) : 'F:\\0_workspace\\00_Agent自测报告'
    res.json({ code: 0, message: 'success', data: { reportOutputDir: dir } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

// 更新报告输出目录
router.put('/report-dir', (req, res) => {
  try {
    const db = getDb()
    const { reportOutputDir } = req.body as { reportOutputDir: string }
    if (!reportOutputDir) {
      return res.status(400).json({ code: 400, message: '请输入目录路径', data: null })
    }
    db.prepare(`
      INSERT INTO sync_config (key, value) VALUES ('reportOutputDir', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify(reportOutputDir))
    res.json({ code: 0, message: 'success', data: { reportOutputDir } })
  } catch (err) {
    res.status(500).json({ code: 500, message: String(err), data: null })
  }
})

export default router
