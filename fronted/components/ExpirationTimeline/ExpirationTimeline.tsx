import { useCallback, useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { ExpiryDate } from '@/types'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface MonthGroup {
  key: string
  label: string
  expiries: ExpiryDate[]
}

function parseISO(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month: month - 1, day }
}

function dayLabel(iso: string): string {
  return String(parseISO(iso).day)
}

function daysUntil(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { year, month, day } = parseISO(iso)
  const target = new Date(year, month, day)
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000))
}

function groupByMonth(expiries: ExpiryDate[]): MonthGroup[] {
  const currentYear = new Date().getFullYear()
  const groups: MonthGroup[] = []
  let current: MonthGroup | null = null
  for (const expiry of expiries) {
    const { year, month } = parseISO(expiry.date)
    const key = `${year}-${month}`
    if (!current || current.key !== key) {
      const monthName = MONTH_LABELS[month]
      const label = year !== currentYear ? `${monthName} '${String(year).slice(2)}` : monthName
      current = { key, label, expiries: [] }
      groups.push(current)
    }
    current.expiries.push(expiry)
  }
  return groups
}

function MonthHeader({ group }: { group: MonthGroup }) {
  const width = Math.max(52, group.expiries.length * 44)
  return (
    <div
      style={{
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(120,130,150,.28)',
        borderRadius: 6,
        fontSize: 15,
        lineHeight: 1,
        fontWeight: 400,
        color: group.expiries.length === 0 ? 'rgba(13,20,33,.28)' : 'var(--t0)',
        minWidth: width,
      }}
    >
      {group.label}
    </div>
  )
}

function ExpiryDay({
  expiry,
  selected,
  hasLeg,
  onSelect,
}: {
  expiry: ExpiryDate
  selected: boolean
  hasLeg: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        width: 44,
        height: 36,
        border: 'none',
        background: 'transparent',
        color: selected ? '#fff' : 'var(--t0)',
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1,
        fontFamily: 'var(--sans)',
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          minWidth: 56,
          height: 30,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: selected ? '#2ea7e5' : 'transparent',
        }}
      >
        {dayLabel(expiry.date)}
      </span>
      {hasLeg && (
        <span
          style={{
            position: 'absolute',
            bottom: 2,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: selected ? '#fff' : '#2ea7e5',
          }}
        />
      )}
    </button>
  )
}

export function ExpirationTimeline() {
  const expiryDates = useAppStore((s) => s.expiryDates)
  const selectedExpiry = useAppStore((s) => s.selectedExpiry)
  const legs = useAppStore((s) => s.legs)
  const ticker = useAppStore((s) => s.ticker)
  const optionChain = useAppStore((s) => s.optionChain)
  const migrateLegsToExpiry = useAppStore((s) => s.migrateLegsToExpiry)

  const handleSelectExpiry = useCallback(async (date: string) => {
    if (!optionChain.has(date) && ticker) {
      try {
        const { fetchOptionChain } = await import('@/hooks/useApi')
        const contracts = await fetchOptionChain(ticker, date)
        const chain = new Map(useAppStore.getState().optionChain)
        chain.set(date, contracts)
        useAppStore.setState({ optionChain: chain })
      } catch (err) {
        console.error('[ExpirationTimeline] failed to load chain', err)
      }
    }
    migrateLegsToExpiry(date)
  }, [migrateLegsToExpiry, optionChain, ticker])

  const groups = useMemo(() => groupByMonth(expiryDates), [expiryDates])
  const legExpiries = useMemo(() => new Set(legs.map((leg) => leg.expiry)), [legs])
  const dte = selectedExpiry ? daysUntil(selectedExpiry) : 0

  return (
    <section
      style={{
        background: '#eef3ff',
        borderBottom: '1px solid rgba(120,130,150,.25)',
        flexShrink: 0,
        overflow: 'hidden',
        paddingTop: 2,
      }}
    >
      <div style={{ padding: '0 8px 3px', fontSize: 15, fontWeight: 500, color: 'var(--t0)', lineHeight: 1.2 }}>
        EXPIRATION: <strong>{dte}d</strong>
      </div>
      <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
        <div style={{ display: 'flex', gap: 4, minWidth: 'max-content' }}>
          {groups.map((group) => <MonthHeader key={group.key} group={group} />)}
        </div>
        <div style={{ display: 'flex', gap: 4, minWidth: 'max-content' }}>
          {groups.map((group) => (
            <div key={group.key} style={{ display: 'flex', minWidth: Math.max(52, group.expiries.length * 44) }}>
              {group.expiries.map((expiry) => (
                <ExpiryDay
                  key={expiry.date}
                  expiry={expiry}
                  selected={expiry.date === selectedExpiry}
                  hasLeg={legExpiries.has(expiry.date)}
                  onSelect={() => handleSelectExpiry(expiry.date)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
