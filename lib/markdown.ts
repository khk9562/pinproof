import { BugRecord, Evidence, EvidenceKind, Item, ItemStatus, ItemSummary, KIND_LABEL, RecordSummary } from './types';

/** Claude가 처리 후 덧붙이는 섹션. 이 줄부터 끝까지는 익스텐션이 절대 덮어쓰지 않는다. */
export const RESULT_HEADING = '## 처리 기록';

export function padId(id: number): string {
  return String(id).padStart(3, '0');
}

export function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|#%&{}$!'`@^+=~,;.\[\]()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.slice(0, 40) || '제목-없음';
}

export function recordFileName(record: Pick<BugRecord, 'id' | 'title'>): string {
  return `${padId(record.id)}-${slugify(record.title)}.md`;
}

export function assetPath(id: number, letter: string): string {
  return `assets/${padId(id)}/${letter}.png`;
}

export function letterFor(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function fence(content: string, lang = ''): string {
  // 내용에 ``` 가 있어도 깨지지 않도록 더 긴 펜스를 쓴다
  const longest = Math.max(2, ...[...content.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}${lang}\n${content}\n${ticks}`;
}

function inlineCode(value: string): string {
  const ticks = value.includes('`') ? '``' : '`';
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${value}${pad}${ticks}`;
}

function quoteText(value: string): string {
  return `"${value.replace(/\s+/g, ' ').trim()}"`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 같은 기록에 같은 대상을 두 번 담지 않기 위한 비교: 같은 route의 같은 요소, 텍스트는 같은 문구까지 */
export function sameTarget(a: Evidence, b: Evidence): boolean {
  if (a.route !== b.route || !a.selector || a.selector !== b.selector) return false;
  const kindOf = (e: Evidence) => (e.kind === 'container' ? 'element' : e.kind);
  if (kindOf(a) !== kindOf(b)) return false;
  if (a.kind === 'text') return a.quote?.exact === b.quote?.exact;
  return a.kind === 'element' || a.kind === 'container';
}

/** 화면 표시용 페이지 경로: pathname + query + hash */
export function pagePath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

/** React Grab 형식의 한 줄 참조: <td> in NodeRow › NodeListTable (src/x.tsx:42) */
export function referenceLine(e: Evidence): string | undefined {
  if (!e.tag) return undefined;
  let line = `<${e.tag}>`;
  if (e.component && e.component.chain.length > 0) {
    line += ` in ${e.component.chain.slice(0, 3).join(' › ')}`;
  }
  if (e.component?.source) {
    line += ` (${e.component.source}${e.component.sourceApprox ? ' 근처' : ''})`;
  }
  return line;
}

function evidenceSection(record: BugRecord, e: Evidence): string {
  const image = e.screenshot ? `![${e.letter}](${assetPath(record.id, e.letter!)})` : undefined;
  return evidenceBody(e, `### ${e.letter}. ${KIND_LABEL[e.kind]} — ${e.route}`, image);
}

/** 증거 하나의 md 본문. heading 은 제목 줄, image 는 스크린샷·붙여넣은 이미지의 md 링크 */
function evidenceBody(e: Evidence, heading: string, image: string | undefined): string {
  const lines: string[] = [];
  lines.push(heading);
  lines.push(`- URL: ${e.url}`);
  if (e.pageTitle) lines.push(`- 페이지 제목: ${e.pageTitle}`);
  if (e.note.trim()) lines.push(`- 메모: ${e.note.trim()}`);

  if (e.kind === 'paste') {
    lines.push('- 사용자가 클립보드에서 붙여넣은 자료 (붙여넣을 때 열려 있던 페이지 기준 URL)');
    if (image) lines.push(`- 이미지: ${image}`);
    if (e.pastedText) {
      lines.push('');
      lines.push(fence(e.pastedText));
    }
    return lines.join('\n');
  }

  if (e.kind === 'network') {
    const reqs = e.requests ?? [];
    lines.push(`- 호출 ${reqs.length}건 (요청 헤더·쿠키는 기록하지 않음, 응답은 앞부분만)`);
    lines.push('');
    reqs.forEach((r, i) => {
      lines.push(
        `${i + 1}. ${inlineCode(`${r.method} ${r.url}`)} → ${r.status || '실패'} · ${r.durationMs}ms · ${formatSize(r.size)}`,
      );
      if (r.bodyPreview) {
        const body = fence(r.bodyPreview, r.bodyPreview.trim().startsWith('{') || r.bodyPreview.trim().startsWith('[') ? 'json' : '');
        lines.push(body.split('\n').map((l) => `   ${l}`).join('\n'));
      }
    });
    return lines.join('\n');
  }

  const ref = referenceLine(e);
  if (ref) lines.push(`- 참조: ${inlineCode(ref)}`);
  if (e.component && !e.component.source && e.component.chain.length > 0) {
    lines.push(`- 컴포넌트: ${e.component.chain.join(' ← ')} (${e.component.framework})`);
  }
  if (e.selector) lines.push(`- selector: ${inlineCode(e.selector)}`);

  if (e.kind === 'text' && e.quote) {
    lines.push(`- 선택한 텍스트: ${quoteText(e.quote.exact)}`);
    lines.push(`- 앞뒤 문맥: …${e.quote.prefix.replace(/\s+/g, ' ')}【${e.quote.exact.replace(/\s+/g, ' ')}】${e.quote.suffix.replace(/\s+/g, ' ')}…`);
  } else if (e.text !== undefined && e.kind !== 'region') {
    lines.push(`- 텍스트: ${e.text ? quoteText(e.text) : '(없음)'}`);
  }

  if (e.table) {
    if (e.table.headers.length) lines.push(`- 헤더: ${e.table.headers.join(' | ')}`);
    lines.push(`- 화면에 보이는 행: ${e.table.visibleRows}`);
  }

  if (e.kind === 'region' && e.rect) {
    const r = e.rect;
    lines.push(`- 영역: x=${r.x}, y=${r.y}, ${r.width}×${r.height} (viewport 기준)`);
    if (e.regionTexts?.length) {
      lines.push(`- 영역 안에 보이던 글자: ${e.regionTexts.map((t) => quoteText(t)).join(' · ')}`);
    }
    if (e.children?.length) {
      lines.push(`- 영역 안 요소 ${e.children.length}개:`);
      for (const c of e.children) {
        lines.push(`  - ${inlineCode(c.selector)} <${c.tag}>${c.text ? ` ${quoteText(c.text)}` : ''}`);
      }
    }
  }

  lines.push(`- 화면 폭: ${e.viewportWidth}px`);
  if (image) lines.push(`- 스크린샷: ${image}`);
  if (e.html) {
    lines.push('');
    lines.push(fence(e.html, 'html'));
  }
  return lines.join('\n');
}

/** 제목·연관·메모가 모두 비어 있고 증거도 없는 기록(유형은 기본값이 있어 보지 않는다). 작성 종료 때 남기지 않는다 */
export function isEmptyRecord(r: BugRecord): boolean {
  return !r.title.trim() && !r.related.trim() && !r.memo.trim() && r.evidence.length === 0;
}

/** 익스텐션이 소유하는 본문(처리 기록 이전까지)을 만든다 */
export function renderRecord(record: BugRecord): string {
  const out: string[] = [];
  out.push('---');
  out.push(`id: ${record.id}`);
  out.push(`title: ${yamlString(record.title)}`);
  out.push(`type: ${record.type}`);
  out.push(`related: ${yamlString(record.related)}`);
  out.push(`created: ${record.created}`);
  if (record.updated) out.push(`updated: ${record.updated}`);
  out.push(`app: ${record.app}`);
  // 배포 주소(사이트별로 켠 곳)에서 모은 기록인지. WORKFLOW 가 소스 위치·버전 차이를 다르게 다룬다
  out.push(`env: ${envOf(record.app)}`);
  out.push(`evidence: ${record.evidence.length}`);
  out.push('---');
  out.push('');
  out.push(`# #${padId(record.id)} ${record.title || '(제목 없음)'}`);
  out.push('');
  out.push('## 메모');
  out.push(record.memo.trim() || '(메모 없음)');
  out.push('');
  out.push('## 증거');
  if (record.evidence.length === 0) {
    out.push('(아직 없음)');
  }
  for (const e of record.evidence) {
    out.push('');
    out.push(evidenceSection(record, e));
  }
  out.push('');
  return out.join('\n');
}

/** 기존 파일 내용에서 처리 기록 섹션(있으면)을 보존한 채 본문을 교체한다 */
export function mergeWithExisting(rendered: string, existing: string | null): string {
  if (!existing) return rendered;
  const idx = findResultHeading(existing);
  if (idx === -1) return rendered;
  return `${rendered.trimEnd()}\n\n${existing.slice(idx)}`;
}

function findResultHeading(text: string): number {
  if (text.startsWith(RESULT_HEADING)) return 0;
  const idx = text.indexOf(`\n${RESULT_HEADING}`);
  return idx === -1 ? -1 : idx + 1;
}

function frontmatter(text: string): Record<string, string> | null {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fields: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return fields;
}

/** yaml 문자열(따옴표)이면 풀고, 사람이 따옴표 없이 고친 값도 그대로 받는다 */
function unquote(value: string | undefined): string {
  if (value === undefined) return '';
  try {
    const v = JSON.parse(value);
    return typeof v === 'string' ? v : value;
  } catch {
    return value;
  }
}

/** 목록 표시용으로 frontmatter만 읽는다 */
export function parseSummary(text: string, fileName: string, archived: boolean): RecordSummary | null {
  const fields = frontmatter(text);
  if (!fields) return null;
  const id = Number(fields.id);
  if (!Number.isFinite(id)) return null;
  const title = unquote(fields.title);
  return {
    id,
    title,
    type: fields.type ?? '',
    evidenceCount: Number(fields.evidence) || 0,
    created: fields.created ?? '',
    fileName,
    archived,
    hasResult: findResultHeading(text) !== -1,
    app: fields.app || undefined,
  };
}

export function idFromFileName(name: string): number | null {
  const m = name.match(/^(\d{3,})-.*\.md$/);
  return m ? Number(m[1]) : null;
}

/**
 * Claude Code 등에 붙여넣을 프롬프트. 기록은 보통 메인 워크트리의 .pinproof/ 에만 있으므로,
 * 다른 git 워크트리에서 받아도 찾아갈 수 있게 메인 워크트리를 가리킨다(익스텐션은 폴더의 절대 경로를 알 수 없다).
 */
export function copyPrompt(fileName: string, archived = false): string {
  const path = archived ? `.pinproof/archive/${fileName}` : `.pinproof/${fileName}`;
  return (
    `\`.pinproof/WORKFLOW.md\` 절차대로 \`${path}\` 기록 건을 처리해줘.\n` +
    `지금 폴더에 \`.pinproof/\`가 없으면 \`git worktree list\` 첫 줄(메인 워크트리)의 \`.pinproof/\`에서 찾아 읽고, 코드 수정은 지금 폴더에서 해줘.`
  );
}

// ---------- 항목(items/) ----------

export function envOf(app: string): 'local' | 'deployed' {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(app) ? 'local' : 'deployed';
}

export function itemFileName(id: number): string {
  return `${padId(id)}.md`;
}

/** items/ 기준 스크린샷 경로 */
export function itemAssetPath(id: number): string {
  return `assets/${padId(id)}.png`;
}

export function itemIdFromFileName(name: string): number | null {
  const m = name.match(/^(\d{3,})\.md$/);
  return m ? Number(m[1]) : null;
}

/** 익스텐션이 소유하는 항목 본문(처리 기록 이전까지) */
export function renderItem(item: Item): string {
  const e = item.evidence;
  const out: string[] = [];
  out.push('---');
  out.push(`id: ${item.id}`);
  out.push(`category: ${yamlString(item.category)}`);
  out.push(`status: ${item.status}`);
  if (item.sent) out.push(`sent: ${item.sent}`);
  out.push(`created: ${item.created}`);
  if (item.updated) out.push(`updated: ${item.updated}`);
  out.push(`app: ${item.app}`);
  out.push(`env: ${envOf(item.app)}`);
  out.push(`kind: ${KIND_LABEL[e.kind]}`);
  out.push(`page: ${yamlString(pagePath(e.url))}`);
  out.push(`note: ${yamlString(e.note.trim())}`);
  out.push('---');
  out.push('');
  out.push(`# #${padId(item.id)} · ${item.category}`);
  out.push('');
  const image = e.screenshot ? `![${padId(item.id)}](${itemAssetPath(item.id)})` : undefined;
  out.push(evidenceBody(e, `## ${KIND_LABEL[e.kind]} — ${e.route}`, image));
  out.push('');
  return out.join('\n');
}

/** 파일 frontmatter 의 처리 상태(에이전트가 완료로 바꾼다) */
export function statusOf(text: string): ItemStatus {
  return frontmatter(text)?.status === '완료' ? '완료' : '대기';
}

/** frontmatter 의 status 줄만 바꾼다(보관함에서 되돌릴 때 대기로) */
export function withStatus(text: string, status: ItemStatus): string {
  return text.replace(/^(---\n[\s\S]*?)^status:.*$/m, `$1status: ${status}`);
}

export function parseItemSummary(text: string, fileName: string, archived: boolean): ItemSummary | null {
  const f = frontmatter(text);
  if (!f) return null;
  const id = Number(f.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    category: unquote(f.category) || '미분류',
    status: f.status === '완료' ? '완료' : '대기',
    sent: f.sent || undefined,
    created: f.created ?? '',
    app: f.app || undefined,
    // 파일에는 한국어 라벨(요소·네트워크 …)로 적혀 있다
    kind: (Object.keys(KIND_LABEL) as EvidenceKind[]).find((k) => KIND_LABEL[k] === f.kind || k === f.kind),
    page: unquote(f.page) || undefined,
    note: unquote(f.note),
    fileName,
    archived,
    hasResult: findResultHeading(text) !== -1,
  };
}

/** 항목 여러 개(또는 하나)를 넘기는 프롬프트. 넘길 파일을 하나하나 적어, 에이전트가 이미 넘긴 항목을 기억할 필요가 없게 한다 */
export function itemsPrompt(fileNames: string[], category?: string): string {
  const head = category
    ? `\`.pinproof/WORKFLOW.md\` 절차대로 "${category}" 카테고리의 아래 항목 ${fileNames.length}건을 처리해줘(목록에 없는 항목은 건드리지 마).`
    : `\`.pinproof/WORKFLOW.md\` 절차대로 아래 항목을 처리해줘.`;
  return (
    `${head}\n` +
    fileNames.map((n) => `- \`.pinproof/items/${n}\``).join('\n') +
    `\n처리를 끝낸 항목은 그 파일의 \`status\`를 \`완료\`로 바꾸고 \`## 처리 기록\`을 남겨줘.\n` +
    `지금 폴더에 \`.pinproof/\`가 없으면 \`git worktree list\` 첫 줄(메인 워크트리)의 \`.pinproof/\`에서 찾아 읽고, 코드 수정은 지금 폴더에서 해줘.`
  );
}
