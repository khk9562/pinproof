/**
 * 익스텐션 E2E: Playwright Chromium에 빌드된 익스텐션을 로드하고
 * 1) 프레임워크 없는 fixture 페이지에서 요소·텍스트·영역·네트워크 증거 수집, 페이지 이동 후 계속 수집
 * 2) md 파일 생성·처리 기록 보존·보관 동작
 * 3) (heureum dev 서버가 떠 있으면) React 19 어댑터의 컴포넌트·소스 위치 감지
 * 를 확인한다. 폴더 선택 창은 자동화할 수 없어 ?opfs=1 로 익스텐션 OPFS를 프로젝트 폴더 대신 쓴다.
 *
 * 사용: npm run build && node tests/e2e/run.mjs [heureumUrl]
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(here, '../../.output-e2e/chrome-mv3');
const profile = path.resolve(here, '../../.e2e-profile');
const outDir = path.resolve(here, '../../test-results');
const heureumUrl = process.argv[2];

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? '✔' : '✘'} ${label}`);
  if (!cond) failures++;
}

// ---------- fixture 서버 ----------
const html = fs.readFileSync(path.join(here, 'fixture/index.html'), 'utf8');
const server = http.createServer((req, res) => {
  if (req.url === '/api/nodes') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ items: [{ name: 'node-a', cpu: 40 }, { name: 'node-b', cpu: 35 }, { name: 'node-c', cpu: 52 }] }));
  } else if (req.url === '/api/forbidden') {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'forbidden' }));
  } else {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  }
});
await new Promise((r) => server.listen(5199, '127.0.0.1', r));
const BASE = 'http://localhost:5199';

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  // deploy.test 를 localhost 가 아닌 "배포 주소"처럼 쓰려고 127.0.0.1 로 돌린다
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--host-resolver-rules=MAP deploy.test 127.0.0.1'],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  console.log('extension id:', extId);

  const app = ctx.pages()[0] ?? (await ctx.newPage());
  await app.goto(`${BASE}/dashboard`);
  await app.waitForTimeout(500);

  const tabId = await sw.evaluate(async (base) => {
    const [t] = await chrome.tabs.query({ url: `${base}/*` });
    return t.id;
  }, BASE);

  // 사이드 패널을 별도 창으로 연다(앱 탭이 자기 창에서 활성 상태여야 captureVisibleTab이 앱을 찍는다)
  const panelPromise = ctx.waitForEvent('page');
  await sw.evaluate(
    ({ extId, tabId }) => chrome.windows.create({ url: `chrome-extension://${extId}/sidepanel.html?tab=${tabId}&opfs=1`, type: 'popup', width: 420, height: 900 }),
    { extId, tabId },
  );
  const panel = await panelPromise;
  await panel.waitForLoadState();
  await panel.setViewportSize({ width: 400, height: 900 });

  const readOpfs = (p) =>
    panel.evaluate(async (p) => {
      let dir = await navigator.storage.getDirectory();
      const parts = p.split('/');
      const file = parts.pop();
      try {
        for (const part of parts) dir = await dir.getDirectoryHandle(part);
        if (!file) {
          const names = [];
          for await (const [n] of dir.entries()) names.push(n);
          return names.sort().join(',');
        }
        return await (await (await dir.getFileHandle(file)).getFile()).text();
      } catch {
        return null;
      }
    }, p);

  // 패널에 뜬 안내·경고를 모두 모아 둔다(잠깐 떴다 사라지는 저장 실패 경고도 잡으려고)
  await panel.evaluate(() => {
    window.__notices = [];
    new MutationObserver(() => {
      for (const n of document.querySelectorAll('.notice')) {
        if (!window.__notices.includes(n.textContent)) window.__notices.push(n.textContent);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });

  // ---------- 연결 ----------
  // git 저장소처럼 보이게 .git/info/exclude 와 팀 .gitignore 를 미리 둔다
  await panel.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const write = async (dir, name, text) => {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    };
    const git = await root.getDirectoryHandle('.git', { create: true });
    await write(await git.getDirectoryHandle('info', { create: true }), 'exclude', '# git ls-files --others\n*~\n');
    await write(root, '.gitignore', 'node_modules\n');
  });
  await panel.getByRole('button', { name: '프로젝트 폴더 연결' }).click();
  await panel.getByText('작성 중인 기록이 없습니다').waitFor();
  check((await readOpfs('.pinproof/WORKFLOW.md'))?.includes('# PinProof 처리 절차'), 'WORKFLOW.md 생성');
  check((await readOpfs('.claude/commands/pinproof.md')) === null, '프로젝트에 /pinproof 커맨드를 만들지 않음');
  check((await readOpfs('.git/info/exclude')) === '# git ls-files --others\n*~\n\n# PinProof\n.pinproof/\n', '.git/info/exclude 에 .pinproof/ 추가');
  check((await readOpfs('.gitignore')) === 'node_modules\n', '팀 .gitignore 는 그대로');
  check((await readOpfs('.pinproof/WORKFLOW.md')).startsWith('<!-- pinproof-workflow v'), 'WORKFLOW.md에 버전 표시');
  check(!(await panel.locator('.wf-update').isVisible()), '최신 버전이면 업데이트 버튼 없음');
  // 옛 버전(버전 표시 없음)으로 바꿔두면 [업데이트] 버튼이 뜨고, 누르면 교체된다
  await panel.evaluate(async () => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('.pinproof');
    const w = await (await d.getFileHandle('WORKFLOW.md')).createWritable();
    await w.write('# PinProof 처리 절차 (옛 버전)\n');
    await w.close();
  });
  await panel.locator('.wf-update').waitFor({ timeout: 8000 });
  panel.once('dialog', (d) => d.accept());
  await panel.locator('.wf-update').getByRole('button', { name: '업데이트' }).click();
  await panel.waitForTimeout(500);
  check((await readOpfs('.pinproof/WORKFLOW.md')).includes('재처리') && !(await panel.locator('.wf-update').isVisible()), '[업데이트]로 WORKFLOW.md 최신화');

  // ---------- 페이지 위 툴바 (패널이 열려 있으면 뜬다) ----------
  const ov = (fn, arg) => app.locator('pinproof-overlay').evaluate(fn, arg);
  const tool = (name) => app.locator('pinproof-overlay .tb .tools').getByRole('button', { name: new RegExp(`^${name}`) });
  const pop = app.locator('pinproof-overlay .pop:not(.out)');
  /** 팝오버가 뜨면 메모를 쓰고 Enter 로 담는다 */
  const confirm = async (note = '') => {
    await pop.waitFor({ timeout: 5000 });
    const ta = pop.locator('textarea');
    if (note) await ta.fill(note);
    await ta.press('Enter');
    await pop.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  };
  const pins = () => ov((h) => [...h.shadowRoot.querySelectorAll('.pin:not(.temp):not(.leaving):not([hidden])')].map((p) => (p.classList.contains('loose') ? '·' : p.firstChild?.textContent ?? '')));
  await app.locator('pinproof-overlay .tb').waitFor({ timeout: 5000 });
  check(await app.locator('pinproof-overlay .tb').isVisible(), '패널이 열려 있으면 페이지 오른쪽 위에 툴바');
  check((await app.evaluate(() => document.querySelectorAll('pinproof-overlay').length)) === 1, 'localhost 에는 페이지 스크립트가 한 번만(고정 등록과 사이트별 등록이 겹치지 않음)');
  // 툴바 기본 위치: 화면 아래 가운데(아래에서 24px). 손잡이로 끌면 옮겨지고, 새로고침해도 그 자리를 기억한다
  const tbBox = async () => {
    await app.waitForTimeout(350);
    return app.locator('pinproof-overlay .tb').boundingBox();
  };
  const vp = app.viewportSize();
  let box = await tbBox();
  check(Math.abs(box.x + box.width / 2 - vp.width / 2) <= 2 && Math.abs(vp.height - (box.y + box.height) - 24) <= 2, `툴바 기본 위치는 아래 가운데: x중심 ${Math.round(box.x + box.width / 2)} / 아래 여백 ${Math.round(vp.height - box.y - box.height)}`);
  const grip = await app.locator('pinproof-overlay .tb .grip').boundingBox();
  await app.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await app.mouse.down();
  await app.mouse.move(grip.x - 200, grip.y - 300, { steps: 6 });
  await app.mouse.up();
  const moved = await tbBox();
  // 손잡이 가운데를 잡아 (grip.x-200, grip.y-300)으로 놓았으니 이동량은 (-200-폭/2, -300-높이/2)
  const want = { x: box.x - 200 - grip.width / 2, y: box.y - 300 - grip.height / 2 };
  check(Math.abs(moved.x - want.x) <= 4 && Math.abs(moved.y - want.y) <= 4, `손잡이로 끌면 툴바가 옮겨짐: (${Math.round(moved.x)}, ${Math.round(moved.y)}) / 기대 (${Math.round(want.x)}, ${Math.round(want.y)})`);
  await app.reload();
  await app.locator('pinproof-overlay .tb').waitFor({ timeout: 5000 });
  const kept = await tbBox();
  check(Math.abs(kept.x - moved.x) <= 2 && Math.abs(kept.y - moved.y) <= 2, '새로고침해도 옮긴 위치를 기억');
  // 이후 검사가 기본 위치를 쓰도록 저장한 위치를 지운다
  await sw.evaluate(() => chrome.storage.local.remove('toolbarPos:http://localhost:5199'));
  await app.reload();
  await app.locator('pinproof-overlay .tb').waitFor({ timeout: 5000 });
  check(!(await panel.getByRole('button', { name: /^요소/ }).count()), '패널에는 모드 버튼 없음(툴바로 옮김)');

  // ---------- 미분류 ----------
  await tool('요소').click();
  check(await ov((h) => h.shadowRoot.querySelector('.tb').classList.contains('mode')), '모드에 들어가면 툴바가 안내 띠로 변신');
  await app.hover('#help');
  await app.click('#help'); // 실제 마우스 클릭 → 그 자리에 팝오버
  await pop.waitFor({ timeout: 5000 });
  check(await pop.locator('.p-to.loose').isVisible(), '작성 중 기록이 없으면 팝오버가 "미분류"로 담긴다고 표시');
  await confirm();
  await panel.locator('.section .ev').first().waitFor({ timeout: 5000 }).catch(() => {});
  check((await panel.locator('.section .ev').count()) === 1, '클릭 → 팝오버 Enter 로 담기 + 작성 중인 건이 없을 때는 미분류로');
  check((await panel.locator('.section .ev .target-sel').first().textContent()) === '#help', '미분류 카드에 선택한 요소 표시');
  await app.waitForTimeout(300);
  check((await pins()).join(',') === '·', '미분류 증거는 문자 없는 회색 마커');

  // ---------- 새 기록 + 요소 ----------
  await panel.getByRole('button', { name: '+ 새 기록' }).click();
  await panel.getByPlaceholder('예: 대시보드 총합 불일치').fill('대시보드 총합 불일치');
  await panel.getByPlaceholder(/현상: 무엇이/).fill('총합은 10인데 노드 목록 CPU를 더하면 100이 넘음');
  await panel.getByPlaceholder('예: #589').fill('#589');
  await app.waitForTimeout(300);
  check((await app.locator('pinproof-overlay .tb .rec').textContent()).includes('#001'), '툴바 기록 칩에 작성 중 기록 번호');

  await app.hover('[data-testid="summary-total"]');
  // ↑ 로 부모 카드까지 올라갔다가 ↓ 로 되돌아오는 키보드 이동
  await app.keyboard.press('ArrowUp');
  await app.keyboard.press('ArrowDown');
  const labelText = await ov((h) => h.shadowRoot.querySelector('.label').textContent);
  check(/<strong>/.test(labelText), `hover 라벨 표시: ${labelText}`);
  await app.keyboard.press('Enter');
  await pop.waitFor({ timeout: 5000 });
  await pop.locator('textarea').fill('총합 숫자가 목록 합과 다름');
  await app.waitForTimeout(350);
  await app.screenshot({ path: path.join(outDir, 'page-popover.png') });
  check((await pop.locator('.p-to').textContent()).includes('A') && (await pop.locator('.p-to').textContent()).includes('#001'), '팝오버 머리에 "#001 에 A 로 담김"');
  check((await pop.locator('.p-name').textContent()).includes('<strong>'), '팝오버 머리에 요소 이름');
  await confirm('총합 숫자가 목록 합과 다름');
  const dropped = await app.locator('pinproof-overlay .pin.drop').waitFor({ timeout: 1000 }).then(() => true, () => false);
  check(dropped, '담으면 새 마커에 꽂힘 애니메이션');
  await panel.locator('.draft .ev').first().waitFor();

  // 방금 담은 줄은 펼쳐져 요소 이름·selector 를 보여주고, 페이지에는 A 마커가 꽂힌다
  const fresh = panel.locator('.ev.fresh');
  check((await fresh.locator('.target-name').textContent()) === '<strong>', '패널에 방금 담은 요소 이름 표시');
  check((await fresh.locator('.target-sel').textContent()) === '[data-testid="summary-total"]', '패널에 selector 표시');
  check((await fresh.locator('.memo').textContent()) === '총합 숫자가 목록 합과 다름', '팝오버에서 쓴 메모가 한 줄 목록에');
  await app.waitForTimeout(400);
  await app.mouse.move(1, 1);
  await app.waitForTimeout(400);
  await app.screenshot({ path: path.join(outDir, 'page-markers.png') });
  check((await pins()).sort().join(',') === 'A,·', `페이지에 A 마커 + 미분류 점: ${(await pins()).join(',')}`);
  check((await ov((h) => h.shadowRoot.querySelector('.pin:not(.loose) .tip').textContent)).includes('총합 숫자가'), '마커 툴팁에 메모');
  // 같은 경로라도 ?tab= 처럼 쿼리로 화면이 바뀌면 마커를 숨기고, 원래 주소로 돌아오면 다시 보인다 (SPA 이동)
  await app.evaluate(() => history.pushState(null, '', '/dashboard?tab=other'));
  await app.waitForTimeout(300);
  check((await pins()).length === 0, `쿼리만 바뀐 화면(?tab=other)에서는 마커 숨김: ${(await pins()).join(',')}`);
  await app.evaluate(() => history.pushState(null, '', '/dashboard'));
  await app.waitForTimeout(300);
  check((await pins()).sort().join(',') === 'A,·', '원래 주소로 돌아오면 마커 다시 보임');

  // ✕ 로 삭제 → 다시 담기
  await app.keyboard.press('Escape');
  check(!(await ov((h) => h.shadowRoot.querySelector('.tb').classList.contains('mode'))), 'Esc 로 모드 종료 → 툴바 원래대로');
  await fresh.locator('.ev-del').click();
  await panel.waitForTimeout(400);
  check((await panel.locator('.draft .ev').count()) === 0, '✕ 로 증거 삭제');
  check((await pins()).join(',') === '·', '삭제하면 페이지 마커도 사라짐');
  await tool('요소').click();
  await app.mouse.move(1, 1);
  await app.click('[data-testid="summary-total"]'); // 이번엔 클릭으로
  await confirm();
  await panel.locator('.draft .ev').first().waitFor({ timeout: 5000 }).catch(() => {});
  check((await panel.locator('.draft .ev').count()) === 1, '요소 모드에서 클릭으로 담기');
  check((await panel.locator('.draft .ev .target-page').first().textContent()).includes('/dashboard'), '카드에 페이지 경로 표시');
  // 같은 요소를 다시 고르면 새로 담지 않고 그 마커의 편집 팝오버가 열린다
  // (요소가 마커보다 작아 마커가 덮을 수 있다 — 마커를 눌러도 같은 팝오버라 좌표로 누른다)
  await app.click('[data-testid="summary-total"]', { force: true });
  await pop.waitFor({ timeout: 3000 }).catch(() => {});
  check((await pop.getAttribute('aria-label').catch(() => '')) === '증거 A 편집', '같은 요소를 다시 고르면 A 편집 팝오버(중복 담기 방지)');
  // 편집 팝오버에서 메모를 고치면 패널에 반영
  await pop.locator('textarea').fill('페이지에서 고친 메모');
  await pop.getByRole('button', { name: '저장' }).click();
  await panel.waitForTimeout(400);
  check((await panel.locator('.draft .ev .memo').first().textContent()) === '페이지에서 고친 메모', '마커 편집 팝오버의 메모가 패널에 반영');
  check((await panel.locator('.draft .ev').count()) === 1, '같은 요소 중복 담기 방지');
  await app.keyboard.press('Escape');
  // 마커 숨기기
  await app.keyboard.press('Alt+Shift+KeyH');
  check(await ov((h) => h.shadowRoot.querySelector('.pins').classList.contains('off')), 'Alt+Shift+H 로 마커 숨기기');
  await app.keyboard.press('Alt+Shift+KeyH');

  // ---------- 텍스트 ----------
  await tool('텍스트').click();
  await app.evaluate(() => {
    const t = document.getElementById('help').firstChild;
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 20);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await confirm();
  await panel.locator('.draft .ev').nth(1).waitFor();
  await app.keyboard.press('Escape'); // 담은 뒤에도 모드는 계속된다 → 끝내야 툴바 버튼이 다시 보인다

  // ---------- 영역 ----------
  await tool('영역').click();
  await app.mouse.move(20, 60);
  await app.mouse.down();
  await app.mouse.move(400, 200, { steps: 5 });
  await app.mouse.up();
  await confirm();
  await panel.locator('.draft .ev').nth(2).waitFor();

  // 모드 중 안내 띠의 모드 이름을 누르면 선택 메뉴가 툴바 위로 열리고, 고르면 모드가 바로 바뀐다
  const modeName = app.locator('pinproof-overlay .guide .mode-name');
  const menu = app.locator('pinproof-overlay .mode-menu');
  const inMode = () => ov((h) => h.shadowRoot.querySelector('.tb').classList.contains('mode'));
  await modeName.click();
  await menu.waitFor({ timeout: 3000 });
  await app.waitForTimeout(250);
  const mb = await menu.boundingBox();
  const tbb = await app.locator('pinproof-overlay .tb').boundingBox();
  check(mb.y + mb.height <= tbb.y, '모드 선택 메뉴는 툴바 위로 열림');
  check((await menu.locator('[aria-checked="true"]').textContent()).includes('영역'), '메뉴에 지금 모드(영역) 체크');
  await app.screenshot({ path: path.join(outDir, 'page-mode-menu.png') });
  const evBefore = await panel.locator('.draft .ev').count();
  await app.mouse.click(700, 300); // 바깥 클릭
  await app.waitForTimeout(300);
  check((await menu.isHidden()) && (await inMode()) && (await panel.locator('.draft .ev').count()) === evBefore, '바깥 클릭은 메뉴만 닫음(모드·증거 그대로)');
  await modeName.click();
  await menu.waitFor();
  await app.keyboard.press('Escape');
  await app.waitForTimeout(200);
  check((await menu.isHidden()) && (await inMode()), 'Esc 는 메뉴만 닫음(모드는 그대로)');
  await modeName.click();
  await menu.locator('[data-pick="element"]').click();
  await app.waitForTimeout(300);
  check((await modeName.textContent()).includes('요소') && (await inMode()), '메뉴에서 요소를 고르면 모드가 바로 바뀜');
  await app.keyboard.press('Escape');

  // ---------- 페이지 이동 후 계속 수집 + 컨테이너 + 네트워크 ----------
  await app.goto(`${BASE}/nodes`);
  await app.locator('#node-table').waitFor();
  await app.locator('pinproof-overlay .tb').waitFor({ timeout: 5000 });
  check(await app.locator('pinproof-overlay .tb').isVisible(), '페이지를 옮겨도 툴바가 다시 뜸');
  await tool('요소').click();
  await app.hover('#node-table td');
  await app.keyboard.press('ArrowUp'); // tr
  await app.keyboard.press('ArrowUp'); // tbody
  await app.keyboard.press('ArrowUp'); // table
  await app.keyboard.press('Enter');
  await confirm();
  await panel.locator('.draft .ev').nth(3).waitFor();
  await app.keyboard.press('Escape');
  await tool('네트워크').click();
  await panel.locator('.draft .ev').nth(4).waitFor();
  await app.waitForTimeout(300);
  check((await pins()).join(',') === 'D', `다른 페이지(/nodes)에서는 그 페이지의 마커만: ${(await pins()).join(',')}`);
  check((await panel.locator('.draft .ev').nth(4).locator('.letter.outline').count()) === 1, '페이지 마커가 없는 증거(네트워크)는 테두리 문자');
  // 패널 목록에서 D 줄을 펼치면 페이지의 D 마커가 반짝인다 (방금 담아 이미 펼쳐져 있으면 접었다가 다시)
  const dHead = panel.locator('.draft .ev').nth(3).locator('.ev-head');
  if ((await dHead.getAttribute('aria-expanded')) === 'true') await dHead.click();
  await dHead.click();
  await app.waitForTimeout(700);
  check(await ov((h) => [...h.shadowRoot.querySelectorAll('.pin')].some((p) => p.classList.contains('target'))), '목록 클릭 → 마커 펄스');

  // ---------- 클립보드 붙여넣기: 이미지 1장 + 텍스트 ----------
  await panel.evaluate(async () => {
    const c = new OffscreenCanvas(120, 60);
    const g = c.getContext('2d');
    g.fillStyle = '#ef4444';
    g.fillRect(0, 0, 120, 60);
    const blob = await c.convertToBlob({ type: 'image/png' });
    const zone = document.querySelector('.paste-zone');
    const img = new DataTransfer();
    img.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
    zone.dispatchEvent(new ClipboardEvent('paste', { clipboardData: img, bubbles: true, cancelable: true }));
  });
  await panel.locator('.draft .ev').nth(5).waitFor();
  await panel.evaluate(() => {
    const t = new DataTransfer();
    t.setData('text/plain', 'Slack에서 받은 오류 로그\nError: 403 forbidden');
    document.querySelector('.paste-zone').dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true }));
  });
  await panel.locator('.draft .ev').nth(6).waitFor();
  check((await panel.locator('.ev.paste').count()) === 2, '붙여넣기 이미지·텍스트가 카드로 추가');
  await panel.waitForTimeout(1200);

  // ---------- 파일 확인 ----------
  const names = await readOpfs('.pinproof/');
  const mdName = names.split(',').find((n) => n.startsWith('001-'));
  check(mdName === '001-대시보드-총합-불일치.md', `md 파일명: ${mdName}`);
  const md = await readOpfs(`.pinproof/${mdName}`);
  fs.writeFileSync(path.join(outDir, mdName), md ?? '');
  check(md.includes('related: "#589"') && md.includes('evidence: 7'), 'frontmatter');
  check(md.includes('### F. 붙여넣기 — /nodes') && md.includes('- 이미지: ![F](assets/001/F.png)'), 'F: 붙여넣은 이미지');
  check(md.includes('### G. 붙여넣기 — /nodes') && md.includes('Error: 403 forbidden'), 'G: 붙여넣은 텍스트');
  check(md.includes('### A. 요소 — /dashboard') && md.includes('selector: `[data-testid="summary-total"]`'), 'A: data-testid selector');
  check(md.includes('### B. 텍스트 — /dashboard') && md.includes('선택한 텍스트: "미설치 VM 목록 조회에 실패했습니다"'), 'B: 텍스트 exact');
  check(md.includes('### C. 영역 — /dashboard') && md.includes('영역 안 요소'), 'C: 영역 + 안쪽 요소');
  check(/영역 안에 보이던 글자: .*"총 CPU 합계"/.test(md), 'C: 영역 안에 보이던 글자');
  check(/^updated: \d{4}-/m.test(md), 'frontmatter updated 시각');
  check(md.includes('### D. 컨테이너 — /nodes') && md.includes('헤더: 이름 | CPU') && md.includes('화면에 보이는 행: 3'), 'D: 다른 페이지의 테이블 컨테이너');
  check(md.includes('### E. 네트워크 — /nodes') && md.includes('/api/nodes') && md.includes('node-a') && md.includes('→ 403'), 'E: 네트워크(200 응답 본문 + 403)');
  check(!md.includes('x1a2b3c') || !/selector: `[^`]*x1a2b3c/.test(md), 'selector에 해시 클래스 없음');
  const assets = await readOpfs('.pinproof/assets/001/');
  check(assets === 'A.png,B.png,C.png,D.png,F.png', `스크린샷 파일: ${assets}`);
  const png = await panel.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const d = await (await (await root.getDirectoryHandle('.pinproof')).getDirectoryHandle('assets')).getDirectoryHandle('001');
    const f = await (await d.getFileHandle('A.png')).getFile();
    const bmp = await createImageBitmap(f);
    return { size: f.size, w: bmp.width, h: bmp.height, b64: btoa(String.fromCharCode(...new Uint8Array(await f.arrayBuffer()))) };
  });
  fs.writeFileSync(path.join(outDir, 'A.png'), Buffer.from(png.b64, 'base64'));
  check(png.size > 500 && png.w > 20 && png.h > 20, `스크린샷 A ${png.w}×${png.h}`);

  // ---------- 처리 기록 보존 ----------
  await panel.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const d = await root.getDirectoryHandle('.pinproof');
    const fh = await d.getFileHandle(name);
    const text = await (await fh.getFile()).text();
    const w = await fh.createWritable();
    await w.write(`${text}\n## 처리 기록\n- 원인: 테스트로 덧붙인 처리 기록\n`);
    await w.close();
  }, mdName);
  await panel.getByPlaceholder(/현상: 무엇이/).fill('메모 수정됨');
  await panel.waitForTimeout(1200);
  const md2 = await readOpfs(`.pinproof/${mdName}`);
  check(md2.includes('메모 수정됨') && md2.includes('- 원인: 테스트로 덧붙인 처리 기록'), '익스텐션이 다시 써도 처리 기록 보존');

  await panel.setViewportSize({ width: 400, height: 1400 });
  await panel.screenshot({ path: path.join(outDir, 'panel-draft.png'), fullPage: true });
  const saveFails = (await panel.evaluate(() => window.__notices)).filter((t) => t.includes('저장 실패'));
  check(saveFails.length === 0, `연달아 담아도 "파일 저장 실패" 경고 없음${saveFails.length ? `: ${saveFails[0]}` : ''}`);

  // ---------- 작성 종료 → 목록 → 보관 ----------
  await panel.getByRole('button', { name: '작성 종료' }).click();
  await panel.locator('.rec').first().waitFor();
  await panel.waitForTimeout(5500); // 목록 주기 갱신으로 처리 기록 표시 반영
  check(await panel.getByText('처리 기록 있음').isVisible(), '목록에 처리 기록 있음 표시');
  await panel.screenshot({ path: path.join(outDir, 'panel.png'), fullPage: true });
  await panel.locator('.rec-actions').getByRole('button', { name: '보관' }).click();
  await panel.waitForTimeout(500);
  check((await readOpfs(`.pinproof/archive/${mdName}`)) !== null && (await readOpfs(`.pinproof/${mdName}`)) === null, '보관: archive/로 이동');
  check((await readOpfs('.pinproof/archive/assets/001/')) === 'A.png,B.png,C.png,D.png,F.png', '보관: 스크린샷도 이동');

  // ---------- 기록 삭제 ----------
  panel.on('dialog', (d) => d.accept());
  await panel.getByRole('button', { name: '보관함 보기' }).click();
  await panel.locator('.rec-actions').getByRole('button', { name: '삭제' }).click();
  await panel.waitForTimeout(500);
  check((await readOpfs(`.pinproof/archive/${mdName}`)) === null && (await readOpfs('.pinproof/archive/assets/001/')) === null, '보관함의 기록 삭제: md·스크린샷 삭제');
  await panel.getByRole('button', { name: '기록 보기' }).click();

  await panel.getByRole('button', { name: '+ 새 기록' }).click();
  await panel.getByPlaceholder('예: 대시보드 총합 불일치').fill('지울 기록');
  // 증거 2개를 담고 A를 지우면 남은 증거가 A로 다시 매겨진다
  await tool('요소').click();
  await app.click('h1');
  await confirm();
  await panel.locator('.draft .ev').nth(0).waitFor();
  await app.click('#node-table');
  await confirm();
  await panel.locator('.draft .ev').nth(1).waitFor();
  await app.keyboard.press('Escape');
  await panel.locator('.draft .ev').first().locator('.ev-del').click();
  await panel.waitForTimeout(400);
  const letters = await panel.locator('.draft .ev .letter').allTextContents();
  const firstHead = panel.locator('.draft .ev').first().locator('.ev-head');
  if ((await firstHead.getAttribute('aria-expanded')) !== 'true') await firstHead.click();
  check(letters.join(',') === 'A' && (await panel.locator('.draft .ev .target-sel').first().textContent()).startsWith('#node-table'), `증거 삭제 후 문자 다시 매기기: ${letters.join(',')}`);
  await panel.waitForTimeout(1000);
  const before = await readOpfs('.pinproof/');
  await panel.getByRole('button', { name: '기록 삭제' }).click();
  await panel.waitForTimeout(500);
  const after = await readOpfs('.pinproof/');
  check(/지울-기록\.md/.test(before) && !/지울-기록\.md/.test(after), '작성 중인 기록 삭제');
  check(await panel.getByRole('button', { name: '+ 새 기록' }).isVisible(), '삭제 후 작성 중 상태 해제');

  // 아무것도 쓰지 않고 작성 종료하면 기록이 남지 않는다(새 기록을 만들 때 생긴 md 까지 지움)
  await panel.getByRole('button', { name: '+ 새 기록' }).click();
  await panel.locator('.draft').waitFor();
  await panel.waitForTimeout(700);
  const emptyId = (await panel.locator('.draft-head .mono').textContent()).replace('#', '');
  const hasEmptyMd = async () => (await readOpfs('.pinproof/')).split(',').some((n) => n.startsWith(`${emptyId}-`));
  check(await hasEmptyMd(), `새 기록을 만들면 md 가 생김(#${emptyId})`);
  await panel.getByRole('button', { name: '작성 종료' }).click();
  await panel.waitForTimeout(700);
  check(!(await hasEmptyMd()) && (await panel.locator('.records .rec-title', { hasText: '(제목 없음)' }).count()) === 0, '아무것도 쓰지 않고 작성 종료하면 기록이 사라짐');

  // ---------- 이전 이름(.bugnotes/) → .pinproof/ 옮기기 ----------
  await panel.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const write = async (dir, name, text) => {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    };
    await root.getDirectoryHandle('.git', { create: true });
    const legacy = await root.getDirectoryHandle('.bugnotes', { create: true });
    await write(legacy, 'WORKFLOW.md', '# 옛 절차 (.bugnotes)');
    await write(legacy, '077-옛-기록.md', '---\nid: 77\ntitle: "옛 기록"\ntype: 버그\nevidence: 1\n---\n\n## 처리 기록\n- 옛 처리\n');
    const a = await (await legacy.getDirectoryHandle('assets', { create: true })).getDirectoryHandle('077', { create: true });
    await write(a, 'A.png', 'png');
    const cmds = await (await root.getDirectoryHandle('.claude', { create: true })).getDirectoryHandle('commands', { create: true });
    await write(cmds, 'bugnotes.md', '`.bugnotes/WORKFLOW.md`를 읽고 그 절차를 그대로 따른다.');
    await write(root, '.gitignore', 'node_modules\n\n# BugNotes\n.bugnotes/\n.claude/commands/bugnotes.md\n');
  });
  await panel.getByRole('button', { name: '옮기기' }).waitFor({ timeout: 8000 });
  await panel.getByRole('button', { name: '옮기기' }).click(); // 확인 창은 위에서 등록한 dialog 핸들러가 수락
  await panel.waitForTimeout(800);
  const migrated = {
    record: await readOpfs('.pinproof/077-옛-기록.md'),
    asset: await readOpfs('.pinproof/assets/077/'),
    legacy: await readOpfs('.bugnotes/'),
    workflow: await readOpfs('.pinproof/WORKFLOW.md'),
    oldCmd: await readOpfs('.claude/commands/bugnotes.md'),
    newCmd: await readOpfs('.claude/commands/pinproof.md'),
    gitignore: await readOpfs('.gitignore'),
    exclude: await readOpfs('.git/info/exclude'),
  };
  check(migrated.record?.includes('- 옛 처리') && migrated.asset === 'A.png', '옮기기: 기록·처리 기록·스크린샷 이동');
  check(migrated.legacy === null && migrated.oldCmd === null && migrated.newCmd === null, '옮기기: .bugnotes/ 와 /bugnotes 커맨드 정리, 새 커맨드는 만들지 않음');
  check(!migrated.workflow.includes('옛 절차'), '옮기기: WORKFLOW.md는 새 버전 유지');
  check(migrated.gitignore.includes('# BugNotes') && !migrated.gitignore.includes('.pinproof/'), '옮기기: 팀 .gitignore 는 그대로');
  check(migrated.exclude.split('\n').filter((l) => l === '.pinproof/').length === 1, '옮기기: exclude 의 .pinproof/ 는 한 줄만');
  check(await panel.locator('.rec-title', { hasText: '옛 기록' }).isVisible(), '옮긴 기록이 목록에 표시');

  // ---------- 배포 주소(localhost 아님): 사이트별로 켠 곳에서도 동작하고 로컬 폴더에 연결 ----------
  // (E2E 빌드는 <all_urls> 권한이 있어 켜기 버튼의 권한 확인 창 없이 "켜진 사이트"로 취급된다)
  const DEPLOY = 'http://deploy.test:5199';
  await app.goto(`${DEPLOY}/dashboard`);
  await panel.waitForTimeout(800);
  check(await panel.getByRole('button', { name: '프로젝트 폴더 연결' }).isVisible(), '배포 주소는 따로 폴더를 연결한다(같은 로컬 폴더에 연결 가능)');
  check(await panel.locator('.site-on').isVisible(), '켠 사이트에는 "직접 켠 사이트입니다 · 끄기" 표시');
  await panel.getByRole('button', { name: '프로젝트 폴더 연결' }).click();
  await panel.getByRole('button', { name: '+ 새 기록' }).waitFor();
  await app.locator('pinproof-overlay .tb').waitFor({ timeout: 5000 });
  check(await app.locator('pinproof-overlay .tb').isVisible(), '배포 주소에도 사이트별 등록으로 툴바가 뜸');
  await panel.getByRole('button', { name: '+ 새 기록' }).click();
  await panel.getByPlaceholder('예: 대시보드 총합 불일치').fill('배포 환경 확인');
  await tool('요소').click();
  await app.click('[data-testid="summary-total"]');
  await confirm('배포에서 본 값');
  await panel.locator('.draft .ev').first().waitFor({ timeout: 5000 });
  await app.keyboard.press('Escape');
  await app.goto(`${DEPLOY}/nodes`);
  await app.locator('#node-table').waitFor();
  await app.locator('pinproof-overlay .tb').waitFor({ timeout: 5000 });
  await app.waitForTimeout(500);
  await tool('네트워크').click();
  await panel.locator('.draft .ev').nth(1).waitFor({ timeout: 5000 }).catch(() => {});
  check((await panel.locator('.draft .ev.network').count()) === 1, '배포 주소에서도 네트워크 기록(MAIN world 스크립트) 동작');
  const deployId = (await panel.locator('.draft-head .mono').textContent()).replace('#', '');
  await panel.waitForTimeout(1200);
  const deployMdName = (await readOpfs('.pinproof/')).split(',').find((n) => n.startsWith(`${deployId}-`));
  const deployMd = deployMdName ? await readOpfs(`.pinproof/${deployMdName}`) : '';
  check(deployMd.includes(`app: ${DEPLOY}`) && deployMd.includes('env: deployed'), `배포 주소에서 담은 기록에 env: deployed (${deployMdName})`);
  await panel.getByRole('button', { name: '작성 종료' }).click();
  await panel.waitForTimeout(600);
  check(await panel.locator('.records .rec-title', { hasText: '배포 환경 확인' }).first().isVisible(), '배포 주소 탭의 목록에는 그 주소에서 만든 기록이 보임');

  // 기록 목록은 지금 주소 기준: localhost 탭에서는 배포 주소 기록을 접어 두고, 펼치면 주소와 함께(열기는 막힘)
  await app.goto(`${BASE}/dashboard`);
  await panel.waitForTimeout(800);
  const deployRow = panel.locator('.records > .rec', { hasText: '배포 환경 확인' });
  check((await deployRow.count()) === 0, 'localhost 탭의 기본 목록에는 배포 주소 기록이 없음');
  check(await panel.locator('.records .rec-title', { hasText: '옛 기록' }).isVisible(), '주소가 없는 옛 기록은 그대로 보임');
  const othersToggle = panel.locator('.others-toggle');
  check((await othersToggle.textContent()) === '다른 주소 기록 1건 보기', `다른 주소 기록은 접어 둠: ${await othersToggle.textContent()}`);
  await othersToggle.click();
  const otherRow = panel.locator('.others .rec.other', { hasText: '배포 환경 확인' });
  check((await otherRow.count()) === 1 && (await otherRow.locator('.rec-meta').textContent()).includes('deploy.test:5199'), '펼치면 다른 주소 기록이 주소와 함께 보임');
  check(await otherRow.locator('.rec-main').isDisabled(), '다른 주소 기록은 다시 열기가 막힘(복사·보관·삭제만)');
  await panel.screenshot({ path: path.join(outDir, 'panel-others.png'), fullPage: true });
  await othersToggle.click();

  // ---------- 다크 모드: 기본은 시스템 설정, 패널 버튼으로 시스템 → 라이트 → 다크 ----------
  const panelBg = () => panel.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await panel.emulateMedia({ colorScheme: 'dark' });
  check((await panelBg()) === 'rgb(8, 20, 48)', `시스템이 다크면 설정 없이도 패널 다크: ${await panelBg()}`);
  await panel.emulateMedia({ colorScheme: 'light' });
  check((await panelBg()) === 'rgb(255, 255, 255)', '시스템이 라이트면 패널 라이트');
  await app.goto(`${BASE}/dashboard`);
  await app.locator('pinproof-overlay .tb').waitFor({ timeout: 5000 });
  const themeBtn = panel.locator('.theme-btn').first();
  await themeBtn.click(); // 시스템 → 라이트
  await themeBtn.click(); // 라이트 → 다크
  await app.waitForTimeout(300);
  check((await panel.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await panelBg()) === 'rgb(8, 20, 48)', '버튼으로 다크를 고르면 패널 다크(시스템이 라이트여도)');
  check((await app.locator('pinproof-overlay').getAttribute('data-theme')) === 'dark', '페이지 위 툴바·마커도 같은 테마');
  await app.waitForTimeout(500);
  await app.screenshot({ path: path.join(outDir, 'page-dark.png') });
  await app.locator('pinproof-overlay .pin').first().click();
  await pop.waitFor({ timeout: 3000 });
  await app.waitForTimeout(300);
  await app.screenshot({ path: path.join(outDir, 'page-dark-popover.png') });
  await app.keyboard.press('Escape');
  await panel.screenshot({ path: path.join(outDir, 'panel-dark.png'), fullPage: true });
  await themeBtn.click(); // 다크 → 시스템
  await app.waitForTimeout(300);
  check((await panel.evaluate(() => document.documentElement.dataset.theme)) === undefined && (await app.locator('pinproof-overlay').getAttribute('data-theme')) === null, '다시 누르면 시스템 설정으로 돌아감');

  // ---------- React 19 어댑터 (heureum) ----------
  if (heureumUrl) {
    await app.goto(heureumUrl);
    await app.waitForTimeout(2500);
    await panel.waitForTimeout(500);
    const info = await app.evaluate(async () => {
      // 가장 깊은 곳의 텍스트 요소 하나를 고른다
      const el = [...document.querySelectorAll('#root *')].find((e) => e.childElementCount === 0 && e.textContent.trim().length > 1);
      el.setAttribute('data-pinproof-target', 'probe');
      return await new Promise((resolve) => {
        const id = 'probe-req';
        window.addEventListener('message', function on(ev) {
          if (ev.data?.key === '__pinproof_bridge__' && ev.data.dir === 'res' && ev.data.id === id) {
            window.removeEventListener('message', on);
            resolve({ tag: el.tagName, text: el.textContent.trim().slice(0, 30), data: ev.data.data });
          }
        });
        window.postMessage({ key: '__pinproof_bridge__', dir: 'req', id, op: 'component', target: 'probe' }, location.origin);
      });
    });
    console.log('heureum 감지 결과:', JSON.stringify(info));
    check(info.data?.framework === 'React' && info.data.chain.length > 0, `React 컴포넌트 체인: ${info.data?.chain?.join(' › ')}`);
    check(!!info.data?.source, `소스 위치: ${info.data?.source}${info.data?.sourceApprox ? ' (근사)' : ''}`);
    // 실제 파일에서 그 줄이 해당 태그의 시작인지 확인 (heureum 저장소가 옆에 있을 때)
    const [file, line] = (info.data?.source ?? '').split(':');
    const local = path.resolve(here, '../../../heureum', file ?? '');
    if (file && fs.existsSync(local)) {
      const text = fs.readFileSync(local, 'utf8').split('\n')[Number(line) - 1] ?? '';
      check(text.includes(`<${info.tag.toLowerCase()}`), `그 줄이 실제로 <${info.tag.toLowerCase()} 시작: "${text.trim()}"`);
    }
    await app.screenshot({ path: path.join(outDir, 'heureum.png') });
  }

  // ---------- 패널을 닫으면 페이지의 툴바·마커가 사라진다 ----------
  await app.goto(`${BASE}/dashboard`);
  await app.locator('pinproof-overlay .tb').waitFor({ timeout: 5000 });
  await app.waitForTimeout(800); // 패널 상태가 도착해 마커가 그려질 때까지
  check((await pins()).length > 0, `닫기 전: 마커가 보임 (${(await pins()).join(',')})`);
  await panel.close();
  await app.waitForTimeout(600);
  check(await ov((h) => h.shadowRoot.querySelector('.tb').hidden), '패널을 닫으면 툴바 사라짐');
  check((await pins()).length === 0, '패널을 닫으면 마커 사라짐');
} finally {
  await ctx.close();
  server.close();
}

console.log(failures ? `\n${failures}개 실패` : '\n모두 통과');
process.exit(failures ? 1 : 0);
