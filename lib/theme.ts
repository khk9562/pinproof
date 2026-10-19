/**
 * 화면 테마 설정. 기본은 시스템 설정(prefers-color-scheme)을 따르고, 사용자가 라이트·다크를 고를 수 있다.
 * 사이드 패널과 페이지 위 오버레이가 같은 값(chrome.storage.local)을 본다.
 */
export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_KEY = 'theme';

const ORDER: ThemePref[] = ['system', 'light', 'dark'];

export const THEME_LABEL: Record<ThemePref, string> = {
  system: '시스템 설정',
  light: '라이트',
  dark: '다크',
};

export function nextTheme(p: ThemePref): ThemePref {
  return ORDER[(ORDER.indexOf(p) + 1) % ORDER.length];
}

export function asTheme(v: unknown): ThemePref {
  return v === 'light' || v === 'dark' ? v : 'system';
}

export async function loadTheme(): Promise<ThemePref> {
  try {
    return asTheme((await chrome.storage.local.get(THEME_KEY))[THEME_KEY]);
  } catch {
    return 'system';
  }
}

/** 값이 바뀔 때마다 부른다(다른 곳에서 바꿔도). 해제 함수를 돌려준다 */
export function onThemeChange(fn: (p: ThemePref) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (THEME_KEY in changes) fn(asTheme(changes[THEME_KEY].newValue));
  };
  chrome.storage.local.onChanged.addListener(listener);
  return () => chrome.storage.local.onChanged.removeListener(listener);
}

/** 요소에 data-theme 를 붙인다. system 이면 떼어 CSS 의 prefers-color-scheme 를 따르게 한다 */
export function applyTheme(el: HTMLElement, p: ThemePref) {
  if (p === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', p);
}
