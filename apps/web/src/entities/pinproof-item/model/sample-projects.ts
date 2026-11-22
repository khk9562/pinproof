import { parseItemDetail, type ArchiveItemDetail, type ArchiveProject } from '@pinproof/shared';

function buildWireframeShot(
  title: string,
  badge: string,
  highlightLabel: string,
  metrics: [string, string, string],
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="480" viewBox="0 0 840 480">
    <rect width="840" height="480" fill="#121213"/>
    <rect x="24" y="24" width="792" height="432" rx="2" fill="#1a1a1c" stroke="#3a3a3d"/>
    <rect x="24" y="24" width="792" height="40" fill="#161618" stroke="#2d2d30"/>
    <circle cx="46" cy="44" r="5" fill="#4b4b50"/>
    <circle cx="64" cy="44" r="5" fill="#4b4b50"/>
    <circle cx="82" cy="44" r="5" fill="#4b4b50"/>
    <text x="110" y="49" fill="#b4b4b8" font-family="monospace" font-size="13">${title}</text>
    <rect x="650" y="34" width="144" height="20" rx="2" fill="#f0efeb"/>
    <text x="722" y="48" text-anchor="middle" fill="#111112" font-family="sans-serif" font-size="11" font-weight="700">${badge}</text>
    <rect x="48" y="88" width="224" height="86" rx="2" fill="#222225" stroke="#36363a"/>
    <text x="64" y="114" fill="#8f8f95" font-family="sans-serif" font-size="12">TOTAL</text>
    <text x="64" y="150" fill="#f0efeb" font-family="monospace" font-size="24" font-weight="700">${metrics[0]}</text>
    <rect x="292" y="88" width="224" height="86" rx="2" fill="#222225" stroke="#36363a"/>
    <text x="308" y="114" fill="#8f8f95" font-family="sans-serif" font-size="12">ACTIVE</text>
    <text x="308" y="150" fill="#f0efeb" font-family="monospace" font-size="24" font-weight="700">${metrics[1]}</text>
    <rect x="536" y="88" width="256" height="86" rx="2" fill="#222225" stroke="#f0efeb" stroke-width="2" stroke-dasharray="6 4"/>
    <text x="552" y="114" fill="#f0efeb" font-family="sans-serif" font-size="12">${highlightLabel}</text>
    <text x="552" y="150" fill="#f0efeb" font-family="monospace" font-size="24" font-weight="700">${metrics[2]}</text>
    <rect x="530" y="68" width="26" height="20" rx="2" fill="#f0efeb"/>
    <text x="543" y="82" text-anchor="middle" fill="#111112" font-family="monospace" font-size="11" font-weight="700">PIN</text>
    <rect x="48" y="198" width="744" height="232" rx="2" fill="#161618" stroke="#2d2d30"/>
    <line x1="48" y1="238" x2="792" y2="238" stroke="#2d2d30"/>
    <line x1="48" y1="286" x2="792" y2="286" stroke="#262629"/>
    <line x1="48" y1="334" x2="792" y2="334" stroke="#262629"/>
    <line x1="48" y1="382" x2="792" y2="382" stroke="#262629"/>
    <text x="68" y="223" fill="#8f8f95" font-family="monospace" font-size="12">ROW / COMPONENT / PAYLOAD</text>
    <text x="68" y="268" fill="#d8d7d3" font-family="monospace" font-size="13">01  SummaryHeader.tsx:142   status=200  mismatch detected</text>
    <text x="68" y="316" fill="#d8d7d3" font-family="monospace" font-size="13">02  BillingTable.tsx:88     rows=24     sum delta -12,400</text>
    <text x="68" y="364" fill="#d8d7d3" font-family="monospace" font-size="13">03  FilterToolbar.tsx:51    overflow    mobile 375px clip</text>
    <text x="68" y="412" fill="#8f8f95" font-family="monospace" font-size="12">Captured locally by PinProof Chrome Extension</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface RawSample {
  projectId: string;
  projectName: string;
  fileName: string;
  archived: boolean;
  md: string;
  shot?: string;
}

const RAW_SAMPLES: RawSample[] = [
  {
    projectId: 'sample-billing-console',
    projectName: 'billing-console',
    fileName: '024.md',
    archived: true,
    shot: buildWireframeShot(
      'localhost:5173/billing/summary',
      '#024 데이터 정합성',
      '월별 합계 불일치',
      ['₩48,200,000', '24건', '₩48,187,600'],
    ),
    md: `---
id: 24
category: "데이터 정합성"
status: 완료
sent: 2026-11-18T09:12:00Z
created: 2026-11-18T09:05:00Z
app: http://localhost:5173
env: local
kind: 요소
page: "/billing/summary?month=2026-11"
note: "상단 총합 카드 금액이 하단 테이블 합계와 12,400원 차이남"
issue: "ISSUE-104 · 정산 합계 반올림 및 환불 차감 기준 통일"
issue_reason: "상단 요약 카드(#024), 테이블 합계(#025), API 응답 필드(#026)가 모두 동일한 VAT 반올림 누락에서 발생해 하나의 이슈로 묶어 일괄 수정"
---

# #024 · 데이터 정합성

## 요소 — /billing/summary?month=2026-11
- URL: http://localhost:5173/billing/summary?month=2026-11
- 메모: 상단 총합 카드 금액이 하단 테이블 합계와 12,400원 차이남
- 참조: \`<strong> in SummaryCard › BillingSummaryPage (src/pages/billing/SummaryCard.tsx:48)\`
- selector: \`section.summary-grid > div:nth-child(3) > strong\`
- 텍스트: "₩48,187,600"
- 화면 폭: 1440px
- 스크린샷: ![024](assets/024.png)

## 처리 기록
- 이슈: ISSUE-104 · 정산 합계 반올림 및 환불 차감 기준 통일
- 묶음 기준: 상단 요약 카드(#024), 테이블 합계(#025), API 응답 필드(#026)가 모두 동일한 VAT 반올림 누락에서 발생해 하나의 이슈로 묶어 일괄 수정
- 요약: \`src/entities/billing/calcTotal.ts\`에서 환불 건 VAT 반올림 순서를 서버 정산 로직과 일치시킴
- 수정 파일: \`src/entities/billing/calcTotal.ts\`, \`src/pages/billing/SummaryCard.tsx\``,
  },
  {
    projectId: 'sample-billing-console',
    projectName: 'billing-console',
    fileName: '025.md',
    archived: true,
    shot: buildWireframeShot(
      'localhost:5173/billing/summary',
      '#025 UI·UX 개선',
      '테이블 합계 행 정렬',
      ['24 rows', 'VAT 포함', '₩48,200,000'],
    ),
    md: `---
id: 25
category: "UI·UX 개선"
status: 완료
sent: 2026-11-18T09:12:00Z
created: 2026-11-18T09:07:00Z
app: http://localhost:5173
env: local
kind: 영역
page: "/billing/summary?month=2026-11"
note: "합계 행 숫자가 tabular-nums가 아니라 자릿수 정렬이 어긋나고 금액도 카드와 다름"
issue: "ISSUE-104 · 정산 합계 반올림 및 환불 차감 기준 통일"
issue_reason: "사람은 UI·UX 개선으로 분류했으나 금액 불일치 원인이 #024와 동일해 한 이슈에서 정렬+계산 동시 해결"
---

# #025 · UI·UX 개선

## 영역 — /billing/summary?month=2026-11
- URL: http://localhost:5173/billing/summary?month=2026-11
- 메모: 합계 행 숫자가 tabular-nums가 아니라 자릿수 정렬이 어긋나고 금액도 카드와 다름
- 참조: \`<tfoot> in BillingTable (src/pages/billing/BillingTable.tsx:112)\`
- selector: \`table.billing-table > tfoot\`
- 영역: x=48, y=380, 744×44 (viewport 기준)
- 화면 폭: 1440px
- 스크린샷: ![025](assets/025.png)

## 처리 기록
- 이슈: ISSUE-104 · 정산 합계 반올림 및 환불 차감 기준 통일
- 요약: \`src/pages/billing/BillingTable.tsx\` 합계 셀에 \`tabular-nums\` 적용 및 공통 \`calcTotal\` 연결`,
  },
  {
    projectId: 'sample-billing-console',
    projectName: 'billing-console',
    fileName: '026.md',
    archived: true,
    md: `---
id: 26
category: "데이터 정합성"
status: 완료
sent: 2026-11-18T09:12:00Z
created: 2026-11-18T09:09:00Z
app: http://localhost:5173
env: local
kind: 네트워크
page: "/billing/summary?month=2026-11"
note: "GET /api/v2/billing/summary 응답의 refundedVat 필드가 프론트에서 누락됨"
issue: "ISSUE-104 · 정산 합계 반올림 및 환불 차감 기준 통일"
---

# #026 · 데이터 정합성

## 네트워크 — /billing/summary?month=2026-11
- URL: http://localhost:5173/billing/summary?month=2026-11
- 메모: GET /api/v2/billing/summary 응답의 refundedVat 필드가 프론트에서 누락됨
- 호출 2건 (요청 헤더·쿠키는 기록하지 않음, 응답은 앞부분만)

1. \`GET /api/v2/billing/summary?month=2026-11\` → 200 · 84ms · 1.8KB

## 처리 기록
- 이슈: ISSUE-104 · 정산 합계 반올림 및 환불 차감 기준 통일
- 요약: \`src/shared/api/billing.ts\` 응답 매퍼에 \`refundedVat\` 반영`,
  },
  {
    projectId: 'sample-billing-console',
    projectName: 'billing-console',
    fileName: '027.md',
    archived: false,
    shot: buildWireframeShot(
      'localhost:5173/billing/invoices',
      '#027 버그',
      '모바일 필터 툴바 잘림',
      ['375px', 'overflow-x', 'clip'],
    ),
    md: `---
id: 27
category: "버그"
status: 대기
sent: 2026-11-19T14:20:00Z
created: 2026-11-19T14:15:00Z
app: http://localhost:5173
env: local
kind: 영역
page: "/billing/invoices"
note: "모바일 폭에서 상태 필터 칩과 CSV 내보내기 버튼이 겹쳐서 클릭이 안 됨"
issue: "ISSUE-108 · 모바일 툴바 줄바꿈 및 터치 영역 개선"
issue_reason: "모바일 375px 뷰포트에서 툴바 레이아웃 깨짐 관련 항목(#027, #028)"
---

# #027 · 버그

## 영역 — /billing/invoices
- URL: http://localhost:5173/billing/invoices
- 메모: 모바일 폭에서 상태 필터 칩과 CSV 내보내기 버튼이 겹쳐서 클릭이 안 됨
- 참조: \`<div> in InvoiceToolbar (src/pages/billing/InvoiceToolbar.tsx:29)\`
- selector: \`header.invoice-toolbar\`
- 화면 폭: 375px
- 스크린샷: ![027](assets/027.png)`,
  },
  {
    projectId: 'sample-billing-console',
    projectName: 'billing-console',
    fileName: '028.md',
    archived: false,
    md: `---
id: 28
category: "UI·UX 개선"
status: 대기
created: 2026-11-19T14:18:00Z
app: http://localhost:5173
env: local
kind: 텍스트
page: "/billing/invoices"
note: "'다운로드 중지됨' 문구가 실제 동작과 다름 -> '내보내기 취소됨'으로 통일 필요"
issue: "ISSUE-108 · 모바일 툴바 줄바꿈 및 터치 영역 개선"
---

# #028 · UI·UX 개선

## 텍스트 — /billing/invoices
- URL: http://localhost:5173/billing/invoices
- 메모: '다운로드 중지됨' 문구가 실제 동작과 다름 -> '내보내기 취소됨'으로 통일 필요
- 선택한 텍스트: "다운로드 중지됨"
- 화면 폭: 375px`,
  },
  {
    projectId: 'sample-design-studio',
    projectName: 'design-studio-web',
    fileName: '011.md',
    archived: true,
    shot: buildWireframeShot(
      'localhost:3000/canvas/layers',
      '#011 UI·UX 개선',
      '레이어 드래그 고스트 잔상',
      ['60fps', 'dnd-kit', 'fixed'],
    ),
    md: `---
id: 11
category: "UI·UX 개선"
status: 완료
sent: 2026-11-15T11:30:00Z
created: 2026-11-15T11:22:00Z
app: http://localhost:3000
env: local
kind: 요소
page: "/canvas/layers"
note: "레이어 순서를 빠르게 드래그할 때 테두리 하이라이트가 이전 행에 남음"
issue: "ISSUE-201 · 레이어 트리 포인터 상태 초기화 누락"
issue_reason: "드래그 종료 시 hover/dropTarget 상태가 남는 문제(#011, #012)를 동일 상태 머신에서 수정"
---

# #011 · UI·UX 개선

## 요소 — /canvas/layers
- URL: http://localhost:3000/canvas/layers
- 메모: 레이어 순서를 빠르게 드래그할 때 테두리 하이라이트가 이전 행에 남음
- 참조: \`<li> in LayerRow › LayerTree (src/features/layers/LayerRow.tsx:74)\`
- selector: \`ul.layer-tree > li[data-layer-id="hero"]\`
- 화면 폭: 1512px
- 스크린샷: ![011](assets/011.png)

## 처리 기록
- 이슈: ISSUE-201 · 레이어 트리 포인터 상태 초기화 누락
- 요약: \`src/features/layers/useLayerDnd.ts\`의 \`onDragCancel\`·\`onDragEnd\`에서 \`overId\` 명시 초기화`,
  },
  {
    projectId: 'sample-design-studio',
    projectName: 'design-studio-web',
    fileName: '012.md',
    archived: true,
    md: `---
id: 12
category: "버그"
status: 완료
sent: 2026-11-15T11:30:00Z
created: 2026-11-15T11:26:00Z
app: http://localhost:3000
env: local
kind: 요소
page: "/canvas/layers"
note: "ESC로 드래그 취소 시 선택된 레이어 포커스가 사라짐"
issue: "ISSUE-201 · 레이어 트리 포인터 상태 초기화 누락"
---

# #012 · 버그

## 요소 — /canvas/layers
- URL: http://localhost:3000/canvas/layers
- 메모: ESC로 드래그 취소 시 선택된 레이어 포커스가 사라짐
- 참조: \`<button> in LayerRow (src/features/layers/LayerRow.tsx:91)\`
- 화면 폭: 1512px

## 처리 기록
- 이슈: ISSUE-201 · 레이어 트리 포인터 상태 초기화 누락
- 요약: \`src/features/layers/useLayerDnd.ts\` 취소 후 원래 트리 항목으로 포커스 복귀`,
  },
  {
    projectId: 'sample-design-studio',
    projectName: 'design-studio-web',
    fileName: '013.md',
    archived: true,
    md: `---
id: 13
category: "UI·UX 개선"
status: 완료
sent: 2026-11-16T16:40:00Z
created: 2026-11-16T16:32:00Z
app: http://localhost:3000
env: local
kind: 텍스트
page: "/canvas/export"
note: "SVG 내보내기 옵션 설명 문구가 2배수 PNG 기준으로 잘못 적혀 있음"
issue: "ISSUE-205 · 내보내기 모달 카피 및 단축키 안내 정리"
issue_reason: "내보내기 패널 내 카피 오류(#013)와 단축키 오표기(#014)를 한 번에 정리"
---

# #013 · UI·UX 개선

## 텍스트 — /canvas/export
- URL: http://localhost:3000/canvas/export
- 메모: SVG 내보내기 옵션 설명 문구가 2배수 PNG 기준으로 잘못 적혀 있음
- 선택한 텍스트: "2x 해상도로 저장됩니다"
- 화면 폭: 1512px

## 처리 기록
- 이슈: ISSUE-205 · 내보내기 모달 카피 및 단축키 안내 정리
- 요약: \`src/features/export/ExportDialog.tsx\` 포맷별 설명 분기 수정`,
  },
  {
    projectId: 'sample-ops-portal',
    projectName: 'ops-portal',
    fileName: '005.md',
    archived: true,
    shot: buildWireframeShot(
      '192.168.0.92:20100/nodes',
      '#005 배포 확인',
      '노드 상태 폴링 지연',
      ['18 nodes', '502 retry', '3.2s'],
    ),
    md: `---
id: 5
category: "성능·네트워크"
status: 완료
sent: 2026-11-17T18:00:00Z
created: 2026-11-17T17:51:00Z
app: http://192.168.0.92:20100
env: deployed
kind: 네트워크
page: "/nodes?cluster=prod-kr"
note: "탭 전환 시 이전 클러스터 폴링 요청이 취소되지 않고 늦게 도착해 목록을 덮어씀"
issue: "ISSUE-302 · 클러스터 전환 시 AbortController 누락"
issue_reason: "네트워크 레이스 컨디션(#005)으로 인해 배지 상태 오표시(#006)까지 유발되어 하나로 통합 처리"
---

# #005 · 성능·네트워크

## 네트워크 — /nodes?cluster=prod-kr
- URL: http://192.168.0.92:20100/nodes?cluster=prod-kr
- 메모: 탭 전환 시 이전 클러스터 폴링 요청이 취소되지 않고 늦게 도착해 목록을 덮어씀
- 호출 3건 (요청 헤더·쿠키는 기록하지 않음, 응답은 앞부분만)

1. \`GET /api/clusters/prod-kr/nodes\` → 200 · 3210ms · 14.2KB
- 스크린샷: ![005](assets/005.png)

## 처리 기록
- 이슈: ISSUE-302 · 클러스터 전환 시 AbortController 누락
- 요약: \`src/entities/node/api/nodeQueries.ts\`에 \`signal\` 전달 및 쿼리 키 정규화`,
  },
  {
    projectId: 'sample-ops-portal',
    projectName: 'ops-portal',
    fileName: '006.md',
    archived: false,
    md: `---
id: 6
category: "데이터 정합성"
status: 대기
created: 2026-11-19T10:05:00Z
app: http://192.168.0.92:20100
env: deployed
kind: 요소
page: "/nodes?cluster=prod-kr"
note: "오프라인 노드가 0대인데 헤더 배지에는 '주의 1'이 계속 표시됨"
issue: "ISSUE-302 · 클러스터 전환 시 AbortController 누락"
---

# #006 · 데이터 정합성

## 요소 — /nodes?cluster=prod-kr
- URL: http://192.168.0.92:20100/nodes?cluster=prod-kr
- 메모: 오프라인 노드가 0대인데 헤더 배지에는 '주의 1'이 계속 표시됨
- selector: \`header.cluster-header .alert-badge\`
- 화면 폭: 1280px`,
  },
];

export function createSampleProjects(): ArchiveProject[] {
  const map = new Map<string, ArchiveProject>();

  for (const raw of RAW_SAMPLES) {
    const parsed = parseItemDetail(
      raw.md,
      raw.fileName,
      raw.archived,
      raw.projectId,
      raw.projectName,
    );
    if (!parsed) continue;
    const item: ArchiveItemDetail = {
      ...parsed,
      screenshotUrl: raw.shot,
    };

    let proj = map.get(raw.projectId);
    if (!proj) {
      proj = {
        id: raw.projectId,
        name: raw.projectName,
        source: 'sample',
        categories: ['미분류'],
        items: [],
        lastLoadedAt: Date.now(),
      };
      map.set(raw.projectId, proj);
    }
    if (!proj.categories.includes(item.category)) {
      proj.categories.push(item.category);
    }
    proj.items.push(item);
  }

  return [...map.values()].map((p) => ({
    ...p,
    items: p.items.sort((a, b) => b.id - a.id),
  }));
}
