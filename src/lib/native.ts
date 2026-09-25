/** Tauri 桌面/移动端适配；浏览器/PWA 构建继续使用 Web API。 */

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined
}

function nativePlatform(): 'windows' | 'macos' | 'linux' | 'other' {
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos'
  if (/Linux/i.test(ua)) return 'linux'
  return 'other'
}

/**
 * 原生 WebView 的跨域策略与普通浏览器不同。远端 API 经 Tauri HTTP
 * 插件请求，静态站仍用浏览器 fetch；站内 data/*.json 不经过这里。
 */
export async function remoteFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isNativeApp()) return window.fetch(input, init)
  const { fetch } = await import('@tauri-apps/plugin-http')
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
