import type { Settings, Show, Tracking } from '../types'
import { isNativeApp } from './native'
import { buildEpisodeReminders, buildRichReminderPayload, isQuietTime, parseReminderMinutes, reminderConfig, richReminderToSystemMessage, type RichReminderPayload } from './notifications'
import { DAY_MS, displayTz, partsInZone } from './time'
import { occurrencesBetween } from './schedule'
import { recordReminder } from './reminderHistory'

export const isAndroidApp = () => isNativeApp() && /Android/i.test(navigator.userAgent)
export interface PlannedReminder { id: number; key: string; at: number; payload: RichReminderPayload }
/** Convert a civil date without assuming that every local day has 24 hours. */
function civilTime(now: number, day: number, minutes: number, tz: string): number | null {
  const p=partsInZone(now,tz), civil=Date.UTC(p.y,p.mo-1,p.d+day,Math.floor(minutes/60),minutes%60)
  let at=civil
  for (let i=0;i<4;i++) { const q=partsInZone(at,tz); const delta=civil-Date.UTC(q.y,q.mo-1,q.d,q.hh,q.mm); if (!delta) return at; at+=delta }
  return null // A nonexistent daylight-saving clock time is never guessed.
}
export function planAndroidReminders(shows: Show[], tracking: Tracking, settings: Settings, now: number): PlannedReminder[] {
  if (!settings.androidBackgroundReminders) return []
  const plans: Omit<PlannedReminder,'id'>[]=[]
  for (let day=0;day<=7;day++) for (const kind of ['watching','other'] as const) {
    const conf=reminderConfig(settings,kind)
    if (!conf.enabled) continue
    const at=civilTime(now,day,parseReminderMinutes(conf.time),displayTz(settings))
    if (at===null || at<=now || isQuietTime(settings,at)) continue
    const payload=buildRichReminderPayload(shows,tracking,settings,at,kind)
    if (payload.items.length) plans.push({key:`daily:${kind}:${at}`,at,payload})
  }
  for (const show of shows) {
    if (tracking.status[show.id]!=='watching') continue
    const pref=settings.showReminders[show.id]
    if (pref?.mode==='off') continue
    const custom=pref && pref.mode!=='inherit'
    if (!custom && !settings.episodeReminderEnabled) continue
    const mode=custom ? pref.mode : settings.episodeReminderMode
    const minutes=custom ? pref.offset : settings.episodeReminderOffset
    const offset=minutes*60000*(mode==='after'?1:-1)
    for (const occurrence of occurrencesBetween(show,now-offset,now+7*DAY_MS-offset)) {
      const at=occurrence.t+offset
      if (at<=now) continue
      for (const item of buildEpisodeReminders([show],tracking,settings,at)) plans.push({key:item.key,at,payload:item.payload})
    }
  }
  const ids=new Set<number>()
  return [...new Map(plans.map(x=>[x.key,x])).values()].sort((a,b)=>a.at-b.at).slice(0,200).map(plan=>{
    let hash=2166136261
    for (const char of plan.key) hash=Math.imul(hash^char.charCodeAt(0),16777619)
    let id=0x10000000+(hash>>>0)%0x0fffffff
    while (ids.has(id)) id++
    ids.add(id); return {...plan,id}
  })
}
let queue=Promise.resolve(0)
export function scheduleAndroidReminders(shows: Show[], tracking: Tracking, settings: Settings, now: number, force = false): Promise<number> {
  const run=async () => {
    const { isPermissionGranted, pending, cancel, createChannel, Importance }=await import('@tauri-apps/plugin-notification')
    if (!await isPermissionGranted()) return 0
    const plans=planAndroidReminders(shows,tracking,settings,now)
    const previous=(await pending()).filter(x=>x.id>=0x10000000 && x.id<0x20000000)
    const wanted=new Map(plans.map(x=>[x.id,x]))
    const obsolete=previous.filter(x=>!wanted.has(x.id)).map(x=>x.id)
    if (obsolete.length) await cancel(obsolete)
    await createChannel({id:'bangumi-schedule',name:'番组课表',importance:Importance.Default})
    const { invoke }=await import('@tauri-apps/api/core')
    for (const plan of plans) {
      const msg=richReminderToSystemMessage(plan.payload)
      const old=previous.find(x=>x.id===plan.id)
      if (!force && old?.body===msg.body && Date.parse(String(old.schedule?.at?.date))===plan.at) continue
      // The Android plugin's single notify path does not persist its schedule.
      // batch stores plans, making pending(), cancel() and boot restoration reliable.
      await invoke('plugin:notification|batch',{notifications:[{ ...msg,id:plan.id,channelId:'bangumi-schedule',
        schedule:{at:{date:new Date(plan.at).toISOString(),repeating:false,allowWhileIdle:true}},
        extra:{btt:true,bttAt:plan.at,showId:plan.payload.items[0]?.id,key:plan.key},autoCancel:true }]})
      recordReminder(plan.payload,'scheduled',plan.at)
    }
    return plans.length
  }
  queue=queue.catch(()=>0).then(run)
  return queue
}
