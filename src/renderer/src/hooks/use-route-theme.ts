import { resetGlobalTheme } from '@renderer/lib/app-theme'
import { useEffect } from 'react'
import { useLocation } from 'wouter'

export function useRouteTheme() {
  const [location] = useLocation()

  useEffect(() => {
    const isCategoryRoute = /^\/category\/[^/]+(?:\/|$)/.test(location)
    if (!isCategoryRoute) {
      resetGlobalTheme()
    }
  }, [location])
}
