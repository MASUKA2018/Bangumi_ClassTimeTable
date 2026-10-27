import { exportTextFile } from './exportFile'
import { nativePlatform } from './native'
declare const __APP_VERSION__: string
const KEY = 'btt:diagnostics:v1'
type Area = 'sync' | 'update' | 'reminder' | 'storage' | 'tray'
export interface Diagnostic { at: number; area: Area; stage: string; result: 'started' | 'ok' | 'error' | 'cancelled'; subjectId?: number; httpStatus?: number }
function sanitize(value: unknown): Diagnostic | null {
  const x = value as Diagnostic
  if (!x || !Number.isFinite(x.at) || !['sync','update','reminder','storage','tray'].includes(x.area)
    || !['confirm','backup','checking','downloading','verifying','installing','restarting','install','upload','pull','sync','retry_subject','resolve_subject','menu','listener'].includes(x.stage)
    || !['started','ok','error','cancelled'].includes(x.result)) return null
  return { at: x.at, area: x.area, stage: x.stage, result: x.result,
    ...(Number.isSafeInteger(x.subjectId) && x.subjectId! > 0 ? { subjectId: x.subjectId } : {}),
    ...(Number.isInteger(x.httpStatus) && x.httpStatus! >= 100 && x.httpStatus! <= 599 ? { httpStatus: x.httpStatus } : {}) }
}
export function readDiagnostics(): Diagnostic[] {
  try { const rows = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(rows) ? rows.map(sanitize).filter((x): x is Diagnostic => !!x).slice(-200) : [] } catch { return [] }
}
export function recordDiagnostic(area: Area, stage: string, result: Diagnostic['result'], subjectId?: number, error?: unknown) {
  const code = /HTTP\s+(\d{3})/.exec(error instanceof Error ? error.message : '')
  const row = sanitize({ at: Date.now(), area, stage, result, subjectId, httpStatus: code ? Number(code[1]) : undefined })
  if (row) try { localStorage.setItem(KEY, JSON.stringify([...readDiagnostics(), row].slice(-200))) } catch {}
}
export function diagnosticReport(pending: number, conflicts: number) {
  return { app: 'bangumi-timetable', version: typeof __APP_VERSION__ === 'undefined' ? 'development' : __APP_VERSION__,
    platform: nativePlatform(), exportedAt: new Date().toISOString(),
    summary: { pending: Math.max(0, Math.floor(pending)), conflicts: Math.max(0, Math.floor(conflicts)) },
    events: readDiagnostics() }
}
export async function downloadJson(name: string, value: unknown) {
  await exportTextFile(name,JSON.stringify(value,null,2),'application/json')
}
