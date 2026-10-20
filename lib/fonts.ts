import { PAPERLOGY_RANGE } from './paperlogy-range';

// Paperlogy(눈누 projectnoonnu/2408-3@1.0) — 확장 안(public/fonts)에 넣어 오프라인에서도 쓰고 외부 요청을 하지 않는다.
// 패널·연결 탭에서 쓰는 굵기(400–800)만 넣었다.
const FILES: [number, string][] = [
  [400, '4Regular'],
  [500, '5Medium'],
  [600, '6SemiBold'],
  [700, '7Bold'],
  [800, '8ExtraBold'],
];

/**
 * @font-face 대신 여기서 등록한다. 그려진 글자 범위(1,858구간)를 굵기마다 CSS 에 되풀이하면 너무 커지기 때문.
 * 범위 밖의 글자는 브라우저가 대체 폰트(Pretendard·시스템 한글 폰트)로 그려 투명 글자가 생기지 않는다.
 * 페이지 위 오버레이(Shadow DOM)에서는 쓰지 않는다 — 호스트 문서에 폰트를 등록해야 해서.
 */
export function registerFonts() {
  if (typeof FontFace === 'undefined') return;
  const unicodeRange = PAPERLOGY_RANGE.split(',').map((r) => `U+${r}`).join(',');
  for (const [weight, file] of FILES) {
    const url = chrome.runtime.getURL(`/fonts/Paperlogy-${file}.woff2` as '/fonts/Paperlogy-4Regular.woff2');
    document.fonts.add(new FontFace('Paperlogy', `url(${url}) format('woff2')`, { weight: String(weight), display: 'swap', unicodeRange }));
  }
}
