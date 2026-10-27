import { useState } from 'react'
import type { Settings } from '../types'
import { loadPersisted, type Persisted } from '../lib/store'
import { reloadCovers } from '../lib/covers'
import { reminderHistory } from '../lib/reminderHistory'
import { mergePreferences, parsePreferences, preferencesRequest, sharePreferences, type SharedPreferences } from '../lib/preferences'
import { isAndroidApp } from '../lib/androidReminders'
import { requestNotificationAccess } from '../lib/notifications'
import { t } from '../lib/i18n'

export default function NextFeatures({ settings,onChange,onApplyPreferences,androidCount,androidError }: {settings:Settings;onChange:(patch:Partial<Settings>)=>void;onApplyPreferences:(data:Persisted)=>Promise<void>;androidCount:number;androidError:string}) {
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[remote,setRemote]=useState<SharedPreferences|null>(null)
  const [connection,setConnection]=useState(()=>{try {return {...JSON.parse(localStorage.getItem('btt:preferences-connection:v1')??'{}'),password:''} as {endpoint:string;username:string;password:string}}catch{return {endpoint:'',username:'',password:''}}})
  const [includeReminders,setIncludeReminders]=useState(false)
  const [history,setHistory]=useState(reminderHistory)
  const act=async (fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setMessage('');try{await fn()}catch(e){setMessage(String(e))}finally{setBusy(false)}}
  const remember=()=>localStorage.setItem('btt:preferences-connection:v1',JSON.stringify({endpoint:connection.endpoint,username:connection.username}))
  return <div className="desktop-features">
    <section className="feature-section"><h3>{t('封面与离线')}</h3><p className="feature-hint">{t('已加载的封面保存在本机；图片缓存最多 80 MB，自动清理旧图片。断网时保留上次成功读取的课表。')}</p><button disabled={busy} className="iconbtn" onClick={()=>void act(async()=>{await reloadCovers();setMessage(t('已重新安排封面加载。'))})}>{t('重新加载封面')}</button></section>
    <section className="feature-section"><h3>{t('提醒窗口与历史')}</h3>
      {!isAndroidApp()&&<><label className="feature-field"><span>{t('提醒窗口尺寸')}</span><select value={settings.reminderSize} onChange={e=>onChange({reminderSize:e.target.value as Settings['reminderSize']})}>{(['small','medium','large'] as const).map((v,i)=><option key={v} value={v}>{t(['小','中','大'][i])}</option>)}</select></label>
      <label className="feature-field"><span>{t('弹出位置')}</span><select value={settings.reminderCorner} onChange={e=>onChange({reminderCorner:e.target.value as Settings['reminderCorner']})}>{(['bottom-right','bottom-left','top-right','top-left'] as const).map((v,i)=><option key={v} value={v}>{t(['右下角','左下角','右上角','左上角'][i])}</option>)}</select></label>
      <label className="feature-field"><span>{t('显示器')}</span><select value={settings.reminderMonitor} onChange={e=>onChange({reminderMonitor:e.target.value as Settings['reminderMonitor']})}><option value="primary">{t('主显示器')}</option><option value="main">{t('主窗口所在显示器')}</option></select></label></>}
      {isAndroidApp()&&<><label className="feature-field"><span>{t('系统后台提醒')}</span><input type="checkbox" checked={settings.androidBackgroundReminders} onChange={e=>onChange({androidBackgroundReminders:e.target.checked})}/></label><button className="iconbtn" disabled={busy} onClick={()=>void act(async()=>{const access=await requestNotificationAccess();setMessage(t(access==='granted'?'通知权限已开启。':'通知权限未开启，请在系统应用设置中允许通知。'));window.dispatchEvent(new Event('btt-notification-permission'))})}>{t('开启通知权限')}</button>
      <button className="iconbtn" onClick={()=>void act(async()=>{const {invoke}=await import('@tauri-apps/api/core');await invoke('android_reminder_settings')})}>{t('系统准时提醒设置')}</button>
      <p className="feature-hint">{t('每次打开应用会安排未来 7 天的提醒；系统省电或强制停止可能导致延迟。放送数据变更后需打开应用更新计划。')}</p><p role="status">{t('已安排 {n} 条提醒',{n:androidCount})}</p>{androidError&&<p className="err" role="alert">{androidError}</p>}</>}
      <button className="iconbtn" onClick={()=>setHistory(reminderHistory())}>{t('刷新提醒历史')}</button><p className="feature-hint">{t('本机保留最近 30 天、最多 200 条。已安排不代表系统已经送达。')}</p>
      <div className="reminder-history">{history.length?[...history].reverse().slice(0,30).map((x,i)=><p key={`${x.at}:${i}`}><time>{new Date(x.at).toLocaleString()}</time> · {t(({shown:'已显示',scheduled:'已安排',denied:'未获通知权限',failed:'提醒失败'})[x.result])}<br/>{x.titles.join('、')}</p>):<p>{t('暂无提醒历史。')}</p>}</div>
    </section>
    <section className="feature-section"><h3>{t('跨设备设置同步')}</h3><p className="feature-hint">{t('可选连接自己的 WebDAV 同步文件。只同步显示和筛选偏好，不包含账号、令牌、观看进度或同步密码；密码仅在本次打开设置时使用。')}</p>
      {(['endpoint','username','password'] as const).map((key,i)=><label className="feature-field" key={key}><span>{t(['同步文件 HTTPS 地址','用户名','密码'][i])}</span><input type={key==='password'?'password':key==='endpoint'?'url':'text'} autoComplete="off" value={connection[key]??''} placeholder={key==='endpoint'?'https://…/bangumi-preferences.json':undefined} onChange={e=>{setConnection({...connection,[key]:e.target.value});setRemote(null)}}/></label>)}
      <label className="feature-field"><span>{t('同时同步提醒偏好')}</span><input type="checkbox" checked={includeReminders} onChange={e=>setIncludeReminders(e.target.checked)}/></label><p className="feature-hint">{t('关闭此项，各台设备继续使用自己的提醒设置。同步文件所在目录需提前建立。')}</p>
      <div className="preference-actions"><button className="iconbtn" disabled={busy||!connection.endpoint} onClick={()=>void act(async()=>{remember();const res=await preferencesRequest(connection);if(res.status===404){setRemote(null);setMessage(t('远端尚无设置，可上传本机设置。'));return}setRemote(parsePreferences(res.body))})}>{t('读取远端设置')}</button>
      <button className="iconbtn" disabled={busy||!connection.endpoint} onClick={()=>void act(async()=>{remember();const old=await preferencesRequest(connection);if(old.status!==404)parsePreferences(old.body);await preferencesRequest(connection,JSON.stringify(sharePreferences(loadPersisted(),includeReminders)),old.status===404?'*new*':old.etag);setRemote(null);setMessage(t('设置已上传。'))})}>{t('上传本机设置')}</button></div>
      {remote&&<div className="backup-preview"><p>{t('远端设置时间：{time}',{time:new Date(remote.at).toLocaleString()})}</p><p>{t('主题')}: {remote.appearance.theme} · {t('语言')}: {remote.appearance.lang}</p><button className="iconbtn" disabled={busy} onClick={()=>void act(async()=>{await onApplyPreferences(mergePreferences(loadPersisted(),remote,includeReminders));setRemote(null);setMessage(t('设置已应用，原设置已保存安全备份。'))})}>{t('应用远端设置')}</button></div>}
    </section>
    {message&&<p role="status" className="feature-hint">{message}</p>}
  </div>
}
