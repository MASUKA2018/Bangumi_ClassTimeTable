import { useEffect, useState } from 'react'
import type { RichReminderPayload, ReminderKind } from '../lib/notifications'
import { isNativeApp } from '../lib/native'
import { reminderPayloadKey, RICH_REMINDER_EVENT, REMINDER_ACTION_EVENT } from '../lib/reminderWindow'
import { setLang, t } from '../lib/i18n'
import Cover from './Cover'

const DEV_PREVIEW: RichReminderPayload = {
  kind: 'watching',
  heading: '今日在看更新',
  emptyText: '',
  theme: 'bgm-dark',
  lang: 'zh-Hans',
  items: [
    {
      id: 571910,
      title: '无自觉圣女今天也无意识地释放力量',
      cover: 'https://lain.bgm.tv/r/400/pic/cover/l/61/bf/571910_LUlnW.jpg',
      airTime: '22:00',
      episode: '更新至第 11 集',
    },
    {
      id: 558064,
      title: '女主角？圣女？不，我是杂役女仆（自豪）！',
      cover: 'https://lain.bgm.tv/r/400/pic/cover/l/04/e4/558064_Q15R6.jpg',
      airTime: '22:00',
      episode: '更新至第 11 集',
    },
  ],
}

function readPayload(kind: ReminderKind): RichReminderPayload | null {
  try {
    const raw = localStorage.getItem(reminderPayloadKey(kind))
    return raw ? (JSON.parse(raw) as RichReminderPayload) : import.meta.env.DEV ? { ...DEV_PREVIEW, kind } : null
  } catch {
    return import.meta.env.DEV ? { ...DEV_PREVIEW, kind } : null
  }
}

async function hidePopup() {
  if (!isNativeApp()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().hide()
}

export default function ReminderPopup({ kind }: { kind: ReminderKind }) {
  const [payload, setPayload] = useState<RichReminderPayload | null>(() => readPayload(kind))
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState(false)

  useEffect(() => {
    if (!isNativeApp()) return
    let alive = true, dispose: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) =>
      listen<RichReminderPayload>(RICH_REMINDER_EVENT, ({ payload: next }) => {
        if (!alive || next.kind !== kind) return
        setPayload(next)
        setIndex(0)
        setActionBusy(false)
        setActionError(false)
      }).then((fn) => {
        if (alive) dispose = fn
        else fn()
      }),
    ).catch(error => console.warn('Reminder listener unavailable', error))
    return () => { alive = false; dispose?.() }
  }, [kind])

  useEffect(() => {
    if (!payload || hovered || payload.autoHideSeconds === 0) return
    const timer = window.setTimeout(hidePopup, (payload.autoHideSeconds ?? 30) * 1000)
    return () => window.clearTimeout(timer)
  }, [payload, hovered])

  const item = payload?.items[index]
  const act = async (action: 'detail' | 'snooze' | 'watched') => {
    if (!item || !payload || payload.preview || actionBusy || !isNativeApp()) return
    setActionBusy(true); setActionError(false)
    try {
      const { emitTo } = await import('@tauri-apps/api/event')
      await emitTo('main', REMINDER_ACTION_EVENT, { kind, id: item.id, action })
      await hidePopup()
    } catch { setActionBusy(false); setActionError(true) }
  }

  if (!payload) return null
  setLang(payload.lang)
  document.documentElement.setAttribute('data-theme', payload.theme)
  document.documentElement.dataset.reminder = 'true'
  return (
    <div className="reminder-viewport" style={{ transform: `scale(${payload.popupScale ?? .75})` }}>
      <main className={`reminder-popup ${payload.kind}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <button className="reminder-close" onClick={hidePopup} aria-label={t('关闭')}>
          ×
        </button>
        <header className="reminder-heading">
          <span className="reminder-kind">{payload.kind === 'watching' ? '▶' : '✦'}</span>
          {payload.heading}
          {payload.items.length > 0 && <span className="reminder-count">{index + 1} / {payload.items.length}</span>}
        </header>
        {item ? (
          <section className="reminder-card">
            <div className="reminder-cover-wrap">
              <Cover src={item.cover} className="reminder-cover" fallback={<>番组<br />课表</>} />
            </div>
            <div className="reminder-copy">
              <h1>{item.title}</h1>
              <div className="reminder-meta">
                <span><b>{item.airTime}</b><small>{t('当天放送时间')}</small></span>
                <i />
                <span><b>{item.episode}</b><small>{t('更新进度')}</small></span>
              </div>
              <p>{t(payload.kind === 'watching' ? '今天的“在看”番剧已加入课表,记得准时收看。' : '今天还有这些尚未标记“在看”的番剧更新。')}</p>
              <div className="reminder-actions">
                <button disabled={actionBusy || payload.preview} onClick={() => act('detail')}>{t('查看详情')}</button>
                <button disabled={actionBusy || payload.preview} onClick={() => act('snooze')}>{t('10 分钟后提醒')}</button>
                {payload.kind === 'watching' && <button disabled={actionBusy || payload.preview || !item.episodeNumber || !item.airAt || item.airAt > Date.now()} onClick={() => act('watched')}>{t('看到本集')}</button>}
              </div>
              {payload.preview && <small>{t('预览模式，不会修改进度或安排提醒。')}</small>}
              {actionError && <small role="alert">{t('操作失败，请重试。')}</small>}
              {payload.items.length > 1 && (
                <nav className="reminder-nav" aria-label={t('切换番剧')}>
                  <button onClick={() => setIndex((index - 1 + payload.items.length) % payload.items.length)}>‹ {t('上一部')}</button>
                  <span>{payload.items.map((x, i) => <i key={x.id} className={i === index ? 'on' : ''} />)}</span>
                  <button onClick={() => setIndex((index + 1) % payload.items.length)}>{t('下一部')} ›</button>
                </nav>
              )}
            </div>
          </section>
        ) : (
          <div className="reminder-empty">{payload.emptyText}</div>
        )}
      </main>
    </div>
  )
}
