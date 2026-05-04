interface StrikeRulerProps {
  sMin: number
  sMax: number
  toX: (strike: number) => number
}

function buildTicks(sMin: number, sMax: number): { values: number[]; majorStep: number } {
  const range = sMax - sMin
  if (range <= 0) return { values: [], majorStep: 10 }

  const labelTarget = range / 25
  const niceLabels = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000]
  const majorStep = niceLabels.find((n) => n >= labelTarget) ?? 1000
  const step = Math.max(1, majorStep / 5)

  const values: number[] = []
  const start = Math.ceil(sMin / step) * step
  for (let s = start; s <= sMax; s += step) {
    values.push(Math.round(s * 100) / 100)
  }
  return { values, majorStep }
}

export function StrikeRuler({ sMin, sMax, toX }: StrikeRulerProps) {
  const { values: ticks, majorStep } = buildTicks(sMin, sMax)
  const midStep = majorStep / 2

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 48, height: 52 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 18, borderTop: '1px dashed rgba(13,20,33,.18)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 54, borderTop: '1px dashed rgba(13,20,33,.14)' }} />
      {ticks.map((strike) => {
        const isMajor = strike % majorStep === 0
        const isMid = !isMajor && midStep >= 1 && strike % midStep === 0
        const height = isMajor ? 14 : isMid ? 10 : 5
        return (
          <div key={strike} style={{ position: 'absolute', left: toX(strike), top: 18, transform: 'translateX(-50%)' }}>
            <div style={{ width: 1.5, height, background: isMajor ? 'var(--t0)' : 'rgba(13,20,33,.35)' }} />
            <div style={{ width: 1.5, height, background: isMajor ? 'var(--t0)' : 'rgba(13,20,33,.35)', marginTop: 22 }} />
            {isMajor && (
              <div
                style={{
                  position: 'absolute',
                  top: 15,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: 14,
                  fontWeight: 400,
                  color: 'var(--t0)',
                  fontFamily: 'var(--sans)',
                }}
              >
                {strike}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
