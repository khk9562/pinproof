/** 페이지 위 오버레이에 쓰는 인라인 SVG. 색은 currentColor 나 style.ts 의 클래스로 정한다 */

const svg = (body: string, size = 14, box = '0 0 16 16') =>
  `<svg width="${size}" height="${size}" viewBox="${box}" aria-hidden="true">${body}</svg>`;

const line = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

/** 익스텐션 아이콘과 같은 압정(assets/icon/pin.svg). 머리(하늘색) → 받침(남색) 그라데이션, 모드 중에는 실루엣이 숨쉰다 */
export const PIN_LOGO = svg(
  '<defs><linearGradient id="pp-grad" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="74">' +
    '<stop offset="0" stop-color="#38bdf8"/><stop offset="1" style="stop-color: var(--pin-bottom)"/></linearGradient></defs>' +
    '<g transform="translate(64 64) rotate(45) scale(.9) translate(-64 -64)">' +
    '<path class="pp-needle" d="M64 70V121"/>' +
    '<path class="pp-body" fill="url(#pp-grad)" d="M46 6H82A10 10 0 0 1 82 26H80L77 54H92A10 10 0 0 1 92 74H36A10 10 0 0 1 36 54H51L48 26H46A10 10 0 0 1 46 6Z"/></g>',
  22,
  '2.5 1.9 123.6 123.6',
);

export const ICON = {
  element: svg(`<rect x="2" y="2" width="9" height="9" rx="1.5" ${line}/><path d="M8.6 8.6l5 1.8-2.2 1-1 2.2z" fill="currentColor"/>`),
  text: svg(`<path d="M3 3.5h10M8 3.5V13M6 13h4" ${line}/>`),
  region: svg(`<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.4 2"/>`),
  network: svg(`<path d="M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13" ${line}/>`),
  eye: svg(`<path d="M1.8 8s2.3-4.3 6.2-4.3S14.2 8 14.2 8s-2.3 4.3-6.2 4.3S1.8 8 1.8 8z" ${line}/><circle cx="8" cy="8" r="1.8" ${line}/>`),
  eyeOff: svg(
    `<path d="M1.8 8s2.3-4.3 6.2-4.3S14.2 8 14.2 8s-2.3 4.3-6.2 4.3S1.8 8 1.8 8z" ${line}/><circle cx="8" cy="8" r="1.8" ${line}/><path d="M3 13L13 3" ${line}/>`,
  ),
  grip:
    '<svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden="true">' +
    '<circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/></svg>',
  monitor: svg(`<rect x="2" y="3" width="12" height="8" rx="1.3" ${line}/><path d="M6 13.5h4M8 11v2.5" ${line}/>`),
  trash: svg(`<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" ${line}/>`),
};
