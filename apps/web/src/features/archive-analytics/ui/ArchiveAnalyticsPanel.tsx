import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  KIND_LABEL,
  clusterItemsByIssue,
  padId,
  type ArchiveItemDetail,
  type ArchiveProject,
  type EvidenceKind,
} from '@pinproof/shared';
import { Badge } from '@/shared/ui/kit/Badge';
import { TicketCard } from '@/shared/ui/kit/TicketCard';
import { ChartBarIcon, LayersIcon } from '@/shared/ui/kit/icon';

export interface ArchiveAnalyticsPanelProps {
  projects: ArchiveProject[];
  items: ArchiveItemDetail[];
  onSelectIssue: (issueKey: string) => void;
  onSelectItem: (item: ArchiveItemDetail) => void;
}

const INK_SHADES = [
  'rgb(var(--ink-rgb) / 0.92)',
  'rgb(var(--ink-rgb) / 0.66)',
  'rgb(var(--ink-rgb) / 0.44)',
  'rgb(var(--ink-rgb) / 0.28)',
  'rgb(var(--ink-rgb) / 0.16)',
];

export function ArchiveAnalyticsPanel({
  projects,
  items,
  onSelectIssue,
  onSelectItem,
}: ArchiveAnalyticsPanelProps) {
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

  // 프로젝트별 카테고리 비중 차트 데이터
  const { projectChartData, topCategories } = useMemo(() => {
    const catTotals = new Map<string, number>();
    for (const item of items) {
      catTotals.set(item.category, (catTotals.get(item.category) ?? 0) + 1);
    }
    const sortedCats = [...catTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    const rows = projects.map((proj) => {
      const row: Record<string, string | number> = { project: proj.name };
      for (const cat of sortedCats) {
        row[cat] = proj.items.filter((i) => i.category === cat).length;
      }
      return row;
    });

    return { projectChartData: rows, topCategories: sortedCats };
  }, [projects, items]);

  // 증거 유형 분포 차트 데이터
  const kindChartData = useMemo(() => {
    const counts = new Map<EvidenceKind, number>();
    for (const item of items) {
      const k = item.kind ?? 'element';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return (Object.keys(KIND_LABEL) as EvidenceKind[])
      .map((kind) => ({
        kind: KIND_LABEL[kind],
        count: counts.get(kind) ?? 0,
      }))
      .filter((row) => row.count > 0);
  }, [items]);

  return (
    <div className="flex flex-col gap-5">
      {/* KPI 요약 티켓 4장 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TicketCard className="p-4">
          <div className="text-[11px] font-medium tracking-wider text-ink-faint uppercase">
            전체 기록 티켓
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums">{metrics.total}</span>
            <span className="text-xs text-ink-soft tabular-nums">
              대기 {metrics.pending} · 보관 {metrics.archived}
            </span>
          </div>
        </TicketCard>

        <TicketCard className="p-4">
          <div className="text-[11px] font-medium tracking-wider text-ink-faint uppercase">
            아카이빙 완료율
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums">
              {metrics.archiveRate}%
            </span>
            <span className="text-xs text-ink-soft">보관 처리 기준</span>
          </div>
        </TicketCard>

        <TicketCard className="p-4">
          <div className="text-[11px] font-medium tracking-wider text-ink-faint uppercase">
            AI 이슈 묶음
          </div>
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
          <div className="text-[11px] font-medium tracking-wider text-ink-faint uppercase">
            스크린샷 증거
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums">{metrics.withShot}</span>
            <span className="text-xs text-ink-soft">미리보기 가능</span>
          </div>
        </TicketCard>
      </div>

      {/* 차트 2열: 프로젝트별 카테고리 비중 + 증거 유형 분포 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <TicketCard className="p-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <ChartBarIcon size={15} />
              <h3 className="text-sm font-semibold">프로젝트별 카테고리 비중</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {topCategories.map((cat, idx) => (
                <span key={cat} className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft">
                  <span
                    className="inline-block size-2.5 rounded-[1px]"
                    style={{ backgroundColor: INK_SHADES[idx % INK_SHADES.length] }}
                  />
                  {cat}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 h-56 w-full">
            {projectChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-ink-faint">
                표시할 프로젝트 데이터가 없습니다.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectChartData} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--ink-rgb) / 0.12)" vertical={false} />
                  <XAxis
                    dataKey="project"
                    tick={{ fill: 'rgb(var(--ink-rgb) / 0.66)', fontSize: 11 }}
                    axisLine={{ stroke: 'rgb(var(--ink-rgb) / 0.18)' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'rgb(var(--ink-rgb) / 0.55)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgb(var(--ink-rgb) / 0.06)' }}
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-line-strong)',
                      borderRadius: '2px',
                      fontSize: '12px',
                      color: 'var(--color-ink)',
                    }}
                  />
                  {topCategories.map((cat, idx) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="cat"
                      fill={INK_SHADES[idx % INK_SHADES.length]}
                      radius={idx === topCategories.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </TicketCard>

        <TicketCard className="p-5 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h3 className="text-sm font-semibold">증거 수집 유형 분포</h3>
          </div>
          <div className="mt-4 h-56 w-full">
            {kindChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-ink-faint">
                표시할 항목이 없습니다.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={kindChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 18, left: 6, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--ink-rgb) / 0.12)" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: 'rgb(var(--ink-rgb) / 0.55)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="kind"
                    width={54}
                    tick={{ fill: 'rgb(var(--ink-rgb) / 0.78)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgb(var(--ink-rgb) / 0.06)' }}
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-line-strong)',
                      borderRadius: '2px',
                      fontSize: '12px',
                      color: 'var(--color-ink)',
                    }}
                  />
                  <Bar dataKey="count" name="건수" fill="rgb(var(--ink-rgb) / 0.85)" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
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
                  <span className="text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
                    사람 카테고리:
                  </span>
                  {cluster.humanCategories.map((cat) => (
                    <Badge key={cat} variant="wash">
                      {cat}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
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
