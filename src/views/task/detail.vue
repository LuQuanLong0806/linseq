<template>
  <div class="task-detail-page" v-loading="taskStore.loading">
    <div v-if="error" class="error-state">
      <p>{{ error }}</p>
      <el-button type="primary" @click="error = ''; $router.push('/tasks')">返回列表</el-button>
    </div>
    <div v-else-if="taskStore.currentTask" class="detail-container">
      <!-- 头部信息 -->
      <div class="detail-header">
        <div class="header-left">
          <el-button :icon="ArrowLeft" @click="$router.back()" circle size="small" />
          <div class="title-area">
            <h2>{{ task.title }}</h2>
            <div class="meta-tags">
              <el-tag :type="getStatusType(task.status)" effect="dark" size="default">{{ getStatusLabel(task.status) }}</el-tag>
              <el-tag :type="getPriorityType(task.priority)" size="default">{{ getPriorityLabel(task.priority) }}</el-tag>
              <el-tag v-if="task.aiStatus" :type="getAiStatusType(task.aiStatus)" size="default" effect="plain">{{ getAiStatusLabel(task.aiStatus) }}</el-tag>
              <el-tag v-if="task.reworkCount > 0" type="danger" size="small" effect="dark">返工{{ task.reworkCount }}次</el-tag>
              <el-tag v-if="task.project" type="info" size="default">{{ task.project }}</el-tag>
              <el-tag v-if="task.bugOrReq" size="default" effect="plain">{{ getBugOrReqLabel(task.bugOrReq) }}</el-tag>
              <span class="meta-id">#{{ task.sourceId }}</span>
              <span v-if="task.workHours" class="meta-hours">工时: {{ task.workHours }}h</span>
            </div>
          </div>
        </div>
        <div class="header-right">
          <el-button type="primary" @click="handleStartDev" v-if="task.status === 'pending'" :icon="VideoPlay">开始开发</el-button>
          <el-button type="success" @click="handleSelfTest" v-if="task.status === 'in_progress'" :icon="CircleCheck">自测完成</el-button>
          <el-button type="warning" @click="handleSubmit" v-if="task.status === 'self_test'" :icon="Upload">提交测试</el-button>
          <el-dropdown trigger="click" @command="handleStatusCommand">
            <el-button>更多操作<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="pending">重置为待开发</el-dropdown-item>
                <el-dropdown-item command="in_progress">开发中</el-dropdown-item>
                <el-dropdown-item command="self_test">自测完成</el-dropdown-item>
                <el-dropdown-item command="completed">已完结</el-dropdown-item>
                <el-dropdown-item command="rejected">已驳回</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <el-row :gutter="20">
        <!-- 左侧：需求 + 验收标准 -->
        <el-col :span="16">
          <!-- 需求描述（内网原始 + 自定义补充） -->
          <div class="content-card cyber-panel">
            <div class="panel-header"><span class="card-title">任务描述</span></div>
            <div class="desc-section">
              <div class="desc-label">原始描述</div>
              <div class="desc-content">{{ task.description || task.title }}</div>
            </div>
            <el-divider />
            <div class="desc-section">
              <div class="desc-label">
                自定义补充
                <el-button type="primary" link size="small" @click="startEdit('customDescription')">编辑</el-button>
              </div>
              <div class="desc-content" v-if="task.customDescription" v-html="task.customDescription"></div>
              <div class="desc-content empty" v-else>点击编辑按钮补充需求描述</div>
            </div>
          </div>

          <!-- 需求文档 -->
          <div class="content-card cyber-panel" style="margin-top:20px;">
            <div class="panel-header">
              <div class="card-header-flex">
                <span class="card-title">需求文档</span>
                <div style="display:flex;align-items:center;gap:10px;">
                  <el-button v-if="task.reqDocText && !docEditing" type="primary" link size="small" @click="startDocEdit">编辑</el-button>
                  <el-button v-if="!task.reqDocText && task.reqDocName" type="primary" link size="small" :loading="extractingPdf" @click="handleExtractPdf">
                    {{ extractingPdf ? '提取中...' : '提取文字' }}
                  </el-button>
                </div>
              </div>
            </div>
            <!-- PDF 解析文字 -->
            <template v-if="task.reqDocText">
              <el-input
                v-if="docEditing"
                v-model="docEditText"
                type="textarea"
                :autosize="{ minRows: 6, maxRows: 25 }"
                placeholder="编辑需求文档内容"
              />
              <div v-else class="doc-text-content" style="max-height:500px;">
                <div v-for="(line, i) in docTextLines" :key="i" class="doc-text-line">{{ line }}</div>
              </div>
              <div v-if="docEditing" style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px;">
                <el-button size="small" @click="docEditing = false">取消</el-button>
                <el-button size="small" type="primary" :loading="docSaving" @click="saveDocEdit">保存</el-button>
              </div>
            </template>
            <!-- 无解析文字时展示手动内容 -->
            <template v-else>
              <div class="desc-content" v-if="task.requirementDoc" v-html="task.requirementDoc"></div>
              <div class="desc-content empty" v-else>暂无需求文档内容</div>
            </template>
          </div>

          <!-- 验收标准 -->
          <div class="content-card cyber-panel" style="margin-top:20px;">
            <div class="panel-header">
              <div class="card-header-flex">
                <span class="card-title">验收标准</span>
                <el-button type="primary" link size="small" @click="startEdit('acceptanceCriteria')">编辑</el-button>
              </div>
            </div>
            <div class="desc-content" v-if="task.acceptanceCriteria" v-html="task.acceptanceCriteria"></div>
            <div class="desc-content empty" v-else>点击编辑按钮添加验收标准</div>
          </div>

          <!-- AI 疑问卡片 -->
          <div v-if="task.aiStatus === 'ai_question' && task.aiQuestion" class="content-card question-card cyber-panel" style="margin-top:20px;">
            <div class="panel-header">
              <div class="card-header-flex">
                <span class="card-title" style="color:#e6a23c;">AI 有疑问，等待回复</span>
              </div>
            </div>
            <div class="question-content">
              <div class="question-label">AI 提出的问题：</div>
              <div class="question-text">{{ task.aiQuestion }}</div>
            </div>
            <div class="question-reply" style="margin-top:16px;">
              <el-input v-model="questionReply" type="textarea" :rows="3" placeholder="请输入补充说明，回复后 AI 将继续开发..." />
              <el-button type="warning" style="margin-top:8px;" @click="handleReplyQuestion" :loading="replying">回复并继续开发</el-button>
            </div>
          </div>

          <!-- 版本历史 -->
          <div v-if="versions.length > 0" class="content-card cyber-panel" style="margin-top:20px;">
            <div class="panel-header">
              <div class="card-header-flex">
                <span class="card-title">版本历史 ({{ versions.length }})</span>
                <el-button v-if="versions.length >= 2" type="primary" link size="small" @click="showDiffDialog = true">差异对比</el-button>
              </div>
            </div>
            <div class="version-list">
              <div
                v-for="ver in [...versions].reverse()"
                :key="ver.id"
                class="version-item"
                :class="{ active: selectedVersion?.id === ver.id }"
                @click="selectedVersion = ver"
              >
                <div class="version-left">
                  <span class="version-num">{{ ver.versionNumber }}</span>
                  <el-tag
                    :type="ver.status === 'approved' ? 'success' : ver.status === 'rejected' ? 'danger' : ver.status === 'archived' ? 'info' : 'warning'"
                    size="small"
                  >{{ versionStatusLabel(ver.status) }}</el-tag>
                  <el-tag v-if="ver.isFinal" type="success" size="small" effect="dark">最终版本</el-tag>
                </div>
                <div class="version-right">
                  <span class="version-time">{{ formatDateTime(ver.createdAt) }}</span>
                  <span v-if="ver.aiDurationMs" class="version-duration">耗时 {{ (ver.aiDurationMs / 1000).toFixed(0) }}s</span>
                </div>
              </div>
            </div>
            <!-- 选中版本详情 -->
            <div v-if="selectedVersion" class="version-detail">
              <div class="version-detail-header">
                <span>{{ selectedVersion.versionNumber }}</span>
                <span v-if="selectedVersion.prevReviewComment" class="version-review-tag">基于上轮审核意见整改</span>
                <el-button v-if="selectedVersion.reportPath" type="primary" link size="small" @click="downloadReport(selectedVersion)">
                  下载自测报告
                </el-button>
              </div>
              <div v-if="selectedVersion.prevReviewComment" class="version-section">
                <div class="version-section-label">上轮审核意见</div>
                <div class="version-section-content review-comment">{{ selectedVersion.prevReviewComment }}</div>
              </div>
              <div class="version-section">
                <div class="version-section-label">AI 开发产出</div>
                <pre class="version-code">{{ selectedVersion.aiOutput || '无产出记录' }}</pre>
              </div>
              <!-- 摘要 -->
              <div class="version-section">
                <div class="version-section-label">完成摘要</div>
                <div class="version-section-content">{{ selectedVersion.summary || '无摘要' }}</div>
              </div>
              <div v-if="selectedVersion.gitCommitId" class="version-section">
                <div class="version-section-label">Git 信息</div>
                <div class="version-git">
                  <span>分支: {{ selectedVersion.gitBranch }}</span>
                  <span>Commit: {{ selectedVersion.gitCommitId }}</span>
                </div>
              </div>
              <!-- 自测说明 -->
              <div class="version-section">
                <div class="version-section-label">自测说明</div>
                <div v-if="selectedVersion.reportText" class="version-section-content report-text">{{ selectedVersion.reportText }}</div>
                <div v-else class="version-section-content empty-hint">暂无自测说明</div>
              </div>
              <!-- 变更文件 -->
              <div class="version-section">
                <div class="version-section-label">变更文件{{ selectedVersion.filesChanged?.length ? ` (${selectedVersion.filesChanged.length})` : '' }}</div>
                <div v-if="selectedVersion.filesChanged?.length" class="version-files">
                  <div v-for="f in selectedVersion.filesChanged" :key="f.path" class="version-file-item">
                    <el-tag size="small" :type="f.action === 'created' ? 'success' : 'warning'">{{ f.action }}</el-tag>
                    <span>{{ f.path }}</span>
                  </div>
                </div>
                <div v-else class="version-section-content empty-hint">暂无变更记录</div>
              </div>
              <!-- 测试结果 -->
              <div class="version-section">
                <div class="version-section-label">测试结果</div>
                <div v-if="selectedVersion.testResult && selectedVersion.testResult.passed !== undefined" class="version-test">
                  <el-tag :type="selectedVersion.testResult.passed ? 'success' : 'danger'" size="small">
                    {{ selectedVersion.testResult.passed ? '通过' : '未通过' }}
                  </el-tag>
                  <span v-if="selectedVersion.testResult.details">{{ selectedVersion.testResult.details }}</span>
                </div>
                <div v-else class="version-section-content empty-hint">暂无测试结果</div>
              </div>
              <!-- 页面截图 -->
              <div class="version-section">
                <div class="version-section-label">页面截图</div>
                <div v-if="selectedVersion.screenshots?.length" class="version-screenshots">
                  <el-image
                    v-for="(shot, idx) in selectedVersion.screenshots"
                    :key="shot"
                    :src="`/api/screenshots/${task.id}/${shot}`"
                    :preview-src-list="selectedVersion.screenshots.map(s => `/api/screenshots/${task.id}/${s}`)"
                    :initial-index="idx"
                    fit="cover"
                    class="version-screenshot-img"
                    preview-teleported
                  />
                </div>
                <div v-else class="version-section-content empty-hint">暂无截图</div>
              </div>
            </div>
          </div>

          <!-- AI 产出（无版本时兼容显示） -->
          <div v-if="task.aiOutput && versions.length === 0" class="content-card cyber-panel" style="margin-top:20px;">
            <div class="panel-header"><span class="card-title">AI 开发产出</span></div>
            <div class="desc-content">{{ task.aiOutput }}</div>
          </div>

          <!-- 审核记录 -->
          <div v-if="task.reviewComment || task.reviewResult" class="content-card cyber-panel" style="margin-top:20px;">
            <div class="panel-header"><span class="card-title">审核记录</span></div>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="审核结果">
                <el-tag :type="task.reviewResult === 'approved' ? 'success' : 'danger'" size="small">
                  {{ task.reviewResult === 'approved' ? '通过' : '不通过' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item v-if="task.reviewComment" label="审核意见">{{ task.reviewComment }}</el-descriptions-item>
              <el-descriptions-item v-if="task.reviewTime" label="审核时间">{{ formatDateTime(task.reviewTime) }}</el-descriptions-item>
              <el-descriptions-item v-if="task.completeTime" label="完成时间">{{ formatDateTime(task.completeTime) }}</el-descriptions-item>
              <el-descriptions-item label="返工次数">{{ task.reworkCount || 0 }}次</el-descriptions-item>
            </el-descriptions>
          </div>

          <!-- 开发记录 -->
          <div class="content-card cyber-panel" style="margin-top:20px;">
            <div class="panel-header">
              <div class="card-header-flex">
                <span class="card-title">开发记录</span>
                <el-button type="primary" link size="small" @click="showAddLog = true">+ 添加</el-button>
              </div>
            </div>
            <el-timeline v-if="task.devLog?.length">
              <el-timeline-item
                v-for="log in task.devLog"
                :key="log.id"
                :timestamp="formatDateTime(log.time)"
                placement="top"
                :type="log.autoFixed ? 'warning' : 'primary'"
              >
                <div class="log-entry">
                  <el-tag size="small" :type="getLogActionType(log.action)">{{ log.action }}</el-tag>
                  <span class="log-content">{{ log.content }}</span>
                  <el-tag v-if="log.autoFixed" size="small" type="warning" effect="dark">自动</el-tag>
                </div>
              </el-timeline-item>
            </el-timeline>
            <div v-else class="empty-log">暂无开发记录</div>
          </div>
        </el-col>

        <!-- 右侧：信息面板 -->
        <el-col :span="8">
          <!-- 开发配置 -->
          <div class="info-card cyber-panel">
            <div class="panel-header">
              <div class="card-header-flex">
                <span class="card-title">开发配置</span>
                <el-button type="primary" link size="small" @click="openDevConfig()">编辑</el-button>
              </div>
            </div>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="项目路径">
                <span v-if="task.projectPath" class="path-text">{{ task.projectPath }}</span>
                <span v-else class="empty-text">未设置</span>
              </el-descriptions-item>
              <el-descriptions-item label="Git 分支">
                <span v-if="task.gitBranch" class="branch-text">{{ task.gitBranch }}</span>
                <span v-else class="empty-text">未设置</span>
              </el-descriptions-item>
              <el-descriptions-item label="需求文件路径">
                <span v-if="task.taskPageUrl" class="path-text">{{ task.taskPageUrl }}</span>
                <span v-else class="empty-text">未设置</span>
              </el-descriptions-item>
              <el-descriptions-item label="内网单号">{{ task.sourceId }}</el-descriptions-item>
              <el-descriptions-item label="流程状态">{{ task.intranetNodeName || '-' }}</el-descriptions-item>
            </el-descriptions>
          </div>

          <!-- 需求文档（右侧摘要） -->
          <div v-if="task.reqDocName" class="info-card cyber-panel" style="margin-top:20px;">
            <div class="panel-header"><span class="card-title">需求文档</span></div>
            <div style="font-size:13px;color:#606266;margin-bottom:8px;">{{ task.reqDocName }}</div>
            <div style="display:flex;gap:8px;">
              <a v-if="proxyDocUrl" :href="proxyDocUrl" target="_blank" class="doc-link">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M9 2v4h4"/></svg>
                原文件
              </a>
            </div>
            <div v-if="task.reqDocText" style="color:#67c23a;font-size:12px;margin-top:6px;">
              已提取 {{ task.reqDocText.length }} 字
            </div>
          </div>

          <!-- 内网任务信息（只读） -->
          <div class="info-card cyber-panel" style="margin-top:20px;">
            <div class="panel-header"><span class="card-title">任务信息</span></div>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="项目">{{ task.project || '-' }}</el-descriptions-item>
              <el-descriptions-item label="客户">{{ task.customer || '-' }}</el-descriptions-item>
              <el-descriptions-item label="客户经理">{{ task.customerManager || '-' }}</el-descriptions-item>
              <el-descriptions-item label="产品">{{ task.product || '-' }}</el-descriptions-item>
              <el-descriptions-item label="模块">{{ task.module || '-' }}</el-descriptions-item>
              <el-descriptions-item label="产品经理">{{ task.productManager || '-' }}</el-descriptions-item>
              <el-descriptions-item label="研发负责人">{{ task.devLeader || '-' }}</el-descriptions-item>
              <el-descriptions-item label="督办人">{{ task.supervisor || '-' }}</el-descriptions-item>
              <el-descriptions-item label="开发人员">{{ task.developer || '-' }}</el-descriptions-item>
              <el-descriptions-item label="计划工时">{{ task.workHours || 0 }}h</el-descriptions-item>
              <el-descriptions-item label="优先级">{{ getPriorityLabel(task.priority) }}</el-descriptions-item>
              <el-descriptions-item label="任务类型">{{ task.taskType || '-' }}</el-descriptions-item>
              <el-descriptions-item label="需求/BUG">{{ getBugOrReqLabel(task.bugOrReq) }}</el-descriptions-item>
              <el-descriptions-item label="提交日期">{{ formatDateTime(task.submitTime) }}</el-descriptions-item>
              <el-descriptions-item label="截止时间">
                <span :class="{ 'overdue-text': isOverdue }">{{ formatDate(task.deadline) }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="滞留天数">{{ task.staleDays || 0 }}天</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ formatDateTime(task.createTime) }}</el-descriptions-item>
              <el-descriptions-item label="同步时间">{{ formatDateTime(task.syncTime) }}</el-descriptions-item>
              <el-descriptions-item label="标签">
                <el-tag v-for="tag in task.tags" :key="tag" size="small" style="margin-right:4px;">{{ tag }}</el-tag>
                <span v-if="!task.tags?.length">无</span>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </el-col>
      </el-row>
    </div>

    <!-- 编辑开发配置弹窗 -->
    <el-dialog v-model="showEditDevConfig" title="编辑开发配置" width="var(--dialog-md)">
      <el-form :model="devConfigForm" label-width="100px">
        <el-form-item label="项目路径">
          <el-input v-model="devConfigForm.projectPath" placeholder="如 F:\00_project\xxx" clearable />
        </el-form-item>
        <el-form-item label="Git 分支">
          <el-input v-model="devConfigForm.gitBranch" placeholder="如 feature/login" clearable />
        </el-form-item>
        <el-form-item label="需求文件路径">
          <el-input v-model="devConfigForm.taskPageUrl" placeholder="需求对应的项目文件路径，如 src/views/login/index.vue" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDevConfig = false">取消</el-button>
        <el-button type="primary" @click="handleSaveDevConfig" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑富文本字段弹窗 -->
    <el-dialog v-model="showEditField" :title="editFieldTitle" width="var(--dialog-lg)">
      <el-input
        v-model="editFieldValue"
        type="textarea"
        :rows="12"
        placeholder="支持 Markdown 格式..."
      />
      <template #footer>
        <el-button @click="showEditField = false">取消</el-button>
        <el-button type="primary" @click="handleSaveField" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加开发记录弹窗 -->
    <el-dialog v-model="showAddLog" title="添加开发记录" width="var(--dialog-sm)">
      <el-form :model="logForm" label-width="80px">
        <el-form-item label="操作类型">
          <el-select v-model="logForm.action">
            <el-option label="开发" value="开发" />
            <el-option label="修复" value="修复" />
            <el-option label="自测" value="自测" />
            <el-option label="状态变更" value="状态变更" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="记录内容">
          <el-input v-model="logForm.content" type="textarea" :rows="4" placeholder="描述开发内容..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddLog = false">取消</el-button>
        <el-button type="primary" @click="handleAddLog">确认</el-button>
      </template>
    </el-dialog>

    <!-- 版本差异对比弹窗 -->
    <el-dialog v-model="showDiffDialog" title="版本差异对比" width="var(--dialog-lg)" :close-on-click-modal="false">
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <el-select v-model="diffFromIdx" placeholder="旧版本" style="flex:1">
          <el-option v-for="(v, i) in versions" :key="v.id" :label="v.versionNumber" :value="i" />
        </el-select>
        <span style="line-height:32px;color:#909399;">→</span>
        <el-select v-model="diffToIdx" placeholder="新版本" style="flex:1">
          <el-option v-for="(v, i) in versions" :key="v.id" :label="v.versionNumber" :value="i" />
        </el-select>
      </div>
      <div v-if="diffFromIdx >= 0 && diffToIdx >= 0 && diffFromIdx !== diffToIdx" class="diff-result">
        <div class="diff-header">
          <span>{{ versions[diffFromIdx]?.versionNumber }}</span>
          <span>{{ versions[diffToIdx]?.versionNumber }}</span>
        </div>
        <div class="diff-body">
          <div v-for="(line, i) in diffLines" :key="i" class="diff-line" :class="line.type">
            <span class="diff-prefix">{{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ' }}</span>
            <span>{{ line.text }}</span>
          </div>
        </div>
      </div>
      <div v-else style="color:#909399;text-align:center;padding:20px;">请选择两个不同版本进行对比</div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { taskApi } from '@/api/task'
import { versionApi } from '@/api/version'
import type { TaskVersion } from '@/types'
import { ArrowLeft, ArrowDown, VideoPlay, CircleCheck, Upload } from '@element-plus/icons-vue'
import type { TaskStatus } from '@/types'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'

const route = useRoute()
const taskStore = useTaskStore()

const error = ref<string>('')
const saving = ref(false)
const showAddLog = ref(false)
const showEditDevConfig = ref(false)
const showEditField = ref(false)

// 需求文档编辑
const docEditing = ref(false)
const docEditText = ref('')
const docSaving = ref(false)
const extractingPdf = ref(false)
const questionReply = ref('')
const replying = ref(false)

const logForm = reactive({ action: '开发', content: '' })

const devConfigForm = reactive({
  projectPath: '',
  gitBranch: '',
  taskPageUrl: '',
})

const editFieldKey = ref('')
const editFieldValue = ref('')
const editFieldTitle = computed(() => {
  const map: Record<string, string> = {
    customDescription: '编辑自定义描述',
    requirementDoc: '编辑需求文档',
    acceptanceCriteria: '编辑验收标准',
  }
  return map[editFieldKey.value] || '编辑'
})

const task = computed(() => taskStore.currentTask!)

const proxyDocUrl = computed(() => {
  const url = task.value?.reqDocUrl || ''
  const match = url.match(/[?&]id=([^&]+)/)
  return match ? `/api/sync/req-doc?id=${match[1]}` : ''
})

const docTextLines = computed(() => {
  const text = task.value?.reqDocText || ''
  return text.split(/\s{2,}/).filter(Boolean)
})

// 版本管理
const versions = ref<TaskVersion[]>([])
const selectedVersion = ref<TaskVersion | null>(null)
const showDiffDialog = ref(false)
const diffFromIdx = ref(-1)
const diffToIdx = ref(-1)

function downloadReport(ver: TaskVersion) {
  window.open(`/api/versions/${ver.id}/report`, '_blank')
}

async function loadVersions() {
  if (!task.value) return
  try {
    const res = await versionApi.list(task.value.id)
    versions.value = res.data || []
    if (versions.value.length > 0 && !selectedVersion.value) {
      selectedVersion.value = versions.value[versions.value.length - 1]
    }
  } catch { /* ignore */ }
}

function versionStatusLabel(s: string) {
  return ({ pending_review: '待审核', approved: '已通过', rejected: '已打回', archived: '已归档' } as Record<string, string>)[s] || s
}

const diffLines = computed(() => {
  if (diffFromIdx.value < 0 || diffToIdx.value < 0) return []
  const from = versions.value[diffFromIdx.value]?.aiOutput || ''
  const to = versions.value[diffToIdx.value]?.aiOutput || ''
  return simpleDiff(from.split('\n'), to.split('\n'))
})

function simpleDiff(oldLines: string[], newLines: string[]): { type: 'same' | 'add' | 'del'; text: string }[] {
  const result: { type: 'same' | 'add' | 'del'; text: string }[] = []
  const oldSet = new Set(oldLines)
  const newSet = new Set(newLines)
  const maxLen = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i], n = newLines[i]
    if (o === n) {
      result.push({ type: 'same', text: o || '' })
    } else {
      if (o !== undefined && !newSet.has(o)) result.push({ type: 'del', text: o })
      if (n !== undefined && !oldSet.has(n)) result.push({ type: 'add', text: n })
    }
  }
  return result
}

async function handleExtractPdf() {
  if (!task.value) return
  extractingPdf.value = true
  try {
    const res = await taskApi.extractPdf(task.value.id)
    if (res.data?.reqDocText) {
      task.value.reqDocText = res.data.reqDocText
      ElMessage.success('提取成功')
    } else {
      ElMessage.warning('未提取到文字内容')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '提取失败')
  } finally {
    extractingPdf.value = false
  }
}

function startDocEdit() {
  docEditText.value = task.value?.reqDocText || ''
  docEditing.value = true
}

async function saveDocEdit() {
  if (!task.value) return
  docSaving.value = true
  try {
    await taskStore.updateTask(task.value.id, { reqDocText: docEditText.value })
    task.value.reqDocText = docEditText.value
    docEditing.value = false
    ElMessage.success('保存成功')
  } finally {
    docSaving.value = false
  }
}

async function handleReplyQuestion() {
  if (!task.value || !questionReply.value.trim()) return
  replying.value = true
  try {
    const newDesc = (task.value.customDescription || '') + '\n\n[人工回复] ' + questionReply.value.trim()
    await taskStore.updateTask(task.value.id, { customDescription: newDesc, aiQuestion: '', aiStatus: 'ai_todo' })
    task.value.customDescription = newDesc
    task.value.aiQuestion = ''
    task.value.aiStatus = 'ai_todo'
    // 重新加入 AI 待办队列
    if (!taskStore.isInTodoList(task.value.id)) {
      taskStore.toggleTodo(task.value)
    }
    questionReply.value = ''
    ElMessage.success('已回复，任务已重新加入待办队列')
  } catch {
    ElMessage.error('回复失败，请重试')
  } finally {
    replying.value = false
  }
}

const isOverdue = computed(() => {
  if (!task.value) return false
  return task.value.status !== 'completed' && new Date(task.value.deadline).getTime() < Date.now()
})

function startEdit(field: string) {
  editFieldKey.value = field
  const t = task.value as Record<string, unknown>
  editFieldValue.value = (t[field] as string) || ''
  showEditField.value = true
}

async function handleSaveField() {
  saving.value = true
  try {
    await taskStore.updateTask(task.value.id, { [editFieldKey.value]: editFieldValue.value })
    showEditField.value = false
    ElMessage.success('已保存')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

function openDevConfig() {
  devConfigForm.projectPath = task.value.projectPath || ''
  devConfigForm.gitBranch = task.value.gitBranch || ''
  devConfigForm.taskPageUrl = task.value.taskPageUrl || ''
  showEditDevConfig.value = true
}

async function handleSaveDevConfig() {
  saving.value = true
  try {
    await taskStore.updateTask(task.value.id, {
      projectPath: devConfigForm.projectPath,
      gitBranch: devConfigForm.gitBranch,
      taskPageUrl: devConfigForm.taskPageUrl,
    })
    showEditDevConfig.value = false
    ElMessage.success('开发配置已保存')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

function getStatusType(status: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
    pending: 'info', in_progress: 'warning', self_test: 'primary',
    testing: 'primary', submitted: 'success', completed: 'success', rejected: 'danger',
  }
  return map[status] || 'info'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待开发', in_progress: '开发中', self_test: '自测完成',
    testing: '测试中', submitted: '已提测', completed: '已完结', rejected: '已驳回',
  }
  return labels[status] || status
}

function getAiStatusType(aiStatus: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
    '': 'info', ai_todo: 'warning', ai_rework: 'danger', ai_dev: 'primary', ai_review: 'primary', ai_done: 'success', ai_question: 'warning',
  }
  return map[aiStatus] || 'info'
}

function getAiStatusLabel(aiStatus: string): string {
  const map: Record<string, string> = {
    '': '-', ai_todo: 'AI待办', ai_rework: '待返工', ai_dev: '开发中', ai_review: '待审核', ai_done: 'AI完成', ai_question: '待回复',
  }
  return map[aiStatus] || aiStatus
}

function getPriorityType(priority: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
    urgent: 'danger', high: 'warning', medium: 'info', low: 'success',
  }
  return map[priority] || 'info'
}

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = { urgent: '紧急', high: '高', medium: '中', low: '低' }
  return labels[priority] || priority
}

function getBugOrReqLabel(val: string): string {
  const map: Record<string, string> = { requirement: '需求', bug: 'BUG', xuqiu: '需求', sheji: '设计', wendang: '文档' }
  return map[val] || val || '-'
}

function getLogActionType(action: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
    '开发': 'primary', '修复': 'warning', '自测': 'success', '状态变更': 'info',
  }
  return map[action] || 'info'
}

function formatDate(date: string): string { return dayjs(date).format('YYYY-MM-DD') }
function formatDateTime(date: string): string { return date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-' }

async function handleStartDev() {
  try {
    await taskStore.updateTaskStatus(task.value.id, 'in_progress' as TaskStatus)
    ElMessage.success('已开始开发')
  } catch {
    ElMessage.error('操作失败，请重试')
  }
}

async function handleSelfTest() {
  try {
    await taskStore.updateTaskStatus(task.value.id, 'self_test' as TaskStatus)
    ElMessage.success('已标记自测完成')
  } catch {
    ElMessage.error('操作失败，请重试')
  }
}

async function handleSubmit() {
  try {
    await taskStore.updateTaskStatus(task.value.id, 'submitted' as TaskStatus)
    ElMessage.success('已提交测试')
  } catch {
    ElMessage.error('操作失败，请重试')
  }
}

async function handleStatusCommand(command: string) {
  try {
    await taskStore.updateTaskStatus(task.value.id, command as TaskStatus)
    ElMessage.success('状态已更新')
  } catch {
    ElMessage.error('操作失败，请重试')
  }
}

async function handleAddLog() {
  if (!logForm.content) { ElMessage.warning('请输入记录内容'); return }
  try {
    await taskStore.addDevLog(task.value.id, { action: logForm.action, content: logForm.content })
    showAddLog.value = false
    logForm.content = ''
    ElMessage.success('记录已添加')
  } catch { ElMessage.error('添加失败') }
}

onMounted(async () => {
  const id = route.params.id as string
  if (id) {
    try {
      await taskStore.fetchTaskById(id)
      await loadVersions()
    } catch {
      error.value = '加载任务失败，请检查网络或刷新重试'
    }
  }
})
</script>

<style lang="scss" scoped>
.task-detail-page { max-width: var(--container-lg); margin: 0 auto; }
.error-state {
  text-align: center; padding: 80px 20px; color: #8c8ca1;
  p { font-size: 14px; margin-bottom: 16px; }
}

.detail-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 24px; background: transparent; padding: 20px 24px;
  border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.header-left {
  display: flex; gap: 16px; align-items: flex-start;
  .title-area h2 { margin: 0 0 8px 0; font-size: 22px; color: var(--cyber-text-primary); }
  .meta-tags { display: flex; gap: 8px; align-items: center; }
  .meta-id { color: var(--cyber-text-secondary); font-size: 13px; }
  .meta-hours { color: #e6a23c; font-size: 13px; font-weight: 600; }
}
.header-right { display: flex; gap: 10px; flex-shrink: 0; }

.content-card, .info-card {
  .panel-header { padding: 12px 20px; }
  .card-title { font-weight: 600; font-size: 15px; }
}
.card-header-flex { display: flex; justify-content: space-between; align-items: center; }

.desc-section { margin-bottom: 8px; }
.desc-label { font-size: 13px; color: var(--cyber-text-secondary); margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
.desc-content {
  line-height: 1.8; color: var(--cyber-text-primary); font-size: 14px;
  &.empty { color: #c0c4cc; font-style: italic; }
}

.question-card { border-color: #FF7D00 !important; }
.question-label { font-size: 13px; color: var(--cyber-text-secondary); margin-bottom: 6px; }
.question-text { line-height: 1.8; color: var(--cyber-text-primary); font-size: 14px; padding: 10px 14px; background: rgba(255,125,0,0.08); border-radius: 6px; border-left: 3px solid #FF7D00; }

.path-text { font-family: Consolas, monospace; font-size: 13px; color: var(--cyber-cyan); word-break: break-all; }
.branch-text { font-family: Consolas, monospace; font-size: 13px; color: var(--cyber-purple); }
.empty-text { color: #c0c4cc; font-style: italic; }

.overdue-text { color: #f56c6c; font-weight: 600; }

.doc-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--cyber-cyan);
  font-size: 13px;
  text-decoration: none;
  word-break: break-all;
  &:hover { color: #66b1ff; text-decoration: underline; }
}
.doc-text-content {
  max-height: 400px;
  overflow-y: auto;
  padding: 12px;
  background: rgba(10,16,31,0.3);
  border: 1px solid var(--cyber-glass-border);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--cyber-text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}
.doc-text-line { margin-bottom: 2px; }
.doc-text-empty { color: var(--cyber-text-secondary); font-size: 13px; }

// 版本历史
.version-list { display: flex; flex-direction: column; gap: 4px; }
.version-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid transparent; transition: all 0.2s;
  &:hover { background: rgba(10,16,31,0.3); }
  &.active { border-color: #00E5FF; background: rgba(0,229,255,0.08); }
}
.version-left { display: flex; align-items: center; gap: 8px; }
.version-right { display: flex; align-items: center; gap: 8px; }
.version-num { font-weight: 700; font-size: 14px; color: var(--cyber-text-primary); min-width: 36px; }
.version-time { font-size: 12px; color: var(--cyber-text-secondary); }
.version-duration { font-size: 11px; color: #67c23a; }
.version-detail {
  margin-top: 16px; padding: 16px; background: rgba(10,16,31,0.3);
  border: 1px solid var(--cyber-glass-border); border-radius: 8px;
}
.version-detail-header {
  display: flex; align-items: center; gap: 8px;
  font-weight: 700; font-size: 16px; margin-bottom: 12px; color: var(--cyber-text-primary);
}
.version-review-tag {
  font-size: 11px; font-weight: 400; color: #e6a23c;
  background: rgba(255,125,0,0.08); padding: 2px 8px; border-radius: 4px;
}
.version-section { margin-bottom: 12px; }
.version-section-label { font-size: 12px; color: var(--cyber-text-secondary); margin-bottom: 4px; }
.version-section-content { font-size: 13px; color: var(--cyber-text-secondary); }
.empty-hint { color: #606266; font-style: italic; font-size: 12px; }
.report-text { white-space: pre-wrap; line-height: 1.6; }
.review-comment { color: #e6a23c; font-style: italic; }
.version-code {
  background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px;
  font-size: 12px; line-height: 1.6; overflow-x: auto; white-space: pre-wrap;
  max-height: 400px; overflow-y: auto;
}
.version-git { display: flex; gap: 16px; font-size: 12px; color: var(--cyber-purple); }

.version-files { display: flex; flex-direction: column; gap: 4px; }
.version-file-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.version-test { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.version-screenshots { display: flex; gap: 8px; flex-wrap: wrap; }
.version-screenshot-img { width: 200px; height: 140px; border-radius: 6px; cursor: pointer; }

// 差异对比
.diff-header { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 8px; }
.diff-body { font-family: monospace; font-size: 12px; line-height: 1.6; max-height: 500px; overflow-y: auto; }
.diff-line { padding: 1px 8px; }
.diff-prefix { display: inline-block; width: 16px; font-weight: 700; }
.diff-line.same { color: var(--cyber-text-secondary); }
.diff-line.add { background: rgba(0,229,255,0.06); color: #00E5FF; }
.diff-line.del { background: #fef0f0; color: #f56c6c; }
.log-entry { display: flex; align-items: center; gap: 8px;
  .log-content { font-size: 13px; color: var(--cyber-text-secondary); }
}
.empty-log { text-align: center; color: #c0c4cc; padding: 20px; }
</style>
