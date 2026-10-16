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
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
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

  // ---------- 연결 ----------
  await panel.getByRole('button', { name: '프로젝트 폴더 연결' }).click();
  await panel.getByText('작성 중인 기록이 없습니다').waitFor();
  check((await readOpfs('.pinproof/WORKFLOW.md'))?.includes('# PinProof 처리 절차'), 'WORKFLOW.md 생성');
  check((await readOpfs('.claude/commands/pinproof.md'))?.includes('$ARGUMENTS'), '/pinproof 커맨드 생성');
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

  // ---------- 미분류 ----------
  await panel.getByRole('button', { name: /^요소/ }).click();
  await app.hover('#help');
  await app.click('#help'); // 실제 마우스 클릭으로 담기
  await panel.locator('.section .ev').first().waitFor({ timeout: 5000 }).catch(() => {});
  check((await panel.locator('.section .ev').count()) === 1, '클릭으로 담기 + 작성 중인 건이 없을 때는 미분류로');
  check((await panel.locator('.section .ev .target-sel').first().textContent()) === '#help', '미분류 카드에 선택한 요소 표시');

  // ---------- 새 기록 + 요소 ----------
  await panel.getByRole('button', { name: '+ 새 기록' }).click();
  await panel.getByPlaceholder('예: 대시보드 총합 불일치').fill('대시보드 총합 불일치');
  await panel.getByPlaceholder(/현상: 무엇이/).fill('총합은 10인데 노드 목록 CPU를 더하면 100이 넘음');
  await panel.getByPlaceholder('예: #589').fill('#589');

  await app.hover('[data-testid="summary-total"]');
  // ↑ 로 부모 카드까지 올라갔다가 ↓ 로 되돌아오는 키보드 이동
  await app.keyboard.press('ArrowUp');
  await app.keyboard.press('ArrowDown');
  await app.keyboard.press('Enter');
  await panel.locator('.draft .ev').first().waitFor();
  const labelText = await app.locator('pinproof-overlay').evaluate((h) => h.shadowRoot.querySelector('.label').textContent);
  check(/<strong>/.test(labelText), `hover 라벨 표시: ${labelText}`);

  // 담은 결과는 사이드 패널에만: 방금 담은 카드에 요소 이름·selector 표시, 페이지에는 배지·토스트 없음
  const fresh = panel.locator('.ev.fresh');
  check((await fresh.locator('.target-name').textContent()) === '<strong>', '패널에 방금 담은 요소 이름 표시');
  check((await fresh.locator('.target-sel').textContent()) === '[data-testid="summary-total"]', '패널에 selector 표시');
  const pageUi = await app.locator('pinproof-overlay').evaluate((h) => ({
    markers: h.shadowRoot.querySelectorAll('.marker').length,
    toastVisible: !h.shadowRoot.querySelector('.toast').hidden,
  }));
  check(pageUi.markers === 0 && !pageUi.toastVisible, '페이지 위에는 배지·토스트 없음');

  // ✕ 로 삭제 → 다시 담기 (문자는 B부터 이어짐을 피하려고 바로 다시 A가 되는지는 보지 않음)
  await app.keyboard.press('Escape');
  await fresh.locator('.ev-del').click();
  await panel.waitForTimeout(300);
  check((await panel.locator('.draft .ev').count()) === 0, '✕ 로 증거 삭제');
  await panel.getByRole('button', { name: /^요소/ }).click();
  await app.mouse.move(1, 1);
  await app.click('[data-testid="summary-total"]'); // 이번엔 클릭으로
  await panel.locator('.draft .ev').first().waitFor({ timeout: 5000 }).catch(() => {});
  check((await panel.locator('.draft .ev').count()) === 1, '요소 모드에서 클릭으로 담기');
  check((await panel.locator('.draft .ev .target-page').first().textContent()).includes('/dashboard'), '카드에 페이지 경로 표시');
  // 같은 요소를 다시 클릭해도 같은 기록에 두 번 담기지 않는다
  await app.click('[data-testid="summary-total"]');
  await panel.waitForTimeout(1200);
  check((await panel.locator('.draft .ev').count()) === 1, '같은 요소 중복 담기 방지');
  check((await panel.locator('.notice').textContent().catch(() => '')).includes('이미 A'), '중복 시 "이미 A로 담은 요소" 안내');

  // ---------- 텍스트 ----------
  await panel.getByRole('button', { name: /^텍스트/ }).click();
  await app.evaluate(() => {
    const t = document.getElementById('help').firstChild;
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 20);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  const helpBox = await app.locator('#help').boundingBox();
  await app.mouse.move(helpBox.x + 5, helpBox.y + 5);
  await app.mouse.down();
  await app.mouse.up();
  await app.evaluate(() => {
    // 위 mouseup이 선택을 지웠을 수 있어 다시 만들고 mouseup 이벤트를 보낸다
    const t = document.getElementById('help').firstChild;
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 20);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await app.locator('pinproof-overlay .chip').click();
  await panel.locator('.draft .ev').nth(1).waitFor();

  // ---------- 영역 ----------
  await panel.getByRole('button', { name: /^영역/ }).click();
  await app.mouse.move(20, 60);
  await app.mouse.down();
  await app.mouse.move(400, 200, { steps: 5 });
  await app.mouse.up();
  await panel.locator('.draft .ev').nth(2).waitFor();
  await app.keyboard.press('Escape');

  // ---------- 페이지 이동 후 계속 수집 + 컨테이너 + 네트워크 ----------
  await app.goto(`${BASE}/nodes`);
  await app.locator('#node-table').waitFor();
  await panel.waitForTimeout(500);
  await panel.getByRole('button', { name: /^요소/ }).click();
  await app.hover('#node-table td');
  await app.keyboard.press('ArrowUp'); // tr
  await app.keyboard.press('ArrowUp'); // tbody
  await app.keyboard.press('ArrowUp'); // table
  await app.keyboard.press('Enter');
  await panel.locator('.draft .ev').nth(3).waitFor();
  await app.keyboard.press('Escape');
  await panel.getByRole('button', { name: /^네트워크/ }).click();
  await panel.locator('.draft .ev').nth(4).waitFor();

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
  await panel.getByRole('button', { name: /^요소/ }).click();
  await app.click('h1');
  await panel.locator('.draft .ev').nth(0).waitFor();
  await app.click('#node-table');
  await panel.locator('.draft .ev').nth(1).waitFor();
  await app.keyboard.press('Escape');
  await panel.locator('.draft .ev').first().locator('.ev-del').click();
  await panel.waitForTimeout(400);
  const letters = await panel.locator('.draft .ev .letter').allTextContents();
  check(letters.join(',') === 'A' && (await panel.locator('.draft .ev .target-sel').first().textContent()).startsWith('#node-table'), `증거 삭제 후 문자 다시 매기기: ${letters.join(',')}`);
  await panel.waitForTimeout(1000);
  const before = await readOpfs('.pinproof/');
  await panel.getByRole('button', { name: '기록 삭제' }).click();
  await panel.waitForTimeout(500);
  const after = await readOpfs('.pinproof/');
  check(/지울-기록\.md/.test(before) && !/지울-기록\.md/.test(after), '작성 중인 기록 삭제');
  check(await panel.getByRole('button', { name: '+ 새 기록' }).isVisible(), '삭제 후 작성 중 상태 해제');

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
  };
  check(migrated.record?.includes('- 옛 처리') && migrated.asset === 'A.png', '옮기기: 기록·처리 기록·스크린샷 이동');
  check(migrated.legacy === null && migrated.oldCmd === null && !!migrated.newCmd, '옮기기: .bugnotes/ 와 /bugnotes 커맨드 정리');
  check(!migrated.workflow.includes('옛 절차'), '옮기기: WORKFLOW.md는 새 버전 유지');
  check(!migrated.gitignore.includes('.bugnotes/') && migrated.gitignore.includes('.pinproof/'), `옮기기: .gitignore 교체`);
  check(await panel.locator('.rec-title', { hasText: '옛 기록' }).isVisible(), '옮긴 기록이 목록에 표시');

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
} finally {
  await ctx.close();
  server.close();
}

console.log(failures ? `\n${failures}개 실패` : '\n모두 통과');
process.exit(failures ? 1 : 0);
