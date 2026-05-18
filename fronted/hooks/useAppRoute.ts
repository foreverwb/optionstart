import { useEffect, useRef } from 'react'
import type { SavedTrade } from '../types'
import type { AppPage } from '../types'

const APP_PAGE_PATHS: Record<AppPage, string> = {
  build: '/build',
  saved: '/saved',
}

interface AppRoute {
  page: AppPage
  savedTradeId: string | null
}

function parseAppRoute(pathname: string): AppRoute | null {
  const normalized = pathname.replace(/\/+$/, '')
  if (normalized === '') return { page: 'build', savedTradeId: null }

  const [route, savedTradeId] = normalized.split('/').filter(Boolean)
  if (route === 'build') return { page: 'build', savedTradeId: savedTradeId ?? null }
  if (route === 'saved') return { page: 'saved', savedTradeId: null }
  return null
}

function appPathForPage(page: AppPage, savedTradeId: string | null): string {
  if (page === 'build' && savedTradeId) return `/build/${encodeURIComponent(savedTradeId)}`
  return APP_PAGE_PATHS[page]
}

export function useAppRoute({
  appPage,
  currentSavedTradeId,
  savedTrades,
  setAppPage,
  loadSavedTrade,
}: {
  appPage: AppPage
  currentSavedTradeId: string | null
  savedTrades: SavedTrade[]
  setAppPage: (page: AppPage) => void
  loadSavedTrade: (id: string) => void
}) {
  const skipNextPathWrite = useRef(true)

  useEffect(() => {
    const syncPageFromLocation = () => {
      const route = parseAppRoute(window.location.pathname)
      skipNextPathWrite.current = true
      setAppPage(route?.page ?? 'build')
      if (route === null) window.history.replaceState(null, '', appPathForPage('build', null))
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

    const targetPath = appPathForPage(appPage, currentSavedTradeId)
    if (window.location.pathname === targetPath) return

    const currentRoute = parseAppRoute(window.location.pathname)
    if (currentRoute === null) {
      window.history.replaceState(null, '', targetPath)
      return
    }

    window.history.pushState(null, '', targetPath)
  }, [appPage, currentSavedTradeId])

  useEffect(() => {
    const route = parseAppRoute(window.location.pathname)
    if (route?.page !== 'build' || !route.savedTradeId || currentSavedTradeId === route.savedTradeId) return
    if (!savedTrades.some((trade) => trade.id === route.savedTradeId)) return
    loadSavedTrade(route.savedTradeId)
  }, [currentSavedTradeId, loadSavedTrade, savedTrades])
}
