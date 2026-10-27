import type { Settings } from '../types'
import { sanitizeBackup } from './backups'
import type { Persisted, FilterPrefs } from './store'
import { normalizeSettings } from './store'
import { isNativeApp } from './native'
const APPEARANCE = ['theme','themeMode','density','fontScale','coverSize','lang','tzMode','lateNightCutoff','weekStart'] as const
const REMINDERS = ['showReminders','quietHoursEnabled','quietHoursStart','quietHoursEnd','otherReminderScope','episodeReminderEnabled','episodeReminderMode','episodeReminderOffset','reminderDismissSeconds','watchingReminderEnabled','watchingReminderTime','otherReminderEnabled','otherReminderTime','reminderSize','reminderCorner'] as const
export interface SharedPreferences { app: 'bangumi-timetable-preferences'; version: 1; at: string; appearance: Partial<Settings>; filters: FilterPrefs; reminders?: Partial<Settings> }
const pick = (settings: Settings, keys: readonly (keyof Settings)[]) => Object.fromEntries(keys.map(key => [key,settings[key]]))
export function sharePreferences(local: Persisted, includeReminders: boolean): SharedPreferences {
  const clean = sanitizeBackup(local)
  return { app: 'bangumi-timetable-preferences', version: 1, at: new Date().toISOString(), appearance: pick(clean.settings, APPEARANCE), filters: clean.filters,
    ...(includeReminders ? { reminders: pick(clean.settings, REMINDERS) } : {}) }
}
export function parsePreferences(text: string): SharedPreferences {
  if (new TextEncoder().encode(text).length>256*1024) throw new Error('设置文件超过大小限制')
  const doc=JSON.parse(text)
  if (doc?.app !== 'bangumi-timetable-preferences' || doc.version !== 1 || !doc.appearance || !Number.isFinite(Date.parse(doc.at))) throw new Error('设置文件无效')
  const clean=sanitizeBackup({settings:doc.appearance,tracking:{},filters:doc.filters})
  return { app:doc.app,version:1,at:doc.at,appearance:pick(clean.settings,APPEARANCE),filters:clean.filters,
    ...(doc.reminders && typeof doc.reminders==='object' ? {reminders:pick(normalizeSettings(doc.reminders),REMINDERS)} : {}) }
}
export function mergePreferences(local: Persisted, shared: SharedPreferences, reminders: boolean): Persisted {
  return { ...local, settings: normalizeSettings({ ...local.settings, ...shared.appearance, ...(reminders ? shared.reminders : {}) }), filters: shared.filters }
}
export interface PreferenceConnection { endpoint: string; username: string; password: string }
export async function preferencesRequest(connection: PreferenceConnection, payload?: string, etag?: string): Promise<{ status: number; etag?: string; body: string }> {
  const url=new URL(connection.endpoint)
  if (url.protocol!=='https:' || url.username || url.password || url.hash) throw new Error('同步地址必须为不含账号密码的 HTTPS 文件地址')
  if (!isNativeApp()) throw new Error('请在客户端中连接设置同步服务')
  const { invoke }=await import('@tauri-apps/api/core')
  const response=await invoke<{status:number;etag?:string;body:string}>('preferences_request',{ ...connection, payload:payload ?? null, etag:etag ?? null })
  if (![200,201,204,404].includes(response.status)) throw new Error(response.status===412 ? '另一台设备已修改设置，请重新读取后再操作。' : `同步服务返回 HTTP ${response.status}`)
  return response
}
