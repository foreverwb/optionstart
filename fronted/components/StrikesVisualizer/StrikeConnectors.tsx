import type { Leg } from '@/types'

interface StrikeConnectorsProps {
  legs: Leg[]
  toX: (strike: number) => number
  yForLeg: (leg: Leg) => number
}

export function StrikeConnectors({ legs, toX, yForLeg }: StrikeConnectorsProps) {
  const groups = new Map<string, Leg[]>()
  for (const leg of legs) {
    if (leg.excluded) continue
    const group = groups.get(leg.expiry) ?? []
    group.push(leg)
    groups.set(leg.expiry, group)
  }

  const lines = Array.from(groups.values()).flatMap((group) => {
    const sorted = [...group].sort((a, b) => a.strike - b.strike)
    return sorted.slice(0, -1).map((leg, index) => {
      const nextLeg = sorted[index + 1]
      const x1 = toX(leg.strike)
      const x2 = toX(nextLeg.strike)
      const y1 = yForLeg(leg)
      const y2 = yForLeg(nextLeg)
      const dx = x2 - x1
      const dy = y2 - y1
      return {
        key: `${leg.id}-${nextLeg.id}`,
        left: x1,
        top: y1,
        width: Math.sqrt(dx * dx + dy * dy),
        angle: Math.atan2(dy, dx) * 180 / Math.PI,
      }
    })
  })

  return (
    <>
      {lines.map((line) => (
        <div
          key={line.key}
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            zIndex: 5,
            left: line.left,
            top: line.top,
            width: line.width,
            height: 1.5,
            background: 'rgba(100,116,139,.3)',
            transformOrigin: '0 50%',
            transform: `rotate(${line.angle}deg)`,
          }}
        />
      ))}
    </>
  )
}
