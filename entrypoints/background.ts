import { ToBackground } from '@/lib/messages';

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  chrome.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
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
