import { isNativeApp } from './native'
import { t } from './i18n'

/** Never silently fall back to the unsupported WKWebView window.confirm. */
export async function confirmAction(message: string): Promise<boolean> {
  if (!isNativeApp()) return window.confirm(message)
  const { confirm } = await import('@tauri-apps/plugin-dialog')
  return confirm(message, { title: t('番组课表'), kind: 'warning', okLabel: t('确认'), cancelLabel: t('取消') })
}
