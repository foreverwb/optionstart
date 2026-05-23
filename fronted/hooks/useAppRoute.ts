import { useEffect, useRef } from 'react'
import type { SavedTrade } from '../types'
import type { AppPage } from '../types'
import {
  slugToStrategyKey,
  strategyKeyToSlug,
  type StrategyKey,
} from '../store/useAppStore'

const APP_PAGE_PATHS: Record<AppPage, string> = {
  build: '/build',
  saved: '/saved',
}

interface AppRoute {
  page: AppPage
  savedTradeId: string | null
  strategySlug: string | null
  symbol: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseAppRoute(pathname: string): AppRoute | null {
  const normalized = pathname.replace(/\/+$/, '')
  if (normalized === '') return { page: 'build', savedTradeId: null, strategySlug: null, symbol: null }

  const segments = normalized.split('/').filter(Boolean)
  const route = segments[0]

  if (route === 'saved') {
    return { page: 'saved', savedTradeId: null, strategySlug: null, symbol: null }
  }

  if (route === 'build') {
    const second = segments[1] ?? null
    const third = segments[2] ?? null

    if (!second) {
      return { page: 'build', savedTradeId: null, strategySlug: null, symbol: null }
    }

    if (UUID_RE.test(second)) {
      return { page: 'build', savedTradeId: second, strategySlug: null, symbol: null }
    }

    if (slugToStrategyKey(second) !== null) {
      return {
        page: 'build',
        savedTradeId: null,
        strategySlug: second,
        symbol: third?.toUpperCase() ?? null,
      }
    }

    return { page: 'build', savedTradeId: second, strategySlug: null, symbol: null }
  }

  return null
}

function appPathForState(
  page: AppPage,
  savedTradeId: string | null,
  activeStrategyKey: StrategyKey | null,
  ticker: string,
): string {
  if (page === 'build') {
    if (activeStrategyKey && ticker) {
      return `/build/${strategyKeyToSlug(activeStrategyKey)}/${ticker}`
    }
    if (savedTradeId) {
      return `/build/${encodeURIComponent(savedTradeId)}`
    }
  }
  return APP_PAGE_PATHS[page]
}

export function useAppRoute({
  appPage,
  currentSavedTradeId,
  activeStrategyKey,
  ticker,
  savedTrades,
  setAppPage,
  loadSavedTrade,
  loadStrategyFromRoute,
}: {
  appPage: AppPage
  currentSavedTradeId: string | null
  activeStrategyKey: StrategyKey | null
  ticker: string
  savedTrades: SavedTrade[]
  setAppPage: (page: AppPage) => void
  loadSavedTrade: (id: string) => void
  loadStrategyFromRoute: (strategyKey: StrategyKey, symbol: string) => Promise<void>
}) {
  const skipNextPathWrite = useRef(true)
  const routeLoadedRef = useRef<string | null>(null)

  useEffect(() => {
    const syncPageFromLocation = () => {
      const route = parseAppRoute(window.location.pathname)
      skipNextPathWrite.current = true
      setAppPage(route?.page ?? 'build')
      if (route === null) {
        window.history.replaceState(null, '', appPathForState('build', null, null, ''))
      }
    }

    syncPageFromLocation()
    window.addEventListener('popstate', syncPageFromLocation)
    return () => window.removeEventListener('popstate', syncPageFromLocation)
  }, [setAppPage])

  useEffect(() => {
    if (skipNextPathWrite.current) {
      skipNextPathWrite.current = false
      return
    }

    const targetPath = appPathForState(appPage, currentSavedTradeId, activeStrategyKey, ticker)
    if (window.location.pathname === targetPath) return

    const currentRoute = parseAppRoute(window.location.pathname)
    if (currentRoute === null) {
      window.history.replaceState(null, '', targetPath)
      return
    }

    window.history.pushState(null, '', targetPath)
  }, [appPage, currentSavedTradeId, activeStrategyKey, ticker])

  // Load saved trade from URL
  useEffect(() => {
    const route = parseAppRoute(window.location.pathname)
    if (route?.page !== 'build' || !route.savedTradeId || currentSavedTradeId === route.savedTradeId) return
    if (!savedTrades.some((trade) => trade.id === route.savedTradeId)) return
    loadSavedTrade(route.savedTradeId)
  }, [currentSavedTradeId, loadSavedTrade, savedTrades])

  // Load strategy + ticker from URL
  useEffect(() => {
    const route = parseAppRoute(window.location.pathname)
    if (route?.page !== 'build' || !route.strategySlug || !route.symbol) return

    const routeKey = `${route.strategySlug}/${route.symbol}`
    if (routeLoadedRef.current === routeKey) return

    const strategyKey = slugToStrategyKey(route.strategySlug)
    if (!strategyKey) return

    if (activeStrategyKey === strategyKey && ticker === route.symbol) {
      routeLoadedRef.current = routeKey
      return
    }

    routeLoadedRef.current = routeKey
    skipNextPathWrite.current = true
    loadStrategyFromRoute(strategyKey, route.symbol)
  }, [activeStrategyKey, ticker, loadStrategyFromRoute])
}
