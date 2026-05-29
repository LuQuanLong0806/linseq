<template>
  <Teleport to="body">
    <Transition name="slide-panel">
      <div v-if="panelOpen" class="chat-panel-mask" @click.self="closePanel">
        <div class="chat-panel">
          <!-- Header -->
          <div class="panel-header">
            <div class="header-left">
              <span class="header-title">Agent 聊天</span>
              <span v-if="currentSession" class="session-badge" :class="currentSession.status">
                {{ currentSession.status === 'active' ? '进行中' : '已结束' }}
              </span>
            </div>
            <div class="header-right">
              <el-select
                v-if="sessions.length > 0"
                :model-value="currentSession?.id"
                placeholder="切换会话"
                size="small"
                style="width: 160px"
                @change="loadContext"
              >
                <el-option
                  v-for="s in sessions"
                  :key="s.id"
                  :label="s.title"
                  :value="s.id"
                >
                  <div class="session-option">
                    <span class="session-opt-title">{{ s.title }}</span>
                    <span class="session-opt-badge" :class="s.status">
                      {{ s.status === 'active' ? '进行中' : `完成 ${s.completedCount}/${s.taskCount}` }}
                    </span>
                  </div>
                </el-option>
              </el-select>
              <button class="close-btn" @click="closePanel">×</button>
            </div>
          </div>

          <!-- Stats Bar -->
          <div class="stats-bar">
            <span class="stat-item">
              <span class="stat-num">{{ todoCount }}</span> 待办
            </span>
            <span class="stat-item">
              <span class="stat-num" :class="{ active: inDev > 0 }">{{ inDev }}</span> 开发中
            </span>
            <span class="stat-item">
              <span class="stat-num" :class="{ active: inReview > 0 }">{{ inReview }}</span> 待审核
            </span>
            <span v-if="currentTask" class="stat-current">
              当前: {{ currentTask.title.substring(0, 30) }}
            </span>
          </div>

          <!-- Messages Area -->
          <div ref="messagesRef" class="messages-area" @scroll="onScroll">
            <div v-if="hasMore" class="load-more">
              <button class="load-more-btn" @click="loadMore" :disabled="loading">
                {{ loading ? '加载中...' : '加载更多' }}
              </button>
            </div>

            <!-- Collapsed older messages -->
            <div v-if="hasOlderMessages && collapsed" class="collapsed-bar" @click="expandMessages">
              ··· {{ messages.length - (messages.length - 40) }} 条较早的消息 [展开]
            </div>

            <!-- Task groups -->
            <template v-for="(group, gi) in messagesByTask" :key="gi">
              <div v-if="group.taskId" class="task-divider">
                <span class="divider-line"></span>
                <span class="divider-text">{{ group.taskId.substring(0, 8) }}</span>
                <span class="divider-line"></span>
              </div>

              <template v-for="msg in (collapsed && gi === 0 ? group.msgs.slice(Math.max(0, group.msgs.length - 40)) : group.msgs)" :key="msg.id">
                <ChatMsgText v-if="msg.type === 'text'" :msg="msg" />
                <ChatMsgPlan v-else-if="msg.type === 'plan'" :msg="msg" :show-actions="isActive(msg)" @approve="handleApprovePlan" @redirect="handleRedirect" @abort="handleAbortPlan" />
                <ChatMsgProgress v-else-if="msg.type === 'progress'" :msg="msg" />
                <ChatMsgCompletion v-else-if="msg.type === 'completion'" :msg="msg" :show-actions="isActive(msg)" @approve="handleApprove" @reject="handleReject" />
                <ChatMsgQuestion v-else-if="msg.type === 'question'" :msg="msg" :show-actions="isActive(msg)" @answer="handleAnswerQuestion" />
                <ChatMsgStatus v-else-if="msg.type === 'status_change' || msg.type === 'approval'" :msg="msg" />
                <ChatMsgText v-else :msg="msg" />
              </template>
            </template>

            <div v-if="messages.length === 0 && !loading" class="empty-state">
              <p>暂无消息</p>
              <p class="empty-hint">点击下方"开始工作"按钮唤醒 Agent</p>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="quick-actions">
            <template v-if="activeSessionStatus === 'idle'">
              <button class="qa-btn qa-primary" @click="handleWake" :disabled="sending">
                {{ sending ? '启动中...' : '开始工作' }}
              </button>
            </template>
            <template v-else-if="activeSessionStatus === 'awaiting_review'">
              <button class="qa-btn qa-approve" @click="handleApprove(null)" :disabled="sending">批准</button>
              <button class="qa-btn qa-reject" @click="showRejectInput = true" :disabled="sending">拒绝</button>
            </template>
            <template v-else-if="activeSessionStatus === 'awaiting_plan'">
              <button class="qa-btn qa-approve" @click="handleApprovePlanQuick" :disabled="sending">批准计划</button>
              <button class="qa-btn qa-supplement" @click="showSupplementHint = !showSupplementHint">调整方向</button>
            </template>
            <template v-else-if="activeSessionStatus === 'awaiting_question'">
              <button class="qa-btn qa-primary" @click="focusInput" :disabled="sending">回复问题</button>
            </template>
            <template v-if="activeSessionStatus === 'developing'">
              <button class="qa-btn qa-supplement" @click="showSupplementHint = !showSupplementHint">补充说明</button>
            </template>
            <template v-if="activeSessionStatus !== 'idle' && activeSessionStatus !== 'archived'">
              <button class="qa-btn qa-stop" @click="handleStopSession" :disabled="sending">停止工作</button>
            </template>
            <template v-if="activeSessionStatus === 'archived'">
              <button class="qa-btn qa-primary" @click="handleWake" :disabled="sending">新建会话</button>
            </template>
          </div>

          <!-- Reject input -->
          <Transition name="slide-down">
            <div v-if="showRejectInput" class="reject-bar">
              <el-input v-model="rejectComment" placeholder="输入拒绝原因..." size="small" style="flex: 1" @keyup.enter="confirmReject" />
              <button class="qa-btn qa-reject" @click="confirmReject" :disabled="sending">确认拒绝</button>
              <button class="qa-btn" @click="showRejectInput = false; rejectComment = ''">取消</button>
            </div>
          </Transition>

          <!-- Input Area -->
          <div class="input-area">
            <textarea
              v-model="inputText"
              class="chat-input"
              placeholder="输入消息... (Ctrl+Enter 发送)"
              rows="2"
              @keydown.ctrl.enter="handleSend"
            />
            <button class="send-btn" @click="handleSend" :disabled="!inputText.trim() || sending">
              {{ sending ? '...' : '发送' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useAgentChat } from '@/composables/useAgentChat'
import type { ChatMessage } from '@/api/agent'
import ChatMsgText from './chat/ChatMsgText.vue'
import ChatMsgPlan from './chat/ChatMsgPlan.vue'
import ChatMsgProgress from './chat/ChatMsgProgress.vue'
import ChatMsgCompletion from './chat/ChatMsgCompletion.vue'
import ChatMsgQuestion from './chat/ChatMsgQuestion.vue'
import ChatMsgStatus from './chat/ChatMsgStatus.vue'

const {
  panelOpen, currentSession, sessions, messages, stats, sending, loading,
  hasMore, collapsed, currentTask, todoCount, inDev, inReview,
  activeSessionStatus, messagesByTask, hasOlderMessages,
  closePanel, loadContext, loadMore, executeAction, expandMessages,
} = useAgentChat()

const messagesRef = ref<HTMLElement | null>(null)
const inputText = ref('')
const showRejectInput = ref(false)
const rejectComment = ref('')
const showSupplementHint = ref(false)

function isActive(msg: ChatMessage) {
  if (!currentSession.value || currentSession.value.status !== 'active') return false
  // 最后一条 completion/question/plan 消息才显示操作按钮
  const lastActionable = [...messages.value].reverse().find(m =>
    m.type === 'completion' || m.type === 'question' || m.type === 'plan'
  )
  return lastActionable?.id === msg.id
}

async function handleWake() {
  await executeAction('wake', { message: '开始工作' })
  scrollToBottom()
}

async function handleStopSession() {
  await executeAction('stop_session')
}

async function handleSend() {
  if (!inputText.value.trim() || sending.value) return
  const text = inputText.value.trim()
  inputText.value = ''
  await executeAction('send_message', { message: text })
  scrollToBottom()
}

async function handleApprovePlan(msg: ChatMessage) {
  await executeAction('approve', { taskId: msg.taskId })
  scrollToBottom()
}

async function handleApprovePlanQuick() {
  const lastPlan = [...messages.value].reverse().find(m => m.type === 'plan')
  if (lastPlan) {
    await executeAction('approve', { taskId: lastPlan.taskId })
    scrollToBottom()
  }
}

async function handleRedirect(msg: ChatMessage) {
  inputText.value = `@${msg.taskId.substring(0, 8)} `
  showSupplementHint.value = true
}

async function handleAbortPlan(msg: ChatMessage) {
  await executeAction('reject', { taskId: msg.taskId, payload: { comment: '人类拒绝了此计划' } })
  scrollToBottom()
}

async function handleApprove(msg: ChatMessage | null) {
  const taskId = msg?.taskId || currentTask.value?.id
  if (!taskId) return
  await executeAction('approve', { taskId })
  scrollToBottom()
}

async function handleReject(msg: ChatMessage | null) {
  showRejectInput.value = true
}

async function confirmReject() {
  const lastCompletion = [...messages.value].reverse().find(m => m.type === 'completion')
  const taskId = lastCompletion?.taskId || currentTask.value?.id
  if (!taskId) return
  await executeAction('reject', { taskId, payload: { comment: rejectComment.value || '不符合要求' } })
  showRejectInput.value = false
  rejectComment.value = ''
  scrollToBottom()
}

async function handleAnswerQuestion(msg: ChatMessage, _answer: string) {
  inputText.value = ''
  await executeAction('answer_question', { taskId: msg.taskId, message: inputText.value || '确认' })
  scrollToBottom()
}

function onScroll() {
  if (!messagesRef.value) return
  if (messagesRef.value.scrollTop < 50 && hasMore.value) {
    loadMore()
  }
}

function focusInput() {
  const el = document.querySelector('.chat-input') as HTMLTextAreaElement | null
  el?.focus()
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

watch(panelOpen, (open) => {
  if (open) scrollToBottom()
})
</script>

<style lang="scss" scoped>
.chat-panel-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: flex-end;
}

.chat-panel {
  width: 420px;
  height: 100%;
  background: var(--cyber-bg, #0A101F);
  border-left: 1px solid var(--cyber-glass-border);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.3);
}

// Header
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--cyber-glass-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--cyber-text-primary);
}

.session-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  &.active { background: rgba(0, 229, 255, 0.1); color: var(--cyber-cyan); }
  &.archived { background: rgba(255, 255, 255, 0.05); color: var(--cyber-text-muted); }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--cyber-glass-border);
  background: transparent;
  color: var(--cyber-text-muted);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  &:hover { background: rgba(255, 255, 255, 0.05); color: var(--cyber-text-primary); }
}

// Session option
.session-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.session-opt-title {
  font-size: 13px;
}

.session-opt-badge {
  font-size: 10px;
  &.active { color: var(--cyber-cyan); }
}

// Stats Bar
.stats-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--cyber-glass-border);
  font-size: 12px;
  color: var(--cyber-text-secondary);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 3px;
}

.stat-num {
  font-weight: 600;
  color: var(--cyber-text-primary);
  &.active { color: var(--cyber-cyan); }
}

.stat-current {
  margin-left: auto;
  font-size: 11px;
  color: var(--cyber-text-muted);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// Messages Area
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 2px; }
}

.load-more {
  text-align: center;
  padding: 8px;
}

.load-more-btn {
  font-size: 11px;
  color: var(--cyber-cyan);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 4px;
  &:hover { background: rgba(0, 229, 255, 0.08); }
  &:disabled { opacity: 0.5; cursor: default; }
}

.collapsed-bar {
  text-align: center;
  font-size: 11px;
  color: var(--cyber-text-muted);
  padding: 8px 12px;
  cursor: pointer;
  &:hover { color: var(--cyber-cyan); }
}

.task-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 4px;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: var(--cyber-glass-border);
}

.divider-text {
  font-size: 10px;
  color: var(--cyber-text-muted);
  font-family: Consolas, monospace;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--cyber-text-muted);
  font-size: 13px;
  gap: 8px;
}

.empty-hint {
  font-size: 11px;
  opacity: 0.6;
}

// Quick Actions
.quick-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-top: 1px solid var(--cyber-glass-border);
  flex-wrap: wrap;
}

.qa-btn {
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--cyber-glass-border);
  background: transparent;
  color: var(--cyber-text-secondary);
  transition: all 0.2s;
  &:hover { background: rgba(255, 255, 255, 0.05); }
  &:disabled { opacity: 0.4; cursor: default; }
}

.qa-primary {
  background: rgba(0, 229, 255, 0.08);
  border-color: rgba(0, 229, 255, 0.3);
  color: var(--cyber-cyan);
  &:hover { background: rgba(0, 229, 255, 0.15); }
}

.qa-approve {
  background: rgba(0, 229, 255, 0.08);
  border-color: rgba(0, 229, 255, 0.3);
  color: var(--cyber-cyan);
  &:hover { background: rgba(0, 229, 255, 0.15); }
}

.qa-reject {
  background: rgba(245, 108, 108, 0.08);
  border-color: rgba(245, 108, 108, 0.3);
  color: #f56c6c;
  &:hover { background: rgba(245, 108, 108, 0.15); }
}

.qa-supplement {
  background: rgba(157, 92, 255, 0.08);
  border-color: rgba(157, 92, 255, 0.3);
  color: var(--cyber-purple);
  &:hover { background: rgba(157, 92, 255, 0.15); }
}

.qa-stop {
  margin-left: auto;
  background: rgba(255, 125, 0, 0.08);
  border-color: rgba(255, 125, 0, 0.3);
  color: var(--cyber-orange);
  &:hover { background: rgba(255, 125, 0, 0.15); }
}

// Reject bar
.reject-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid rgba(245, 108, 108, 0.15);
  background: rgba(245, 108, 108, 0.03);
}

// Input Area
.input-area {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--cyber-glass-border);
}

.chat-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--cyber-glass-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--cyber-text-primary);
  resize: none;
  font-family: inherit;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.2s;
  &:focus { border-color: rgba(0, 229, 255, 0.4); }
  &::placeholder { color: var(--cyber-text-muted); }
}

.send-btn {
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(0, 229, 255, 0.1);
  border: 1px solid rgba(0, 229, 255, 0.3);
  color: var(--cyber-cyan);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  &:hover:not(:disabled) { background: rgba(0, 229, 255, 0.2); }
  &:disabled { opacity: 0.4; cursor: default; }
}

// Transitions
.slide-panel-enter-active, .slide-panel-leave-active {
  transition: opacity 0.25s ease;
  .chat-panel { transition: transform 0.3s ease; }
}
.slide-panel-enter-from, .slide-panel-leave-to {
  opacity: 0;
  .chat-panel { transform: translateX(100%); }
}

.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.2s ease;
}
.slide-down-enter-from, .slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  padding: 0 16px;
}
</style>
