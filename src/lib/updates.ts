import { useCallback, useEffect, useRef, useState } from 'react'
import { isDesktopNativeApp } from './native'
import { createBackup } from './backups'
import { loadPersisted } from './store'
import { t } from './i18n'
import { confirmAction } from './confirm'
import { recordDiagnostic } from './diagnostics'

export interface UpdateInfo { version: string; body: string; date?: string }
export const RELEASES_URL = 'https://github.com/MASUKA2018/Bangumi_ClassTimeTable/releases'
const LAST_CHECK = 'btt:update-check:v1'
export function useAppUpdates(automatic: boolean) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'current' | 'error' | 'installing'>('idle')
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [stage, setStage] = useState('idle')
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
    let alive = true
    const disposers: (() => void)[] = []
    const retain = (dispose: () => void) => { if (alive) disposers.push(dispose); else dispose() }
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event')
      retain(await listen<{ downloaded: number; total?: number }>('btt-update-progress', ({ payload }) => {
        setProgress(payload.total ? Math.min(100, Math.floor(100 * payload.downloaded / payload.total)) : null)
      }))
      retain(await listen<string>('btt-update-stage', ({ payload }) => {
        if (['checking','downloading','verifying','installing','restarting'].includes(payload)) { setStage(payload); recordDiagnostic('update', payload, 'started') }
      }))
    })().catch(e => { recordDiagnostic('update', 'listener', 'error'); console.warn('Update listener unavailable', e) })
    return () => { alive = false; disposers.forEach(dispose => dispose()) }
  }, [])
  const install = useCallback(async () => {
    if (!update || busy.current) return
    busy.current = true; setError('')
    try {
      if (!await confirmAction(t('安装更新会先备份追番数据，然后关闭并重启程序。继续？'))) {
        setStage('cancelled'); recordDiagnostic('update', 'confirm', 'cancelled'); return
      }
      setStatus('installing'); setStage('backup'); setProgress(null); recordDiagnostic('update', 'backup', 'started')
      await createBackup(loadPersisted(), 'restore')
      setStage('checking')
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('install_app_update', { expectedVersion: update.version })
    } catch (e) { setStatus('error'); setError(String(e)); recordDiagnostic('update', 'install', 'error', undefined, e) }
    finally { busy.current = false }
  }, [update])
  return { status, update, error, progress, stage, checkedAt, check, install }
}
export type AppUpdates = ReturnType<typeof useAppUpdates>
