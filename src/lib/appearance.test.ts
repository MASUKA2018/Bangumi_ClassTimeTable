import { describe, expect, it } from 'vitest'
import { effectiveTheme } from './appearance'
import { DEFAULT_SETTINGS } from './store'
describe('effective desktop theme', () => {
  it('preserves a manually selected palette regardless of OS preference', () => {
    const settings = { ...DEFAULT_SETTINGS, theme: 'nord' as const }
    expect(effectiveTheme(settings, true)).toBe('nord')
    expect(effectiveTheme(settings, false)).toBe('nord')
  })
  it('switches both ways when following the system', () => {
    const settings = { ...DEFAULT_SETTINGS, themeMode: 'system' as const }
    expect(effectiveTheme(settings, true)).toBe('bgm-dark')
    expect(effectiveTheme(settings, false)).toBe('light')
  })
})
