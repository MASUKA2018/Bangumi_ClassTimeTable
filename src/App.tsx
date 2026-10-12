import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AirFix, BgmAccount, CollectMemo, FriendsMap, Settings, Show, Tracking, WatchStatus } from './types'
import { fetchCalendar, fetchSubject, fetchUserWatching, readCachedSubject, type SubjectInfo } from './lib/api'
import {
  BgmAuthError,
  STATUS_TO_TYPE,
  clearPullCache,
  clearQueue,
  drainQueue,
  enqueuePush,
  loadAccount,
  mergeRemote,
  pullCollections,
  queuedIds,
  saveAccount,
  verifyToken,
} from './lib/bgm'
import { beginOauthLogin, completeOauthLogin, fetchOauthConf, refreshIfNeeded, type OauthConf } from './lib/oauth'
import { withViewTransition } from './lib/anim'
import { displayName, LANGS, setLang, t, type Lang } from './lib/i18n'
import AboutModal from './components/AboutModal'
import { fetchBangumiData } from './lib/bangumiData'
import { buildShows, fetchEnhance } from './lib/merge'
import { behindProgress, continuity, type Continuity } from './lib/progress'
import { weightedScore } from './lib/score'
import { currentSeason, displayTz, partsInZone, seasonStartInstant } from './lib/time'
import { fetchSeasonList, fetchSeasonPack, fmtSeason, seasonMonthOf, seasonStartOf } from './lib/seasons'
import { buildIcs, downloadIcs } from './lib/ics'
import { loadPersisted, savePersisted, type Persisted, type RegionClass } from './lib/store'
import { createBackup } from './lib/backups'
import { useAppearance } from './lib/appearance'
import { useAppUpdates } from './lib/updates'
import { airedEps } from './lib/progress'
import PendingPanel from './components/PendingPanel'
import DesktopFeatures from './components/DesktopFeatures'
import {
  buildRichReminderPayload,
  buildEpisodeReminders, episodeReminderSent, markEpisodeReminders,
  snoozedReminders, snoozeReminder, removeSnooze,
  isDailyReminderDue,
  markReminderDelivered,
  notificationPermissionGranted,
  readLastReminderDay,
  reminderDayKey,
  requestNotificationAccess,
  richReminderToSystemMessage,
  sendSystemNotification,
  type ReminderKind,
  type RichReminderPayload,
  type ReminderStatus,
} from './lib/notifications'
import { showRichReminder, REMINDER_ACTION_EVENT, reminderPayloadKey, type ReminderAction } from './lib/reminderWindow'
import { isNativeApp } from './lib/native'
import { THEMES } from './lib/themes'
import WeekView from './components/WeekView'
import DayView from './components/DayView'
import MonthView, { type MonthCursor } from './components/MonthView'
import DetailModal from './components/DetailModal'
import SidePanel from './components/SidePanel'
import SettingsPanel from './components/SettingsPanel'

/** 视口宽度足够时,详情走右侧常驻面板而非弹窗 */
function useWideLayout(): boolean {
  // 低于 1240px 时侧栏即使压到最窄也会挤出横向滚动条，改走详情弹窗。
  // 更宽时由 CSS 自动限制侧栏宽度，优先给七列课表留出完整空间。
  const query = '(min-width: 1240px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setWide(window.matchMedia(query).matches)
    mq.addEventListener('change', fn)
    window.addEventListener('resize', fn) // 部分环境 MQL change 不触发,resize 兜底
    return () => {
      mq.removeEventListener('change', fn)
      window.removeEventListener('resize', fn)
    }
  }, [])
  return wide
}

type View = 'day' | 'week' | 'month'
type Filter = 'all' | 'mine' | 'watching' | 'wish' | 'paused'

const FILTERS: { k: Filter; label: string }[] = [
  { k: 'all', label: '全部' },
  { k: 'mine', label: '我的课表' },
  { k: 'watching', label: '在看' },
  { k: 'wish', label: '想看' },
  { k: 'paused', label: '搁置' },
]

const CONT_OPTS: { k: Continuity; label: string; title: string }[] = [
  { k: 'new', label: '本季新番', title: '本季新开播' },
  { k: 'carry', label: '上季续播', title: '上季开播、本季继续(季初已播 ≤20 集)' },
  { k: 'long', label: '长期放送', title: '年番/多年番(季初已播 >20 集)' },
]

/** Show.region → 筛选类:实锤日本 / 中国 / 其他海外 / 拿不准 */
const regionClass = (r: string | undefined): RegionClass =>
  r === undefined ? 'jp' : r === 'cn' ? 'cn' : r === 'unknown' ? 'unknown' : 'other'

const REG_OPTS: { k: RegionClass; label: string; title: string }[] = [
  { k: 'jp', label: '日本', title: '有实锤的日本动画(bangumi-data/yuc 收录,或 bgm 官方产地标注)' },
  { k: 'cn', label: '中国', title: '国创(bgm 官方产地标注)' },
  { k: 'other', label: '其他地区', title: '欧美/韩国等海外作品' },
  { k: 'unknown', label: '未知', title: '暂无可靠产地信号,不硬归类;每日自动复查,有实锤后自动归位' },
]

const REP_OPTS: { v: number; label: string }[] = [
  { v: 0, label: '不限' },
  { v: 6.5, label: '≥6.5' },
  { v: 7, label: '≥7' },
  { v: 7.5, label: '≥7.5' },
]

const REMINDER_KINDS: ReminderKind[] = ['watching', 'other']

/** 原生端优先展示主题卡片；创建卡片窗口失败或网页端则回落到系统通知。 */
async function deliverReminder(payload: RichReminderPayload, allowPermissionPrompt: boolean) {
  if (isNativeApp()) {
    try {
      await showRichReminder(payload)
      return 'granted' as const
    } catch (error) {
      console.warn('富提醒窗口创建失败，回落到系统通知', error)
    }
  }
  const access = allowPermissionPrompt
    ? await requestNotificationAccess()
    : (await notificationPermissionGranted())
      ? 'granted'
      : 'denied'
  if (access !== 'granted') return access
  await sendSystemNotification(richReminderToSystemMessage(payload))
  return 'granted' as const
}

export default function App() {
  const init = useRef(loadPersisted())
  const [settings, setSettings] = useState<Settings>(init.current.settings)
  const actualTheme = useAppearance(settings)
  const updates = useAppUpdates(settings.autoCheckUpdates)
  setLang(settings.lang) // 渲染最上游设定语言,子组件的 t() 全部生效
  const [tracking, setTracking] = useState<Tracking>(init.current.tracking)
  const [overrides, setOverrides] = useState<Record<number, AirFix>>(init.current.overrides)

  const [shows, setShows] = useState<Show[] | null>(null)
  const [scheduleDataAt, setScheduleDataAt] = useState<string | undefined>()
  const [dataSource, setDataSource] = useState('')
  const [dataBusy, setDataBusy] = useState(false)
  const [dataMessage, setDataMessage] = useState('')
  const [backupError, setBackupError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [showPending, setShowPending] = useState(false)
  const [undoProgress, setUndoProgress] = useState<{ id: number; before: number; after: number } | null>(null)
  const syncPausedRef = useRef(localStorage.getItem('btt:bgm:sync-paused:v1') === 'true')
  const [syncPaused, setSyncPaused] = useState(syncPausedRef.current)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [seasonSel, setSeasonSel] = useState<string>('live') // 'live' 或归档季 YYYYMM
  const [seasonList, setSeasonList] = useState<string[]>([])
  const [packs, setPacks] = useState<Record<string, Show[]>>({})
  // 窄屏默认日视图，避免手机首次打开就面对需要横向滚动的七列周课表。
  const [view, setView] = useState<View>(() => (window.matchMedia('(max-width: 720px)').matches ? 'day' : 'week'))
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  // 筛选面板(搜索框左侧):范围多选 / 产地 / 口碑加权分下限 / 来源 / 题材,选择持久化
  const [advOpen, setAdvOpen] = useState(false)
  const [contSel, setContSel] = useState<Continuity[]>(init.current.filters.cont)
  const [regSel, setRegSel] = useState<RegionClass[]>(init.current.filters.reg)
  const [repMin, setRepMin] = useState(init.current.filters.repMin)
  const [srcSel, setSrcSel] = useState<string | null>(init.current.filters.src)
  const [tagSel, setTagSel] = useState<string | null>(init.current.filters.tag)
  const [openId, setOpenId] = useState<number | null>(null)
  const [dayCursor, setDayCursor] = useState(0) // 日/周/月游标提升到 App:迷你月历跳转 + 键盘翻页
  const [weekCursor, setWeekCursor] = useState(0)
  const [monthCursor, setMonthCursor] = useState<MonthCursor | null>(null) // null = 默认月
  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [behindOpen, setBehindOpen] = useState(false)
  const behindTriggerRef = useRef<HTMLButtonElement>(null)
  const [friendsMap, setFriendsMap] = useState<FriendsMap>(new Map())
  const [friendErrors, setFriendErrors] = useState<Record<string, string>>({})
  const [now, setNow] = useState(() => Date.now())
  const [reminderStatus, setReminderStatus] = useState<Record<ReminderKind, ReminderStatus>>({
    watching: 'idle',
    other: 'idle',
  })
  const reminderSending = useRef(new Set<ReminderKind>())
  const [account, setAccount] = useState<BgmAccount | null>(() => loadAccount())
  const [syncState, setSyncState] = useState<{ msg: string; busy: boolean }>({ msg: '', busy: false })
  const [oauthConf, setOauthConf] = useState<OauthConf | null>(null)
  const oauthRef = useRef<OauthConf | null>(null)

  // ── 持久化 & 主题 ──────────────────────────────────────────────
  useEffect(() => {
    const saved = savePersisted({
      settings,
      tracking,
      overrides,
      filters: { cont: contSel, reg: regSel, repMin, src: srcSel, tag: tagSel },
    })
    setStorageError(saved ? '' : t('本机存储写入失败，请立即导出备份。'))
    document.documentElement.lang = settings.lang
  }, [settings, tracking, overrides, contSel, regSel, repMin, srcSel, tagSel])

  const backupDay = new Date(now).toLocaleDateString('sv-SE')
  useEffect(() => {
    if (!settings.backupEnabled) return
    const timer = window.setTimeout(() => {
      createBackup({ settings, tracking, overrides, filters: { cont: contSel, reg: regSel, repMin, src: srcSel, tag: tagSel } })
        .then(() => setBackupError(''))
        .catch(error => setBackupError(t('自动备份失败：{error}', { error: String(error) })))
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [settings, tracking, overrides, contSel, regSel, repMin, srcSel, tagSel, backupDay])

  // 主题切换时给全站颜色一个短暂的渐变窗口(首次挂载不做,避免开屏闪变)
  const themeAnimReady = useRef(false)
  useEffect(() => {
    if (!themeAnimReady.current) {
      themeAnimReady.current = true
      return
    }
    const el = document.documentElement
    el.setAttribute('data-theme-anim', '')
    const t = window.setTimeout(() => el.removeAttribute('data-theme-anim'), 300)
    return () => {
      window.clearTimeout(t)
      el.removeAttribute('data-theme-anim')
    }
  }, [actualTheme])

  // ── Bangumi 账号:令牌登录 + 双向同步 ───────────────────────────
  const accountRef = useRef(account)
  const trackingRef = useRef(tracking)
  useEffect(() => {
    accountRef.current = account
    saveAccount(account)
  }, [account])
  useEffect(() => {
    trackingRef.current = tracking
  }, [tracking])

  /** OAuth 令牌到期前静默续期;续不回来 → 标记失效。个人令牌原样通过。 */
  const ensureFresh = useCallback(async (): Promise<BgmAccount | null> => {
    if (syncPausedRef.current) return null
    const acc = accountRef.current
    if (!acc || acc.invalid) return null
    const fresh = await refreshIfNeeded(oauthRef.current, acc)
    if (!fresh) {
      setAccount({ ...acc, invalid: true })
      setSyncState({ msg: t('登录已过期,请重新登录'), busy: false })
      return null
    }
    if (fresh !== acc) {
      accountRef.current = fresh // setAccount 的 effect 是异步的,先手动同步 ref
      setAccount(fresh)
    }
    return fresh
  }, [])

  const drainTimer = useRef<number | null>(null)
  const drainingRef = useRef(false)
  const drainNow = useCallback(async () => {
    if (drainingRef.current || syncPausedRef.current) return
    drainingRef.current = true
    try {
      const acc = await ensureFresh()
      if (!acc || syncPausedRef.current) return
      await drainQueue(acc)
    } catch (e) {
      if (e instanceof BgmAuthError) setAccount((a) => (a ? { ...a, invalid: true } : a))
    } finally { drainingRef.current = false }
  }, [ensureFresh])
  const scheduleDrain = useCallback(() => {
    if (drainTimer.current) window.clearTimeout(drainTimer.current)
    drainTimer.current = window.setTimeout(drainNow, 1500)
  }, [drainNow])

  const syncingRef = useRef(false)
  const doSync = useCallback(async (force = false) => {
    if (syncingRef.current) return
    syncingRef.current = true
    const acc = await ensureFresh()
    if (!acc) {
      syncingRef.current = false
      return
    }
    setSyncState((s) => ({ ...s, busy: true }))
    try {
      if (acc.mergedOnce) await drainQueue(acc) // 先推后拉,拉到的就包含本机改动
      const remote = await pullCollections(acc, force)
      const { tracking: merged, pushes } = mergeRemote(trackingRef.current, remote, !acc.mergedOnce, queuedIds())
      setTracking(merged)
      const pushIds = Object.keys(pushes)
      for (const id of pushIds) enqueuePush(Number(id), pushes[Number(id)])
      if (pushIds.length) await drainQueue(acc)
      if (!acc.mergedOnce) setAccount((a) => (a ? { ...a, mergedOnce: true } : a))
      const at = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      setSyncState({
        msg: t('已同步 {t}', { t: at }) + (pushIds.length ? t(' · 推回 {n} 条', { n: pushIds.length }) : ''),
        busy: false,
      })
    } catch (e) {
      if (e instanceof BgmAuthError) {
        setAccount((a) => (a ? { ...a, invalid: true } : a))
        setSyncState({ msg: t('令牌已失效,请重新连接'), busy: false })
      } else {
        setSyncState({ msg: t('同步失败:{e}', { e: e instanceof Error ? e.message : String(e) }), busy: false })
      }
    } finally {
      syncingRef.current = false
    }
  }, [ensureFresh])

  useEffect(() => {
    if (!account?.token || account.invalid) return
    doSync()
    const id = window.setInterval(() => doSync(), 30 * 60_000) // 拉取本身有 1h 缓存,间隔只是兜底
    return () => window.clearInterval(id)
  }, [account?.token, account?.invalid, doSync])

  const bgmLogin = useCallback(async (token: string) => {
    const me = await verifyToken(token.trim()) // 失败抛错,由设置页展示
    syncPausedRef.current = false; setSyncPaused(false); localStorage.removeItem('btt:bgm:sync-paused:v1')
    setAccount({ token: token.trim(), ...me, mergedOnce: false })
  }, [])

  const bgmLogout = useCallback(() => {
    const acc = accountRef.current
    if (acc) clearPullCache(acc.username)
    clearQueue()
    setAccount(null) // 本机追番记录保留
    setSyncState({ msg: '', busy: false })
  }, [])

  // OAuth(可选):读站点根目录 oauth.json;URL 带 ?code= 时完成一键登录
  useEffect(() => {
    let alive = true
    ;(async () => {
      const conf = await fetchOauthConf()
      if (!alive) return
      oauthRef.current = conf
      setOauthConf(conf)
      if (!conf) return
      try {
        const acc = await completeOauthLogin(conf)
        if (acc && alive) setAccount(acc) // 触发首次双向合并
      } catch (e) {
        if (!alive) return
        setSyncState({ msg: t('Bangumi 登录失败:{e}', { e: e instanceof Error ? e.message : String(e) }), busy: false })
        setShowSettings(true) // 让错误立刻可见
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const oauthLogin = useCallback(() => {
    if (oauthRef.current) beginOauthLogin(oauthRef.current)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // ── 数据加载:calendar × bangumi-data × yuc 增强 ────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [cal, bd, enh] = await Promise.all([fetchCalendar(), fetchBangumiData(), fetchEnhance()])
        if (!alive) return
        setScheduleDataAt(enh.syncedAt)
        setDataSource(enh.stale ? '离线缓存（更新失败）' : enh.source === 'remote' ? '在线数据' : enh.source === 'cache' ? '本机缓存' : '安装包内置数据')
        setShows(buildShows(cal, bd, enh, Date.now()))
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e))
      }
    })()
    fetchSeasonList().then((list) => alive && setSeasonList(list))
    return () => {
      alive = false
    }
  }, [])

  const refreshScheduleData = useCallback(async () => {
    if (dataBusy) return
    setDataBusy(true); setDataMessage('')
    try {
      const [cal, bd, enh] = await Promise.all([fetchCalendar(), fetchBangumiData(), fetchEnhance(true)])
      setScheduleDataAt(enh.syncedAt); setDataSource(enh.source === 'remote' ? '在线数据' : '安装包内置数据')
      setShows(buildShows(cal, bd, enh, Date.now())); setLoadError(null)
      setDataMessage(t('放送数据已更新。'))
    } catch (error) { setDataMessage(t('数据更新失败，保留现有数据：{error}', { error: String(error) })) }
    finally { setDataBusy(false) }
  }, [dataBusy])
  useEffect(() => {
    if (!isNativeApp()) return
    const timer = window.setInterval(() => void refreshScheduleData(), 12 * 3600_000)
    return () => window.clearInterval(timer)
  }, [refreshScheduleData])

  // ── 归档季数据包(静态文件,按需加载) ────────────────────────────
  useEffect(() => {
    if (seasonSel === 'live' || packs[seasonSel]) return
    let alive = true
    fetchSeasonPack(seasonSel)
      .then((list) => alive && setPacks((p) => ({ ...p, [seasonSel]: list })))
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [seasonSel, packs])

  // ── 背景补全:优先在追/想看,再补齐所有缺失封面(详情缓存 7 天) ──
  const enriched = useRef(new Set<number>())
  useEffect(() => {
    if (!shows) return
    const priority = (s: Show) => {
      const status = tracking.status[s.id]
      return status === 'watching' || status === 'wish' ? 2 : !s.fromCalendar ? 1 : 0
    }
    const targets = shows
      .filter((s) => {
        const tracked = tracking.status[s.id] === 'watching' || tracking.status[s.id] === 'wish'
        return (!s.image || (tracked && !s.epsTotal)) && !enriched.current.has(s.id)
      })
      .sort((a, b) => priority(b) - priority(a))
    if (targets.length === 0) return
    let alive = true
    ;(async () => {
      for (const t of targets) {
        enriched.current.add(t.id)
        try {
          const cached = readCachedSubject(t.id)
          const info = cached ?? (await fetchSubject(t.id))
          if (!alive) return
          applySubjectInfo(info)
          // 缓存命中不占用网络配额；真实请求限制在约每秒 3 次。
          if (!cached) await new Promise((r) => setTimeout(r, 350))
        } catch (error) {
          enriched.current.delete(t.id)
          console.warn(`补全番剧 ${t.id} 的封面失败`, error)
        }
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows === null, tracking.status])

  const applySubjectInfo = useCallback((info: SubjectInfo) => {
    setShows((prev) =>
      prev
        ? prev.map((s) =>
            s.id === info.id
              ? {
                  ...s,
                  epsTotal: s.epsTotal ?? info.eps,
                  image: s.image ?? info.image,
                  score: s.score ?? info.score,
                  rank: s.rank ?? info.rank,
                  ratingTotal: s.ratingTotal ?? info.ratingTotal,
                }
              : s,
          )
        : prev,
    )
  }, [])

  // ── 好友进度 ───────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    if (settings.friends.length === 0) {
      setFriendsMap(new Map())
      return
    }
    ;(async () => {
      const map: FriendsMap = new Map()
      const errs: Record<string, string> = {}
      for (const user of settings.friends) {
        try {
          const cols = await fetchUserWatching(user)
          for (const c of cols) {
            let m = map.get(c.subjectId)
            if (!m) {
              m = new Map()
              map.set(c.subjectId, m)
            }
            m.set(user, { ep: c.ep, updatedAt: c.updatedAt })
          }
        } catch (e) {
          errs[user] = e instanceof Error && e.message.includes('404') ? '用户不存在或收藏不公开' : '拉取失败'
        }
        if (!alive) return
      }
      if (alive) {
        setFriendsMap(map)
        setFriendErrors(errs)
      }
    })()
    return () => {
      alive = false
    }
  }, [settings.friends])

  // ── 当季实时 / 归档数据包二选一,再叠加本机放送校正 ─────────────
  const archive = seasonSel !== 'live'
  const season = currentSeason(now)
  const seasonStart = archive ? seasonStartOf(seasonSel) : seasonStartInstant(now)
  const baseShows = archive ? (packs[seasonSel] ?? null) : shows

  const effShows = useMemo(
    () => (baseShows ? baseShows.map((s) => (overrides[s.id] ? { ...s, airFix: overrides[s.id] } : s)) : null),
    [baseShows, overrides],
  )
  // 浏览归档季时,每日提醒仍始终使用实时当季数据。
  const liveReminderShows = useMemo(
    () => (shows ? shows.map((s) => (overrides[s.id] ? { ...s, airFix: overrides[s.id] } : s)) : null),
    [shows, overrides],
  )

  const setOverride = useCallback((id: number, fix: AirFix | null) => {
    setOverrides((o) => {
      const next = { ...o }
      if (fix === null) delete next[id]
      else next[id] = fix
      return next
    })
  }, [])

  // ── 过滤 ───────────────────────────────────────────────────────
  const visibleShows = useMemo(() => {
    if (!effShows) return []
    const q = query.trim().toLowerCase()
    return effShows.filter((s) => {
      const st = tracking.status[s.id]
      if (filter === 'mine' && st !== 'watching' && st !== 'wish' && st !== 'paused') return false
      if (filter === 'watching' && st !== 'watching') return false
      if (filter === 'wish' && st !== 'wish') return false
      if (filter === 'paused' && st !== 'paused') return false
      if (!contSel.includes(continuity(s, seasonStart))) return false
      if (!regSel.includes(regionClass(s.region))) return false
      if (repMin > 0) {
        const w = weightedScore(s.score, s.ratingTotal)
        if (w === undefined || w < repMin) return false
      }
      if (srcSel && s.sourceType !== srcSel) return false
      if (tagSel && !(s.tags ?? []).includes(tagSel)) return false
      if (q) {
        const hay = `${s.nameCn} ${s.nameJp} ${s.nameHant ?? ''} ${s.nameEn ?? ''} ${(s.tags ?? []).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [effShows, filter, query, tracking.status, seasonStart, contSel, regSel, repMin, srcSel, tagSel])

  // 筛选面板的 facet 统计(基于未过滤全集,数量不随选择跳动)
  const facets = useMemo(() => {
    const cont: Record<Continuity, number> = { new: 0, carry: 0, long: 0 }
    const reg: Record<RegionClass, number> = { jp: 0, cn: 0, other: 0, unknown: 0 }
    const src = new Map<string, number>()
    const tags = new Map<string, number>()
    for (const s of effShows ?? []) {
      cont[continuity(s, seasonStart)]++
      reg[regionClass(s.region)]++
      if (s.sourceType) src.set(s.sourceType, (src.get(s.sourceType) ?? 0) + 1)
      for (const t of s.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1)
    }
    const desc = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])
    return { cont, reg, src: desc(src), tags: desc(tags).slice(0, 24) }
  }, [effShows, seasonStart])

  const advCount =
    (contSel.length < 3 ? 1 : 0) +
    (regSel.length < 4 ? 1 : 0) +
    (repMin > 0 ? 1 : 0) +
    (srcSel ? 1 : 0) +
    (tagSel ? 1 : 0)

  const toggleCont = useCallback((k: Continuity) => {
    setContSel((cur) => {
      if (cur.includes(k)) {
        const next = cur.filter((x) => x !== k)
        return next.length > 0 ? next : cur // 至少留一类,清空没有意义
      }
      return [...cur, k]
    })
  }, [])

  const toggleReg = useCallback((k: RegionClass) => {
    setRegSel((cur) => {
      if (cur.includes(k)) {
        const next = cur.filter((x) => x !== k)
        return next.length > 0 ? next : cur // 至少留一类
      }
      return [...cur, k]
    })
  }, [])

  const clearAdv = useCallback(() => {
    setContSel(['new', 'carry', 'long'])
    setRegSel(['jp', 'cn', 'other', 'unknown'])
    setRepMin(0)
    setSrcSel(null)
    setTagSel(null)
  }, [])

  // 点击面板外关闭
  useEffect(() => {
    if (!advOpen) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.adv-wrap')) setAdvOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [advOpen])

  // 顶栏落后集数明细:点击外部或按 Escape 收起。
  useEffect(() => {
    if (!behindOpen) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.behind-wrap')) setBehindOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBehindOpen(false)
        behindTriggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [behindOpen])

  const stats = useMemo(() => {
    if (!effShows) return null
    // 只数本季在播的(账号同步后 tracking 会含跨季收藏,不能全量数)
    const watching = effShows.filter((s) => tracking.status[s.id] === 'watching').length
    const behindItems = effShows
      .map((show) => {
        const progress = behindProgress(show, tracking, now)
        return progress ? { show, ...progress } : null
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.count - a.count || a.show.id - b.show.id)
    const behindTotal = behindItems.reduce((sum, item) => sum + item.count, 0)
    return { total: effShows.length, watching, behindTotal, behindItems }
  }, [effShows, tracking, now])

  useEffect(() => {
    if (!stats?.behindTotal) setBehindOpen(false)
  }, [stats?.behindTotal])

  const setStatus = useCallback(
    (id: number, s: WatchStatus | null) => {
      {
        const status = { ...trackingRef.current.status }
        if (s === null) delete status[id]
        else status[id] = s
        const next = { ...trackingRef.current, status }
        trackingRef.current = next; setTracking(next)
      }
      // bgm API 无"删除收藏",本地取消追番不回写
      const acc = accountRef.current
      if (acc && !acc.invalid && s !== null && !syncPausedRef.current) {
        enqueuePush(id, { type: STATUS_TO_TYPE[s] })
        scheduleDrain()
      }
    },
    [scheduleDrain],
  )

  const setWatched = useCallback(
    (id: number, n: number, allowUndo = true) => {
      n = Math.max(0, Math.min(100000, Math.floor(n)))
      if (!Number.isFinite(n)) return
      const before = trackingRef.current.watched[id] ?? 0
      if (before === n) return
      const next = { ...trackingRef.current, watched: { ...trackingRef.current.watched, [id]: n } }
      trackingRef.current = next; setTracking(next)
      setUndoProgress(allowUndo ? { id, before, after: n } : null)
      const acc = accountRef.current
      if (acc && !acc.invalid && !syncPausedRef.current) {
        const st = trackingRef.current.status[id] ?? 'watching' // 改进度即视为在看
        enqueuePush(id, { type: STATUS_TO_TYPE[st], ep: n })
        scheduleDrain()
      }
    },
    [scheduleDrain],
  )

  const setMemo = useCallback(
    (id: number, memo: CollectMemo) => {
      setTracking((t) => {
        const memos = { ...t.memos }
        if (Object.keys(memo).length === 0) delete memos[id]
        else memos[id] = memo
        return { ...t, memos }
      })
      const acc = accountRef.current
      const st = trackingRef.current.status[id]
      if (acc && !acc.invalid && st && !syncPausedRef.current) {
        // 全量三字段一起写回,空值即清空,与 bgm 收藏面板语义一致
        enqueuePush(id, {
          type: STATUS_TO_TYPE[st],
          tags: memo.tags ?? [],
          comment: memo.comment ?? '',
          private: memo.private ?? false,
        })
        scheduleDrain()
      }
    },
    [scheduleDrain],
  )

  const setRate = useCallback(
    (id: number, rate: number) => {
      setTracking((t) => {
        const rates = { ...t.rates }
        if (rate === 0) delete rates[id]
        else rates[id] = rate
        return { ...t, rates }
      })
      const acc = accountRef.current
      const st = trackingRef.current.status[id]
      // bgm 的评分挂在收藏上:未收藏只存本机,不回写
      if (acc && !acc.invalid && st && !syncPausedRef.current) {
        enqueuePush(id, { type: STATUS_TO_TYPE[st], rate })
        scheduleDrain()
      }
    },
    [scheduleDrain],
  )

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  const setReminderKindStatus = useCallback((kind: ReminderKind, status: ReminderStatus) => {
    setReminderStatus((current) => ({ ...current, [kind]: status }))
  }, [])

  const setDailyReminderEnabled = useCallback(
    async (kind: ReminderKind, enabled: boolean) => {
      const patch: Partial<Settings> =
        kind === 'watching' ? { watchingReminderEnabled: enabled } : { otherReminderEnabled: enabled }
      if (!enabled) {
        patchSettings(patch)
        setReminderKindStatus(kind, 'idle')
        return
      }
      // 富提醒窗口无需系统通知授权；网页端仍需浏览器通知权限。
      if (isNativeApp()) {
        patchSettings(patch)
        setReminderKindStatus(kind, 'enabled')
        return
      }
      try {
        const access = await requestNotificationAccess()
        if (access === 'granted') patchSettings(patch)
        setReminderKindStatus(kind, access === 'granted' ? 'enabled' : access)
      } catch {
        setReminderKindStatus(kind, 'failed')
      }
    },
    [patchSettings, setReminderKindStatus],
  )

  const testDailyReminder = useCallback(
    async (kind: ReminderKind) => {
      if (!liveReminderShows) {
        setReminderKindStatus(kind, 'failed')
        return
      }
      try {
        const payload = { ...buildRichReminderPayload(liveReminderShows, tracking, { ...settings, theme: actualTheme }, Date.now(), kind), preview: true }
        const access = await deliverReminder(payload, true)
        setReminderKindStatus(kind, access === 'granted' ? 'sent' : access)
      } catch {
        setReminderKindStatus(kind, 'failed')
      }
    },
    [liveReminderShows, settings, actualTheme, setReminderKindStatus, tracking],
  )

  useEffect(() => {
    if (!liveReminderShows) return
    const dueKinds = REMINDER_KINDS.filter(
      (kind) =>
        !reminderSending.current.has(kind) &&
        isDailyReminderDue(now, settings, kind, readLastReminderDay(kind)),
    )
    if (!dueKinds.length) return

    let alive = true
    dueKinds.forEach((kind) => reminderSending.current.add(kind))
    ;(async () => {
      const day = reminderDayKey(now, settings)
      for (const kind of dueKinds) {
        try {
          const payload = buildRichReminderPayload(liveReminderShows, tracking, { ...settings, theme: actualTheme }, now, kind)
          // 没有符合条件的更新时安静地记为完成，避免每天弹空卡片。
          if (payload.items.length) {
            const access = await deliverReminder(payload, false)
            if (access !== 'granted') {
              if (alive) setReminderKindStatus(kind, access)
              markReminderDelivered(kind, day)
              continue
            }
            if (alive) setReminderKindStatus(kind, 'sent')
          }
          markReminderDelivered(kind, day)
        } catch {
          if (alive) setReminderKindStatus(kind, 'failed')
          markReminderDelivered(kind, day)
        } finally {
          reminderSending.current.delete(kind)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [liveReminderShows, now, settings, actualTheme, setReminderKindStatus, tracking])

  const relativeSending = useRef(false)
  const relativeRetryAt = useRef(0)
  useEffect(() => {
    if (!liveReminderShows || relativeSending.current || now < relativeRetryAt.current) return
    const due = buildEpisodeReminders(liveReminderShows, tracking, { ...settings, theme: actualTheme }, now).filter(x => !episodeReminderSent(x.key))
    const snoozes = snoozedReminders().filter(x => x.due <= now)
    if (!due.length && !snoozes.length) return
    relativeSending.current = true
    void (async () => {
      try {
        if (due.length) {
          const payload = { ...due[0].payload, items: due.flatMap(x => x.payload.items) }
          if (await deliverReminder(payload, false) === 'granted') markEpisodeReminders(due.map(x => x.key), now)
        }
        for (const snooze of snoozes) {
          const items = snooze.payload.items.filter(item => {
            const status = tracking.status[item.id]
            return snooze.payload.kind === 'watching' ? status === 'watching' && (!item.episodeNumber || (tracking.watched[item.id] ?? 0) < item.episodeNumber) : !['watching','paused','done','dropped'].includes(status) && (settings.otherReminderScope !== 'wish' || status === 'wish')
          })
          if (now - snooze.due > 24 * 3600_000 || !items.length) { removeSnooze(snooze.key); continue }
          if (await deliverReminder({ ...snooze.payload, items, theme: actualTheme, lang: settings.lang, autoHideSeconds: settings.reminderDismissSeconds }, false) === 'granted') removeSnooze(snooze.key)
        }
      } catch (error) { console.warn('逐集／稍后提醒失败', error) }
      finally { relativeSending.current = false; relativeRetryAt.current = Date.now() + 60_000 }
    })()
  }, [liveReminderShows, tracking, settings, actualTheme, now])

  const exportIcs = useCallback(() => {
    if (effShows) downloadIcs(buildIcs(effShows, tracking, Date.now()))
  }, [effShows, tracking])

  const wide = useWideLayout()
  const openShow = openId !== null && effShows ? (effShows.find((s) => s.id === openId) ?? null) : null
  const effView: View = archive && view === 'day' ? 'week' : view

  // 点卡片打开详情;侧栏收起时自动展开
  const openDetail = useCallback(
    (id: number) => {
      setOpenId(id)
      setSettings((s) => (s.panelOpen ? s : { ...s, panelOpen: true }))
    },
    [],
  )
  const restoreData = useCallback(async (data: Persisted) => {
    if (syncingRef.current || drainingRef.current) throw new Error(t('同步正在进行，请稍后恢复。'))
    const wasPaused = syncPausedRef.current
    // Pause before asynchronous I/O so a timed sync cannot begin during the snapshot.
    localStorage.setItem('btt:bgm:sync-paused:v1', 'true')
    syncPausedRef.current = true; setSyncPaused(true)
    if (drainTimer.current) window.clearTimeout(drainTimer.current)
    try {
      await createBackup(loadPersisted(), 'restore')
      if (!savePersisted(data)) throw new Error(t('本机存储写入失败，请立即导出备份。'))
    } catch (error) {
      syncPausedRef.current = wasPaused; setSyncPaused(wasPaused)
      if (!wasPaused) localStorage.removeItem('btt:bgm:sync-paused:v1')
      throw error
    }
    setSettings(data.settings); trackingRef.current = data.tracking; setTracking(data.tracking); setOverrides(data.overrides)
    setContSel(data.filters.cont); setRegSel(data.filters.reg); setRepMin(data.filters.repMin); setSrcSel(data.filters.src); setTagSel(data.filters.tag)
    setUndoProgress(null)
  }, [])
  const resumeSync = useCallback(() => {
    if (syncPausedRef.current) {
      if (!window.confirm(t('恢复同步会按本机优先合并，并可能写回 Bangumi 收藏。继续？'))) return
      syncPausedRef.current = false; setSyncPaused(false); localStorage.removeItem('btt:bgm:sync-paused:v1')
      const acc = accountRef.current
      if (acc) { accountRef.current = { ...acc, mergedOnce: false }; setAccount(accountRef.current) }
    }
    void doSync(true)
  }, [doSync])
  useEffect(() => {
    if (!isNativeApp()) return
    let alive = true, dispose: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) => listen<ReminderAction>(REMINDER_ACTION_EVENT, async ({ payload: action }) => {
      if (!['watching','other'].includes(action?.kind) || !Number.isInteger(action?.id)) return
      try {
        const payload: RichReminderPayload = JSON.parse(localStorage.getItem(reminderPayloadKey(action.kind)) ?? 'null')
        const item = payload?.items.find(x => x.id === action.id)
        const show = liveReminderShows?.find(x => x.id === action.id)
        if (!item || payload.preview || !show) return
        if (action.action === 'detail') {
          setSeasonSel('live'); setShowSettings(false); setShowPending(false); openDetail(show.id)
          const { getCurrentWindow } = await import('@tauri-apps/api/window')
          const window = getCurrentWindow(); await window.unminimize(); await window.show(); await window.setFocus()
        } else if (action.action === 'snooze') snoozeReminder(payload, show.id, Date.now())
        else if (action.action === 'watched' && trackingRef.current.status[show.id] === 'watching' && item.episodeNumber && item.airAt && item.airAt <= Date.now()) {
          const aired = airedEps(show, Date.now())
          if (aired !== undefined && item.episodeNumber <= aired && item.episodeNumber > (trackingRef.current.watched[show.id] ?? 0)) setWatched(show.id, item.episodeNumber)
        }
      } catch (error) { console.warn('提醒操作失败', error) }
    })).then(fn => { if (alive) dispose = fn; else fn() }).catch(error => console.warn('Reminder actions unavailable', error))
    return () => { alive = false; dispose?.() }
  }, [liveReminderShows, openDetail, setWatched])
  const jumpToDay = useCallback((offset: number) => {
    withViewTransition(() => {
      setDayCursor(offset)
      setView('day')
    })
  }, [])

  // 视图/翻页/换季一律走交叉淡化(不支持时瞬时切换)
  const changeView = useCallback((v: View) => withViewTransition(() => setView(v)), [])
  const pageDay = useCallback((o: number) => withViewTransition(() => setDayCursor(o)), [])
  const pageWeek = useCallback((o: number) => withViewTransition(() => setWeekCursor(o)), [])
  const pageMonthTo = useCallback((c: MonthCursor | null) => withViewTransition(() => setMonthCursor(c)), [])

  // 点详情页的题材标签 → 落到筛选面板的题材项(精确匹配,筛选按钮亮起计数)
  const searchTag = useCallback(
    (t: string) => {
      setTagSel(t)
      if (!wide) setOpenId(null)
    },
    [wide],
  )

  // 换季时游标复位
  useEffect(() => {
    setDayCursor(0)
    setWeekCursor(0)
    setMonthCursor(null)
    setBehindOpen(false)
  }, [seasonSel])

  const defaultMonth: MonthCursor = useMemo(() => {
    if (archive) return seasonMonthOf(seasonSel)
    const p = partsInZone(now, displayTz(settings))
    return { y: p.y, mo: p.mo }
  }, [archive, seasonSel, now, settings])
  const effMonthCursor = monthCursor ?? defaultMonth

  // 键盘快捷键:←/→ 翻页,Home 回到今天/本周/本月,D/W/M 切视图
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (behindOpen || showSettings || showAbout || showPending || (!wide && openId !== null)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))
        return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const pageMonth = (d: number) => {
        const idx = effMonthCursor.y * 12 + (effMonthCursor.mo - 1) + d
        pageMonthTo({ y: Math.floor(idx / 12), mo: (idx % 12) + 1 })
      }
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowRight': {
          const d = e.key === 'ArrowLeft' ? -1 : 1
          if (effView === 'day') withViewTransition(() => setDayCursor((c) => c + d))
          else if (effView === 'week') withViewTransition(() => setWeekCursor((c) => c + d))
          else pageMonth(d)
          e.preventDefault()
          break
        }
        case 'Home':
          if (effView === 'day') pageDay(0)
          else if (effView === 'week') pageWeek(0)
          else pageMonthTo(null)
          e.preventDefault()
          break
        case 'd':
        case 'D':
          if (!archive) changeView('day')
          break
        case 'w':
        case 'W':
          changeView('week')
          break
        case 'm':
        case 'M':
          changeView('month')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [behindOpen, showSettings, showAbout, showPending, wide, openId, effView, archive, effMonthCursor, changeView, pageDay, pageWeek, pageMonthTo])

  const panelW = effView === 'day' ? settings.panelWidthDay : settings.panelWidth
  const viewProps = { tracking, settings, now, seasonStart, archive, friendsMap, onOpen: openDetail }

  return (
    <div className="container">
      <header className="site-header">
        <h1>
          {t('番组课表')}
          <select
            className="season-sel"
            value={seasonSel}
            onChange={(e) => {
              const v = e.target.value
              withViewTransition(() => setSeasonSel(v))
            }}
            title={t('切换季度')}
          >
            <option value="live">
              {season.label}
              {t('(当季)')}
            </option>
            {seasonList
              .filter((s) => s !== season.yyyymm)
              .map((s) => (
                <option key={s} value={s}>
                  {fmtSeason(s)}
                </option>
              ))}
          </select>
        </h1>
        {stats && (
          <div className="stats">
            {t(archive ? '该季收录' : '本季在播')} <b>{stats.total}</b> {t('部')} · {t('在看')}{' '}
            <b>{stats.watching}</b>
            {stats.behindTotal > 0 && (
              <span className="behind-wrap">
                {' '}
                <button
                  ref={behindTriggerRef}
                  type="button"
                  className="behind-total"
                  aria-expanded={behindOpen}
                  aria-controls="behind-popover"
                  aria-haspopup="dialog"
                  title={t('查看未看明细')}
                  onClick={() => setBehindOpen((open) => !open)}
                >
                  {t('欠了 {n} 集没看', { n: stats.behindTotal })}
                  <span className="behind-caret" aria-hidden>⌄</span>
                </button>
                {behindOpen && (
                  <span id="behind-popover" className="behind-popover" role="dialog" aria-label={t('未看明细')}>
                    <span className="behind-popover-head">
                      <strong>{t('未看明细')}</strong>
                      <small>{t('共 {n} 集', { n: stats.behindTotal })}</small>
                    </span>
                    <span className="behind-list">
                      {stats.behindItems.map((item) => (
                        <button
                          type="button"
                          className="behind-row"
                          key={item.show.id}
                          title={t('打开番剧详情')}
                          onClick={() => {
                            openDetail(item.show.id)
                            setBehindOpen(false)
                          }}
                        >
                          <span className="behind-name">{displayName(item.show)}</span>
                          <span className="behind-eps">
                            {item.fromEpisode === item.toEpisode
                              ? t('第 {n} 集', { n: item.fromEpisode })
                              : t('第 {from}–{to} 集', { from: item.fromEpisode, to: item.toEpisode })}
                          </span>
                        </button>
                      ))}
                    </span>
                    <span className="behind-popover-note">{t('根据“看到第几集”与当前已播进度计算。')}</span>
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        <span className="spacer" />
        <span className="domains" title={t('Bangumi 各域名登录互不相通,选常用的')}>
          {['bgm.tv', 'bangumi.tv', 'chii.in'].map((d) => (
            <a key={d} href={`https://${d}`} target="_blank" rel="noreferrer">
              {d}
            </a>
          ))}
        </span>
        <select
          className="season-sel theme-sel"
          title={t('色彩模式')}
          value={actualTheme}
          onChange={(e) => patchSettings({ theme: e.target.value as Settings['theme'], themeMode: 'manual' })}
        >
          {THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {t(theme.label)}
            </option>
          ))}
        </select>
        <select
          className="season-sel lang-sel"
          title={t('语言')}
          value={settings.lang}
          onChange={(e) => patchSettings({ lang: e.target.value as Lang })}
        >
          {LANGS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <button className="iconbtn" onClick={() => setShowAbout(true)}>
          ⓘ {t('关于')}
        </button>
        <button className="iconbtn" onClick={() => setShowSettings(true)}>
          ⚙ {t('设置')}
        </button>
        <button className="iconbtn" onClick={() => setShowPending(true)}>{t('待看清单')}</button>
        {updates.status === 'available' && <button className="iconbtn accent" onClick={() => setShowSettings(true)}>{t('发现新版本')}</button>}
      </header>

      <div className="toolbar">
        {storageError && <span className="err" role="alert">{storageError}</span>}
        <span className="seg">
          {(
            [
              ['day', '日'],
              ['week', '周'],
              ['month', '月'],
            ] as [View, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              className={effView === k ? 'on' : ''}
              disabled={archive && k === 'day'}
              title={archive && k === 'day' ? t('日视图仅当季可用') : undefined}
              onClick={() => changeView(k)}
            >
              {t(label)}
            </button>
          ))}
        </span>

        {FILTERS.map((f) => (
          <button key={f.k} className={`chip${filter === f.k ? ' on' : ''}`} onClick={() => setFilter(f.k)}>
            {t(f.label)}
          </button>
        ))}

        <span className="adv-wrap">
          <button
            className={`chip${advCount > 0 ? ' on' : ''}`}
            title={t('范围 / 产地 / 口碑 / 来源 / 题材')}
            onClick={() => setAdvOpen((v) => !v)}
          >
            {t('筛选')}
            {advCount > 0 ? ` ${advCount}` : ''} ▾
          </button>
          {advOpen && (
            <div className="filter-pop">
              <div className="fp-row">
                <span className="fp-t">{t('范围')}</span>
                <span className="fp-chips">
                  {CONT_OPTS.map((o) => (
                    <button
                      key={o.k}
                      className={`chip${contSel.includes(o.k) ? ' on' : ''}`}
                      title={t(o.title)}
                      onClick={() => toggleCont(o.k)}
                    >
                      {t(o.label)} <i>{facets.cont[o.k]}</i>
                    </button>
                  ))}
                </span>
              </div>
              {facets.reg.cn + facets.reg.other + facets.reg.unknown > 0 && (
                <div className="fp-row">
                  <span className="fp-t">{t('产地')}</span>
                  <span className="fp-chips">
                    {REG_OPTS.filter((o) => facets.reg[o.k] > 0).map((o) => (
                      <button
                        key={o.k}
                        className={`chip${regSel.includes(o.k) ? ' on' : ''}`}
                        title={t(o.title)}
                        onClick={() => toggleReg(o.k)}
                      >
                        {t(o.label)} <i>{facets.reg[o.k]}</i>
                      </button>
                    ))}
                  </span>
                </div>
              )}
              <div className="fp-row">
                <span className="fp-t">{t('口碑')}</span>
                <span className="seg small">
                  {REP_OPTS.map((o) => (
                    <button key={o.v} className={repMin === o.v ? 'on' : ''} onClick={() => setRepMin(o.v)}>
                      {o.v === 0 ? t('不限') : o.label}
                    </button>
                  ))}
                </span>
                <span className="fp-hint">{t('按评分人数加权,小样本高分不虚高')}</span>
              </div>
              {facets.src.length > 0 && (
                <div className="fp-row">
                  <span className="fp-t">{t('来源')}</span>
                  <span className="fp-chips">
                    {facets.src.map(([k, n]) => (
                      <button
                        key={k}
                        className={`chip${srcSel === k ? ' on' : ''}`}
                        onClick={() => setSrcSel(srcSel === k ? null : k)}
                      >
                        {k} <i>{n}</i>
                      </button>
                    ))}
                  </span>
                </div>
              )}
              {facets.tags.length > 0 && (
                <div className="fp-row">
                  <span className="fp-t">{t('题材')}</span>
                  <span className="fp-chips">
                    {facets.tags.map(([k, n]) => (
                      <button
                        key={k}
                        className={`chip${tagSel === k ? ' on' : ''}`}
                        onClick={() => setTagSel(tagSel === k ? null : k)}
                      >
                        {k} <i>{n}</i>
                      </button>
                    ))}
                  </span>
                </div>
              )}
              <div className="fp-row">
                <button className="iconbtn" disabled={advCount === 0} onClick={clearAdv}>
                  {t('清除筛选')}
                </button>
              </div>
            </div>
          )}
        </span>

        <input
          type="search"
          className="search"
          placeholder={t('搜索标题 / 标签…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <span className="spacer" style={{ flex: 1 }} />

        <span className="seg small" title={t('时区')}>
          <button className={settings.tzMode === 'local' ? 'on' : ''} onClick={() => patchSettings({ tzMode: 'local' })}>
            {t('本地时间')}
          </button>
          <button className={settings.tzMode === 'jst' ? 'on' : ''} onClick={() => patchSettings({ tzMode: 'jst' })}>
            {t('日本时间')}
          </button>
        </span>
        {wide && (
          <button
            className="iconbtn"
            title={settings.panelOpen ? t('收起侧栏') : t('展开侧栏')}
            onClick={() => patchSettings({ panelOpen: !settings.panelOpen })}
          >
            {settings.panelOpen ? '⇥' : '⇤'}
          </button>
        )}
      </div>

      {loadError ? (
        <div className="error-box">
          {t('数据加载失败:')}
          {loadError}
          <br />
          {t('请检查网络后')}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              location.reload()
            }}
          >
            {t('重试')}
          </a>
        </div>
      ) : effShows === null ? (
        <div className="loading">
          {archive ? t('正在加载 {s} 归档…', { s: fmtSeason(seasonSel) }) : t('正在拉取本季放送表…')}
        </div>
      ) : (
        <div className={`content-row view-${effView}`}>
          <div className="view-area">
            {effView === 'week' && (
              <WeekView
                key={seasonSel}
                shows={visibleShows}
                weekOffset={weekCursor}
                onWeekOffset={pageWeek}
                {...viewProps}
              />
            )}
            {effView === 'day' && (
              <DayView
                key={seasonSel}
                shows={visibleShows}
                dayOffset={dayCursor}
                onDayOffset={pageDay}
                {...viewProps}
              />
            )}
            {effView === 'month' && (
              <MonthView
                key={seasonSel}
                shows={visibleShows}
                cursor={effMonthCursor}
                resetTo={defaultMonth}
                onCursor={pageMonthTo}
                {...viewProps}
              />
            )}
          </div>
          {wide && settings.panelOpen && (
            <SidePanel
              openShow={openShow}
              shows={effShows}
              tracking={tracking}
              settings={settings}
              now={now}
              seasonStart={seasonStart}
              archive={archive}
              friendsMap={friendsMap}
              hasLocalOverride={openShow ? openShow.id in overrides : false}
              tz={displayTz(settings)}
              width={panelW}
              view={effView}
              dayCursor={dayCursor}
              onResizeEnd={(w) =>
                w === null
                  ? patchSettings({ panelOpen: false })
                  : patchSettings(effView === 'day' ? { panelWidthDay: w } : { panelWidth: w })
              }
              onJumpDay={jumpToDay}
              onTag={searchTag}
              onOpen={openDetail}
              onSetStatus={setStatus}
              onSetWatched={setWatched}
              onSetRate={setRate}
              onSetMemo={setMemo}
              onSetOverride={setOverride}
              onSubjectInfo={applySubjectInfo}
              onClose={() => setOpenId(null)}
            />
          )}
        </div>
      )}

      {!wide && openShow && (
        <DetailModal
          show={openShow}
          tracking={tracking}
          settings={settings}
          now={now}
          seasonStart={seasonStart}
          friendsMap={friendsMap}
          hasLocalOverride={openShow.id in overrides}
          onSetStatus={setStatus}
          onSetWatched={setWatched}
          onSetRate={setRate}
          onSetMemo={setMemo}
          onSetOverride={setOverride}
          onSubjectInfo={applySubjectInfo}
          onTag={searchTag}
          onClose={() => setOpenId(null)}
        />
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showPending && liveReminderShows && <PendingPanel shows={liveReminderShows} tracking={tracking} settings={settings} now={now} onWatched={setWatched} onStatus={setStatus} onOpen={id => { setShowPending(false); setSeasonSel('live'); openDetail(id) }} onClose={() => setShowPending(false)} />}
      {undoProgress && <div className="undo-toast" role="status">{t('进度已更新到第 {n} 集', { n: undoProgress.after })}<button className="iconbtn" onClick={() => {
        if ((trackingRef.current.watched[undoProgress.id] ?? 0) === undoProgress.after) setWatched(undoProgress.id, undoProgress.before, false)
        else setUndoProgress(null)
      }}>{t('撤销')}</button><button className="iconbtn" aria-label={t('关闭')} onClick={() => setUndoProgress(null)}>×</button></div>}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          friendErrors={friendErrors}
          account={account}
          sync={syncState}
          scheduleDataAt={scheduleDataAt}
          oauth={oauthConf}
          reminderStatus={reminderStatus}
          onOauthLogin={oauthLogin}
          onLogin={bgmLogin}
          onLogout={bgmLogout}
          onSyncNow={resumeSync}
          syncPaused={syncPaused}
          features={<DesktopFeatures settings={settings} onChange={patchSettings} updates={updates} onRefreshData={refreshScheduleData} dataBusy={dataBusy} dataMessage={dataMessage} dataSource={dataSource} onRestore={restoreData} backupError={storageError || backupError} syncPaused={syncPaused} />}
          onChange={patchSettings}
          onReminderEnabled={setDailyReminderEnabled}
          onTestReminder={testDailyReminder}
          onExportIcs={exportIcs}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
