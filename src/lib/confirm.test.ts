import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmAction } from './confirm'
import { isNativeApp } from './native'
import { confirm } from '@tauri-apps/plugin-dialog'
import { setLang } from './i18n'
vi.mock('./native', () => ({ isNativeApp: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn() }))
beforeEach(() => { setLang('zh-Hans'); vi.mocked(confirm).mockReset(); vi.stubGlobal('window', { confirm: vi.fn(() => true) }) })
afterEach(() => vi.unstubAllGlobals())
describe('cross-platform confirmations', () => {
  it('uses the ordinary browser confirmation outside Tauri', async () => {
    vi.mocked(isNativeApp).mockReturnValue(false)
    expect(await confirmAction('test')).toBe(true)
    expect(window.confirm).toHaveBeenCalledWith('test')
    expect(confirm).not.toHaveBeenCalled()
  })
  it.each([true, false])('awaits the native answer %s without calling the WKWebView dialog', async answer => {
    vi.mocked(isNativeApp).mockReturnValue(true); vi.mocked(confirm).mockResolvedValue(answer)
    expect(await confirmAction('test')).toBe(answer)
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('surfaces native errors rather than silently returning cancellation', async () => {
    vi.mocked(isNativeApp).mockReturnValue(true); vi.mocked(confirm).mockRejectedValue(new Error('permission denied'))
    await expect(confirmAction('test')).rejects.toThrow('permission denied')
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('localizes native buttons instead of leaving Chinese labels in English mode', async () => {
    setLang('en'); vi.mocked(isNativeApp).mockReturnValue(true); vi.mocked(confirm).mockResolvedValue(true)
    await confirmAction('Confirm?')
    expect(confirm).toHaveBeenCalledWith('Confirm?', expect.objectContaining({ okLabel: 'Confirm', cancelLabel: 'Cancel' }))
    setLang('zh-Hans')
  })
})
