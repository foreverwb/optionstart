import type { AppPage } from '../../types'

type Tab = {
  label: string
  page?: AppPage
}

const TABS: Tab[] = [
  { label: 'Build', page: 'build' },
  { label: 'Saved Trades', page: 'saved' },
  { label: 'Optimize' },
  { label: 'Flow' },
]

interface NavPillsProps {
  activePage: AppPage
  onPageChange: (page: AppPage) => void
}

export function NavPills({ activePage, onPageChange }: NavPillsProps) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--surface3)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r8)',
        padding: 3,
        gap: 2,
        marginLeft: 8,
        flexShrink: 0,
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.page === activePage
        const isEnabled = Boolean(tab.page)
        return (
          <button
            key={tab.label}
            onClick={() => {
              if (tab.page) onPageChange(tab.page)
            }}
            style={{
              padding: '4px 14px',
              borderRadius: 'var(--r6)',
              fontSize: 12,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--t0)' : isEnabled ? 'var(--t2)' : 'var(--t3)',
              background: isActive ? 'var(--surface)' : 'transparent',
              border: 'none',
              cursor: isEnabled ? 'pointer' : 'default',
              boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.12s',
              fontFamily: 'var(--sans)',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
