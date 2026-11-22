import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ArchiveProject } from '@pinproof/shared';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/kit/Badge';
import { ConfirmDialog } from '@/shared/ui/kit/ConfirmDialog';
import { ChevronDownIcon, FolderPlusIcon, TrashIcon } from '@/shared/ui/kit/icon';

export interface ProjectDropdownProps {
  projects: ArchiveProject[];
  selectedProjectId: string;
  onSelectProjectId: (id: string) => void;
  onConnectFolder: () => void;
  onDisconnectProject: (projectId: string) => Promise<void>;
  supportsFs: boolean;
  fullWidth?: boolean;
  labelRight?: ReactNode;
}

export function ProjectDropdown({
  projects,
  selectedProjectId,
  onSelectProjectId,
  onConnectFolder,
  onDisconnectProject,
  supportsFs,
  fullWidth = false,
  labelRight,
}: ProjectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [pendingDisconnect, setPendingDisconnect] = useState<ArchiveProject | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const totalItems = projects.reduce((sum, p) => sum + p.items.length, 0);
  const activeProject =
    selectedProjectId === 'all'
      ? null
      : projects.find((p) => p.id === selectedProjectId) ?? null;

  return (
    <div
      className={cn(
        fullWidth ? 'flex w-full flex-col gap-1.5' : 'flex items-center gap-2.5',
      )}
      ref={containerRef}
    >
      <div className={cn('flex items-center justify-between gap-2', !fullWidth && 'shrink-0')}>
        <span className="text-xs font-semibold text-ink-soft">프로젝트</span>
        {labelRight}
      </div>

      <div className={cn('relative', fullWidth && 'w-full')}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'inline-flex h-9 items-center justify-between gap-2 rounded-[2px] border bg-surface px-3 text-xs text-ink transition-colors cursor-pointer',
            fullWidth ? 'w-full' : 'min-w-[210px]',
            open ? 'border-ink' : 'border-line hover:border-line-strong',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">
              {activeProject ? activeProject.name : `모든 프로젝트 (${projects.length})`}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-ink-faint tabular-nums">
              {activeProject ? `${activeProject.items.length}건` : `${totalItems}건`}
            </span>
          </span>
          <ChevronDownIcon
            size={14}
            className={cn('shrink-0 text-ink-soft transition-transform duration-150', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div
            role="listbox"
            className={cn(
              'absolute top-full left-0 z-40 mt-1.5 rounded-[2px] border border-line-strong bg-surface p-1.5 shadow-[0_24px_54px_-22px_rgb(0_0_0/0.5)]',
              fullWidth ? 'w-full' : 'w-72',
            )}
          >
            {/* 전체 보기 옵션 */}
            <button
              type="button"
              onClick={() => {
                onSelectProjectId('all');
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between rounded-[2px] px-2.5 py-2 text-left text-xs transition-colors cursor-pointer',
                selectedProjectId === 'all'
                  ? 'bg-ink text-inverse font-semibold'
                  : 'text-ink hover:bg-wash',
              )}
            >
              <span>모든 프로젝트 ({projects.length})</span>
              <span className="font-mono text-[10px] opacity-75 tabular-nums">{totalItems}건</span>
            </button>

            <div className="my-1.5 border-t border-dashed border-line" />

            {/* 연결된 프로젝트 목록 */}
            <div className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
              {projects.map((proj) => {
                const isSelected = selectedProjectId === proj.id;
                return (
                  <div
                    key={proj.id}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-[2px] px-2 py-1.5 transition-colors',
                      isSelected ? 'bg-wash-strong' : 'hover:bg-wash/70',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProjectId(proj.id);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                    >
                      <span className="truncate font-mono text-xs font-semibold text-ink">
                        {proj.name}
                      </span>
                      <Badge variant={proj.source === 'fs' ? 'outline' : 'wash'}>
                        {proj.source === 'fs' ? '로컬' : '샘플'}
                      </Badge>
                      <span className="font-mono text-[10px] text-ink-faint tabular-nums">
                        {proj.items.length}
                      </span>
                    </button>

                    {proj.source === 'fs' && (
                      <button
                        type="button"
                        aria-label={`${proj.name} 연결 해제`}
                        title="폴더 연결 해제"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(false);
                          setPendingDisconnect(proj);
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-[2px] border border-transparent px-1.5 py-1 text-[11px] text-ink-faint hover:border-line-strong hover:bg-surface hover:text-ink cursor-pointer"
                      >
                        <TrashIcon size={12} />
                        <span>해제</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {supportsFs && (
              <>
                <div className="my-1.5 border-t border-dashed border-line" />
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onConnectFolder();
                  }}
                  className="flex w-full items-center gap-2 rounded-[2px] px-2.5 py-2 text-left text-xs font-medium text-ink hover:bg-wash cursor-pointer"
                >
                  <FolderPlusIcon size={13} />
                  <span>새 프로젝트 폴더(.pinproof) 연결</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 폴더 연결 해제 확인 커스텀 다이얼로그 */}
      <ConfirmDialog
        open={pendingDisconnect !== null}
        title={
          pendingDisconnect
            ? `"${pendingDisconnect.name}" 폴더 연결을 해제할까요?`
            : '폴더 연결을 해제할까요?'
        }
        description="브라우저 목록에서만 연결이 해제되며, 컴퓨터에 저장된 실제 .pinproof/ 파일과 스크린샷은 삭제되지 않습니다."
        confirmLabel="연결 해제"
        destructive
        onConfirm={async () => {
          if (!pendingDisconnect) return;
          const target = pendingDisconnect;
          setPendingDisconnect(null);
          if (selectedProjectId === target.id) {
            onSelectProjectId('all');
          }
          await onDisconnectProject(target.id);
        }}
        onClose={() => setPendingDisconnect(null)}
      />
    </div>
  );
}
