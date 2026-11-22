import { LOCAL_PATTERNS } from '@/lib/connect';
import { ToBackground } from '@/lib/messages';

const SCRIPT_IDS = ['pp-mainworld', 'pp-picker'];

/**
 * 사용자가 켠 사이트(선택 권한으로 받은 origin)에 선택 도구·네트워크 기록 스크립트를 등록한다.
 * localhost·127.0.0.1 은 manifest 에 이미 있어 제외한다(두 번 들어가지 않게).
 */
let syncing: Promise<void> = Promise.resolve();
function syncSiteScripts() {
  syncing = syncing.then(async () => {
    const { origins = [] } = await chrome.permissions.getAll();
    const sites = origins.filter((o) => !LOCAL_PATTERNS.includes(o));
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: SCRIPT_IDS });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
    if (sites.length === 0) return;
    await chrome.scripting.registerContentScripts([
      { id: 'pp-mainworld', js: ['content-scripts/mainworld.js'], matches: sites, excludeMatches: LOCAL_PATTERNS, runAt: 'document_start', world: 'MAIN' },
      { id: 'pp-picker', js: ['content-scripts/picker.js'], matches: sites, excludeMatches: LOCAL_PATTERNS, runAt: 'document_idle' },
    ]);
  }).catch((e) => console.error('PinProof: 사이트 스크립트 등록 실패', e));
  return syncing;
}

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  syncSiteScripts();
  chrome.permissions.onAdded.addListener(() => syncSiteScripts());
  chrome.permissions.onRemoved.addListener(() => syncSiteScripts());

  chrome.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
    if (msg?.type === 'bn:sync-sites') {
      syncSiteScripts().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg?.type !== 'bn:screenshot') return;
    const windowId = sender.tab?.windowId;
    if (windowId === undefined) {
      sendResponse({ error: '탭 정보를 알 수 없습니다.' });
      return;
    }
    chrome.tabs
      .captureVisibleTab(windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  });
});
