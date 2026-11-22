import { useMemo, useState } from 'react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  KIND_LABEL,
  clusterItemsByIssue,
  padId,
  type ArchiveItemDetail,
  type ArchiveProject,
  type EvidenceKind,
} from '@pinproof/shared';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/kit/Badge';
import { TicketCard } from '@/shared/ui/kit/TicketCard';
import { ChartBarIcon, LayersIcon } from '@/shared/ui/kit/icon';

export interface ArchiveAnalyticsPanelProps {
  projects: ArchiveProject[];
  items: ArchiveItemDetail[];
  onSelectIssue: (issueKey: string) => void;
  onSelectItem: (item: ArchiveItemDetail) => void;
  onSelectKind?: (kind: EvidenceKind) => void;
}

const INK_SHADES = [
  'rgb(var(--ink-rgb) / 0.94)',
  'rgb(var(--ink-rgb) / 0.68)',
  'rgb(var(--ink-rgb) / 0.46)',
  'rgb(var(--ink-rgb) / 0.3)',
  'rgb(var(--ink-rgb) / 0.18)',
];

// 히트맵 5단계 흑백 명도 (0건 ~ 최대)
const HEAT_LEVEL_BG = [
  'rgb(var(--ink-rgb) / 0.04)',
  'rgb(var(--ink-rgb) / 0.22)',
  'rgb(var(--ink-rgb) / 0.46)',
  'rgb(var(--ink-rgb) / 0.72)',
  'rgb(var(--ink-rgb) / 0.94)',
] as const;

function heatLevelOf(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function dateKeyOf(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}-${m[3]}` : '날짜 없음';
}

export function ArchiveAnalyticsPanel({
  projects,
  items,
  onSelectIssue,
  onSelectItem,
  onSelectKind,
}: ArchiveAnalyticsPanelProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [hoveredCell, setHoveredCell] = useState<{
    date: string;
    kind: EvidenceKind;
    count: number;
  } | null>(null);

  const clusters = useMemo(() => clusterItemsByIssue(items), [items]);

  const metrics = useMemo(() => {
    const total = items.length;
    const archived = items.filter((i) => i.archived).length;
    const withShot = items.filter((i) => Boolean(i.screenshotUrl || i.screenshotRelPath)).length;
    const multiCategoryClusters = clusters.filter((c) => c.humanCategories.length > 1).length;
    return {
      total,
      archived,
      pending: total - archived,
      archiveRate: total > 0 ? Math.round((archived / total) * 100) : 0,
      clusterCount: clusters.length,
      multiCategoryClusters,
      withShot,
    };
  }, [items, clusters]);

  // 도넛 차트용 프로젝트별 카테고리 비중 데이터
  const donutScopeItems = useMemo(() => {
    if (selectedProjectId === 'all') return items;
    const found = projects.find((p) => p.id === selectedProjectId);
    return found ? found.items : items;
  }, [items, projects, selectedProjectId]);

  const donutData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of donutScopeItems) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    const total = donutScopeItems.length || 1;
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name,
        value,
        percent: Math.round((value / total) * 100),
      }));
  }, [donutScopeItems]);

  // 유형 × 날짜 매트릭스 히트맵 데이터
  const heatmap = useMemo(() => {
    const dateSet = new Set<string>();
    const kindTotals = new Map<EvidenceKind, number>();
    const matrix = new Map<string, number>();
    let maxCount = 0;

    for (const item of items) {
      const date = dateKeyOf(item.created);
      const kind = item.kind ?? 'element';
      dateSet.add(date);
      kindTotals.set(kind, (kindTotals.get(kind) ?? 0) + 1);
      const key = `${kind}::${date}`;
      const next = (matrix.get(key) ?? 0) + 1;
      matrix.set(key, next);
      if (next > maxCount) maxCount = next;
    }

    const dates = [...dateSet].sort((a, b) => a.localeCompare(b));
    const kinds = (Object.keys(KIND_LABEL) as EvidenceKind[]).filter(
      (k) => (kindTotals.get(k) ?? 0) > 0,
    );

    return { dates, kinds, kindTotals, matrix, maxCount };
  }, [items]);

  return (
    <div className="flex flex-col gap-5">
      {/* KPI 요약 티켓 4장 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TicketCard className="p-4">
          <div className="text-[11px] font-medium text-ink-faint">전체 기록 티켓</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums">{metrics.total}</span>
            <span className="text-xs text-ink-soft tabular-nums">
              대기 {metrics.pending} · 보관 {metrics.archived}
            </span>
          </div>
        </TicketCard>

        <TicketCard className="p-4">
          <div className="text-[11px] font-medium text-ink-faint">아카이빙 완료율</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums">
              {metrics.archiveRate}%
            </span>
            <span className="text-xs text-ink-soft">보관 처리 기준</span>
          </div>
        </TicketCard>

        <TicketCard className="p-4">
          <div className="text-[11px] font-medium text-ink-faint">AI 이슈 묶음</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums">
              {metrics.clusterCount}
            </span>
            <span className="text-xs text-ink-soft tabular-nums">
              교차 카테고리 {metrics.multiCategoryClusters}건
            </span>
          </div>
        </TicketCard>

        <TicketCard className="p-4">
          <div className="text-[11px] font-medium text-ink-faint">스크린샷 증거</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums">{metrics.withShot}</span>
            <span className="text-xs text-ink-soft">미리보기 가능</span>
          </div>
        </TicketCard>
      </div>

      {/* 차트 2열: 프로젝트별 카테고리 비중(도넛) + 수집 유형별 사용 추이(흑백 히트맵) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 도넛 차트: 프로젝트별 카테고리 비중 */}
        <TicketCard className="flex flex-col justify-between p-5 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <ChartBarIcon size={15} />
              <h3 className="text-sm font-semibold">프로젝트별 카테고리 비중</h3>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setSelectedProjectId('all')}
                className={cn(
                  'rounded-[2px] border px-2 py-0.5 text-[11px] transition-colors cursor-pointer',
                  selectedProjectId === 'all'
                    ? 'border-ink bg-ink text-inverse font-semibold'
                    : 'border-line bg-bg text-ink-soft hover:text-ink',
                )}
              >
                전체
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProjectId(p.id)}
                  className={cn(
                    'rounded-[2px] border px-2 py-0.5 font-mono text-[11px] transition-colors cursor-pointer',
                    selectedProjectId === p.id
                      ? 'border-ink bg-ink text-inverse font-semibold'
                      : 'border-line bg-bg text-ink-soft hover:text-ink',
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 items-center gap-4 sm:grid-cols-12">
            <div className="relative h-56 sm:col-span-7">
              {donutData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-ink-faint">
                  표시할 카테고리 데이터가 없습니다.
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="58%"
                        outerRadius="84%"
                        paddingAngle={2}
                        stroke="var(--color-surface)"
                        strokeWidth={2}
                      >
                        {donutData.map((entry, idx) => (
                          <Cell
                            key={entry.name}
                            fill={INK_SHADES[idx % INK_SHADES.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [`${value}건`, name]}
                        contentStyle={{
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-line-strong)',
                          borderRadius: '2px',
                          fontSize: '12px',
                          color: 'var(--color-ink)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* 도넛 중앙 요약 */}
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="font-mono text-2xl font-extrabold tabular-nums text-ink">
                      {donutScopeItems.length}
                    </span>
                    <span className="text-[11px] text-ink-faint">전체 건수</span>
                  </div>
                </>
              )}
            </div>

            {/* 우측 카테고리 범례 */}
            <div className="flex flex-col gap-2 sm:col-span-5">
              {donutData.map((entry, idx) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between gap-2 rounded-[2px] border border-line bg-bg/65 px-2.5 py-1.5 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-[1px]"
                      style={{ backgroundColor: INK_SHADES[idx % INK_SHADES.length] }}
                    />
                    <span className="truncate font-medium text-ink">{entry.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-soft">
                    {entry.value}건 ({entry.percent}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TicketCard>

        {/* 흑백 명도 히트맵: 수집 유형별 사용 추이 */}
        <TicketCard className="flex flex-col justify-between p-5 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <h3 className="text-sm font-semibold">수집 유형별 사용 추이</h3>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
              <span>적음</span>
              {HEAT_LEVEL_BG.map((bg, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="inline-block size-3 rounded-[1px] border border-line"
                  style={{ backgroundColor: bg }}
                />
              ))}
              <span>많음</span>
            </div>
          </div>

          <div className="mt-4 flex flex-1 flex-col justify-between gap-3">
            {heatmap.dates.length === 0 || heatmap.kinds.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-xs text-ink-faint">
                표시할 날짜별 수집 기록이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="inline-flex min-w-full flex-col gap-2">
                  {/* 날짜 열 헤더 */}
                  <div
                    className="grid items-center gap-1.5"
                    style={{
                      gridTemplateColumns: `64px repeat(${heatmap.dates.length}, minmax(36px, 1fr)) 40px`,
                    }}
                  >
                    <span className="text-[10px] font-medium text-ink-faint">유형</span>
                    {heatmap.dates.map((date) => (
                      <span
                        key={date}
                        className="text-center font-mono text-[10px] tabular-nums text-ink-faint"
                      >
                        {date}
                      </span>
                    ))}
                    <span className="text-right text-[10px] font-medium text-ink-faint">합계</span>
                  </div>

                  {/* 수집 유형별 행 */}
                  {heatmap.kinds.map((kind) => {
                    const rowTotal = heatmap.kindTotals.get(kind) ?? 0;
                    return (
                      <div
                        key={kind}
                        className="grid items-center gap-1.5"
                        style={{
                          gridTemplateColumns: `64px repeat(${heatmap.dates.length}, minmax(36px, 1fr)) 40px`,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectKind?.(kind)}
                          className="truncate text-left text-xs font-medium text-ink hover:underline cursor-pointer"
                        >
                          {KIND_LABEL[kind]}
                        </button>

                        {heatmap.dates.map((date) => {
                          const count = heatmap.matrix.get(`${kind}::${date}`) ?? 0;
                          const level = heatLevelOf(count, heatmap.maxCount);
                          const isDarkCell = level >= 3;

                          return (
                            <button
                              key={`${kind}-${date}`}
                              type="button"
                              disabled={count === 0}
                              onMouseEnter={() => setHoveredCell({ date, kind, count })}
                              onMouseLeave={() => setHoveredCell(null)}
                              onFocus={() => setHoveredCell({ date, kind, count })}
                              onBlur={() => setHoveredCell(null)}
                              onClick={() => {
                                if (count > 0) onSelectKind?.(kind);
                              }}
                              aria-label={`${date} ${KIND_LABEL[kind]} ${count}건`}
                              className={cn(
                                'flex h-9 items-center justify-center rounded-[2px] border font-mono text-[11px] tabular-nums transition-transform duration-150',
                                count > 0
                                  ? 'border-line-strong/40 hover:scale-[1.04] hover:border-ink cursor-pointer'
                                  : 'border-line/70 cursor-default',
                                isDarkCell ? 'font-bold text-inverse' : 'text-ink-soft',
                              )}
                              style={{ backgroundColor: HEAT_LEVEL_BG[level] }}
                            >
                              {count > 0 ? count : ''}
                            </button>
                          );
                        })}

                        <span className="text-right font-mono text-xs font-semibold tabular-nums text-ink-soft">
                          {rowTotal}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 하단 셀 상세 상태 줄 */}
            <div className="flex items-center justify-between border-t border-dashed border-line pt-2.5 text-xs text-ink-soft">
              {hoveredCell ? (
                <span>
                  <strong className="font-mono text-ink">{hoveredCell.date}</strong> ·{' '}
                  <strong className="text-ink">{KIND_LABEL[hoveredCell.kind]}</strong>{' '}
                  <span className="font-mono font-semibold text-ink tabular-nums">
                    {hoveredCell.count}건
                  </span>
                </span>
              ) : (
                <span>셀에 마우스를 올리면 날짜별 건수를 확인하고, 클릭하면 해당 유형 목록으로 이동합니다.</span>
              )}
            </div>
          </div>
        </TicketCard>
      </div>

      {/* AI 이슈 묶음 기준 대조 뷰 */}
      <TicketCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <LayersIcon size={15} />
            <div>
              <h3 className="text-sm font-semibold">
                사람의 카테고리 → AI 이슈 묶음 기준 매핑
              </h3>
              <p className="text-xs text-ink-soft">
                사람이 나눠 담은 여러 항목을 AI 에이전트가 어떤 공통 원인으로 묶어 처리했는지 확인합니다.
              </p>
            </div>
          </div>
          <Badge variant="outline">총 {clusters.length}개 이슈 그룹</Badge>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {clusters.map((cluster) => (
            <div
              key={`${cluster.projectId}-${cluster.issueKey}`}
              className="flex flex-col justify-between gap-3 rounded-[2px] border border-line bg-bg/70 p-4 transition-colors hover:border-line-strong"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="solid">{cluster.projectName}</Badge>
                    <Badge variant="outline">완료 {cluster.completionRate}%</Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectIssue(cluster.issueKey)}
                    className="text-xs font-medium text-ink underline underline-offset-4 hover:opacity-75 cursor-pointer"
                  >
                    이슈 항목만 보기 ({cluster.items.length})
                  </button>
                </div>

                <h4 className="text-sm font-semibold text-ink">{cluster.title}</h4>
                <p className="text-xs leading-relaxed text-ink-soft">{cluster.reason}</p>
              </div>

              <div className="pinproof-ticket-divider flex flex-col gap-2 pt-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-ink-faint">
                    사람 카테고리:
                  </span>
                  {cluster.humanCategories.map((cat) => (
                    <Badge key={cat} variant="wash">
                      {cat}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-ink-faint">
                    묶인 티켓:
                  </span>
                  {cluster.items.map((it) => (
                    <button
                      key={`${it.projectId}-${it.id}`}
                      type="button"
                      onClick={() => onSelectItem(it)}
                      className="rounded-[2px] border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink hover:border-ink cursor-pointer"
                    >
                      #{padId(it.id)} {it.archived ? '·보관' : '·대기'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </TicketCard>
    </div>
  );
}
