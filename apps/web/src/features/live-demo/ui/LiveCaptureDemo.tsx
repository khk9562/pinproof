import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/kit/Badge';
import { Button } from '@/shared/ui/kit/Button';
import {
  ArchiveIcon,
  CheckIcon,
  CursorBoxIcon,
  NetworkIcon,
  PauseIcon,
  PinIcon,
  PlayIcon,
  RegionIcon,
  TextSelectIcon,
} from '@/shared/ui/kit/icon';

interface DemoStep {
  id: 'element' | 'region' | 'text' | 'network' | 'archive';
  label: string;
  shortLabel: string;
  startMs: number;
  endMs: number;
  category: string;
  markerNo: string;
  memo: string;
  codeRef: string;
  calloutTag: string;
  cursorPos: { x: string; y: string };
}

const TOTAL_MS = 13800;

const STEPS: DemoStep[] = [
  {
    id: 'element',
    label: '요소 선택',
    shortLabel: '요소',
    startMs: 0,
    endMs: 2700,
    category: '데이터 정합성',
    markerNo: '01',
    memo: '상단 총합 금액이 하단 테이블 합계와 12,400원 차이남',
    codeRef: '<strong> in SummaryCard (SummaryCard.tsx:48)',
    calloutTag: '</> SummaryCard.tsx:48 · @1440w',
    cursorPos: { x: '78%', y: '18%' },
  },
  {
    id: 'region',
    label: '영역 선택',
    shortLabel: '영역',
    startMs: 2700,
    endMs: 5400,
    category: 'UI·UX 개선',
    markerNo: '02',
    memo: '합계 행 자릿수 정렬 어긋남 + 영역 스크린샷 첨부',
    codeRef: '<tfoot> in BillingTable (BillingTable.tsx:112)',
    calloutTag: '▭ 744×44px · 스크린샷 자동 캡처',
    cursorPos: { x: '42%', y: '62%' },
  },
  {
    id: 'text',
    label: '텍스트 선택',
    shortLabel: '텍스트',
    startMs: 5400,
    endMs: 8000,
    category: 'UI·UX 개선',
    markerNo: '03',
    memo: '"다운로드 중지됨" → "내보내기 취소됨" 문구 통일',
    codeRef: '선택 텍스트: "다운로드 중지됨"',
    calloutTag: 'T "다운로드 중지됨" · 문맥 포함',
    cursorPos: { x: '84%', y: '37%' },
  },
  {
    id: 'network',
    label: 'API 선택',
    shortLabel: '네트워크',
    startMs: 8000,
    endMs: 10600,
    category: '데이터 정합성',
    markerNo: '04',
    memo: 'refundedVat 필드가 응답에 있으나 프론트 계산에서 누락',
    codeRef: 'GET /api/v2/billing/summary → 200 · 84ms',
    calloutTag: 'API 200 · refundedVat 누락',
    cursorPos: { x: '48%', y: '78%' },
  },
  {
    id: 'archive',
    label: 'AI 이슈 묶음 · 보관',
    shortLabel: '아카이빙',
    startMs: 10600,
    endMs: TOTAL_MS,
    category: 'ISSUE-104 통합 완료',
    markerNo: '✓',
    memo: 'AI 에이전트가 4건 중 공통 원인 3건을 한 이슈로 묶어 수정 후 자동 보관',
    codeRef: 'status: 완료 → .pinproof/items/archive/',
    calloutTag: '✓ ISSUE-104 묶음 처리 · 보관 완료',
    cursorPos: { x: '86%', y: '86%' },
  },
];

const AGENTS = ['Claude Code', 'Antigravity', 'Cursor', 'Codex'] as const;

function stepIndexFor(ms: number): number {
  const idx = STEPS.findIndex((s) => ms >= s.startMs && ms < s.endMs);
  return idx === -1 ? STEPS.length - 1 : idx;
}

export function LiveCaptureDemo() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);

  // 사용자가 라이브 데모 섹션에 들어왔을 때부터 애니메이션 시작
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setInView(Boolean(entry?.isIntersecting));
      },
      { threshold: 0.25 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !inView || hoverPaused) return;
    let rafId = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      setElapsedMs((prev) => (prev + delta) % TOTAL_MS);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, inView, hoverPaused]);

  const activeIdx = stepIndexFor(elapsedMs);
  const activeStep = STEPS[activeIdx];
  const progressPct = Math.min(100, (elapsedMs / TOTAL_MS) * 100);
  const isArchivedStage = activeStep.id === 'archive';

  const jumpToStep = (idx: number) => {
    setPlaying(false);
    setElapsedMs(STEPS[idx].startMs + 60);
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      className="rounded-[2px] border border-line-strong bg-surface/95 shadow-[0_32px_90px_-34px_rgb(0_0_0/0.62)] backdrop-blur-md"
    >
      {/* 상단 크롬 바 + 재생 컨트롤 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full border border-line-strong bg-wash-strong" />
            <span className="size-2.5 rounded-full border border-line-strong bg-wash-strong" />
            <span className="size-2.5 rounded-full border border-line-strong bg-wash-strong" />
          </div>
          <div className="flex items-center gap-2 rounded-[2px] border border-line bg-bg px-2.5 py-0.5 font-mono text-[11px] text-ink-soft">
            <span>localhost:5173/billing/summary</span>
            <span className="text-ink-faint">·</span>
            <span className="font-semibold text-ink">Pinproof 실행 중</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="hidden text-xs text-ink-faint sm:inline">
            {!inView
              ? '화면 진입 대기'
              : hoverPaused && playing
                ? '마우스 올림 · 일시정지'
                : '자동 재생 중'}
          </span>
          <span className="font-mono text-xs tabular-nums text-ink-soft">
            단계 {activeIdx + 1} / {STEPS.length}
          </span>
          <Button
            size="sm"
            variant="default"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? '라이브 데모 일시정지' : '라이브 데모 재생'}
          >
            {playing ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
            <span>{playing ? '일시정지' : '재생'}</span>
          </Button>
        </div>
      </div>

      {/* 전체 진행 바 */}
      <div className="h-1 w-full bg-wash">
        <div
          className="h-full bg-ink transition-[width] duration-100"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* 단계 인디케이터 탭 */}
      <div className="grid grid-cols-5 border-b border-line bg-bg/60">
        {STEPS.map((step, idx) => {
          const isActive = idx === activeIdx;
          const isPast = idx < activeIdx;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => jumpToStep(idx)}
              className={cn(
                'flex items-center justify-center gap-1.5 border-r border-line px-2 py-2 text-xs transition-colors last:border-r-0 cursor-pointer',
                isActive
                  ? 'bg-ink text-inverse font-semibold'
                  : isPast
                    ? 'bg-wash text-ink'
                    : 'text-ink-soft hover:bg-wash/60 hover:text-ink',
              )}
            >
              <span className="font-mono text-[10px] opacity-75">0{idx + 1}</span>
              <span className="truncate">{step.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* 메인 시뮬레이션 영역: 좌측 브라우저 뷰포트(8) + 우측 Pinproof 사이드 패널(4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* 좌측: 실제 웹 앱 화면 + 움직이는 커서 & 고대비 말풍선 */}
        <div className="relative flex flex-col justify-between gap-4 overflow-hidden border-b border-line bg-bg/75 p-4 sm:p-5 lg:col-span-8 lg:border-r lg:border-b-0">
          {/* 라이브 커서 + 고대비 말풍선 오버레이 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-20 hidden transition-all duration-500 ease-out sm:block"
            style={{
              left: activeStep.cursorPos.x,
              top: activeStep.cursorPos.y,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              className="-translate-x-1 -translate-y-1 drop-shadow-md"
            >
              <path
                d="M4 3l7.2 17 2.6-6.2L20 11.2 4 3z"
                fill="var(--color-ink)"
                stroke="var(--color-bg)"
                strokeWidth="1.6"
              />
            </svg>
            <div className="mt-1 -translate-x-1/2 whitespace-nowrap rounded-[2px] border border-bg bg-ink px-2 py-1 font-mono text-[10px] font-semibold text-inverse shadow-lg">
              {activeStep.calloutTag}
            </div>
          </div>

          {/* 상단 카드 3개 (Step 1: 요소 선택 타겟) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-[2px] border border-line bg-surface p-3">
              <div className="text-[11px] text-ink-faint">정산 건수</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums">24건</div>
            </div>

            <div className="rounded-[2px] border border-line bg-surface p-3">
              <div className="text-[11px] text-ink-faint">환불 차감</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums">-₩12,400</div>
            </div>

            <div
              className={cn(
                'relative rounded-[2px] border bg-surface p-3 transition-all duration-300',
                activeStep.id === 'element'
                  ? 'border-ink ring-2 ring-ink ring-offset-2 ring-offset-bg'
                  : 'border-line',
              )}
            >
              {activeIdx >= 0 && (
                <span
                  className={cn(
                    'absolute -top-2.5 -left-2 z-10 inline-flex items-center gap-1 rounded-[2px] border border-bg px-1.5 py-0.5 font-mono text-[10px] font-bold shadow-sm transition-transform duration-300',
                    isArchivedStage
                      ? 'bg-wash-strong text-ink-soft line-through'
                      : 'bg-ink text-inverse',
                    activeStep.id === 'element' && 'scale-110',
                  )}
                >
                  01
                </span>
              )}
              <div className="text-[11px] text-ink-faint">이번 달 총합</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums">₩48,187,600</div>
              <div className="mt-1 font-mono text-[10px] text-ink-faint">
                &lt;strong&gt; SummaryCard.tsx:48
              </div>
            </div>
          </div>

          {/* 중단 테이블 (Step 2: 영역 선택 타겟 + Step 3: 텍스트 선택 타겟) */}
          <div className="rounded-[2px] border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs">
              <span className="font-semibold">정산 내역 테이블</span>
              <span
                className={cn(
                  'relative rounded-[2px] px-1.5 py-0.5 text-[11px] transition-colors duration-300',
                  activeStep.id === 'text'
                    ? 'bg-ink text-inverse font-semibold'
                    : 'bg-wash text-ink-soft',
                )}
              >
                {activeIdx >= 2 && (
                  <span
                    className={cn(
                      'absolute -top-3 -right-2 rounded-[2px] border border-bg px-1 font-mono text-[9px] font-bold',
                      isArchivedStage ? 'bg-wash-strong text-ink-soft' : 'bg-ink text-inverse',
                    )}
                  >
                    03
                  </span>
                )}
                다운로드 중지됨
              </span>
            </div>

            <div className="divide-y divide-line font-mono text-xs">
              <div className="flex items-center justify-between px-3 py-2 text-ink-soft">
                <span>#INV-2026-1101</span>
                <span className="tabular-nums">₩24,100,000</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 text-ink-soft">
                <span>#INV-2026-1102</span>
                <span className="tabular-nums">₩24,100,000</span>
              </div>
              <div
                className={cn(
                  'relative flex items-center justify-between px-3 py-2.5 font-semibold transition-all duration-300',
                  activeStep.id === 'region'
                    ? 'bg-wash-strong outline-2 outline-dashed outline-ink -outline-offset-2'
                    : 'bg-wash/40',
                )}
              >
                {activeIdx >= 1 && (
                  <span
                    className={cn(
                      'absolute -top-2.5 left-2 rounded-[2px] border border-bg px-1.5 py-0.5 font-mono text-[10px] font-bold',
                      isArchivedStage ? 'bg-wash-strong text-ink-soft' : 'bg-ink text-inverse',
                    )}
                  >
                    02
                  </span>
                )}
                <span>테이블 합계 (24건)</span>
                <span className="tabular-nums">₩48,200,000</span>
              </div>
            </div>
          </div>

          {/* 하단: API 네트워크 캡처 띠 + 플로팅 툴바 */}
          <div className="flex flex-col gap-3">
            <div
              className={cn(
                'relative flex items-center justify-between rounded-[2px] border px-3 py-2 font-mono text-[11px] transition-all duration-300',
                activeStep.id === 'network'
                  ? 'border-ink bg-ink text-inverse'
                  : 'border-line bg-surface text-ink-soft',
              )}
            >
              {activeIdx >= 3 && (
                <span
                  className={cn(
                    'absolute -top-2.5 left-2 rounded-[2px] border border-bg px-1.5 py-0.5 font-mono text-[10px] font-bold',
                    isArchivedStage ? 'bg-wash-strong text-ink-soft' : 'bg-ink text-inverse',
                  )}
                >
                  04
                </span>
              )}
              <div className="flex items-center gap-2 truncate pl-6">
                <NetworkIcon size={13} />
                <span className="truncate">GET /api/v2/billing/summary?month=2026-11</span>
              </div>
              <span className="shrink-0 tabular-nums">200 · 84ms · 1.8KB</span>
            </div>

            {/* 실제 PinProof 플로팅 툴바 재현 */}
            <div className="mx-auto flex flex-wrap items-center justify-center gap-1 rounded-[2px] border border-line-strong bg-surface px-2 py-1.5 shadow-md">
              <span className="mr-1 inline-flex items-center gap-1 px-1.5 text-xs font-bold">
                <PinIcon size={13} className="pinproof-pin-pulse" />
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-[2px] px-2 py-1 text-[11px]',
                  activeStep.id === 'element' ? 'bg-ink text-inverse font-semibold' : 'text-ink-soft',
                )}
              >
                <CursorBoxIcon size={12} /> 요소
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-[2px] px-2 py-1 text-[11px]',
                  activeStep.id === 'region' ? 'bg-ink text-inverse font-semibold' : 'text-ink-soft',
                )}
              >
                <RegionIcon size={12} /> 영역
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-[2px] px-2 py-1 text-[11px]',
                  activeStep.id === 'text' ? 'bg-ink text-inverse font-semibold' : 'text-ink-soft',
                )}
              >
                <TextSelectIcon size={12} /> 텍스트
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-[2px] px-2 py-1 text-[11px]',
                  activeStep.id === 'network' ? 'bg-ink text-inverse font-semibold' : 'text-ink-soft',
                )}
              >
                <NetworkIcon size={12} /> API
              </span>
              <span className="ml-1 border-l border-line pl-2 font-mono text-[10px] text-ink-soft">
                {activeStep.category}
              </span>
            </div>
          </div>
        </div>

        {/* 우측: Pinproof 사이드 패널 + AI 에이전트 연동 상태 */}
        <div className="flex flex-col justify-between gap-3 bg-surface p-4 lg:col-span-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div className="flex items-center gap-1.5">
                <PinIcon size={14} />
                <span className="text-xs font-bold tracking-tight">Pinproof 패널</span>
              </div>
              <Badge variant={isArchivedStage ? 'solid' : 'outline'}>
                {isArchivedStage ? '보관 완료' : `대기 ${Math.min(activeIdx + 1, 4)}건`}
              </Badge>
            </div>

            {/* 현재 단계 고대비 팝오버 카드 */}
            <div className="rounded-[2px] border border-line-strong bg-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-ink">{activeStep.label}</span>
                <Badge variant="wash">{activeStep.category}</Badge>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink">{activeStep.memo}</p>
              <p className="mt-2 truncate font-mono text-[10px] text-ink-faint">
                {activeStep.codeRef}
              </p>
            </div>

            {/* 누적 티켓 목록 */}
            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] font-semibold text-ink-faint">
                수집된 티켓 ({Math.min(activeIdx + 1, 4)}/4)
              </div>
              {STEPS.slice(0, 4).map((item, idx) => {
                const visible = idx <= activeIdx;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-[2px] border px-2.5 py-1.5 text-xs transition-all duration-300',
                      !visible && 'opacity-25 border-dashed border-line',
                      visible && !isArchivedStage && 'border-line bg-bg/70 text-ink',
                      visible && isArchivedStage && 'border-line-strong bg-wash text-ink-soft',
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono text-[10px] font-bold">#{item.markerNo}</span>
                      <span className="truncate">{item.shortLabel}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                      {isArchivedStage ? (
                        <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
                          <CheckIcon size={11} /> 보관됨
                        </span>
                      ) : (
                        item.category
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 하단 AI 에이전트 2x2 그리드 + 프롬프트 전송 바 */}
          <div className="pinproof-ticket-divider flex flex-col gap-2 pt-3">
            <div className="grid grid-cols-2 gap-1.5">
              {AGENTS.map((agent, idx) => (
                <div
                  key={agent}
                  className={cn(
                    'flex items-center justify-between rounded-[2px] border px-2 py-1 font-mono text-[10px]',
                    idx === 0 && isArchivedStage
                      ? 'border-ink bg-ink text-inverse font-semibold'
                      : 'border-line bg-bg/70 text-ink-soft',
                  )}
                >
                  <span>{agent}</span>
                  {idx === 0 && isArchivedStage && <CheckIcon size={10} />}
                </div>
              ))}
            </div>

            <div
              className={cn(
                'flex items-center justify-between rounded-[2px] border px-3 py-2 text-xs transition-colors',
                isArchivedStage
                  ? 'border-ink bg-ink text-inverse font-semibold'
                  : 'border-line bg-wash text-ink-soft',
              )}
            >
              <span className="inline-flex items-center gap-1.5 truncate font-mono text-[11px]">
                <ArchiveIcon size={13} />
                {isArchivedStage
                  ? '/pinproof 데이터 정합성 → 완료'
                  : '/pinproof 데이터 정합성 대기 중'}
              </span>
              <span className="shrink-0 text-[10px]">
                {isArchivedStage ? '완료' : '대기'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
