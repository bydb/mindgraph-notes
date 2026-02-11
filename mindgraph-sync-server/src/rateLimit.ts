interface RateLimitEntry {
  count: number
  resetAt: number
}

const ipLimits = new Map<string, RateLimitEntry>()
const vaultLimits = new Map<string, RateLimitEntry>()

const IP_LIMIT = 5000
const VAULT_LIMIT = 10000
const WINDOW_MS = 60 * 1000

function checkLimit(map: Map<string, RateLimitEntry>, key: string, limit: number): boolean {
  const now = Date.now()
  const entry = map.get(key)

  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }

  if (entry.count >= limit) {
    return false
  }

  entry.count++
  return true
}

export function checkRateLimit(ip: string, vaultId?: string): boolean {
  if (!checkLimit(ipLimits, ip, IP_LIMIT)) {
    return false
  }
  if (vaultId && !checkLimit(vaultLimits, vaultId, VAULT_LIMIT)) {
    return false
  }
  return true
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of ipLimits) {
    if (now > entry.resetAt) ipLimits.delete(key)
  }
  for (const [key, entry] of vaultLimits) {
    if (now > entry.resetAt) vaultLimits.delete(key)
  }
}, 5 * 60 * 1000)
