<template>
  <div class="cyber-panel sync-config-panel">
    <div class="panel-header">
      <span class="card-title">同步配置</span>
      <el-button type="primary" size="small" style="margin-left: auto;" @click="handleSave" :loading="saving">保存</el-button>
    </div>

    <div class="config-body">
      <el-form :model="syncStore.config" label-width="100px" label-position="left">
        <el-form-item label="内网地址">
          <el-input v-model="syncStore.config.intranetUrl" placeholder="https://intranet.company.com" />
        </el-form-item>
        <el-form-item label="自动同步">
          <el-switch v-model="syncStore.config.autoSync" active-text="开启" inactive-text="关闭" />
        </el-form-item>
        <el-form-item label="同步间隔" v-if="syncStore.config.autoSync">
          <el-input-number v-model="syncStore.config.syncInterval" :min="5" :max="1440" :step="5" />
          <span class="form-unit">分钟</span>
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
      intranetUrl: syncStore.config.intranetUrl,
      autoSync: syncStore.config.autoSync,
      syncInterval: syncStore.config.syncInterval,
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
.sync-config-panel {
  .panel-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--cyber-glass-border);
    display: flex;
    align-items: center;
  }
  .card-title { font-weight: 600; font-size: 15px; }
  .config-body { padding: 16px 20px; }
  .form-unit { margin-left: 8px; font-size: 13px; color: var(--cyber-text-secondary); }
}
</style>
