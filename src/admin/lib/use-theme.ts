import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'proxima-admin-theme'

function readInitial(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // private mode / blocked storage -- fall through to the default
  }
  // Dark by default, matching the reference backoffice and the rest of PROXIMA.
  // Only an explicit choice (stored above) switches it to light; the OS
  // preference is deliberately not consulted, or a visitor on a light desktop
  // would get a backoffice that looks nothing like the one being replicated.
  return 'dark'
}

export const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
})

/**
 * Light/dark for the backoffice only. The class goes on <html> (Tailwind's `dark`
 * variant is configured as `&:is(.dark *)`), and is removed on unmount so the
 * marketing site -- which shares this document -- is never left wearing it.
 *
 * Held in one place at the admin root and shared through context: the toggle lives
 * in the sidebar but the login page renders outside that layout, and two separate
 * useState copies of the same preference would drift apart.
 */
export function useThemeState() {
  const [theme, setTheme] = useState<Theme>(readInitial)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // not being able to remember the choice is not worth breaking the page over
    }
    return () => root.classList.remove('dark')
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  return { theme, toggle }
}

export const useTheme = () => useContext(ThemeContext)
