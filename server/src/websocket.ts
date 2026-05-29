import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'

interface ClientInfo {
  ws: WebSocket
  taskIds: Set<string>
}

const clients = new Map<WebSocket, ClientInfo>()

let wss: WebSocketServer | null = null

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    const info: ClientInfo = { ws, taskIds: new Set() }
    clients.set(ws, info)

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'subscribe' && Array.isArray(msg.taskIds)) {
          info.taskIds = new Set(msg.taskIds as string[])
        }
      } catch { /* ignore malformed messages */ }
    })

    ws.on('close', () => {
      clients.delete(ws)
    })
  })

  console.log('  WebSocket server ready at /ws')
}

/** 向订阅了该 taskId 的所有客户端推送消息。taskId 为 '*' 时广播给所有客户端 */
export function broadcastToTask(taskId: string, event: string, data: any) {
  const payload = JSON.stringify({ event, taskId, data, time: new Date().toISOString() })
  for (const [, info] of clients) {
    if ((taskId === '*' || info.taskIds.has(taskId)) && info.ws.readyState === WebSocket.OPEN) {
      info.ws.send(payload)
    }
  }
}
