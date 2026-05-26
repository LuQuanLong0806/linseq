<template>
  <el-container class="main-layout">
    <!-- 侧边栏 -->
    <el-aside :width="isCollapsed ? '64px' : '220px'" class="aside">
      <div class="logo-area">
        <div class="logo-icon">⚡</div>
        <transition name="fade">
          <span v-show="!isCollapsed" class="logo-text">灵序 LINSEQ</span>
        </transition>
      </div>
      <el-menu
        :default-active="currentRoute"
        :collapse="isCollapsed"
        router
        class="side-menu"
        background-color="#1a1a2e"
        text-color="#a0aec0"
        active-text-color="#667eea"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataBoard /></el-icon>
          <template #title>任务总览</template>
        </el-menu-item>
        <el-menu-item index="/tasks">
          <el-icon><List /></el-icon>
          <template #title>任务列表</template>
        </el-menu-item>
        <el-menu-item index="/ai-todo">
          <el-icon><MagicStick /></el-icon>
          <template #title>AI 待办</template>
        </el-menu-item>
        <el-menu-item index="/review">
          <el-icon><Checked /></el-icon>
          <template #title>待审核</template>
        </el-menu-item>
        <el-menu-item index="/sync">
          <el-icon><Refresh /></el-icon>
          <template #title>同步中心</template>
        </el-menu-item>
        <el-menu-item index="/devlog">
          <el-icon><Notebook /></el-icon>
          <template #title>开发记录</template>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <template #title>系统设置</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 主内容区 -->
    <el-container class="main-container">
      <el-header class="header">
        <div class="header-left">
          <el-icon
            class="collapse-btn"
            @click="isCollapsed = !isCollapsed"
          >
            <Fold v-if="!isCollapsed" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-badge :value="syncBadge" :hidden="syncBadge === 0" class="sync-badge">
            <el-button :icon="Refresh" circle size="small" @click="handleSync" :loading="taskStore.syncing" />
          </el-badge>
          <el-tag effect="dark" type="info" size="small" class="time-tag">
            {{ currentTime }}
          </el-tag>
        </div>
      </el-header>

      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="slide-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { DataBoard, List, Refresh, Notebook, Setting, Fold, Expand, MagicStick, Checked } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const route = useRoute()
const taskStore = useTaskStore()

const isCollapsed = ref(false)
const currentTime = ref(dayjs().format('HH:mm'))
let timer: ReturnType<typeof setInterval> | null = null

const currentRoute = computed(() => route.path)
const currentTitle = computed(() => (route.meta.title as string) || '灵序')
const syncBadge = computed(() => taskStore.stats.pending + taskStore.stats.overdue)

function handleSync() {
  taskStore.syncTasks()
}

onMounted(() => {
  timer = setInterval(() => {
    currentTime.value = dayjs().format('HH:mm')
  }, 30000)
  taskStore.fetchTasks()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style lang="scss" scoped>
.main-layout {
  height: 100vh;
  overflow: hidden;
}

.aside {
  background: #1a1a2e;
  transition: width 0.3s ease;
  overflow: hidden;
}

.logo-area {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60px;
  padding: 0 16px;
  gap: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);

  .logo-icon {
    font-size: 24px;
    flex-shrink: 0;
  }

  .logo-text {
    font-size: 16px;
    font-weight: 700;
    color: #667eea;
    white-space: nowrap;
    letter-spacing: 2px;
  }
}

.side-menu {
  border-right: none !important;

  :deep(.el-menu-item) {
    &:hover {
      background-color: rgba(102, 126, 234, 0.1) !important;
    }
    &.is-active {
      background-color: rgba(102, 126, 234, 0.15) !important;
      border-right: 3px solid #667eea;
    }
  }
}

.main-container {
  background: #f0f2f5;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  padding: 0 24px;
  height: 56px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;

  .collapse-btn {
    font-size: 20px;
    cursor: pointer;
    color: #606266;
    transition: color 0.2s;
    &:hover { color: #667eea; }
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;

  .time-tag {
    font-family: 'Courier New', monospace;
  }
}

.main-content {
  padding: 20px;
  overflow-y: auto;
}

/* 过渡动画 */
.slide-fade-enter-active {
  transition: all 0.25s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}
.slide-fade-enter-from {
  transform: translateX(20px);
  opacity: 0;
}
.slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
