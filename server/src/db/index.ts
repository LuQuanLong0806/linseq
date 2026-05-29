/**
 * SQLite 数据库初始化与操作（v2 - 完整内网字段 + 自定义扩展字段）
 */
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../../data/linesequence.db')

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) throw new Error('数据库未初始化')
  return db
}

export function initDatabase(): void {
  const dataDir = path.dirname(DB_PATH)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // ========== 任务表 ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      source_id TEXT UNIQUE NOT NULL,
      intranet_id TEXT DEFAULT '',
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      module TEXT DEFAULT '',
      module_short TEXT DEFAULT '',
      product TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      deadline TEXT DEFAULT '',
      create_time TEXT DEFAULT (datetime('now', 'localtime')),
      update_time TEXT DEFAULT (datetime('now', 'localtime')),
      sync_time TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      is_synced INTEGER DEFAULT 0,

      -- 内网业务字段
      project TEXT DEFAULT '',
      customer TEXT DEFAULT '',
      customer_manager TEXT DEFAULT '',
      task_type TEXT DEFAULT '',
      bug_or_req TEXT DEFAULT '',
      work_hours REAL DEFAULT 0,
      submit_time TEXT DEFAULT '',
      developer TEXT DEFAULT '',
      supervisor TEXT DEFAULT '',
      supervisor_id TEXT DEFAULT '',
      product_manager TEXT DEFAULT '',
      dev_leader TEXT DEFAULT '',
      handler TEXT DEFAULT '',
      department TEXT DEFAULT '',
      department_id TEXT DEFAULT '',
      is_closed INTEGER DEFAULT 0,
      intranet_node TEXT DEFAULT '',
      intranet_node_name TEXT DEFAULT '',
      node_index INTEGER DEFAULT 0,
      stale_days INTEGER DEFAULT 0,
      flow_days INTEGER DEFAULT 0,
      days_since_create INTEGER DEFAULT 0,
      reject_flag INTEGER DEFAULT 0,
      flow_id TEXT DEFAULT '',
      work_id TEXT DEFAULT '',
      version TEXT DEFAULT '',

      -- 用户自定义扩展字段（二次编辑）
      project_path TEXT DEFAULT '',
      git_branch TEXT DEFAULT '',
      custom_description TEXT DEFAULT '',
      acceptance_criteria TEXT DEFAULT '',
      requirement_doc TEXT DEFAULT '',
      local_path TEXT DEFAULT ''
    )
  `)

  // 安全添加新列（兼容已有数据库）
  const newColumns: [string, string][] = [
    ['intranet_id', 'TEXT DEFAULT ""'],
    ['module_short', 'TEXT DEFAULT ""'],
    ['product', 'TEXT DEFAULT ""'],
    ['customer_manager', 'TEXT DEFAULT ""'],
    ['submit_time', 'TEXT DEFAULT ""'],
    ['supervisor_id', 'TEXT DEFAULT ""'],
    ['department', 'TEXT DEFAULT ""'],
    ['department_id', 'TEXT DEFAULT ""'],
    ['node_index', 'INTEGER DEFAULT 0'],
    ['flow_days', 'INTEGER DEFAULT 0'],
    ['days_since_create', 'INTEGER DEFAULT 0'],
    ['flow_id', 'TEXT DEFAULT ""'],
    ['work_id', 'TEXT DEFAULT ""'],
    ['version', 'TEXT DEFAULT ""'],
    ['project_path', 'TEXT DEFAULT ""'],
    ['git_branch', 'TEXT DEFAULT ""'],
    ['custom_description', 'TEXT DEFAULT ""'],
    ['local_path', 'TEXT DEFAULT ""'],
    ['ai_status', 'TEXT DEFAULT ""'],
    ['task_page_url', 'TEXT DEFAULT ""'],
    ['review_comment', 'TEXT DEFAULT ""'],
    ['review_time', 'TEXT DEFAULT ""'],
    ['review_result', 'TEXT DEFAULT ""'],
    ['complete_time', 'TEXT DEFAULT ""'],
    ['rework_count', 'INTEGER DEFAULT 0'],
    ['ai_output', 'TEXT DEFAULT ""'],
    ['req_doc_name', 'TEXT DEFAULT ""'],
    ['req_doc_url', 'TEXT DEFAULT ""'],
    ['req_doc_text', 'TEXT DEFAULT ""'],
    ['group_id', 'TEXT DEFAULT ""'],
    ['ai_question', 'TEXT DEFAULT ""'],
    ['is_hidden', 'INTEGER DEFAULT 0'],
  ]

  // task_versions 新增列
  const versionColumns: [string, string][] = [
    ['files_changed', "TEXT DEFAULT '[]'"],
    ['test_result', "TEXT DEFAULT ''"],
    ['summary', "TEXT DEFAULT ''"],
    ['screenshots', "TEXT DEFAULT '[]'"],
    ['report_text', "TEXT DEFAULT ''"],
    ['report_path', "TEXT DEFAULT ''"],
  ]
  for (const [col, type] of versionColumns) {
    try { db.exec(`ALTER TABLE task_versions ADD COLUMN ${col} ${type}`) } catch { /* 已存在 */ }
  }

  // task_groups 新增 description 列（安全添加）
  try { db.exec(`ALTER TABLE task_groups ADD COLUMN description TEXT DEFAULT ''`) } catch { /* 已存在 */ }

  for (const [col, type] of newColumns) {
    try {
      db.exec(`ALTER TABLE tasks ADD COLUMN ${col} ${type}`)
    } catch {
      // 列已存在
    }
  }

  // ========== 任务分组表 ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      task_ids TEXT DEFAULT '[]',
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  // ========== 项目配置表 ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      local_path TEXT DEFAULT '',
      git_url TEXT DEFAULT '',
      branches TEXT DEFAULT '[]',
      default_branch TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  // ========== 任务版本表（AI 迭代版本管理） ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_versions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      version_number TEXT NOT NULL,
      iteration INTEGER DEFAULT 0,
      ai_output TEXT DEFAULT '',
      dev_logs TEXT DEFAULT '[]',
      ai_duration_ms INTEGER DEFAULT 0,
      prev_review_comment TEXT DEFAULT '',
      status TEXT DEFAULT 'pending_review',
      is_final INTEGER DEFAULT 0,
      git_commit_id TEXT DEFAULT '',
      git_commit_time TEXT DEFAULT '',
      git_branch TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `)

  // ========== 开发记录表 ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS dev_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      time TEXT DEFAULT (datetime('now', 'localtime')),
      action TEXT DEFAULT '',
      content TEXT DEFAULT '',
      author TEXT DEFAULT 'agent',
      auto_fixed INTEGER DEFAULT 0,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `)

  // ========== 任务补充说明表（开发中追加指令） ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_supplements (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      read_by_agent INTEGER DEFAULT 0,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `)

  // ========== 同步记录表 ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_records (
      id TEXT PRIMARY KEY,
      sync_time TEXT DEFAULT (datetime('now', 'localtime')),
      status TEXT DEFAULT 'success',
      total_tasks INTEGER DEFAULT 0,
      new_tasks INTEGER DEFAULT 0,
      updated_tasks INTEGER DEFAULT 0,
      unchanged_tasks INTEGER DEFAULT 0,
      error_messages TEXT DEFAULT '[]'
    )
  `)

  // ========== 同步配置表 ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // ========== 用户表 ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      cookie TEXT DEFAULT '',
      cookie_expiry TEXT DEFAULT '',
      last_sync_time TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  // users 表加 token/token_expiry 列（安全 ALTER）
  try { db.exec(`ALTER TABLE users ADD COLUMN token TEXT DEFAULT ''`) } catch { /* 已存在 */ }
  try { db.exec(`ALTER TABLE users ADD COLUMN token_expiry TEXT DEFAULT ''`) } catch { /* 已存在 */ }

  // 已有表加 user_id 列（安全 ALTER，兼容已有数据）
  const userIdColumns: [string, string][] = [
    ['tasks', 'TEXT DEFAULT ""'],
    ['sync_config', 'TEXT DEFAULT ""'],
    ['sync_records', 'TEXT DEFAULT ""'],
    ['project_configs', 'TEXT DEFAULT ""'],
    ['task_groups', 'TEXT DEFAULT ""'],
  ]
  for (const [table, type] of userIdColumns) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN user_id ${type}`) } catch { /* 已存在 */ }
  }

  // 迁移：首次启动时，读取旧 sync_config 中的 loginUser，创建默认用户并绑定所有数据
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  if (userCount === 0) {
    const loginRow = db.prepare("SELECT value FROM sync_config WHERE key = 'loginUser'").get() as { value: string } | undefined
    const legacyUser = loginRow ? (loginRow.value.replace(/^"|"$/g, '')) : 'luql'
    db.prepare('INSERT OR IGNORE INTO users (username, password, display_name) VALUES (?, ?, ?)').run(legacyUser, '123', legacyUser)
    for (const [table] of userIdColumns) {
      db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ''`).run(legacyUser)
    }
    // 设置默认当前用户
    db.prepare("INSERT OR IGNORE INTO sync_config (key, value) VALUES ('currentUser', ?)").run(JSON.stringify(legacyUser))
    console.log(`[DB] 迁移完成: 默认用户 ${legacyUser}`)
  }

  // ========== Agent Key 表 ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      last_used_at TEXT DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(username) ON DELETE CASCADE
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_keys_key ON agent_keys(key)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_keys_user ON agent_keys(user_id)')

  // ========== Agent 对话记录表 ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_chat_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_chat_user ON agent_chat_logs(user_id)')

  // ========== 索引 ==========
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_source_id ON tasks(source_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
    CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer);
    CREATE INDEX IF NOT EXISTS idx_tasks_is_closed ON tasks(is_closed);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_path ON tasks(project_path);
    CREATE INDEX IF NOT EXISTS idx_tasks_ai_status ON tasks(ai_status);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_dev_logs_task_id ON dev_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_project_configs_name ON project_configs(name);
  `)

  console.log('[DB] 数据库初始化完成:', DB_PATH)
}
