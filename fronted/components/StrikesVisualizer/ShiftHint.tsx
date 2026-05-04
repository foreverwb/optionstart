export function ShiftHint({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 70,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(17,24,39,.8)',
        color: '#fff',
        padding: '5px 12px',
        borderRadius: 20,
        fontSize: 11,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: '.2s',
        zIndex: 100,
      }}
    >
      Shift: moving all legs together
    </div>
  )
}
