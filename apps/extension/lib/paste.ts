import { Evidence } from './types';

const MAX_TEXT = 5000;
const MAX_WIDTH = 1600;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** 큰 이미지는 폭 1600px로 줄여 PNG로 저장한다 */
async function imageToDataUrl(file: Blob): Promise<string> {
  try {
    const bmp = await createImageBitmap(file);
    if (bmp.width <= MAX_WIDTH && file.type === 'image/png') return readAsDataUrl(file);
    const k = Math.min(1, MAX_WIDTH / bmp.width);
    const canvas = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return readAsDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
  } catch {
    return readAsDataUrl(file);
  }
}

/**
 * 붙여넣기/끌어다 놓기 데이터를 증거로 바꾼다.
 * 이미지는 각각 하나의 증거, 텍스트는(이미지가 없을 때만) 하나의 증거로 만든다.
 */
export async function evidenceFromTransfer(dt: DataTransfer, page: { url: string; route: string }): Promise<Evidence[]> {
  const base = (): Evidence => ({
    uid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'paste',
    url: page.url,
    route: page.route,
    capturedAt: Date.now(),
    viewportWidth: 0,
    note: '',
  });
  const images = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
  const out: Evidence[] = [];
  for (const img of images) out.push({ ...base(), screenshot: await imageToDataUrl(img) });
  if (out.length === 0) {
    const text = dt.getData('text/plain').trim();
    if (text) out.push({ ...base(), pastedText: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text });
  }
  return out;
}
