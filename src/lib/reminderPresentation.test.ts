import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockStorage } from './testStorage'
import { showRichReminder, RICH_REMINDER_EVENT } from './reminderWindow'
import type { RichReminderPayload } from './notifications'

const native = vi.hoisted(() => ({
  windows: new Map<string, any>(), created: [] as { label: string; options: Record<string, unknown> }[],
  operations: [] as string[], emitTo: vi.fn(),
}))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class {
    label: string
    visible = false
    focusable = true
    constructor(label: string, options: Record<string, unknown>) {
      this.label = label; this.focusable = options.focusable as boolean
      native.created.push({ label, options }); native.windows.set(label, this)
    }
    static async getByLabel(label: string) { return native.windows.get(label) ?? null }
    async once(event: string, callback: () => void) { if (event === 'tauri://created') queueMicrotask(callback); return () => {} }
    async isVisible() { return this.visible }
    async setFocusable(value: boolean) { native.operations.push(`focusable:${value}`); this.focusable = value }
    async setSize() { native.operations.push('size') }
    async setPosition() { native.operations.push('position') }
    async setBackgroundColor() { native.operations.push('background') }
    async show() { native.operations.push('show'); this.visible = true }
    async setFocus() { native.operations.push('focus') }
  },
}))
vi.mock('@tauri-apps/api/event', () => ({ emitTo: native.emitTo }))
vi.mock('@tauri-apps/api/window', () => ({
  currentMonitor: async () => null,
  LogicalSize: class { constructor(public width: number, public height: number) {} },
  primaryMonitor: async () => ({ workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } }, scaleFactor: 1 }),
  PhysicalPosition: class { constructor(public x: number, public y: number) {} toLogical(scale: number) { return { x: this.x / scale, y: this.y / scale } } },
}))
const payload: RichReminderPayload = { kind: 'watching', heading: 'Test', emptyText: '', theme: 'bgm-dark', lang: 'zh-Hans', items: [] }
beforeEach(() => { mockStorage(); native.windows.clear(); native.created.length = 0; native.operations.length = 0; native.emitTo.mockReset().mockResolvedValue(undefined) })
afterEach(() => vi.unstubAllGlobals())

describe.each(['Windows NT 10.0', 'Macintosh; Intel Mac OS X'])('non-activating reminder on %s', userAgent => {
  beforeEach(() => vi.stubGlobal('navigator', { userAgent }))
  it('creates a hidden, non-focusable card without disabling mouse interaction', async () => {
    await showRichReminder(payload)
    expect(native.created[0].options).toMatchObject({ visible: false, focus: false, focusable: false, alwaysOnTop: true })
    expect(native.created[0].options).not.toHaveProperty('ignoreCursorEvents', true)
    expect(native.operations[0]).toBe('focusable:false')
    expect(native.operations).not.toContain('focus')
    expect(native.operations.at(-1)).toBe('show')
    expect(native.emitTo).toHaveBeenCalledWith('reminder-watching', RICH_REMINDER_EVENT, { ...payload, popupScale: .75 })
  })
  it('reasserts the no-focus policy before showing a reused window', async () => {
    await showRichReminder(payload)
    const popup = native.windows.get('reminder-watching')
    popup.visible = false; popup.focusable = true // A reused/legacy window must not bypass the policy.
    native.operations.length = 0
    await showRichReminder({ ...payload, trigger: 'snooze' })
    expect(native.created).toHaveLength(1)
    expect(popup.focusable).toBe(false)
    expect(native.operations[0]).toBe('focusable:false')
    expect(native.operations).not.toContain('focus')
  })
  it('does not show a focusable card if applying the policy fails', async () => {
    await showRichReminder(payload)
    const popup = native.windows.get('reminder-watching')
    popup.visible = false
    popup.setFocusable = vi.fn(async () => { throw new Error('permission denied') })
    native.operations.length = 0
    await expect(showRichReminder(payload)).rejects.toThrow('permission denied')
    expect(native.operations).not.toContain('show')
    expect(popup.visible).toBe(false)
  })
  it.each(['watching', 'other'] as const)('protects the visible sibling when arranging a %s reminder', async kind => {
    const siblingKind = kind === 'watching' ? 'other' : 'watching'
    await showRichReminder({ ...payload, kind: siblingKind })
    const sibling = native.windows.get(`reminder-${siblingKind}`)
    sibling.focusable = true
    native.operations.length = 0
    await showRichReminder({ ...payload, kind })
    expect(sibling.focusable).toBe(false)
    expect(native.windows.get(`reminder-${kind}`).focusable).toBe(false)
    expect(native.operations[0]).toBe('focusable:false')
    expect(native.operations.filter(x => x === 'focusable:false')).toHaveLength(2)
    expect(native.operations).not.toContain('focus')
    expect(native.created.at(-1)?.options).toMatchObject({ width: 540, height: 250 })
  })
})
