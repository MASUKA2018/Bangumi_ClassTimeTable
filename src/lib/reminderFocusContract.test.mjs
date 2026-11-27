import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { Window } from '@tauri-apps/api/window'

afterEach(() => vi.unstubAllGlobals())

it('grants only the main window the actual SDK command needed for passive reminders', async () => {
  const ipc = vi.fn(async () => {})
  vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: ipc } })
  await Window.prototype.setFocusable.call({ label: 'reminder-watching' }, false)
  expect(ipc).toHaveBeenCalledExactlyOnceWith('plugin:window|set_focusable', { label: 'reminder-watching', value: false }, undefined)
  const capability = JSON.parse(readFileSync('src-tauri/capabilities/reminder-presentation.json', 'utf8'))
  expect(capability.windows).toEqual(['main'])
  expect(capability.permissions).toEqual(['core:window:allow-set-focusable'])
})
