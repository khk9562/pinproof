/** 페이지 위 오버레이에 쓰는 인라인 SVG. 색은 currentColor 나 style.ts 의 클래스로 정한다 */

const svg = (body: string, size = 14, box = '0 0 16 16') =>
  `<svg width="${size}" height="${size}" viewBox="${box}" aria-hidden="true">${body}</svg>`;

const line = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

/** 익스텐션 아이콘과 같은 핀(assets/icon/pin.svg). 모드 중에는 연두 원(.pp-dot)이 숨쉰다 */
export const PIN_LOGO = svg(
  '<path class="pp-body" d="M64 6C38.6 6 18 26.3 18 51.4c0 30.7 37.6 63.7 42.6 68a5.2 5.2 0 0 0 6.8 0C72.4 115.1 110 82.1 110 51.4 110 26.3 89.4 6 64 6Z"/>' +
    '<circle class="pp-dot" cx="64" cy="51" r="25"/><path class="pp-chk" d="M52.5 51.5l8 8 15-16"/>',
  22,
  '0 0 128 128',
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
