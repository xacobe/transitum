/**
 * DOM element factories for MiniMap's HTML markers, plus the one-off <style>
 * injections they rely on.
 *
 * All marker styles are applied inline so they work regardless of when Vite
 * injects component CSS — MapLibre appends marker elements outside Vue's
 * component tree and the injection timing is not guaranteed.
 * Only @keyframes can't be inlined; those are injected once via a <style> tag
 * (see injectMarkerStyles).
 *
 * These factories only build elements — attaching them to the map (creating
 * maplibregl.Marker instances) stays in MiniMap.vue.
 */
import busStopSvg from '@tabler/icons/outline/bus-stop.svg?raw'
import flagSvg    from '@tabler/icons/outline/flag-3.svg?raw'

/**
 * Pulsing dot (animated ring + solid dot). Used for the user's GPS position
 * and, with a bigger size/faster pulse, for the currently selected stop in
 * route mode (search mode's own selected-stop halo is a GL layer instead -
 * see MiniMap.vue's startSelectedStopHalo - so it can't drift off-center
 * from the icon the way an HTML marker overlaid on the canvas could).
 */
export function pulsingDotElement(
  color: string,
  size: number,
  opts: { ringInset?: string; duration?: string; shadow?: string } = {},
): HTMLElement {
  const { ringInset = '-8px', duration = '2.6s', shadow = '0 2px 7px rgba(0,0,0,.35)' } = opts
  const wrap = document.createElement('div')
  Object.assign(wrap.style, {
    position: 'relative', width: `${size}px`, height: `${size}px`, pointerEvents: 'none',
  })

  const ring = document.createElement('div')
  Object.assign(ring.style, {
    position: 'absolute', inset: ringInset, borderRadius: '50%',
    background: color, animation: `mm-pulse ${duration} ease-out infinite`,
  })

  const dot = document.createElement('div')
  Object.assign(dot.style, {
    position: 'absolute', inset: '0', borderRadius: '50%',
    background: color, border: '3px solid #fff',
    boxShadow: shadow,
  })

  wrap.appendChild(ring)
  wrap.appendChild(dot)
  return wrap
}

/** Teardrop destination pin (route mode's "to" marker). Anchor: bottom. */
export function pinElement(color: string): HTMLElement {
  const el = document.createElement('div')
  Object.assign(el.style, {
    width: '20px', height: '20px',
    borderRadius: '50% 50% 50% 0',
    background: color, border: '2px solid #fff',
    boxShadow: '0 3px 7px rgba(0,0,0,.3)',
    transform: 'rotate(-45deg)',
  })
  return el
}

/** Plain solid dot (route mode's "from" marker). */
export function solidDotElement(color: string): HTMLElement {
  const el = document.createElement('div')
  Object.assign(el.style, {
    width: '18px', height: '18px', borderRadius: '50%',
    background: color, border: '3px solid #fff',
    boxShadow: '0 2px 7px rgba(0,0,0,.35)',
    pointerEvents: 'none',
  })
  return el
}

/** Shared circle-with-icon core for the flag and bus-stop markers below. */
function iconCircleElement(svgRaw: string, background: string, boxShadow: string): HTMLElement {
  const el = document.createElement('div')
  Object.assign(el.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '34px', height: '34px', borderRadius: '50%',
    background, border: '2.5px solid #fff',
    boxShadow, color: '#fff',
  })
  el.innerHTML = svgRaw
  const svg = el.querySelector('svg')
  if (svg) Object.assign(svg.style, { width: '18px', height: '18px', flexShrink: '0' })
  return el
}

/** Flag marker for a manually picked origin (search mode). */
export function originFlagElement(accentColor: string): HTMLElement {
  const el = iconCircleElement(flagSvg, accentColor, '0 2px 7px rgba(0,0,0,.35)')
  el.style.pointerEvents = 'none'
  return el
}

/** "You are here" bus-stop marker (stop mode's own stop). */
export function busStopElement(background: string, onClick: () => void): HTMLElement {
  const el = iconCircleElement(busStopSvg, background, '0 1px 4px rgba(0,0,0,.35)')
  el.style.cursor = 'pointer'
  el.addEventListener('click', onClick)
  return el
}

/**
 * Pick-location context-menu content: the "use as origin"/"use as
 * destination" buttons. Two fixed actions, not a generic list - MiniMap
 * only ever shows this one pair. `onPickOrigin`/`onPickDestination` each
 * run after `beforePick` (menu cleanup) in their button's click handler.
 */
export function pickMenuElement(
  originLabel: string, onPickOrigin: () => void,
  destinationLabel: string, onPickDestination: () => void,
  beforePick: () => void,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'mm-pick-menu'

  const makeBtn = (label: string, className: string, onPick: () => void): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.className = className
    btn.textContent = label
    btn.addEventListener('click', () => { beforePick(); onPick() })
    return btn
  }

  wrap.appendChild(makeBtn(originLabel, 'mm-pick-origin', onPickOrigin))
  wrap.appendChild(makeBtn(destinationLabel, 'mm-pick-dest', onPickDestination))
  return wrap
}

const MARKER_STYLE_ID = 'mm-keyframes'
const PICK_MENU_STYLE_ID = 'mm-pick-menu-style'

/** Injects the pulse keyframes and pick-menu CSS once per document. */
export function injectMarkerStyles(): void {
  if (!document.getElementById(MARKER_STYLE_ID)) {
    const s = document.createElement('style')
    s.id = MARKER_STYLE_ID
    s.textContent = `@keyframes mm-pulse{0%{transform:scale(.5);opacity:.5}70%{opacity:0}100%{transform:scale(2.2);opacity:0}}`
    document.head.appendChild(s)
  }
  if (!document.getElementById(PICK_MENU_STYLE_ID)) {
    const s = document.createElement('style')
    s.id = PICK_MENU_STYLE_ID
    s.textContent = `
      .mm-pick-menu{display:flex;flex-direction:column;gap:4px;min-width:150px;padding:2px 0}
      .mm-pick-menu button{
        display:block;width:100%;padding:8px 12px;border-radius:6px;
        text-align:left;font:600 13px/1.3 system-ui,sans-serif;cursor:pointer;
        transition:filter .1s
      }
      .mm-pick-menu button:hover{filter:brightness(.92)}
      .mm-pick-origin{background:var(--color-chip-bg,#e8edf3);color:var(--color-chip-text,#0f172a)}
      .mm-pick-dest{background:var(--color-accent,#2563eb);color:#fff}
    `
    document.head.appendChild(s)
  }
}
