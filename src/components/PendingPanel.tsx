import { useMemo, useState } from 'react'
import type { Settings, Show, Tracking, WatchStatus } from '../types'
import { behindProgress } from '../lib/progress'
import { buildRichReminderPayload } from '../lib/notifications'
import { occurrencesBetween } from '../lib/schedule'
import { displayName, t } from '../lib/i18n'
import { displayTz, partsInZone, pad } from '../lib/time'

interface Props {
  shows: Show[]; tracking: Tracking; settings: Settings; now: number
  onOpen: (id: number) => void; onWatched: (id: number, n: number) => void
  onStatus: (id: number, status: WatchStatus | null) => void; onClose: () => void
}
export default function PendingPanel({ shows, tracking, settings, now, onOpen, onWatched, onStatus, onClose }: Props) {
  const [tab, setTab] = useState<'behind' | 'today' | 'next' | 'paused'>('behind')
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const today = new Map(buildRichReminderPayload(shows, tracking, settings, now, 'watching').items.map(x => [x.id, x]))
    return shows.flatMap(show => {
      const progress = behindProgress(show, tracking, now)
      const upcoming = occurrencesBetween(show, now, now + 24 * 3600_000)[0]
      const watching = tracking.status[show.id] === 'watching'
      if (tab === 'behind' && !progress) return []
      if (tab === 'today' && (!watching || !today.has(show.id))) return []
      if (tab === 'next' && (!watching || !upcoming)) return []
      if (tab === 'paused' && tracking.status[show.id] !== 'paused') return []
      if (!`${displayName(show)} ${show.nameJp}`.toLowerCase().includes(query.toLowerCase())) return []
      return [{ show, progress, at: upcoming?.t ?? today.get(show.id)?.airAt, today: today.get(show.id) }]
    }).sort((a,b) => tab === 'behind' ? (b.progress?.count ?? 0) - (a.progress?.count ?? 0) : (a.at ?? Infinity) - (b.at ?? Infinity))
  }, [shows, tracking, settings, now, tab, query])
  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <section className="modal pending-modal" role="dialog" aria-modal="true" aria-label={t('待看清单')} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <button className="close" onClick={onClose} aria-label={t('关闭')}>×</button>
      <h2>{t('待看清单')}</h2>
      <div className="pending-tools"><span className="seg small">{([['behind','已播未看'],['today','今日更新'],['next','未来 24 小时'],['paused','搁置']] as const).map(([key,label]) => <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>{t(label)}</button>)}</span>
        <input autoFocus aria-label={t('搜索番剧')} placeholder={t('搜索番剧')} value={query} onChange={e => setQuery(e.target.value)} /></div>
      <p className="feature-hint">{t('进度按连续观看记录：标记第 N 集，即表示第 1–N 集已看。')}</p>
      <div className="pending-list">{rows.length ? rows.map(({ show, progress, at, today }) => {
        const p = at ? partsInZone(at, displayTz(settings)) : null
        return <article key={show.id} className="pending-row">
          {show.image && <img className="cover" src={show.image} alt="" loading="lazy" />}
          <div className="pending-copy"><button className="title-link" onClick={() => onOpen(show.id)}>{displayName(show)}</button>
            <div className="feature-hint">{progress ? t('第 {from}–{to} 集', { from: progress.fromEpisode, to: progress.toEpisode }) : t('已追平')}{p && ` · ${p.mo}/${p.d} ${pad(p.hh)}:${pad(p.mm)}`}{today && ` · ${today.episode}`}</div>
            {progress && <div className="episode-buttons">{Array.from({ length: Math.min(progress.count, 30) }, (_, i) => progress.fromEpisode + i).map(ep => <button className="iconbtn" key={ep} title={t('看到第 {n} 集', { n: ep })} onClick={() => onWatched(show.id, ep)}>{t('第 {n} 集', { n: ep })}</button>)}{progress.count > 30 && <span>… {t('第 {n} 集', { n: progress.toEpisode })}</span>}</div>}
            <div className="pending-actions">{progress && <><button className="iconbtn" onClick={() => onWatched(show.id, progress.fromEpisode)}>{t('看完下一集')}</button><button className="iconbtn" onClick={() => { if (window.confirm(t('将进度补到第 {n} 集？', { n: progress.toEpisode }))) onWatched(show.id, progress.toEpisode) }}>{t('补到已播')}</button></>}
              {tab === 'paused' && <button className="iconbtn" onClick={() => onStatus(show.id, 'watching')}>{t('恢复在看')}</button>}</div>
          </div>
        </article>
      }) : <p className="empty-state">{t('此列表暂无番剧。')}</p>}</div>
    </section>
  </div>
}
