/**
 * 익스텐션 E2E: Playwright Chromium에 빌드된 익스텐션을 로드하고
 * 1) 프레임워크 없는 fixture 페이지에서 요소·텍스트·영역·네트워크를 카테고리 항목으로 담기, 페이지 이동 후 계속 담기
 * 2) 항목 md 생성·처리 기록 보존·프롬프트 넘김 표시·완료 시 자동 보관·되돌리기
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
  await panel.locator('.cat.current').waitFor();
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

  // ---------- 카테고리 ----------
  // 프롬프트 복사는 클립보드 대신 여기로 받는다(자동화 창은 클립보드 권한이 없을 수 있어서)
  await panel.evaluate(() => {
    window.__clip = '';
    navigator.clipboard.writeText = async (t) => {
      window.__clip = t;
    };
  });
  // 확인 창은 기본으로 수락. dialogAnswer = false 로 한 번 취소해 볼 수 있다
  const dialogs = [];
  let dialogAnswer = true;
  panel.on('dialog', (d) => {
    dialogs.push(d.message());
    return dialogAnswer ? d.accept() : d.dismiss();
  });
  // 담을 곳: 직접 만든 드롭다운(줄마다 고르기 · 연필 · 휴지통, 맨 아래 새 카테고리)
  const catTrigger = panel.locator('.cat-trigger');
  const catMenu = panel.locator('.cat-menu');
  const curCat = () => catTrigger.getAttribute('data-value');
  const openCatMenu = async () => {
    if ((await catTrigger.getAttribute('aria-expanded')) !== 'true') await catTrigger.click();
    await catMenu.waitFor({ timeout: 3000 });
  };
  const pickCategory = async (name) => {
    await openCatMenu();
    await catMenu.locator('.cat-opt-pick', { has: panel.locator('.cat-opt-name', { hasText: new RegExp(`^${name}$`) }) }).click();
    await panel.waitForTimeout(200);
  };
  const current = panel.locator('.cat.current');
  const rows = () => current.locator('.ev');
  const addCategory = async (name) => {
    await openCatMenu();
    await catMenu.getByRole('button', { name: '새 카테고리' }).click();
    await panel.getByLabel('새 카테고리 이름').fill(name);
    await catMenu.getByRole('button', { name: '만들기', exact: true }).click();
    await panel.waitForTimeout(300);
  };
  check((await curCat()) === '미분류', '처음 담을 곳은 미분류');
  await openCatMenu();
  check(
    (await catMenu.locator('.cat-opt').count()) === 1 && !(await catMenu.locator('.cat-opt-icon').count()) && (await catMenu.locator('.cat-add').count()) === 1,
    '드롭다운: 미분류에는 연필·휴지통 없음, 맨 아래 새 카테고리',
  );
  await panel.keyboard.press('Escape');
  check(!(await catMenu.count()) && (await catTrigger.evaluate((el) => el === document.activeElement)), 'Esc 로 닫으면 드롭다운 버튼으로 포커스');
  await addCategory('데이터 정합성');
  check((await curCat()) === '데이터 정합성' && (await current.locator('.cat-name').textContent()) === '데이터 정합성' && !(await catMenu.count()), '새 카테고리를 만들면 그곳에 담기 시작(드롭다운은 닫힘)');
  check(await current.locator('.cat-copy').isDisabled(), '항목이 없는 카테고리는 프롬프트 복사 꺼짐');
  check(JSON.parse(await readOpfs('.pinproof/categories.json')).join(',') === '미분류,데이터 정합성', 'categories.json 에 카테고리 목록');
  await app.waitForTimeout(300);
  check(!(await app.locator('pinproof-overlay .tb .rec').count()), '툴바에는 카테고리 · 대기 개수 칩이 없음');

  // ---------- 요소 ----------
  await tool('요소').click();
  check(await ov((h) => h.shadowRoot.querySelector('.tb').classList.contains('mode')), '모드에 들어가면 툴바가 안내 띠로 변신');
  await app.hover('#help');
  await app.click('#help'); // 실제 마우스 클릭 → 그 자리에 팝오버
  await pop.waitFor({ timeout: 5000 });
  const pick1 = pop.locator('.p-to select');
  const opts1 = await pick1.locator('option').allTextContents();
  check(
    (await pop.locator('.p-to .lt').textContent()) === '1' && (await pick1.inputValue()) === '데이터 정합성' && opts1.join(',') === '미분류,데이터 정합성',
    `팝오버에 번호 + 카테고리 select(마지막에 쓴 카테고리가 골라져 있음): ${opts1.join(',')}`,
  );
  await confirm();
  await rows().first().waitFor({ timeout: 5000 }).catch(() => {});
  check((await rows().count()) === 1, '클릭 → 팝오버 Enter 로 지금 카테고리에 담김');
  await app.waitForTimeout(300);
  check((await pins()).join(',') === '1', `마커에 항목 번호: ${(await pins()).join(',')}`);

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
  check((await pop.locator('.p-to .lt').textContent()) === '2', '팝오버의 다음 번호는 2');
  check((await pop.locator('.p-name').textContent()).includes('<strong>'), '팝오버 머리에 요소 이름');
  await confirm('총합 숫자가 목록 합과 다름');
  const dropped = await app.locator('pinproof-overlay .pin.drop').waitFor({ timeout: 1000 }).then(() => true, () => false);
  check(dropped, '담으면 새 마커에 꽂힘 애니메이션');
  await rows().nth(1).waitFor();

  // 방금 담은 줄은 펼쳐져 요소 이름·selector 를 보여준다
  const fresh = panel.locator('.ev.fresh');
  check((await fresh.locator('.num').textContent()) === '2', '패널 줄에 번호 배지');
  check((await fresh.locator('.target-name').textContent()) === '<strong>', '패널에 방금 담은 요소 이름 표시');
  check((await fresh.locator('.target-sel').textContent()) === '[data-testid="summary-total"]', '패널에 selector 표시');
  check((await fresh.locator('.memo').textContent()) === '총합 숫자가 목록 합과 다름', '팝오버에서 쓴 메모가 한 줄 목록에');
  await app.waitForTimeout(400);
  await app.mouse.move(1, 1);
  await app.waitForTimeout(400);
  await app.screenshot({ path: path.join(outDir, 'page-markers.png') });
  check((await pins()).sort().join(',') === '1,2', `페이지에 번호 마커 1·2: ${(await pins()).join(',')}`);
  const tip = await ov((h) => [...h.shadowRoot.querySelectorAll('.pin .tip')].map((t) => t.textContent).find((t) => t.includes('총합')) ?? '');
  check(tip.includes('#002') && tip.includes('데이터 정합성'), `마커 툴팁에 번호·카테고리·메모: ${tip}`);
  // 같은 경로라도 ?tab= 처럼 쿼리로 화면이 바뀌면 마커를 숨기고, 원래 주소로 돌아오면 다시 보인다 (SPA 이동)
  await app.evaluate(() => history.pushState(null, '', '/dashboard?tab=other'));
  await app.waitForTimeout(300);
  check((await pins()).length === 0, `쿼리만 바뀐 화면(?tab=other)에서는 마커 숨김: ${(await pins()).join(',')}`);
  await app.evaluate(() => history.pushState(null, '', '/dashboard'));
  await app.waitForTimeout(300);
  check((await pins()).sort().join(',') === '1,2', '원래 주소로 돌아오면 마커 다시 보임');

  // ✕ 로 삭제 → 다시 담기
  await app.keyboard.press('Escape');
  check(!(await ov((h) => h.shadowRoot.querySelector('.tb').classList.contains('mode'))), 'Esc 로 모드 종료 → 툴바 원래대로');
  dialogs.length = 0;
  await fresh.locator('.ev-del').click();
  await panel.waitForTimeout(400);
  check(dialogs.length === 1 && dialogs[0].startsWith('항목 #002 를 삭제할까요?'), '✕ 로 대기 항목을 지울 때 한 번 확인');
  check((await rows().count()) === 1 && (await readOpfs('.pinproof/items/002.md')) === null, '✕ 로 항목 삭제(md 도 지움)');
  check((await pins()).join(',') === '1', '삭제하면 페이지 마커도 사라짐');
  await tool('요소').click();
  await app.mouse.move(1, 1);
  await app.click('[data-testid="summary-total"]'); // 이번엔 클릭으로
  await confirm();
  await rows().nth(1).waitFor({ timeout: 5000 }).catch(() => {});
  check((await rows().count()) === 2, '요소 모드에서 클릭으로 담기');
  check((await panel.locator('.ev.fresh .target-page').first().textContent()).includes('/dashboard'), '줄에 페이지 경로 표시');
  const summaryNum = await panel.locator('.ev.fresh .num').textContent();
  // 같은 요소를 다시 고르면 새로 담지 않고 그 마커의 편집 팝오버가 열린다
  // (요소가 마커보다 작아 마커가 덮을 수 있다 — 마커를 눌러도 같은 팝오버라 좌표로 누른다)
  await app.click('[data-testid="summary-total"]', { force: true });
  await pop.waitFor({ timeout: 3000 }).catch(() => {});
  check((await pop.getAttribute('aria-label').catch(() => '')) === `항목 #${summaryNum.padStart(3, '0')} 편집`, '같은 요소를 다시 고르면 그 항목의 편집 팝오버(중복 담기 방지)');
  check(!(await pop.locator('.btn-move').count()), '편집 팝오버에는 옮기기 없음(카테고리는 패널에서)');
  // 편집 팝오버에서 메모를 고치면 패널에 반영
  await pop.locator('textarea').fill('페이지에서 고친 메모');
  await pop.getByRole('button', { name: '저장' }).click();
  await panel.waitForTimeout(400);
  check((await rows().nth(1).locator('.memo').textContent()) === '페이지에서 고친 메모', '마커 편집 팝오버의 메모가 패널에 반영');
  check((await rows().count()) === 2, '같은 요소 중복 담기 방지');
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
  await rows().nth(2).waitFor();
  await app.keyboard.press('Escape'); // 담은 뒤에도 모드는 계속된다 → 끝내야 툴바 버튼이 다시 보인다

  // ---------- 영역 ----------
  await tool('영역').click();
  await app.mouse.move(20, 60);
  await app.mouse.down();
  await app.mouse.move(400, 200, { steps: 5 });
  await app.mouse.up();
  await confirm();
  await rows().nth(3).waitFor();

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
  const evBefore = await rows().count();
  await app.mouse.click(700, 300); // 바깥 클릭
  await app.waitForTimeout(300);
  check((await menu.isHidden()) && (await inMode()) && (await rows().count()) === evBefore, '바깥 클릭은 메뉴만 닫음(모드·항목 그대로)');
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
  await rows().nth(4).waitFor();
  await app.keyboard.press('Escape');
  await tool('네트워크').click();
  await rows().nth(5).waitFor();
  await app.waitForTimeout(300);
  check((await pins()).join(',') === '5', `다른 페이지(/nodes)에서는 그 페이지의 마커만: ${(await pins()).join(',')}`);
  check((await rows().nth(5).locator('.num.outline').count()) === 1, '페이지 마커가 없는 항목(네트워크)은 테두리 번호');
  // 패널 목록에서 5번 줄을 펼치면 페이지의 5번 마커가 반짝인다 (방금 담아 이미 펼쳐져 있으면 접었다가 다시)
  const dHead = rows().nth(4).locator('.ev-head');
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
  await rows().nth(6).waitFor();
  await panel.evaluate(() => {
    const t = new DataTransfer();
    t.setData('text/plain', 'Slack에서 받은 오류 로그\nError: 403 forbidden');
    document.querySelector('.paste-zone').dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true }));
  });
  await rows().nth(7).waitFor();
  check((await panel.locator('.ev.paste').count()) === 2, '붙여넣기 이미지·텍스트가 항목으로 추가');
  await panel.waitForTimeout(1200);

  // ---------- 파일 확인 ----------
  // 1 #help · 2 지운 뒤 다시 담은 총합(번호 재사용) · 3 텍스트 · 4 영역 · 5 테이블 · 6 네트워크 · 7 이미지 · 8 텍스트 붙여넣기
  check((await readOpfs('.pinproof/items/')) === '001.md,002.md,003.md,004.md,005.md,006.md,007.md,008.md,assets', `항목 하나 = md 하나: ${await readOpfs('.pinproof/items/')}`);
  const item = async (n) => (await readOpfs(`.pinproof/items/${String(n).padStart(3, '0')}.md`)) ?? '';
  const md2 = await item(2);
  fs.writeFileSync(path.join(outDir, '002.md'), md2);
  check(md2.includes('category: "데이터 정합성"') && md2.includes('status: 대기') && md2.includes('note: "페이지에서 고친 메모"'), '항목 frontmatter: 카테고리·상태·메모');
  check(md2.includes('# #002 · 데이터 정합성') && md2.includes('## 요소 — /dashboard') && md2.includes('selector: `[data-testid="summary-total"]`') && md2.includes('](assets/002.png)'), '항목 본문: 요소·selector·스크린샷');
  check(!/^type:/m.test(md2), '항목에는 유형이 없음');
  check((await item(3)).includes('## 텍스트 — /dashboard') && (await item(3)).includes('선택한 텍스트: "미설치 VM 목록 조회에 실패했습니다"'), '3: 텍스트 exact');
  check((await item(4)).includes('## 영역 — /dashboard') && /영역 안에 보이던 글자: .*"총 CPU 합계"/.test(await item(4)), '4: 영역 + 안에 보이던 글자');
  check((await item(5)).includes('## 컨테이너 — /nodes') && (await item(5)).includes('헤더: 이름 | CPU') && (await item(5)).includes('화면에 보이는 행: 3'), '5: 다른 페이지의 테이블 컨테이너');
  check((await item(6)).includes('## 네트워크 — /nodes') && (await item(6)).includes('node-a') && (await item(6)).includes('→ 403'), '6: 네트워크(200 응답 본문 + 403)');
  check((await item(7)).includes('## 붙여넣기 — /nodes') && (await item(7)).includes('](assets/007.png)'), '7: 붙여넣은 이미지');
  check((await item(8)).includes('Error: 403 forbidden'), '8: 붙여넣은 텍스트');
  check(!/selector: `[^`]*x1a2b3c/.test(md2), 'selector에 해시 클래스 없음');
  const assets = await readOpfs('.pinproof/items/assets/');
  check(assets === '001.png,002.png,003.png,004.png,005.png,007.png', `스크린샷 파일: ${assets}`);
  const png = await panel.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const d = await (await (await root.getDirectoryHandle('.pinproof')).getDirectoryHandle('items')).getDirectoryHandle('assets');
    const f = await (await d.getFileHandle('002.png')).getFile();
    const bmp = await createImageBitmap(f);
    return { size: f.size, w: bmp.width, h: bmp.height, b64: btoa(String.fromCharCode(...new Uint8Array(await f.arrayBuffer()))) };
  });
  fs.writeFileSync(path.join(outDir, '002.png'), Buffer.from(png.b64, 'base64'));
  check(png.size > 500 && png.w > 20 && png.h > 20, `스크린샷 002 ${png.w}×${png.h}`);

  // ---------- 처리 기록 보존 ----------
  /** 에이전트처럼 항목 파일을 고친다: done 이면 status 를 완료로, append 는 파일 끝에 덧붙임 */
  const agentEdit = (p, { done = false, append = '', sent = '', category = '' }) =>
    panel.evaluate(
      async ({ p, done, append, sent, category }) => {
        let dir = await navigator.storage.getDirectory();
        const parts = p.split('/');
        const file = parts.pop();
        for (const part of parts) dir = await dir.getDirectoryHandle(part);
        const fh = await dir.getFileHandle(file);
        let text = await (await fh.getFile()).text();
        if (done) text = text.replace('status: 대기', 'status: 완료');
        if (sent) text = text.replace(/^sent: .*$/m, `sent: ${sent}`);
        if (category) text = text.replace(/^category: .*$/m, `category: "${category}"`);
        const w = await fh.createWritable();
        await w.write(text + append);
        await w.close();
      },
      { p, done, append, sent, category },
    );
  await agentEdit('.pinproof/items/002.md', { append: '\n## 처리 기록\n- 원인: 테스트로 덧붙인 처리 기록\n' });
  const row2 = rows().nth(1);
  if ((await row2.locator('.ev-head').getAttribute('aria-expanded')) !== 'true') await row2.locator('.ev-head').click();
  await row2.locator('.ev-note').fill('메모 수정됨');
  await panel.waitForTimeout(1200);
  check((await item(2)).includes('note: "메모 수정됨"') && (await item(2)).includes('- 원인: 테스트로 덧붙인 처리 기록'), '익스텐션이 다시 써도 처리 기록 보존');

  // 항목 줄은 목록 전체에서 하나만 펼친다
  check((await panel.locator('.cat .ev.open').count()) === 1, '항목 줄은 하나만 펼쳐짐');
  await rows().first().locator('.ev-head').click();
  await panel.waitForTimeout(200);
  const openNums = await panel.locator('.cat .ev.open .num').allTextContents();
  check(openNums.join(',') === '1', `다른 줄을 열면 열려 있던 줄은 닫힘: ${openNums.join(',')}`);
  await panel.setViewportSize({ width: 400, height: 1400 });
  await panel.screenshot({ path: path.join(outDir, 'panel-items.png'), fullPage: true });
  const saveFails = (await panel.evaluate(() => window.__notices)).filter((t) => t.includes('저장 실패'));
  check(saveFails.length === 0, `연달아 담아도 "파일 저장 실패" 경고 없음${saveFails.length ? `: ${saveFails[0]}` : ''}`);

  // ---------- 프롬프트: 카테고리째는 아직 넘기지 않은 항목만, 넘긴 항목엔 넘김 표시 ----------
  const catCopy = current.locator('.cat-copy');
  check((await catCopy.textContent()) === '프롬프트 복사 (새 8)', `카테고리 복사 버튼에 새 항목 수: ${await catCopy.textContent()}`);
  await catCopy.click();
  await panel.waitForTimeout(600);
  let clip = await panel.evaluate(() => window.__clip);
  check(clip.includes('"데이터 정합성" 카테고리의 아래 항목 8건') && clip.includes('`.pinproof/items/001.md`') && clip.includes('`.pinproof/items/008.md`'), '카테고리째 프롬프트: 대기 항목 파일을 하나하나 적음');
  check(/^sent: \d{4}-/m.test(await item(1)) && (await current.locator('.tag.sent').count()) === 8, '넘긴 항목엔 sent 시각과 "넘김" 표시');
  check((await catCopy.textContent()) === '프롬프트 다시 복사', '모두 넘기면 "프롬프트 다시 복사"');
  await tool('요소').click();
  await app.click('h1');
  await confirm('새로 담은 것');
  await app.keyboard.press('Escape');
  await rows().nth(8).waitFor();
  check((await catCopy.textContent()) === '프롬프트 복사 (새 1)', '그 뒤에 담은 항목만 새로 셈');
  await catCopy.click();
  await panel.waitForTimeout(600);
  clip = await panel.evaluate(() => window.__clip);
  check(clip.includes('아래 항목 1건') && clip.includes('items/009.md') && !clip.includes('items/001.md'), `이미 넘긴 항목은 빼고 새 항목만: ${clip.split('\n').filter((l) => l.startsWith('- ')).join(' ')}`);
  // 항목 하나만
  if ((await rows().first().locator('.ev-head').getAttribute('aria-expanded')) !== 'true') await rows().first().locator('.ev-head').click();
  await rows().first().locator('.ev-body').getByRole('button', { name: '프롬프트 복사' }).click();
  await panel.waitForTimeout(300);
  clip = await panel.evaluate(() => window.__clip);
  check(clip.includes('items/001.md') && !clip.includes('items/009.md'), '항목 하나만 프롬프트 복사');

  // ---------- 완료 → 자동 보관 → 되돌리기 ----------
  await agentEdit('.pinproof/items/003.md', { done: true, append: '\n## 처리 기록\n- 원인: 에이전트가 처리\n' });
  await panel.waitForTimeout(5800); // 목록 주기 갱신(5초)으로 완료 감지
  check((await readOpfs('.pinproof/items/003.md')) === null && (await readOpfs('.pinproof/items/archive/003.md'))?.includes('status: 완료'), '에이전트가 status: 완료로 바꾸면 items/archive/ 로 자동 보관');
  check((await readOpfs('.pinproof/items/archive/assets/')) === '003.png', '자동 보관: 스크린샷도 이동');
  check((await panel.evaluate(() => window.__notices)).some((t) => t.includes('보관함')), '자동 보관을 알림으로 알려줌');
  check((await rows().count()) === 8, '보관한 항목은 카테고리 목록에서 빠짐');
  const archive = panel.locator('.section.archive');
  await archive.locator('.section-head').click();
  await archive.locator('.ev').first().locator('.ev-head').click();
  await panel.screenshot({ path: path.join(outDir, 'panel-archive.png'), fullPage: true });
  check((await archive.locator('.ev .tag').first().textContent()) === '데이터 정합성', '보관함 줄에 카테고리 표시');
  await archive.getByRole('button', { name: '되돌리기' }).click();
  await panel.waitForTimeout(500);
  check((await item(3)).includes('status: 대기') && (await item(3)).includes('- 원인: 에이전트가 처리') && (await readOpfs('.pinproof/items/archive/003.md')) === null, '되돌리기: 대기로 바꿔 items/ 로(처리 기록은 남김)');
  await panel.waitForTimeout(5800);
  check((await readOpfs('.pinproof/items/003.md')) !== null, '되돌린 항목은 다시 자동 보관되지 않음');
  // 보관함에서 삭제
  await agentEdit('.pinproof/items/009.md', { done: true });
  await panel.waitForTimeout(5800);
  if ((await archive.locator('.section-head').getAttribute('aria-expanded')) !== 'true') await archive.locator('.section-head').click();
  await archive.locator('.ev').first().locator('.ev-head').click();
  await archive.getByRole('button', { name: '삭제', exact: true }).click();
  await panel.waitForTimeout(500);
  check((await readOpfs('.pinproof/items/archive/009.md')) === null && !(await panel.locator('.section.archive').count()), '보관함에서 삭제: md 지움, 비면 보관함 구역도 사라짐');
  // 보관함 필터 · 날짜 묶음: #007 은 넘김일을 40일 전으로(최근 30일 밖), 카테고리도 바꿔 두 날짜 · 두 카테고리로 나뉘게
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const old = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 40, 10, 0);
  const oldYear = old.getFullYear() === now.getFullYear() ? '' : `${old.getFullYear()}`;
  await agentEdit('.pinproof/items/007.md', { done: true, sent: `${old.getFullYear()}-${p2(old.getMonth() + 1)}-${p2(old.getDate())}T10:00`, category: '다른 묶음' });
  await agentEdit('.pinproof/items/008.md', { done: true });
  await panel.waitForTimeout(5800);
  if ((await archive.locator('.section-head').getAttribute('aria-expanded')) !== 'true') await archive.locator('.section-head').click();
  const todayLabel = `${now.getMonth() + 1}월 ${now.getDate()}일`;
  const oldLabel = `${oldYear && `${oldYear}년 `}${old.getMonth() + 1}월 ${old.getDate()}일`;
  const dayHeads = () => archive.locator('.day-head').allTextContents();
  check((await dayHeads()).join('|') === `${todayLabel}1|${oldLabel}1`, `넘김일로 묶음(최근 날짜부터): ${(await dayHeads()).join('|')}`);
  await archive.locator('.ev', { hasText: '이미지' }).locator('.ev-head').click();
  const dates = (await archive.locator('.ev.open .ev-dates').textContent()).trim();
  check(dates.startsWith('발견 ') && dates.endsWith(` · 넘김 ${oldYear && `${oldYear}/`}${p2(old.getMonth() + 1)}/${p2(old.getDate())} 10:00`), `펼친 줄에 발견일 · 넘김일 따로: ${dates}`);
  await archive.getByLabel('기준 날짜').selectOption('created');
  check((await dayHeads()).join('|') === `${todayLabel}2`, '발견일 기준이면 같은 날 하나로 묶음');
  await archive.getByLabel('기준 날짜').selectOption('sent');
  await archive.getByLabel('카테고리').selectOption('데이터 정합성');
  await archive.getByLabel('기간').selectOption('7d');
  check((await archive.locator('.ev').count()) === 1 && (await dayHeads()).join('|') === `${todayLabel}1`, '카테고리 × 넘김일 최근 7일 교집합만 남음');
  await panel.screenshot({ path: path.join(outDir, 'panel-archive-filter.png'), fullPage: true });
  await archive.getByLabel('카테고리').selectOption('');
  await archive.getByLabel('기간').selectOption('all');
  check((await archive.locator('.filter-select.on').count()) === 0, '필터를 기본값으로 되돌리면 걸림 표시도 없어짐');
  // 화면 확인용: 포커스·마우스를 치우고 라이트 · 다크 한 장씩
  await panel.evaluate(() => document.activeElement?.blur());
  await panel.mouse.move(0, 0);
  await panel.screenshot({ path: path.join(outDir, 'panel-archive-clear.png'), fullPage: true });
  await panel.emulateMedia({ colorScheme: 'dark' });
  await panel.waitForTimeout(400); // 색 전환(transition)이 끝난 뒤
  await panel.screenshot({ path: path.join(outDir, 'panel-archive-dark.png'), fullPage: true });
  await panel.emulateMedia({ colorScheme: 'light' });
  // 오른쪽 아래 [정리]: 기간은 고를 수도 있음(비우면 전체) — 끝에는 넘김일 40일 전(#007) 하루만 지움
  const cleanBtn = panel.locator('.cleanup-btn');
  const cleanPop = panel.locator('.cleanup-pop');
  const oldDay = `${old.getFullYear()}-${p2(old.getMonth() + 1)}-${p2(old.getDate())}`;
  const todayDay = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
  const note = () => cleanPop.locator('.cleanup-note').textContent();
  await cleanBtn.click();
  check((await note()) === '기간을 고르지 않아 전체 2건' && !(await cleanPop.getByRole('button', { name: '2건 삭제' }).isDisabled()), '정리: 기간을 비우면 전체가 대상');
  await cleanPop.getByLabel('시작일').fill(todayDay);
  check((await note()) === '이 기간에 1건', '정리: 시작일만 고르면 그날부터');
  await cleanPop.getByLabel('종료일').fill(oldDay);
  check(
    (await cleanPop.locator('.cleanup-warn').textContent()) === '종료일이 시작일보다 앞섭니다. 기간을 다시 고르세요' &&
      (await cleanPop.getByRole('button', { name: '삭제', exact: true }).isDisabled()),
    '정리: 종료일이 시작일보다 앞서면 경고하고 삭제 버튼을 끔',
  );
  await cleanPop.screenshot({ path: path.join(outDir, 'panel-cleanup-warn.png') });
  await cleanPop.getByLabel('시작일').fill('');
  check((await note()) === '이 기간에 1건', '정리: 종료일만 고르면 그날까지');
  await cleanPop.getByLabel('시작일').fill(oldDay);
  await cleanPop.getByLabel('종료일').fill(oldDay);
  check((await cleanPop.locator('.cleanup-note').textContent()) === '이 기간에 1건', '정리: 고른 기간에 드는 개수를 바로 보여 줌');
  const chips = cleanPop.locator('.chip');
  check((await chips.allTextContents()).join('|') === '데이터 정합성|다른 묶음' && (await chips.evaluateAll((els) => els.every((e) => e.getAttribute('aria-pressed') === 'true'))), '정리: 보관함 카테고리 칩, 처음엔 모두 켜짐');
  await cleanPop.getByRole('button', { name: '다른 묶음' }).click();
  check((await cleanPop.locator('.cleanup-note').textContent()) === '이 기간에 0건', '정리: 끈 카테고리 항목은 빠짐(교집합)');
  await cleanPop.getByRole('button', { name: '데이터 정합성' }).click();
  check((await cleanPop.locator('.cleanup-note').textContent()) === '카테고리를 하나 이상 고르세요', '정리: 카테고리를 모두 끄면 지울 수 없다고 알림');
  await cleanPop.getByRole('button', { name: '다른 묶음' }).click();
  check((await cleanPop.locator('.cleanup-note').textContent()) === '이 기간에 1건', '정리: 다시 켜면 그 카테고리 항목이 들어옴');
  await panel.waitForTimeout(300);
  await panel.screenshot({ path: path.join(outDir, 'panel-cleanup.png'), fullPage: true });
  await panel.emulateMedia({ colorScheme: 'dark' });
  await panel.waitForTimeout(400);
  await panel.screenshot({ path: path.join(outDir, 'panel-cleanup-dark.png'), fullPage: true });
  await panel.emulateMedia({ colorScheme: 'light' });
  dialogs.length = 0;
  dialogAnswer = false;
  await cleanPop.getByRole('button', { name: '1건 삭제' }).click();
  await panel.waitForTimeout(300);
  dialogAnswer = true;
  check(
    dialogs.length === 1 && dialogs[0].startsWith(`넘김일 기준 ${oldLabel} ~ ${oldLabel} 보관함 항목 1개(다른 묶음)를 삭제할까요?`) && (await cleanPop.count()) === 1 && (await readOpfs('.pinproof/items/archive/007.md')) !== null,
    '정리: 기간 · 개수 · 고른 카테고리로 한 번 묻고, 취소하면 창도 항목도 그대로',
  );
  await cleanPop.getByRole('button', { name: '1건 삭제' }).click();
  await panel.waitForTimeout(600);
  check(
    (await readOpfs('.pinproof/items/archive/007.md')) === null && (await readOpfs('.pinproof/items/archive/008.md')) !== null && !(await cleanPop.count()),
    '정리: 기간 안의 항목만 지우고 창을 닫음',
  );
  const btnBox = await cleanBtn.boundingBox();
  const noticeBox = await panel.locator('.notice').boundingBox();
  check(!!btnBox && !!noticeBox && btnBox.y + btnBox.height <= noticeBox.y, '알림 띠가 뜨면 [정리] 버튼이 그 위로 비켜남');
  // 보관함 비우기: 한 번 묻고, 취소하면 그대로 · 확인하면 보관함 항목 전부
  dialogs.length = 0;
  dialogAnswer = false;
  await archive.getByRole('button', { name: '보관함 비우기' }).click();
  await panel.waitForTimeout(300);
  dialogAnswer = true;
  check(
    dialogs.length === 1 && dialogs[0].startsWith('보관함 항목 1개를 모두 삭제할까요?') && (await readOpfs('.pinproof/items/archive/008.md')) !== null,
    '보관함 비우기: 개수를 넣어 한 번 묻고, 취소하면 그대로',
  );
  await archive.getByRole('button', { name: '보관함 비우기' }).click();
  await panel.waitForTimeout(600);
  check(
    (await readOpfs('.pinproof/items/archive/007.md')) === null && (await readOpfs('.pinproof/items/archive/008.md')) === null && !(await panel.locator('.section.archive').count()),
    '보관함 비우기: 확인하면 md 전부 지우고 보관함 구역도 사라짐',
  );

  // ---------- 카테고리 옮기기 · 여기에 담기 · 이름 바꾸기 · 삭제 ----------
  await addCategory('버그');
  check((await current.locator('.cat-name').textContent()) === '버그' && (await current.locator('.ev').count()) === 0, '새 카테고리 "버그"가 담는 곳(비어 있음)');
  const dataCat = panel.locator('.cat', { has: panel.locator('.cat-name', { hasText: '데이터 정합성' }) });
  const first = dataCat.locator('.ev').first();
  if ((await first.locator('.ev-head').getAttribute('aria-expanded')) !== 'true') await first.locator('.ev-head').click();
  check((await first.locator('.move-to').inputValue()) === '미분류', '옮길 카테고리 기본값은 첫 다른 카테고리');
  await first.locator('.move-to').selectOption('버그');
  await first.screenshot({ path: path.join(outDir, 'panel-move-to.png') });
  await first.locator('.move-go').click();
  await panel.waitForTimeout(600);
  check((await item(1)).includes('category: "버그"') && (await current.locator('.ev .num').allTextContents()).join(',') === '1', '카테고리 옮기기: frontmatter 한 줄 + 목록 이동');
  await dataCat.getByRole('button', { name: '여기에 담기' }).click();
  await panel.waitForTimeout(300);
  check((await curCat()) === '데이터 정합성', '"여기에 담기"로 담는 곳 바꾸기');
  await pickCategory('버그');
  check((await curCat()) === '버그' && !(await catMenu.count()), '드롭다운에서 고르면 담는 곳이 바뀌고 닫힘');
  await openCatMenu();
  await panel.waitForTimeout(400); // 등장 애니메이션이 끝난 뒤
  await panel.screenshot({ path: path.join(outDir, 'panel-cat-menu.png') });
  await catMenu.getByRole('button', { name: '"버그" 이름 바꾸기' }).click();
  await panel.getByLabel('바꿀 이름').fill('UI 버그');
  await catMenu.getByRole('button', { name: '바꾸기', exact: true }).click();
  await panel.waitForTimeout(600);
  check((await item(1)).includes('category: "UI 버그"') && JSON.parse(await readOpfs('.pinproof/categories.json')).includes('UI 버그'), '이름 바꾸기: 목록과 그 카테고리 항목 모두');
  await openCatMenu();
  dialogs.length = 0;
  dialogAnswer = false;
  await catMenu.getByRole('button', { name: '"UI 버그" 삭제' }).click();
  await panel.waitForTimeout(300);
  dialogAnswer = true;
  check(
    dialogs.length === 1 && dialogs[0].startsWith('"UI 버그" 카테고리와 대기 항목 1개를 삭제할까요?') && JSON.parse(await readOpfs('.pinproof/categories.json')).includes('UI 버그') && (await item(1)) !== '',
    '대기 항목이 있는 카테고리는 한 번 묻고, 취소하면 그대로',
  );
  await addCategory('빈 카테고리');
  await openCatMenu();
  dialogs.length = 0;
  await catMenu.getByRole('button', { name: '"빈 카테고리" 삭제' }).click();
  await panel.waitForTimeout(300);
  check(dialogs.length === 1 && dialogs[0].startsWith('"빈 카테고리" 카테고리를 삭제할까요?'), '빈 카테고리도 한 번 묻고 지움');
  check(!JSON.parse(await readOpfs('.pinproof/categories.json')).includes('빈 카테고리') && (await curCat()) === '미분류', '빈 카테고리 삭제 → 담는 곳은 미분류로');
  await addCategory('지울 카테고리');
  await panel.evaluate(() => {
    const t = new DataTransfer();
    t.setData('text/plain', '지울 카테고리에 붙여넣은 메모');
    document.querySelector('.paste-zone').dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true }));
  });
  await rows().first().waitFor();
  const doomed = Number(await rows().first().locator('.num').textContent());
  check((await item(doomed)).includes('category: "지울 카테고리"'), '지울 카테고리에 대기 항목 하나');
  await openCatMenu();
  dialogs.length = 0;
  await catMenu.getByRole('button', { name: '"지울 카테고리" 삭제' }).click();
  await panel.waitForTimeout(500);
  check(
    dialogs.length === 1 && !JSON.parse(await readOpfs('.pinproof/categories.json')).includes('지울 카테고리') && (await item(doomed)) === '' && (await curCat()) === '미분류',
    '확인하면 카테고리와 그 대기 항목(md)까지 삭제',
  );
  await pickCategory('데이터 정합성');
  await panel.screenshot({ path: path.join(outDir, 'panel.png'), fullPage: true });

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
  await panel.locator('.section.records .section-head').click();
  check(await panel.locator('.rec-title', { hasText: '옛 기록' }).isVisible(), '옮긴 기록이 "이전 기록"(읽기 전용)에 표시');
  check(!(await panel.locator('.section.records .rec-main').evaluate((e) => e.tagName === 'BUTTON')), '이전 기록은 다시 열 수 없음(복사·보관·삭제만)');
  const recs = panel.locator('.section.records');
  check((await recs.locator('.day-head').allTextContents()).join('|') === '날짜 없음1', '만든 날짜가 없는 옛 기록은 "날짜 없음" 묶음');
  await recs.getByLabel('기간(만든 날짜)').selectOption('today');
  check(
    (await recs.locator('.filter-empty').textContent()).startsWith('만든 날짜 오늘에 맞는 항목이 없습니다') && !(await recs.locator('.rec').count()),
    '이전 기록 기간 필터: 맞는 것이 없으면 걸린 조건을 알려 줌',
  );
  await recs.getByRole('button', { name: '조건 지우기' }).click();
  check((await recs.locator('.rec').count()) === 1, '조건 지우기로 다시 전부');
  await panel.locator('.section.records .section-head').click();

  // ---------- 배포 주소(localhost 아님): 사이트별로 켠 곳에서도 동작하고 로컬 폴더에 연결 ----------
  // (E2E 빌드는 <all_urls> 권한이 있어 켜기 버튼의 권한 확인 창 없이 "켜진 사이트"로 취급된다)
  const DEPLOY = 'http://deploy.test:5199';
  await app.goto(`${DEPLOY}/dashboard`);
  await panel.waitForTimeout(800);
  check(await panel.getByRole('button', { name: '프로젝트 폴더 연결' }).isVisible(), '배포 주소는 따로 폴더를 연결한다(같은 로컬 폴더에 연결 가능)');
  check(await panel.locator('.site-on').isVisible(), '켠 사이트에는 "직접 켠 사이트입니다 · 끄기" 표시');
  await panel.getByRole('button', { name: '프로젝트 폴더 연결' }).click();
  await panel.locator('.cat.current').waitFor();
  await app.locator('pinproof-overlay .tb').waitFor({ timeout: 5000 });
  check(await app.locator('pinproof-overlay .tb').isVisible(), '배포 주소에도 사이트별 등록으로 툴바가 뜸');
  check((await rows().count()) === 0, '배포 주소 탭에는 localhost 에서 담은 항목이 목록에 없음');
  await tool('요소').click();
  await app.click('[data-testid="summary-total"]');
  await confirm('배포에서 본 값');
  await rows().first().waitFor({ timeout: 5000 });
  await app.keyboard.press('Escape');
  await app.goto(`${DEPLOY}/nodes`);
  await app.locator('#node-table').waitFor();
  await app.locator('pinproof-overlay .tb').waitFor({ timeout: 5000 });
  await app.waitForTimeout(500);
  await tool('네트워크').click();
  await rows().nth(1).waitFor({ timeout: 5000 }).catch(() => {});
  check((await current.locator('.ev.network').count()) === 1, '배포 주소에서도 네트워크 기록(MAIN world 스크립트) 동작');
  const deployNum = Number(await rows().first().locator('.num').textContent());
  check(deployNum > 77, `옛 기록(#077)이 있으면 다음 번호는 그 뒤부터: #${deployNum}`);
  await panel.waitForTimeout(1200);
  const deployMd = await item(deployNum);
  check(deployMd.includes(`app: ${DEPLOY}`) && deployMd.includes('env: deployed'), `배포 주소에서 담은 항목에 env: deployed (#${deployNum})`);

  // 목록은 지금 주소 기준: localhost 탭에서는 배포 주소 항목을 "다른 주소 항목"으로 접어 두고, 펼쳐도 읽기 전용
  await app.goto(`${BASE}/dashboard`);
  await panel.waitForTimeout(800);
  check((await panel.locator('.cat .ev', { hasText: '배포에서 본 값' }).count()) === 0, 'localhost 탭의 카테고리 목록에는 배포 주소 항목이 없음');
  const others = panel.locator('.section.others-items');
  check((await others.locator('.section-head').textContent()).includes('다른 주소 항목') && (await others.locator('.section-head .count').textContent()) === '2', '다른 주소 항목은 접어 두고 개수만');
  await others.locator('.section-head').click();
  check((await others.locator('.ev.network .num.outline').count()) === 1, '편집용 원본이 없는 항목도 파일의 종류(kind: 네트워크)로 테두리 번호');
  const otherRow = others.locator('.ev', { hasText: '배포에서 본 값' });
  await otherRow.locator('.ev-head').click();
  check((await otherRow.locator('.ev-body').textContent()).includes('deploy.test:5199') && !(await otherRow.locator('.ev-note').count()) && !(await otherRow.locator('.ev-del').count()), '펼치면 만든 주소 안내, 메모 칸·삭제 없음(읽기 전용)');
  await panel.screenshot({ path: path.join(outDir, 'panel-others.png'), fullPage: true });
  await others.locator('.section-head').click();

  // 이전 기록 모두 삭제(번호 검사가 옛 기록 #077 을 쓰므로 그 뒤에서). 구역을 펼치지 않아도 머리 오른쪽 끝에 버튼이 있다
  const records = panel.locator('.section.records');
  check((await records.locator('.section-head').getAttribute('aria-expanded')) === 'false' && (await records.getByRole('button', { name: '이전 기록 모두 삭제' }).isVisible()), '접힌 구역 머리에도 전체 삭제 버튼');
  await panel.screenshot({ path: path.join(outDir, 'panel-records-clear.png'), fullPage: true });
  // [정리]에서 이전 기록: 보관함이 비어 있으면 이전 기록만, 만든 날짜 기준. 만든 날짜가 없는 기록은 기간에 들지 않음을 알림. Esc 로 닫기
  await panel.locator('.cleanup-btn').click();
  const recPop = panel.locator('.cleanup-pop');
  check((await recPop.locator('.cleanup-note').textContent()) === '기간을 고르지 않아 전체 1건', '정리: 이전 기록도 기간을 비우면 날짜 없는 기록까지 전체');
  await recPop.getByLabel('시작일').fill('2000-01-01');
  await recPop.getByLabel('종료일').fill('2099-12-31');
  check(
    (await recPop.getByLabel('정리할 곳').inputValue()) === 'records' && (await recPop.locator('.cleanup-note').textContent()) === '이 기간에 0건 · 날짜 없는 1건은 기간에 들지 않습니다',
    '정리: 보관함이 비면 이전 기록, 날짜 없는 기록은 기간에 들지 않음을 알림',
  );
  await panel.keyboard.press('Escape');
  check(!(await recPop.count()) && (await panel.locator('.cleanup-btn').evaluate((el) => el === document.activeElement)), '정리: Esc 로 닫으면 [정리] 버튼으로 포커스');
  dialogs.length = 0;
  await records.getByRole('button', { name: '이전 기록 모두 삭제' }).click();
  await panel.waitForTimeout(600);
  check(
    dialogs.length === 1 && dialogs[0].startsWith('이전 기록 1개를 모두 삭제할까요?') && (await readOpfs('.pinproof/077-옛-기록.md')) === null && !(await records.count()),
    '이전 기록 모두 삭제: 한 번 묻고 md 지움, 비면 구역도 사라짐',
  );

  // ---------- 다크 모드: 기본은 시스템 설정, 패널 버튼으로 시스템 → 라이트 → 다크 ----------
  const panelBg = () => panel.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await panel.emulateMedia({ colorScheme: 'dark' });
  check((await panelBg()) === 'rgb(12, 12, 13)', `시스템이 다크면 설정 없이도 패널 다크: ${await panelBg()}`);
  await panel.emulateMedia({ colorScheme: 'light' });
  check((await panelBg()) === 'rgb(247, 247, 245)', '시스템이 라이트면 패널 라이트');
  await app.goto(`${BASE}/dashboard`);
  await app.locator('pinproof-overlay .tb').waitFor({ timeout: 5000 });
  const themeBtn = panel.locator('.theme-btn').first();
  await themeBtn.click(); // 시스템 → 라이트
  await themeBtn.click(); // 라이트 → 다크
  await app.waitForTimeout(300);
  check((await panel.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await panelBg()) === 'rgb(12, 12, 13)', '버튼으로 다크를 고르면 패널 다크(시스템이 라이트여도)');
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
