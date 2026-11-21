/**
 * 여정: 네트워크 담기 (features/network-capture.md)
 * 폴더 연결 → /nodes 로 이동해 두 API 응답(200 · 403)을 기다림 → 툴바의 [네트워크] → 패널 줄 · 항목 md 확인
 * 사용: node .claude/skills/verify-pinproof/scripts/journeys/network-capture.mjs
 */
import { launch, checker } from '../harness.mjs';

const h = await launch({ name: 'network-capture' });
const c = checker(h.log);
try {
  await h.connect();

  // 두 요청은 페이지 로드 때 동시에 나가고 403 쪽은 페이지가 기다리지 않으므로, 둘 다 응답이 온 뒤에 담는다
  const responses = Promise.all([
    h.app.waitForResponse((r) => new URL(r.url()).pathname === '/api/nodes'),
    h.app.waitForResponse((r) => new URL(r.url()).pathname === '/api/forbidden'),
  ]);
  await h.app.goto(`${h.base}/nodes`);
  await responses;
  await h.app.locator('#node-table').waitFor();
  await h.toolbar.root.waitFor({ timeout: 5000 });
  await h.snap('nodes-loaded');

  await h.toolbar.network.click(); // 사용자 경로: 페이지 툴바의 [네트워크] 버튼
  const row = h.panel.locator('.cat.current .ev.network').first();
  await row.waitFor({ timeout: 10000 });
  const num = (await row.locator('.num').textContent()).trim();
  c.check(/^\d+$/.test(num), `패널에 네트워크 항목 줄(번호 ${num})`);
  c.check((await row.locator('.num.outline').count()) === 1, '페이지 마커가 없는 항목이라 번호 원이 테두리만');

  const file = `.pinproof/items/${num.padStart(3, '0')}.md`;
  const md = await h.waitOpfs(file, (t) => t.includes('## 네트워크') && t.includes('node-a') && t.includes('→ 403'));
  c.check(md !== null, `${file} 에 네트워크 기록(200 응답 본문의 node-a, 403 응답)`);
  c.check(md?.includes('status: 대기') ?? false, `${file} 의 상태는 대기`);
  const saveFails = (await h.notices()).filter((t) => t.includes('저장 실패'));
  c.check(saveFails.length === 0, `저장 실패 경고 없음${saveFails.length ? `: ${saveFails[0]}` : ''}`);
  await h.snap('after-capture');
} catch (e) {
  c.fail(`예외: ${e.message}`);
  await h.snap('error').catch(() => {});
} finally {
  await h.close();
}
h.log(c.failures ? `${c.failures}개 실패` : '모두 통과');
process.exitCode = c.failures ? 1 : 0;
