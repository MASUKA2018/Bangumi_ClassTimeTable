import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installBgmAutoSync } from './bgmAutoSync'
import { mockStorage } from './testStorage'
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 5, 19, 55)); mockStorage()
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setInterval, clearInterval }))
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const options = { hour: 20, key: 'alice' }
describe('low frequency account synchronization', () => {
  it('catches up once, ignores frequent focus/online events, then runs at the daily hour', async () => {
    const sync = vi.fn(async () => undefined), trigger = installBgmAutoSync(sync, options)
    expect(sync).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    for (let i=0;i<10;i++) { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); trigger.refresh() }
    expect(sync).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(sync).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(23 * 3600_000)
    expect(sync).toHaveBeenCalledTimes(2)
    trigger.dispose()
  })
  it('remembers attempts across restarts and isolates accounts', async () => {
    const sync = vi.fn(async () => undefined)
    let trigger = installBgmAutoSync(sync, options); await Promise.resolve(); trigger.dispose()
    trigger = installBgmAutoSync(sync, options)
    expect(sync).toHaveBeenCalledTimes(1); trigger.dispose()
    trigger = installBgmAutoSync(sync, { ...options, key: 'bob' })
    expect(sync).toHaveBeenCalledTimes(2); trigger.dispose()
  })
  it('changes-only mode makes no background requests but permits initial account merge', async () => {
    const sync = vi.fn(async () => undefined)
    const trigger = installBgmAutoSync(sync, { ...options, hour: -1 })
    await vi.advanceTimersByTimeAsync(48 * 3600_000); window.dispatchEvent(new Event('online'))
    expect(sync).not.toHaveBeenCalled(); trigger.dispose()
    const first = installBgmAutoSync(sync, { ...options, hour: -1, initial: true })
    expect(sync).toHaveBeenCalledTimes(1); first.dispose()
  })
  it('does not hammer a failing service and removes all triggers on dispose', async () => {
    const sync = vi.fn(async () => { throw new Error('offline') })
    const trigger = installBgmAutoSync(sync, options)
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(sync).toHaveBeenCalledTimes(1); trigger.dispose()
    await vi.advanceTimersByTimeAsync(24 * 3600_000)
    window.dispatchEvent(new Event('online')); trigger.refresh()
    expect(sync).toHaveBeenCalledTimes(1)
  })
})
