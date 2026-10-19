import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { confirmAction } from './confirm'
import { setLang } from './i18n'
vi.mock('./native', () => ({ isNativeApp: () => true }))
const ipc = vi.fn()

// Keep the real dialog SDK: mocking confirm() would hide an IPC/ACL mismatch.
describe('native dialog SDK and capability contract', () => {
  it.each([['Confirm', true], ['Cancel', false]])('honors %s through the actual SDK command', async (answer, expected) => {
    setLang('en'); ipc.mockReset().mockResolvedValue(answer)
    vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: ipc } })
    try {
      expect(await confirmAction('Test only')).toBe(expected)
      const [command, args] = ipc.mock.calls[0]
      expect(command).toBe('plugin:dialog|message')
      expect(args).toMatchObject({ buttons: { OkCancelCustom: ['Confirm', 'Cancel'] } })
      const capability = JSON.parse(readFileSync('src-tauri/capabilities/dialog.json', 'utf8'))
      expect(capability.windows).toEqual(['main'])
      expect(capability.permissions).toEqual(['dialog:allow-message'])
    } finally { setLang('zh-Hans'); vi.unstubAllGlobals() }
  })
})
