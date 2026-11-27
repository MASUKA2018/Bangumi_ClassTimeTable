import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReminderPopup from './ReminderPopup'
import { reminderPayloadKey, REMINDER_ACTION_EVENT } from '../lib/reminderWindow'
import { mockStorage } from '../lib/testStorage'
import type { RichReminderPayload } from '../lib/notifications'

const native = vi.hoisted(() => ({ hide: vi.fn(async () => {}), setFocus: vi.fn(), emitTo: vi.fn(async () => {}) }))
vi.mock('./Cover', () => ({ default: () => null }))
vi.mock('../lib/native', () => ({ isNativeApp: () => true }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ hide: native.hide, setFocus: native.setFocus }) }))
vi.mock('@tauri-apps/api/event', () => ({ emitTo: native.emitTo, listen: async () => () => {} }))
const payload: RichReminderPayload = { kind: 'watching', theme: 'bgm-dark', lang: 'zh-Hans', heading: 'Test only', emptyText: '', autoHideSeconds: 0,
  items: [{ id: 1, title: 'Test show', airTime: '20:00', episode: '1', episodeNumber: 1, airAt: 1 }] }
let view: ReactTestRenderer | undefined
beforeEach(async () => {
  mockStorage(); native.hide.mockClear(); native.setFocus.mockClear(); native.emitTo.mockClear()
  vi.stubGlobal('document', { documentElement: { setAttribute: vi.fn(), dataset: {} } })
  localStorage.setItem(reminderPayloadKey('watching'), JSON.stringify(payload))
  await act(async () => { view = create(<ReminderPopup kind="watching" />); await vi.dynamicImportSettled() })
})
afterEach(async () => { await act(async () => view?.unmount()); vi.unstubAllGlobals() })

describe('mouse actions on a non-focusable reminder', () => {
  it('closes without focusing any window', async () => {
    await act(async () => { await view!.root.findByProps({ 'aria-label': '关闭' }).props.onClick() })
    expect(native.hide).toHaveBeenCalledOnce()
    expect(native.setFocus).not.toHaveBeenCalled(); expect(native.emitTo).not.toHaveBeenCalled()
  })
  it.each([['10 分钟后提醒', 'snooze'], ['看到本集', 'watched'], ['查看详情', 'detail']])('keeps %s clickable without focusing the popup', async (label, action) => {
    const button = view!.root.findAllByType('button').find(x => x.children.includes(label))!
    expect(button.props.disabled).toBeFalsy()
    await act(async () => { await button.props.onClick() })
    expect(native.emitTo).toHaveBeenCalledWith('main', REMINDER_ACTION_EVENT, { kind: 'watching', id: 1, action })
    expect(native.hide).toHaveBeenCalledOnce()
    // The main window handles explicit "detail" activation, not the toast.
    expect(native.setFocus).not.toHaveBeenCalled()
  })
})
