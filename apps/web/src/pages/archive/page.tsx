import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useArchiveProjects } from '@/entities/pinproof-item/model/use-archive-store';
import { ArchiveAnalyticsPanel } from '@/features/archive-analytics/ui/ArchiveAnalyticsPanel';
import {
  ArchiveExplorer,
  itemCompositeKey,
} from '@/features/archive-explorer/ui/ArchiveExplorer';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/kit/Badge';
import { Button } from '@/shared/ui/kit/Button';
import { TicketCard } from '@/shared/ui/kit/TicketCard';
import {
  ArchiveIcon,
  ChartBarIcon,
  FolderPlusIcon,
  RefreshIcon,
  XIcon,
} from '@/shared/ui/kit/icon';

export const Route = createFileRoute('/archive/')({
  component: ArchiveStudioPage,
});

type StudioView = 'both' | 'analytics' | 'explorer';

function ArchiveStudioPage() {
  const {
    projects,
    isLoading,
    hasConnectedFs,
    usingSample,
    showSampleWhenConnected,
    setShowSampleWhenConnected,
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

  const [view, setView] = useState<StudioView>('both');
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [issueFilter, setIssueFilter] = useState<string | null>(null);

  const allItems = useMemo(
    () =>
      projects
        .flatMap((p) => p.items)
        .sort((a, b) => (b.created || '').localeCompare(a.created || '') || b.id - a.id),
    [projects],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* 상단 페이지 헤더 + 로컬 폴더 연결 툴바 */}
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={hasConnectedFs ? 'solid' : 'outline'}>
              {hasConnectedFs ? '로컬 .pinproof 연결됨' : '샘플 데이터 체험 모드'}
            </Badge>
            <span className="font-mono text-[11px] text-ink-faint">
              프로젝트 {projects.length}개 · 전체 {allItems.length}건
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            아카이브 스튜디오
          </h1>
          <p className="text-xs leading-relaxed text-ink-soft sm:text-sm">
            프로젝트별 카테고리 비중과 AI 이슈 묶음 기준을 차트로 분석하고, 넓은 화면에서 스크린샷 확인·보관·삭제를 직접 관리합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="solid" onClick={connectFolder} disabled={!supportsFs}>
            <FolderPlusIcon size={15} />
            <span>프로젝트 폴더(.pinproof) 연결</span>
          </Button>
          {hasConnectedFs && (
            <Button variant="default" onClick={refresh} aria-label="새로고침">
              <RefreshIcon size={14} />
              <span>새로 읽기</span>
            </Button>
          )}
        </div>
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
              <Button key={entry.id} size="sm" variant="solid" onClick={() => grantStoredPermission(entry)}>
                {entry.name} 권한 허용
              </Button>
            ))}
          </div>
        </TicketCard>
      )}

      {/* 연결된 프로젝트 칩 바 + 뷰 전환 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {projects.map((proj) => (
            <span
              key={proj.id}
              className="inline-flex items-center gap-1.5 rounded-[2px] border border-line bg-surface px-2.5 py-1 text-xs"
            >
              <span className="font-mono font-semibold text-ink">{proj.name}</span>
              <span className="font-mono text-[10px] text-ink-faint">
                {proj.items.length}
              </span>
              {proj.source === 'sample' && <Badge variant="wash">샘플</Badge>}
              {proj.source === 'fs' && (
                <button
                  type="button"
                  aria-label={`${proj.name} 연결 해제`}
                  onClick={() => disconnectProject(proj.id)}
                  className="ml-0.5 text-ink-faint hover:text-ink cursor-pointer"
                >
                  <XIcon size={12} />
                </button>
              )}
            </span>
          ))}

          {hasConnectedFs && (
            <button
              type="button"
              onClick={() => setShowSampleWhenConnected((v) => !v)}
              className="text-xs text-ink-soft underline underline-offset-4 hover:text-ink cursor-pointer"
            >
              {showSampleWhenConnected ? '샘플 숨기기' : '+ 샘플 프로젝트 함께 보기'}
            </button>
          )}
          {!hasConnectedFs && usingSample && (
            <span className="text-[11px] text-ink-faint">
              (로컬 폴더를 연결하면 실제 .pinproof/ 파일로 전환됩니다)
            </span>
          )}
        </div>

        {/* 보기 모드 전환 */}
        <div className="inline-flex rounded-[2px] border border-line bg-surface p-0.5">
          {(
            [
              ['both', '통합 보기'],
              ['analytics', '대시보드'],
              ['explorer', '목록 탐색'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={cn(
                'inline-flex items-center gap-1 rounded-[2px] px-2.5 py-1 text-xs transition-colors cursor-pointer',
                view === mode
                  ? 'bg-ink text-inverse font-semibold'
                  : 'text-ink-soft hover:text-ink',
              )}
            >
              {mode === 'analytics' && <ChartBarIcon size={12} />}
              {mode === 'explorer' && <ArchiveIcon size={12} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <TicketCard className="p-10 text-center text-sm text-ink-soft">
          프로젝트의 .pinproof/ 기록을 불러오는 중입니다…
        </TicketCard>
      ) : (
        <div className="flex flex-col gap-8">
          {(view === 'both' || view === 'analytics') && (
            <ArchiveAnalyticsPanel
              projects={projects}
              items={allItems}
              onSelectIssue={(issueKey) => {
                setIssueFilter(issueKey);
                if (view === 'analytics') setView('both');
              }}
              onSelectItem={(item) => {
                setSelectedItemKey(itemCompositeKey(item));
                if (view === 'analytics') setView('explorer');
              }}
            />
          )}

          {(view === 'both' || view === 'explorer') && (
            <ArchiveExplorer
              projects={projects}
              items={allItems}
              selectedItemKey={selectedItemKey}
              onSelectItemKey={setSelectedItemKey}
              issueFilter={issueFilter}
              onClearIssueFilter={() => setIssueFilter(null)}
              onArchiveItems={setItemsArchived}
              onDeleteItems={deleteItems}
            />
          )}
        </div>
      )}
    </div>
  );
}
