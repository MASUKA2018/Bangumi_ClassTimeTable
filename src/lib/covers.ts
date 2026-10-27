import { isNativeApp } from './native'
const CACHE = 'btt-covers-v1'
const ready = new Map<string, string>()
const pending = new Map<string, Promise<string>>()
let generation = 0
let active = 0
const waiting: (()=>void)[] = []
async function limited<T>(fn:()=>Promise<T>):Promise<T> {
  if(active<4) active++
  else await new Promise<void>(resolve=>waiting.push(resolve))
  try{return await fn()}finally{const next=waiting.shift();if(next)next();else active--}
}
export const coverGeneration = () => generation
/** Bounded disk cache on native platforms, Cache Storage in the browser. */
export async function loadCover(url: string): Promise<string> {
  if (!/^https:\/\/lain\.bgm\.tv\//.test(url)) return url
  if (ready.has(url)) return ready.get(url)!
  if (pending.has(url)) return pending.get(url)!
  const task = limited(async () => {
    let result = url
    if (isNativeApp()) {
      const { invoke } = await import('@tauri-apps/api/core')
      result = await invoke<string>('cached_cover', { url, refresh: generation > 0 })
    } else if ('caches' in globalThis) {
      const cache = await caches.open(CACHE)
      let response = await cache.match(url)
      if (!response) {
        response = await fetch(url)
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Cover unavailable')
        await cache.put(url, response.clone())
        const keys = await cache.keys()
        for (const key of keys.slice(0, Math.max(0, keys.length-200))) await cache.delete(key)
      }
      result = URL.createObjectURL(await response.blob())
    }
    ready.set(url, result)
    if (ready.size > 200) { const first = ready.keys().next().value!; const old = ready.get(first); if (old?.startsWith('blob:')) URL.revokeObjectURL(old); ready.delete(first) }
    return result
  }).finally(() => pending.delete(url))
  pending.set(url, task)
  return task
}
export async function reloadCovers(): Promise<void> {
  generation++
  for (const value of ready.values()) if (value.startsWith('blob:')) URL.revokeObjectURL(value)
  ready.clear()
  if ('caches' in globalThis) await caches.delete(CACHE).catch(() => {})
  window.dispatchEvent(new Event('btt-reload-covers'))
}
