interface StrikeAxisProps {
  ticker: string
  stockPrice: number
  currentX: number
  axisY: number
  axisLabels: number[]
  toX: (strike: number) => number
}

export function StrikeAxis({ ticker, stockPrice, currentX, axisY, axisLabels, toX }: StrikeAxisProps) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: axisY,
          height: 1,
          background: 'var(--border)',
          pointerEvents: 'none',
          zIndex: 4,
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 22,
          left: currentX,
          width: 1,
          background: 'rgba(37,99,235,0.35)',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 8,
          left: currentX,
          background: 'var(--blue-bg)',
          border: '1px solid var(--blue-b)',
          padding: '1px 6px',
          borderRadius: 4,
          fontSize: 10,
          fontFamily: 'var(--mono)',
          fontWeight: 600,
          color: 'var(--blue-t)',
          whiteSpace: 'nowrap',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          zIndex: 6,
        }}
      >
        {ticker} ${stockPrice.toFixed(2)}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 4,
          left: 0,
          right: 0,
          pointerEvents: 'none',
        }}
      >
        {axisLabels.map((strike) => (
          <div
            key={strike}
            style={{
              position: 'absolute',
              left: toX(strike),
              bottom: 0,
              fontSize: 10,
              fontFamily: 'var(--mono)',
              color: 'var(--t3)',
              transform: 'translateX(-50%)',
            }}
          >
            ${strike}
          </div>
        ))}
      </div>
    </>
  )
}
