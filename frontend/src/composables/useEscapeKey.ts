import { onMounted, onUnmounted } from 'vue'

/** Calls onEscape() while the component using this is mounted - for modals/sheets to close on Esc. */
export function useEscapeKey(onEscape: () => void): void {
  function handler(e: KeyboardEvent) {
    if (e.key === 'Escape') onEscape()
  }
  onMounted(() => window.addEventListener('keydown', handler))
  onUnmounted(() => window.removeEventListener('keydown', handler))
}
