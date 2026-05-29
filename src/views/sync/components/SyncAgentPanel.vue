<template>
  <div class="cyber-panel sync-agent-panel">
    <div class="panel-header">
      <span class="card-title">Agent 唤醒配置</span>
      <el-button type="primary" size="small" style="margin-left: auto;" @click="handleSave" :loading="saving">保存</el-button>
    </div>

    <div class="config-body">
      <el-form :model="syncStore.config" label-width="100px" label-position="left">
        <el-form-item label="唤醒地址">
          <el-input v-model="syncStore.config.webhookUrl" placeholder="http://localhost:50439/v1/chat/completions" clearable />
          <div class="form-hint">OpenClaw Gateway 的 Chat API 地址，发送补充说明时自动 POST 唤醒 Agent</div>
        </el-form-item>
        <el-form-item label="认证 Token" v-if="syncStore.config.webhookUrl">
          <el-input v-model="syncStore.config.openclawToken" placeholder="gateway.auth.token" show-password clearable />
          <div class="form-hint">~/.qclaw/openclaw.json → gateway.auth.token</div>
        </el-form-item>
        <el-form-item label="目标 Agent" v-if="syncStore.config.webhookUrl">
          <el-select v-model="syncStore.config.agentTarget" placeholder="选择 Agent" style="width: 100%">
            <el-option label="灵序 LINSEQ (默认)" value="agent-209e563a" />
            <el-option label="QClaw" value="main" />
            <el-option label="AI工程师" value="ua58rsb93veqtxl7" />
            <el-option label="Python全栈" value="tfxjjhfnjialcuju" />
            <el-option label="Unity架构师" value="jwag9yx1mrcclqzo" />
            <el-option label="游戏设计师" value="uafru5gofdt644lm" />
            <el-option label="小说创作专家" value="ds4ygtfdv3z7mmxn" />
          </el-select>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSyncStore } from '@/stores/sync'
import { ElMessage } from 'element-plus'

const syncStore = useSyncStore()
const saving = ref(false)

async function handleSave() {
  saving.value = true
  try {
    await syncStore.updateConfig({
      webhookUrl: syncStore.config.webhookUrl,
      openclawToken: syncStore.config.openclawToken,
      agentTarget: syncStore.config.agentTarget,
    })
    ElMessage.success('配置已保存')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.sync-agent-panel {
  .panel-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--cyber-glass-border);
    display: flex;
    align-items: center;
  }
  .card-title { font-weight: 600; font-size: 15px; }
  .config-body { padding: 16px 20px; }
  .form-hint { font-size: 11px; color: var(--cyber-text-muted); margin-top: 4px; line-height: 1.4; }
}
</style>
