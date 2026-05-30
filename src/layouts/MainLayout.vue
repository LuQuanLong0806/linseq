<template>
  <el-container :class="['main-layout', theme]">
    <canvas ref="bgCanvas" class="global-bg-canvas"></canvas>
    <!-- 侧边栏 -->
    <el-aside :width="isCollapsed ? '56px' : '180px'" class="aside">
      <div class="logo-area">
        <div class="logo-icon">
          <div class="logo-glow"></div>
          <svg viewBox="0 0 40 40" fill="none" width="30" height="30" class="logo-svg">
            <defs>
              <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#E8D5FF"/>
                <stop offset="100%" stop-color="#9D5CFF"/>
              </linearGradient>
              <filter id="boltGlow">
                <feGaussianBlur stdDeviation="2.5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <!-- 电流环绕：外圈 -->
            <circle cx="20" cy="20" r="18" stroke="#D4B5FF" stroke-width="1.8" fill="none" stroke-dasharray="6 8" opacity="0.8">
              <animate attributeName="stroke-dashoffset" from="0" to="-56" dur="2.5s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite"/>
            </circle>
            <!-- 电流环绕：内圈反方向 -->
            <circle cx="20" cy="20" r="15" stroke="#00E5FF" stroke-width="1.2" fill="none" stroke-dasharray="3 10" opacity="0.6">
              <animate attributeName="stroke-dashoffset" from="0" to="52" dur="3s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.4;1;0.4" dur="2.5s" repeatCount="indefinite"/>
            </circle>
            <!-- 闪电主体 -->
            <g filter="url(#boltGlow)">
              <polygon points="23,3 10,20 20,20 16,38 32,18 22,18" fill="url(#boltGrad)">
                <animate attributeName="opacity" values="0.9;1;0.9" dur="1.8s" repeatCount="indefinite"/>
              </polygon>
            </g>
            <!-- 闪电内部高光 -->
            <polygon points="22,6 14,19 20,19 18,32 29,19 23,19" fill="#FFFFFF" opacity="0.5">
              <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite"/>
            </polygon>
            <!-- 微光粒子1：沿外圈飘 -->
            <circle r="2.2" fill="#D4B5FF">
              <animate attributeName="cx" values="38;20;2;20;38" dur="4s" repeatCount="indefinite"/>
              <animate attributeName="cy" values="20;2;20;38;20" dur="4s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0;1;0" dur="4s" repeatCount="indefinite"/>
            </circle>
            <!-- 微光粒子2：反方向飘 -->
            <circle r="1.8" fill="#00E5FF">
              <animate attributeName="cx" values="2;20;38;20;2" dur="3.5s" repeatCount="indefinite"/>
              <animate attributeName="cy" values="20;38;20;2;20" dur="3.5s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0;1;0" dur="3.5s" repeatCount="indefinite"/>
            </circle>
          </svg>
        </div>
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
        :text-color="theme === 'dark' ? '#E8F0FF' : '#1D1D1F'"
        :active-text-color="theme === 'dark' ? '#00E5FF' : '#007AFF'"
      >
        <el-menu-item index="/ai-todo">
          <el-icon><MagicStick /></el-icon>
          <template #title>
            <span>AI 待办</span>
            <span v-if="hasAgentReply && !agentReplySeen" class="agent-reply-dot"></span>
          </template>
        </el-menu-item>
        <el-menu-item index="/tasks">
          <el-icon><List /></el-icon>
          <template #title>任务列表</template>
        </el-menu-item>
        <el-menu-item index="/review">
          <el-icon><Checked /></el-icon>
          <template #title>
            <span class="menu-item-label">待审核</span>
            <el-tag v-if="reviewCount > 0" size="small" type="danger" effect="dark" round class="menu-count-tag">{{ reviewCount > 99 ? '99+' : reviewCount }}</el-tag>
          </template>
        </el-menu-item>
        <el-menu-item index="/dashboard">
          <el-icon><DataBoard /></el-icon>
          <template #title>任务总览</template>
        </el-menu-item>
        <el-menu-item index="/projects">
          <el-icon><FolderOpened /></el-icon>
          <template #title>项目配置</template>
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
          <el-tooltip content="AI 会话" placement="bottom">
            <el-icon class="chat-toggle" @click="handleChatClick">
              <ChatDotRound />
              <span v-if="chatBadge > 0" class="chat-badge">{{ chatBadge }}</span>
            </el-icon>
          </el-tooltip>
          <el-tooltip :content="theme === 'dark' ? '切换浅色主题' : '切换深色主题'" placement="bottom">
            <el-icon class="theme-toggle" @click="toggleTheme">
              <Sunny v-if="theme === 'dark'" />
              <Moon v-else />
            </el-icon>
          </el-tooltip>
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { DataBoard, List, Refresh, Notebook, Setting, Fold, Expand, MagicStick, Checked, FolderOpened, Sunny, Moon, ChatDotRound } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { useCyberAnimations } from '@/composables/useCyberAnimations'
import { useCyberBackground } from '@/composables/useCyberBackground'
import { useDesktop } from '@/composables/useDesktop'
import { useTheme } from '@/composables/useTheme'
import { useAgentChat } from '@/composables/useAgentChat'
import { useChatPanel } from '@/composables/useChatPanel'

useCyberAnimations('.cyber-glass')
const { isDesktop, sendNotification } = useDesktop()
const { theme, toggleTheme, initTheme } = useTheme()

const route = useRoute()
const router = useRouter()
const taskStore = useTaskStore()
const { inReview, unreadCount } = useAgentChat()
const chatBadge = computed(() => inReview.value + unreadCount.value)
const { openChat } = useChatPanel()
const bgCanvas = ref<HTMLCanvasElement | null>(null)
const { start: startBg, stop: stopBg } = useCyberBackground(bgCanvas)

const isCollapsed = ref(false)
const currentTime = ref(dayjs().format('HH:mm'))

function handleChatClick() {
  if (route.path === '/ai-todo') {
    openChat()
  } else {
    router.push('/ai-todo')
  }
}
let timer: ReturnType<typeof setInterval> | null = null

const currentRoute = computed(() => route.path)
const currentTitle = computed(() => (route.meta.title as string) || '灵序')
const reviewCount = computed(() => taskStore.tasks.filter(t => t.aiStatus === 'ai_review').length)
const hasAgentReply = computed(() => {
  return taskStore.tasks.some(t => {
    if (t.aiStatus !== 'ai_dev') return false
    const logs = t.devLog || []
    return logs.some(l => l.action === '回复' &&
      dayjs(l.time).isAfter(dayjs().subtract(5, 'minute')))
  })
})
const agentReplySeen = ref(false)

watch(() => route.path, (path) => {
  if (path === '/ai-todo') agentReplySeen.value = true
})

const BASE_TITLE = '灵序 LineSequence'
let titleFlashTimer: ReturnType<typeof setInterval> | null = null
let titleFlashOn = false
let lastNotifiedAgent = false

watch([reviewCount, hasAgentReply, agentReplySeen], ([count, hasReply, seen]) => {
  if (titleFlashTimer) { clearInterval(titleFlashTimer); titleFlashTimer = null }
  const showAgent = hasReply && !seen
  // Agent 回复首次出现时发桌面通知
  if (showAgent && !lastNotifiedAgent) {
    lastNotifiedAgent = true
    sendNotification('Agent 回复', '收到 Agent 开发回复，请查看')
  }
  if (!showAgent) lastNotifiedAgent = false
  if (count > 0 && showAgent) {
    let tick = 0
    titleFlashTimer = setInterval(() => {
      tick = (tick + 1) % 4
      document.title = tick < 2
        ? `🔴 (${count}) 待审核 ${BASE_TITLE}`
        : `🟣 Agent 回复 ${BASE_TITLE}`
    }, 800)
  } else if (count > 0) {
    titleFlashOn = false
    titleFlashTimer = setInterval(() => {
      titleFlashOn = !titleFlashOn
      document.title = titleFlashOn
        ? `🔴 (${count}) 待审核 ${BASE_TITLE}`
        : `　 (${count}) ${BASE_TITLE}`
    }, 800)
  } else if (showAgent) {
    titleFlashOn = false
    titleFlashTimer = setInterval(() => {
      titleFlashOn = !titleFlashOn
      document.title = titleFlashOn
        ? `🟣 Agent 回复 ${BASE_TITLE}`
        : `　 ${BASE_TITLE}`
    }, 800)
  } else {
    document.title = BASE_TITLE
  }
}, { immediate: true })

onMounted(async () => {
  initTheme()
  startBg()
  timer = setInterval(() => {
    currentTime.value = dayjs().format('HH:mm')
  }, 30000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (titleFlashTimer) clearInterval(titleFlashTimer)
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
  background: var(--cyber-glass-bg);
  border-right: 1px solid var(--cyber-glass-border);
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
  border-bottom: 1px solid var(--cyber-glass-border);

  .logo-icon {
    flex-shrink: 0;
    position: relative;
  }

  .logo-svg {
    filter: drop-shadow(0 0 10px rgba(157,92,255,0.7)) drop-shadow(0 0 20px rgba(0,229,255,0.3));
    animation: logoBreathe 3s ease-in-out infinite;
  }

  .logo-glow {
    position: absolute;
    inset: -12px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(157,92,255,0.35) 0%, rgba(0,229,255,0.1) 50%, transparent 75%);
    animation: glowPulse 3s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes logoBreathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }

  @keyframes glowPulse {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.25); }
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
      background-color: var(--cyber-glass-border) !important;
    }
    &.is-active {
      background-color: var(--cyber-glass-border) !important;
      border-right: 3px solid var(--cyber-cyan);
      color: var(--cyber-cyan);
    }
  }
}

.menu-count-tag {
  margin-left: 8px;
  vertical-align: middle;
  font-size: 10px;
  height: 16px;
  padding: 0 5px;
  line-height: 16px;
  animation: badge-pulse 2s ease-in-out infinite;
}

.menu-item-label {
  vertical-align: middle;
}

@keyframes badge-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
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
  background: var(--cyber-glass-bg);
  border-bottom: 1px solid var(--cyber-glass-border);
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

  .theme-toggle {
    font-size: 20px;
    cursor: pointer;
    color: var(--cyber-text-secondary);
    transition: color 0.2s, transform 0.3s;
    &:hover { color: var(--cyber-cyan); transform: rotate(30deg); }
  }

  .chat-toggle {
    font-size: 20px;
    cursor: pointer;
    color: var(--cyber-text-secondary);
    transition: color 0.2s, transform 0.2s;
    position: relative;
    &:hover { color: var(--cyber-purple); transform: scale(1.1); }
  }

  .chat-badge {
    position: absolute;
    top: -4px;
    right: -6px;
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    background: #f56c6c;
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
    text-align: center;
    padding: 0 4px;
  }

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
  animation: globalScanRotate 6s linear infinite;
}
@keyframes globalScanRotate { to { --global-scan-angle: 360deg; } }
@property --global-scan-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

/* Global linear sweep beam — left to right, wider beam + faster cycle */
.main-content::after {
  content: '';
  position: fixed;
  top: 0; left: -80%;
  width: 80%; height: 100%;
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba(0, 229, 255, 0.06) 20%,
    rgba(0, 229, 255, 0.14) 40%,
    rgba(157, 92, 255, 0.10) 55%,
    rgba(255, 125, 0, 0.06) 65%,
    transparent 80%
  );
  pointer-events: none;
  z-index: 9998;
  animation: scanBeam 5s ease-in-out infinite;
  animation-delay: 2s;
}

@keyframes scanBeam {
  0%   { left: -80%; opacity: 0; }
  5%   { opacity: 1; }
  60%  { left: 120%; opacity: 1; }
  65%  { opacity: 0; }
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

.agent-reply-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #9D5CFF;
  box-shadow: 0 0 8px #9D5CFF; display: inline-block; margin-left: 6px; vertical-align: middle;
  animation: agentPulse 1.2s ease-in-out infinite;
}
@keyframes agentPulse {
  0%, 100% { opacity: 0.5; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

// ── Light Theme: Kill all cyberpunk effects ──
.light {
  &.main-layout::before,
  .main-layout::before,
  &::before {
    display: none !important;
    animation: none !important;
  }

  .main-content::after {
    display: none !important;
    animation: none !important;
  }

  .global-bg-canvas {
    opacity: 0 !important;
    pointer-events: none;
  }

  .aside {
    background: rgba(245, 245, 247, 0.9);
    border-right: none;
    backdrop-filter: saturate(180%) blur(20px);
  }

  .logo-area {
    border-bottom: none;
    .logo-glow { display: none; }
    .logo-svg {
      filter: none;
      animation: none;
    }
    .logo-text { color: #1D1D1F; letter-spacing: 1px; }
  }

  .side-menu {
    :deep(.el-menu-item) {
      margin: 2px 8px;
      border-radius: 8px;
      &:hover {
        background-color: rgba(0, 0, 0, 0.04) !important;
      }
      &.is-active {
        background-color: rgba(0, 122, 255, 0.1) !important;
        color: #007AFF !important;
        border-right: none !important;
      }
    }
  }

  .header {
    background: rgba(255, 255, 255, 0.72);
    border-bottom: none;
    backdrop-filter: saturate(180%) blur(20px);
    box-shadow: 0 0.5px 0 rgba(0, 0, 0, 0.06);
  }

  .header-left .collapse-btn:hover { color: #007AFF; }
  .header-right .theme-toggle:hover { color: #007AFF; }
}
</style>
