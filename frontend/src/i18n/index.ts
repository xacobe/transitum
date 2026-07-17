import { createI18n } from 'vue-i18n'
import fr from './locales/fr.json'
import en from './locales/en.json'
import es from './locales/es.json'

const ALL_MESSAGES = { fr, en, es } as const
type SupportedLocale = keyof typeof ALL_MESSAGES

// Human-readable names for the language picker (not in locale files to avoid
// the chicken-and-egg problem of showing a name in a language not yet loaded).
const LOCALE_NAMES: Record<SupportedLocale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
}

const STORAGE_KEY = 'transit_locale'

export const SUPPORTED_LOCALES: SupportedLocale[] = (import.meta.env.VITE_LOCALES ?? 'fr,en')
  .split(',')
  .map((s: string) => s.trim())
  .filter((s: string): s is SupportedLocale => s in ALL_MESSAGES)

export function localeName(locale: string): string {
  return LOCALE_NAMES[locale as SupportedLocale] ?? locale
}

const DEFAULT_LOCALE: SupportedLocale = SUPPORTED_LOCALES.includes(
  import.meta.env.VITE_DEFAULT_LOCALE as SupportedLocale,
)
  ? (import.meta.env.VITE_DEFAULT_LOCALE as SupportedLocale)
  : (SUPPORTED_LOCALES[0] ?? 'fr')

function initialLocale(): SupportedLocale {
  const saved = localStorage.getItem(STORAGE_KEY)
  return SUPPORTED_LOCALES.includes(saved as SupportedLocale)
    ? (saved as SupportedLocale)
    : DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { fr, en, es },
})

export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.setAttribute('lang', locale)
}

// Sets the lang attribute right at initial load, not just on language change.
document.documentElement.setAttribute('lang', i18n.global.locale.value)
