import { useEffect, useState, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { cn } from '@/shared/lib/cn';
import {
  applyThemePref,
  nextThemePref,
  readThemePref,
  themeLabel,
  type ThemePref,
} from '@/shared/lib/theme';
import { Button } from '@/shared/ui/kit/Button';
import { ArchiveIcon, PinIcon, SunMoonIcon } from '@/shared/ui/kit/icon';

export interface AppShellLayoutProps {
  children: ReactNode;
}

export function AppShellLayout({ children }: AppShellLayoutProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [theme, setTheme] = useState<ThemePref>(() => readThemePref());

  useEffect(() => {
    applyThemePref(theme);
  }, [theme]);

  const isArchive = pathname.startsWith('/archive');

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

      {/* 상단 고정 헤더 */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/78 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-base font-extrabold tracking-tight text-ink hover:opacity-80"
            >
              <span className="inline-flex size-6 items-center justify-center rounded-[2px] bg-ink text-inverse">
                <PinIcon size={14} />
              </span>
              <span>Pinproof</span>
            </Link>

            <nav aria-label="주요 메뉴" className="flex items-center gap-1">
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
                  'inline-flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-xs font-medium transition-colors',
                  isArchive
                    ? 'bg-ink text-inverse font-semibold'
                    : 'text-ink-soft hover:bg-wash hover:text-ink',
                )}
              >
                <ArchiveIcon size={13} />
                <span>아카이브 스튜디오</span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setTheme((prev) => nextThemePref(prev))}
              aria-label={`테마 변경 (현재: ${themeLabel(theme)})`}
            >
              <SunMoonIcon size={14} />
              <span className="hidden sm:inline">{themeLabel(theme)}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* 본문 영역 */}
      <main
        className={cn(
          'relative z-10 mx-auto max-w-6xl px-4 sm:px-6',
          isArchive ? 'py-8 sm:py-12' : 'pt-0 pb-16 sm:pb-24',
        )}
      >
        {children}
      </main>

      {/* 하단 푸터 */}
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
    </div>
  );
}
