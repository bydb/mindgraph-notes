import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { initDatabase, registerVault, getManifest, storeFile, getFile, deleteFile, closeDatabase } from './storage'
import { checkRateLimit } from './rateLimit'

const PORT = parseInt(process.env.PORT || '8080', 10)
const HOST = process.env.HOST || '0.0.0.0'

// Track connected clients by vault ID
const vaultClients = new Map<string, Set<WebSocket>>()

interface ClientMessage {
  type: string
  vaultId?: string
  path?: string
  originalPath?: string
  iv?: string
  tag?: string
  data?: string
  hash?: string
  size?: number
  modifiedAt?: number
}

function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

function sendJson(ws: WebSocket, data: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

function notifyOtherClients(vaultId: string, sender: WebSocket, event: string, filePath: string): void {
  const clients = vaultClients.get(vaultId)
  if (!clients) return
  for (const client of clients) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      sendJson(client, { type: 'notify', event, path: filePath })
    }
  }
}

function handleMessage(ws: WebSocket, ip: string, raw: string): void {
  let msg: ClientMessage
  try {
    msg = JSON.parse(raw)
  } catch {
    sendJson(ws, { type: 'error', message: 'Invalid JSON' })
    return
  }

  if (!msg.type) {
    sendJson(ws, { type: 'error', message: 'Missing message type' })
    return
  }

  // Rate limiting
  if (!checkRateLimit(ip, msg.vaultId)) {
    sendJson(ws, { type: 'error', message: 'Rate limit exceeded' })
    return
  }

  switch (msg.type) {
    case 'register': {
      if (!msg.vaultId) {
        sendJson(ws, { type: 'error', message: 'Missing vaultId' })
        return
      }
      registerVault(msg.vaultId)

      // Track client
      if (!vaultClients.has(msg.vaultId)) {
        vaultClients.set(msg.vaultId, new Set())
      }
      vaultClients.get(msg.vaultId)!.add(ws)

      // Store vaultId on the socket for cleanup
      ;(ws as WebSocket & { vaultId?: string }).vaultId = msg.vaultId

      sendJson(ws, { type: 'registered', vaultId: msg.vaultId })
      console.log(`[Server] Vault registered: ${msg.vaultId.slice(0, 12)}...`)
      break
    }

    case 'get-manifest': {
      if (!msg.vaultId) {
        sendJson(ws, { type: 'error', message: 'Missing vaultId' })
        return
      }
      const files = getManifest(msg.vaultId)
      sendJson(ws, { type: 'manifest', files })
      break
    }

    case 'upload': {
      if (!msg.vaultId || !msg.path || !msg.iv || !msg.tag || !msg.data) {
        sendJson(ws, { type: 'error', message: 'Missing upload fields' })
        return
      }

      try {
        const iv = Buffer.from(msg.iv, 'base64')
        const tag = Buffer.from(msg.tag, 'base64')
        const data = Buffer.from(msg.data, 'base64')

        storeFile(
          msg.vaultId,
          msg.path,
          iv,
          tag,
          data,
          msg.hash || '',
          msg.size || data.length,
          msg.modifiedAt || Math.floor(Date.now() / 1000),
          msg.originalPath || msg.path
        )

        sendJson(ws, { type: 'ack', path: msg.path })
        notifyOtherClients(msg.vaultId, ws, 'file-changed', msg.path)
      } catch (err) {
        sendJson(ws, {
          type: 'error',
          message: err instanceof Error ? err.message : 'Upload failed'
        })
      }
      break
    }

    case 'download': {
      if (!msg.vaultId || !msg.path) {
        sendJson(ws, { type: 'error', message: 'Missing download fields' })
        return
      }

      const file = getFile(msg.vaultId, msg.path)
      if (!file) {
        sendJson(ws, { type: 'error', message: 'File not found' })
        return
      }

      sendJson(ws, {
        type: 'file-data',
        path: msg.path,
        iv: file.iv.toString('base64'),
        tag: file.authTag.toString('base64'),
        data: file.encryptedData.toString('base64')
      })
      break
    }

    case 'delete': {
      if (!msg.vaultId || !msg.path) {
        sendJson(ws, { type: 'error', message: 'Missing delete fields' })
        return
      }
      deleteFile(msg.vaultId, msg.path)
      sendJson(ws, { type: 'ack', path: msg.path })
      notifyOtherClients(msg.vaultId, ws, 'file-deleted', msg.path)
      break
    }

    default:
      sendJson(ws, { type: 'error', message: `Unknown message type: ${msg.type}` })
  }
}

// Initialize
initDatabase()

// HTTP server for health check
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

// WebSocket server
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws, req) => {
  const ip = getClientIp(req)
  console.log(`[Server] Client connected from ${ip}`)

  ws.on('message', (data) => {
    handleMessage(ws, ip, data.toString())
  })

  ws.on('close', () => {
    // Remove from vault client tracking
    const vaultId = (ws as WebSocket & { vaultId?: string }).vaultId
    if (vaultId) {
      const clients = vaultClients.get(vaultId)
      if (clients) {
        clients.delete(ws)
        if (clients.size === 0) {
          vaultClients.delete(vaultId)
        }
      }
    }
    console.log(`[Server] Client disconnected from ${ip}`)
  })

  ws.on('error', (err) => {
    console.error(`[Server] WebSocket error from ${ip}:`, err.message)
  })
})

httpServer.listen(PORT, HOST, () => {
  console.log(`[Server] MindGraph Sync Relay running on ${HOST}:${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] Shutting down...')
  wss.close()
  httpServer.close()
  closeDatabase()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('[Server] Shutting down...')
  wss.close()
  httpServer.close()
  closeDatabase()
  process.exit(0)
})
