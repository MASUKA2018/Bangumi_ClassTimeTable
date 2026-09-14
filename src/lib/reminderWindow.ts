import type { RichReminderPayload, ReminderKind } from './notifications'

export const RICH_REMINDER_EVENT = 'btt-rich-reminder'
export const reminderPayloadKey = (kind: ReminderKind) => `btt:rich-reminder:${kind}:v1`

const WIDTH = 720
const HEIGHT = 300
const MARGIN = 16
const GAP = 12

function isMacOS(): boolean {
  return /Macintosh|Mac OS X/i.test(navigator.userAgent)
}

function savePayload(payload: RichReminderPayload) {
  localStorage.setItem(reminderPayloadKey(payload.kind), JSON.stringify(payload))
}

async function waitUntilCreated(window: import('@tauri-apps/api/webviewWindow').WebviewWindow): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    window.once('tauri://created', () => resolve()).catch(reject)
    window.once('tauri://error', (event) => reject(new Error(String(event.payload)))).catch(reject)
  })
}

/**
 * 在主屏工作区右下角显示无边框卡片。两类提醒同时出现时自动上下错开，
 * 不抢当前应用焦点；失败由调用方回落到系统通知。
 */
export async function showRichReminder(payload: RichReminderPayload): Promise<void> {
  savePayload(payload)
  const [{ WebviewWindow }, { emitTo }, { primaryMonitor, LogicalPosition }] = await Promise.all([
    import('@tauri-apps/api/webviewWindow'),
    import('@tauri-apps/api/event'),
    import('@tauri-apps/api/window'),
  ])
  const label = `reminder-${payload.kind}`
  const siblingLabel = `reminder-${payload.kind === 'watching' ? 'other' : 'watching'}`
  const monitor = await primaryMonitor()
  if (!monitor) throw new Error('primary monitor unavailable')

  const workPosition = monitor.workArea.position.toLogical(monitor.scaleFactor)
  const workSize = monitor.workArea.size.toLogical(monitor.scaleFactor)
  const sibling = await WebviewWindow.getByLabel(siblingLabel)
  const siblingVisible = sibling ? await sibling.isVisible() : false
  const x = workPosition.x + workSize.width - WIDTH - MARGIN
  const y = workPosition.y + workSize.height - HEIGHT - MARGIN - (siblingVisible ? HEIGHT + GAP : 0)
  const macOS = isMacOS()
  const backgroundColor: [number, number, number, number] =
    macOS ? (payload.theme === 'light' ? [247, 244, 245, 255] : [35, 36, 38, 255]) : [0, 0, 0, 0]

  let popup = await WebviewWindow.getByLabel(label)
  if (!popup) {
    popup = new WebviewWindow(label, {
      url: `index.html?reminder=${payload.kind}`,
      x,
      y,
      width: WIDTH,
      height: HEIGHT,
      title: payload.heading,
      decorations: false,
      // Transparent webviews require a private macOS API that prevents App Store
      // distribution. An opaque, theme-matched background keeps the same card layout.
      transparent: !macOS,
      backgroundColor,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      focus: false,
      focusable: true,
      acceptFirstMouse: macOS,
      visible: false,
      shadow: false,
    })
    await waitUntilCreated(popup)
  } else {
    await popup.setPosition(new LogicalPosition(x, y))
  }
  await emitTo(label, RICH_REMINDER_EVENT, payload)
  await popup.show()
}
