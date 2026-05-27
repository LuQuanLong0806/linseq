<template>
  <el-container class="main-layout">
    <canvas ref="bgCanvas" class="global-bg-canvas"></canvas>
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
        background-color="transparent"
        text-color="#E8F0FF"
        active-text-color="#00E5FF"
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
        <el-menu-item index="/projects">
          <el-icon><FolderOpened /></el-icon>
          <template #title>项目配置</template>
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
import { DataBoard, List, Refresh, Notebook, Setting, Fold, Expand, MagicStick, Checked, FolderOpened } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { useCyberAnimations } from '@/composables/useCyberAnimations'
import { useCyberBackground } from '@/composables/useCyberBackground'

useCyberAnimations('.cyber-glass')

const route = useRoute()
const taskStore = useTaskStore()
const bgCanvas = ref<HTMLCanvasElement | null>(null)
const { start: startBg, stop: stopBg } = useCyberBackground(bgCanvas)

const isCollapsed = ref(false)
const currentTime = ref(dayjs().format('HH:mm'))
let timer: ReturnType<typeof setInterval> | null = null

const currentRoute = computed(() => route.path)
const currentTitle = computed(() => (route.meta.title as string) || '灵序')
const syncBadge = computed(() => taskStore.stats.pending + taskStore.stats.overdue)

function handleSync() {
  taskStore.syncTasks()
}

onMounted(async () => {
  await taskStore.fetchTasks()
  startBg()
  timer = setInterval(() => {
    currentTime.value = dayjs().format('HH:mm')
  }, 30000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  stopBg()
})
</script>

<style lang="scss" scoped>
.main-layout {
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.global-bg-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

.aside {
  position: relative;
  z-index: 1;
  background: rgba(10, 16, 31, 0.15);
  border-right: 1px solid rgba(0, 229, 255, 0.08);
  backdrop-filter: blur(2px);
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
  border-bottom: 1px solid rgba(0, 229, 255, 0.08);

  .logo-icon {
    font-size: 24px;
    flex-shrink: 0;
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.5);
  }

  .logo-text {
    font-size: 16px;
    font-weight: 700;
    color: var(--cyber-cyan);
    white-space: nowrap;
    letter-spacing: 2px;
  }
}

.side-menu {
  border-right: none !important;

  :deep(.el-menu-item) {
    &:hover {
      background-color: rgba(0, 229, 255, 0.08) !important;
    }
    &.is-active {
      background-color: rgba(0, 229, 255, 0.12) !important;
      border-right: 3px solid var(--cyber-cyan);
      color: var(--cyber-cyan);
    }
  }
}

.main-container {
  position: relative;
  z-index: 1;
  background: transparent;
}

.header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(10, 16, 31, 0.15);
  border-bottom: 1px solid rgba(0, 229, 255, 0.08);
  backdrop-filter: blur(2px);
  box-shadow: none;
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
    color: var(--cyber-text-secondary);
    transition: color 0.2s;
    &:hover { color: var(--cyber-cyan); }
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
  background: transparent;
  position: relative;
}

/* Global rotating beam — conic scan from top-left, like AI todo card glow */
.main-layout {
  position: relative;
}
.main-layout::before {
  content: '';
  position: fixed;
  inset: 0;
  background: conic-gradient(
    from var(--global-scan-angle, 0deg) at 0% 0%,
    transparent 0%,
    transparent 40%,
    rgba(0, 229, 255, 0.18) 55%,
    rgba(157, 92, 255, 0.12) 65%,
    rgba(255, 125, 0, 0.08) 72%,
    transparent 80%,
    transparent 100%
  );
  pointer-events: none;
  z-index: 9999;
  animation: globalScanRotate 10s linear infinite;
}
@keyframes globalScanRotate { to { --global-scan-angle: 360deg; } }
@property --global-scan-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

/* Global linear sweep beam — left to right, delayed 4s to offset from rotate */
.main-content::after {
  content: '';
  position: fixed;
  top: 0; left: -60%;
  width: 60%; height: 100%;
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba(0, 229, 255, 0.06) 25%,
    rgba(0, 229, 255, 0.12) 42%,
    rgba(157, 92, 255, 0.08) 55%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 9998;
  animation: scanBeam 8s ease-in-out infinite;
  animation-delay: 4s;
}

@keyframes scanBeam {
  0%   { left: -60%; opacity: 0; }
  5%   { opacity: 1; }
  50%  { left: 120%; opacity: 1; }
  55%  { opacity: 0; }
  100% { left: 120%; opacity: 0; }
}

/* 过渡动画 */
.slide-fade-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}
.slide-fade-enter-from {
  transform: translateX(20px) scale(0.98);
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
