import { ref, watch, onUnmounted } from 'vue'

type WsHandler = (event: string, taskId: string, data: any) => void

const ws = ref<WebSocket | null>(null)
const connected = ref(false)
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function getWsUrl() {
  const loc = window.location
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${loc.hostname}:3201/ws`
}

function connect(handler: WsHandler) {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) return

  try {
    const socket = new WebSocket(getWsUrl())

    socket.onopen = () => {
      connected.value = true
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    }

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        handler(msg.event, msg.taskId, msg.data)
      } catch { /* ignore */ }
    }

    socket.onclose = () => {
      connected.value = false
      ws.value = null
      reconnectTimer = setTimeout(() => connect(handler), 3000)
    }

    socket.onerror = () => {
      socket.close()
    }

    ws.value = socket
  } catch {
    reconnectTimer = setTimeout(() => connect(handler), 3000)
  }
}

function subscribe(taskIds: string[]) {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({ type: 'subscribe', taskIds }))
  }
}

function disconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws.value) { ws.value.close(); ws.value = null }
  connected.value = false
}

export function useChatWs(handler: WsHandler) {
  const subscribedIds = ref<string[]>([])

  function startWs() {
    connect(handler)
  }

  function updateSubscription(taskIds: string[]) {
    subscribedIds.value = taskIds
    if (connected.value) subscribe(taskIds)
  }

  watch(connected, (ok) => {
    if (ok && subscribedIds.value.length > 0) subscribe(subscribedIds.value)
  })

  onUnmounted(() => {
    disconnect()
  })

  return { connected, startWs, updateSubscription, disconnect }
}
