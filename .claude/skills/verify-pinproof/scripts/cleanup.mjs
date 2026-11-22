/**
 * 비정상 종료(타임아웃 · Ctrl+C · 예외로 close() 를 못 탄 경우)로 남은 것을 치운다.
 * 프로세스는 이름으로 끄지 않는다. 명령줄에 실행별 임시 폴더 토큰(pinproof-verify-)이 든 것, 즉 여정이 띄운 것만 끈다.
 * 증거 폴더(test-results/verify/)는 건드리지 않는다. 돌고 있는 여정이 있으면 그 여정도 끊기므로, 여정이 없을 때만 쓴다.
 * 사용: node .claude/skills/verify-pinproof/scripts/cleanup.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BUILD_LOCK, RUN_PREFIX, listProcesses } from './harness.mjs';

const procs = listProcesses(RUN_PREFIX);
for (const p of procs) {
  try {
    process.kill(p.pid);
    console.log(`끔: ${p.name}(${p.pid})`);
  } catch (e) {
    console.log(`끄지 못함: ${p.name}(${p.pid}) ${e.code ?? e.message}`);
  }
}
if (procs.length) await new Promise((r) => setTimeout(r, 1500));

for (const n of fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(RUN_PREFIX))) {
  const p = path.join(os.tmpdir(), n);
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    console.log(`지움: ${p}`);
  } catch (e) {
    console.log(`지우지 못함: ${p} ${e.code ?? e.message}`);
  }
}
if (fs.existsSync(BUILD_LOCK)) {
  fs.rmSync(BUILD_LOCK, { recursive: true, force: true });
  console.log(`빌드 잠금 지움: ${BUILD_LOCK}`);
}

const left = listProcesses(RUN_PREFIX).length + fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(RUN_PREFIX)).length;
console.log(left ? `\n남은 것 ${left}개(위 메시지 참고)` : '\n남은 것 없음');
process.exitCode = left ? 1 : 0;
