import { useEffect, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  ArchiveDrawerProvider,
  useArchiveDrawer,
} from '@/app/layout/archive-drawer-context';
import { cn } from '@/shared/lib/cn';
import { themeLabel, type ThemePref } from '@/shared/lib/theme';
import { Button } from '@/shared/ui/kit/Button';
import {
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  PinIcon,
  SunIcon,
  XIcon,
} from '@/shared/ui/kit/icon';

export interface AppShellLayoutProps {
  children: ReactNode;
}

export function ThemeModeIcon({ pref, size = 14 }: { pref: ThemePref; size?: number }) {
  if (pref === 'light') return <SunIcon size={size} />;
  if (pref === 'dark') return <MoonIcon size={size} />;
  return <MonitorIcon size={size} />;
}

export function AppShellLayout({ children }: AppShellLayoutProps) {
  return (
    <ArchiveDrawerProvider>
      <AppShellInner>{children}</AppShellInner>
    </ArchiveDrawerProvider>
  );
}

function AppShellInner({ children }: AppShellLayoutProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { drawerOpen, toggleDrawer, setDrawerOpen, theme, cycleTheme } = useArchiveDrawer();

  const isArchive = pathname.startsWith('/archive');

  // 라우트 이동 시 모바일 Drawer 자동 닫기
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname, setDrawerOpen]);

  // 온보딩 페이지 모바일 Drawer 열림 시 Esc 닫기 및 배경 스크롤 잠금
  useEffect(() => {
    if (isArchive || !drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isArchive, drawerOpen, setDrawerOpen]);

  return (
    <div className="relative min-h-dvh bg-bg text-ink">
      {/* 불투명 매트 + 살아 움직이는 무채색 배경 그래픽 */}
      <div className="pinproof-ambient-canvas" aria-hidden="true">
        <div className="pinproof-orb-a" />
        <div className="pinproof-orb-b" />
        <div className="pinproof-orb-c" />
        <div className="pinproof-matte-veil" />
        <div className="pinproof-paper-grain" />
      </div>

      {/* 상단 고정 헤더 (모바일: 좌측 여백 축소 + 로고 교차 전환 / 데스크톱: 100% 너비 고정) */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/88 backdrop-blur-md">
        <div className="flex h-14 w-full items-center justify-between gap-4 pl-2 pr-4 lg:px-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                aria-label={drawerOpen ? '사이드바 닫기' : '사이드바 열기'}
                aria-expanded={drawerOpen}
                onClick={toggleDrawer}
                className="lg:hidden"
              >
                <MenuIcon size={17} />
              </Button>
              <Link
                to="/"
                className={cn(
                  'inline-flex items-center gap-2 text-base font-extrabold tracking-tight text-ink transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-80',
                  drawerOpen && 'lg:opacity-100 lg:translate-x-0 opacity-0 -translate-x-2 pointer-events-none lg:pointer-events-auto',
                )}
              >
                <span className="inline-flex size-6 items-center justify-center rounded-[2px] bg-ink text-inverse">
                  <PinIcon size={14} />
                </span>
                <span>Pinproof</span>
              </Link>
            </div>

            {/* 데스크톱 내비게이션 (모바일에서는 좌측 Drawer 내부로 이동) */}
            <nav aria-label="주요 메뉴" className="hidden items-center gap-1 lg:flex">
              <Link
                to="/"
                className={cn(
                  'rounded-[2px] px-3 py-1.5 text-xs font-medium transition-colors',
                  !isArchive
                    ? 'bg-ink text-inverse font-semibold'
                    : 'text-ink-soft hover:bg-wash hover:text-ink',
                )}
              >
                소개
              </Link>
              <Link
                to="/archive"
                className={cn(
                  'rounded-[2px] px-3 py-1.5 text-xs font-medium transition-colors',
                  isArchive
                    ? 'bg-ink text-inverse font-semibold'
                    : 'text-ink-soft hover:bg-wash hover:text-ink',
                )}
              >
                아카이브 스튜디오
              </Link>
            </nav>
          </div>

          {/* 데스크톱 테마 전환 버튼 (모바일에서는 좌측 Drawer 내부로 이동) */}
          <div className="hidden items-center gap-2 lg:flex">
            <Button
              size="sm"
              variant="ghost"
              onClick={cycleTheme}
              aria-label={`테마 변경 (현재: ${themeLabel(theme)})`}
            >
              <ThemeModeIcon pref={theme} size={14} />
              <span>{themeLabel(theme)}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* 온보딩 페이지 모바일 좌측 Drawer (헤더까지 덮으며 로고 교차 전환) */}
      {!isArchive && (
        <div
          aria-hidden={!drawerOpen}
          className={cn(
            'fixed inset-0 z-50 lg:hidden transition-opacity duration-250',
            drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <div
            className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal={drawerOpen}
            aria-label="모바일 내비게이션"
            className={cn(
              'relative flex h-full w-72 max-w-[82vw] flex-col justify-between overflow-y-auto border-r border-line-strong bg-surface shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
              drawerOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <div>
              {/* Drawer 상단 헤더 (메인 헤더와 높이 56px 일치, 로고 교차 전환) */}
              <div className="flex h-14 items-center justify-between border-b border-line px-4">
                <Link
                  to="/"
                  onClick={() => setDrawerOpen(false)}
                  className={cn(
                    'inline-flex items-center gap-2 text-base font-extrabold tracking-tight text-ink transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    drawerOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4',
                  )}
                >
                  <span className="inline-flex size-6 items-center justify-center rounded-[2px] bg-ink text-inverse">
                    <PinIcon size={14} />
                  </span>
                  <span>Pinproof</span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="사이드바 닫기"
                  onClick={() => setDrawerOpen(false)}
                >
                  <XIcon size={15} />
                </Button>
              </div>

              <div className="flex flex-col gap-1 p-4">
                <span className="mb-1 px-2 text-[11px] font-semibold text-ink-faint">이동</span>
                <Link
                  to="/"
                  onClick={() => setDrawerOpen(false)}
                  className={cn(
                    'rounded-[2px] px-2.5 py-2 text-xs font-medium transition-colors',
                    !isArchive
                      ? 'bg-ink text-inverse font-semibold'
                      : 'text-ink-soft hover:bg-wash hover:text-ink',
                  )}
                >
                  소개
                </Link>
                <Link
                  to="/archive"
                  onClick={() => setDrawerOpen(false)}
                  className={cn(
                    'rounded-[2px] px-2.5 py-2 text-xs font-medium transition-colors',
                    isArchive
                      ? 'bg-ink text-inverse font-semibold'
                      : 'text-ink-soft hover:bg-wash hover:text-ink',
                  )}
                >
                  아카이브 스튜디오
                </Link>
              </div>
            </div>

            <div className="border-t border-line p-4">
              <Button
                variant="default"
                size="sm"
                className="w-full justify-between"
                onClick={cycleTheme}
                aria-label={`테마 변경 (현재: ${themeLabel(theme)})`}
              >
                <span className="inline-flex items-center gap-2">
                  <ThemeModeIcon pref={theme} size={14} />
                  <span>테마</span>
                </span>
                <span className="font-mono text-[11px] text-ink-soft">{themeLabel(theme)}</span>
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* 본문 영역 */}
      <main
        className={cn(
          'relative z-10',
          isArchive
            ? 'w-full min-h-[calc(100dvh-3.5rem)]'
            : 'mx-auto max-w-6xl px-4 pt-0 pb-16 sm:px-6 sm:pb-24',
        )}
      >
        {children}
      </main>

      {/* 하단 푸터 (온보딩 페이지 전용, 아카이브 스튜디오는 100% 풀 높이 앱 셸 유지) */}
      {!isArchive && (
        <footer className="relative z-10 border-t border-line bg-bg/65 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-ink-faint sm:px-6">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">Pinproof</span>
              <span>·</span>
              <span>로컬 퍼스트 Chrome 확장프로그램 &amp; 아카이브 스튜디오</span>
            </div>
            <div className="font-mono text-[11px]">
              외부 서버 전송 없음 · .pinproof/ Markdown 기반
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
