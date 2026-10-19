import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReliabilityPanel from './ReliabilityPanel'
import ShowReminderSettings from './ShowReminderSettings'
import { mockStorage } from '../lib/testStorage'
import { recordProgressChanges } from '../lib/progressHistory'
import { DEFAULT_SETTINGS } from '../lib/store'
import { setLang } from '../lib/i18n'
import type { Show, Tracking } from '../types'

const shows: Show[] = [{ id: 1, nameCn: '测试作品', nameJp: 'Test', periodDays: 7, sites: [], fromCalendar: true }]
const tracking: Tracking = { status: { 1: 'watching', 2: 'watching' }, watched: { 1: 3, 2: 8 }, rates: {}, memos: {} }
beforeEach(() => { mockStorage(); setLang('zh-Hans') })
describe('reliability settings interactions', () => {
  it('restores only the selected history row and disables mutation controls while busy', async () => {
    recordProgressChanges({ ...tracking, watched: { 1: 2, 2: 8 } }, tracking, 'local')
    const onRestore = vi.fn(async () => {}), onRetry = vi.fn(async () => {}), onResolve = vi.fn(async () => {})
    const props = { shows, tracking, remote: null, busy: false, connected: false, onRestore, onRetry, onResolve }
    let view!: ReturnType<typeof create>
    await act(async () => { view = create(<ReliabilityPanel {...props} />) })
    const restore = view.root.findAllByType('button').find(x => x.children.includes('恢复修改前'))!
    await act(async () => { await restore.props.onClick() })
    expect(onRestore).toHaveBeenCalledWith(1, 2)
    expect(onRetry).not.toHaveBeenCalled(); expect(onResolve).not.toHaveBeenCalled()
    await act(async () => { view.update(<ReliabilityPanel {...props} busy />) })
    expect(view.root.findAllByType('button').filter(x => String(x.children).startsWith('恢复修改')).every(x => x.props.disabled)).toBe(true)
    view.unmount()
  })
  it('does not put show titles or private comments into the diagnostic preview', async () => {
    const run = async () => {}
    let view!: ReturnType<typeof create>
    await act(async () => { view = create(<ReliabilityPanel shows={shows} tracking={{ ...tracking, memos: { 1: { comment: 'DO-NOT-EXPORT' } } }} remote={null} busy={false} connected={false} onRestore={run} onRetry={run} onResolve={run} />) })
    await act(async () => { view.root.findAllByType('button').find(x => x.children.includes('预览诊断'))!.props.onClick() })
    const preview = view.root.findByType('pre').children.join('')
    expect(preview).not.toContain('DO-NOT-EXPORT'); expect(preview).not.toContain('测试作品')
    expect(JSON.parse(preview).summary).toEqual({ pending: 0, conflicts: 0 })
    view.unmount()
  })
  it('changes one reminder without changing another and restores inheritance', async () => {
    const onChange = vi.fn(), settings = { ...DEFAULT_SETTINGS, showReminders: { 2: { mode: 'off' as const, offset: 10 } } }
    let view!: ReturnType<typeof create>
    await act(async () => { view = create(<ShowReminderSettings shows={shows} settings={settings} onChange={onChange} />) })
    await act(async () => { view.root.findByProps({ 'aria-label': '选择提醒番剧' }).props.onChange({ target: { value: '1' } }) })
    await act(async () => { view.root.findByProps({ 'aria-label': '本部提醒方式' }).props.onChange({ target: { value: 'after' } }) })
    expect(onChange).toHaveBeenLastCalledWith({ showReminders: { 1: { mode: 'after', offset: 10 }, 2: { mode: 'off', offset: 10 } } })
    await act(async () => { view.root.findByProps({ 'aria-label': '本部提醒方式' }).props.onChange({ target: { value: 'inherit' } }) })
    expect(onChange).toHaveBeenLastCalledWith({ showReminders: settings.showReminders })
    view.unmount()
  })
})
