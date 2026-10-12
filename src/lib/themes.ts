/** Shared theme choices for settings, the header selector and native window chrome. */
export const THEMES = [
  { id: 'bgm-dark', label: 'Bangumi深色', dark: true, background: '#2d2e2f', foreground: '#dcdcdc', accent: '#f09199' },
  { id: 'dark', label: '深色', dark: true, background: '#0d0e12', foreground: '#e6e6eb', accent: '#ec9aa2' },
  { id: 'contrast', label: '高对比深色', dark: true, background: '#000000', foreground: '#ffffff', accent: '#ff9db2' },
  { id: 'light', label: '白色', dark: false, background: '#fdfdfd', foreground: '#333333', accent: '#f09199' },
  { id: 'nord', label: 'Nord 极地', dark: true, background: '#2e3440', foreground: '#eceff4', accent: '#88c0d0' },
  { id: 'dracula', label: 'Dracula', dark: true, background: '#282a36', foreground: '#f8f8f2', accent: '#bd93f9' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', dark: true, background: '#1e1e2e', foreground: '#cdd6f4', accent: '#cba6f7' },
  { id: 'catppuccin-latte', label: 'Catppuccin Latte', dark: false, background: '#eff1f5', foreground: '#4c4f69', accent: '#8839ef' },
  { id: 'solarized-dark', label: 'Solarized 深色', dark: true, background: '#002b36', foreground: '#93a1a1', accent: '#2aa198' },
  { id: 'solarized-light', label: 'Solarized 浅色', dark: false, background: '#fdf6e3', foreground: '#586e75', accent: '#268bd2' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export function themeDefinition(id: string) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

export function hexRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
