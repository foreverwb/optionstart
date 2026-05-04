const blinkKeyframes = `
@keyframes topbar-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
`

export function LiveDot({ connected, latency }: { connected: boolean; latency: number }) {
  return (
    <>
      <style>{blinkKeyframes}</style>
      <div
        title={connected ? `Live data ${latency}ms` : 'Live data disconnected'}
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: connected ? 'var(--green)' : 'var(--t3)',
          animation: 'topbar-blink 2s ease infinite',
          flexShrink: 0,
        }}
      />
    </>
  )
}
