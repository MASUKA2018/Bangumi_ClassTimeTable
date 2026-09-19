import type { RichReminderPayload, ReminderKind } from './notifications'

export const RICH_REMINDER_EVENT = 'btt-rich-reminder'
export const reminderPayloadKey = (kind: ReminderKind) => `btt:rich-reminder:${kind}:v1`

const WIDTH = 720
const HEIGHT = 300
const MARGIN = 16
const GAP = 12

interface PhysicalWorkArea {
  position: { x: number; y: number }
  size: { width: number; height: number }
}

/** 用物理像素定位，避免 Windows 显示缩放导致逻辑坐标落到屏幕中部。 */
export function reminderPhysicalPosition(workArea: PhysicalWorkArea, scaleFactor: number, siblingVisible: boolean) {
  const width = Math.round(WIDTH * scaleFactor)
  const height = Math.round(HEIGHT * scaleFactor)
  const margin = Math.round(MARGIN * scaleFactor)
  const siblingOffset = siblingVisible ? Math.round((HEIGHT + GAP) * scaleFactor) : 0
  return {
    x: workArea.position.x + workArea.size.width - width - margin,
    y: workArea.position.y + workArea.size.height - height - margin - siblingOffset,
  }
}

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
  const [{ WebviewWindow }, { emitTo }, { primaryMonitor, PhysicalPosition }] = await Promise.all([
    import('@tauri-apps/api/webviewWindow'),
    import('@tauri-apps/api/event'),
    import('@tauri-apps/api/window'),
  ])
  const label = `reminder-${payload.kind}`
  const siblingLabel = `reminder-${payload.kind === 'watching' ? 'other' : 'watching'}`
  const monitor = await primaryMonitor()
  if (!monitor) throw new Error('primary monitor unavailable')

  const sibling = await WebviewWindow.getByLabel(siblingLabel)
  const siblingVisible = sibling ? await sibling.isVisible() : false
  const physicalPosition = reminderPhysicalPosition(monitor.workArea, monitor.scaleFactor, siblingVisible)
  const position = new PhysicalPosition(physicalPosition.x, physicalPosition.y)
  const logicalPosition = position.toLogical(monitor.scaleFactor)
  const macOS = isMacOS()
  const backgroundColor: [number, number, number, number] =
    macOS ? (payload.theme === 'light' ? [247, 244, 245, 255] : [35, 36, 38, 255]) : [0, 0, 0, 0]

  let popup = await WebviewWindow.getByLabel(label)
  if (!popup) {
    popup = new WebviewWindow(label, {
      url: `index.html?reminder=${payload.kind}`,
      x: logicalPosition.x,
      y: logicalPosition.y,
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
  }
  // Windows 创建 WebView 窗口时，系统或状态恢复插件可能覆盖初始坐标。
  // 窗口创建完成后每次都重新定位，确保落在任务栏工作区右下角。
  await popup.setPosition(position)
  await emitTo(label, RICH_REMINDER_EVENT, payload)
  await popup.show()
}
