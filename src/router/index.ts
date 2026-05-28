import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', noAuth: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '任务总览', icon: 'DataBoard' },
      },
      {
        path: 'tasks',
        name: 'TaskList',
        component: () => import('@/views/task/index.vue'),
        meta: { title: '任务列表', icon: 'List' },
      },
      {
        path: 'tasks/:id',
        name: 'TaskDetail',
        component: () => import('@/views/task/detail.vue'),
        meta: { title: '任务详情', icon: 'Document', hidden: true },
      },
      {
        path: 'sync',
        name: 'SyncCenter',
        component: () => import('@/views/sync/index.vue'),
        meta: { title: '同步中心', icon: 'Refresh' },
      },
      {
        path: 'projects',
        name: 'Projects',
        component: () => import('@/views/projects/index.vue'),
        meta: { title: '项目配置', icon: 'FolderOpened' },
      },
      {
        path: 'ai-todo',
        name: 'AITodo',
        component: () => import('@/views/ai-todo/index.vue'),
        meta: { title: 'AI 待办', icon: 'MagicStick' },
      },
      {
        path: 'review',
        name: 'Review',
        component: () => import('@/views/review/index.vue'),
        meta: { title: '待审核', icon: 'Checked' },
      },
      {
        path: 'devlog',
        name: 'DevLog',
        component: () => import('@/views/devlog/index.vue'),
        meta: { title: '开发记录', icon: 'Notebook' },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/settings/index.vue'),
        meta: { title: '系统设置', icon: 'Setting' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  document.title = `${to.meta.title || 'LineSequence'} - 灵序`
  const token = localStorage.getItem('linesequence-token')
  if (!to.meta.noAuth && !token) {
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

export default router
