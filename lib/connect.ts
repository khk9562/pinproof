import { setHandle } from './db';
import { applySetup, planSetup, SetupPlan } from './fs';

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
 * 고른 폴더에 필요한 파일을 만들고 앱 origin과 연결한다.
 * confirm이 false를 돌려주면 아무것도 쓰지 않는다.
 */
export async function connectFolder(
  origin: string,
  root: FileSystemDirectoryHandle,
  confirm: (items: string[], folderName: string) => boolean | Promise<boolean>,
): Promise<boolean> {
  const plan = await planSetup(root);
  const items = describePlan(plan);
  if (plan.workflow || plan.exclude || plan.legacy) {
    if (!(await confirm(items, root.name))) return false;
    await applySetup(root);
  }
  await setHandle(origin, root);
  return true;
}

export function isSupportedUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

export function routeOf(url: string): string {
  const u = new URL(url);
  return u.pathname + (u.hash.startsWith('#/') ? u.hash : '');
}
