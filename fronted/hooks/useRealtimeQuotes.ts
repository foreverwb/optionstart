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

    function clearTimers() {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current)
      reconnectTimerRef.current = null
      heartbeatTimerRef.current = null
    }

    function sendSubscribe(socket: WebSocket) {
      socket.send(JSON.stringify({ action: 'subscribe', codes: activeCodes }))
    }

    function scheduleReconnect() {
      if (closedByEffectRef.current || activeCodes.length === 0) return
      const delay = Math.min(30_000, 1000 * 2 ** attemptRef.current)
      attemptRef.current += 1
      reconnectTimerRef.current = setTimeout(connect, delay)
    }

    function connect() {
      clearTimers()
      if (activeCodes.length === 0) {
        setState((prev) => ({ ...prev, connected: false }))
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
        clearTimers()
        setState((prev) => ({ ...prev, connected: false }))
        scheduleReconnect()
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    connect()

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
