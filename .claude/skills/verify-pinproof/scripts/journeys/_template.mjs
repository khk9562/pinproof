/**
 * 새 여정의 틀. 이 파일을 복사해 이름을 바꾸고 가운데만 채운다.
 * 조작 한 번마다 새 세션이므로, 상태는 한 파일 안에서 launch 부터 close 까지 이어서 만든다(여러 명령에 걸쳐 이어 갈 수 없다).
 * 선택자와 조작 순서는 features/<기능>.md 의 "Driving it with verify-pinproof harness" 를 따른다.
 * 사용: node .claude/skills/verify-pinproof/scripts/journeys/<여정>.mjs
 */
import { launch, checker } from '../harness.mjs';

const h = await launch({ name: 'template' }); // 실제 앱이면 launch({ name, url: 'http://localhost:5173', start: '/' })
const c = checker(h.log);
try {
  await h.connect(); // git 저장소 동작(.git/info/exclude)을 볼 때는 connect({ gitRepo: true })
  await h.snap('start');

  // 1) 사용자 경로로 조작한다: h.toolbar.element.click(), h.app.click('#help'), h.confirmPopover('메모') …
  // 2) 화면 상태를 확인한다: c.check((await h.rows().count()) === 1, '패널에 항목 1개')
  // 3) 부수 효과를 두 번째 경로로 확인한다: const md = await h.waitOpfs('.pinproof/items/001.md', (t) => t.includes('메모'))

  await h.snap('end');
} catch (e) {
  c.fail(`예외: ${e.message}`);
  await h.snap('error').catch(() => {});
} finally {
  await h.close(); // OPFS 의 .pinproof 를 증거로 내보내고 브라우저 · 서버 · 임시 폴더를 정리한다
}
h.log(c.failures ? `${c.failures}개 실패` : '모두 통과');
process.exitCode = c.failures ? 1 : 0; // process.exit 를 부르지 않는다(정리가 건너뛰어진다)
