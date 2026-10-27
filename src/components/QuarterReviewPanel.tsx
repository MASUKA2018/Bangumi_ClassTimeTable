import { useEffect, useState } from 'react'
import type { Show, Tracking } from '../types'
import { adjacentSeason, fetchSeasonPack, fmtSeason } from '../lib/seasons'
import { quarterReview } from '../lib/quarterReview'
import { t } from '../lib/i18n'
export default function QuarterReviewPanel({ current, shows, tracking, seasons, now, onClose }: { current: string; shows: Show[]; tracking: Tracking; seasons: string[]; now: number; onClose: () => void }) {
  const [selected,setSelected]=useState(current)
  const [rows,setRows]=useState<{season:string;summary:ReturnType<typeof quarterReview>|null}[]>([])
  const [error,setError]=useState('')
  useEffect(()=>{
    let alive=true; setError(''); setRows([])
    Promise.all([selected,adjacentSeason(selected,-1)].map(async season=>{
      try{return {season,summary:quarterReview(season===current?shows:await fetchSeasonPack(season),tracking,season,now)}}
      catch{return {season,summary:null}}
    }))
      .then(value=>{if(alive)setRows(value)}).catch(()=>{if(alive)setError(t('季度数据加载失败，请稍后重试。'))})
    return ()=>{alive=false}
  },[selected,current,shows,tracking,now])
  return <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}><section className="modal pending-modal" role="dialog" aria-modal="true" aria-label={t('季度回顾')}>
    <button className="close" onClick={onClose} aria-label={t('关闭')}>×</button><h2>{t('季度回顾')}</h2>
    <select aria-label={t('切换季度')} value={selected} onChange={e=>setSelected(e.target.value)}>{[...new Set([current,...seasons])].filter(x=>x<=current).sort().reverse().map(x=><option key={x} value={x}>{fmtSeason(x)}</option>)}</select>
    <p className="feature-hint">{t('按当前收藏状态与进度回看各季；并非当时的历史快照。集数仅统计该季度内已播出的章节，时间未知的章节不推算。')}</p>
    {error?<p className="err" role="alert">{error}</p>:!rows.length?<p role="status">{t('正在读取…')}</p>:<div className="review-grid">{rows.map(({season,summary})=><article key={season}><h3>{fmtSeason(season)}</h3>{!summary ? <p>{t('该季度暂无可用数据。')}</p> : <><dl>{([['已收藏',summary.followed],['标记看过',summary.completed],['已看集数',summary.watched],['在看欠番',summary.behind]] as const).map(([label,value])=><div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>{summary.unknown>0&&<p className="feature-hint">{t('{n} 部时间未定，集数统计可能不完整。',{n:summary.unknown})}</p>}</>}</article>)}</div>}
  </section></div>
}
