/**
 * DOM element factory for MiniMap's one remaining HTML overlay: the
 * pick-location context menu (a maplibregl.Popup's content, not a position
 * marker - every actual marker on the map is a GL layer, see
 * overlayLayers.ts).
 */

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

const PICK_MENU_STYLE_ID = 'mm-pick-menu-style'

/** Injects the pick-menu CSS once per document. */
export function injectPickMenuStyles(): void {
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
