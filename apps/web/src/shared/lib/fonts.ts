import { PAPERLOGY_RANGE } from '@pinproof/shared';

const FILES: [number, string][] = [
  [400, '4Regular'],
  [500, '5Medium'],
  [600, '6SemiBold'],
  [700, '7Bold'],
  [800, '8ExtraBold'],
];

let registered = false;

export function registerWebFonts(): void {
  if (registered || typeof FontFace === 'undefined') return;
  registered = true;
  const unicodeRange = PAPERLOGY_RANGE.split(',')
    .map((r) => `U+${r}`)
    .join(',');
  for (const [weight, file] of FILES) {
    const face = new FontFace(
      'Paperlogy',
      `url(/fonts/Paperlogy-${file}.woff2) format('woff2')`,
      {
        weight: String(weight),
        display: 'swap',
        unicodeRange,
      },
    );
    document.fonts.add(face);
  }
}
