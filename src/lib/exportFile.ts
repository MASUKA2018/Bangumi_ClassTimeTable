import { isNativeApp } from './native'
export async function exportTextFile(name:string,text:string,mime:'application/json'|'text/calendar'):Promise<void>{
  if (isNativeApp() && /Android/i.test(navigator.userAgent)) {
    const {invoke}=await import('@tauri-apps/api/core')
    await invoke('android_export_text',{name,text,mime});return
  }
  const url=URL.createObjectURL(new Blob([text],{type:`${mime};charset=utf-8`}))
  const link=document.createElement('a');link.href=url;link.download=name;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
