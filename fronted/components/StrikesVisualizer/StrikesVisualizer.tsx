import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { LegQuickEditPopup } from './LegQuickEditPopup'
import { ShiftHint } from './ShiftHint'
import type { Leg, OptionContract } from '@/types'
import { LegTagsLayer } from './LegTagsLayer'
import { StrikeRuler } from './StrikeRuler'

const ZONE_H = 156
const LONG_TAG_Y = 44
const SHORT_TAG_Y = 118

function yForLeg(leg: Leg): number {
  return leg.direction === 'short' ? SHORT_TAG_Y : LONG_TAG_Y
}

function clampStrike(value: number, sMin: number, sMax: number): number {
  return Math.max(Math.ceil(sMin), Math.min(Math.floor(sMax), value))
}

function nearestWholeDollar(value: number, sMin: number, sMax: number): number {
  return clampStrike(Math.round(value), sMin, sMax)
}

function availableStrikes(
  optionChain: Map<string, OptionContract[]>,
  leg: Leg,
): number[] {
  const contracts = optionChain.get(leg.expiry) ?? []
  const strikes = contracts
    .filter((contract) => contract.optionType === leg.optionType)
    .map((contract) => contract.strike)
    .filter((strike) => Number.isFinite(strike))
    .sort((a, b) => a - b)

  return strikes.filter((strike, idx) => idx === 0 || Math.abs(strike - strikes[idx - 1]) > 0.0001)
}

function nearestAvailableStrike(
  value: number,
  leg: Leg,
  optionChain: Map<string, OptionContract[]>,
  sMin: number,
  sMax: number,
): number {
  const strikes = availableStrikes(optionChain, leg)
  if (strikes.length === 0) return nearestWholeDollar(value, sMin, sMax)

  const bounded = Math.max(strikes[0], Math.min(strikes[strikes.length - 1], value))
  return strikes.reduce((best, strike) =>
    Math.abs(strike - bounded) < Math.abs(best - bounded) ? strike : best,
  strikes[0])
}

interface DragState {
  legId: string
  startX: number
  originalStrikes: Map<string, number>
  didDrag: boolean
  ppp: number
  sMin: number
  sMax: number
}

export function StrikesVisualizer() {
  const containerRef   = useRef<HTMLDivElement>(null)
  const widthRef       = useRef(0)
  const [width, setWidth] = useState(0)
  const dragRef        = useRef<DragState | null>(null)
  const lastDidDragRef = useRef(false)
  const [popupLegId, setPopupLegId] = useState<string | null>(null)
  const [popupAnchor, setPopupAnchor] = useState<{ left: number; top: number } | null>(null)
  const [shiftPressed, setShiftPressed] = useState(false)

  const stockPrice     = useAppStore((s) => s.stockPrice)
  const legs           = useAppStore((s) => s.legs)
  const optionChain    = useAppStore((s) => s.optionChain)
  const updateLeg      = useAppStore((s) => s.updateLeg)
  const setSelectedLegId = useAppStore((s) => s.setSelectedLegId)
  const latestRef = useRef({ stockPrice, legs, optionChain, updateLeg })
  useEffect(() => {
    latestRef.current = { stockPrice, legs, optionChain, updateLeg }
  }, [stockPrice, legs, optionChain, updateLeg])

  const coords = useMemo(() => {
    const W = width
    if (stockPrice <= 0 || W <= 0) {
      return { W, sMin: 0, sMax: 1, toX: () => 0, ppp: 1 }
    }
    const sMin = stockPrice * 0.45
    const sMax = stockPrice * 1.55
    const toX = (s: number) => (s - sMin) / (sMax - sMin) * W
    const ppp = (sMax - sMin) / W
    return { W, sMin, sMax, toX, ppp }
  }, [stockPrice, width])
  const coordsRef = useRef(coords)
  useEffect(() => { coordsRef.current = coords }, [coords])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      widthRef.current = entry.contentRect.width
      setWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const { legs: currentLegs, optionChain: currentChain, updateLeg: ul } = latestRef.current
      const { ppp, sMin, sMax } = drag

      const dx = e.clientX - drag.startX
      if (Math.abs(dx) > 4) { drag.didDrag = true; lastDidDragRef.current = true }

      const origS = drag.originalStrikes.get(drag.legId) ?? latestRef.current.stockPrice
      const leg = currentLegs.find((item) => item.id === drag.legId)
      if (!leg) return
      ul(drag.legId, {
        strike: nearestAvailableStrike(origS + dx * ppp, leg, currentChain, sMin, sMax),
      })

      setShiftPressed(e.shiftKey)
      if (e.shiftKey) {
        for (const [id, os] of drag.originalStrikes) {
          if (id === drag.legId) continue
          const pairedLeg = currentLegs.find((item) => item.id === id)
          if (!pairedLeg) continue
          ul(id, { strike: nearestAvailableStrike(os + dx * ppp, pairedLeg, currentChain, sMin, sMax) })
        }
      }
    }

    const onUp = () => {
      dragRef.current = null
      setShiftPressed(false)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftPressed(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftPressed(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const anchorFromRect = useCallback((rect: DOMRect) => {
    const popupWidth = 280
    const popupHeight = 420
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popupWidth - 10))
    const belowTop = rect.bottom + 6
    const top = belowTop + popupHeight > window.innerHeight
      ? Math.max(8, rect.top - popupHeight - 6)
      : belowTop
    return { left, top }
  }, [])

  const openPopup = useCallback((legId: string, rect: DOMRect) => {
    setSelectedLegId(legId)
    setPopupLegId(legId)
    setPopupAnchor(anchorFromRect(rect))
  }, [anchorFromRect, setSelectedLegId])

  const handleMouseDown = useCallback((e: React.MouseEvent, legId: string) => {
    e.preventDefault()
    lastDidDragRef.current = false
    setPopupLegId(null)
    setPopupAnchor(null)
    const c = coordsRef.current
    dragRef.current = {
      legId,
      startX: e.clientX,
      originalStrikes: new Map(latestRef.current.legs.map((l) => [l.id, l.strike])),
      didDrag: false,
      ppp: c.ppp,
      sMin: c.sMin,
      sMax: c.sMax,
    }
  }, [])

  const handleTagClick = useCallback((e: React.MouseEvent<HTMLDivElement>, legId: string) => {
    if (lastDidDragRef.current) { lastDidDragRef.current = false; return }
    openPopup(legId, e.currentTarget.getBoundingClientRect())
  }, [openPopup])

  const handleEditClick = useCallback((e: React.MouseEvent<HTMLSpanElement>, legId: string) => {
    openPopup(legId, e.currentTarget.parentElement?.getBoundingClientRect() ?? e.currentTarget.getBoundingClientRect())
  }, [openPopup])

  const closePopup = useCallback(() => {
    setPopupLegId(null)
    setPopupAnchor(null)
  }, [])

  const { W, sMin, sMax, toX } = coords
  const ready = stockPrice > 0 && W > 0

  return (
    <div
      ref={containerRef}
      id="strikes-sec"
      style={{
        background: 'var(--surface2)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        height: ZONE_H,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {ready && (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <div style={{ position: 'absolute', top: 12, left: 0, fontSize: 15, fontWeight: 600, letterSpacing: '.02em', color: 'var(--t0)' }}>
            STRIKES:
          </div>
          <StrikeRuler sMin={sMin} sMax={sMax} toX={toX} />
          <LegTagsLayer
            legs={legs}
            width={W}
            toX={toX}
            yForLeg={yForLeg}
            onMouseDown={handleMouseDown}
            onClick={handleTagClick}
            onEditClick={handleEditClick}
          />
          <div style={{ position: 'absolute', left: '64%', bottom: 6, fontSize: 15, fontWeight: 600, color: 'var(--t0)' }}>
            BREAKEVENS:
          </div>
        </div>
      )}
      <LegQuickEditPopup legId={popupLegId} anchor={popupAnchor} onClose={closePopup} />
      <ShiftHint visible={shiftPressed} />
    </div>
  )
}
