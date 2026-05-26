const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.resolve('F:\\00_project\\LineSequence\\server\\data\\linesequence.db');
const db = new Database(dbPath);

const uuid = () => crypto.randomUUID();

// Insert test tasks
const tasks = [
  { id: uuid(), source_id: 'FE-2026-001', title: '用户管理页面开发', module: '用户中心', priority: 'high', status: 'in_progress', description: '开发用户管理模块的前端页面，包含用户列表、详情、编辑功能', deadline: '2026-06-05' },
  { id: uuid(), source_id: 'FE-2026-002', title: '数据看板图表优化', module: '数据看板', priority: 'medium', status: 'pending', description: '优化数据看板的图表展示效果，增加交互式筛选功能', deadline: '2026-06-10' },
  { id: uuid(), source_id: 'FE-2026-003', title: '权限系统对接', module: '系统设置', priority: 'urgent', status: 'pending', description: '对接后端权限接口，实现按钮级权限控制', deadline: '2026-05-30' },
  { id: uuid(), source_id: 'FE-2026-004', title: '消息通知组件封装', module: '公共组件', priority: 'medium', status: 'self_test', description: '封装统一的消息通知组件，支持多种消息类型和交互方式', deadline: '2026-06-08' },
  { id: uuid(), source_id: 'FE-2026-005', title: '表单生成器功能迭代', module: '低代码平台', priority: 'low', status: 'submitted', description: '迭代表单生成器，支持自定义校验规则和联动逻辑', deadline: '2026-06-15' },
  { id: uuid(), source_id: 'FE-2026-006', title: '登录页UI重构', module: '用户中心', priority: 'high', status: 'completed', description: '重构登录页UI，适配新的设计规范', deadline: '2026-05-25' },
];

const insertTask = db.prepare(
  `INSERT OR IGNORE INTO tasks (id, source_id, title, module, priority, status, description, deadline, tags, is_synced)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 1)`
);

const insertDevLog = db.prepare(
  `INSERT INTO dev_logs (id, task_id, action, content, author, auto_fixed)
   VALUES (?, ?, ?, ?, ?, ?)`
);

for (const t of tasks) {
  insertTask.run(t.id, t.source_id, t.title, t.module, t.priority, t.status, t.description, t.deadline);
}

// Insert dev logs for the first task
const firstTask = tasks[0];
const logActions = [
  { action: '开始开发', content: '创建用户管理页面基础框架，搭建列表和搜索组件', author: 'agent' },
  { action: '接口对接', content: '对接用户列表接口，完成分页和筛选功能', author: 'agent' },
  { action: '样式优化', content: '调整表格样式，适配暗色主题', author: 'agent', auto_fixed: true },
  { action: 'Bug修复', content: '修复搜索框清空后列表未重置的问题', author: 'agent', auto_fixed: true },
];

for (const log of logActions) {
  insertDevLog.run(uuid(), firstTask.id, log.action, log.content, log.author, log.auto_fixed ? 1 : 0);
}

// Dev logs for task 3 (urgent)
const urgentTask = tasks[2];
insertDevLog.run(uuid(), urgentTask.id, '需求分析', '分析权限系统接口文档，梳理权限树结构', 'agent', 0);

// Dev logs for task 4
const selfTestTask = tasks[3];
insertDevLog.run(uuid(), selfTestTask.id, '自测中', '完成消息通知组件单元测试，覆盖率 92%', 'agent', 0);
insertDevLog.run(uuid(), selfTestTask.id, 'Bug修复', '修复通知弹窗在移动端显示异常的问题', 'agent', 1);

console.log('Seed data inserted successfully');
console.log('Tasks:', tasks.length);
console.log('Dev logs:', logActions.length + 3);

db.close();
