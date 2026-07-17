import { ref, computed } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'transit_install_banner_dismissed'

// Module-level: the browser fires beforeinstallprompt only once per session.
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e as BeforeInstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null
  })
}

export function useInstallPrompt() {
  function isStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
    )
  }

  function isIos(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
  }

  function isDismissed(): boolean {
    return !!localStorage.getItem(DISMISS_KEY)
  }

  function dismiss(): void {
    localStorage.setItem(DISMISS_KEY, '1')
  }

  const canInstall = computed(() => !!deferredPrompt.value)

  async function install(): Promise<void> {
    if (!deferredPrompt.value) return
    await deferredPrompt.value.prompt()
    const { outcome } = await deferredPrompt.value.userChoice
    if (outcome === 'accepted') dismiss()
    deferredPrompt.value = null
  }

  return { isStandalone, isIos, isDismissed, dismiss, canInstall, install }
}
