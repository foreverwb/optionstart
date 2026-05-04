import { useRef, useState, useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { searchTickers, useSelectTicker } from '@/hooks/useApi'

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  background: 'var(--surface)',
  border: '1px solid var(--border2)',
  borderRadius: 'var(--r10)',
  boxShadow: 'var(--shadow-lg)',
  zIndex: 200,
  overflow: 'hidden',
}

export function TickerSearch() {
  const ticker = useAppStore((s) => s.ticker)
  const stockPrice = useAppStore((s) => s.stockPrice)
  const selectTickerAction = useSelectTicker()

  const [draftQuery, setDraftQuery] = useState<string | null>(null)
  const query = draftQuery ?? ticker
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<{ ticker: string; name: string }[]>([])
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query || query.length < 1) {
      searchTimerRef.current = setTimeout(() => setSuggestions([]), 0)
      return () => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      }
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchTickers(query)
        setSuggestions(results.map((r) => ({ ticker: r.ticker, name: r.name })))
      } catch {
        setSuggestions([])
      }
    }, 250)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [query])

  const displayPrice = stockPrice > 0 ? `$${stockPrice.toFixed(2)}` : ''

  function handleFocus() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setOpen(true)
  }

  function handleBlur() {
    closeTimerRef.current = setTimeout(() => setOpen(false), 160)
  }

  function handleSelect(sym: string) {
    setDraftQuery(sym)
    setOpen(false)
    selectTickerAction(sym)
      .then(() => setDraftQuery(null))
      .catch((err) => console.error('[TickerSearch] failed to load', sym, err))
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--surface)',
          borderWidth: '1.5px',
          borderStyle: 'solid',
          borderColor: open ? 'var(--blue)' : 'var(--border2)',
          borderRadius: 'var(--r8)',
          padding: '0 12px',
          height: 34,
          width: 190,
          transition: 'border-color 0.15s',
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setDraftQuery(e.target.value.toUpperCase())}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoComplete="off"
          spellCheck={false}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--t0)',
            fontFamily: 'var(--mono)',
            fontSize: 14,
            fontWeight: 600,
            width: '100%',
            letterSpacing: '0.5px',
            outline: 'none',
          }}
          placeholder="Ticker"
        />
        {displayPrice && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              color: 'var(--green-t)',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {displayPrice}
          </span>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div style={dropdownStyle}>
          {suggestions.map((item) => (
            <div
              key={item.ticker}
              onMouseDown={() => handleSelect(item.ticker)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '9px 14px',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.background = 'var(--surface3)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--t0)',
                  }}
                >
                  {item.ticker}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--t2)',
                    marginLeft: 6,
                  }}
                >
                  {item.name}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
