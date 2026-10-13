import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockStorage } from './testStorage'
vi.mock('./native', () => ({ isNativeApp: () => true, remoteFetch: vi.fn() }))
import { remoteFetch } from './native'
import { fetchEnhance } from './merge'
const key = 'btt:cache:enhance:remote:v1'
const entries = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i+1), {}]))
beforeEach(() => { mockStorage(); vi.mocked(remoteFetch).mockReset() })
afterEach(() => vi.unstubAllGlobals())
describe('dedicated schedule refresh', () => {
  it('bypasses a fresh cache and records the online result', async () => {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: { entries, regions: {}, syncedAt: 'old' } }))
    vi.mocked(remoteFetch).mockResolvedValue(new Response(JSON.stringify({ entries, bgmwiki_synced_at: 'new' })))
    expect((await fetchEnhance()).syncedAt).toBe('old'); expect(remoteFetch).not.toHaveBeenCalled()
    expect((await fetchEnhance(true)).syncedAt).toBe('new'); expect(remoteFetch).toHaveBeenCalledOnce()
  })
  it('reports failed manual refresh without clearing the last good cache', async () => {
    const cached = JSON.stringify({ t: Date.now() - 24 * 3600_000, v: { entries, regions: {}, syncedAt: 'old' } })
    localStorage.setItem(key, cached); vi.mocked(remoteFetch).mockRejectedValue(new Error('offline'))
    await expect(fetchEnhance(true)).rejects.toThrow('offline'); expect(localStorage.getItem(key)).toBe(cached)
    expect(await fetchEnhance()).toMatchObject({ source: 'cache', stale: true, syncedAt: 'old' })
  })
})
