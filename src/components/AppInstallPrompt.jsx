import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function AppInstallPrompt() {
  const { profile } = useAuth()
  const [installEvent, setInstallEvent] = useState(null)
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true)
  const roleCanInstall = ['teacher', 'student', 'parent'].includes(profile?.role)
  const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    const onPrompt = event => { event.preventDefault(); setInstallEvent(event) }
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); toast.success('SmartSchool has been added to your home screen.') }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  if (!roleCanInstall || installed || (!installEvent && !isAppleMobile)) return null

  async function install() {
    if (!installEvent) {
      toast('On your iPhone or iPad, tap Share, then “Add to Home Screen”.', { duration: 6500, icon: '📲' })
      return
    }
    await installEvent.prompt()
    const result = await installEvent.userChoice
    if (result.outcome === 'accepted') setInstalled(true)
    setInstallEvent(null)
  }

  return <button className="app-install-button" type="button" onClick={install} aria-label="Install SmartSchool app">Install app <span aria-hidden="true">↓</span></button>
}
