/** The minute timer only checks the clock locally; network sync runs once per daily slot. */
export function installBgmAutoSync(sync: (retryUploads: boolean) => Promise<unknown>, options: { hour: number; key: string; initial?: boolean }) {
  let active = true
  let busy = false
  const refresh = (initial = false) => {
    if (!active || busy) return
    const now = new Date()
    const slot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), options.hour)
    if (now < slot) slot.setDate(slot.getDate() - 1)
    const key = `btt:bgm:daily:${options.key}`
    if (!initial && (options.hour < 0 || Number(localStorage.getItem(key) || 0) >= slot.getTime())) return
    // Persist attempts too: a server failure must not cause requests every minute.
    try { localStorage.setItem(key, String(Date.now())) } catch {}
    busy = true
    void sync(false).catch(() => undefined).finally(() => { busy = false })
  }
  const check = () => refresh()
  const visible = () => { if (document.visibilityState === 'visible') check() }
  window.addEventListener('focus', check)
  window.addEventListener('online', check)
  document.addEventListener('visibilitychange', visible)
  const timer = window.setInterval(check, 60_000)
  refresh(options.initial === true)
  return { refresh: check, dispose: () => {
    active = false
    window.clearInterval(timer)
    window.removeEventListener('focus', check)
    window.removeEventListener('online', check)
    document.removeEventListener('visibilitychange', visible)
  } }
}
