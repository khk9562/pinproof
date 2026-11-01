import { setHandle } from './db';
import { applySetup, installSkill, planSetup, SetupPlan, skillStatus } from './fs';
import { SKILL_NAME } from './templates';

export function describePlan(plan: SetupPlan): string[] {
  const items: string[] = [];
  if (plan.legacy) items.push('.bugnotes/ → .pinproof/ 옮기기');
  if (plan.workflow) items.push('.pinproof/ 만들기 (기록 · 처리 절차)');
  if (plan.exclude) items.push('.git/info/exclude 에 추가 (내 컴퓨터만)');
  if (plan.git === 'worktree') items.push('(워크트리: 무시 설정은 메인 저장소에서 직접)');
  return items;
}

/** 스킬 설치 위치와 git 무시 설정 안내(연결 확인 창 · 패널 확인 창 공통) */
export function skillFileLines(git: SetupPlan['git'], update = false): string[] {
  const where =
    git === 'repo'
      ? `.git/info/exclude 에 .claude/skills/${SKILL_NAME}/ 추가 (팀 저장소에는 올라가지 않음)`
      : git === 'worktree'
        ? `git 워크트리라 무시 설정을 쓰지 못합니다. 메인 저장소의 .git/info/exclude 에 .claude/skills/${SKILL_NAME}/ 를 넣거나, 커밋하지 않도록 주의하세요`
        : '';
  return [`.claude/skills/${SKILL_NAME}/SKILL.md ${update ? '교체' : '생성'}`, ...(where ? [where] : [])];
}

export const SKILL_SUMMARY = '화면 값을 API → 원천(DB 등) → 산식까지 따라가 맞는지 점검하고 이슈 초안까지만 만드는 Claude Code 스킬입니다. 코드는 고치지 않습니다.';

/** 연결 확인 창의 스킬 한 줄 설명 */
export function skillNote(git: SetupPlan['git']): string {
  const where = git === 'repo' ? ' · git 에 안 올라감' : git === 'worktree' ? ' · 워크트리라 커밋 주의' : '';
  return `화면 값을 API · DB까지 대조${where}`;
}

/** 패널의 [이 프로젝트에 설치] · [업데이트] 확인 창 문구 */
export function describeSkill(git: SetupPlan['git'], mode: 'install' | 'update'): string {
  const update = mode === 'update';
  return [
    update
      ? `데이터 정합성 점검 스킬(/${SKILL_NAME})을 새 버전으로 교체합니다. 이 파일을 직접 고쳤다면 그 내용은 사라집니다.`
      : `데이터 정합성 점검 스킬(/${SKILL_NAME})을 이 프로젝트에 설치합니다.`,
    '',
    SKILL_SUMMARY,
    '',
    ...skillFileLines(git, update).map((l) => `- ${l}`),
    '',
    '계속할까요?',
  ].join('\n');
}

/** 폴더 연결 확인 창에 보여 줄 내용 */
export interface SetupPrompt {
  folder: string;
  /** 만들거나 고칠 파일 목록(describePlan) */
  items: string[];
  /** 처음 연결하는 폴더(WORKFLOW.md 없음)이고 스킬이 없으면 선택 설치 체크박스(기본 꺼짐). note 는 한 줄 설명 */
  skill: { name: string; note: string } | null;
}

/** null = 취소(아무것도 쓰지 않음) */
export type SetupAnswer = { skill: boolean } | null;

/**
 * 고른 폴더에 필요한 파일을 만들고 앱 origin과 연결한다.
 * 만들 것이 있으면 ask 로 확인 창(파일 목록 + 선택 스킬 체크박스)을 띄우고, 취소하면 아무것도 쓰지 않는다.
 */
export async function connectFolder(
  origin: string,
  root: FileSystemDirectoryHandle,
  ask: (prompt: SetupPrompt) => SetupAnswer | Promise<SetupAnswer>,
): Promise<boolean> {
  const plan = await planSetup(root);
  const offerSkill = plan.workflow && !(await skillStatus(root)).installed;
  if (plan.workflow || plan.exclude || plan.legacy) {
    const answer = await ask({
      folder: root.name,
      items: describePlan(plan),
      skill: offerSkill ? { name: SKILL_NAME, note: skillNote(plan.git) } : null,
    });
    if (!answer) return false;
    await applySetup(root);
    if (offerSkill && answer.skill) await installSkill(root);
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
