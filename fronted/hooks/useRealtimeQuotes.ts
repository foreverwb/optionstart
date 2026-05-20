import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { RealtimeQuote } from '@/types'


interface HookState {
  connected: boolean
  latency: number
}

type ServerMessage =
  | { type: 'quote'; quote: unknown }
  | { type: 'subscribed'; codes: unknown }
  | { type: 'ping'; ts?: unknown }
  | { type: 'pong'; ts?: unknown }
  | { type: 'error'; message?: unknown }


const DEFAULT_WS_URL = 'ws://127.0.0.1:8000/ws/quotes'
const MAX_CODES = 400

function isUSMarketOpen(): boolean {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  if (day === 0 || day === 6) return false
  const minutes = et.getHours() * 60 + et.getMinutes()
  return minutes >= 570 && minutes < 960
}

function msUntilNextMarketEvent(): number {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  const minutes = et.getHours() * 60 + et.getMinutes()

  if (isUSMarketOpen()) {
    return (960 - minutes) * 60_000
  }

  if (day >= 1 && day <= 5 && minutes < 570) {
    return (570 - minutes) * 60_000
  }

  let daysUntilMonday = 0
  if (day === 5 && minutes >= 960) daysUntilMonday = 3
  else if (day === 6) daysUntilMonday = 2
  else if (day === 0) daysUntilMonday = 1
  else daysUntilMonday = 1

  const nextOpen = new Date(et)
  nextOpen.setDate(nextOpen.getDate() + daysUntilMonday)
  nextOpen.setHours(9, 30, 0, 0)
  return Math.max(60_000, nextOpen.getTime() - et.getTime())
}


function wsUrl(): string {
  return import.meta.env.VITE_QUOTES_WS_URL ?? DEFAULT_WS_URL
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalVolatility(value: unknown): number | undefined {
  const numberValue = optionalNumber(value)
  if (numberValue === undefined || numberValue <= 0) return undefined
  return numberValue > 3 ? numberValue / 100 : numberValue
}

function parseQuote(value: unknown): RealtimeQuote | null {
  if (!isRecord(value) || typeof value.code !== 'string') return null
  return {
    code: value.code,
    lastPrice: optionalNumber(value.lastPrice),
    bidPrice: optionalNumber(value.bidPrice),
    askPrice: optionalNumber(value.askPrice),
    volume: optionalNumber(value.volume),
    impliedVolatility: optionalVolatility(value.impliedVolatility),
    delta: optionalNumber(value.delta),
    gamma: optionalNumber(value.gamma),
    vega: optionalNumber(value.vega),
    theta: optionalNumber(value.theta),
    rho: optionalNumber(value.rho),
    timestamp: typeof value.timestamp === 'string' ? value.timestamp : new Date().toISOString(),
  }
}

function parseMessage(raw: string): ServerMessage | null {
  try {
    const value: unknown = JSON.parse(raw)
    return isRecord(value) && typeof value.type === 'string'
      ? value as ServerMessage
      : null
  } catch {
    return null
  }
}

function normalizeCodes(codes: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const code of codes) {
    const value = code.trim().toUpperCase()
    if (!value || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
    if (normalized.length >= MAX_CODES) break
  }
  return normalized
}

export function useRealtimeQuotes(codes: string[]): HookState {
  const updateOptionQuotes = useAppStore((s) => s.updateOptionQuotes)
  const normalizedCodes = useMemo(() => normalizeCodes(codes), [codes])
  const codesKey = normalizedCodes.join('|')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const attemptRef = useRef(0)
  const closedByEffectRef = useRef(false)
  const [state, setState] = useState<HookState>({ connected: false, latency: 0 })

  useEffect(() => {
    closedByEffectRef.current = false
    attemptRef.current = 0
    const activeCodes = codesKey ? codesKey.split('|') : []
    let marketTimerRef: ReturnType<typeof setTimeout> | null = null

    function clearTimers() {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current)
      if (marketTimerRef) clearTimeout(marketTimerRef)
      reconnectTimerRef.current = null
      heartbeatTimerRef.current = null
      marketTimerRef = null
    }

    function sendSubscribe(socket: WebSocket) {
      socket.send(JSON.stringify({ action: 'subscribe', codes: activeCodes }))
    }

    function scheduleReconnect() {
      if (closedByEffectRef.current || activeCodes.length === 0) return
      const delay = Math.min(30_000, 1000 * 2 ** attemptRef.current)
      attemptRef.current += 1
      reconnectTimerRef.current = setTimeout(tryConnect, delay)
    }

    function disconnectAndWait() {
      wsRef.current?.close()
      wsRef.current = null
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
      setState((prev) => ({ ...prev, connected: false }))
      const wait = msUntilNextMarketEvent()
      marketTimerRef = setTimeout(tryConnect, wait)
    }

    function scheduleMarketClose() {
      const wait = msUntilNextMarketEvent()
      marketTimerRef = setTimeout(disconnectAndWait, wait)
    }

    function tryConnect() {
      if (closedByEffectRef.current) return
      if (marketTimerRef) { clearTimeout(marketTimerRef); marketTimerRef = null }

      if (activeCodes.length === 0) {
        setState((prev) => ({ ...prev, connected: false }))
        return
      }

      if (!isUSMarketOpen()) {
        setState((prev) => ({ ...prev, connected: false }))
        const wait = msUntilNextMarketEvent()
        marketTimerRef = setTimeout(tryConnect, wait)
        return
      }

      const socket = new WebSocket(wsUrl())
      wsRef.current = socket

      socket.onopen = () => {
        attemptRef.current = 0
        setState((prev) => ({ ...prev, connected: true }))
        sendSubscribe(socket)
        heartbeatTimerRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: 'ping', ts: Date.now() }))
          }
        }, 30_000)
        scheduleMarketClose()
      }

      socket.onmessage = (event: MessageEvent<string>) => {
        const message = parseMessage(event.data)
        if (!message) return
        if (message.type === 'quote') {
          const quote = parseQuote(message.quote)
          if (quote) updateOptionQuotes([quote])
        } else if (message.type === 'ping') {
          socket.send(JSON.stringify({ action: 'pong', ts: message.ts }))
        } else if (message.type === 'pong') {
          const sentAt = message.ts
          if (typeof sentAt === 'number') {
            setState((prev) => ({ ...prev, latency: Math.max(0, Date.now() - sentAt) }))
          }
        }
      }

      socket.onclose = () => {
        if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current)
        heartbeatTimerRef.current = null
        setState((prev) => ({ ...prev, connected: false }))
        if (!closedByEffectRef.current && isUSMarketOpen()) {
          scheduleReconnect()
        }
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    tryConnect()

    return () => {
      closedByEffectRef.current = true
      clearTimers()
      wsRef.current?.close()
      wsRef.current = null
      setState((prev) => ({ ...prev, connected: false }))
    }
  }, [codesKey, updateOptionQuotes])

  return state
}
