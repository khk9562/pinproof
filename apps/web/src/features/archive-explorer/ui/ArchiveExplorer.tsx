import { useMemo, useState } from 'react';
import {
  KIND_LABEL,
  itemsPrompt,
  padId,
  type ArchiveItemDetail,
  type ArchiveProject,
} from '@pinproof/shared';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/kit/Badge';
import { Button } from '@/shared/ui/kit/Button';
import { ConfirmDialog } from '@/shared/ui/kit/ConfirmDialog';
import { TicketCard } from '@/shared/ui/kit/TicketCard';
import {
  ArchiveIcon,
  CheckIcon,
  CopyIcon,
  ImageIcon,
  RestoreIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from '@/shared/ui/kit/icon';

export interface ArchiveExplorerProps {
  projects: ArchiveProject[];
  items: ArchiveItemDetail[];
  selectedItemKey: string | null;
  onSelectItemKey: (key: string | null) => void;
  issueFilter: string | null;
  onClearIssueFilter: () => void;
  onArchiveItems: (items: ArchiveItemDetail[], toArchived: boolean) => Promise<void>;
  onDeleteItems: (items: ArchiveItemDetail[]) => Promise<void>;
}

type StatusTab = 'all' | 'pending' | 'archived' | 'with-shot';

export function itemCompositeKey(item: ArchiveItemDetail): string {
  return `${item.projectId}::${item.id}`;
}

export function ArchiveExplorer({
  projects,
  items,
  selectedItemKey,
  onSelectItemKey,
  issueFilter,
  onClearIssueFilter,
  onArchiveItems,
  onDeleteItems,
}: ArchiveExplorerProps) {
  const [query, setQuery] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(() => new Set());
  const [showRawMd, setShowRawMd] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ArchiveItemDetail[] | null>(null);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) set.add(item.category);
    return [...set].sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (projectFilter !== 'all' && item.projectId !== projectFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (issueFilter && item.issueKey !== issueFilter) return false;
      if (statusTab === 'pending' && item.archived) return false;
      if (statusTab === 'archived' && !item.archived) return false;
      if (statusTab === 'with-shot' && !item.screenshotUrl) return false;

      if (q) {
        const hay = [
          `#${padId(item.id)}`,
          item.category,
          item.note,
          item.page ?? '',
          item.reference ?? '',
          item.selector ?? '',
          item.issueKey ?? '',
          item.issueReason ?? '',
          item.projectName,
          item.resultMarkdown ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, projectFilter, categoryFilter, issueFilter, statusTab, query]);

  const activeItem = useMemo(() => {
    if (selectedItemKey) {
      const found = filteredItems.find((i) => itemCompositeKey(i) === selectedItemKey);
      if (found) return found;
    }
    return filteredItems[0] ?? null;
  }, [filteredItems, selectedItemKey]);

  const checkedItems = useMemo(
    () => filteredItems.filter((i) => checkedKeys.has(itemCompositeKey(i))),
    [filteredItems, checkedKeys],
  );

  const toggleCheck = (key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (checkedItems.length === filteredItems.length && filteredItems.length > 0) {
      setCheckedKeys(new Set());
    } else {
      setCheckedKeys(new Set(filteredItems.map(itemCompositeKey)));
    }
  };

  const copyItemPrompt = async (item: ArchiveItemDetail) => {
    try {
      await navigator.clipboard.writeText(itemsPrompt([item.fileName], item.category));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 검색 및 필터 바 */}
      <TicketCard className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* 검색 입력 */}
            <div className="relative min-w-[220px] flex-1">
              <SearchIcon
                size={14}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="번호, 메모, 경로, 이슈 키, 처리 기록 검색"
                className="h-9 w-full rounded-[2px] border border-line bg-bg pr-3 pl-8 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              />
            </div>

            {/* 프로젝트 선택 */}
            <select
              aria-label="프로젝트 필터"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-9 rounded-[2px] border border-line bg-bg px-2.5 text-xs text-ink focus:border-ink focus:outline-none"
            >
              <option value="all">모든 프로젝트 ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.items.length})
                </option>
              ))}
            </select>

            {/* 카테고리 선택 */}
            <select
              aria-label="카테고리 필터"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 rounded-[2px] border border-line bg-bg px-2.5 text-xs text-ink focus:border-ink focus:outline-none"
            >
              <option value="all">모든 카테고리</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 상태 탭 + 이슈 필터 칩 + 일괄 액션 */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', '전체'],
                  ['pending', '대기'],
                  ['archived', '보관함'],
                  ['with-shot', '스크린샷 있음'],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusTab(tab)}
                  className={cn(
                    'rounded-[2px] border px-2.5 py-1 text-xs transition-colors cursor-pointer',
                    statusTab === tab
                      ? 'border-ink bg-ink text-inverse font-semibold'
                      : 'border-line bg-bg text-ink-soft hover:border-line-strong hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}

              {issueFilter && (
                <button
                  type="button"
                  onClick={onClearIssueFilter}
                  className="inline-flex items-center gap-1 rounded-[2px] border border-ink bg-wash-strong px-2 py-1 text-xs font-medium text-ink cursor-pointer"
                >
                  <span>이슈: {issueFilter}</span>
                  <XIcon size={12} />
                </button>
              )}
            </div>

            {/* 일괄 관리 바 */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filteredItems.length > 0 && checkedItems.length === filteredItems.length}
                  onChange={toggleAllVisible}
                  className="accent-ink"
                />
                <span>
                  {checkedItems.length > 0
                    ? `${checkedItems.length}건 선택됨`
                    : `목록 ${filteredItems.length}건`}
                </span>
              </label>

              {checkedItems.length > 0 && (
                <>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await onArchiveItems(checkedItems, true);
                      setCheckedKeys(new Set());
                    }}
                  >
                    <ArchiveIcon size={13} /> 일괄 보관
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await onArchiveItems(checkedItems, false);
                      setCheckedKeys(new Set());
                    }}
                  >
                    <RestoreIcon size={13} /> 대기 복원
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setPendingDelete(checkedItems)}
                  >
                    <TrashIcon size={13} /> 삭제 ({checkedItems.length})
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </TicketCard>

      {/* Split-View 목록 + 상세 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 좌측: 티켓 목록 */}
        <TicketCard className="flex max-h-[720px] flex-col overflow-hidden lg:col-span-5">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-ink-soft">
            <span className="font-semibold text-ink">티켓 목록</span>
            <span className="font-mono tabular-nums">{filteredItems.length} items</span>
          </div>

          {filteredItems.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
              <p className="text-sm font-medium text-ink">조건에 맞는 기록이 없습니다.</p>
              <p className="text-xs text-ink-soft">
                검색어나 필터를 초기화해 다른 프로젝트 기록을 확인해 보세요.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-line overflow-y-auto">
              {filteredItems.map((item) => {
                const key = itemCompositeKey(item);
                const isSelected = activeItem && itemCompositeKey(activeItem) === key;
                const isChecked = checkedKeys.has(key);

                return (
                  <div
                    key={key}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 transition-colors',
                      isSelected ? 'bg-wash-strong' : 'hover:bg-wash/60',
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`#${padId(item.id)} 선택`}
                      checked={isChecked}
                      onChange={() => toggleCheck(key)}
                      className="mt-1 shrink-0 accent-ink"
                    />
                    <button
                      type="button"
                      onClick={() => onSelectItemKey(key)}
                      className="flex min-w-0 flex-1 flex-col gap-1.5 text-left cursor-pointer"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-ink">
                            #{padId(item.id)}
                          </span>
                          <Badge variant={item.archived ? 'solid' : 'outline'}>
                            {item.archived ? '보관' : '대기'}
                          </Badge>
                          <Badge variant="wash">{item.category}</Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                          {item.screenshotUrl && (
                            <span title="스크린샷 포함" className="inline-flex items-center text-ink">
                              <ImageIcon size={12} />
                            </span>
                          )}
                          <span className="font-mono">{item.projectName}</span>
                        </div>
                      </div>

                      <p className="line-clamp-2 text-xs leading-relaxed text-ink">
                        {item.note || '(메모 없음)'}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-ink-faint">
                        {item.kind && <span>{KIND_LABEL[item.kind]}</span>}
                        {item.page && <span className="truncate">{item.page}</span>}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </TicketCard>

        {/* 우측: 상세 뷰어 */}
        <TicketCard className="flex flex-col overflow-hidden lg:col-span-7">
          {!activeItem ? (
            <div className="flex min-h-[420px] items-center justify-center p-8 text-sm text-ink-faint">
              왼쪽 목록에서 티켓을 선택하면 상세 정보와 스크린샷을 확인할 수 있습니다.
            </div>
          ) : (
            <div className="flex flex-col">
              {/* 상세 헤더 */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-base font-bold">#{padId(activeItem.id)}</span>
                    <Badge variant={activeItem.archived ? 'solid' : 'outline'}>
                      {activeItem.archived ? '보관됨 (완료)' : '대기 중'}
                    </Badge>
                    <Badge variant="wash">{activeItem.category}</Badge>
                    <Badge variant="outline">{activeItem.projectName}</Badge>
                    {activeItem.kind && (
                      <Badge variant="outline">{KIND_LABEL[activeItem.kind]}</Badge>
                    )}
                    {activeItem.env === 'deployed' && <Badge variant="solid">배포 환경</Badge>}
                  </div>
                  <h3 className="text-base font-semibold leading-snug text-ink">
                    {activeItem.note || '(메모 없음)'}
                  </h3>
                </div>

                {/* 액션 버튼들 */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={activeItem.archived ? 'default' : 'solid'}
                    onClick={() => onArchiveItems([activeItem], !activeItem.archived)}
                  >
                    {activeItem.archived ? (
                      <>
                        <RestoreIcon size={13} /> 대기로 복원
                      </>
                    ) : (
                      <>
                        <ArchiveIcon size={13} /> 보관 처리
                      </>
                    )}
                  </Button>
                  <Button size="sm" onClick={() => copyItemPrompt(activeItem)}>
                    {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                    <span>{copied ? '복사됨' : '프롬프트'}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setPendingDelete([activeItem])}
                  >
                    <TrashIcon size={13} /> 삭제
                  </Button>
                </div>
              </div>

              {/* 상세 본문 */}
              <div className="flex flex-col gap-5 p-5">
                {/* 스크린샷 미리보기 */}
                {activeItem.screenshotUrl && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink">첨부 스크린샷</span>
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(activeItem.screenshotUrl!)}
                        className="text-xs text-ink-soft underline underline-offset-4 hover:text-ink cursor-pointer"
                      >
                        크게 보기
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(activeItem.screenshotUrl!)}
                      className="group overflow-hidden rounded-[2px] border border-line bg-bg text-left transition-colors hover:border-line-strong cursor-zoom-in"
                    >
                      <img
                        src={activeItem.screenshotUrl}
                        alt={`#${padId(activeItem.id)} 캡처 스크린샷`}
                        className="max-h-72 w-full object-contain"
                      />
                    </button>
                  </div>
                )}

                {/* AI 이슈 묶음 컨텍스트 */}
                {activeItem.issueKey && (
                  <div className="rounded-[2px] border border-line-strong bg-wash/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold tracking-wider text-ink uppercase">
                        AI 이슈 묶음 기준
                      </span>
                      <Badge variant="outline">{activeItem.issueKey}</Badge>
                    </div>
                    {activeItem.issueReason && (
                      <p className="mt-2 text-xs leading-relaxed text-ink">
                        {activeItem.issueReason}
                      </p>
                    )}
                    {activeItem.touchedFiles.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-ink-faint">수정 파일:</span>
                        {activeItem.touchedFiles.map((file) => (
                          <code
                            key={file}
                            className="rounded-[2px] border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink"
                          >
                            {file}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 메타데이터 그리드 */}
                <div className="grid grid-cols-1 gap-2 rounded-[2px] border border-line bg-bg/70 p-3.5 text-xs sm:grid-cols-2">
                  <div>
                    <span className="text-ink-faint">페이지 경로</span>
                    <div className="mt-0.5 truncate font-mono text-ink">
                      {activeItem.page || activeItem.url || '-'}
                    </div>
                  </div>
                  <div>
                    <span className="text-ink-faint">기록 시각</span>
                    <div className="mt-0.5 font-mono text-ink tabular-nums">
                      {activeItem.created || '-'}
                    </div>
                  </div>
                  {activeItem.reference && (
                    <div className="sm:col-span-2">
                      <span className="text-ink-faint">컴포넌트 · 소스 참조</span>
                      <div className="mt-0.5 break-all font-mono text-ink">
                        {activeItem.reference}
                      </div>
                    </div>
                  )}
                  {activeItem.selector && (
                    <div className="sm:col-span-2">
                      <span className="text-ink-faint">CSS Selector</span>
                      <div className="mt-0.5 break-all font-mono text-ink">
                        {activeItem.selector}
                      </div>
                    </div>
                  )}
                </div>

                {/* AI 처리 기록 */}
                {activeItem.resultMarkdown && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-ink">AI 처리 기록</span>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-[2px] border border-line bg-bg p-3.5 font-mono text-xs leading-relaxed text-ink-soft">
                      {activeItem.resultMarkdown}
                    </pre>
                  </div>
                )}

                {/* 원문 마크다운 접기/펼치기 */}
                <div className="pinproof-ticket-divider pt-3">
                  <button
                    type="button"
                    onClick={() => setShowRawMd((v) => !v)}
                    className="text-xs font-medium text-ink-soft underline underline-offset-4 hover:text-ink cursor-pointer"
                  >
                    {showRawMd ? '원본 Markdown 숨기기' : '원본 Markdown (.md) 보기'}
                  </button>
                  {showRawMd && (
                    <pre className="mt-2.5 max-h-72 overflow-auto whitespace-pre-wrap rounded-[2px] border border-line bg-bg p-3.5 font-mono text-[11px] leading-relaxed text-ink-soft">
                      {activeItem.rawMarkdown}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </TicketCard>
      </div>

      {/* 스크린샷 라이트박스 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="스크린샷 확대 보기"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-h-[90dvh] max-w-5xl rounded-[2px] border border-line-strong bg-surface p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="font-mono text-xs text-ink-soft">스크린샷 원본 미리보기</span>
              <Button variant="ghost" size="icon" aria-label="닫기" onClick={() => setLightboxUrl(null)}>
                <XIcon size={16} />
              </Button>
            </div>
            <img
              src={lightboxUrl}
              alt="확대 스크린샷"
              className="max-h-[80dvh] w-auto object-contain"
            />
          </div>
        </div>
      )}

      {/* 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete && pendingDelete.length > 1
            ? `${pendingDelete.length}개 항목을 삭제할까요?`
            : '이 항목을 삭제할까요?'
        }
        description="삭제하면 연결된 프로젝트 폴더의 .md 파일과 스크린샷 이미지가 함께 제거되며 되돌릴 수 없습니다."
        confirmLabel="영구 삭제"
        destructive
        onConfirm={async () => {
          if (!pendingDelete) return;
          const targets = pendingDelete;
          setPendingDelete(null);
          await onDeleteItems(targets);
          setCheckedKeys(new Set());
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
