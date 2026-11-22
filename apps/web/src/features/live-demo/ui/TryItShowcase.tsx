import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/kit/Badge';
import { TicketCard } from '@/shared/ui/kit/TicketCard';
import {
  CursorBoxIcon,
  NetworkIcon,
  RegionIcon,
  TextSelectIcon,
} from '@/shared/ui/kit/icon';

type CaptureModeId = 'element' | 'region' | 'text' | 'network';

interface ModePreset {
  id: CaptureModeId;
  label: string;
  shortcut: string;
  icon: typeof CursorBoxIcon;
  headline: string;
  badge: string;
  snippet: string;
}

const MODE_PRESETS: ModePreset[] = [
  {
    id: 'element',
    label: '요소 선택',
    shortcut: 'Alt+Shift+E',
    icon: CursorBoxIcon,
    headline: 'DOM 요소 + React 컴포넌트 소스 줄 번호까지 자동 추출',
    badge: '<strong> in SummaryCard (SummaryCard.tsx:48)',
    snippet: `kind: 요소
selector: "section.summary-grid > div:nth-child(3) > strong"
참조: <strong> in SummaryCard › BillingSummaryPage (src/SummaryCard.tsx:48)`,
  },
  {
    id: 'region',
    label: '영역 선택',
    shortcut: 'Alt+Shift+R',
    icon: RegionIcon,
    headline: '드래그 사각형 스크린샷 + 안쪽 요소·텍스트 목록 일괄 수집',
    badge: 'rect 744×44px · 스크린샷 assets/025.png',
    snippet: `kind: 영역
영역: x=48, y=380, 744×44 (viewport 기준)
영역 안 요소 3개: td.label · td.count · td.amount`,
  },
  {
    id: 'text',
    label: '텍스트 선택',
    shortcut: 'Alt+Shift+T',
    icon: TextSelectIcon,
    headline: '어색한 문구나 오탈자를 앞뒤 문맥과 함께 정확히 기록',
    badge: '선택 텍스트: "다운로드 중지됨"',
    snippet: `kind: 텍스트
선택한 텍스트: "다운로드 중지됨"
앞뒤 문맥: …상태: 【다운로드 중지됨】 · 다시 시도…`,
  },
  {
    id: 'network',
    label: 'API 선택',
    shortcut: 'Alt+Shift+N',
    icon: NetworkIcon,
    headline: '현재 경로·쿼리에서 발생한 API 응답을 민감 헤더 없이 첨부',
    badge: 'GET /api/v2/billing/summary → 200 · 84ms',
    snippet: `kind: 네트워크
1. GET /api/v2/billing/summary?month=2026-11 → 200 · 84ms · 1.8KB
   { "total": 48200000, "refundedVat": 12400 }`,
  },
];

type BundleOptionId = 'single' | 'cross' | 'archived';

const BUNDLE_OPTIONS: {
  id: BundleOptionId;
  label: string;
  desc: string;
  issueTitle: string;
  categories: string[];
  files: string[];
  statusText: string;
}[] = [
  {
    id: 'single',
    label: '개별 항목 보기 (#024)',
    desc: '사람이 "데이터 정합성"으로 담은 단일 티켓 상태',
    issueTitle: '대기 항목 #024 (묶기 전)',
    categories: ['데이터 정합성'],
    files: ['src/pages/billing/SummaryCard.tsx'],
    statusText: 'status: 대기 · 개별 확인 필요',
  },
  {
    id: 'cross',
    label: 'AI 교차 원인 묶음 (#024 + #025 + #026)',
    desc: '서로 다른 카테고리의 3건을 동일 VAT 반올림 원인으로 통합',
    issueTitle: 'ISSUE-104 · 정산 합계 반올림 및 환불 차감 기준 통일',
    categories: ['데이터 정합성', 'UI·UX 개선'],
    files: ['src/entities/billing/calcTotal.ts', 'src/pages/billing/BillingTable.tsx'],
    statusText: 'AI 분석 완료 · 3건 → 1개 이슈 통합',
  },
  {
    id: 'archived',
    label: '처리 후 자동 아카이빙 완료',
    desc: '에이전트가 status: 완료와 ## 처리 기록을 남기면 보관함 이동',
    issueTitle: 'ISSUE-104 · .pinproof/items/archive/ 이동됨',
    categories: ['데이터 정합성', 'UI·UX 개선'],
    files: ['src/entities/billing/calcTotal.ts', 'src/shared/api/billing.ts'],
    statusText: 'status: 완료 · 아카이브 스튜디오 집계 반영',
  },
];

export function TryItShowcase() {
  const [modeId, setModeId] = useState<CaptureModeId>('element');
  const [bundleId, setBundleId] = useState<BundleOptionId>('cross');

  const activeMode = MODE_PRESETS.find((m) => m.id === modeId) ?? MODE_PRESETS[0];
  const activeBundle = BUNDLE_OPTIONS.find((b) => b.id === bundleId) ?? BUNDLE_OPTIONS[1];

  return (
    <div className="flex flex-col gap-5">
      {/* 체험 카드 1: 4가지 수집 모드 */}
      <TicketCard className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="solid">직접 체험</Badge>
              <span className="text-xs text-ink-faint">수집 모드별 Markdown 증거</span>
            </div>
            <h3 className="text-lg font-bold text-ink">
              4가지 수집 모드를 직접 눌러 Markdown 증거를 확인해 보세요
            </h3>
          </div>
          <span className="font-mono text-xs text-ink-soft">{activeMode.shortcut}</span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* 좌측: 모드 선택 라디오 버튼 리스트 */}
          <div className="flex flex-col gap-2 lg:col-span-5">
            {MODE_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const selected = preset.id === modeId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setModeId(preset.id)}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-[2px] border px-3.5 py-3 text-left transition-colors cursor-pointer',
                    selected
                      ? 'border-ink bg-ink text-inverse'
                      : 'border-line bg-bg/70 text-ink hover:border-line-strong hover:bg-wash/60',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={15} />
                    <span className="text-sm font-semibold">{preset.label}</span>
                  </div>
                  <kbd
                    className={cn(
                      'rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px]',
                      selected
                        ? 'border-inverse/30 bg-inverse/10 text-inverse'
                        : 'border-line bg-surface text-ink-faint',
                    )}
                  >
                    {preset.shortcut}
                  </kbd>
                </button>
              );
            })}
          </div>

          {/* 우측: 실시간 전환 프리뷰 */}
          <div className="flex flex-col justify-between gap-3 rounded-[2px] border border-line-strong bg-bg p-4 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink">{activeMode.headline}</span>
              <Badge variant="outline">{activeMode.label}</Badge>
            </div>

            <div className="rounded-[2px] border border-dashed border-line-strong bg-surface px-3 py-2 font-mono text-[11px] text-ink">
              {activeMode.badge}
            </div>

            <pre className="overflow-x-auto whitespace-pre-wrap rounded-[2px] border border-line bg-surface/80 p-3 font-mono text-[11px] leading-relaxed text-ink-soft">
              {activeMode.snippet}
            </pre>
          </div>
        </div>
      </TicketCard>

      {/* 체험 카드 2: 사람 카테고리 -> AI 이슈 묶음 */}
      <TicketCard className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="solid">직접 체험</Badge>
              <span className="text-xs text-ink-faint">사람 카테고리에서 AI 이슈 묶음으로</span>
            </div>
            <h3 className="text-lg font-bold text-ink">
              사람이 나눠 담은 티켓이 AI 이슈 하나로 묶이는 과정
            </h3>
          </div>
          <Badge variant="outline">{activeBundle.statusText}</Badge>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="flex flex-col gap-2 lg:col-span-5">
            {BUNDLE_OPTIONS.map((opt) => {
              const selected = opt.id === bundleId;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBundleId(opt.id)}
                  className={cn(
                    'flex flex-col gap-1 rounded-[2px] border px-3.5 py-3 text-left transition-colors cursor-pointer',
                    selected
                      ? 'border-ink bg-ink text-inverse'
                      : 'border-line bg-bg/70 text-ink hover:border-line-strong hover:bg-wash/60',
                  )}
                >
                  <span className="text-xs font-bold">{opt.label}</span>
                  <span
                    className={cn(
                      'text-[11px] leading-snug',
                      selected ? 'text-inverse/80' : 'text-ink-soft',
                    )}
                  >
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-[2px] border border-line-strong bg-bg p-4 lg:col-span-7">
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-medium text-ink-faint">
                이슈 묶음 미리보기
              </div>
              <div className="text-base font-bold text-ink">{activeBundle.issueTitle}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-ink-faint">사람 카테고리:</span>
                {activeBundle.categories.map((c) => (
                  <Badge key={c} variant="wash">
                    {c}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="pinproof-ticket-divider flex flex-col gap-1.5 pt-3">
              <span className="text-[11px] text-ink-faint">연결된 소스 파일:</span>
              <div className="flex flex-wrap gap-1.5">
                {activeBundle.files.map((f) => (
                  <code
                    key={f}
                    className="rounded-[2px] border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-ink"
                  >
                    {f}
                  </code>
                ))}
              </div>
            </div>
          </div>
        </div>
      </TicketCard>
    </div>
  );
}
