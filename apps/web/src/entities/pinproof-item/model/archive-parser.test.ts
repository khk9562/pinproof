import { describe, expect, it } from 'vitest';
import { clusterItemsByIssue, parseItemDetail } from '@pinproof/shared';
import { createSampleProjects } from './sample-projects';

describe('archive item parser & issue clustering', () => {
  it('parses frontmatter, screenshot path, touched files, and issue reason from markdown', () => {
    const md = `---
id: 42
category: "데이터 정합성"
status: 완료
created: 2026-11-20T09:00:00Z
app: http://localhost:5173
env: local
kind: 요소
page: "/billing"
note: "합계 금액 불일치"
issue: "ISSUE-900 · 합계 반올림 통일"
issue_reason: "카드와 테이블이 서로 다른 반올림 함수를 호출"
---

# #042 · 데이터 정합성

## 요소 — /billing
- URL: http://localhost:5173/billing
- 참조: \`<strong> in SummaryCard (src/SummaryCard.tsx:12)\`
- selector: \`main > strong\`
- 스크린샷: ![042](assets/042.png)

## 처리 기록
- 요약: \`src/calc.ts\` 공통 함수로 통일`;

    const parsed = parseItemDetail(md, '042.md', true, 'proj-1', 'demo-app');
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe(42);
    expect(parsed?.archived).toBe(true);
    expect(parsed?.screenshotRelPath).toBe('assets/042.png');
    expect(parsed?.issueKey).toBe('ISSUE-900 · 합계 반올림 통일');
    expect(parsed?.issueReason).toContain('반올림');
    expect(parsed?.touchedFiles).toContain('src/calc.ts');
  });

  it('clusters sample items across human categories under a single AI issue', () => {
    const projects = createSampleProjects();
    const allItems = projects.flatMap((p) => p.items);
    const clusters = clusterItemsByIssue(allItems);

    const issue104 = clusters.find((c) => c.issueKey.includes('ISSUE-104'));
    expect(issue104).toBeDefined();
    expect(issue104?.items.length).toBe(3);
    expect(issue104?.humanCategories).toEqual(
      expect.arrayContaining(['데이터 정합성', 'UI·UX 개선']),
    );
    expect(issue104?.completionRate).toBe(100);
  });
});
