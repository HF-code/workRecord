/**
 * 需求卡片瀑布流网格容器（发版日分组大框内的纯网格）：
 * - flex 多列纵向堆叠（列数由容器宽度自适应：约 340px/列），卡片按 i % cols 轮询入列，
 *   视觉阅读顺序 = 数据顺序；不同高度卡片在各自列内自然向下延伸（瀑布流）。
 * - 拖拽排序与排序模式已移除（列表统一按发版日分组展示）。
 */
import { useEffect, useRef, useState } from 'react';
import type { Requirement, Track } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import type { BuildEnv } from '../build';
import type { BuildTask } from '../hooks/useBuildTasks';
import RequirementCard from './RequirementCard';

interface Props {
  data: Requirement[];
  apps: DevopsApp[];
  /** 批量勾选的需求 id 集合 */
  selectedReqIds: Set<string>;
  /** 全局构建任务（卡片构建小灯数据源） */
  tasks: BuildTask[];
  onToggleSelect: (reqId: string, checked: boolean) => void;
  onEdit: (req: Requirement) => void;
  onDelete: (id: string) => void;
  onChangeReleaseDate: (id: string, date: string | null) => void;
  onAdvanceTrack: (reqId: string, track: Track, env: BuildEnv | null) => void;
  onToggleTestPass: (reqId: string, track: Track, pass: boolean) => void;
  onSetTarget: (reqId: string, track: Track, env: BuildEnv) => void;
  onTrackBuild: (req: Requirement, track: Track) => void;
  onTrackMr: (req: Requirement, track: Track) => void;
  /** 移除某轨（卡片 X） */
  onRemoveTrack: (reqId: string, track: Track) => void;
  onOpenBuildPanel: () => void;
}

/** 单列宽度与列间距（与列数计算公式配套：cols = floor((w + GAP) / (CARD_W + GAP))） */
const CARD_W = 340;
const GAP = 12;

export default function RequirementCardGrid({
  data,
  apps,
  selectedReqIds,
  tasks,
  onToggleSelect,
  onEdit,
  onDelete,
  onChangeReleaseDate,
  onAdvanceTrack,
  onToggleTestPass,
  onSetTarget,
  onTrackBuild,
  onTrackMr,
  onRemoveTrack,
  onOpenBuildPanel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);

  // 容器宽度 → 瀑布流列数（ResizeObserver 监听，窗口/侧栏变化时重排）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setCols(Math.max(1, Math.floor((el.clientWidth + GAP) / (CARD_W + GAP))));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (data.length === 0) return null;

  // 轮询分列：data[i] → 第 i % cols 列，保证阅读顺序与数据顺序一致
  const columns: Requirement[][] = Array.from({ length: cols }, () => []);
  data.forEach((req, i) => columns[i % cols].push(req));

  return (
    <div ref={containerRef} style={{ display: 'flex', gap: GAP, alignItems: 'flex-start' }}>
      {columns.map((col, ci) => (
        <div
          key={ci}
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: GAP }}
        >
          {col.map((req) => (
            <RequirementCard
              key={req.id}
              req={req}
              apps={apps}
              selected={selectedReqIds.has(req.id)}
              tasks={tasks}
              onToggleSelect={onToggleSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onChangeReleaseDate={onChangeReleaseDate}
              onAdvanceTrack={onAdvanceTrack}
              onToggleTestPass={onToggleTestPass}
              onSetTarget={onSetTarget}
              onTrackBuild={onTrackBuild}
              onTrackMr={onTrackMr}
              onRemoveTrack={onRemoveTrack}
              onOpenBuildPanel={onOpenBuildPanel}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
