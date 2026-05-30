<template>
  <div class="ai-todo-page">
    <div class="content-layer">
      <!-- 顶部统计条 -->
      <div class="stats-bar">
        <div class="stat-item todo-stat">
          <div class="stat-pulse"></div>
          <span class="stat-num">{{ todoQueueTasks.length }}</span>
          <span class="stat-label">待开发</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item dev-stat">
          <div class="stat-pulse dev-pulse"></div>
          <span class="stat-num">{{ devQueueTasks.length }}</span>
          <span class="stat-label">开发中</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num">{{ taskStore.groups.length }}</span>
          <span class="stat-label">分组</span>
        </div>
      </div>

      <div class="page-header">
        <h2 class="page-title">
          <span class="glow-text">AI 任务调度中心</span>
        </h2>
        <div class="page-header-bar">
          <p class="page-desc">QClaw 自动执行引擎 · 双队列调度</p>
          <div class="header-actions">
            <el-button type="success" size="small" @click="openPublishDialog">发布任务</el-button>
            <el-button v-if="ungroupedTodoTasks.length >= 2" type="primary" size="small" @click="showGroupDialog = true">+ 新建分组</el-button>
          </div>
        </div>
        <!-- 唤醒 Agent -->
        <div class="wake-bar">
          <span class="wake-hint">队列中有 {{ todoQueueTasks.length }} 个待办任务</span>
          <el-button type="primary" @click="handleWakeAgent" :loading="waking" class="wake-btn-sm">
            唤醒 Agent 开始任务
          </el-button>
        </div>
      </div>

      <!-- 双栏布局：待办队列 + 开发引擎 -->
      <div class="dual-panel">
        <!-- 左面板：待办队列 -->
        <div class="panel todo-panel">
          <div class="panel-header">
            <div class="panel-icon todo-icon"><div class="icon-ring"></div><span class="icon-dot"></span></div>
            <h3 class="panel-title">待办队列</h3>
            <el-tag size="small" effect="dark" type="info" round>{{ todoQueueTasks.length }}</el-tag>
            <el-button v-if="todoQueueTasks.length > 0" type="danger" size="small" plain @click="handleClearQueue" class="panel-action-btn">清空队列</el-button>
          </div>
          <div class="panel-scroll">
            <div v-if="todoQueueTasks.length === 0" class="panel-empty">
              <div class="empty-pulse"></div>
              <p>队列为空</p>
            </div>

            <!-- 分组卡片 -->
            <div v-for="group in taskStore.groups" :key="group.id" class="group-card">
              <div class="group-header" @click="toggleGroup(group.id)">
                <div class="group-left">
                  <span class="group-arrow" :class="{ expanded: expandedGroups.has(group.id) }">▸</span>
                  <span class="group-name">{{ group.name }}</span>
                  <el-tag size="small" type="info">{{ getGroupTasks(group.id).length }}个任务</el-tag>
                </div>
                <div class="group-right" @click.stop>
                  <el-button link type="primary" size="small" @click="editGroupSettings(group)">编辑</el-button>
                  <el-button link type="danger" size="small" @click="handleDeleteGroup(group)">解散</el-button>
                </div>
              </div>
              <div v-if="group.description" class="group-desc" @click.stop>
                <span class="group-desc-text">{{ group.description }}</span>
              </div>
              <Transition name="collapse">
                <div v-if="expandedGroups.has(group.id)" class="group-tasks">
                  <div v-for="(task, idx) in getGroupTasks(group.id)" :key="task.id" class="sub-task"
                    :draggable="editingDescId !== task.id"
                    @dragstart="onSubDragStart(group.id, idx, $event)" @dragover.prevent @drop="onSubDrop(group.id, idx)" @dragend="onDragEnd">
                    <span class="sub-rank">{{ idx + 1 }}</span>
                    <div class="sub-body">
                      <div class="sub-top">
                        <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
                        <span class="sub-title">{{ task.title }}</span>
                      </div>
                      <div v-if="task.customDescription && editingDescId !== task.id" class="sub-desc" @click.stop="openDescEditor(task)">
                        <span>{{ task.customDescription }}</span>
                        <span class="sub-desc-edit">✎</span>
                      </div>
                      <span v-if="!task.customDescription && editingDescId !== task.id" class="sub-desc-add" @click.stop="openDescEditor(task)">+ 补充</span>
                      <div v-if="editingDescId === task.id" class="sub-desc-editor" @click.stop @mousedown.stop>
                        <el-input v-model="editingDescText" type="textarea" :rows="2" placeholder="补充需求说明..." resize="none" @keydown.escape="cancelDescEdit" />
                        <div class="sub-desc-actions">
                          <el-button size="small" @click="cancelDescEdit">取消</el-button>
                          <el-button type="primary" size="small" @click="saveDescEdit(task)" :loading="savingDesc">保存</el-button>
                        </div>
                      </div>
                    </div>
                    <div class="sub-actions" @click.stop>
                      <el-button type="primary" link size="small" @click="$router.push(`/tasks/${task.id}`)">详情</el-button>
                      <el-button type="success" link size="small" @click="handleComplete(task)">完成</el-button>
                    </div>
                  </div>
                  <div v-if="getGroupTasks(group.id).length === 0" class="group-empty">分组内暂无任务</div>
                </div>
              </Transition>
            </div>

            <!-- 未分组待办任务列表 -->
            <div v-if="ungroupedTodoTasks.length > 0" class="card-list">
              <div v-for="(task, index) in ungroupedTodoTasks" :key="task.id"
                class="todo-card"
                :class="{ 'drag-over': dragOverIndex === index, 'drag-source': dragFromIndex === index }"
                @mousedown.prevent="onCardMouseDown($event, index)"
                @click="handleCardClick(task)">
                <div class="card-glow"></div>
                <div class="card-rank">{{ index + 1 }}</div>
                <div class="card-body">
                  <div class="card-head">
                    <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
                    <el-tag v-if="task.reworkCount > 0" type="danger" size="small" effect="dark">返工{{ task.reworkCount }}次</el-tag>
                    <span class="card-id">#{{ task.sourceId }}</span>
                  </div>
                  <h3 class="card-title">{{ task.title }}</h3>
                  <div class="card-meta">
                    <span v-if="task.project || task.customer">{{ task.project || task.customer }}</span>
                    <span v-if="task.module">{{ task.module }}</span>
                    <span :class="{ overdue: isOverdue(task) }">截止 {{ formatDate(task.deadline) }}</span>
                  </div>
                  <div v-if="task.customDescription" class="card-desc-preview">
                    <span class="desc-label">说明</span>
                    <span class="desc-text">{{ task.customDescription }}</span>
                  </div>
                </div>
                <div class="card-actions" @mousedown.stop @click.stop>
                  <el-button type="primary" link size="small" @click="openDrawer(task)">编辑</el-button>
                  <el-button type="success" link size="small" @click="handleComplete(task)">完成</el-button>
                  <el-button type="danger" link size="small" @click="handleRemove(task)">移出</el-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右面板：开发引擎 -->
        <div class="panel dev-panel">
          <div class="panel-header">
            <div class="panel-icon dev-icon"><div class="icon-ring dev-ring"></div><span class="icon-dot dev-dot"></span></div>
            <h3 class="panel-title dev-title">开发引擎</h3>
            <el-tag size="small" effect="dark" type="warning" round>{{ devQueueTasks.length }}</el-tag>
            <div v-if="devQueueTasks.length > 0" class="engine-indicator">
              <span class="engine-pulse"></span>
              <span class="engine-text">RUNNING</span>
            </div>
            <el-button v-if="devQueueTasks.length > 0" type="danger" size="small" plain @click="handleTerminateDevTask" class="panel-action-btn">终止任务</el-button>
          </div>
          <div class="panel-scroll">
            <div v-if="devQueueTasks.length === 0" class="panel-empty dev-empty">
              <div class="empty-engine"></div>
              <p>引擎待命</p>
            </div>
            <div v-else class="card-list">
              <div v-for="task in devQueueTasks" :key="task.id" class="dev-card">
                <div class="dev-card-glow"></div>
                <div class="dev-status-bar"><div class="dev-progress"></div></div>
                <div class="dev-card-inner">
                  <div class="card-body">
                    <div class="card-head">
                      <el-tag type="warning" size="small" effect="dark">开发中</el-tag>
                      <el-tag :type="getPriorityType(task.priority)" size="small">{{ getPriorityLabel(task.priority) }}</el-tag>
                      <span class="card-id">#{{ task.sourceId }}</span>
                    </div>
                    <h3 class="card-title">{{ task.title }}</h3>
                    <div class="card-meta">
                      <span v-if="task.project || task.customer">{{ task.project || task.customer }}</span>
                      <span v-if="task.module">{{ task.module }}</span>
                    </div>
                    <div v-if="task.projectPath || task.gitBranch" class="card-config">
                      <span v-if="task.projectPath" class="config-item">📁 {{ task.projectPath }}</span>
                      <span v-if="task.gitBranch" class="config-item">🌿 {{ task.gitBranch }}</span>
                    </div>
                  </div>
                  <div class="card-actions">
                    <a v-if="task.projectPath" class="fc-vscode-btn" :href="'vscode://file/' + encodeURIComponent(task.projectPath)" target="_blank" @click.stop title="在 VSCode 中打开项目">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17.583 2.322l-5.106 4.79L7.4 2.98 2.5 6.407v11.186l4.9 3.427 5.077-4.132 5.106 4.79L21.5 18.17V5.828l-3.917-3.506zm-.353 13.945l-3.763-3.318 3.763-3.555v6.873zM7.09 15.998V8.002l3.26 3.897-3.26 4.099zM7.7 17.15l4.247-5.336L7.7 5.874V17.15z" fill="currentColor"/></svg>
                    </a>
                    <el-button type="primary" link size="small" @click="openFullscreenChat(task)">对话</el-button>
                    <el-button type="primary" link size="small" @click="$router.push(`/tasks/${task.id}`)">详情</el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 全屏会话面板 -->
      <Teleport to="body">
        <Transition name="fullscreen-chat">
          <div v-if="chatOpen" class="fullscreen-chat-mask" @click.self="closeChat">
            <div class="fullscreen-chat">
              <!-- 左侧：会话任务列表 -->
              <div class="fc-sidebar" :style="{ width: sidebarWidth + 'px' }">
                <div class="fc-sidebar-header">
                  <h3>会话列表</h3>
                  <span class="fc-sidebar-count">{{ chatTaskList.length }}</span>
                </div>
                <div class="fc-sidebar-list">
                  <div v-if="devChatTasks.length > 0" class="fc-sidebar-group">
                    <div class="fc-group-label">开发中</div>
                    <div v-for="task in devChatTasks" :key="task.id"
                      class="fc-contact" :class="{ active: chatTaskId === task.id }"
                      @click="switchChatTask(task)">
                      <div class="fc-contact-dot dot-ai_dev"></div>
                      <div class="fc-contact-info">
                        <div class="fc-contact-name">{{ task.title }}</div>
                        <div class="fc-contact-meta">
                          <el-tag type="warning" size="small" effect="dark" class="fc-mini-tag">开发中</el-tag>
                          <span>{{ getPriorityLabel(task.priority) }}</span>
                        </div>
                      </div>
                      <a v-if="task.projectPath" class="fc-vscode-btn" :href="'vscode://file/' + encodeURIComponent(task.projectPath)" target="_blank" @click.stop title="在 VSCode 中打开项目">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17.583 2.322l-5.106 4.79L7.4 2.98 2.5 6.407v11.186l4.9 3.427 5.077-4.132 5.106 4.79L21.5 18.17V5.828l-3.917-3.506zm-.353 13.945l-3.763-3.318 3.763-3.555v6.873zM7.09 15.998V8.002l3.26 3.897-3.26 4.099zM7.7 17.15l4.247-5.336L7.7 5.874V17.15z" fill="currentColor"/></svg>
                      </a>
                    </div>
                  </div>
                  <div v-if="doneChatTasks.length > 0" class="fc-sidebar-group">
                    <div class="fc-group-label">已完成 / 审核中</div>
                    <div v-for="task in doneChatTasks" :key="task.id"
                      class="fc-contact" :class="{ active: chatTaskId === task.id }"
                      @click="switchChatTask(task)">
                      <div class="fc-contact-dot" :class="'dot-' + task.aiStatus"></div>
                      <div class="fc-contact-info">
                        <div class="fc-contact-name">{{ task.title }}</div>
                        <div class="fc-contact-meta">
                          <el-tag v-if="task.aiStatus === 'ai_review'" type="success" size="small" effect="dark" class="fc-mini-tag">审核中</el-tag>
                          <el-tag v-else-if="task.aiStatus === 'ai_done'" type="info" size="small" effect="dark" class="fc-mini-tag">已完成</el-tag>
                          <el-tag v-else-if="task.aiStatus === 'ai_cancelled'" type="danger" size="small" effect="dark" class="fc-mini-tag">已终止</el-tag>
                          <el-tag v-else-if="task.aiStatus === 'ai_question'" type="danger" size="small" effect="dark" class="fc-mini-tag">疑问</el-tag>
                          <span>{{ getPriorityLabel(task.priority) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-if="chatTaskList.length === 0" class="fc-sidebar-empty">暂无会话记录</div>
                </div>
              </div>

              <!-- 拖拽分隔条 -->
              <div class="fc-resizer" @mousedown="onSidebarResizeStart"></div>

              <!-- 右侧：聊天窗口 -->
              <div class="fc-main">
                <!-- 头部 -->
                <div class="fc-header" v-if="chatTask">
                  <div class="fc-header-left">
                    <div class="fc-header-dot" :class="'priority-' + chatTask.priority"></div>
                    <div class="fc-header-info">
                      <h3>{{ chatTask.title }}</h3>
                      <div class="fc-header-meta">
                        <el-tag :type="getPriorityType(chatTask.priority)" size="small" effect="dark">{{ getPriorityLabel(chatTask.priority) }}</el-tag>
                        <el-tag v-if="chatTask.aiStatus === 'ai_dev'" type="warning" size="small">开发中</el-tag>
                        <el-tag v-else-if="chatTask.aiStatus === 'ai_review'" type="success" size="small">审核中</el-tag>
                        <el-tag v-else-if="chatTask.aiStatus === 'ai_cancelled'" type="danger" size="small">已终止</el-tag>
                        <span class="fc-task-id">#{{ chatTask.sourceId }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="fc-header-right">
                    <el-select
                      v-if="agentChat.sessions.value.length > 1"
                      :model-value="agentChat.currentSession.value?.id"
                      @change="(id) => agentChat.loadContext(id)"
                      size="small" style="width:120px"
                    >
                      <el-option v-for="s in agentChat.sessions.value" :key="s.id" :label="s.title" :value="s.id" />
                    </el-select>
                    <button class="fc-close-btn" @click="closeChat">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    </button>
                  </div>
                </div>

                <!-- 消息流 -->
                <div class="fc-messages" ref="chatMessagesRef">
                  <div v-if="agentChat.loading.value" class="fc-loading">
                    <div class="fc-loading-spinner"></div>
                    <span>加载中...</span>
                  </div>
                  <div v-else-if="currentTaskMessages.length === 0" class="fc-empty">
                    <div class="fc-empty-icon">
                      <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="6" y="10" width="36" height="28" rx="4" stroke="var(--cyber-glass-border)" stroke-width="1.5"/><path d="M6 16h36" stroke="var(--cyber-glass-border)" stroke-width="1.5"/><circle cx="12" cy="13" r="1.5" fill="var(--cyber-glass-border)"/><circle cx="17" cy="13" r="1.5" fill="var(--cyber-glass-border)"/><circle cx="22" cy="13" r="1.5" fill="var(--cyber-glass-border)"/><path d="M16 26l4 4 8-8" stroke="var(--cyber-cyan)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/></svg>
                    </div>
                    <p>暂无对话记录</p>
                    <span>Agent 开始开发后将在此显示实时通讯</span>
                  </div>
                  <template v-else>
                    <div v-for="msg in currentTaskMessages" :key="msg.id" class="fc-msg" :class="msg.role">
                      <div class="fc-msg-avatar" :class="msg.role">
                        <span v-if="msg.role === 'user'">我</span>
                        <span v-else-if="msg.role === 'agent'">AI</span>
                        <span v-else>SYS</span>
                      </div>
                      <div class="fc-msg-body">
                        <div class="fc-msg-meta">
                          <span class="fc-msg-role">{{ msg.role === 'user' ? '我' : msg.role === 'agent' ? 'Agent' : '系统' }}</span>
                          <span v-if="msg.type === 'plan'" class="fc-badge plan">计划</span>
                          <span v-else-if="msg.type === 'completion'" class="fc-badge done">完成</span>
                          <span v-else-if="msg.type === 'question'" class="fc-badge question">疑问</span>
                          <span v-else-if="msg.type === 'progress'" class="fc-badge progress">进度</span>
                          <span class="fc-msg-time">{{ formatMsgTime(msg.time) }}</span>
                          <button v-if="msg.role !== 'user'" class="fc-reply-btn" @click="setReplyTo(msg)" title="引用回复">↩</button>
                        </div>
                        <div class="fc-msg-bubble" :class="[msg.role, msg.type]">
                          <div v-if="msg.metadata?.replyTo" class="fc-quote-preview">
                            <span class="fc-quote-label">引用 Agent 消息：</span>
                            <span class="fc-quote-text">{{ msg.metadata.replyTo }}</span>
                          </div>
                          <p>{{ msg.content }}</p>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- 快捷操作 -->
                <div class="fc-actions" v-if="chatTask">
                  <template v-if="activeSessionStatus === 'awaiting_plan'">
                    <el-button type="success" size="small" @click="agentChat.executeAction('approve', { taskId: chatTask.id })">批准计划</el-button>
                    <el-button type="warning" size="small" @click="agentChat.executeAction('redirect', { taskId: chatTask.id, message: '请调整方案' })">调整方向</el-button>
                    <el-button type="danger" size="small" plain @click="handleCancelTask">终止任务</el-button>
                  </template>
                  <template v-else-if="activeSessionStatus === 'awaiting_review'">
                    <el-button type="success" size="small" @click="agentChat.executeAction('approve', { taskId: chatTask.id })">审核通过</el-button>
                    <el-button type="danger" size="small" @click="agentChat.executeAction('reject', { taskId: chatTask.id, message: '需要修改' })">打回修改</el-button>
                  </template>
                  <template v-else-if="activeSessionStatus === 'awaiting_question'">
                    <span class="fc-actions-hint">Agent 有疑问，请在下方回复</span>
                  </template>
                  <template v-else-if="activeSessionStatus === 'developing'">
                    <el-button size="small" @click="agentChat.executeAction('stop_session')">停止工作</el-button>
                    <el-button type="danger" size="small" plain @click="handleCancelTask">终止任务</el-button>
                  </template>
                </div>

                <!-- 输入区域（仅开发中/疑问状态可输入） -->
                <div v-if="chatTask && (chatTask.aiStatus === 'ai_dev' || chatTask.aiStatus === 'ai_question')" class="fc-input-area" :style="{ height: inputAreaHeight + 'px' }">
                  <div class="fc-input-resizer" @mousedown="onInputResizeStart"></div>
                  <div class="fc-input-inner">
                    <!-- 引用回复预览 -->
                    <div v-if="replyToMsg" class="fc-reply-bar">
                      <div class="fc-reply-bar-inner">
                        <span class="fc-reply-bar-label">↩ 引用：</span>
                        <span class="fc-reply-bar-text">{{ replyToMsg.content.substring(0, 60) }}{{ replyToMsg.content.length > 60 ? '...' : '' }}</span>
                      </div>
                      <button class="fc-reply-bar-close" @click="replyToMsg = null">✕</button>
                    </div>
                    <textarea
                      v-model="chatInput"
                      class="fc-textarea"
                      :placeholder="replyToMsg ? '回复引用的消息，Ctrl+Enter 发送...' : chatTask.aiStatus === 'ai_question' ? '回复 Agent 疑问，Ctrl+Enter 发送...' : '输入消息，Ctrl+Enter 发送...'"
                      @keydown.ctrl.enter="handleChatSend"
                      @input="onChatInput"
                    ></textarea>
                    <div class="fc-input-toolbar">
                      <span class="fc-input-hint">Ctrl+Enter 发送</span>
                      <button class="fc-send-btn" @click="handleChatSend" :disabled="!chatInput.trim() || agentChat.sending.value">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-5-5 12-2-5-5-2z" fill="currentColor"/></svg>
                        <span>发送</span>
                      </button>
                    </div>
                  </div>
                </div>
                <!-- 已完成/审核中任务：只读提示 -->
                <div v-else-if="chatTask" class="fc-input-readonly">
                  <span>此任务已{{ chatTask.aiStatus === 'ai_review' ? '提交审核' : chatTask.aiStatus === 'ai_done' ? '完成' : chatTask.aiStatus === 'ai_cancelled' ? '终止' : '归档' }}，会话记录只读</span>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- 配置弹窗 -->
      <Teleport to="body">
        <Transition name="fade-mask">
          <div v-if="drawerTask" class="config-modal-mask" @click.self="drawerTask = null">
            <div class="config-modal">
              <div class="config-modal-header">
                <div class="config-modal-title">
                  <el-tag :type="getPriorityType(drawerTask.priority)" size="small">{{ getPriorityLabel(drawerTask.priority) }}</el-tag>
                  <span class="config-modal-id">#{{ drawerTask.sourceId }}</span>
                  <span class="config-modal-name">{{ drawerTask.title }}</span>
                </div>
                <el-button link size="small" @click="drawerTask = null" class="config-modal-close">✕</el-button>
              </div>
              <div class="config-modal-body">
                <el-form label-width="80px" label-position="top" class="config-form">
                  <el-form-item label="项目名称">
                    <div class="config-field">{{ drawerTask.project || drawerTask.customer || '-' }}</div>
                  </el-form-item>
                  <el-row :gutter="16">
                    <el-col :span="12">
                      <el-form-item label="本地路径">
                        <el-input v-model="drawerForm.projectPath" placeholder="如 F:\your-project" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="Git 分支">
                        <el-input v-model="drawerForm.gitBranch" placeholder="如 feature/xxx" />
                      </el-form-item>
                    </el-col>
                  </el-row>
                  <el-form-item label="补充说明">
                    <el-input v-model="drawerForm.customDescription" type="textarea" :rows="4" placeholder="输入补充需求说明，给 Agent 参考..." resize="none" />
                  </el-form-item>
                  <el-form-item label="需求文档" v-if="drawerTask.reqDocName">
                    <div class="config-field doc-link">
                      <span>{{ drawerTask.reqDocName }}</span>
                      <el-button v-if="drawerTask.reqDocUrl" type="primary" link size="small" @click="openUrl(drawerTask.reqDocUrl)">查看</el-button>
                    </div>
                  </el-form-item>
                </el-form>
              </div>
              <div class="config-modal-footer">
                <el-button @click="drawerTask = null">取消</el-button>
                <el-button type="primary" @click="saveDrawer" :loading="drawerSaving">保存</el-button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- 新建分组弹窗 -->
      <el-dialog v-model="showGroupDialog" title="新建分组" width="var(--dialog-sm)" :close-on-click-modal="false">
        <el-form label-width="90px">
          <el-form-item label="分组名称">
            <el-input v-model="newGroupName" placeholder="如：宁对接前端需求" />
          </el-form-item>
          <el-form-item label="补充说明">
            <el-input v-model="newGroupDesc" type="textarea" :rows="3" placeholder="告诉 Agent 分组任务的关联关系、执行顺序、注意事项...&#10;如：一个是管理端，一个是企业端，企业端填报管理端回显" />
          </el-form-item>
          <el-form-item label="选择任务">
            <el-checkbox-group v-model="newGroupTaskIds">
              <el-checkbox v-for="t in ungroupedTodoTasks" :key="t.id" :value="t.id" :label="t.id" border size="small" style="margin:4px;">
                {{ t.title.substring(0, 20) }}{{ t.title.length > 20 ? '...' : '' }}
              </el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showGroupDialog = false">取消</el-button>
          <el-button type="primary" @click="handleCreateGroup" :disabled="!newGroupName.trim()">创建</el-button>
        </template>
      </el-dialog>

      <!-- 编辑分组弹窗 -->
      <el-dialog v-model="showGroupEdit" :title="`编辑分组 - ${editingGroup?.name || ''}`" width="var(--dialog-sm)" :close-on-click-modal="false">
        <el-form label-width="90px">
          <el-form-item label="分组名称"><el-input v-model="groupEditForm.name" /></el-form-item>
          <el-form-item label="补充说明">
            <el-input v-model="groupEditForm.description" type="textarea" :rows="4" placeholder="告诉 Agent 分组任务的关联关系、执行顺序、注意事项..." />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showGroupEdit = false">取消</el-button>
          <el-button type="primary" @click="handleSaveGroupEdit">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="showPublishDialog" title="发布任务到 AI 待办" width="var(--dialog-md)" :close-on-click-modal="false" destroy-on-close>
        <el-radio-group v-model="publishMode" style="margin-bottom:16px">
          <el-radio-button value="new">新建任务</el-radio-button>
          <el-radio-button value="existing">关联已有任务</el-radio-button>
        </el-radio-group>
        <el-form v-if="publishMode === 'new'" label-width="100px" label-position="right">
          <el-form-item label="任务标题" required><el-input v-model="publishForm.title" placeholder="描述要完成的工作" /></el-form-item>
          <el-form-item label="项目配置">
            <el-select v-model="publishForm.projectName" placeholder="选择项目" clearable filterable style="width:100%" @change="handlePublishProjectSelect">
              <el-option v-for="p in projectConfigs" :key="p.id" :label="p.name" :value="p.name">
                <span>{{ p.name }}</span>
                <span style="float:right;color:#909399;font-size:12px">{{ p.localPath || '未配置路径' }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="本地路径"><el-input v-model="publishForm.projectPath" placeholder="F:\your-project" /></el-form-item>
          <el-form-item label="Git 分支">
            <el-select v-model="publishForm.gitBranch" placeholder="选择或输入分支" clearable filterable allow-create style="width:100%">
              <el-option v-for="b in publishBranches" :key="b" :label="b" :value="b" />
            </el-select>
          </el-form-item>
          <el-form-item label="自定义描述"><el-input v-model="publishForm.customDescription" type="textarea" :rows="3" placeholder="详细说明要做什么" /></el-form-item>
          <el-form-item label="验收标准"><el-input v-model="publishForm.acceptanceCriteria" type="textarea" :rows="2" placeholder="可选" /></el-form-item>
          <el-row :gutter="16">
            <el-col :span="12"><el-form-item label="优先级">
              <el-select v-model="publishForm.priority" style="width:100%">
                <el-option label="紧急" value="urgent" /><el-option label="高" value="high" /><el-option label="中" value="medium" /><el-option label="低" value="low" />
              </el-select>
            </el-form-item></el-col>
            <el-col :span="12"><el-form-item label="所属项目"><el-input v-model="publishForm.project" placeholder="可选" /></el-form-item></el-col>
          </el-row>
        </el-form>
        <el-form v-else label-width="100px" label-position="right">
          <el-form-item label="选择任务" required>
            <el-select v-model="publishForm.existingTaskId" placeholder="搜索任务标题或单号" filterable remote :remote-method="searchExistingTasks" :loading="searchingTasks" style="width:100%" value-key="id">
              <el-option v-for="t in searchedTasks" :key="t.id" :label="`${t.sourceId} - ${t.title}`" :value="t.id" />
            </el-select>
          </el-form-item>
          <div v-if="selectedExistingTask" class="existing-task-info">
            <el-descriptions :column="2" size="small" border>
              <el-descriptions-item label="标题">{{ selectedExistingTask.title }}</el-descriptions-item>
              <el-descriptions-item label="项目">{{ selectedExistingTask.project || '-' }}</el-descriptions-item>
            </el-descriptions>
          </div>
          <el-form-item label="补充描述"><el-input v-model="publishForm.customDescription" type="textarea" :rows="3" placeholder="补充说明这次要做什么" /></el-form-item>
          <el-form-item label="项目配置">
            <el-select v-model="publishForm.projectName" placeholder="选择项目" clearable filterable style="width:100%" @change="handlePublishProjectSelect">
              <el-option v-for="p in projectConfigs" :key="p.id" :label="p.name" :value="p.name" />
            </el-select>
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="12"><el-form-item label="本地路径"><el-input v-model="publishForm.projectPath" placeholder="F:\your-project" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="Git 分支"><el-input v-model="publishForm.gitBranch" placeholder="feature/xxx" /></el-form-item></el-col>
          </el-row>
        </el-form>
        <template #footer>
          <el-button @click="showPublishDialog = false">取消</el-button>
          <el-button type="primary" @click="handlePublish" :loading="publishing" :disabled="!canPublish">发布到 AI 待办</el-button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useTaskStore } from '@/stores/task'
import { agentApi, type ChatMessage } from '@/api/agent'
import { projectApi, type ProjectConfig } from '@/api/project'
import { taskApi } from '@/api/task'
import type { Task, TaskGroup } from '@/types'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatWs } from '@/composables/useChatWs'
import { useAgentChat } from '@/composables/useAgentChat'
import { useChatPanel } from '@/composables/useChatPanel'

const taskStore = useTaskStore()

// Drag state
let isDragging = false
const dragFromIndex = ref(-1)
const dragOverIndex = ref(-1)
let dragStartY = 0
let dragMoved = false
const dragFrom = ref<{ type: 'ungrouped' | 'group'; index: number; groupId?: string } | null>(null)

// Group UI
const expandedGroups = reactive(new Set<string>())
const showGroupDialog = ref(false)
const newGroupName = ref('')
const newGroupTaskIds = ref<string[]>([])
const newGroupDesc = ref('')
const showGroupEdit = ref(false)
const editingGroup = ref<TaskGroup | null>(null)
const groupEditForm = reactive({ name: '', description: '' })

// Publish dialog
const showPublishDialog = ref(false)
const publishing = ref(false)
const publishMode = ref<'new' | 'existing'>('new')
const projectConfigs = ref<ProjectConfig[]>([])
const publishBranches = ref<string[]>([])
const searchingTasks = ref(false)
const searchedTasks = ref<Task[]>([])
const publishForm = reactive({
  title: '', projectName: '', projectPath: '', gitBranch: '',
  customDescription: '', acceptanceCriteria: '', priority: 'medium' as string,
  project: '', existingTaskId: '',
})

const selectedExistingTask = computed(() => {
  if (!publishForm.existingTaskId) return null
  return taskStore.tasks.find(t => t.id === publishForm.existingTaskId) || null
})

const canPublish = computed(() => {
  if (publishMode.value === 'new') return !!publishForm.title.trim()
  return !!publishForm.existingTaskId
})

function openPublishDialog() {
  publishMode.value = 'new'
  Object.assign(publishForm, { title: '', projectName: '', projectPath: '', gitBranch: '', customDescription: '', acceptanceCriteria: '', priority: 'medium', project: '', existingTaskId: '' })
  searchedTasks.value = []
  publishBranches.value = []
  projectApi.list().then(res => { projectConfigs.value = res.data }).catch(() => {})
  showPublishDialog.value = true
}

function handlePublishProjectSelect(name: string) {
  const config = projectConfigs.value.find(p => p.name === name)
  if (config) {
    if (config.localPath) publishForm.projectPath = config.localPath
    if (config.defaultBranch) publishForm.gitBranch = config.defaultBranch
    publishBranches.value = [...config.branches]
  } else { publishBranches.value = [] }
}

async function searchExistingTasks(query: string) {
  if (!query) { searchedTasks.value = []; return }
  searchingTasks.value = true
  try {
    const res = await taskApi.getTasks({ keyword: query, pageSize: 20 })
    searchedTasks.value = res.data.list
  } catch { searchedTasks.value = [] }
  finally { searchingTasks.value = false }
}

async function handlePublish() {
  publishing.value = true
  try {
    if (publishMode.value === 'new') {
      await taskStore.createAndAddTodo({
        title: publishForm.title, customDescription: publishForm.customDescription,
        acceptanceCriteria: publishForm.acceptanceCriteria, projectPath: publishForm.projectPath,
        gitBranch: publishForm.gitBranch, priority: publishForm.priority as any, project: publishForm.project,
      })
      ElMessage.success('任务已创建并加入 AI 待办')
    } else {
      await taskStore.republishToTodo(publishForm.existingTaskId, {
        customDescription: publishForm.customDescription, projectPath: publishForm.projectPath, gitBranch: publishForm.gitBranch,
      })
      ElMessage.success('任务已重新发布到 AI 待办')
    }
    showPublishDialog.value = false
  } catch (err: any) { ElMessage.error(err?.message || '发布失败') }
  finally { publishing.value = false }
}

// Computed: 双队列
const todoTasks = computed(() =>
  taskStore.todoList.map(id => taskStore.tasks.find(t => t.id === id)).filter((t): t is Task => !!t)
)

const todoQueueTasks = computed(() => todoTasks.value.filter(t => t.aiStatus !== 'ai_dev'))
const devQueueTasks = computed(() => todoTasks.value.filter(t => t.aiStatus === 'ai_dev'))

const ungroupedTodoTasks = computed(() => todoQueueTasks.value.filter(t => !t.groupId))

function getGroupTasks(groupId: string): Task[] {
  const group = taskStore.groups.find(g => g.id === groupId)
  if (!group) return []
  return group.taskIds.map(id => todoQueueTasks.value.find(t => t.id === id)).filter((t): t is Task => !!t)
}

function toggleGroup(id: string) {
  if (expandedGroups.has(id)) expandedGroups.delete(id)
  else expandedGroups.add(id)
}

// Group CRUD
async function handleCreateGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  try {
    const group = await taskStore.createGroup(name, newGroupTaskIds.value.length > 0 ? newGroupTaskIds.value : undefined, newGroupDesc.value || undefined)
    expandedGroups.add(group.id)
    showGroupDialog.value = false
    newGroupName.value = ''
    newGroupTaskIds.value = []
    newGroupDesc.value = ''
    ElMessage.success('分组已创建')
  } catch {
    ElMessage.error('创建分组失败')
  }
}

function editGroupSettings(group: TaskGroup) {
  editingGroup.value = group
  groupEditForm.name = group.name
  groupEditForm.description = group.description
  showGroupEdit.value = true
}

async function handleSaveGroupEdit() {
  if (!editingGroup.value) return
  try {
    await taskStore.updateGroup(editingGroup.value.id, { ...groupEditForm })
    showGroupEdit.value = false
    ElMessage.success('分组配置已更新')
  } catch {
    ElMessage.error('更新分组失败')
  }
}

async function handleDeleteGroup(group: TaskGroup) {
  try {
    await ElMessageBox.confirm(`确定解散分组「${group.name}」？`, '解散分组', { type: 'warning' })
    await taskStore.deleteGroup(group.id)
    expandedGroups.delete(group.id)
    ElMessage.success('分组已解散')
  } catch (err: any) {
    if (err !== 'cancel' && err?.toString() !== 'cancel') {
      ElMessage.error('解散分组失败')
    }
  }
}

// Drag — mouse-based reordering for todo cards
function onCardMouseDown(e: MouseEvent, index: number) {
  if ((e.target as HTMLElement).closest('.card-actions')) return
  dragFromIndex.value = index
  dragStartY = e.clientY
  dragMoved = false
  document.addEventListener('mousemove', onCardMouseMove)
  document.addEventListener('mouseup', onCardMouseUp)
}
function onCardMouseMove(e: MouseEvent) {
  const dy = Math.abs(e.clientY - dragStartY)
  if (!dragMoved && dy < 5) return
  dragMoved = true
  isDragging = true
  const cardList = document.querySelector('.todo-panel .card-list')
  if (!cardList) return
  const cards = cardList.querySelectorAll('.todo-card')
  dragOverIndex.value = -1
  cards.forEach((card, i) => {
    const rect = card.getBoundingClientRect()
    if (e.clientY >= rect.top && e.clientY <= rect.bottom) dragOverIndex.value = i
  })
}
function onCardMouseUp() {
  document.removeEventListener('mousemove', onCardMouseMove)
  document.removeEventListener('mouseup', onCardMouseUp)
  if (dragMoved && dragFromIndex.value >= 0 && dragOverIndex.value >= 0 && dragFromIndex.value !== dragOverIndex.value) {
    const tasks = ungroupedTodoTasks.value
    const fromTask = tasks[dragFromIndex.value]
    const toTask = tasks[dragOverIndex.value]
    if (fromTask && toTask) {
      const fromIdx = taskStore.todoList.indexOf(fromTask.id)
      const toIdx = taskStore.todoList.indexOf(toTask.id)
      if (fromIdx !== -1 && toIdx !== -1) {
        const item = taskStore.todoList.splice(fromIdx, 1)[0]
        const newToIdx = taskStore.todoList.indexOf(toTask.id)
        taskStore.todoList.splice(newToIdx, 0, item)
        saveOrder()
      }
    }
  }
  dragFromIndex.value = -1
  dragOverIndex.value = -1
  setTimeout(() => { isDragging = false }, 50)
  dragMoved = false
}
function onSubDragStart(groupId: string, index: number, e: DragEvent) {
  dragFrom.value = { type: 'group', index, groupId }
  e.dataTransfer!.effectAllowed = 'move'
}
function onSubDrop(groupId: string, index: number) {
  if (dragFrom.value?.type === 'group' && dragFrom.value.groupId === groupId && dragFrom.value.index !== index) {
    const group = taskStore.groups.find(g => g.id === groupId)
    if (group) {
      const item = group.taskIds.splice(dragFrom.value.index, 1)[0]
      group.taskIds.splice(index, 0, item)
      taskStore.updateGroup(groupId, { taskIds: group.taskIds })
    }
  }
  dragFrom.value = null
}
function onDragEnd() { dragFrom.value = null }

function saveOrder() {
  localStorage.setItem('linesequence-todo-list', JSON.stringify(taskStore.todoList))
  agentApi.saveTodoOrder(taskStore.todoList).catch(() => {})
}

function handleRemove(task: Task) { taskStore.toggleTodo(task); ElMessage.success('已移出 AI 待办') }
async function handleComplete(task: Task) { await taskStore.updateTask(task.id, { aiStatus: 'ai_review' }); taskStore.toggleTodo(task); ElMessage.success('已提交审核') }

// Config drawer (for editing task settings)
const drawerTask = ref<Task | null>(null)
const drawerSaving = ref(false)
const drawerForm = reactive({ projectPath: '', gitBranch: '', customDescription: '' })

function openDrawer(task: Task) {
  drawerTask.value = task
  drawerForm.projectPath = task.projectPath || ''
  drawerForm.gitBranch = task.gitBranch || ''
  drawerForm.customDescription = task.customDescription || ''
}

async function saveDrawer() {
  if (!drawerTask.value) return
  drawerSaving.value = true
  try {
    await taskStore.updateTask(drawerTask.value.id, {
      projectPath: drawerForm.projectPath,
      gitBranch: drawerForm.gitBranch,
      customDescription: drawerForm.customDescription,
    })
    ElMessage.success('已保存')
    drawerTask.value = null
  } catch { ElMessage.error('保存失败') }
  finally { drawerSaving.value = false }
}

function openUrl(url: string) { window.open(url) }

function isOverdue(task: Task) { return task.status !== 'completed' && task.deadline && new Date(task.deadline).getTime() < Date.now() }
function formatDate(d: string) { return dayjs(d).format('MM-DD') }
function getPriorityType(p: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' { return ({ urgent: 'danger', high: 'warning', medium: 'info', low: 'success' } as const)[p] || 'info' }
function getPriorityLabel(p: string) { return ({ urgent: '紧急', high: '高', medium: '中', low: '低' } as Record<string, string>)[p] || p }

function handleCardClick(task: Task) {
  if (isDragging) return
  openDrawer(task)
}

// Description editor
const editingDescId = ref<string | null>(null)
const editingDescText = ref('')
const savingDesc = ref(false)
function openDescEditor(task: Task) {
  editingDescId.value = task.id
  editingDescText.value = task.customDescription || ''
}
function cancelDescEdit() { editingDescId.value = null; editingDescText.value = '' }
async function saveDescEdit(task: Task) {
  savingDesc.value = true
  try {
    await taskStore.updateTask(task.id, { customDescription: editingDescText.value })
    ElMessage.success('已保存')
    editingDescId.value = null
  } catch { ElMessage.error('保存失败') }
  finally { savingDesc.value = false }
}

// ========== 全屏会话聊天 ==========
const chatTaskId = ref<string | null>(null)
const chatInput = ref('')
const chatMessagesRef = ref<HTMLElement | null>(null)
const replyToMsg = ref<{ id: string; content: string; time: string; type: string } | null>(null)

const { chatOpen, closeChat } = useChatPanel()
const agentChat = useAgentChat()

const sidebarWidth = ref(260)
const inputAreaHeight = ref(120)

const chatTask = computed(() => {
  if (!chatTaskId.value) return null
  return taskStore.tasks.find(t => t.id === chatTaskId.value) || null
})

// 会话列表：所有有过 AI 交互的任务（ai_status 非空），始终显示
const chatTaskList = computed(() => {
  const result = taskStore.tasks.filter(t => t.aiStatus && t.aiStatus !== '')
  // 从 session 消息中补充出现过的任务（防止 store 数据延迟）
  const msgTaskIds = new Set<string>()
  for (const m of agentChat.messages.value) {
    if (m.taskId) msgTaskIds.add(m.taskId)
  }
  const existingIds = new Set(result.map(t => t.id))
  for (const tid of msgTaskIds) {
    if (!existingIds.has(tid)) {
      const task = taskStore.tasks.find(t => t.id === tid)
      if (task) result.push(task)
    }
  }
  // 开发中排前面，其余按更新时间倒序
  return result.sort((a, b) => {
    const aDev = a.aiStatus === 'ai_dev' || a.aiStatus === 'ai_question' ? 0 : 1
    const bDev = b.aiStatus === 'ai_dev' || b.aiStatus === 'ai_question' ? 0 : 1
    if (aDev !== bDev) return aDev - bDev
    return (b.updateTime || '').localeCompare(a.updateTime || '')
  })
})

const devChatTasks = computed(() => chatTaskList.value.filter(t => t.aiStatus === 'ai_dev' || t.aiStatus === 'ai_question'))
const doneChatTasks = computed(() => chatTaskList.value.filter(t => t.aiStatus !== 'ai_dev' && t.aiStatus !== 'ai_question'))

const currentTaskMessages = computed(() => {
  if (!chatTaskId.value) return []
  return agentChat.messages.value.filter(m => m.taskId === chatTaskId.value || !m.taskId)
})

const activeSessionStatus = computed(() => {
  if (!agentChat.currentSession.value) return 'idle'
  if (agentChat.currentSession.value.status === 'archived') return 'archived'
  const lastMsg = agentChat.messages.value[agentChat.messages.value.length - 1]
  if (lastMsg?.type === 'plan' && lastMsg?.role === 'agent') return 'awaiting_plan'
  if (lastMsg?.type === 'question' && lastMsg?.role === 'agent') return 'awaiting_question'
  if (agentChat.inReview.value > 0) return 'awaiting_review'
  if (agentChat.inDev.value > 0) return 'developing'
  if (agentChat.todoCount.value > 0) return 'ready'
  return 'idle'
})

async function openFullscreenChat(task: Task) {
  chatTaskId.value = task.id
  chatOpen.value = true
  await taskStore.fetchTasks()
  await agentChat.loadContext()
  nextTick(() => scrollToBottom())
}

// 全局 chatOpen 时自动加载上下文
watch(chatOpen, async (v) => {
  if (v) {
    if (!chatTaskId.value && chatTaskList.value.length > 0) {
      chatTaskId.value = chatTaskList.value[0].id
    }
    await agentChat.loadContext()
    nextTick(() => scrollToBottom())
  }
})

// 侧边栏宽度拖拽
function onSidebarResizeStart(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startW = sidebarWidth.value
  function onMove(ev: MouseEvent) {
    sidebarWidth.value = Math.max(180, Math.min(500, startW + ev.clientX - startX))
  }
  function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// 输入区域高度拖拽
function onInputResizeStart(e: MouseEvent) {
  e.preventDefault()
  const startY = e.clientY
  const startH = inputAreaHeight.value
  function onMove(ev: MouseEvent) {
    inputAreaHeight.value = Math.max(80, Math.min(400, startH - (ev.clientY - startY)))
  }
  function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function switchChatTask(task: Task) {
  chatTaskId.value = task.id
  replyToMsg.value = null
  agentChat.loadContext(undefined, task.id)
  nextTick(() => scrollToBottom())
}

function setReplyTo(msg: { id: string; content: string; time: string; type: string }) {
  replyToMsg.value = { id: msg.id, content: msg.content, time: msg.time, type: msg.type }
}

async function handleChatSend() {
  if (!chatInput.value.trim() || agentChat.sending.value) return
  if (!chatTaskId.value) { ElMessage.warning('请先选择一个任务'); return }
  const text = chatInput.value.trim()
  const replyTo = replyToMsg.value
  chatInput.value = ''
  replyToMsg.value = null
  stopTyping()
  await agentChat.executeAction('send_message', {
    message: text,
    taskId: chatTaskId.value,
    payload: replyTo ? { replyTo: replyTo.content.substring(0, 200), replyToType: replyTo.type, replyToTime: replyTo.time } : undefined,
  })
  scrollToBottom()
}

// ========== 输入中状态检测（延长 /report 等待时间） ==========
let typingTimer: ReturnType<typeof setTimeout> | null = null
let lastTypingSent = 0
const TYPING_INTERVAL = 5000 // 每 5 秒发送一次输入中心跳

function onChatInput() {
  if (!chatTaskId.value) return
  const now = Date.now()
  if (now - lastTypingSent >= TYPING_INTERVAL) {
    lastTypingSent = now
    agentChat.executeAction('typing', { taskId: chatTaskId.value })
  }
  // 重置停止输入计时器
  if (typingTimer) clearTimeout(typingTimer)
  typingTimer = setTimeout(() => stopTyping(), 3000)
}

function stopTyping() {
  if (typingTimer) { clearTimeout(typingTimer); typingTimer = null }
  lastTypingSent = 0
  if (chatTaskId.value) {
    agentChat.executeAction('typing_stop', { taskId: chatTaskId.value })
  }
}

async function handleCancelTask() {
  if (!chatTaskId.value) return
  try {
    await ElMessageBox.confirm('确定终止当前任务？Agent 将跳过此任务执行下一个。', '终止任务', { type: 'warning' })
    await agentChat.executeAction('cancel_task', { taskId: chatTaskId.value, message: '人工终止任务' })
    ElMessage.success('任务已终止')
    taskStore.fetchTasks()
    syncTodoFromBackend()
    agentChat.loadContext()
  } catch { /* 取消 */ }
}

// ========== 队列与任务操作 ==========
async function handleClearQueue() {
  if (todoQueueTasks.value.length === 0) return
  try {
    await ElMessageBox.confirm(
      `确定清空待办队列？共 ${todoQueueTasks.value.length} 个任务将被移出。`,
      '清空队列',
      { type: 'warning' }
    )
    // 保存空队列到后端
    await agentApi.saveTodoOrder([])
    // 清空本地状态
    taskStore.todoList.splice(0, taskStore.todoList.length)
    localStorage.setItem('linesequence-todo-list', '[]')
    ElMessage.success('队列已清空')
  } catch { /* 取消 */ }
}

async function handleTerminateDevTask() {
  const devTask = devQueueTasks.value[0]
  if (!devTask) return
  try {
    await ElMessageBox.confirm(
      `确定终止任务「${devTask.title}」？Agent 将跳过此任务执行下一个。`,
      '终止任务',
      { type: 'warning' }
    )
    await agentChat.executeAction('cancel_task', { taskId: devTask.id, message: '人工终止任务' })
    ElMessage.success('任务已终止')
    taskStore.fetchTasks()
    syncTodoFromBackend()
    agentChat.loadContext()
  } catch { /* 取消 */ }
}

function scrollToBottom() {
  nextTick(() => {
    setTimeout(() => {
      if (chatMessagesRef.value) {
        chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
      }
    }, 50)
  })
}

function formatMsgTime(t: string) { return dayjs(t).format('HH:mm') }

watch(() => agentChat.messages.value.length, () => { scrollToBottom() })

// ========== 唤醒 Agent ==========
const waking = ref(false)
async function handleWakeAgent() {
  if (todoQueueTasks.value.length === 0) {
    ElMessage.warning('待办队列为空，无法唤醒 Agent')
    return
  }
  waking.value = true
  try {
    await agentChat.executeAction('wake', { message: '开始工作' })
    ElMessage.success('已唤醒 Agent')
  } catch { ElMessage.error('唤醒失败，请检查同步中心配置') }
  finally { waking.value = false }
}

// ========== WebSocket 实时消息 ==========
let refreshTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRefresh() {
  if (refreshTimer) return
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    taskStore.fetchTasks()
    syncTodoFromBackend()
  }, 500)
}

const { connected: wsConnected, startWs, subscribeGlobal } = useChatWs((event, _taskId, data) => {
  if (event === 'chat') {
    agentChat.handleWsMessage(event, data)
    scrollToBottom()
    // 状态变更类消息触发任务列表和待办队列刷新
    if (data?.type === 'status_change' || data?.type === 'approval' || data?.type === 'completion') {
      scheduleRefresh()
    }
  }
})

onMounted(async () => {
  await taskStore.fetchTasks()
  syncTodoFromBackend()
  startWs()
  subscribeGlobal()
  await nextTick()
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  stopTyping()
})

let pollTimer: ReturnType<typeof setInterval> | null = null

async function syncTodoFromBackend() {
  try {
    const res = await agentApi.getTodoOrder()
    const backendList: string[] = res.data?.todoList || []
    // If backend list differs from local, sync
    if (JSON.stringify(backendList) !== JSON.stringify(taskStore.todoList)) {
      taskStore.todoList.splice(0, taskStore.todoList.length, ...backendList)
      localStorage.setItem('linesequence-todo-list', JSON.stringify(taskStore.todoList))
    }
  } catch { /* ignore */ }
}
</script>

<style lang="scss" scoped>
.ai-todo-page { position: relative; min-height: calc(100vh - 96px); overflow: hidden; }
.content-layer { position: relative; z-index: 1; padding: 0 12px; }

// Stats bar
.stats-bar { display: flex; align-items: center; justify-content: center; gap: 24px; padding: 8px 0 4px; }
.stat-item { display: flex; align-items: center; gap: 8px; }
.stat-pulse {
  width: 8px; height: 8px; border-radius: 50%; background: #00E5FF;
  box-shadow: 0 0 8px #00E5FF; animation: pulse 2s ease-in-out infinite;
  &.dev-pulse { background: #FF7D00; box-shadow: 0 0 8px #FF7D00; animation: pulse-red 1.5s ease-in-out infinite; }
}
.stat-num { font-size: 24px; font-weight: 800; color: var(--cyber-text-primary); font-variant-numeric: tabular-nums; }
.stat-label { font-size: 12px; color: var(--cyber-text-secondary); text-transform: uppercase; letter-spacing: 1px; }
.stat-divider { width: 1px; height: 28px; background: rgba(255,255,255,0.08); }
@keyframes pulse { 0%,100%{ opacity:0.6; transform:scale(1); } 50%{ opacity:1; transform:scale(1.3); } }
@keyframes pulse-red { 0%,100%{ opacity:0.5; transform:scale(1); } 50%{ opacity:1; transform:scale(1.5); } }

// Header
.page-header { text-align: center; padding: 4px 0 12px; }
.page-header-bar { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 4px; }
.page-title { margin: 0; font-size: 28px; font-weight: 700; }
.glow-text {
  background: linear-gradient(135deg, #00E5FF, #00E5FF, #FF7D00, #00E5FF);
  background-size: 300% 300%;
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  animation: gradientShift 6s ease infinite;
}
@keyframes gradientShift { 0%,100%{background-position:0% 50%} 33%{background-position:100% 50%} 66%{background-position:50% 100%} }
.page-desc { color: var(--cyber-text-secondary); font-size: 13px; margin: 0; }

// Dual panel
.dual-panel {
  display: grid;
  grid-template-columns: 1fr clamp(280px, 30vw, 380px);
  gap: 20px;
  max-width: var(--container-md);
  margin: 0 auto;
  padding-bottom: 40px;
}
.panel {
  background: var(--cyber-glass-bg);
  border: 1px solid var(--cyber-glass-border);
  border-radius: 14px;
  backdrop-filter: blur(2px);
  padding: 20px;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 320px;
}
.todo-panel { border-color: var(--cyber-glass-border); }
.dev-panel { border-color: rgba(255,125,0,0.2); }
.todo-panel::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, #00E5FF, #00E5FF, transparent);
  animation: scanLine 3s linear infinite;
}
.dev-panel::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, #FF7D00, #ffd700, transparent);
  animation: scanLine 2s linear infinite;
}
@keyframes scanLine { 0%{opacity:0.3} 50%{opacity:1} 100%{opacity:0.3} }

.panel-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-shrink: 0; }
.panel-action-btn { margin-left: auto; }
.panel-scroll {
  flex: 1; overflow-y: auto; min-height: 0;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 4px; }
}
.panel-icon { width: 28px; height: 28px; position: relative; display: flex; align-items: center; justify-content: center; }
.icon-ring {
  position: absolute; inset: 0; border: 2px solid var(--cyber-cyan); border-radius: 50%;
  animation: ringPulse 2s ease-in-out infinite;
  &.dev-ring { border-color: var(--cyber-orange); animation-duration: 1.2s; }
}
.icon-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #00E5FF;
  &.dev-dot { background: #FF7D00; box-shadow: 0 0 10px #FF7D00; }
}
@keyframes ringPulse { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.2);opacity:0.2} }
.panel-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--cyber-text-primary); flex: 1; }
.dev-title { color: var(--cyber-orange); }
.engine-indicator {
  display: flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 10px;
  background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.2);
}
.engine-pulse { width: 6px; height: 6px; border-radius: 50%; background: #FF7D00; animation: pulse-red 1s ease-in-out infinite; }
.engine-text { font-size: 10px; font-weight: 700; color: var(--cyber-orange); letter-spacing: 2px; }

.panel-empty { text-align: center; padding: 40px 0; color: var(--cyber-text-secondary); p { margin: 12px 0 0; font-size: 14px; } }
.empty-pulse { width: 40px; height: 40px; margin: 0 auto; border-radius: 50%; border: 2px solid rgba(102,126,234,0.2); animation: ringPulse 3s ease-in-out infinite; }
.empty-engine { width: 40px; height: 40px; margin: 0 auto; border-radius: 50%; border: 2px solid rgba(255,107,107,0.15); background: rgba(255,107,107,0.03); }
.dev-empty p { color: var(--cyber-text-muted); }

// Group cards
.group-card {
  background: var(--cyber-glass-bg); border: 1px solid rgba(157,92,255,0.15);
  border-radius: 10px; margin-bottom: 10px; overflow: hidden; transition: border-color 0.3s;
  &:hover { border-color: rgba(157,92,255,0.35); }
}
.group-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer; transition: background 0.2s; &:hover { background: rgba(157,92,255,0.08); } }
.group-left { display: flex; align-items: center; gap: 8px; }
.group-arrow { color: var(--cyber-purple); font-size: 13px; transition: transform 0.2s; &.expanded { transform: rotate(90deg); } }
.group-name { font-size: 14px; font-weight: 600; color: var(--cyber-text-primary); }
.group-right { display: flex; align-items: center; gap: 8px; }
.group-desc { padding: 0 14px 8px; }
.group-desc-text { font-size: 11px; color: var(--cyber-purple); line-height: 1.5; opacity: 0.85; }
.group-tasks { border-top: 1px solid rgba(157,92,255,0.1); }
.group-empty { padding: 12px; text-align: center; color: var(--cyber-text-secondary); font-size: 12px; }
.sub-task {
  display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px;
  border-bottom: 1px solid rgba(157,92,255,0.05); transition: background 0.2s; cursor: grab;
  &:last-child { border-bottom: none; }
  &:hover { background: rgba(157,92,255,0.06); }
}
.sub-rank { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: rgba(157,92,255,0.15); border-radius: 5px; font-size: 10px; font-weight: 700; color: var(--cyber-purple); flex-shrink: 0; margin-top: 2px; }
.sub-body { flex: 1; min-width: 0; }
.sub-top { display: flex; align-items: center; gap: 6px; }
.sub-title { flex: 1; font-size: 12px; color: var(--cyber-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-desc { margin-top: 4px; font-size: 11px; color: var(--cyber-cyan); opacity: 0.8; cursor: pointer; display: flex; align-items: flex-start; gap: 4px; span:first-child { flex: 1; line-height: 1.4; } &:hover { opacity: 1; } }
.sub-desc-edit { font-size: 10px; opacity: 0.5; flex-shrink: 0; }
.sub-desc-add { margin-top: 4px; font-size: 11px; color: var(--cyber-purple); cursor: pointer; opacity: 0.6; &:hover { opacity: 1; } }
.sub-desc-editor { margin-top: 6px; }
.sub-desc-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
.sub-actions { display: flex; gap: 4px; flex-shrink: 0; margin-top: 2px; }
.collapse-enter-active,.collapse-leave-active { transition: all 0.25s ease; overflow: hidden; }
.collapse-enter-from,.collapse-leave-to { opacity: 0; max-height: 0; }
.collapse-enter-to,.collapse-leave-from { max-height: 600px; }

// Card list
.card-list { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }

// Todo card
.todo-card {
  position: relative; display: flex; align-items: stretch;
  background: var(--cyber-glass-bg); border: 1px solid var(--cyber-glass-border);
  border-radius: 10px; transition: border-color 0.3s ease, box-shadow 0.3s ease; cursor: grab;
  backdrop-filter: blur(2px);
  &:hover { border-color: var(--cyber-glass-border-hover); box-shadow: 0 0 20px rgba(0,229,255,0.1); }
  &.drag-source { opacity: 0.4; }
  &.drag-over { border-color: var(--cyber-cyan); box-shadow: 0 0 16px rgba(0,229,255,0.3); }
}
.card-glow {
  position: absolute; inset: -1px; border-radius: 10px;
  background: conic-gradient(from var(--angle,0deg), transparent 70%, rgba(0,229,255,0.35), rgba(157,92,255,0.25), transparent 90%);
  animation: rotateGlow 6s linear infinite; z-index: -1; opacity: 0; transition: opacity 0.4s; pointer-events: none;
}
.todo-card:hover .card-glow { opacity: 1; }
@keyframes rotateGlow { to { --angle: 360deg; } }
@property --angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
.card-rank { display: flex; align-items: center; justify-content: center; width: 40px; flex-shrink: 0; font-size: 16px; font-weight: 800; background: linear-gradient(180deg, rgba(0,229,255,0.12), rgba(0,229,255,0.03)); color: var(--cyber-cyan); border-right: 1px solid var(--cyber-glass-border); }
.card-body { flex: 1; padding: 12px 14px; min-width: 0; }
.card-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; .card-id { color: var(--cyber-text-secondary); font-size: 11px; margin-left: auto; } }
.card-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--cyber-text-primary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-meta { display: flex; gap: 10px; margin-top: 6px; font-size: 11px; color: var(--cyber-text-secondary); .overdue { color: #f56c6c; font-weight: 600; } }
.card-config { display: flex; gap: 10px; margin-top: 4px; font-size: 10px; color: var(--cyber-cyan); opacity: 0.8; .config-item { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
.card-actions { display: flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 4px; padding: 0 10px; border-left: 1px solid var(--cyber-glass-border);
  :deep(.el-button) { width: 100%; text-align: center; margin-left: 0 !important; padding: 0 !important; }
  :deep(.el-button + .el-button) { margin-left: 0 !important; }
}
.card-desc-preview { margin-top: 8px; padding: 5px 10px; border-radius: 6px; background: var(--cyber-glass-border); border: 1px solid var(--cyber-glass-border); display: flex; align-items: flex-start; gap: 6px; }
.desc-label { font-size: 10px; color: var(--cyber-cyan); white-space: nowrap; flex-shrink: 0; margin-top: 1px; }
.desc-text { flex: 1; font-size: 11px; color: var(--cyber-text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

// Dev card
.dev-card {
  position: relative; display: flex; flex-direction: column;
  background: var(--cyber-glass-bg); border: 1px solid rgba(255,125,0,0.15);
  border-radius: 10px; overflow: hidden; transition: all 0.3s ease;
  &:hover { border-color: rgba(255,125,0,0.35); box-shadow: 0 0 24px rgba(255,125,0,0.1); transform: translateY(-1px); }
}
.dev-card-inner { display: flex; align-items: stretch; flex: 1; }
.dev-card-glow {
  position: absolute; inset: -1px; border-radius: 10px;
  background: conic-gradient(from var(--angle,0deg), transparent 60%, rgba(255,107,107,0.35), rgba(255,215,0,0.2), transparent 85%);
  animation: rotateGlow 4s linear infinite; z-index: -1; opacity: 0; transition: opacity 0.4s; pointer-events: none;
}
.dev-card:hover .dev-card-glow { opacity: 1; }
.dev-status-bar { width: 3px; flex-shrink: 0; position: relative; overflow: hidden; background: rgba(255,107,107,0.15); }
.dev-progress { position: absolute; bottom: 0; left: 0; right: 0; height: 40%; background: linear-gradient(180deg, #FF7D00, #ffd700); animation: progressGrow 3s ease-in-out infinite alternate; }
@keyframes progressGrow { 0%{height:20%;opacity:0.6} 100%{height:80%;opacity:1} }

// Wake Bar
.wake-bar { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 8px; padding: 8px 16px; border-radius: 10px; background: rgba(0,229,255,0.04); border: 1px solid rgba(0,229,255,0.12); }
.wake-btn-sm { border-radius: 8px; background: linear-gradient(135deg, #00E5FF, #9D5CFF); border: none; box-shadow: 0 0 16px rgba(0,229,255,0.2); transition: box-shadow 0.3s, transform 0.2s; &:hover { box-shadow: 0 0 24px rgba(0,229,255,0.35); transform: translateY(-1px); } }
.wake-hint { font-size: 13px; color: var(--cyber-text-secondary); }

// Config Modal
.config-modal-mask { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.45); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; }
.config-modal { width: var(--dialog-lg); max-height: 80vh; border-radius: 14px; overflow: hidden; background: var(--cyber-glass-bg-strong); border: 1px solid var(--cyber-glass-border); box-shadow: 0 8px 40px rgba(0,0,0,0.15); display: flex; flex-direction: column; animation: modal-in 0.25s cubic-bezier(0.16,1,0.3,1); }
@keyframes modal-in { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.config-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--cyber-glass-border); }
.config-modal-title { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.config-modal-id { color: var(--cyber-text-secondary); font-size: 12px; }
.config-modal-name { font-size: 15px; font-weight: 600; color: var(--cyber-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.config-modal-close { font-size: 18px; color: var(--cyber-text-secondary); &:hover { color: var(--cyber-cyan); } }
.config-modal-body { flex: 1; overflow-y: auto; padding: 20px 24px; }
.config-form :deep(.el-form-item__label) { font-weight: 500; }
.config-field { font-size: 13px; color: var(--cyber-text-primary); padding: 6px 0; line-height: 1.5; }
.doc-link { display: flex; align-items: center; justify-content: space-between; }
.config-modal-footer { padding: 16px 24px; border-top: 1px solid var(--cyber-glass-border); display: flex; justify-content: flex-end; gap: 10px; }
.fade-mask-enter-active, .fade-mask-leave-active { transition: opacity 0.2s ease; }
.fade-mask-enter-from, .fade-mask-leave-to { opacity: 0; }

// Transitions
.card-enter-active { transition: all 0.4s ease; }
.card-leave-active { transition: all 0.3s ease; position: absolute; }
.card-enter-from { opacity: 0; transform: translateY(20px) scale(0.95); }
.card-leave-to { opacity: 0; transform: translateX(-30px); }
.card-move { transition: transform 0.35s ease; }

// Responsive
@media (max-width: 900px) { .dual-panel { grid-template-columns: 1fr; } }

// ========================================
// 全屏会话聊天面板
// ========================================
.fullscreen-chat-mask {
  position: fixed; inset: 0; z-index: 3000;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(8px);
  animation: fc-mask-in 0.2s ease;
}
@keyframes fc-mask-in { from { opacity: 0; } to { opacity: 1; } }

.fullscreen-chat {
  position: absolute; inset: 20px;
  background: var(--cyber-glass-bg-strong);
  border: 1px solid var(--cyber-glass-border);
  border-radius: 16px; overflow: hidden;
  display: flex;
  box-shadow: 0 0 80px rgba(0,229,255,0.06), 0 0 200px rgba(157,92,255,0.03);
  animation: fc-panel-in 0.3s cubic-bezier(0.16,1,0.3,1);
}
@keyframes fc-panel-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }

// 左侧：会话列表
.fc-sidebar {
  border-right: 1px solid var(--cyber-glass-border);
  display: flex; flex-direction: column;
  flex-shrink: 0;
  background: rgba(128,128,128,0.06);
}
.fc-sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 16px 14px;
  h3 { margin: 0; font-size: 15px; font-weight: 700; color: var(--cyber-text-primary); }
}
.fc-sidebar-count {
  font-size: 11px; background: rgba(0,229,255,0.08); color: var(--cyber-cyan);
  padding: 2px 10px; border-radius: 10px; border: 1px solid rgba(0,229,255,0.12);
}
.fc-sidebar-list {
  flex: 1; overflow-y: auto; padding: 0 8px 8px;
  &::-webkit-scrollbar { width: 3px; }
  &::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.08); border-radius: 3px; }
}
.fc-sidebar-group { margin-bottom: 8px; }
.fc-group-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
  color: var(--cyber-text-muted); padding: 8px 10px 4px; user-select: none;
}
.fc-mini-tag { font-size: 9px !important; padding: 0 4px !important; height: 14px !important; line-height: 14px !important; }

.fc-contact {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 10px; border-radius: 10px; cursor: pointer;
  transition: all 0.2s; margin-bottom: 2px;
  border: 1px solid transparent;
  &:hover { background: rgba(0,229,255,0.04); }
  &.active { background: rgba(0,229,255,0.06); border-color: rgba(0,229,255,0.15); }
}
.fc-contact-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  &.dot-ai_dev { background: #FF7D00; box-shadow: 0 0 8px rgba(255,125,0,0.5); animation: pulse-red 1.5s ease-in-out infinite; }
  &.dot-ai_review { background: #409EFF; box-shadow: 0 0 6px rgba(64,158,255,0.4); }
  &.dot-ai_done { background: #67c23a; box-shadow: 0 0 4px rgba(103,194,58,0.3); }
  &.dot-ai_rework { background: #E6A23C; box-shadow: 0 0 6px rgba(230,162,60,0.4); }
  &.dot-ai_question { background: #F56C6C; box-shadow: 0 0 6px rgba(245,108,108,0.4); }
  &.dot-ai_cancelled { background: #909399; }
}
.fc-contact-info { flex: 1; min-width: 0; }
.fc-vscode-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; color: var(--cyber-text-muted); cursor: pointer; opacity: 0; transition: all .15s; text-decoration: none; flex-shrink: 0;
  &:hover { background: rgba(0,229,255,0.1); color: #00E5FF; opacity: 1 !important; }
}
.fc-contact:hover .fc-vscode-btn { opacity: 0.6; }
.fc-contact-name { font-size: 13px; font-weight: 500; color: var(--cyber-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fc-contact-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 11px; color: var(--cyber-text-secondary); }
.fc-sidebar-empty { text-align: center; padding: 40px 12px; font-size: 13px; color: var(--cyber-text-muted); }

// 拖拽分隔条
.fc-resizer {
  width: 4px; cursor: col-resize; flex-shrink: 0;
  background: var(--cyber-glass-border); transition: background 0.2s;
  &:hover { background: var(--cyber-cyan); }
}

// 右侧：聊天主区域
.fc-main {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
}

// 聊天头部
.fc-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px; border-bottom: 1px solid var(--cyber-glass-border); flex-shrink: 0;
  background: rgba(128,128,128,0.04);
}
.fc-header-left { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
.fc-header-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  &.priority-urgent { background: #f56c6c; box-shadow: 0 0 6px #f56c6c; }
  &.priority-high { background: #e6a23c; box-shadow: 0 0 6px #e6a23c; }
  &.priority-medium { background: #409eff; }
  &.priority-low { background: #67c23a; }
}
.fc-header-info { min-width: 0; flex: 1;
  h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--cyber-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.fc-header-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.fc-task-id { font-size: 11px; color: var(--cyber-text-secondary); font-family: 'Cascadia Code', Consolas, monospace; }
.fc-header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.fc-close-btn {
  width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--cyber-glass-border);
  background: transparent; color: var(--cyber-text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
  &:hover { background: rgba(245,108,108,0.08); border-color: rgba(245,108,108,0.3); color: #f56c6c; }
}

// 消息流
.fc-messages {
  flex: 1; overflow-y: auto; padding: 20px 24px;
  display: flex; flex-direction: column; gap: 14px;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.08); border-radius: 4px; }
}
.fc-loading {
  display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0;
  color: var(--cyber-text-muted); font-size: 13px;
}
.fc-loading-spinner {
  width: 24px; height: 24px; border: 2px solid var(--cyber-glass-border);
  border-top-color: var(--cyber-cyan); border-radius: 50%;
  animation: fc-spin 0.8s linear infinite;
}
@keyframes fc-spin { to { transform: rotate(360deg); } }

.fc-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  .fc-empty-icon { opacity: 0.4; margin-bottom: 8px; }
  p { font-size: 14px; color: var(--cyber-text-primary); margin: 0; }
  span { font-size: 12px; color: var(--cyber-text-muted); }
}

// 消息
.fc-msg {
  display: flex; gap: 10px; max-width: 80%;
  &.user { align-self: flex-end; flex-direction: row-reverse; }
  &.agent { align-self: flex-start; }
  &.system { align-self: center; max-width: 65%; }
}
.fc-msg-avatar {
  width: 34px; height: 34px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800; flex-shrink: 0; letter-spacing: 0.5px;
  &.user { background: linear-gradient(135deg, rgba(0,229,255,0.12), rgba(0,229,255,0.04)); border: 1px solid rgba(0,229,255,0.2); color: var(--cyber-cyan); }
  &.agent { background: linear-gradient(135deg, rgba(157,92,255,0.12), rgba(157,92,255,0.04)); border: 1px solid rgba(157,92,255,0.2); color: var(--cyber-purple); }
  &.system { background: rgba(255,255,255,0.04); border: 1px solid var(--cyber-glass-border); color: var(--cyber-text-muted); }
}
.fc-msg-body { min-width: 0; flex: 1; }
.fc-msg-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.fc-msg-role { font-size: 11px; font-weight: 600; color: var(--cyber-text-secondary); }
.fc-msg-time { font-size: 10px; color: var(--cyber-text-muted); margin-left: auto; font-family: 'Cascadia Code', Consolas, monospace; }
.fc-reply-btn {
  opacity: 0; font-size: 12px; color: var(--cyber-text-muted); background: none; border: none;
  cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: all .15s;
  &:hover { color: var(--cyber-cyan); background: rgba(0,229,255,0.08); }
}
.fc-msg:hover .fc-reply-btn { opacity: 1; }
.fc-quote-preview {
  font-size: 11px; padding: 4px 8px; margin-bottom: 6px; border-radius: 6px;
  background: rgba(157,92,255,0.06); border-left: 2px solid rgba(157,92,255,0.3);
  color: var(--cyber-text-secondary);
}
.fc-quote-label { font-weight: 600; margin-right: 4px; }
.fc-quote-text { opacity: 0.7; }
.fc-reply-bar {
  display: flex; align-items: center; gap: 6px; padding: 4px 10px;
  background: rgba(157,92,255,0.06); border-left: 2px solid var(--cyber-purple);
  border-radius: 0 6px 6px 0; margin-bottom: 4px;
}
.fc-reply-bar-inner { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--cyber-text-secondary); }
.fc-reply-bar-label { font-weight: 600; color: var(--cyber-purple); flex-shrink: 0; }
.fc-reply-bar-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.7; }
.fc-reply-bar-close { background: none; border: none; color: var(--cyber-text-muted); cursor: pointer; font-size: 12px; padding: 2px; border-radius: 4px;
  &:hover { color: #f56c6c; background: rgba(245,108,108,0.1); }
}
.fc-badge {
  font-size: 10px; padding: 1px 8px; border-radius: 6px; font-weight: 600;
  &.plan { background: rgba(0,229,255,0.1); color: var(--cyber-cyan); border: 1px solid rgba(0,229,255,0.15); }
  &.done { background: rgba(46,184,92,0.1); color: #67c23a; border: 1px solid rgba(46,184,92,0.15); }
  &.question { background: rgba(245,108,108,0.1); color: #f56c6c; border: 1px solid rgba(245,108,108,0.15); }
  &.progress { background: rgba(157,92,255,0.1); color: var(--cyber-purple); border: 1px solid rgba(157,92,255,0.15); }
}
.fc-msg-bubble {
  padding: 12px 16px; border-radius: 14px; font-size: 13px; line-height: 1.7;
  word-break: break-word; white-space: pre-wrap;
  &.user {
    background: linear-gradient(135deg, rgba(0,229,255,0.08), rgba(0,229,255,0.03));
    border: 1px solid rgba(0,229,255,0.12); border-top-right-radius: 4px;
  }
  &.agent {
    background: linear-gradient(135deg, rgba(157,92,255,0.08), rgba(157,92,255,0.03));
    border: 1px solid rgba(157,92,255,0.12); border-top-left-radius: 4px;
  }
  &.system {
    background: rgba(255,255,255,0.02); border: 1px solid var(--cyber-glass-border); border-radius: 10px;
  }
  &.plan { border-color: rgba(0,229,255,0.25); background: linear-gradient(135deg, rgba(0,229,255,0.1), rgba(0,229,255,0.03)); }
  &.completion { border-color: rgba(46,184,92,0.25); background: linear-gradient(135deg, rgba(46,184,92,0.1), rgba(46,184,92,0.03)); }
  &.question { border-color: rgba(245,108,108,0.25); background: linear-gradient(135deg, rgba(245,108,108,0.1), rgba(245,108,108,0.03)); }
  p { color: var(--cyber-text-primary); margin: 0; }
  &.system p { color: var(--cyber-text-secondary); font-size: 12px; }
}

// 快捷操作
.fc-actions {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 24px; border-top: 1px solid var(--cyber-glass-border);
  flex-wrap: wrap; flex-shrink: 0; background: rgba(128,128,128,0.04);
}
.fc-actions-hint { font-size: 12px; color: var(--cyber-cyan); opacity: 0.7; }

// 输入区域
.fc-input-area {
  display: flex; flex-direction: column; flex-shrink: 0;
  border-top: 1px solid var(--cyber-glass-border);
  background: rgba(128,128,128,0.04);
}
.fc-input-readonly {
  padding: 12px 24px; text-align: center;
  border-top: 1px solid var(--cyber-glass-border);
  background: rgba(128,128,128,0.03);
  font-size: 12px; color: var(--cyber-text-muted); flex-shrink: 0;
}
.fc-input-resizer {
  height: 4px; cursor: row-resize; flex-shrink: 0;
  background: transparent; transition: background 0.2s;
  &:hover { background: var(--cyber-cyan); }
}
.fc-input-inner {
  flex: 1; display: flex; flex-direction: column; padding: 0 24px 12px;
  min-height: 0;
}
.fc-textarea {
  flex: 1; width: 100%; resize: none; border: none; outline: none;
  background: transparent; color: var(--cyber-text-primary);
  font-size: 13px; line-height: 1.6; font-family: inherit;
  padding: 8px 0;
  &::placeholder { color: var(--cyber-text-muted); }
}
.fc-input-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0; padding-top: 4px;
}
.fc-input-hint { font-size: 11px; color: var(--cyber-text-muted); }
.fc-send-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 18px; border-radius: 10px; border: none;
  background: linear-gradient(135deg, #00E5FF, #9D5CFF);
  color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all 0.2s; box-shadow: 0 2px 12px rgba(0,229,255,0.15);
  &:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,229,255,0.25); }
  &:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
}

// Fullscreen chat transition
.fullscreen-chat-enter-active { transition: all 0.25s ease; }
.fullscreen-chat-leave-active { transition: all 0.2s ease; }
.fullscreen-chat-enter-from, .fullscreen-chat-leave-to { opacity: 0; }
.fullscreen-chat-enter-from .fullscreen-chat { transform: scale(0.96); }
.fullscreen-chat-leave-to .fullscreen-chat { transform: scale(0.97); }
</style>
