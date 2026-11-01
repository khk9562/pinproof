import { setHandle } from './db';
import { applySetup, installSkill, planSetup, SetupPlan, skillStatus } from './fs';
import { SKILL_NAME } from './templates';

export function describePlan(plan: SetupPlan): string[] {
  const items: string[] = [];
  if (plan.legacy) items.push('이전 이름의 .bugnotes/ 기록·스크린샷을 .pinproof/ 로 옮기고, 이전 커맨드(/bugnotes) 정리');
  if (plan.workflow) items.push('.pinproof/WORKFLOW.md 생성 (공통 처리 절차)');
  if (plan.exclude) items.push('.git/info/exclude 에 .pinproof/ 추가 (이 컴퓨터에만 적용, 팀 .gitignore 는 건드리지 않음)');
  if (plan.git === 'worktree') {
    items.push('(git 워크트리라 무시 설정을 쓰지 않습니다. 메인 저장소의 .git/info/exclude 에 .pinproof/ 가 있는지 확인하세요)');
  }
  if (plan.git === 'none') items.push('(git 저장소가 아니어서 무시 설정은 건드리지 않습니다)');
  items.push('(/pinproof 커맨드는 프로젝트에 만들지 않습니다. ~/.claude/commands/pinproof.md 에 한 번 두세요. README 참고)');
  return items;
}

/**
 * 선택 스킬 설치 확인 창의 문구.
 * offer: 폴더 처음 연결 때 묻기 · install: 패널 [설치] · update: 패널 [업데이트](파일 교체)
 */
export function describeSkill(git: SetupPlan['git'], mode: 'offer' | 'install' | 'update'): string {
  const update = mode === 'update';
  const where =
    git === 'repo'
      ? `.git/info/exclude 에 .claude/skills/${SKILL_NAME}/ 를 넣어 팀 저장소에는 올라가지 않습니다.`
      : git === 'worktree'
        ? `git 워크트리라 무시 설정을 쓰지 못합니다. 메인 저장소의 .git/info/exclude 에 .claude/skills/${SKILL_NAME}/ 를 넣거나, 커밋하지 않도록 주의하세요.`
        : '';
  return [
    mode === 'offer'
      ? `데이터 정합성 점검 스킬(/${SKILL_NAME})도 이 프로젝트에 설치할까요? (선택)`
      : update
        ? `데이터 정합성 점검 스킬(/${SKILL_NAME})을 새 버전으로 교체합니다. 이 파일을 직접 고쳤다면 그 내용은 사라집니다.`
        : `데이터 정합성 점검 스킬(/${SKILL_NAME})을 이 프로젝트에 설치합니다.`,
    '',
    `화면 값을 API → 원천(DB 등) → 산식까지 따라가 맞는지 점검하고 이슈 초안까지만 만드는 Claude Code 스킬입니다. 코드는 고치지 않습니다.`,
    '',
    `- .claude/skills/${SKILL_NAME}/SKILL.md ${update ? '교체' : '생성'}`,
    ...(where ? [`- ${where}`] : []),
    '',
    mode === 'offer' ? '설치하지 않아도 PinProof 는 그대로 동작하고, 나중에 패널에서 설치할 수 있습니다.' : '계속할까요?',
  ].join('\n');
}

/**
 * 고른 폴더에 필요한 파일을 만들고 앱 origin과 연결한다.
 * confirm이 false를 돌려주면 아무것도 쓰지 않는다.
 * 처음 연결하는 폴더(WORKFLOW.md 가 없음)면 offerSkill 로 선택 스킬 설치를 한 번 묻는다(거절해도 연결은 된다).
 */
export async function connectFolder(
  origin: string,
  root: FileSystemDirectoryHandle,
  confirm: (items: string[], folderName: string) => boolean | Promise<boolean>,
  offerSkill?: (message: string) => boolean | Promise<boolean>,
): Promise<boolean> {
  const plan = await planSetup(root);
  const items = describePlan(plan);
  if (plan.workflow || plan.exclude || plan.legacy) {
    if (!(await confirm(items, root.name))) return false;
    await applySetup(root);
  }
  if (offerSkill && plan.workflow && !(await skillStatus(root)).installed && (await offerSkill(describeSkill(plan.git, 'offer')))) {
    await installSkill(root);
  }
  await setHandle(origin, root);
  return true;
}

/** manifest 에 고정으로 들어 있는 로컬 개발 주소 */
export const LOCAL_PATTERNS = ['http://localhost/*', 'http://127.0.0.1/*'];

/** 로컬 개발 주소(localhost·127.0.0.1)인지. 여기서는 따로 켜지 않아도 동작한다 */
export function isSupportedUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

/** 사이트별로 켤 수 있는 주소(http/https)면 권한 패턴(예: http://192.168.0.92/*), 아니면 null. 포트는 패턴에 넣지 않는다 */
export function sitePattern(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

export function routeOf(url: string): string {
  const u = new URL(url);
  return u.pathname + (u.hash.startsWith('#/') ? u.hash : '');
}
