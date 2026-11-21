/**
 * verify-pinproof 헬퍼. 조작 한 번(여정 스크립트 한 번)마다 새 세션을 만들고 끝나면 정리한다.
 * 1) 빌드 잠금 아래에서 PINPROOF_E2E=1 로 .output-e2e 를 다시 빌드하고, 실행별 임시 폴더로 복사한다
 *    (wxt build 는 시작할 때 출력 폴더를 지우므로, 원본을 그대로 올리면 동시에 돈 다른 실행이 깨진다)
 * 2) 빈 포트에 fixture 서버를 띄운다(tests/e2e/run.mjs 의 5199 · .e2e-profile 과 겹치지 않는다)
 * 3) 임시 폴더의 새 프로필로 Playwright Chromium 에 확장을 올리고, 앱 탭과 사이드 패널(팝업 창, ?opfs=1)을 연다
 * 증거는 test-results/verify/<실행 ID>/ 에 남는다. close() 는 OPFS 의 .pinproof 를 증거로 내보낸 뒤 임시 폴더만 지운다.
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const BUILT = path.join(ROOT, '.output-e2e', 'chrome-mv3');
export const FIXTURE = path.join(ROOT, 'tests', 'e2e', 'fixture', 'index.html');
export const WXT = path.join(ROOT, 'node_modules', 'wxt', 'bin', 'wxt.mjs');
export const VERIFY_DIR = path.join(ROOT, 'test-results', 'verify');
export const BUILD_LOCK = path.join(VERIFY_DIR, '.build.lock');
/** 실행별 임시 폴더 이름의 앞부분. 정리할 때 이 토큰이 명령줄에 든 프로세스만 끈다 */
export const RUN_PREFIX = 'pinproof-verify-';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 폴더를 통째로 복사한다. fs.cpSync 는 Node 22(Windows)에서 한글이 든 경로로 복사할 때 Segmentation fault 로 프로세스째 죽어서 쓰지 않는다 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** E2E 빌드(<all_urls> 포함)를 .output-e2e 에 만든다. 셸 없이 wxt 를 직접 띄워 Windows · 한글 경로 문제를 피한다 */
export function buildE2E() {
  const r = spawnSync(process.execPath, [WXT, 'build'], { cwd: ROOT, env: { ...process.env, PINPROOF_E2E: '1' }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`E2E 빌드 실패 (exit ${r.status})\n${r.stdout}\n${r.stderr}`);
}

/** 빌드 · 복사 구간을 한 실행만 지나가게 한다. 5분 넘은 잠금은 남은 찌꺼기로 보고 걷어 낸다 */
async function withBuildLock(fn) {
  fs.mkdirSync(VERIFY_DIR, { recursive: true });
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      fs.mkdirSync(BUILD_LOCK);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const age = Date.now() - (fs.statSync(BUILD_LOCK, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (age > 300_000) fs.rmSync(BUILD_LOCK, { recursive: true, force: true });
      else if (Date.now() > deadline) throw new Error(`빌드 잠금이 2분 동안 풀리지 않음: ${BUILD_LOCK}`);
      else await sleep(500);
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(BUILD_LOCK, { recursive: true, force: true });
  }
}

/** tests/e2e/run.mjs 와 같은 응답을 주는 fixture 서버를 127.0.0.1 의 빈 포트에 띄운다 */
function startFixture() {
  const html = fs.readFileSync(FIXTURE, 'utf8');
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
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/** 명령줄에 token 이 든 프로세스 목록(pid · 이름 · 명령줄). doctor 와 cleanup 이 쓴다 */
export function listProcesses(token) {
  if (process.platform === 'win32') {
    const ps = '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress';
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const rows = [].concat(JSON.parse(r.stdout || '[]'));
    return rows.filter((p) => p.CommandLine?.includes(token) && p.ProcessId !== process.pid).map((p) => ({ pid: p.ProcessId, name: p.Name, cmd: p.CommandLine }));
  }
  const r = spawnSync('ps', ['-eo', 'pid=,comm=,args='], { encoding: 'utf8' });
  return r.stdout
    .split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/))
    .filter((m) => m && m[3].includes(token) && Number(m[1]) !== process.pid)
    .map((m) => ({ pid: Number(m[1]), name: m[2], cmd: m[3] }));
}

/**
 * @param {object} [o]
 * @param {string} [o.name] 실행 ID 에 붙일 여정 이름
 * @param {string} [o.url] fixture 대신 띄워 둔 실제 앱 주소(예: http://localhost:5173)
 * @param {string} [o.start] 처음 열 경로(기본 /dashboard)
 * @param {boolean} [o.build] false 면 다시 빌드하지 않고 지금 .output-e2e 를 복사해 쓴다
 */
export async function launch({ name = 'run', url, start = '/dashboard', build = true } = {}) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}`;
  const evidence = path.join(VERIFY_DIR, runId);
  fs.mkdirSync(evidence, { recursive: true });
  const log = (s) => {
    const line = `[${new Date().toISOString()}] ${s}`;
    console.log(line);
    fs.appendFileSync(path.join(evidence, 'steps.log'), line + '\n');
  };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), RUN_PREFIX));
  const profile = path.join(tmp, 'profile');
  const ext = path.join(tmp, 'ext');
  let server = null;
  let ctx = null;
  let panel = null;
  let closed = false;

  /** OPFS(프로젝트 폴더 대역) 아래 dir 의 파일을 모두 증거 폴더 opfs/ 로 내보낸다. 프로필을 지우면 사라지므로 close 전에 부른다 */
  const exportOpfs = async (dir = '.pinproof') => {
    const files = await panel.evaluate(async (dir) => {
      const out = [];
      let root = await navigator.storage.getDirectory();
      try {
        for (const part of dir.split('/').filter(Boolean)) root = await root.getDirectoryHandle(part);
      } catch {
        return out;
      }
      const walk = async (d, prefix) => {
        for await (const [n, h] of d.entries()) {
          const p = `${prefix}/${n}`;
          if (h.kind === 'directory') {
            await walk(h, p);
            continue;
          }
          const bytes = new Uint8Array(await (await h.getFile()).arrayBuffer());
          let s = '';
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          out.push({ path: p, b64: btoa(s) });
        }
      };
      await walk(root, dir);
      return out;
    }, dir);
    for (const f of files) {
      const dest = path.join(evidence, 'opfs', ...f.path.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(f.b64, 'base64'));
    }
    log(`OPFS ${dir} 파일 ${files.length}개를 증거로 내보냄`);
    return files.length;
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    process.off('SIGINT', onSigint);
    if (panel && !panel.isClosed()) {
      try {
        await exportOpfs('.pinproof');
      } catch (e) {
        log(`OPFS 내보내기 실패(무시): ${e.message}`);
      }
    }
    try {
      await ctx?.close();
    } catch (e) {
      log(`브라우저 닫기 실패(무시): ${e.message}`);
    }
    if (server) {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(() => r()));
    }
    // 브라우저가 닫힌 직후에는 프로필 파일이 잠겨 있을 수 있어 재시도한다. 실패해도 실행 결과는 바꾸지 않는다(cleanup.mjs 가 치운다)
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {}
    if (fs.existsSync(tmp)) log(`임시 폴더를 지우지 못함(무시, cleanup.mjs 로 치운다): ${tmp}`);
    log(`정리 끝. 증거: ${evidence}`);
  };
  const onSigint = () => {
    close().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSigint);

  try {
    await withBuildLock(async () => {
      if (build) {
        log('E2E 빌드(.output-e2e)');
        buildE2E();
      }
      if (!fs.existsSync(path.join(BUILT, 'manifest.json'))) throw new Error(`E2E 빌드가 없음: ${BUILT} (build: false 로는 쓸 수 없다)`);
      copyDir(BUILT, ext);
    });

    let base = url?.replace(/\/$/, '');
    if (!base) {
      server = await startFixture();
      base = `http://localhost:${server.address().port}`;
    }
    log(`앱: ${base}${start} · 임시 폴더: ${tmp}`);
    ctx = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: process.env.HEADED !== '1',
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const extId = new URL(sw.url()).host;

    const app = ctx.pages()[0] ?? (await ctx.newPage());
    await app.goto(`${base}${start}`);
    const tabId = await sw.evaluate(async (b) => (await chrome.tabs.query({ url: `${b}/*` }))[0]?.id, base);
    if (tabId == null) throw new Error(`앱 탭을 찾지 못함: ${base}`);

    // 사이드 패널을 별도 팝업 창으로 연다(앱 탭이 자기 창에서 활성이어야 화면 캡처가 앱을 찍는다)
    const panelPromise = ctx.waitForEvent('page');
    await sw.evaluate(
      ({ extId, tabId }) => chrome.windows.create({ url: `chrome-extension://${extId}/sidepanel.html?tab=${tabId}&opfs=1`, type: 'popup', width: 420, height: 900 }),
      { extId, tabId },
    );
    panel = await panelPromise;
    await panel.waitForLoadState();
    await panel.setViewportSize({ width: 400, height: 900 });

    // 대역: 클립보드 쓰기를 가로채 window.__clip 에 남긴다(headless 에서는 실제 클립보드를 읽을 수 없다)
    // 패널의 안내 · 경고(.notice)를 모두 모은다(잠깐 떴다 사라지는 저장 실패 경고도 잡으려고)
    await panel.evaluate(() => {
      navigator.clipboard.writeText = async (t) => {
        window.__clip = t;
      };
      window.__notices = [];
      new MutationObserver(() => {
        for (const n of document.querySelectorAll('.notice')) if (!window.__notices.includes(n.textContent)) window.__notices.push(n.textContent);
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    // 확인 창(window.confirm): 기본은 수락하고 메시지를 남긴다. dialogs.answer = false 로 한 번 취소할 수 있다
    const dialogs = { messages: [], answer: true };
    panel.on('dialog', (d) => {
      dialogs.messages.push(d.message());
      log(`확인 창: ${d.message()} → ${dialogs.answer ? '수락' : '취소'}`);
      return dialogs.answer ? d.accept() : d.dismiss();
    });

    let shot = 0;
    /** 앱과 패널을 함께 찍어 증거 폴더에 순번을 붙여 남긴다 */
    const snap = async (label) => {
      const n = String(++shot).padStart(2, '0');
      await app.screenshot({ path: path.join(evidence, `${n}-${label}-app.png`) });
      await panel.screenshot({ path: path.join(evidence, `${n}-${label}-panel.png`), fullPage: true });
      log(`스크린샷 ${n}-${label}`);
    };
    /** OPFS 에서 파일 내용(경로가 / 로 끝나면 이름 목록)을 읽는다. 없으면 null */
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
    /** 파일이 생겨 ok(text) 가 참이 될 때까지 읽는다(md 저장은 담은 직후가 아니라 조금 뒤에 끝난다). 시간 안에 안 되면 null */
    const waitOpfs = async (p, ok = () => true, timeout = 8000) => {
      const end = Date.now() + timeout;
      for (;;) {
        const t = await readOpfs(p);
        if (t !== null && ok(t)) return t;
        if (Date.now() > end) return null;
        await sleep(200);
      }
    };
    /** 대역: 에이전트가 항목 md 를 고친 것처럼 OPFS 파일을 직접 쓴다(없는 폴더는 만든다) */
    const writeOpfs = (p, text) =>
      panel.evaluate(
        async ({ p, text }) => {
          let dir = await navigator.storage.getDirectory();
          const parts = p.split('/');
          const file = parts.pop();
          for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
          const w = await (await dir.getFileHandle(file, { create: true })).createWritable();
          await w.write(text);
          await w.close();
        },
        { p, text },
      );
    /** 패널의 [프로젝트 폴더 연결]을 누른다. gitRepo 면 git 저장소처럼 보이게 .git/info/exclude 와 .gitignore 를 먼저 둔다 */
    const connect = async ({ gitRepo = false } = {}) => {
      if (gitRepo) {
        await writeOpfs('.git/info/exclude', '# git ls-files --others\n*~\n');
        await writeOpfs('.gitignore', 'node_modules\n');
      }
      await panel.getByRole('button', { name: '프로젝트 폴더 연결' }).click();
      await panel.locator('.cat.current').waitFor({ timeout: 10000 });
      log(`프로젝트 폴더(OPFS) 연결${gitRepo ? ', git 저장소처럼' : ''}`);
    };

    // 페이지 위 툴바 버튼. 문구가 아니라 data 속성으로 잡는다
    const bar = 'pinproof-overlay .tb';
    const toolbar = {
      root: app.locator(bar),
      element: app.locator(`${bar} [data-mode="element"]`),
      text: app.locator(`${bar} [data-mode="text"]`),
      region: app.locator(`${bar} [data-mode="region"]`),
      network: app.locator(`${bar} [data-act="network"]`),
      markers: app.locator(`${bar} [data-act="markers"]`),
    };
    const popover = app.locator('pinproof-overlay .pop:not(.out)');
    /** 요소 · 텍스트 · 영역을 고른 뒤 뜬 팝오버에 메모를 쓰고 Enter 로 담는다 */
    const confirmPopover = async (note = '') => {
      await popover.waitFor({ timeout: 5000 });
      const ta = popover.locator('textarea');
      if (note) await ta.fill(note);
      await ta.press('Enter');
      await popover.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
    };
    /** 지금 페이지에 보이는 마커 번호들(마커가 없는 항목은 ·) */
    const pins = () =>
      app
        .locator('pinproof-overlay')
        .evaluate((h) => [...h.shadowRoot.querySelectorAll('.pin:not(.temp):not(.leaving):not([hidden])')].map((p) => (p.classList.contains('loose') ? '·' : p.firstChild?.textContent ?? '')));
    /** 지금 담는 카테고리 상자의 항목 줄 */
    const rows = () => panel.locator('.cat.current .ev');
    const notices = () => panel.evaluate(() => window.__notices);
    const clipboard = () => panel.evaluate(() => window.__clip ?? null);

    return { ctx, sw, extId, app, panel, base, evidence, log, snap, readOpfs, waitOpfs, writeOpfs, exportOpfs, connect, toolbar, popover, confirmPopover, pins, rows, notices, clipboard, dialogs, close };
  } catch (e) {
    log(`실행 준비 실패: ${e.message}`);
    await close();
    throw e;
  }
}

/** 여정 스크립트용 검사 모음. 실패해도 멈추지 않고, 끝에 failures 로 판정한다 */
export function checker(log) {
  let failures = 0;
  return {
    check(cond, label) {
      log(`${cond ? '✔' : '✘'} ${label}`);
      if (!cond) failures++;
    },
    fail(label) {
      log(`✘ ${label}`);
      failures++;
    },
    get failures() {
      return failures;
    },
  };
}
