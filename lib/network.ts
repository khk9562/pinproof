import { NetworkEntry } from './types';

export const BODY_PREVIEW_MAX = 500;
const BUFFER_MAX = 300;

/** 개발 서버 자산·HMR·프레임워크 내부 요청은 증거에서 뺀다 */
export function shouldRecord(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url, location.href);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol)) return false;
  const p = u.pathname;
  if (/^\/(_next|@vite|@react-refresh|@id|@fs|node_modules|__vite|sockjs-node)\b/.test(p)) return false;
  if (u.searchParams.has('_rsc') || u.searchParams.has('import') || u.searchParams.has('t') && /\.(t|j)sx?$/.test(p)) return false;
  if (/\.(js|mjs|cjs|ts|tsx|jsx|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf)$/.test(p)) return false;
  if (/hot-update|webpack-hmr|__webpack/.test(p)) return false;
  return true;
}

export function preview(text: string): string {
  return text.length > BODY_PREVIEW_MAX ? `${text.slice(0, BODY_PREVIEW_MAX)}…` : text;
}

function isTextual(contentType: string | null): boolean {
  if (!contentType) return true;
  if (/event-stream/.test(contentType)) return false;
  return /json|text|xml|javascript|graphql|x-www-form-urlencoded/.test(contentType);
}

export function currentRoute(): string {
  return location.pathname + (location.hash.startsWith('#/') ? location.hash : '');
}

/**
 * MAIN world에서 fetch/XHR을 감싸 응답 요약을 버퍼에 쌓는다.
 * 요청 헤더·쿠키·Authorization은 읽지도 저장하지도 않는다.
 */
export function installNetworkHook(): NetworkEntry[] {
  const buffer: NetworkEntry[] = [];
  const push = (e: NetworkEntry) => {
    buffer.push(e);
    if (buffer.length > BUFFER_MAX) buffer.shift();
  };

  const origFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const route = currentRoute();
    const start = performance.now();
    const absUrl = new URL(url, location.href).href;
    try {
      const res = await origFetch.call(this, input, init);
      if (shouldRecord(absUrl)) {
        const durationMs = Math.round(performance.now() - start);
        const ct = res.headers.get('content-type');
        const base = { method, url: absUrl, status: res.status, durationMs, route, time: Date.now() };
        if (isTextual(ct)) {
          res
            .clone()
            .text()
            .then((t) => push({ ...base, size: new Blob([t]).size, bodyPreview: preview(t) }))
            .catch(() => push({ ...base, size: 0, bodyPreview: '' }));
        } else {
          push({ ...base, size: Number(res.headers.get('content-length')) || 0, bodyPreview: `(${ct ?? '바이너리'})` });
        }
      }
      return res;
    } catch (err) {
      if (shouldRecord(absUrl)) {
        push({
          method,
          url: absUrl,
          status: 0,
          durationMs: Math.round(performance.now() - start),
          size: 0,
          bodyPreview: `요청 실패: ${String(err)}`,
          route,
          time: Date.now(),
        });
      }
      throw err;
    }
  };

  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;
  type Meta = { method: string; url: string; start: number; route: string };
  const meta = new WeakMap<XMLHttpRequest, Meta>();
  XHR.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    meta.set(this, { method: method.toUpperCase(), url: new URL(String(url), location.href).href, start: 0, route: '' });
    // @ts-expect-error 가변 인자 그대로 전달
    return origOpen.call(this, method, url, ...rest);
  } as typeof XHR.open;
  XHR.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const m = meta.get(this);
    if (m && shouldRecord(m.url)) {
      m.start = performance.now();
      m.route = currentRoute();
      this.addEventListener('loadend', () => {
        let text = '';
        try {
          if (this.responseType === '' || this.responseType === 'text') text = this.responseText;
          else if (this.responseType === 'json') text = JSON.stringify(this.response);
          else text = `(${this.responseType})`;
        } catch {
          /* 읽을 수 없는 응답 */
        }
        push({
          method: m.method,
          url: m.url,
          status: this.status,
          durationMs: Math.round(performance.now() - m.start),
          size: new Blob([text]).size,
          bodyPreview: preview(text),
          route: m.route,
          time: Date.now(),
        });
      });
    }
    return origSend.call(this, body);
  };

  return buffer;
}
