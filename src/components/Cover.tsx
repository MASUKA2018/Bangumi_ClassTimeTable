import { useEffect, useRef, useState, type ReactNode } from 'react'
import { coverGeneration, loadCover } from '../lib/covers'

export default function Cover({ src, className, fallback = '番' }: { src?: string; className: string; fallback?: ReactNode }) {
  const [image, setImage] = useState<string>()
  const [revision, setRevision] = useState(coverGeneration)
  const [attempt, setAttempt] = useState(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(()=>{setAttempt(0)},[src])
  useEffect(()=>()=>clearTimeout(retryTimer.current),[])
  useEffect(() => {
    const retry = () => { setRevision(coverGeneration()); setAttempt(0) }
    window.addEventListener('online', retry); window.addEventListener('btt-reload-covers', retry)
    return () => { window.removeEventListener('online', retry); window.removeEventListener('btt-reload-covers', retry) }
  }, [])
  useEffect(() => {
    let active = true
    setImage(undefined)
    if (!src) return
    let timer: ReturnType<typeof setTimeout>
    void loadCover(src).then(value => { if (active) setImage(value) }).catch(() => {
      if (active && attempt < 2) timer = setTimeout(() => setAttempt(x => x+1), (attempt+1)*2000)
    })
    return () => { active = false; clearTimeout(timer) }
  }, [src, revision, attempt])
  return image ? <img className={className} src={image} loading="lazy" alt="" onError={() => { setImage(undefined); clearTimeout(retryTimer.current); if (attempt < 2) retryTimer.current=setTimeout(() => setAttempt(x => x+1), 2000) }} />
    : <span className={`${className} ph placeholder`}>{fallback}</span>
}
