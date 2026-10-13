import { isDesktopNativeApp } from './native'

export function supportsAutostart(): boolean {
  return isDesktopNativeApp()
}

export async function getAutostartEnabled(): Promise<boolean> {
  if (!supportsAutostart()) throw new Error('autostart is unavailable outside the desktop app')
  const { isEnabled } = await import('@tauri-apps/plugin-autostart')
  return isEnabled()
}

export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  if (!supportsAutostart()) throw new Error('autostart is unavailable outside the desktop app')
  const autostart = await import('@tauri-apps/plugin-autostart')
  await (enabled ? autostart.enable() : autostart.disable())
  return autostart.isEnabled()
}
