import { setHandle } from './db';
import { applySetup, planSetup, SetupPlan } from './fs';

export function describePlan(plan: SetupPlan): string[] {
  const items: string[] = [];
  if (plan.workflow) items.push('.bugnotes/WORKFLOW.md 생성 (공통 처리 절차)');
  if (plan.command) items.push('.claude/commands/bugnotes.md 생성 (/bugnotes 커맨드)');
  if (plan.gitignore) items.push('.gitignore에 .bugnotes/ 와 커맨드 파일 추가');
  if (!plan.hasGit) items.push('(git 저장소가 아니어서 .gitignore는 건드리지 않습니다)');
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
  if (plan.workflow || plan.command || plan.gitignore) {
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
