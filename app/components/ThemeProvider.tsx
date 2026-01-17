'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type Theme = 'light' | 'dark'
type Density = 'comfortable' | 'compact'

type ThemeContextValue = {
  theme: Theme
  density: Density
  toggleTheme: () => void
  toggleDensity: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'theme'
const DENSITY_KEY = 'density'

function applyTheme(nextTheme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', nextTheme === 'dark')
}

function applyDensity(nextDensity: Density) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('density-compact', nextDensity === 'compact')
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialDensity(): Density {
  if (typeof window === 'undefined') return 'comfortable'
  const stored = window.localStorage.getItem(DENSITY_KEY)
  return stored === 'compact' ? 'compact' : 'comfortable'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const [density, setDensity] = useState<Density>('comfortable')

  useEffect(() => {
    const initial = getInitialTheme()
    setTheme(initial)
    applyTheme(initial)
    const initialDensity = getInitialDensity()
    setDensity(initialDensity)
    applyDensity(initialDensity)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(DENSITY_KEY, density)
    applyDensity(density)
  }, [density])

  const value = useMemo(
    () => ({
      theme,
      density,
      toggleTheme: () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
      toggleDensity: () => setDensity((prev) => (prev === 'compact' ? 'comfortable' : 'compact')),
    }),
    [theme, density]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
