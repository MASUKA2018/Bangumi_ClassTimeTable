import { useState } from 'react'
import type { Settings, Show } from '../types'
import { displayName, t } from '../lib/i18n'
export default function ShowReminderSettings({ shows, settings, onChange }: { shows: Show[]; settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const [query, setQuery] = useState(''), [id, setId] = useState(0)
  const rows = shows.filter(x => `${x.id} ${x.nameCn} ${x.nameJp}`.toLowerCase().includes(query.toLowerCase()))
  const pref = settings.showReminders[id] ?? { mode: 'inherit' as const, offset: 10 }
  const patch = (value: Partial<typeof pref>) => {
    if (!id) return
    const next = { ...settings.showReminders, [id]: { ...pref, ...value } }
    if (next[id].mode === 'inherit') delete next[id]
    onChange({ showReminders: next })
  }
  return <section className="feature-section">
    <h3>{t('单部番剧提醒与免打扰')}</h3>
    <label className="feature-field"><span>{t('夜间免打扰')}</span><input type="checkbox" checked={settings.quietHoursEnabled} onChange={e => onChange({ quietHoursEnabled: e.target.checked })} /></label>
    <div className="feature-field"><label>{t('开始')} <input aria-label={t('免打扰开始')} type="time" value={settings.quietHoursStart} onChange={e => onChange({ quietHoursStart: e.target.value })} /></label><label>{t('结束')} <input aria-label={t('免打扰结束')} type="time" value={settings.quietHoursEnd} onChange={e => onChange({ quietHoursEnd: e.target.value })} /></label></div>
    <p className="feature-hint">{t('按当前显示时区计算；起止相同表示全天免打扰。每日摘要在免打扰结束后检查，过期逐集提醒不会集中补发。手动预览仍可使用。')}</p>
    <input className="reliability-search" aria-label={t('筛选提醒番剧')} placeholder={t('搜索番剧')} value={query} onChange={e => setQuery(e.target.value)} />
    <select className="reliability-search" aria-label={t('选择提醒番剧')} value={id} onChange={e => setId(Number(e.target.value))}><option value={0}>{t('选择番剧')}</option>{rows.map(show => <option key={show.id} value={show.id}>{displayName(show)}</option>)}</select>
    {!!id && <div className="feature-field"><select aria-label={t('本部提醒方式')} value={pref.mode} onChange={e => patch({ mode: e.target.value as typeof pref.mode })}>{(['inherit','off','before','after'] as const).map((mode, i) => <option key={mode} value={mode}>{t(['跟随全局提醒','本部全部静音','本部放送前提醒','本部放送后提醒'][i])}</option>)}</select>
      {(pref.mode === 'before' || pref.mode === 'after') && <label>{t('提前或延后分钟')} <input type="number" min={0} max={1440} step={1} value={pref.offset} onChange={e => { const value = Number(e.target.value); if (Number.isSafeInteger(value) && value >= 0 && value <= 1440) patch({ offset: value }) }} /></label>}
    </div>}
    <p className="feature-hint">{t('单部放送前后提醒可独立于全局开关启用，仅提醒“在看”；静音同时影响每日、逐集和稍后提醒。延后提醒不会修改课表放送时间。')}</p>
    <details><summary>{t('已有独立提醒设置')} · {Object.keys(settings.showReminders).length}</summary>{Object.entries(settings.showReminders).map(([key, value]) => <div className="feature-field" key={key}><span>{shows.find(x => x.id === Number(key)) ? displayName(shows.find(x => x.id === Number(key))!) : `#${key}`} · {t(value.mode === 'off' ? '本部全部静音' : value.mode === 'before' ? '本部放送前提醒' : '本部放送后提醒')} · {value.offset} {t('分钟')}</span><button className="iconbtn" onClick={() => { const next = { ...settings.showReminders }; delete next[Number(key)]; onChange({ showReminders: next }) }}>{t('恢复全局设置')}</button></div>)}</details>
  </section>
}
