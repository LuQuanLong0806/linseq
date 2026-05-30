import { ref } from 'vue'
import { useDesktop } from './useDesktop'

const unreadCount = ref(0)

let audioCtx: AudioContext | null = null
function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

function playTone(freq: number, duration: number, volume = 0.2) {
  try {
    const ctx = getAudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch { /* ignore */ }
}

type NotifyType = 'plan' | 'completion' | 'question' | 'progress' | 'text'

const sounds: Record<NotifyType, () => void> = {
  plan: () => { playTone(800, 0.15); setTimeout(() => playTone(1000, 0.2), 160) },
  completion: () => { playTone(800, 0.15); setTimeout(() => playTone(1000, 0.2), 160) },
  question: () => { playTone(900, 0.1); setTimeout(() => playTone(900, 0.1), 120); setTimeout(() => playTone(900, 0.15), 240) },
  progress: () => {},
  text: () => { playTone(800, 0.15) },
}

export function useNotification() {
  const { sendNotification } = useDesktop()

  function notify(type: NotifyType, content: string, panelVisible: boolean) {
    // 面板可见时不打扰
    if (panelVisible) return
    unreadCount.value++
    sounds[type]?.()
    // 桌面通知
    const prefix: Record<string, string> = { plan: 'Agent 计划', completion: '任务完成', question: 'Agent 提问', progress: '进度更新', text: '新消息' }
    sendNotification(prefix[type] || '新消息', content.slice(0, 80))
  }

  function clearUnread() {
    unreadCount.value = 0
  }

  return { unreadCount, notify, clearUnread }
}
