import { defineConfig } from 'wxt';

/**
 * 화면 캡처(chrome.tabs.captureVisibleTab)는 사이트 권한만으로는 안 되고 activeTab 또는 <all_urls>가 필요하다.
 * 동작 범위를 localhost로 지키기 위해 activeTab을 쓴다: 툴바 아이콘(또는 Alt+Shift+B)으로 패널을 열면
 * 그 탭에서 캡처가 허용되고, 같은 origin 안에서 이동해도 유지된다.
 * E2E 테스트는 아이콘 클릭을 자동화할 수 없어 PINPROOF_E2E=1 빌드에만 <all_urls>를 추가한다.
 */
const e2e = process.env.PINPROOF_E2E === '1';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: e2e ? '.output-e2e' : '.output',
  manifest: {
    // 확장 ID 고정용 공개키(ID: cjhefepniacmcgnhmfheajiiehbbiclo). 폴더를 옮겨도 ID가 바뀌지 않아 폴더 연결·작성 중 기록이 유지된다.
    // Chrome 웹스토어에 올릴 때는 이 줄을 빼야 한다(스토어가 자체 키를 쓴다).
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArH6+DfetCI2kANOkRcnNF7COzO2YWOB2pj/XVrPLWnlz5VxN5LvZORsr0VvP2GwiXprLWwnOE5o4hiYqRDLzblUvOBKHezTXQc04aKCcSco92ZzR+t7+etDdM7P9hDp9D4WeFSaIuokb7YANXAuXBvazU05x1WI5aXIPgrDE2jwlm0kED3p+U6alMj4ZdGVQX0q5N7aEPQu6603G1tx4PvxA7eRfXHdJm4YtJv8l/oOVNDqXHDraeRnlzt4RXxdUVMa9WSkRxMsGk+2cuVA354YJixLy0diEJuyXmvsUkm/GJiFJ2G8KeblpVc42uDRh4oysiP2pz7Ul5X9Y6bQg6wIDAQAB',
    name: 'PinProof',
    description: '화면 버그를 증거와 함께 기록해 Claude Code에 건별로 넘깁니다.',
    permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'tabs', 'activeTab'],
    host_permissions: ['http://localhost/*', 'http://127.0.0.1/*', ...(e2e ? ['<all_urls>'] : [])],
    action: { default_title: 'PinProof 열기 (Alt+Shift+B)' },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+B' },
        description: 'PinProof 사이드 패널 열기',
      },
    },
  },
  webExt: { disabled: true },
});
