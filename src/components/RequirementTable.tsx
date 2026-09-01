import { App as AntdApp, Button, Checkbox, DatePicker, Empty, Popconfirm, Select, Table, Tag, Tooltip } from 'antd';
import { BuildOutlined, CaretDownOutlined, CaretUpOutlined, ExportOutlined, HolderOutlined, MergeOutlined } from '@ant-design/icons';
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DraggableAttributes, type DraggableSyntheticListeners } from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import dayjs from 'dayjs';
import { createContext, useContext, useState, type HTMLAttributes } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { STATUSES, STATUS_COLORS, type Requirement, type SortMode, type Status, type ProjectBranch } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import type { BranchConfig } from '../config/branches';
import { buildMergeRequestUrl, getCsrfToken, type BuildEnv } from '../build';
import { startBuildTask } from '../hooks/useBuildTasks';

interface BuildPlan {
  getEnv: (req: Requirement) => BuildEnv;
  setEnv: (req: Requirement, env: BuildEnv) => void;
  getSelected: (req: Requirement) => Set<string>;
  toggleItem: (req: Requirement, itemId: string, checked: boolean) => void;
  toggleAll: (req: Requirement, checked: boolean) => void;
}

interface Props {
  data: Requirement[];
  apps: DevopsApp[];
  branches: BranchConfig[];
  buildPlan: BuildPlan;
  onEdit: (req: Requirement) => void;
  onDelete: (id: string) => void;
  onChangeStatus: (id: string, status: Status) => void;
  onChangeReleaseDate: (id: string, date: string | null) => void;
  /** 拖拽排序落点：把 activeId 行移动到 overId 行的位置（在完整数据上重排） */
  onReorder: (activeId: string, overId: string) => void;
  /** 最近一次排序模式（仅作表头指示：manual 表示手动顺序，排序/拖拽后由页面层维护） */
  sortMode: SortMode;
  /** 切换排序模式（发版时间排序为一次性真实重排，重排后仍可继续拖拽） */
  onChangeSortMode: (mode: SortMode) => void;
}

/** 行与把手之间的桥接：SortableRow 上拿到的拖拽事件只绑定到把手图标，避免干扰行内其他交互控件 */
const DragHandleContext = createContext<{
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
} | null>(null);

interface SortableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  'data-row-key': string;
}

/** 可排序表格行：transform 跟随拖拽位移，把手见 DragHandle */
function SortableRow({ style, ...props }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props['data-row-key'],
  });
  return (
    <DragHandleContext.Provider value={{ attributes, listeners }}>
      <tr
        {...props}
        ref={setNodeRef}
        style={{
          ...style,
          transform: CSS.Translate.toString(transform),
          transition,
          ...(isDragging ? { position: 'relative', zIndex: 999 } : {}),
        }}
      />
    </DragHandleContext.Provider>
  );
}

/** 拖拽把手：可聚焦（键盘空格拾起、方向键移动），触摸拖拽需 touchAction: 'none' */
function DragHandle() {
  const ctx = useContext(DragHandleContext);
  return (
    <span
      data-testid="requirement-drag-handle"
      aria-label="拖拽排序"
      style={{ cursor: 'grab', color: '#999', touchAction: 'none', display: 'inline-flex' }}
      {...ctx?.attributes}
      {...ctx?.listeners}
    >
      <HolderOutlined />
    </span>
  );
}

/** 表头排序指示器：上下双箭头，激活方向高亮（仿 antd Table 排序指示） */
function SortIndicator({ mode }: { mode: SortMode }) {
  return (
    <span
      style={{ display: 'inline-flex', flexDirection: 'column', gap: 0, marginLeft: 4, verticalAlign: 'middle', lineHeight: 0.6 }}
    >
      <CaretUpOutlined style={{ fontSize: 9, color: mode === 'releaseAsc' ? '#1677ff' : '#bbb' }} />
      <CaretDownOutlined style={{ fontSize: 9, color: mode === 'releaseDesc' ? '#1677ff' : '#bbb' }} />
    </span>
  );
}

export default function RequirementTable({
  data,
  apps,
  branches,
  buildPlan,
  onEdit,
  onDelete,
  onChangeStatus,
  onChangeReleaseDate,
  onReorder,
  sortMode,
  onChangeSortMode,
}: Props) {
  const { message } = AntdApp.useApp();
  const [buildingReq, setBuildingReq] = useState<Record<string, boolean>>({});

  // distance: 1 防止点击误触拖拽；KeyboardSensor 支持键盘无障碍排序
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 1 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** 拖拽落点：交给上层在完整数据上重排（兼容筛选视图）。排序后数据已真实排好，拖拽始终可用 */
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };

  /** 表头点击循环切换：手动 → 发版时间降序 → 发版时间升序 → 手动（排序为一次性重排，"手动"仅清指示） */
  const cycleSortMode = () => {
    onChangeSortMode(sortMode === 'manual' ? 'releaseDesc' : sortMode === 'releaseDesc' ? 'releaseAsc' : 'manual');
  };

  const envOptions = branches.map((b) => ({ label: b.label, value: b.value }));

  const handleOpenMr = (req: Requirement, item: ProjectBranch) => {
    const gitUrl = apps.find((a) => a.app === item.project)?.gitUrl;
    if (!gitUrl) {
      message.warning(`【${item.project}】未配置 Git 仓库地址，请先在「系统配置 → 项目配置」填写`);
      return;
    }
    if (!item.branch) {
      message.warning('该项目未填写开发分支，无法生成 MR 链接');
      return;
    }
    const target = buildPlan.getEnv(req);
    window.open(buildMergeRequestUrl(gitUrl, item.branch, target), '_blank', 'noreferrer');
  };

  const handleBuild = async (req: Requirement) => {
    if (!getCsrfToken()) {
      message.warning('未登录运维平台，请先登录后再构建');
      return;
    }
    const selected = buildPlan.getSelected(req);
    const targets = req.items.filter((it) => selected.has(it.id));
    if (targets.length === 0) {
      message.warning('请先勾选要构建的项目');
      return;
    }
    setBuildingReq((m) => ({ ...m, [req.id]: true }));

    try {
      // 每个 target 作为独立任务交给全局构建任务 store 处理（含自动轮询重试）。
      // 任务状态可在「构建任务」面板查看 / 取消，切换标签页或最小化仍会继续。
      const results = await Promise.all(
        targets.map((it) =>
          startBuildTask(req.name, it.project, buildPlan.getEnv(req)),
        ),
      );
      let okCount = 0;
      const fails: string[] = [];
      let authFailed = false;
      results.forEach((r, i) => {
        const app = targets[i].project;
        if (r.ok) {
          okCount += 1;
        } else if (r.status === 401 || r.status === 403) {
          authFailed = true;
        } else if (r.detail === '已取消') {
          // 用户主动取消，不额外提示
        } else {
          fails.push(`【${app}】${r.detail}`);
        }
      });
      if (authFailed) {
        message.error('登录态已失效，请重新登录运维平台');
        return;
      }
      if (fails.length > 0) {
        message.error(`构建失败：${fails.join('；')}`);
        if (okCount > 0) message.success(`成功触发 ${okCount} 个项目构建`);
        return;
      }
      if (okCount > 0) {
        message.success(`【${req.name}】已触发 ${okCount} 个项目构建`);
      }
    } finally {
      setBuildingReq((m) => ({ ...m, [req.id]: false }));
    }
  };

  const columns: ColumnsType<Requirement> = [
    {
      title: '',
      key: 'dragHandle',
      width: 36,
      align: 'center',
      render: () => <DragHandle />,
    },
    {
      title: '需求名称',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      render: (name: string, record) => (
        <div>
          <a href={record.tapdUrl} target="_blank" rel="noreferrer">
            {name} <ExportOutlined style={{ fontSize: 12 }} />
          </a>
          <Tag
            color={record.version === '独立' ? 'purple' : 'geekblue'}
            style={{ marginLeft: 6, fontSize: 12, lineHeight: '18px' }}
          >
            {record.version ?? '大版'}
          </Tag>
          {record.remark ? (
            <div
              style={{
                fontSize: 12,
                color: '#888',
                marginTop: 2,
                wordBreak: 'break-all',
                lineHeight: '18px',
              }}
            >
              {record.remark}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: '项目 / 分支',
      key: 'items',
      width: 260,
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {record.items.map((it) => (
            <div key={it.id}>
              <Tag color="blue" style={{ marginRight: 0 }}>
                {it.project}
              </Tag>
              <div
                style={{
                  fontSize: 12,
                  color: '#888',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  lineHeight: '18px',
                  marginTop: 2,
                }}
              >
                {it.branch}
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: '目标分支 / 构建',
      key: 'build',
      width: 360,
      render: (_, record) => {
        const selected = buildPlan.getSelected(record);
        const allChecked = record.items.length > 0 && record.items.every((it) => selected.has(it.id));
        const indeterminate = record.items.some((it) => selected.has(it.id)) && !allChecked;
        const building = !!buildingReq[record.id];
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
              <Checkbox
                checked={allChecked}
                indeterminate={indeterminate}
                onChange={(e) => buildPlan.toggleAll(record, e.target.checked)}
              >
                全选
              </Checkbox>
              <Select
                size="small"
                value={buildPlan.getEnv(record)}
                onChange={(v) => buildPlan.setEnv(record, v)}
                options={envOptions}
                style={{ flex: 1, minWidth: 80 }}
              />
              <Button
                size="small"
                type="primary"
                icon={<BuildOutlined />}
                loading={building}
                disabled={selected.size === 0}
                style={{ flexShrink: 0 }}
                onClick={() => void handleBuild(record)}
              >
                构建
              </Button>
            </div>
            {record.items.map((it) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Checkbox
                  checked={selected.has(it.id)}
                  onChange={(e) => buildPlan.toggleItem(record, it.id, e.target.checked)}
                />
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{it.project}</span>
                <Button size="small" icon={<MergeOutlined />} onClick={() => handleOpenMr(record, it)}>
                  提交MR
                </Button>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: Status, record) => (
        <Select
          value={status}
          size="small"
          style={{ width: 130 }}
          onChange={(v) => onChangeStatus(record.id, v)}
          options={STATUSES.map((s) => ({
            label: s,
            value: s,
          }))}
          labelRender={() => (
            <span
              style={{
                display: 'inline-block',
                padding: '0 7px',
                borderRadius: 4,
                fontSize: 12,
                lineHeight: '20px',
              }}
              className={`ant-tag ant-tag-${STATUS_COLORS[record.status]}`}
            >
              {record.status}
            </span>
          )}
        />
      ),
    },
    {
      title: (
        <span
          onClick={cycleSortMode}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          title="点击自动排序：手动 → 发版时间降序 → 发版时间升序（排序后可继续拖拽微调）"
          data-testid="release-date-sort-header"
        >
          发版时间
          <SortIndicator mode={sortMode} />
        </span>
      ),
      dataIndex: 'releaseDate',
      key: 'releaseDate',
      width: 150,
      render: (date: string | null, record) => (
        <DatePicker
          size="small"
          allowClear
          value={date ? dayjs(date) : null}
          onChange={(d) => onChangeReleaseDate(record.id, d ? d.format('YYYY-MM-DD') : null)}
          placeholder="未设置"
          style={{ width: 130 }}
        />
      ),
    },
    {
      title: '登记时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 110,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <>
          <Button type="link" size="small" onClick={() => onEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除该需求？"
            description="删除后不可恢复"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(record.id)}
          >
            <Tooltip title="删除">
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Tooltip>
          </Popconfirm>
        </>
      ),
    },
  ];

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={data.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <Table<Requirement>
          rowKey="id"
          columns={columns}
          dataSource={data}
          components={{ body: { row: SortableRow } }}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="暂无需求，点击右上角「登记需求」开始" /> }}
        />
      </SortableContext>
    </DndContext>
  );
}
