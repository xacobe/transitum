import { onUnmounted, ref } from 'vue'
import { track } from '@/composables/useAnalytics'

// iOS 13+ gates DeviceOrientationEvent behind an explicit permission
// prompt - the type isn't in lib.dom.d.ts's DeviceOrientationEvent, so it's
// declared narrowly here rather than widening the global type.
interface IOSDeviceOrientationEventConstructor {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

// iOS's own DeviceOrientationEvent carries the already-true-north compass
// bearing directly; nothing else does.
interface CompassOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
}

/**
 * Device compass heading in degrees (0 = north, clockwise), for rotating
 * the "you are here" marker's direction cone the way Google/Apple Maps do.
 * Distinct from GPS movement heading (GeolocationPosition.coords.heading),
 * which only exists while actually moving - this reflects which way the
 * phone itself is physically pointed, even standing still.
 *
 * needsPermission is iOS-only (Safari gates the sensor behind a prompt that
 * only resolves 'granted' when requestPermission() runs directly inside a
 * user gesture). Everywhere else (Android Chrome, desktop) there's no gate
 * at all - requestPermission() just attaches the listener, safe to call
 * from onMounted with no user interaction. Callers gate on
 * `!needsPermission` before auto-attaching for exactly that reason: this
 * app has no UI to satisfy the iOS gesture requirement, so iOS is simply
 * left without a heading cone rather than adding a dedicated permission
 * button just for that one platform (see HomeView.vue's own wiring).
 */
export function useDeviceHeading() {
  const heading = ref<number | null>(null)
  const supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
  const needsPermission = supported
    && typeof (window.DeviceOrientationEvent as unknown as IOSDeviceOrientationEventConstructor).requestPermission === 'function'

  let listening = false

  function onOrientation(e: CompassOrientationEvent) {
    if (typeof e.webkitCompassHeading === 'number') {
      heading.value = e.webkitCompassHeading
    } else if (e.absolute && e.alpha != null) {
      // alpha increases counter-clockwise from the device's arbitrary
      // starting position; only meaningful as a true compass bearing when
      // e.absolute is set. Flip it to a clockwise bearing from north.
      heading.value = (360 - e.alpha) % 360
    }
  }

  function attach() {
    if (listening) return
    listening = true
    // Chrome/Firefox fire the explicitly-absolute event; Safari never
    // does, but sends webkitCompassHeading on the plain event instead -
    // both listeners stay registered, onOrientation reads whichever field
    // the firing event actually has.
    window.addEventListener('deviceorientationabsolute', onOrientation as EventListener)
    window.addEventListener('deviceorientation', onOrientation as EventListener)
  }

  function detach() {
    if (!listening) return
    listening = false
    window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener)
    window.removeEventListener('deviceorientation', onOrientation as EventListener)
    heading.value = null
  }

  /** On iOS (needsPermission), call directly inside a click handler -
   * awaiting anything before this (or calling it from a non-gesture
   * context) makes iOS silently deny it. Elsewhere, safe to call from
   * anywhere (e.g. onMounted), since there's nothing to actually grant.
   * Resolves whether the compass is now active. */
  async function requestPermission(): Promise<boolean> {
    if (!supported) return false
    if (needsPermission) {
      try {
        const ctor = window.DeviceOrientationEvent as unknown as Required<IOSDeviceOrientationEventConstructor>
        const result = await ctor.requestPermission()
        if (result !== 'granted') {
          track('compass-denied')
          return false
        }
      } catch {
        track('compass-denied')
        return false
      }
    }
    attach()
    track('compass-enabled')
    return true
  }

  onUnmounted(detach)

  return { heading, supported, needsPermission, requestPermission, detach }
}
