const SKIP_WELCOME_KEY = 'whizreveal.skip-welcome';

/** Storage can be unavailable in restricted webviews; the welcome remains usable. */
export function readSkipWelcome(): boolean {
  try { return window.localStorage.getItem(SKIP_WELCOME_KEY) === 'true'; }
  catch { return false; }
}

export function writeSkipWelcome(value: boolean): void {
  try { window.localStorage.setItem(SKIP_WELCOME_KEY, String(value)); }
  catch { /* A preference failure must never prevent opening a session. */ }
}
