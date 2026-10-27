import { useState } from 'react'
import type { Show, Tracking } from '../types'
import { syncDetails, type RemotePull } from '../lib/bgm'
import { readProgressHistory } from '../lib/progressHistory'
import { diagnosticReport, downloadJson } from '../lib/diagnostics'
import { displayName, t } from '../lib/i18n'

interface Props {
  shows: Show[]; tracking: Tracking; remote: RemotePull | null; busy: boolean; connected: boolean
  onRetry: (id: number) => Promise<void>
  onResolve: (id: number, source: 'local' | 'cloud') => Promise<void>
  onRestore: (id: number, value: number) => Promise<void>
}
export default function ReliabilityPanel({ shows, tracking, remote, busy, connected, onRetry, onResolve, onRestore }: Props) {
  const [query, setQuery] = useState(''), [onlyProblems, setOnlyProblems] = useState(true)
  const [message, setMessage] = useState(''), [working, setWorking] = useState(false), [preview, setPreview] = useState(false)
  const title = (id: number) => { const show = shows.find(x => x.id === id); return show ? displayName(show) : `#${id}` }
  const matches = (id: number) => `${id} ${title(id)}`.toLowerCase().includes(query.toLowerCase())
  const rows = syncDetails(tracking, remote), problems = rows.filter(x => x.state === 'pending' || x.state === 'conflict')
  const visible = (onlyProblems ? problems : rows).filter(x => matches(x.id))
  const history = readProgressHistory().slice().reverse().filter(x => matches(x.id))
  const action = async (run: () => Promise<void>) => {
    if (working || busy) return
    setWorking(true); setMessage('')
    try { await run(); setMessage(t('操作已处理，请核对记录。')) } catch (e) { setMessage(String(e)) } finally { setWorking(false) }
  }
  const report = diagnosticReport(rows.filter(x => x.state === 'pending').length, rows.filter(x => x.state === 'conflict').length)
  return <section className="feature-section reliability-panel">
    <h3>{t('同步明细与进度历史')}</h3>
    <input className="reliability-search" aria-label={t('搜索番剧')} placeholder={t('搜索番剧')} value={query} onChange={e => setQuery(e.target.value)} />
    {message && <p role="status" className="feature-hint">{message}</p>}
    <details><summary>{t('逐部同步明细')} · {problems.length} {t('条待处理')}</summary>
      <p className="feature-hint">{remote?.pulledAt ? `${t('最近读取云端')} ${new Date(remote.pulledAt).toLocaleString()}` : t('尚未读取云端；请连接账号后同步。')}</p>
      <label><input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} /> {t('只显示待处理')}</label>
      <div className="reliability-list">{visible.slice(0, 150).map(row => <article key={row.id} className="reliability-row">
        <b>{title(row.id)}</b><span>{t('本机')} {row.local} · {t('云端')} {row.cloud ?? '—'} · {t(({ pending: '等待上传', conflict: '需要核对', verified: '已核对', unknown: '尚未核对' })[row.state])}</span>
        {row.error && <small className="err">{row.error}</small>}
        {row.retryAt && <small>{t('计划重试')} {new Date(row.retryAt).toLocaleTimeString()}</small>}
        {connected && <div className="pending-actions">
          {row.state === 'pending' && <button className="iconbtn" disabled={working || busy} onClick={() => void action(() => onRetry(row.id))}>{t('仅重试本部')}</button>}
          {(row.state === 'conflict' || row.state === 'pending') && <>
            <button className="iconbtn" disabled={working || busy} onClick={() => void action(() => onResolve(row.id, 'local'))}>{t('采用本机进度')}</button>
            <button className="iconbtn" disabled={working || busy} onClick={() => void action(() => onResolve(row.id, 'cloud'))}>{t('采用云端进度')}</button>
          </>}
        </div>}
      </article>)}{!visible.length && <p>{t('暂无待处理记录。')}</p>}{visible.length > 150 && <p>{t('请搜索以缩小范围。')}</p>}</div>
    </details>
    <details><summary>{t('最近 30 天进度历史')} · {history.length}</summary>
      <p className="feature-hint">{t('仅保存在本机，最多 2000 条。恢复只影响选中的番剧；连接账号且未暂停同步时会上传。')}</p>
      <div className="reliability-list">{history.slice(0, 100).map(row => <article className="reliability-row" key={row.key}>
        <b>{title(row.id)} · {row.before} → {row.after}</b><small>{new Date(row.at).toLocaleString()} · {t(({ local: '本机操作', cloud: '云端读取', restore: '历史恢复', verified: '上传核对' })[row.source])}</small>
        <div className="pending-actions"><button className="iconbtn" disabled={working || busy} onClick={() => void action(() => onRestore(row.id, row.before))}>{t('恢复修改前')}</button><button className="iconbtn" disabled={working || busy} onClick={() => void action(() => onRestore(row.id, row.after))}>{t('恢复修改后')}</button></div>
      </article>)}{!history.length && <p>{t('暂无进度历史。')}</p>}{history.length > 100 && <p>{t('显示最近 100 条，请搜索以缩小范围。')}</p>}</div>
    </details>
    <details><summary>{t('故障诊断与隐私预览')}</summary>
      <p className="feature-hint">{t('仅导出版本、平台、阶段、结果、番剧 ID 和 HTTP 状态；不含账号、令牌、私钥、番剧标题或私人评论。文件只下载到本机，不会自动上传。')}</p>
      <button className="iconbtn" onClick={() => setPreview(!preview)}>{t('预览诊断')}</button> <button className="iconbtn" onClick={() => void action(() => downloadJson('bangumi-diagnostics.json', report))}>{t('导出诊断文件')}</button>
      {preview && <pre className="diagnostic-preview">{JSON.stringify(report, null, 2)}</pre>}
    </details>
  </section>
}
