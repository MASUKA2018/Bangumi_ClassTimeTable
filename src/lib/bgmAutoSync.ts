import { BGM_SYNC_INTERVAL } from './bgm'

/** Shared by WebView2 and WKWebView; native window focus can call refresh as well. */
export function installBgmAutoSync(sync: (retryUploads: boolean) => Promise<unknown>) {
  let lastTrigger = -Infinity
  let active = true
  const refresh = (retryUploads = false) => {
    if (!active || (!retryUploads && Date.now() - lastTrigger < 15_000)) return
    lastTrigger = Date.now()
    void sync(retryUploads).catch(() => undefined)
  }
  const focused = () => refresh()
  const online = () => refresh(true)
  const visible = () => { if (document.visibilityState === 'visible') refresh() }
  window.addEventListener('focus', focused)
  window.addEventListener('online', online)
  document.addEventListener('visibilitychange', visible)
  const timer = window.setInterval(focused, BGM_SYNC_INTERVAL)
  refresh(true)
  return {
    refresh,
    dispose: () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', focused)
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', visible)
    },
  }
}
