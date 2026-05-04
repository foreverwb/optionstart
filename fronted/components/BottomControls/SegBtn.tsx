export function SegBtn({
  active,
  blue,
  onClick,
  children,
}: {
  active: boolean
  blue?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        color: active ? (blue ? 'var(--blue-t)' : 'var(--t0)') : 'var(--t2)',
        background: active ? (blue ? 'var(--blue-bg)' : 'var(--surface3)') : 'transparent',
        borderRight: '1px solid var(--border)',
        transition: 'all 0.1s',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
