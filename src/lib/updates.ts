import { useCallback, useEffect, useRef, useState } from 'react'
import { isDesktopNativeApp } from './native'
import { createBackup } from './backups'
import { loadPersisted } from './store'
import { t } from './i18n'

export interface UpdateInfo { version: string; body: string; date?: string }
export const RELEASES_URL = 'https://github.com/MASUKA2018/Bangumi_ClassTimeTable/releases'
const LAST_CHECK = 'btt:update-check:v1'
export function useAppUpdates(automatic: boolean) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'current' | 'error' | 'installing'>('idle')
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [checkedAt, setCheckedAt] = useState<number | null>(() => Number(localStorage.getItem(LAST_CHECK)) || null)
  const busy = useRef(false)
  const check = useCallback(async () => {
    if (busy.current || !isDesktopNativeApp()) return
    busy.current = true
    setStatus('checking'); setError('')
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<UpdateInfo | null>('check_app_update')
      setUpdate(result); setStatus(result ? 'available' : 'current')
      const at = Date.now(); setCheckedAt(at); localStorage.setItem(LAST_CHECK, String(at))
    } catch (e) {
      setStatus('error'); setError(String(e))
    } finally { busy.current = false }
  }, [])
  useEffect(() => {
    if (!automatic || !isDesktopNativeApp() || (checkedAt && Date.now() - checkedAt < 24 * 3600_000)) return
    const timer = setTimeout(check, 10000)
    return () => clearTimeout(timer)
  }, [automatic, check, checkedAt])
  useEffect(() => {
    if (!isDesktopNativeApp()) return
    let alive = true, dispose: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) => listen<{ downloaded: number; total?: number }>('btt-update-progress', ({ payload }) => {
      setProgress(payload.total ? Math.min(100, Math.floor(100 * payload.downloaded / payload.total)) : null)
    })).then(fn => { if (alive) dispose = fn; else fn() }).catch(e => console.warn('Update progress listener unavailable', e))
    return () => { alive = false; dispose?.() }
  }, [])
  const install = useCallback(async () => {
    if (!update || busy.current || !window.confirm(t('安装更新会先备份追番数据，然后关闭并重启程序。继续？'))) return
    busy.current = true; setStatus('installing'); setError(''); setProgress(null)
    try {
      await createBackup(loadPersisted(), 'restore')
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('install_app_update', { expectedVersion: update.version })
    } catch (e) { setStatus('error'); setError(String(e)) }
    finally { busy.current = false }
  }, [update])
  return { status, update, error, progress, checkedAt, check, install }
}
export type AppUpdates = ReturnType<typeof useAppUpdates>
