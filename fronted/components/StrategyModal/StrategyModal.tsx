import { useEffect, useCallback } from 'react'
import { useAppStore, type StrategyKey } from '@/store/useAppStore'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StrategyModalProps {
  open: boolean
  onClose: () => void
}

type Sentiment = 'bull' | 'bear' | 'neut'

interface CardDef {
  key: StrategyKey | 'custom'
  name: string
  desc: string
  sentiment: Sentiment
}

interface TierDef {
  label: string
  cards: CardDef[]
}

// ── Strategy data (matches prototype strat-modal HTML exactly) ─────────────────

const TIERS: TierDef[] = [
  {
    label: '🌱 Novice',
    cards: [
      { key: 'long_call',      name: 'Buy Call',           desc: 'Bullish · Limited risk',    sentiment: 'bull' },
      { key: 'long_put',       name: 'Buy Put',            desc: 'Bearish · Limited risk',    sentiment: 'bear' },
      { key: 'covered_call',   name: 'Covered Call',       desc: 'Neutral-Bullish · Income',  sentiment: 'bull' },
      { key: 'cash_put',       name: 'Cash-Secured Put',   desc: 'Bullish · Income',          sentiment: 'bull' },
      { key: 'protective_put', name: 'Protective Put',     desc: 'Hedge · Insurance',         sentiment: 'bear' },
    ],
  },
  {
    label: '📈 Intermediate',
    cards: [
      { key: 'bull_call',      name: 'Bull Call Spread',   desc: 'Bullish · Defined',         sentiment: 'bull' },
      { key: 'bear_put',       name: 'Bear Put Spread',    desc: 'Bearish · Defined',         sentiment: 'bear' },
      { key: 'bull_put',       name: 'Bull Put Spread',    desc: 'Bullish · Credit',          sentiment: 'bull' },
      { key: 'bear_call',      name: 'Bear Call Spread',   desc: 'Bearish · Credit',          sentiment: 'bear' },
      { key: 'iron_condor',    name: 'Iron Condor',        desc: 'Neutral · Range',           sentiment: 'neut' },
      { key: 'iron_butterfly', name: 'Iron Butterfly',     desc: 'Neutral · ATM',             sentiment: 'neut' },
      { key: 'straddle',       name: 'Long Straddle',      desc: 'Volatile · Unlimited',      sentiment: 'neut' },
      { key: 'strangle',       name: 'Long Strangle',      desc: 'Volatile · Cheap',          sentiment: 'neut' },
      { key: 'collar',         name: 'Collar',             desc: 'Hedged · Income',           sentiment: 'neut' },
    ],
  },
  {
    label: '🔬 Advanced',
    cards: [
      { key: 'call_butterfly', name: 'Call Butterfly',     desc: 'Neutral-Bullish',           sentiment: 'bull' },
      { key: 'put_butterfly',  name: 'Put Butterfly',      desc: 'Neutral-Bearish',           sentiment: 'bear' },
      { key: 'calendar_call',  name: 'Calendar Call',      desc: 'Time decay play',           sentiment: 'neut' },
      { key: 'calendar_put',   name: 'Calendar Put',       desc: 'Time decay play',           sentiment: 'neut' },
      { key: 'diagonal_call',  name: 'Diagonal Call',      desc: 'Directional calendar',      sentiment: 'neut' },
      { key: 'jade_lizard',    name: 'Jade Lizard',        desc: 'No upside risk',            sentiment: 'neut' },
      { key: 'short_straddle', name: 'Short Straddle',     desc: 'High theta · Risk',         sentiment: 'neut' },
      { key: 'short_strangle', name: 'Short Strangle',     desc: 'Wide range · Credit',       sentiment: 'neut' },
      { key: 'call_ratio',     name: 'Call Ratio',         desc: 'Backspread',                sentiment: 'bull' },
      { key: 'put_ratio',      name: 'Put Ratio',          desc: 'Backspread',                sentiment: 'bear' },
    ],
  },
  {
    label: '⚙️ Custom',
    cards: [
      { key: 'custom',         name: 'Custom',             desc: 'Build any combination',     sentiment: 'neut' },
    ],
  },
]

// ── Styles ─────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  background: 'rgba(13,20,33,.45)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const boxStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border2)',
  borderRadius: 'var(--r12)',
  padding: '20px',
  width: '700px',
  maxWidth: '96vw',
  maxHeight: '84vh',
  overflowY: 'auto',
  boxShadow: 'var(--shadow-lg)',
  animation: 'fadeUp .18s ease',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
}

const titleStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 700,
  color: 'var(--t0)',
}

const closeStyle: React.CSSProperties = {
  fontSize: '22px',
  color: 'var(--t2)',
  cursor: 'pointer',
  padding: '0 4px',
  borderRadius: '4px',
  lineHeight: 1,
  background: 'none',
  border: 'none',
}

const tierStyle: React.CSSProperties = {
  marginBottom: '18px',
}

const tierHdStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--t2)',
  letterSpacing: '.07em',
  textTransform: 'uppercase',
  marginBottom: '8px',
  paddingBottom: '5px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
  gap: '6px',
}

const cardBaseStyle: React.CSSProperties = {
  padding: '9px 12px',
  background: 'var(--surface2)',
  border: '1.5px solid var(--border)',
  borderRadius: 'var(--r8)',
  textAlign: 'left',
  cursor: 'pointer',
  transition: '.12s all',
}

const nameStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
}

const descStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--t2)',
  marginTop: '2px',
}

const SENTIMENT_COLOR: Record<Sentiment, string> = {
  bull: 'var(--green-t)',
  bear: 'var(--red-t)',
  neut: 'var(--blue-t)',
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StratCard({
  card,
  onClick,
}: {
  card: CardDef
  onClick: (key: CardDef['key']) => void
}) {
  return (
    <button
      style={cardBaseStyle}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        el.style.borderColor = 'var(--border2)'
        el.style.boxShadow = 'var(--shadow-sm)'
        el.style.background = 'var(--surface)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        el.style.borderColor = 'var(--border)'
        el.style.boxShadow = 'none'
        el.style.background = 'var(--surface2)'
      }}
      onClick={() => onClick(card.key)}
    >
      <div style={{ ...nameStyle, color: SENTIMENT_COLOR[card.sentiment] }}>{card.name}</div>
      <div style={descStyle}>{card.desc}</div>
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function StrategyModal({ open, onClose }: StrategyModalProps) {
  const loadStrategy = useAppStore((s) => s.loadStrategy)
  const setAppPage = useAppStore((s) => s.setAppPage)

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, handleKey])

  if (!open) return null

  function handleCardClick(key: CardDef['key']) {
    if (key !== 'custom') {
      loadStrategy(key as StrategyKey)
    }
    setAppPage('build')
    onClose()
  }

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={overlayStyle} onClick={onClose}>
        <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
          <div style={headerStyle}>
            <span style={titleStyle}>Select Strategy</span>
            <button style={closeStyle} onClick={onClose}>×</button>
          </div>

          {TIERS.map((tier) => (
            <div key={tier.label} style={tierStyle}>
              <div style={tierHdStyle}>{tier.label}</div>
              <div style={gridStyle}>
                {tier.cards.map((card) => (
                  <StratCard key={card.key} card={card} onClick={handleCardClick} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
