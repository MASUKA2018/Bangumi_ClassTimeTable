import { exportTextFile } from '../lib/exportFile'
import { isAndroidApp } from '../lib/androidReminders'
import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../types'
import { backupDiff, backupDocument, listBackups, mergeBackup, parseBackup, readBackup, type BackupFile } from '../lib/backups'
import { loadPersisted, type Persisted } from '../lib/store'
import { isDesktopNativeApp } from '../lib/native'
import { RELEASES_URL, type AppUpdates } from '../lib/updates'
import { t } from '../lib/i18n'
import { confirmAction } from '../lib/confirm'
declare const __APP_VERSION__: string

interface Props {
  settings: Settings; onChange: (patch: Partial<Settings>) => void; updates: AppUpdates
  onRefreshData: () => Promise<void>; dataBusy: boolean; dataMessage: string; dataSource: string
  onRestore: (data: Persisted) => Promise<void>; backupError: string; syncPaused: boolean
}
export default function DesktopFeatures({ settings, onChange, updates, onRefreshData, dataBusy, dataMessage, dataSource, onRestore, backupError, syncPaused }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<BackupFile[]>([])
  const [incoming, setIncoming] = useState<Persisted | null>(null)
  const [backupMessage, setBackupMessage] = useState('')
  const [restoring, setRestoring] = useState(false)
  const refreshFiles = async () => { try { setFiles(await listBackups()) } catch (e) { setBackupMessage(String(e)) } }
  useEffect(() => { void refreshFiles() }, [])
  const preview = async (read: () => Promise<Persisted>) => {
    try { setIncoming(await read()); setBackupMessage('') } catch (e) { setBackupMessage(String(e)) }
  }
  const restore = async (mode: 'merge' | 'replace') => {
    if (!incoming || restoring) return
    setRestoring(true)
    try { if (!await confirmAction(t('恢复前会保存安全快照并暂停 Bangumi 同步，不会直接改动云端收藏。继续？'))) return; await onRestore(mode === 'merge' ? mergeBackup(loadPersisted(), incoming) : incoming); setIncoming(null); setBackupMessage(t('已恢复本机数据；Bangumi 同步已暂停。')); await refreshFiles() }
    catch (e) { setBackupMessage(String(e)) }
    finally { setRestoring(false) }
  }
  const exportFile = async () => {
    try { await exportTextFile(`bangumi-timetable-backup-${new Date().toLocaleDateString('sv-SE')}.json`, JSON.stringify(backupDocument(),null,2), 'application/json') }
    catch (error) { setBackupMessage(String(error)) }
  }

  const diff = incoming ? backupDiff(loadPersisted(), incoming) : null
  return <div className="desktop-features">
    <section className="feature-section"><h3>{t('显示与阅读')}</h3>
      <label className="feature-field"><span>{t('主题模式')}</span><select aria-label={t('主题模式')} value={settings.themeMode} onChange={e => onChange({ themeMode: e.target.value as Settings['themeMode'] })}><option value="manual">{t('手动选择')}</option><option value="system">{t('跟随系统')}</option></select></label>
      <label className="feature-field"><span>{t('显示密度')}</span><select aria-label={t('显示密度')} value={settings.density} onChange={e => onChange({ density: e.target.value as Settings['density'] })}>{(['compact','standard','large'] as const).map((x,i) => <option key={x} value={x}>{t(['紧凑','标准','大字'][i])}</option>)}</select></label>
      <label className="feature-field"><span>{t('字体大小')}</span><select aria-label={t('字体大小')} value={settings.fontScale} onChange={e => onChange({ fontScale: Number(e.target.value) })}>{[100,115,130].map(x => <option key={x} value={x}>{x}%</option>)}</select></label>
      <label className="feature-field"><span>{t('封面大小')}</span><select aria-label={t('封面大小')} value={settings.coverSize} onChange={e => onChange({ coverSize: e.target.value as Settings['coverSize'] })}>{(['small','medium','large'] as const).map((x,i) => <option key={x} value={x}>{t(['小','中','大'][i])}</option>)}</select></label>
    </section>
    <section className="feature-section"><h3>{t('提醒进阶设置')}</h3>
      <label className="feature-field"><span>{t('未在看提醒范围')}</span><select aria-label={t('未在看提醒范围')} value={settings.otherReminderScope} onChange={e => onChange({ otherReminderScope: e.target.value as Settings['otherReminderScope'] })}><option value="all">{t('全部未追 / 想看')}</option><option value="wish">{t('仅想看')}</option></select></label>
      <p className="feature-hint">{t('搁置、看过和抛弃的番剧不会提醒。')}</p>
      <label className="feature-field"><span>{t('按放送时间提醒在看番剧')}</span><input type="checkbox" checked={settings.episodeReminderEnabled} onChange={e => onChange({ episodeReminderEnabled: e.target.checked })} /></label>
      <div className="feature-field"><span>{t('提醒时机')}</span><select aria-label={t('提醒时机')} value={settings.episodeReminderMode} onChange={e => onChange({ episodeReminderMode: e.target.value as Settings['episodeReminderMode'] })}><option value="before">{t('放送前')}</option><option value="after">{t('放送后')}</option></select><select aria-label={t('提前或延后分钟')} value={settings.episodeReminderOffset} onChange={e => onChange({ episodeReminderOffset: Number(e.target.value) })}>{[0,5,10,15,30].map(x => <option key={x} value={x}>{t('{n} 分钟', { n: x })}</option>)}</select></div>
      <label className="feature-field"><span>{t('提醒自动关闭')}</span><select aria-label={t('提醒自动关闭')} value={settings.reminderDismissSeconds} onChange={e => onChange({ reminderDismissSeconds: Number(e.target.value) })}>{[15,30,60,0].map(x => <option key={x} value={x}>{x ? t('{n} 秒', { n: x }) : t('不自动关闭')}</option>)}</select></label>
      <p className="feature-hint">{t(isAndroidApp() ? '开启系统后台提醒后，已安排的通知可在应用进入后台后显示。' : '鼠标悬停时暂停关闭。程序需保持运行；错过超过 5 分钟的逐集提醒不会集中补发。')}</p>
    </section>
    <section className="feature-section"><h3>{t('更新中心')}</h3>
      <div className="feature-field"><span>{t('程序版本')} {__APP_VERSION__}</span><button className="iconbtn" disabled={!isDesktopNativeApp() || ['checking','installing'].includes(updates.status)} onClick={updates.check}>{t(updates.status === 'checking' ? '正在检查…' : '检查新版本')}</button><a href={RELEASES_URL} target="_blank" rel="noreferrer">{t('下载页面')}</a></div>
      <label className="feature-field"><span>{t('启动后检查版本（不自动安装）')}</span><input type="checkbox" checked={settings.autoCheckUpdates} onChange={e => onChange({ autoCheckUpdates: e.target.checked })} /></label>
      {updates.checkedAt && <p className="feature-hint">{t('最近检查：{time}', { time: new Date(updates.checkedAt).toLocaleString() })}</p>}
      {updates.status === 'current' && <p role="status">{t('已是最新版本。')}</p>}
      {updates.update && <div className="update-result"><b>{t('发现新版本')} {updates.update.version}</b><p className="release-notes">{updates.update.body}</p><button className="iconbtn accent" disabled={['checking','installing'].includes(updates.status)} onClick={updates.install}>{t(updates.status === 'installing' ? '正在备份并安装…' : '确认安装并重启')}{updates.progress !== null && updates.status === 'installing' ? ` ${updates.progress}%` : ''}</button></div>}
      {updates.status === 'error' && <p className="err" role="alert">{t('检查或安装更新失败：{error}', { error: updates.error })}</p>}
      <p role="status" className="feature-hint">{t(({ backup: '正在保存更新前备份', checking: '正在重新核对版本', downloading: '正在下载更新', verifying: '正在校验签名', installing: '正在安装更新', restarting: '正在重启应用', cancelled: '已取消更新' } as Record<string,string>)[updates.stage] ?? '')}</p>
      {updates.status === 'error' && <p><button className="iconbtn" onClick={updates.install}>{t('重试安装')}</button> <a href={RELEASES_URL} target="_blank" rel="noreferrer">{t('手动下载安装包')}</a></p>}
      <div className="feature-field"><span>{t('放送数据')} · {t(dataSource || '正在读取…')}</span><button className="iconbtn" disabled={dataBusy} onClick={() => void onRefreshData()}>{t(dataBusy ? '正在刷新…' : '立即更新放送数据')}</button></div>
      {dataMessage && <p className="feature-hint" role="status">{dataMessage}</p>}
      <p className="feature-hint">{t('放送数据与程序版本独立更新；更新数据不需要重新安装。')}</p>
    </section>
    <section className="feature-section"><h3>{t('备份与恢复')}</h3>
      <label className="feature-field"><span>{t('每日自动备份（保留最近 7 天）')}</span><input type="checkbox" checked={settings.backupEnabled} onChange={e => onChange({ backupEnabled: e.target.checked })} /></label>
      <p className="feature-hint">{t('桌面备份保存在应用数据目录，另保留 3 份恢复／升级前快照。备份不包含登录令牌。')}</p>
      <div className="feature-field"><button className="iconbtn" onClick={exportFile}>{t('⤓ 导出追番数据')}</button><button className="iconbtn" onClick={() => fileRef.current?.click()}>{t('⤒ 导入')}</button><button className="iconbtn" onClick={refreshFiles}>{t('刷新备份列表')}</button></div>
      <input hidden ref={fileRef} type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void preview(async () => parseBackup(await file.text())); e.target.value = '' }} />
      <div className="backup-list">{files.map(file => <div key={file.name}><span>{new Date(file.at).toLocaleString()} · {t(file.reason === 'daily' ? '每日备份' : '安全快照')}</span><button className="iconbtn" onClick={() => void preview(() => readBackup(file.name))}>{t('预览恢复')}</button></div>)}</div>
      {incoming && diff && <div className="backup-preview"><p>{t('备份含 {n} 部追番状态，状态或进度差异 {changed} 部。', { n: diff.total, changed: diff.changed })}</p><p className="feature-hint">{t('合并：保留本机设置与状态，进度取较大值。覆盖：使用备份记录与设置。')}</p><button className="iconbtn" disabled={restoring} onClick={() => void restore('merge')}>{t('合并恢复')}</button>{' '}<button className="iconbtn" disabled={restoring} onClick={() => void restore('replace')}>{t('覆盖恢复')}</button>{' '}<button className="iconbtn" disabled={restoring} onClick={() => setIncoming(null)}>{t('取消')}</button></div>}
      {(backupMessage || backupError) && <p className={backupError ? 'err' : 'feature-hint'} role="status">{backupError || backupMessage}</p>}
      {syncPaused && <p className="feature-hint">{t('Bangumi 同步已暂停。确认记录后，点击账号旁的“恢复同步”。')}</p>}
    </section>
  </div>
}
