import type { RichReminderPayload } from './notifications'
const KEY = 'btt:reminder-history:v1'
export interface ReminderHistoryEntry {
  at: number; kind: 'watching' | 'other'; trigger: 'daily' | 'episode' | 'snooze'
  result: 'shown' | 'scheduled' | 'denied' | 'failed'; titles: string[]; ids: number[]
}
export function reminderHistory(): ReminderHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]').filter((x: ReminderHistoryEntry) => Number.isFinite(x?.at) && Date.now()-x.at<30*86400_000 && Array.isArray(x.titles) && ['shown','scheduled','denied','failed'].includes(x.result)).slice(-200) } catch { return [] }
}
export function recordReminder(payload: RichReminderPayload, result: ReminderHistoryEntry['result'], at = Date.now()): void {
  if (payload.preview || !payload.items.length) return
  try { localStorage.setItem(KEY, JSON.stringify([...reminderHistory(), { at, kind: payload.kind, trigger: payload.trigger ?? 'daily', result, titles: payload.items.slice(0,30).map(x => x.title.slice(0,200)), ids: payload.items.slice(0,30).map(x => x.id) }].slice(-200))) } catch {}
}
