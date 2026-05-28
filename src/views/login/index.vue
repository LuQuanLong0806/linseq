<template>
  <div class="login-page">
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>
    <div class="login-container">
      <div class="login-card">
        <div class="card-glow"></div>
        <div class="card-header">
          <div class="logo-icon">
            <svg viewBox="0 0 40 40" fill="none">
              <path d="M20 4L36 12V28L20 36L4 28V12L20 4Z" stroke="#00E5FF" stroke-width="1.5" fill="rgba(0,229,255,0.06)" />
              <path d="M20 10L30 15V25L20 30L10 25V15L20 10Z" stroke="#9D5CFF" stroke-width="1" fill="rgba(157,92,255,0.04)" />
              <circle cx="20" cy="20" r="3" fill="#00E5FF" />
            </svg>
          </div>
          <h1 class="login-title">灵序 LineSequence</h1>
          <p class="login-subtitle">任务自动化管理平台</p>
        </div>
        <div class="card-body">
          <div class="input-group">
            <label class="input-label">内网账号</label>
            <div class="input-wrapper" :class="{ focused: focusState === 'username', hasValue: form.username }">
              <el-icon size="16"><User /></el-icon>
              <input v-model="form.username" type="text" placeholder="输入内网用户名" autocomplete="username"
                @focus="focusState = 'username'" @blur="focusState = ''" @keyup.enter="$refs.pwdInput?.focus()" />
            </div>
          </div>
          <div class="input-group">
            <label class="input-label">密码</label>
            <div class="input-wrapper" :class="{ focused: focusState === 'password', hasValue: form.password }">
              <el-icon size="16"><Lock /></el-icon>
              <input ref="pwdInput" v-model="form.password" type="password" placeholder="输入内网密码"
                autocomplete="current-password" show-password
                @focus="focusState = 'password'" @blur="focusState = ''" @keyup.enter="handleLogin" />
            </div>
          </div>
          <button class="login-btn" :class="{ loading }" :disabled="loading" @click="handleLogin">
            <span v-if="!loading">登录</span>
            <span v-else class="btn-loading">
              <svg class="spin" viewBox="0 0 24 24" width="18" height="18">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="60" stroke-linecap="round" />
              </svg>
              验证中...
            </span>
          </button>
        </div>
        <div class="card-footer">
          <span>登录即注册 · 使用内网凭据自动创建账号</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { User, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const bgCanvas = ref<HTMLCanvasElement>()
const focusState = ref('')
const loading = ref(false)
const form = reactive({ username: '', password: '' })

function handleLogin() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  userStore.login(form.username, form.password)
    .then(() => {
      ElMessage.success(`欢迎回来，${userStore.currentUser?.displayName}`)
      router.replace((route.query.redirect as string) || '/dashboard')
    })
    .catch(() => {
      ElMessage.error('登录失败，请检查用户名密码')
    })
    .finally(() => {
      loading.value = false
    })
}

onMounted(() => {
  initBgCanvas()
})

function initBgCanvas() {
  const canvas = bgCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = []
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.5 + 0.1,
    })
  }

  function draw() {
    ctx!.fillStyle = '#0A101F'
    ctx!.fillRect(0, 0, canvas!.width, canvas!.height)
    // grid
    ctx!.strokeStyle = 'rgba(0,229,255,0.03)'
    ctx!.lineWidth = 0.5
    const gs = 60
    for (let x = 0; x < canvas!.width; x += gs) { ctx!.beginPath(); ctx!.moveTo(x, 0); ctx!.lineTo(x, canvas!.height); ctx!.stroke() }
    for (let y = 0; y < canvas!.height; y += gs) { ctx!.beginPath(); ctx!.moveTo(0, y); ctx!.lineTo(canvas!.width, y); ctx!.stroke() }
    // particles
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy
      if (p.x < 0 || p.x > canvas!.width) p.vx *= -1
      if (p.y < 0 || p.y > canvas!.height) p.vy *= -1
      ctx!.beginPath()
      ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx!.fillStyle = `rgba(0,229,255,${p.alpha})`
      ctx!.fill()
    }
    // connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 120) {
          ctx!.beginPath()
          ctx!.moveTo(particles[i].x, particles[i].y)
          ctx!.lineTo(particles[j].x, particles[j].y)
          ctx!.strokeStyle = `rgba(0,229,255,${0.08 * (1 - dist / 120)})`
          ctx!.stroke()
        }
      }
    }
    requestAnimationFrame(draw)
  }
  draw()
}
</script>

<style lang="scss" scoped>
.login-page {
  position: fixed; inset: 0; overflow: hidden;
}
.bg-canvas {
  position: absolute; inset: 0; z-index: 0;
}
.login-container {
  position: relative; z-index: 1; display: flex; align-items: center; justify-content: center;
  min-height: 100vh; padding: 20px;
}
.login-card {
  position: relative; width: 400px; border-radius: 16px; overflow: hidden;
  background: rgba(10,16,31,0.85); border: 1px solid rgba(0,229,255,0.12);
  backdrop-filter: blur(20px); padding: 40px 36px 32px;
  animation: cardIn 0.6s ease-out;
}
.card-glow {
  position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; pointer-events: none;
  background: conic-gradient(from 0deg, transparent, rgba(0,229,255,0.06), transparent, rgba(157,92,255,0.04), transparent);
  animation: glowSpin 8s linear infinite;
}
@keyframes glowSpin { to { transform: rotate(360deg); } }
@keyframes cardIn { from { opacity: 0; transform: translateY(30px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

.card-header {
  text-align: center; margin-bottom: 32px; position: relative;
}
.logo-icon {
  width: 56px; height: 56px; margin: 0 auto 16px;
  svg { width: 100%; height: 100%; filter: drop-shadow(0 0 12px rgba(0,229,255,0.3)); }
}
.login-title {
  font-size: 22px; font-weight: 700; color: #E8F0FF; margin: 0 0 6px;
  letter-spacing: 2px;
}
.login-subtitle {
  font-size: 13px; color: rgba(140,140,161,0.7); margin: 0;
}

.card-body { position: relative; }
.input-group { margin-bottom: 20px; }
.input-label {
  display: block; font-size: 12px; color: rgba(0,229,255,0.6); margin-bottom: 8px;
  letter-spacing: 1px; text-transform: uppercase;
}
.input-wrapper {
  display: flex; align-items: center; gap: 10px;
  background: rgba(0,229,255,0.04); border: 1px solid rgba(0,229,255,0.1);
  border-radius: 8px; padding: 0 14px; height: 44px;
  transition: all 0.3s;
  :deep(.el-icon) { color: rgba(140,140,161,0.5); flex-shrink: 0; }
  input {
    flex: 1; background: none; border: none; outline: none; color: #E8F0FF;
    font-size: 14px; height: 100%; &::placeholder { color: rgba(140,140,161,0.4); }
  }
  &.focused {
    border-color: rgba(0,229,255,0.4);
    box-shadow: 0 0 16px rgba(0,229,255,0.08);
    :deep(.el-icon) { color: #00E5FF; }
  }
}

.login-btn {
  width: 100%; height: 46px; border: none; border-radius: 8px; cursor: pointer;
  background: linear-gradient(135deg, rgba(0,229,255,0.15), rgba(157,92,255,0.15));
  border: 1px solid rgba(0,229,255,0.25);
  color: #00E5FF; font-size: 15px; font-weight: 600; letter-spacing: 2px;
  transition: all 0.3s; position: relative; overflow: hidden;
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(0,229,255,0.25), rgba(157,92,255,0.25));
    box-shadow: 0 0 30px rgba(0,229,255,0.15); transform: translateY(-1px);
  }
  &:active:not(:disabled) { transform: translateY(0); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-loading { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .spin { animation: spin 1s linear infinite; }
}
@keyframes spin { to { transform: rotate(360deg); } }

.card-footer {
  text-align: center; margin-top: 24px; position: relative;
  span { font-size: 11px; color: rgba(140,140,161,0.4); }
}
</style>
