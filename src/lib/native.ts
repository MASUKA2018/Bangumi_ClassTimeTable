/** Tauri 桌面/移动端适配；浏览器/PWA 构建继续使用 Web API。 */
import { hexRgb, themeDefinition, type ThemeId } from './themes'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined
}

export type NativePlatform = 'windows' | 'macos' | 'linux' | 'android' | 'other'

export function nativePlatform(): NativePlatform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'other'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos'
  if (/Linux/i.test(ua)) return 'linux'
  return 'other'
}

export function isDesktopNativeApp(): boolean {
  return isNativeApp() && ['windows','macos','linux'].includes(nativePlatform())
}

/** Match native title-bar appearance to the same palette used by the webview. */
export async function syncNativeWindowTheme(id: ThemeId): Promise<void> {
  if (!isDesktopNativeApp()) return
  const theme = themeDefinition(id)
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('sync_window_theme', {
    dark: theme.dark,
    background: hexRgb(theme.background),
    foreground: hexRgb(theme.foreground),
  })
}

/**
 * 原生 WebView 的跨域策略与普通浏览器不同。远端 API 经 Tauri HTTP
 * 插件请求，静态站仍用浏览器 fetch；站内 data/*.json 不经过这里。
 */
export async function remoteFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isNativeApp()) return window.fetch(input, init)
  const { fetch } = await import('@tauri-apps/plugin-http')
  if (init?.cache === 'no-store') {
    // The Rust client does not implement Request.cache. Forward explicit cache
    // directives so proxies cannot reuse a previous personal progress response.
    const headers = new Headers(init.headers)
    headers.set('Cache-Control', 'no-cache, no-store')
    headers.set('Pragma', 'no-cache')
    return fetch(input, { ...init, headers })
  }
  return fetch(input, init)
}

/** 让 target=_blank 的链接交给系统默认浏览器，不在应用内另开 WebView。 */
export function installNativeAdapters() {
  if (!isNativeApp()) return
  document.documentElement.dataset.native = 'true'
  // Windows WebView2 使用占位式滚动条，macOS WKWebView 使用覆盖式滚动条。
  // 暴露平台只用于这些原生渲染差异；主体布局仍由两端共用同一套规则。
  document.documentElement.dataset.platform = nativePlatform()
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return
    const node = event.target
    if (!(node instanceof Element)) return
    const link = node.closest<HTMLAnchorElement>('a[href]')
    if (!link || link.target !== '_blank') return
    const url = new URL(link.href)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return
    event.preventDefault()
    import('@tauri-apps/plugin-opener')
      .then(({ openUrl }) => openUrl(url.toString()))
      .catch((error) => console.warn('无法打开外部链接', error))
  })
}
