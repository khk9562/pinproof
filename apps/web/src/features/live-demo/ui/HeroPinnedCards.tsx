import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/cn';

interface PinnedCardData {
  tag: string;
  label: string;
  title: string;
  detail: string;
  meta: string;
  revealDelayMs: number;
  floatClass: string;
  positionClass: string;
}

const PINNED_CARDS: PinnedCardData[] = [
  {
    tag: '#01',
    label: '요소 캡처',
    title: '총합이 12,400원 비어요',
    detail: 'AI는 맞다는데 계산기 두드리니 틀림',
    meta: 'SummaryCard.tsx:48',
    revealDelayMs: 900,
    floatClass: 'pinproof-float-a',
    positionClass: 'top-5 left-1',
  },
  {
    tag: '#02',
    label: '영역 · 스크린샷',
    title: '모바일에서 버튼이 도망감',
    detail: '375px에서 CSV 버튼이 화면 밖으로 탈출',
    meta: 'FilterBar.tsx:29 · 375px',
    revealDelayMs: 1450,
    floatClass: 'pinproof-float-c',
    positionClass: 'bottom-20 left-12',
  },
  {
    tag: 'ISSUE-104',
    label: 'AI 이슈 묶음',
    title: '알고 보니 다 같은 범인',
    detail: 'VAT 반올림 누락 한 줄로 3건 동시 해결',
    meta: '3건 → 1개 이슈 통합',
    revealDelayMs: 1200,
    floatClass: 'pinproof-float-b',
    positionClass: 'top-20 right-4',
  },
  {
    tag: '#04',
    label: 'API 응답',
    title: '200 OK인데 데이터는 텅 빔',
    detail: 'refundedVat 필드만 쏙 빠져서 내려옴',
    meta: 'GET /billing/summary · 200',
    revealDelayMs: 1750,
    floatClass: 'pinproof-float-d',
    positionClass: 'bottom-6 right-0',
  },
];

function PushPin() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2"
    >
      <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
        {/* 핀 그림자 */}
        <ellipse cx="11.5" cy="18.5" rx="4.5" ry="1.8" fill="rgb(var(--ink-rgb) / 0.2)" />
        {/* 핀 침 */}
        <path d="M10 12.5V18" stroke="var(--color-ink)" strokeWidth="1.6" strokeLinecap="round" />
        {/* 핀 몸통 */}
        <circle cx="10" cy="8.5" r="5" fill="var(--color-ink)" />
        {/* 핀 상단 하이라이트 */}
        <circle cx="8.4" cy="7" r="1.5" fill="rgb(var(--paper-rgb) / 0.45)" />
      </svg>
    </span>
  );
}

function PinnedRevealCard({ card }: { card: PinnedCardData }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoaded(true), card.revealDelayMs);
    return () => window.clearTimeout(timer);
  }, [card.revealDelayMs]);

  return (
    <div
      className={cn(
        'relative w-48 rounded-[2px] border border-line-strong bg-surface/94 p-3.5 pt-4 text-left shadow-[0_18px_36px_-20px_rgb(16_21_29/0.32)] backdrop-blur-md',
        card.floatClass,
      )}
    >
      <PushPin />

      <div className="flex items-center justify-between gap-2">
        <span className="rounded-[2px] bg-ink px-1.5 py-0.5 font-mono text-[9px] font-bold text-inverse">
          {card.tag}
        </span>
        <span className="text-[10px] font-medium text-ink-faint">{card.label}</span>
      </div>

      {/* 스켈레톤 로딩 -> 실제 위트 있는 예시 텍스트로 부드럽게 전환 */}
      <div className="relative mt-2.5 min-h-[62px]">
        <div
          className={cn(
            'flex flex-col gap-1.5 transition-all duration-400',
            loaded ? 'pointer-events-none opacity-0 scale-95' : 'opacity-100',
          )}
        >
          <div className="pinproof-skeleton h-3.5 w-5/6 rounded-[1px]" />
          <div className="pinproof-skeleton h-2.5 w-full rounded-[1px]" />
          <div className="pinproof-skeleton h-2.5 w-2/3 rounded-[1px]" />
        </div>

        <div
          className={cn(
            'absolute inset-0 flex flex-col justify-center gap-1 transition-all duration-500 ease-out',
            loaded ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-1.5',
          )}
        >
          <div className="text-[12px] font-bold leading-snug text-ink">{card.title}</div>
          <div className="text-[10.5px] leading-snug text-ink-soft">{card.detail}</div>
        </div>
      </div>

      <div className="mt-2 truncate border-t border-dashed border-line pt-1.5 font-mono text-[9px] text-ink-faint">
        {card.meta}
      </div>
    </div>
  );
}

export function HeroPinnedCards() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden xl:block">
      {/* 좌측 비대칭 카드 2장을 잇는 곡선 점선 */}
      <svg
        className="absolute top-12 left-16 h-[420px] w-44 opacity-50"
        viewBox="0 0 180 420"
        fill="none"
      >
        <path
          d="M 42 40 C 122 124, 34 218, 98 318"
          stroke="var(--color-line-strong)"
          strokeWidth="1.25"
          strokeDasharray="4 5"
        />
      </svg>

      {/* 우측 비대칭 카드 2장을 잇는 곡선 점선 */}
      <svg
        className="absolute top-20 right-14 h-[420px] w-44 opacity-50"
        viewBox="0 0 180 420"
        fill="none"
      >
        <path
          d="M 102 48 C 22 146, 152 246, 118 354"
          stroke="var(--color-line-strong)"
          strokeWidth="1.25"
          strokeDasharray="4 5"
        />
      </svg>

      {PINNED_CARDS.map((card) => (
        <div key={card.tag} className={cn('absolute', card.positionClass)}>
          <PinnedRevealCard card={card} />
        </div>
      ))}
    </div>
  );
}
