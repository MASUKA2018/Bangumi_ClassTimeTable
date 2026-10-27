import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import capability from '../../src-tauri/capabilities/android.json'
import { mockStorage } from './testStorage'
import { DEFAULT_SETTINGS, loadPersisted } from './store'
import { parsePreferences, sharePreferences, mergePreferences } from './preferences'
import { planAndroidReminders } from './androidReminders'
import { quarterReview } from './quarterReview'
import { epTime, occurrencesBetween } from './schedule'
import { slotFor } from './time'
import { reminderPhysicalPosition } from './reminderWindow'
import type { Show, Tracking } from '../types'
const at=Date.parse('2026-10-28T11:00:00Z')
const show:Show={id:1,nameJp:'Test',nameCn:'测试',begin:at,periodDays:7,epsTotal:12,sites:[],fromCalendar:true}
const tracking:Tracking={status:{1:'watching'},watched:{1:0},rates:{},memos:{}}
const settings={...DEFAULT_SETTINGS,tzMode:'jst' as const,episodeReminderEnabled:true}
beforeEach(()=>mockStorage())
afterEach(()=>vi.unstubAllGlobals())
describe('settings exchange boundaries',()=>{
  it('excludes credentials, viewing progress and device-specific settings',()=>{
    const local=loadPersisted();local.tracking=tracking
    Object.assign(local.settings,{token:'secret',password:'private'})
    const doc=sharePreferences(local,false),text=JSON.stringify(doc)
    expect(text).not.toContain('secret');expect(text).not.toContain('private');expect(text).not.toContain('tracking');expect(text).not.toContain('panelWidth');expect(doc.reminders).toBeUndefined()
  })
  it('keeps device reminders and progress unless explicitly selected',()=>{
    const local=loadPersisted();local.tracking=tracking
    const other={...local,settings:{...local.settings,theme:'dracula' as const,watchingReminderEnabled:true,panelWidth:800}}
    const doc=parsePreferences(JSON.stringify(sharePreferences(other,true)))
    expect(mergePreferences(local,doc,false).settings.watchingReminderEnabled).toBe(false)
    const merged=mergePreferences(local,doc,true)
    expect(merged.settings.watchingReminderEnabled).toBe(true);expect(merged.settings.panelWidth).toBe(local.settings.panelWidth)
    expect(merged.tracking).toBe(local.tracking)
  })
  it('rejects foreign schemas and sanitizes untrusted settings',()=>{
    expect(()=>parsePreferences('{"version":99}')).toThrow()
    const doc=sharePreferences(loadPersisted(),false)
    doc.appearance.fontScale=900
    expect(parsePreferences(JSON.stringify(doc)).appearance.fontScale).toBe(100)
  })
})
describe('Android schedule planning',()=>{
  it('uses stable IDs and schedules only future alerts within seven days',()=>{
    const a=planAndroidReminders([show],tracking,settings,at-3600000),b=planAndroidReminders([show],tracking,settings,at-1800000)
    expect(a).toHaveLength(1);expect(a.map(x=>x.id)).toEqual(b.map(x=>x.id));expect(a.every(x=>x.at>at-3600000)).toBe(true)
  })
  it('rebuilds plans after progress advances, per-show muting and disabling background alerts',()=>{
    expect(planAndroidReminders([show],{...tracking,watched:{1:1}},settings,at-3600000)).toHaveLength(0)
    expect(planAndroidReminders([show],tracking,{...settings,showReminders:{1:{mode:'off',offset:0}}},at-3600000)).toHaveLength(0)
    expect(planAndroidReminders([show],tracking,{...settings,androidBackgroundReminders:false},at-3600000)).toHaveLength(0)
  })
  it('honors quiet hours and groups the daily summary',()=>{
    const quiet={...settings,quietHoursEnabled:true,quietHoursStart:'19:00',quietHoursEnd:'21:00'}
    expect(planAndroidReminders([show],tracking,quiet,at-3600000)).toHaveLength(0)
    const plans=planAndroidReminders([show],tracking,{...settings,episodeReminderEnabled:false,watchingReminderEnabled:true,watchingReminderTime:'19:30'},at-3600000)
    expect(plans[0].at).toBe(at-1800000);expect(plans[0].payload.trigger).toBe('daily')
  })
  it('has the actual plugin ACL commands, without desktop-only permissions',()=>{
    const cap=capability
    expect(cap.permissions).toContain('notification:allow-get-pending');expect(cap.permissions).toContain('notification:allow-register-listener')
    expect(cap.permissions).toContain('notification:allow-batch')
    expect(JSON.stringify(cap)).not.toContain('autostart:');expect(cap.platforms).toEqual(['android'])
  })
})
describe('unknown times, review boundaries and monitor positions',()=>{
  it('does not turn an announced date into a midnight broadcast or notification',()=>{
    const pending={...show,timePending:true}
    expect(epTime(pending,1)).toBeNull();expect(occurrencesBetween(pending,at-86400000,at+86400000)).toHaveLength(0)
    expect(slotFor(pending,settings,at).known).toBe(false)
    expect(planAndroidReminders([pending],tracking,settings,at-3600000)).toHaveLength(0)
    expect(epTime({...pending,airFix:{epDates:{1:new Date(at).toISOString()}}},1)).toBe(at)
  })
  it('counts only episodes aired within the selected quarter, and deduplicates shows',()=>{
    const ongoing={...show,begin:Date.parse('2026-09-24T11:00:00Z')}
    const data={...tracking,watched:{1:4}}
    expect(quarterReview([ongoing,ongoing],data,'202610',Date.parse('2026-10-16T00:00:00Z'))).toMatchObject({followed:1,watched:3,behind:0})
    expect(quarterReview([ongoing],data,'202607',at)).toMatchObject({followed:1,watched:1})
  })
  it('anchors top-left on a negative-origin screen and clamps a stack into the work area',()=>{
    const area={position:{x:-1920,y:-200},size:{width:1920,height:1080}}
    expect(reminderPhysicalPosition(area,1.5,false,{width:432,height:200,corner:'top-left'})).toEqual({x:-1896,y:-176})
    const pos=reminderPhysicalPosition(area,2,true,{width:648,height:300,corner:'bottom-left'})
    expect(pos.x).toBeGreaterThanOrEqual(-1920);expect(pos.y).toBeGreaterThanOrEqual(-200)
  })
})
