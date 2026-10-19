import { describe, expect, it } from 'vitest';
import {
  copyPrompt,
  isEmptyRecord,
  pagePath,
  sameTarget,
  idFromFileName,
  letterFor,
  mergeWithExisting,
  parseSummary,
  recordFileName,
  renderRecord,
} from '../lib/markdown';
import { appendExclude, EXCLUDE_BLOCK } from '../lib/templates';
import { BugRecord } from '../lib/types';

const record: BugRecord = {
  id: 12,
  title: '대시보드 총합 불일치',
  type: '버그',
  related: '#589',
  memo: '총합은 10인데 노드 목록 CPU를 더하면 100 넘음',
  created: '2026-10-16T14:32',
  app: 'http://localhost:5190',
  evidence: [
    {
      letter: 'A',
      uid: 'a',
      kind: 'element',
      url: 'http://localhost:5190/dashboard',
      route: '/dashboard',
      capturedAt: 0,
      viewportWidth: 1440,
      note: '총합 카드',
      selector: '[data-testid="summary-total"]',
      tag: 'div',
      text: '10',
      html: '<div data-testid="summary-total">10</div>',
      component: { framework: 'React', chain: ['SummaryCard', 'DashboardPage'], source: 'src/components/SummaryCard.tsx:42', sourceApprox: true },
      screenshot: 'data:image/png;base64,AAAA',
    },
    {
      letter: 'B',
      uid: 'b',
      kind: 'container',
      url: 'http://localhost:5190/nodes',
      route: '/nodes',
      capturedAt: 0,
      viewportWidth: 1440,
      note: '',
      selector: 'main > table',
      tag: 'table',
      text: '이름 상태 CPU',
      table: { headers: ['이름', '상태', 'CPU'], visibleRows: 23 },
    },
    {
      letter: 'C',
      uid: 'c',
      kind: 'network',
      url: 'http://localhost:5190/nodes',
      route: '/nodes',
      capturedAt: 0,
      viewportWidth: 1440,
      note: '',
      requests: [
        { method: 'GET', url: 'http://localhost:5190/api/nodes', status: 200, durationMs: 12, size: 12, bodyPreview: '{"items":[]}', route: '/nodes', time: 0 },
      ],
    },
    {
      letter: 'D',
      uid: 'd',
      kind: 'text',
      url: 'http://localhost:5190/vm',
      route: '/vm',
      capturedAt: 0,
      viewportWidth: 1440,
      note: '',
      selector: 'p',
      tag: 'p',
      quote: { exact: '미설치 VM 목록 조회에 실패했습니다', prefix: '오류: ', suffix: '. 다시' },
    },
  ],
};

describe('renderRecord', () => {
  const md = renderRecord(record);

  it('frontmatter에 목록용 필드를 쓴다', () => {
    expect(md.startsWith('---\nid: 12\ntitle: "대시보드 총합 불일치"\ntype: 버그\nrelated: "#589"')).toBe(true);
    expect(md).toContain('evidence: 4');
  });

  it('env: localhost 는 local, 그 밖의 주소(사이트별로 켠 배포 주소)는 deployed', () => {
    expect(md).toContain('app: http://localhost:5190\nenv: local');
    expect(renderRecord({ ...record, app: 'http://192.168.0.92:20100' })).toContain('env: deployed');
    expect(renderRecord({ ...record, app: 'http://127.0.0.1:3000' })).toContain('env: local');
  });

  it('증거마다 문자·종류·route 헤더와 React Grab 형식 참조를 쓴다', () => {
    expect(md).toContain('### A. 요소 — /dashboard');
    expect(md).toContain('- 참조: `<div> in SummaryCard › DashboardPage (src/components/SummaryCard.tsx:42 근처)`');
    expect(md).toContain('- 스크린샷: ![A](assets/012/A.png)');
    expect(md).toContain('- 텍스트: "10"');
  });

  it('컨테이너는 헤더와 보이는 행 수, 네트워크는 응답 앞부분을 쓴다', () => {
    expect(md).toContain('- 헤더: 이름 | 상태 | CPU');
    expect(md).toContain('- 화면에 보이는 행: 23');
    expect(md).toContain('1. `GET http://localhost:5190/api/nodes` → 200 · 12ms · 12B');
    expect(md).toContain('{"items":[]}');
  });

  it('텍스트 증거는 exact와 앞뒤 문맥을 쓴다', () => {
    expect(md).toContain('- 선택한 텍스트: "미설치 VM 목록 조회에 실패했습니다"');
    expect(md).toContain('…오류: 【미설치 VM 목록 조회에 실패했습니다】. 다시…');
  });

  it('HTML에 백틱이 있어도 펜스가 깨지지 않는다', () => {
    const r = { ...record, evidence: [{ ...record.evidence[0], html: '<pre>```js\nx```</pre>' }] };
    expect(renderRecord(r)).toContain('````html\n<pre>```js\nx```</pre>\n````');
  });
});

describe('mergeWithExisting', () => {
  it('처리 기록 섹션은 보존하고 위쪽 본문만 교체한다', () => {
    const old = `${renderRecord({ ...record, memo: '옛 메모' })}\n## 처리 기록\n- 원인: 집계 범위 오류\n`;
    const merged = mergeWithExisting(renderRecord(record), old);
    expect(merged).not.toContain('옛 메모');
    expect(merged).toContain(record.memo);
    expect(merged.endsWith('## 처리 기록\n- 원인: 집계 범위 오류\n')).toBe(true);
  });

  it('처리 기록이 없으면 새 본문만', () => {
    expect(mergeWithExisting('new', 'old')).toBe('new');
  });
});

describe('parseSummary', () => {
  it('frontmatter와 처리 기록 여부를 읽는다', () => {
    const s = parseSummary(`${renderRecord(record)}\n## 처리 기록\n- x`, '012-x.md', false)!;
    expect(s).toMatchObject({ id: 12, title: '대시보드 총합 불일치', type: '버그', evidenceCount: 4, hasResult: true });
  });

  it('요약에 기록을 만든 앱 주소(app)를 담는다 — 없으면 undefined', () => {
    expect(parseSummary(renderRecord(record), '012-x.md', false)!.app).toBe('http://localhost:5190');
    expect(parseSummary('---\nid: 77\ntitle: "옛 기록"\n---\n', '077-x.md', false)!.app).toBeUndefined();
  });
});

describe('파일명·문자·프롬프트', () => {
  it('파일명은 3자리 id + 슬러그', () => {
    expect(recordFileName({ id: 7, title: '노드 목록: 무한 스켈레톤?' })).toBe('007-노드-목록-무한-스켈레톤.md');
    expect(recordFileName({ id: 7, title: '' })).toBe('007-제목-없음.md');
    expect(idFromFileName('012-대시보드.md')).toBe(12);
    expect(idFromFileName('WORKFLOW.md')).toBeNull();
  });

  it('문자는 A..Z 다음 AA', () => {
    expect([0, 1, 25, 26, 27].map(letterFor)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
  });

  it('복사 프롬프트는 WORKFLOW와 파일 경로를 가리킨다', () => {
    expect(copyPrompt('012-x.md').split('\n')[0]).toBe('`.pinproof/WORKFLOW.md` 절차대로 `.pinproof/012-x.md` 기록 건을 처리해줘.');
    expect(copyPrompt('012-x.md', true)).toContain('.pinproof/archive/012-x.md');
  });

  it('복사 프롬프트는 다른 워크트리에서도 메인 워크트리의 .pinproof/ 를 찾게 한다', () => {
    const p = copyPrompt('012-x.md');
    expect(p).toContain('git worktree list');
    expect(p).toContain('코드 수정은 지금 폴더에서');
  });
});

describe('appendExclude', () => {
  it('없으면 블록 추가, .pinproof 줄이 이미 있으면 null', () => {
    expect(appendExclude(null)).toBe(EXCLUDE_BLOCK);
    expect(appendExclude('node_modules')).toBe(`node_modules\n\n${EXCLUDE_BLOCK}`);
    expect(appendExclude('node_modules\n')).toBe(`node_modules\n\n${EXCLUDE_BLOCK}`);
    expect(appendExclude(`a\n${EXCLUDE_BLOCK}`)).toBeNull();
    // 사용자가 직접 다른 주석과 함께 적어 둔 줄도 인정한다
    expect(appendExclude('# 개인 도구\n  /.pinproof  \n')).toBeNull();
    expect(appendExclude('.pinproof-old/')).not.toBeNull();
  });
});

describe('sameTarget / pagePath', () => {
  const [a, , , d] = record.evidence;
  it('같은 route·selector의 요소는 같은 대상(요소↔컨테이너 포함)', () => {
    expect(sameTarget(a, { ...a, uid: 'x' })).toBe(true);
    expect(sameTarget(a, { ...a, uid: 'x', kind: 'container' })).toBe(true);
    expect(sameTarget(a, { ...a, uid: 'x', route: '/other' })).toBe(false);
    expect(sameTarget(a, { ...a, uid: 'x', selector: 'main' })).toBe(false);
  });
  it('텍스트는 같은 문구일 때만, 영역·네트워크는 비교하지 않음', () => {
    expect(sameTarget(d, { ...d, uid: 'y' })).toBe(true);
    expect(sameTarget(d, { ...d, uid: 'y', quote: { ...d.quote!, exact: '다른 문구' } })).toBe(false);
    expect(sameTarget(a, { ...a, uid: 'z', kind: 'text', quote: d.quote })).toBe(false);
  });
  it('페이지 경로는 query·hash까지', () => {
    expect(pagePath('http://localhost:5190/nodes?ns=tenant-alpha#top')).toBe('/nodes?ns=tenant-alpha#top');
  });
});

describe('isEmptyRecord', () => {
  const blank = { ...record, title: '', related: '', memo: '', evidence: [] };
  it('제목·연관·메모·증거가 모두 비면 빈 기록(유형은 보지 않음)', () => {
    expect(isEmptyRecord(blank)).toBe(true);
    expect(isEmptyRecord({ ...blank, title: '  ', memo: '\n' })).toBe(true);
    expect(isEmptyRecord({ ...blank, type: '확인 요청' })).toBe(true);
  });
  it('하나라도 있으면 빈 기록이 아님', () => {
    expect(isEmptyRecord({ ...blank, title: 'x' })).toBe(false);
    expect(isEmptyRecord({ ...blank, related: '#1' })).toBe(false);
    expect(isEmptyRecord({ ...blank, memo: 'x' })).toBe(false);
    expect(isEmptyRecord({ ...blank, evidence: record.evidence.slice(0, 1) })).toBe(false);
  });
});
