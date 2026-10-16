import { detectReact } from '@/lib/adapters/react';
import { BRIDGE_KEY, BridgeRequest, BridgeResponse, TARGET_ATTR } from '@/lib/messages';
import { installNetworkHook } from '@/lib/network';

/**
 * 페이지 JS와 같은 MAIN world에서 document_start에 실행된다.
 * ① fetch/XHR 기록(페이지가 처음 호출하는 API부터 잡기 위해 가장 먼저 설치)
 * ② 프레임워크 어댑터(React fiber는 MAIN world에서만 보임)
 * isolated world의 선택 도구와는 window.postMessage로만 통신한다.
 */
export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  world: 'MAIN',
  runAt: 'document_start',
  allFrames: false,
  main() {
    const buffer = installNetworkHook();

    window.addEventListener('message', async (ev) => {
      if (ev.source !== window) return;
      const msg = ev.data as BridgeRequest;
      if (!msg || msg.key !== BRIDGE_KEY || msg.dir !== 'req') return;

      let data: unknown = null;
      if (msg.op === 'component') {
        const el = document.querySelector(`[${TARGET_ATTR}="${msg.target}"]`);
        try {
          data = el ? await detectReact(el) : null;
        } catch {
          data = null;
        }
      } else if (msg.op === 'network') {
        data = buffer.filter((e) => e.route === msg.route).slice(-50);
      }
      const res: BridgeResponse = { key: BRIDGE_KEY, dir: 'res', id: msg.id, data };
      window.postMessage(res, location.origin);
    });
  },
});
