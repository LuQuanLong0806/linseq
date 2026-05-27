<template>
  <div
    class="task-portal"
    :class="[variant, { 'portal-hover': isHovering, 'portal-active': isHovering }]"
    @dragover.prevent="isHovering = true"
    @dragleave="isHovering = false"
    @drop.prevent="handleDrop"
  >
    <div class="portal-core">
      <div class="portal-ring ring-1"></div>
      <div class="portal-ring ring-2"></div>
      <div class="portal-ring ring-3"></div>
      <div class="portal-center"></div>
    </div>
    <span class="portal-label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Task } from '@/types'

const props = withDefaults(defineProps<{
  variant: 'teleport' | 'sphere' | 'vortex' | 'wormhole'
  tasks?: Task[]
}>(), { tasks: () => [] })

const emit = defineEmits<{ drop: [task: Task] }>()
const isHovering = ref(false)

const labels: Record<string, string> = {
  teleport: '传送门', sphere: '能量球', vortex: '数据涡旋', wormhole: '虫洞',
}
const label = labels[props.variant] || '传送门'

function handleDrop(e: DragEvent) {
  isHovering.value = false
  const data = e.dataTransfer?.getData('application/json')
  if (!data) return
  try {
    const task = JSON.parse(data) as Task
    emit('drop', task)
  } catch { /* ignore */ }
}
</script>

<style lang="scss" scoped>
.task-portal {
  position: relative;
  width: 120px; height: 120px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: default; user-select: none;
}
.portal-core {
  position: relative; width: 90px; height: 90px;
  display: flex; align-items: center; justify-content: center;
}
.portal-ring {
  position: absolute; border-radius: 50%;
  border: 2px solid rgba(0,229,255,0.3);
  animation: portalSpin 6s linear infinite;
}
.ring-1 { inset: 0; border-color: rgba(0,229,255,0.4); }
.ring-2 { inset: 10px; border-color: rgba(157,92,255,0.35); animation-duration: 4s; animation-direction: reverse; }
.ring-3 { inset: 20px; border-color: rgba(255,125,0,0.3); animation-duration: 3s; }
.portal-center {
  width: 30px; height: 30px; border-radius: 50%;
  background: radial-gradient(circle, rgba(0,229,255,0.6), rgba(157,92,255,0.3), transparent);
  box-shadow: 0 0 20px rgba(0,229,255,0.4), 0 0 40px rgba(157,92,255,0.2);
  animation: portalPulse 2s ease-in-out infinite;
}
.portal-label {
  margin-top: 8px; font-size: 11px; color: rgba(0,229,255,0.7);
  letter-spacing: 2px; text-transform: uppercase;
}
@keyframes portalSpin { to { transform: rotate(360deg); } }
@keyframes portalPulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.15); opacity: 1; }
}

.portal-hover {
  .portal-center {
    transform: scale(1.3);
    box-shadow: 0 0 40px rgba(0,229,255,0.7), 0 0 80px rgba(157,92,255,0.4);
  }
  .portal-ring { border-width: 3px; }
  .portal-label { color: #00E5FF; text-shadow: 0 0 8px rgba(0,229,255,0.5); }
}

// Variant overrides
.teleport .ring-1 { border-style: dashed; }
.sphere .portal-center { background: radial-gradient(circle, rgba(255,255,255,0.8), rgba(0,229,255,0.5), transparent); }
.vortex .ring-2 { border-style: dotted; animation-duration: 2s; }
.wormhole {
  .portal-center { background: radial-gradient(circle, rgba(157,92,255,0.8), rgba(0,229,255,0.3), transparent); }
  .ring-1 { border-color: rgba(157,92,255,0.5); }
  .ring-3 { border-color: rgba(255,125,0,0.4); }
}
</style>
