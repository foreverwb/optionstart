export function SegBtn({
  active,
  blue,
  onClick,
  children,
  ariaLabel,
}: {
  active: boolean
  blue?: boolean
  onClick: () => void
  children: React.ReactNode
  ariaLabel?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      style={{
        padding: '8px 18px',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? (blue ? 'var(--blue-t)' : 'var(--t0)') : 'var(--t2)',
        background: active ? (blue ? '#24a8df' : 'var(--surface3)') : '#fff',
        ...(active && blue ? { color: '#fff' } : {}),
        border: 0,
        borderRight: '1px solid var(--border)',
        transition: 'all 0.1s',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flex: 1,
      }}
    >
      {children}
    </button>
  )
}
