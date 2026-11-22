export type ThemePref = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'pinproof-web-theme';

export function readThemePref(): ThemePref {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // ignore
  }
  return 'system';
}

export function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', pref);
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // ignore
  }
}

export function nextThemePref(current: ThemePref): ThemePref {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

export function themeLabel(pref: ThemePref): string {
  if (pref === 'light') return '라이트';
  if (pref === 'dark') return '다크';
  return '시스템';
}
