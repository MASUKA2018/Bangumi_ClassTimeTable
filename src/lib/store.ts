import type { AirFix, Settings, Tracking } from '../types'
import type { Continuity } from './progress'
import { detectLang } from './i18n'
import { themeDefinition } from './themes'

const KEY = 'btt:v1'

export type RegionClass = 'jp' | 'cn' | 'other' | 'unknown'

/** 筛选面板的选择,跨会话记住(筛选按钮的角标 + 清除筛选保证可发现/可撤销) */
export interface FilterPrefs {
  cont: Continuity[]
  reg: RegionClass[]
  repMin: number
  src: string | null
  tag: string | null
}

const CONT_ALL: Continuity[] = ['new', 'carry', 'long']
const REG_ALL: RegionClass[] = ['jp', 'cn', 'other', 'unknown']

export const DEFAULT_FILTERS: FilterPrefs = { cont: CONT_ALL, reg: REG_ALL, repMin: 0, src: null, tag: null }

/** 载入校验:枚举值过滤 + 空选集回落全选,坏数据只会回到默认而不是白屏 */
function sanitizeFilters(f: unknown): FilterPrefs {
  const o = (f ?? {}) as Record<string, unknown>
  const pick = <T extends string>(v: unknown, all: T[]): T[] => {
    const a = Array.isArray(v) ? (v.filter((x) => (all as string[]).includes(x)) as T[]) : []
    return a.length ? a : [...all]
  }
  return {
    cont: pick(o.cont, CONT_ALL),
    reg: pick(o.reg, REG_ALL),
    repMin: typeof o.repMin === 'number' && o.repMin > 0 ? o.repMin : 0,
    src: typeof o.src === 'string' ? o.src : null,
    tag: typeof o.tag === 'string' ? o.tag : null,
  }
}

export interface Persisted {
  settings: Settings
  tracking: Tracking
  overrides: Record<number, AirFix> // 本机放送校正,优先于 enhance.json
  filters: FilterPrefs
}

/** 首访默认主题:系统明确偏好浅色 → 白色,否则 Bangumi 深色;用户选过就存 localStorage 恒久生效 */
const defaultTheme = (): Settings['theme'] =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'bgm-dark'

export const DEFAULT_SETTINGS: Settings = {
  theme: defaultTheme(),
  themeMode: 'manual',
  density: 'standard',
  fontScale: 100,
  coverSize: 'medium',
  autoCheckUpdates: true,
  backupEnabled: true,
  otherReminderScope: 'all',
  episodeReminderEnabled: false,
  episodeReminderMode: 'before',
  episodeReminderOffset: 10,
  reminderDismissSeconds: 30,
  lang: detectLang(),
  tzMode: 'local',
  lateNightCutoff: 2, // 默认凌晨 2:00 前归前日(表记到 25:59)
  watchingReminderEnabled: false,
  watchingReminderTime: '20:00',
  otherReminderEnabled: false,
  otherReminderTime: '20:00',
  weekStart: 1,
  friends: [],
  panelOpen: true,
  panelWidth: 380,
  panelWidthDay: 640,
}

export function normalizeSettings(raw: unknown): Settings {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const result = { ...DEFAULT_SETTINGS, friends: [] as string[] }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = input[key]
    if (typeof value === typeof DEFAULT_SETTINGS[key] && !Array.isArray(value)) {
      Object.assign(result, { [key]: value })
    }
  }
  result.theme = themeDefinition(result.theme).id
  result.lang = ['zh-Hans', 'zh-Hant', 'ja', 'en'].includes(result.lang) ? result.lang : DEFAULT_SETTINGS.lang
  result.tzMode = result.tzMode === 'jst' ? 'jst' : 'local'
  result.themeMode = result.themeMode === 'system' ? 'system' : 'manual'
  result.density = ['compact', 'standard', 'large'].includes(result.density) ? result.density : 'standard'
  result.coverSize = ['small', 'medium', 'large'].includes(result.coverSize) ? result.coverSize : 'medium'
  result.fontScale = [100, 115, 130].includes(result.fontScale) ? result.fontScale : 100
  result.otherReminderScope = result.otherReminderScope === 'wish' ? 'wish' : 'all'
  result.episodeReminderMode = result.episodeReminderMode === 'after' ? 'after' : 'before'
  result.episodeReminderOffset = [0, 5, 10, 15, 30].includes(result.episodeReminderOffset) ? result.episodeReminderOffset : 10
  result.reminderDismissSeconds = [0, 15, 30, 60].includes(result.reminderDismissSeconds) ? result.reminderDismissSeconds : 30
  result.weekStart = result.weekStart === 7 ? 7 : 1
  result.lateNightCutoff = Number.isInteger(result.lateNightCutoff) && result.lateNightCutoff >= 0 && result.lateNightCutoff <= 6 ? result.lateNightCutoff : 2
  result.panelWidth = Number.isFinite(result.panelWidth) ? Math.max(260, Math.min(900, result.panelWidth)) : 380
  result.panelWidthDay = Number.isFinite(result.panelWidthDay) ? Math.max(260, Math.min(1000, result.panelWidthDay)) : 640
  result.friends = Array.isArray(input.friends) ? [...new Set(input.friends.filter((x): x is string => typeof x === 'string' && x.length < 100))].slice(0, 50) : []
  for (const key of ['watchingReminderTime', 'otherReminderTime'] as const) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result[key])) result[key] = DEFAULT_SETTINGS[key]
  }
  return result
}

export function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      const settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) }
      settings.theme = themeDefinition(settings.theme).id
      settings.themeMode = settings.themeMode === 'system' ? 'system' : 'manual'
      settings.density = ['compact', 'standard', 'large'].includes(settings.density) ? settings.density : 'standard'
      settings.coverSize = ['small', 'medium', 'large'].includes(settings.coverSize) ? settings.coverSize : 'medium'
      settings.fontScale = [100, 115, 130].includes(settings.fontScale) ? settings.fontScale : 100
      settings.otherReminderScope = settings.otherReminderScope === 'wish' ? 'wish' : 'all'
      settings.episodeReminderMode = settings.episodeReminderMode === 'after' ? 'after' : 'before'
      settings.episodeReminderOffset = [0, 5, 10, 15, 30].includes(settings.episodeReminderOffset) ? settings.episodeReminderOffset : 10
      settings.reminderDismissSeconds = [0, 15, 30, 60].includes(settings.reminderDismissSeconds) ? settings.reminderDismissSeconds : 30
      for (const key of ['autoCheckUpdates', 'backupEnabled', 'episodeReminderEnabled'] as const) {
        if (typeof settings[key] !== 'boolean') settings[key] = DEFAULT_SETTINGS[key]
      }
      // 旧默认值一次性升级(560 是曾经的出厂日视图宽度,手动拖到正好 560 的概率可忽略)
      if (settings.panelWidthDay === 560) settings.panelWidthDay = 640
      // 旧布尔版深夜表记迁移:开着的迁到新默认 2 点边界,关着的保持按实际日期
      if ('lateNight' in settings && !('lateNightCutoff' in (p.settings ?? {}))) {
        settings.lateNightCutoff = (settings as Record<string, unknown>).lateNight ? 2 : 0
      }
      const old = p.settings ?? {}
      // 0.2 版只有一个总提醒:升级后同一时间拆到“在看”与“未在看”两组。
      if ('dailyReminderEnabled' in old && !('watchingReminderEnabled' in old)) {
        settings.watchingReminderEnabled = !!old.dailyReminderEnabled
        settings.otherReminderEnabled = !!old.dailyReminderEnabled
      }
      if (typeof old.dailyReminderTime === 'string' && !('watchingReminderTime' in old)) {
        settings.watchingReminderTime = old.dailyReminderTime
        settings.otherReminderTime = old.dailyReminderTime
      }
      for (const key of ['watchingReminderTime', 'otherReminderTime'] as const) {
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(settings[key])) settings[key] = DEFAULT_SETTINGS[key]
      }
      delete (settings as Record<string, unknown>).dailyReminderEnabled
      delete (settings as Record<string, unknown>).dailyReminderTime
      delete (settings as Record<string, unknown>).lateNight
      return {
        settings: normalizeSettings(settings),
        tracking: {
          status: p.tracking?.status ?? {},
          watched: p.tracking?.watched ?? {},
          rates: p.tracking?.rates ?? {},
          memos: p.tracking?.memos ?? {},
        },
        overrides: p.overrides ?? {},
        filters: sanitizeFilters(p.filters),
      }
    }
  } catch {}
  return {
    settings: { ...DEFAULT_SETTINGS },
    tracking: { status: {}, watched: {}, rates: {}, memos: {} },
    overrides: {},
    filters: { ...DEFAULT_FILTERS },
  }
}

export function savePersisted(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
    return true
  } catch { return false }
}
