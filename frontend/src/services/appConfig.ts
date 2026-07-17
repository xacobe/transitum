// Single source for the deployment's app identity - set once in config/.env
// (VITE_APP_NAME, VITE_APP_ICON), read everywhere the UI needs to show it
// (logo wordmark, PWA manifest via vite.config.js, footer/privacy copy) so a
// new deployment never has to touch component code to rebrand.
export const APP_NAME = import.meta.env.VITE_APP_NAME

// Path to the app's icon (favicon, in-app logo mark). Regenerate the file
// itself with frontend/scripts/generate-icons.sh after changing
// VITE_THEME_COLOR, or point this at your own custom SVG/PNG entirely.
export const APP_ICON = import.meta.env.VITE_APP_ICON
