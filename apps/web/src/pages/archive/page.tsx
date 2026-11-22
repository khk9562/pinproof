import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { EvidenceKind } from '@pinproof/shared';
import { ThemeModeIcon } from '@/app/layout/AppShellLayout';
import { useArchiveDrawer } from '@/app/layout/archive-drawer-context';
import { useArchiveProjects } from '@/entities/pinproof-item/model/use-archive-store';
import { ArchiveAnalyticsPanel } from '@/features/archive-analytics/ui/ArchiveAnalyticsPanel';
import {
  ArchiveExplorer,
  itemCompositeKey,
} from '@/features/archive-explorer/ui/ArchiveExplorer';
import { ProjectDropdown } from '@/features/archive-explorer/ui/ProjectDropdown';
import { cn } from '@/shared/lib/cn';
import { themeLabel } from '@/shared/lib/theme';
import { Badge } from '@/shared/ui/kit/Badge';
import { Button } from '@/shared/ui/kit/Button';
import { TicketCard } from '@/shared/ui/kit/TicketCard';
import {
  ArchiveIcon,
  ChartBarIcon,
  FolderPlusIcon,
  PinIcon,
  RefreshIcon,
  XIcon,
} from '@/shared/ui/kit/icon';

export const Route = createFileRoute('/archive/')({
  component: ArchiveStudioPage,
});

type StudioView = 'analytics' | 'explorer';

function ArchiveStudioPage() {
  const {
    projects,
    isLoading,
    hasConnectedFs,
    showSample,
    setShowSample,
    permissionNeeded,
    statusMessage,
    supportsFs,
    connectFolder,
    grantStoredPermission,
    disconnectProject,
    setItemsArchived,
    deleteItems,
    refresh,
  } = useArchiveProjects();

  const [view, setView] = useState<StudioView>('analytics');
  const { drawerOpen, setDrawerOpen, theme, cycleTheme } = useArchiveDrawer();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [issueFilter, setIssueFilter] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<EvidenceKind | null>(null);

  // 모바일 Drawer 열림 시 Esc 닫기 및 배경 스크롤 잠금
  useEffect(() => {
    if (!drawerOpen) return;
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
  }, [drawerOpen]);

  const scopedProjects = useMemo(() => {
    if (selectedProjectId === 'all') return projects;
    const found = projects.filter((p) => p.id === selectedProjectId);
    return found.length > 0 ? found : projects;
  }, [projects, selectedProjectId]);

  const allItems = useMemo(
    () =>
      scopedProjects
        .flatMap((p) => p.items)
        .sort((a, b) => (b.created || '').localeCompare(a.created || '') || b.id - a.id),
    [scopedProjects],
  );

  const archivedCount = useMemo(
    () => allItems.filter((i) => i.archived).length,
    [allItems],
  );
  const pendingCount = allItems.length - archivedCount;
  const isEmpty = !isLoading && projects.length === 0;

  const activeProjectName =
    selectedProjectId === 'all'
      ? '모든 프로젝트'
      : projects.find((p) => p.id === selectedProjectId)?.name ?? '모든 프로젝트';

  const selectView = (next: StudioView) => {
    setView(next);
    setDrawerOpen(false);
  };

  const sampleToggleAction = (
    <div className="flex items-center gap-2">
      {hasConnectedFs && (
        <button
          type="button"
          onClick={refresh}
          aria-label="새로 읽기"
          title="새로 읽기"
          className="inline-flex items-center text-ink-faint transition-colors hover:text-ink cursor-pointer"
        >
          <RefreshIcon size={12} />
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setSelectedProjectId('all');
          setShowSample((v) => !v);
          setDrawerOpen(false);
        }}
        className="text-[11px] font-normal text-ink-faint transition-colors hover:text-ink cursor-pointer"
      >
        {showSample ? '샘플 닫기' : '샘플 보기'}
      </button>
    </div>
  );

  const sidebarContent = (
    <>
      <div className="flex flex-col gap-5">
        {/* 1. 프로젝트 선택 & 폴더 연결 영역 */}
        <div className="flex flex-col gap-2.5">
          {projects.length > 0 ? (
            <ProjectDropdown
              fullWidth
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProjectId={setSelectedProjectId}
              onConnectFolder={connectFolder}
              onDisconnectProject={disconnectProject}
              supportsFs={supportsFs}
              labelRight={sampleToggleAction}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink-soft">프로젝트</span>
                {sampleToggleAction}
              </div>
              <div className="rounded-[2px] border border-dashed border-line bg-bg/60 px-3 py-2 text-xs text-ink-faint">
                연결된 폴더 없음
              </div>
            </div>
          )}

          {/* 연결된 로컬 폴더가 하나도 없을 때만 연결 버튼 표시 */}
          {!hasConnectedFs && (
            <Button
              variant="solid"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setDrawerOpen(false);
                connectFolder();
              }}
              disabled={!supportsFs}
            >
              <FolderPlusIcon size={14} />
              <span>프로젝트 폴더 연결</span>
            </Button>
          )}
        </div>

        <div className="pinproof-ticket-divider" />

        {/* 2. 대시보드 / 목록 메뉴 */}
        <nav aria-label="보기 메뉴" className="flex flex-col gap-1">
          <span className="mb-1 px-2 text-[11px] font-semibold text-ink-faint">메뉴</span>

          <button
            type="button"
            onClick={() => selectView('analytics')}
            className={cn(
              'flex w-full items-center justify-between rounded-[2px] px-2.5 py-2 text-left text-xs transition-colors cursor-pointer',
              view === 'analytics'
                ? 'bg-ink text-inverse font-semibold'
                : 'text-ink-soft hover:bg-wash hover:text-ink',
            )}
          >
            <span className="inline-flex items-center gap-2">
              <ChartBarIcon size={14} />
              <span>대시보드</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => selectView('explorer')}
            className={cn(
              'flex w-full items-center justify-between rounded-[2px] px-2.5 py-2 text-left text-xs transition-colors cursor-pointer',
              view === 'explorer'
                ? 'bg-ink text-inverse font-semibold'
                : 'text-ink-soft hover:bg-wash hover:text-ink',
            )}
          >
            <span className="inline-flex items-center gap-2">
              <ArchiveIcon size={14} />
              <span>목록</span>
            </span>
            <span
              className={cn(
                'rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                view === 'explorer'
                  ? 'bg-inverse/15 text-inverse'
                  : 'bg-wash text-ink-soft',
              )}
            >
              {allItems.length}
            </span>
          </button>
        </nav>
      </div>

      {/* 3. 사이드바 하단 고정 상태 요약 */}
      <div className="mt-6 flex flex-col gap-2 border-t border-dashed border-line pt-4 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-ink-faint">연결 상태</span>
          {hasConnectedFs ? (
            <Badge variant="solid">로컬 연결</Badge>
          ) : showSample ? (
            <Badge variant="outline">샘플 체험</Badge>
          ) : (
            <Badge variant="outline">미연결</Badge>
          )}
        </div>
        <div className="flex items-center justify-between text-[11px] text-ink-soft">
          <span>대기 / 보관</span>
          <span className="font-mono tabular-nums text-ink">
            {pendingCount} / {archivedCount}
          </span>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] w-full flex-col lg:flex-row">
      {/* 데스크톱 고정 풀-높이 사이드바 */}
      <aside
        aria-label="아카이브 스튜디오 메뉴"
        className="hidden shrink-0 flex-col justify-between border-r border-line bg-surface/88 p-5 backdrop-blur-md lg:sticky lg:top-14 lg:flex lg:h-[calc(100dvh-3.5rem)] lg:w-64 lg:overflow-y-auto"
      >
        {sidebarContent}
      </aside>

      {/* 모바일 좌측 슬라이드 Drawer (헤더까지 덮으며 로고 교차 전환) */}
      <div
        aria-hidden={!drawerOpen}
        className={cn(
          'fixed inset-0 z-50 lg:hidden transition-opacity duration-250',
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {/* 배경 딤 */}
        <div
          className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />

        {/* 좌측 슬라이드 패널 */}
        <aside
          role="dialog"
          aria-modal={drawerOpen}
          aria-label="아카이브 스튜디오 사이드바"
          className={cn(
            'relative flex h-full w-72 max-w-[82vw] flex-col overflow-y-auto border-r border-line-strong bg-surface shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {/* Drawer 상단 헤더 (메인 헤더와 높이 56px 일치, 로고 교차 전환) */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
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

          <div className="flex flex-1 flex-col justify-between p-4">
            <div className="flex flex-col gap-5">
              {/* 모바일 글로벌 페이지 이동 */}
              <div className="flex flex-col gap-1">
                <span className="mb-1 px-2 text-[11px] font-semibold text-ink-faint">이동</span>
                <Link
                  to="/"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-[2px] px-2.5 py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-wash hover:text-ink"
                >
                  소개
                </Link>
                <Link
                  to="/archive"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-[2px] bg-wash-strong px-2.5 py-2 text-xs font-semibold text-ink"
                >
                  아카이브 스튜디오
                </Link>
              </div>

              <div className="pinproof-ticket-divider" />

              {sidebarContent}
            </div>

            {/* 모바일 테마 전환 버튼 */}
            <div className="mt-4 border-t border-line pt-4">
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
          </div>
        </aside>
      </div>

      {/* 우측 메인 워크스페이스 (내부 콘텐츠만 max-w로 정돈) */}
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          {/* 콘텐츠 헤더 */}
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-xs text-ink-faint">
                <span>아카이브 스튜디오</span>
                <span>/</span>
                <span className="font-mono text-ink-soft">{activeProjectName}</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-ink">
                {view === 'analytics' ? '대시보드' : '티켓 목록'}
              </h1>
            </div>
            <p className="text-xs text-ink-soft">
              {view === 'analytics'
                ? '프로젝트별 카테고리 비중, 수집 유형별 사용 추이, AI 이슈 묶음 기준을 확인합니다.'
                : '티켓을 검색·필터링하고 스크린샷 확인, 보관 처리, 삭제를 직접 관리합니다.'}
            </p>
          </div>

          {/* 상태 알림 토스트 배너 */}
          {statusMessage && (
            <div
              role="status"
              className="rounded-[2px] border border-ink bg-ink px-4 py-2.5 text-xs font-medium text-inverse"
            >
              {statusMessage}
            </div>
          )}

          {/* 권한 재요청 배너 (이전에 연결했던 로컬 폴더) */}
          {permissionNeeded.length > 0 && (
            <TicketCard className="flex flex-wrap items-center justify-between gap-3 border-line-strong p-4">
              <div className="text-xs text-ink">
                이전에 연결했던 로컬 폴더의 읽기/쓰기 권한을 다시 허용하면 기록이 바로 열립니다.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {permissionNeeded.map((entry) => (
                  <Button
                    key={entry.id}
                    size="sm"
                    variant="solid"
                    onClick={() => grantStoredPermission(entry)}
                  >
                    {entry.name} 권한 허용
                  </Button>
                ))}
              </div>
            </TicketCard>
          )}

          {/* 메인 뷰 */}
          {isLoading ? (
            <TicketCard className="p-10 text-center text-sm text-ink-soft">
              프로젝트의 .pinproof/ 기록을 불러오는 중입니다…
            </TicketCard>
          ) : isEmpty ? (
            <TicketCard className="flex min-h-[420px] flex-col items-center justify-center gap-5 px-6 py-16 text-center">
              <div className="flex flex-col items-center gap-2">
                <h2 className="text-lg font-bold text-ink">연결된 프로젝트 폴더가 없습니다</h2>
                <p className="max-w-md text-xs leading-relaxed text-ink-soft sm:text-sm">
                  왼쪽 사이드바나 아래 버튼에서 로컬 프로젝트 폴더(.pinproof/)를 연결하면 대시보드 차트와 티켓 목록을 바로 관리할 수 있습니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <Button variant="solid" size="lg" onClick={connectFolder} disabled={!supportsFs}>
                  <FolderPlusIcon size={15} />
                  <span>프로젝트 폴더(.pinproof) 연결</span>
                </Button>
                <Button variant="default" size="lg" onClick={() => setShowSample(true)}>
                  <span>샘플 데이터 보기</span>
                </Button>
              </div>
            </TicketCard>
          ) : view === 'analytics' ? (
            <ArchiveAnalyticsPanel
              projects={scopedProjects}
              items={allItems}
              onSelectIssue={(issueKey) => {
                setIssueFilter(issueKey);
                setKindFilter(null);
                setView('explorer');
              }}
              onSelectItem={(item) => {
                setSelectedItemKey(itemCompositeKey(item));
                setView('explorer');
              }}
              onSelectKind={(kind) => {
                setKindFilter(kind);
                setIssueFilter(null);
                setView('explorer');
              }}
            />
          ) : (
            <ArchiveExplorer
              projects={scopedProjects}
              items={allItems}
              selectedItemKey={selectedItemKey}
              onSelectItemKey={setSelectedItemKey}
              issueFilter={issueFilter}
              onClearIssueFilter={() => setIssueFilter(null)}
              kindFilter={kindFilter}
              onClearKindFilter={() => setKindFilter(null)}
              onArchiveItems={setItemsArchived}
              onDeleteItems={deleteItems}
            />
          )}
        </div>
      </div>
    </div>
  );
}
