import { create, act, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppUpdates } from './updates'
import { confirmAction } from './confirm'
import { createBackup } from './backups'
import { invoke } from '@tauri-apps/api/core'
import { mockStorage } from './testStorage'
vi.mock('./native', () => ({ isDesktopNativeApp: () => true, nativePlatform: () => 'macos' }))
vi.mock('./confirm', () => ({ confirmAction: vi.fn() }))
vi.mock('./backups', () => ({ createBackup: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
const callbacks = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>())
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => { callbacks.set(name, callback); return () => { if (callbacks.get(name) === callback) callbacks.delete(name) } }) }))
let api: ReturnType<typeof useAppUpdates>, renderer: ReactTestRenderer
function Harness() { api = useAppUpdates(false); return null }
beforeEach(async () => {
  mockStorage(); callbacks.clear()
  vi.mocked(confirmAction).mockReset().mockResolvedValue(true)
  vi.mocked(createBackup).mockReset().mockResolvedValue(undefined)
  vi.mocked(invoke).mockReset().mockImplementation(async command => command === 'check_app_update' ? { version: '0.5.0', body: 'test' } : undefined)
  await act(async () => { renderer = create(<Harness />) })
  await act(async () => { await vi.dynamicImportSettled() })
  await act(async () => { await api.check() })
})
afterEach(async () => { await act(async () => { renderer.unmount() }); vi.unstubAllGlobals() })
describe('Mac/Windows update workflow', () => {
  it('backs up only after explicit native confirmation, then invokes the trusted installer', async () => {
    await act(async () => { await api.install() })
    expect(createBackup).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('install_app_update', { expectedVersion: '0.5.0' })
    expect(vi.mocked(confirmAction).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(createBackup).mock.invocationCallOrder[0])
  })
  it('cancellation does not back up, download or install', async () => {
    vi.mocked(confirmAction).mockResolvedValue(false)
    await act(async () => { await api.install() })
    expect(createBackup).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalledWith('install_app_update', expect.anything())
    expect(api.stage).toBe('cancelled')
  })
  it('native confirmation failure is visible rather than a silent no-op', async () => {
    vi.mocked(confirmAction).mockRejectedValue(new Error('native dialog unavailable'))
    await act(async () => { await api.install() })
    expect(api.status).toBe('error'); expect(api.error).toContain('native dialog unavailable')
    expect(createBackup).not.toHaveBeenCalled()
  })
  it('never installs if the safety backup fails and allows retry afterward', async () => {
    vi.mocked(createBackup).mockRejectedValueOnce(new Error('disk full'))
    await act(async () => { await api.install() })
    expect(api.error).toContain('disk full')
    expect(invoke).not.toHaveBeenCalledWith('install_app_update', expect.anything())
    await act(async () => { await api.install() })
    expect(invoke).toHaveBeenCalledWith('install_app_update', { expectedVersion: '0.5.0' })
  })
  it('surfaces download/install errors without claiming success', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('network timeout'))
    await act(async () => { await api.install() })
    expect(api.status).toBe('error'); expect(api.error).toContain('network timeout')
  })
  it('shows native stages and byte progress, disposing listeners on unmount', async () => {
    expect([...callbacks.keys()]).toEqual(['btt-update-progress', 'btt-update-stage'])
    await act(async () => { callbacks.get('btt-update-stage')?.({ payload: 'verifying' }); callbacks.get('btt-update-progress')?.({ payload: { downloaded: 50, total: 100 } }) })
    expect(api.stage).toBe('verifying'); expect(api.progress).toBe(50)
    expect(callbacks.size).toBe(2)
    await act(async () => { renderer.unmount() })
    expect(callbacks.size).toBe(0)
  })
  it('ignores a second install while native confirmation is pending', async () => {
    let accept!: (ok: boolean) => void
    vi.mocked(confirmAction).mockImplementationOnce(() => new Promise(resolve => { accept = resolve }))
    await act(async () => { const first = api.install(); await api.install(); accept(true); await first })
    expect(confirmAction).toHaveBeenCalledTimes(1)
    expect(createBackup).toHaveBeenCalledTimes(1)
  })
})
