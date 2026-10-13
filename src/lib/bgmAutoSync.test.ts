import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installBgmAutoSync } from './bgmAutoSync'
import { BGM_SYNC_INTERVAL } from './bgm'

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13'))
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setInterval, clearInterval }))
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('cross-platform automatic synchronization', () => {
  it('syncs at startup and every five minutes while running', async () => {
    const sync = vi.fn(async () => undefined), triggers = installBgmAutoSync(sync)
    expect(sync).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(BGM_SYNC_INTERVAL)
    expect(sync).toHaveBeenCalledTimes(2)
    triggers.dispose()
  })
  it('refreshes on foreground/online and deduplicates native plus browser focus', async () => {
    const sync = vi.fn(async () => undefined), triggers = installBgmAutoSync(sync)
    vi.advanceTimersByTime(15_000)
    window.dispatchEvent(new Event('focus')); triggers.refresh()
    expect(sync).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(15_000)
    window.dispatchEvent(new Event('online'))
    expect(sync).toHaveBeenCalledTimes(3)
    triggers.dispose()
  })
  it('only syncs on becoming visible and cleans up every trigger', async () => {
    const sync = vi.fn(async () => undefined), triggers = installBgmAutoSync(sync)
    vi.advanceTimersByTime(15_000)
    Object.assign(document, { visibilityState: 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))
    expect(sync).toHaveBeenCalledTimes(1)
    Object.assign(document, { visibilityState: 'visible' }); document.dispatchEvent(new Event('visibilitychange'))
    expect(sync).toHaveBeenCalledTimes(2)
    triggers.dispose()
    await vi.advanceTimersByTimeAsync(BGM_SYNC_INTERVAL)
    window.dispatchEvent(new Event('online')); triggers.refresh()
    expect(sync).toHaveBeenCalledTimes(2)
  })
})
