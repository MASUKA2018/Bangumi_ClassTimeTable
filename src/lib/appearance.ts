import { useEffect, useState } from 'react'
import type { Settings } from '../types'
import { syncNativeWindowTheme } from './native'
import type { ThemeId } from './themes'

export function effectiveTheme(settings: Settings, dark: boolean): ThemeId {
  return settings.themeMode === 'system' ? (dark ? 'bgm-dark' : 'light') : settings.theme
}

export function useAppearance(settings: Settings): ThemeId {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const theme = effectiveTheme(settings, dark)
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.density = settings.density
    root.dataset.coverSize = settings.coverSize
    root.style.setProperty('--font-scale', String(settings.fontScale / 100))
    syncNativeWindowTheme(theme).catch((error) => console.warn('同步窗口主题失败', error))
  }, [theme, settings.density, settings.coverSize, settings.fontScale])
  return theme
}
