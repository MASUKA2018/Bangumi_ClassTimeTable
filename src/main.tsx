import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ReminderPopup from './components/ReminderPopup'
import './styles.css'
import { installNativeAdapters, isNativeApp } from './lib/native'
import type { ReminderKind } from './lib/notifications'

installNativeAdapters()

const reminderParam = new URLSearchParams(location.search).get('reminder')
const reminderKind: ReminderKind | null = reminderParam === 'watching' || reminderParam === 'other' ? reminderParam : null
if (reminderKind) document.documentElement.dataset.reminder = 'true'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{reminderKind ? <ReminderPopup kind={reminderKind} /> : <App />}</React.StrictMode>,
)

// PWA:生产环境注册 Service Worker(静态资源离线缓存;dev 下跳过以免干扰 HMR)
if (import.meta.env.PROD && !isNativeApp() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
