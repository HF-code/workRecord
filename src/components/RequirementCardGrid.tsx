/**
 * 需求卡片瀑布流网格容器：
 * - flex 多列纵向堆叠（列数由容器宽度自适应：约 340px/列），卡片按 i % cols 轮询入列，
 *   视觉阅读顺序 = 数据顺序；不同高度卡片在各自列内自然向下延伸（瀑布流）。
 * - DndContext + SortableContext(rectSortingStrategy) 网格拖拽排序（跨列原生支持）。
 * - 上方工具行：排序模式切换（手动 → 发版时间降序 → 发版时间升序 循环）。
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Empty, Tooltip } from 'antd';
import { CaretDownOutlined, CaretUpOutlined, OrderedListOutlined } from '@ant-design/icons';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Requirement, SortMode, Status } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import type { BranchConfig } from '../config/branches';
import type { BuildPlan } from '../batch';
import RequirementCard from './RequirementCard';

interface Props {
  data: Requirement[];
  apps: DevopsApp[];
  branches: BranchConfig[];
  buildPlan: BuildPlan;
  /** 批量勾选的需求 id 集合 */
  selectedReqIds: Set<string>;
  onToggleSelect: (reqId: string, checked: boolean) => void;
  onEdit: (req: Requirement) => void;
  onDelete: (id: string) => void;
  onChangeStatus: (id: string, status: Status) => void;
  onChangeReleaseDate: (id: string, date: string | null) => void;
  /** 拖拽落点：把 activeId 移动到 overId 的位置（在完整数据上重排） */
  onReorder: (activeId: string, overId: string) => void;
  sortMode: SortMode;
  onChangeSortMode: (mode: SortMode) => void;
}

/** 单列宽度与列间距（与列数计算公式配套：cols = floor((w + GAP) / (CARD_W + GAP))） */
const CARD_W = 340;
const GAP = 12;

/** 排序模式展示配置 */
const SORT_MODE_META: Record<SortMode, { text: string; title: string }> = {
  manual: { text: '手动排序', title: '当前为手动拖拽顺序，点击按发版时间降序' },
  releaseDesc: { text: '发版时间 ↓', title: '当前为发版时间降序，点击切换升序' },
  releaseAsc: { text: '发版时间 ↑', title: '当前为发版时间升序，点击恢复手动顺序' },
};

export default function RequirementCardGrid({
  data,
  apps,
  branches,
  buildPlan,
  selectedReqIds,
  onToggleSelect,
  onEdit,
  onDelete,
  onChangeStatus,
  onChangeReleaseDate,
  onReorder,
  sortMode,
  onChangeSortMode,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);

  // distance: 1 防止点击误触拖拽；KeyboardSensor 支持键盘无障碍排序
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 1 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  /** 拖拽落点：交给上层在完整数据上重排（兼容筛选视图） */
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };

  /** 循环切换排序模式（发版时间排序为一次性真实重排，重排后仍可继续拖拽） */
  const cycleSortMode = () => {
    onChangeSortMode(
      sortMode === 'manual' ? 'releaseDesc' : sortMode === 'releaseDesc' ? 'releaseAsc' : 'manual',
    );
  };

  if (data.length === 0) {
    return <Empty description="暂无需求，点击右上角「登记需求」开始" style={{ padding: '48px 0' }} />;
  }

  const sortMeta = SORT_MODE_META[sortMode];

  // 轮询分列：data[i] → 第 i % cols 列，保证阅读顺序与数据顺序一致
  const columns: Requirement[][] = Array.from({ length: cols }, () => []);
  data.forEach((req, i) => columns[i % cols].push(req));

  return (
    <div>
      {/* 工具行：排序切换（原表格表头排序迁移至此） */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Tooltip title={sortMeta.title}>
          <Button size="small" icon={<OrderedListOutlined />} onClick={cycleSortMode}>
            {sortMeta.text}
            {sortMode === 'releaseAsc' ? (
              <CaretUpOutlined style={{ fontSize: 10, color: '#1F1F1F' }} />
            ) : null}
            {sortMode === 'releaseDesc' ? (
              <CaretDownOutlined style={{ fontSize: 10, color: '#1F1F1F' }} />
            ) : null}
          </Button>
        </Tooltip>
      </div>

      <DndContext
        sensors={sensors}
        modifiers={[restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={data.map((r) => r.id)} strategy={rectSortingStrategy}>
          {/* 瀑布流：横向 flex 列容器，每列纵向堆叠 */}
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
                    branches={branches}
                    buildPlan={buildPlan}
                    selected={selectedReqIds.has(req.id)}
                    onToggleSelect={onToggleSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onChangeStatus={onChangeStatus}
                    onChangeReleaseDate={onChangeReleaseDate}
                  />
                ))}
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
