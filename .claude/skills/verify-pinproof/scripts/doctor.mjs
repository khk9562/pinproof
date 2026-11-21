/**
 * 읽기 전용 점검: "지금 여정을 돌려도 되는가?" 에 답한다. 무엇도 고치거나 지우지 않는다.
 * 필수 항목이 하나라도 실패하면 exit 1. 경고는 돌릴 수는 있지만 알아 둘 것이다.
 * 사용: node .claude/skills/verify-pinproof/scripts/doctor.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, BUILT, FIXTURE, WXT, BUILD_LOCK, RUN_PREFIX, listProcesses } from './harness.mjs';

let failed = 0;
const must = (ok, label, fix) => {
  console.log(`${ok ? '✔' : '✘'} [필수] ${label}${ok || !fix ? '' : ` → ${fix}`}`);
  if (!ok) failed++;
};
/** 경고 항목: 괜찮으면 okLabel, 아니면 badLabel 과 할 일을 보여 준다 */
const warn = (ok, okLabel, badLabel, note) => console.log(ok ? `✔ [경고] ${okLabel}` : `! [경고] ${badLabel}${note ? ` → ${note}` : ''}`);

const major = Number(process.versions.node.split('.')[0]);
must(major >= 18, `Node ${process.versions.node}`, 'Node 18 이상이 필요하다');
must(fs.existsSync(WXT), 'wxt 설치(node_modules)', 'npm ci');
must(fs.existsSync(FIXTURE), 'fixture 페이지(tests/e2e/fixture/index.html)');
const exe = chromium.executablePath();
must(fs.existsSync(exe), `Playwright Chromium: ${exe}`, 'npx playwright install chromium');

// E2E 빌드는 여정이 실행할 때마다 다시 만든다. 여기서는 지금 있는 빌드가 어떤지만 알려 준다
const manifestPath = path.join(BUILT, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  warn(false, '', 'E2E 빌드(.output-e2e) 없음', '여정이 실행할 때 만든다. build: false 로는 돌릴 수 없다');
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  warn((manifest.host_permissions ?? []).includes('<all_urls>'), 'E2E 빌드에 <all_urls> 포함', 'E2E 빌드에 <all_urls> 없음', '일반 빌드가 섞였다. 여정이 다시 빌드한다');
  const newest = (p) => {
    const st = fs.statSync(p, { throwIfNoEntry: false });
    if (!st) return 0;
    if (!st.isDirectory()) return st.mtimeMs;
    return Math.max(0, ...fs.readdirSync(p).map((n) => newest(path.join(p, n))));
  };
  const src = Math.max(...['entrypoints', 'lib', 'public', 'wxt.config.ts'].map((p) => newest(path.join(ROOT, p))));
  warn(fs.statSync(manifestPath).mtimeMs >= src, 'E2E 빌드가 소스보다 새것', 'E2E 빌드가 소스보다 오래됨', '여정은 기본으로 다시 빌드하므로 build: false 를 쓰지 않는다');
}

warn(!fs.existsSync(BUILD_LOCK), '빌드 잠금 없음', '빌드 잠금 있음', `다른 여정이 빌드 중이거나 찌꺼기다(5분 지나면 다음 여정이 걷어 낸다): ${BUILD_LOCK}`);
const leftovers = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(RUN_PREFIX));
warn(leftovers.length === 0, '남은 임시 폴더 없음', `남은 임시 폴더 ${leftovers.length}개`, `돌고 있는 여정이 없다면 cleanup.mjs 로 치운다: ${leftovers.join(', ')}`);
const orphans = listProcesses(RUN_PREFIX);
warn(orphans.length === 0, '임시 폴더를 쓰는 프로세스 없음', `임시 폴더를 쓰는 프로세스 ${orphans.length}개`, `돌고 있는 여정이 없다면 cleanup.mjs 로 끈다: ${orphans.map((p) => `${p.name}(${p.pid})`).join(', ')}`);
const e2e = listProcesses('tests/e2e/run.mjs').concat(listProcesses('tests\\e2e\\run.mjs'));
warn(e2e.length === 0, 'tests/e2e/run.mjs 실행 중 아님', 'tests/e2e/run.mjs 실행 중', '전체 회귀가 돌고 있다. 여정의 빌드가 그쪽 확장 폴더를 지우므로 끝난 뒤에 돌린다');

console.log(failed ? `\n필수 ${failed}개 실패` : '\n여정을 돌려도 된다');
process.exitCode = failed ? 1 : 0;
