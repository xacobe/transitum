export function formatTime(msOrDate: number | Date): string {
  const d = typeof msOrDate === 'number' ? new Date(msOrDate) : msOrDate
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatDuration(totalSeconds: number): string {
  const totalMin = Math.round(totalSeconds / 60)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

/** Short user-facing date ("12 Jan"), localized to the given locale. */
export function formatShortDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

/** Compact date + time ("12/01/26 14:30") for admin/diagnostic tables. */
export function formatDateTime(iso: string | null | undefined, fallback = ''): string {
  if (!iso) return fallback
  return new Date(iso).toLocaleString(navigator.language, {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}
