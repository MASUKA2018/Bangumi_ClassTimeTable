/** Public data only; never accounts, progress or sync queues. */
export function cachedData<T>(key: string): { at: number; value: T } | null {
  try {
    const item = JSON.parse(localStorage.getItem(`btt:data:${key}:v1`) ?? 'null')
    return item && Number.isFinite(item.at) && item.value ? item : null
  } catch { return null }
}
export function cacheData<T>(key: string, value: T): void {
  try { localStorage.setItem(`btt:data:${key}:v1`, JSON.stringify({ at: Date.now(), value })) } catch {}
}
