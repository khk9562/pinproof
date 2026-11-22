import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { HeroPinnedCards } from '@/features/live-demo/ui/HeroPinnedCards';
import { LiveCaptureDemo } from '@/features/live-demo/ui/LiveCaptureDemo';
import { OnboardingFaq } from '@/features/live-demo/ui/OnboardingFaq';
import { TryItShowcase } from '@/features/live-demo/ui/TryItShowcase';
import { Button } from '@/shared/ui/kit/Button';
import { Reveal } from '@/shared/ui/kit/Reveal';
import { TicketCard } from '@/shared/ui/kit/TicketCard';
import {
  ArchiveIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  PinIcon,
} from '@/shared/ui/kit/icon';

export const Route = createFileRoute('/')({
  component: OnboardingPage,
});

const CLI_COMMAND = '/pinproof 데이터 정합성';

const TIMELINE_STEPS = [
  {
    no: '01',
    title: '카테고리를 만들고 화면의 디테일을 꽂아둡니다',
    desc: 'AI 에이전트가 놓친 UI·UX 디테일, 데이터 정합성, 버그를 요소·영역·텍스트·API 단위로 빠르게 선택해 카테고리별로 모읍니다.',
    meta: 'Alt+Shift+E / R / T / N · .pinproof/items/NNN.md',
  },
  {
    no: '02',
    title: '프롬프트 한 번으로 넘기고, AI가 이슈로 묶어 처리합니다',
    desc: '건건이 채팅하지 마세요. 카테고리째 프롬프트를 복사해 넘기면 에이전트가 공통 원인 기준으로 여러 티켓을 한 이슈로 묶어 수정하고 ## 처리 기록을 남깁니다.',
    meta: '/pinproof [카테고리] · sent 자동 추적',
  },
  {
    no: '03',
    title: '완료 확인 후 넓은 아카이브 스튜디오에서 탐색·정리합니다',
    desc: '처리 완료된 티켓은 자동 보관되며, 아카이브 스튜디오에서 프로젝트별 카테고리 비중, AI 이슈 묶음 기준, 스크린샷을 한눈에 보고 보관·삭제를 관리합니다.',
    meta: '.pinproof/items/archive/ · 로컬 폴더 직접 관리',
  },
];

function TicketDivider() {
  return <div className="pinproof-ticket-divider" aria-hidden="true" />;
}

function CommandCopyBar() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CLI_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-[2px] border border-line-strong bg-surface/92 px-3 py-1.5 shadow-sm backdrop-blur-sm">
      <span className="font-mono text-xs text-ink-faint">$</span>
      <code className="truncate font-mono text-xs font-semibold text-ink">{CLI_COMMAND}</code>
      <span className="hidden text-xs text-ink-faint sm:inline">· 카테고리째 한 번에 전달</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? '복사됨' : '커맨드 복사'}
        className="ml-1 inline-flex items-center gap-1 rounded-[2px] border border-line bg-bg px-2 py-0.5 text-[11px] text-ink hover:border-ink cursor-pointer"
      >
        {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
        <span>{copied ? '복사됨' : '복사'}</span>
      </button>
    </div>
  );
}

function OnboardingPage() {
  return (
    <div className="flex flex-col gap-28 sm:gap-40">
      {/* 1. Hero + 다음 섹션(라이브 데모) 첫 화면 Peek 프레이밍 */}
      <div className="flex flex-col">
        {/* Hero 섹션: 화면 높이의 약 85% 영역에 헤더와 함께 자리잡고, 하단에 다음 섹션 상단이 살짝 보임 */}
        <section className="relative flex min-h-[calc(86dvh-3.5rem)] flex-col items-center justify-center py-10 text-center">
          {/* 핀에 꽂혀 둥둥 떠다니는 스켈레톤 카드 4장 + 곡선 점선 */}
          <HeroPinnedCards />

          {/* 중앙 Hero 스택 (순차 블러-리프트 등장) */}
          <div className="relative z-10 flex max-w-2xl flex-col items-center gap-6">
            <div
              className="pinproof-hero-stagger inline-flex items-center gap-2 rounded-[2px] border border-line bg-surface/90 px-3 py-1 text-xs text-ink-soft"
              style={{ animationDelay: '0ms' }}
            >
              <span>로컬 퍼스트 Chrome 확장프로그램</span>
              <span className="text-ink-faint">·</span>
              <span className="font-semibold text-ink">AI 에이전트 협업 티켓</span>
            </div>

            <h1
              className="pinproof-hero-stagger text-6xl font-extrabold tracking-tighter text-ink sm:text-8xl leading-[0.94]"
              style={{ animationDelay: '90ms' }}
            >
              Pinproof
            </h1>

            <p
              className="pinproof-hero-stagger max-w-xl text-xl font-bold leading-snug tracking-tight text-ink sm:text-2xl"
              style={{ animationDelay: '180ms' }}
            >
              AI 에이전트가 놓친 화면의 디테일들을
              <br className="hidden sm:inline" /> 한 번에 짚어내고, 이슈로 묶어 아카이빙하세요.
            </p>

            {/* 듀얼 CTA */}
            <div
              className="pinproof-hero-stagger mt-1 flex flex-wrap items-center justify-center gap-3"
              style={{ animationDelay: '260ms' }}
            >
              <Link to="/archive">
                <Button variant="solid" size="lg">
                  <ArchiveIcon size={16} />
                  <span>아카이브 스튜디오 열기</span>
                  <ArrowRightIcon size={15} />
                </Button>
              </Link>
              <a href="#live-demo">
                <Button variant="default" size="lg">
                  <PinIcon size={15} />
                  <span>라이브 데모 보기</span>
                </Button>
              </a>
            </div>

            {/* 원클릭 CLI 커맨드 바 */}
            <div className="pinproof-hero-stagger mt-1" style={{ animationDelay: '340ms' }}>
              <CommandCopyBar />
            </div>
          </div>
        </section>

        {/* 2. 라이브 인터랙션 데모 섹션 (3D 원근 리프트 등장) */}
        <section id="live-demo" className="flex flex-col gap-6 scroll-mt-20 pt-2 pb-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              선택에서 AI 이슈 처리·아카이빙까지, 실제 동작 흐름
            </h2>
            <p className="text-xs text-ink-soft">
              이 영역에 들어오면 자동으로 시작됩니다. 마우스를 올리면 잠시 멈추며 단계 탭으로 직접 이동할 수 있습니다.
            </p>
          </div>

          <Reveal variant="perspective-lift">
            <LiveCaptureDemo />
          </Reveal>
        </section>
      </div>

      <TicketDivider />

      {/* 3. 3단계 수직 점선 타임라인 (좌/우 교차 슬라이드인 등장) */}
      <section className="flex flex-col gap-10 py-6 sm:py-10">
        <Reveal variant="cascade-drop" className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            건건이 설명하지 마세요. 3단계로 묶어서 끝냅니다.
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-ink-soft sm:text-sm">
            사람이 화면에서 빠르게 핀을 꽂아두면, AI 에이전트가 코드를 추적해 이슈 단위로 묶어
            해결합니다.
          </p>
        </Reveal>

        <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-6">
          {/* 수직 점선 커넥터 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-8 bottom-8 left-6 hidden border-l border-dashed border-line-strong sm:block"
          />

          {TIMELINE_STEPS.map((step, idx) => (
            <Reveal
              key={step.no}
              variant={idx % 2 === 0 ? 'slide-left' : 'slide-right'}
              delayMs={idx * 110}
              className="relative flex items-start gap-4 sm:gap-6"
            >
              <div className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-[2px] border border-ink bg-ink font-mono text-sm font-extrabold text-inverse shadow-sm">
                {step.no}
              </div>
              <TicketCard className="flex-1 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-ink sm:text-lg">{step.title}</h3>
                  <span className="font-mono text-[10px] text-ink-faint">{step.meta}</span>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-ink-soft sm:text-sm">
                  {step.desc}
                </p>
              </TicketCard>
            </Reveal>
          ))}
        </div>
      </section>

      <TicketDivider />

      {/* 4. 직접 체험 가능한 인터랙티브 기능 카드 (티켓 절취선 언폴드 등장) */}
      <section className="flex flex-col gap-10 py-6 sm:py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            단순 캡처가 아닌, AI 에이전트를 위한 증거 툴셋
          </h2>
          <p className="max-w-3xl text-xs leading-relaxed text-ink-soft sm:text-sm">
            아래 항목을 직접 눌러 Pinproof가 수집하는 Markdown 증거 형식과 AI 이슈 묶음 구조를
            확인해 보세요.
          </p>
        </div>

        <Reveal variant="clip-unfold">
          <TryItShowcase />
        </Reveal>
      </section>

      <TicketDivider />

      {/* 5. FAQ 아코디언 (위에서 아래로 순차 드롭 등장) */}
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-6 sm:py-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            자주 묻는 질문
          </h2>
        </div>

        <Reveal variant="cascade-drop">
          <OnboardingFaq />
        </Reveal>
      </section>

      {/* 6. Footer CTA (탄성 스프링 팝 등장) */}
      <section className="py-6 sm:py-10">
        <Reveal variant="spring-pop">
          <TicketCard
            elevated
            className="flex flex-col items-center gap-6 px-6 py-12 text-center sm:px-10 sm:py-14"
          >
            <h2 className="max-w-2xl text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              사이드 패널에 쌓인 .pinproof/ 기록,
              <br />
              이제 넓은 아카이브 스튜디오에서 관리하세요
            </h2>
            <p className="max-w-2xl text-xs leading-relaxed text-ink-soft sm:text-sm [text-wrap:balance]">
              외부 서버 전송 없이 로컬 폴더를 연결해 프로젝트별 카테고리 비중 차트, AI 이슈 묶음 기준,
              스크린샷 미리보기, 일괄 보관·삭제까지 한 번에 처리할 수 있습니다.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/archive">
                <Button variant="solid" size="lg">
                  <ArchiveIcon size={16} />
                  <span>아카이브 스튜디오 시작하기</span>
                  <ArrowRightIcon size={15} />
                </Button>
              </Link>
            </div>
            <CommandCopyBar />
          </TicketCard>
        </Reveal>
      </section>
    </div>
  );
}
