import type { Leg } from '@/types'
import { LegTag } from './LegTag'

interface LegTagsLayerProps {
  legs: Leg[]
  width: number
  toX: (strike: number) => number
  yForLeg: (leg: Leg) => number
  onMouseDown: (event: React.MouseEvent, id: string) => void
  onClick: (event: React.MouseEvent<HTMLDivElement>, id: string) => void
  onEditClick: (event: React.MouseEvent<HTMLSpanElement>, id: string) => void
}

export function LegTagsLayer({
  legs,
  width,
  toX,
  yForLeg,
  onMouseDown,
  onClick,
  onEditClick,
}: LegTagsLayerProps) {
  return (
    <>
      {legs.map((leg) => {
        const x = toX(leg.strike)
        if (x < 30 || x > width - 30) return null
        return (
          <LegTag
            key={leg.id}
            leg={leg}
            x={x}
            y={yForLeg(leg)}
            onMouseDown={onMouseDown}
            onClick={onClick}
            onEditClick={onEditClick}
          />
        )
      })}
    </>
  )
}
