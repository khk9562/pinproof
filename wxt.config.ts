import { defineConfig } from 'wxt';

/**
 * 화면 캡처(chrome.tabs.captureVisibleTab)는 사이트 권한만으로는 안 되고 activeTab 또는 <all_urls>가 필요하다.
 * 동작 범위를 localhost로 지키기 위해 activeTab을 쓴다: 툴바 아이콘(또는 Alt+Shift+B)으로 패널을 열면
 * 그 탭에서 캡처가 허용되고, 같은 origin 안에서 이동해도 유지된다.
 * E2E 테스트는 아이콘 클릭을 자동화할 수 없어 BUGNOTES_E2E=1 빌드에만 <all_urls>를 추가한다.
 */
const e2e = process.env.BUGNOTES_E2E === '1';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: e2e ? '.output-e2e' : '.output',
  manifest: {
    name: 'BugNotes',
    description: '화면 버그를 증거와 함께 기록해 Claude Code에 건별로 넘깁니다.',
    permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'tabs', 'activeTab'],
    host_permissions: ['http://localhost/*', 'http://127.0.0.1/*', ...(e2e ? ['<all_urls>'] : [])],
    action: { default_title: 'BugNotes 열기 (Alt+Shift+B)' },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+B' },
        description: 'BugNotes 사이드 패널 열기',
      },
    },
  },
  webExt: { disabled: true },
});
