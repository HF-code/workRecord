import { useMemo, useState } from 'react';
import { App as AntdApp, Badge, Button, Card, Drawer, Empty, Space, Tag, Typography, Upload } from 'antd';
import { BarChartOutlined, PlusOutlined, UploadOutlined, ContainerOutlined } from '@ant-design/icons';
import type { Requirement, SortMode, Status } from '../types';
import { downloadJson, buildExportPayload, exportAll, findOlderThanOneMonth, parseImportFile } from '../export';
import { useDevopsApps, useBranches, useBuildPlan, useRequirements } from '../hooks/useWorkTracker';
import { getDefaultBranch } from '../config/branches';
import RequirementForm, { type RequirementFormValues } from '../components/RequirementForm';
import RequirementTable from '../components/RequirementTable';
import StatsBar from '../components/StatsBar';
import ProjectStatsModal from '../components/ProjectStatsModal';
import FilterBar, { type FilterValue } from '../components/FilterBar';
import { useBuildTasks, type BuildTaskPhase } from '../hooks/useBuildTasks';

const INITIAL_FILTER: FilterValue = {
  statuses: [],
  project: undefined,
  releaseDateRange: null,
  keyword: '',
};

export default function RequirementListPage() {
  const { message, modal } = AntdApp.useApp();
  const { requirements, upsert, update, remove, removeMany, merge, reorder, moveToPublishedTop, sortByReleaseDate } =
    useRequirements();
  const devopsApps = useDevopsApps();
  const { branches } = useBranches();
  const buildPlan = useBuildPlan(update, getDefaultBranch(branches));
  const { tasks, activeCount, cancelTask, removeTask, clear } = useBuildTasks();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>(INITIAL_FILTER);
  const [sortMode, setSortMode] = useState<SortMode>('manual');

  const filtered = useMemo(() => {
    const kw = filter.keyword.trim().toLowerCase();
    return requirements.filter((r) => {
      if (filter.statuses.length > 0 && !filter.statuses.includes(r.status)) return false;
      if (filter.project && !r.items.some((it) => it.project === filter.project)) return false;
      if (
        filter.releaseDateRange &&
        (r.releaseDate === null ||
          r.releaseDate < filter.releaseDateRange[0] ||
          r.releaseDate > filter.releaseDateRange[1])
      ) {
        return false;
      }
      if (kw && !r.name.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [requirements, filter]);

  const statusOptions = useMemo(
    () => [...new Set(requirements.map((r) => r.status))],
    [requirements],
  );

  /**
   * 切换排序：发版时间排序为一次性真实重排数据（自动排），排完仍可继续手动拖拽；
   * sortMode 仅作表头指示——手动拖拽后自动熄灭（见 handleReorder）
   */
  const handleChangeSortMode = (mode: SortMode) => {
    setSortMode(mode);
    if (mode !== 'manual') sortByReleaseDate(mode);
  };

  /** 拖拽排序：数据重排 + 退出排序指示状态（表头恢复中性，表示当前为手动顺序） */
  const handleReorder = (activeId: string, overId: string) => {
    if (sortMode !== 'manual') setSortMode('manual');
    reorder(activeId, overId);
  };

  const toggleStatusFilter = (status: Status) => {
    setFilter((f) => ({
      ...f,
      statuses: f.statuses.includes(status)
        ? f.statuses.filter((s) => s !== status)
        : [...f.statuses, status],
    }));
  };

  const openCreateForm = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEditForm = (req: Requirement) => {
    setEditing(req);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleSubmit = (values: RequirementFormValues) => {
    const isEdit = upsert(editing?.id ?? null, values);
    // 编辑保存后状态变为「已发布」，同样沉到尾部已发布区最前（与表格行内切换行为一致）
    if (editing && editing.status !== '已发布' && values.status === '已发布') {
      moveToPublishedTop(editing.id);
      message.info('已发布的需求已自动沉底');
    }
    message.success(isEdit ? '已保存' : '登记成功');
    closeForm();
  };

  /** 修改状态：切到「已发布」时自动沉底——移到尾部连续已发布区的最前面 */
  const handleStatusChange = (id: string, status: Status) => {
    update(id, { status });
    if (status === '已发布') {
      moveToPublishedTop(id);
      message.info('已发布的需求已自动沉底');
    }
  };

  const handleDelete = (id: string) => {
    remove(id);
    message.success('已删除');
  };

  const handleExportAll = () => {
    if (requirements.length === 0) {
      message.info('暂无数据可导出');
      return;
    }
    exportAll(requirements);
    message.success('已导出全部数据');
  };

  const handleExportAndClean = () => {
    const targets = findOlderThanOneMonth(requirements);
    if (targets.length === 0) {
      message.info('无可清理数据');
      return;
    }
    modal.confirm({
      title: '导出并清理一个月前数据',
      content: `将先导出 ${targets.length} 条数据到本地文件，再从浏览器缓存中删除，删除后不可恢复（请保留好导出文件）。`,
      okText: '导出并删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        downloadJson(buildExportPayload('archive', targets));
        removeMany(new Set(targets.map((r) => r.id)));
        message.success(`已导出并清理 ${targets.length} 条数据`);
      },
    });
  };

  const handleImportFile = async (file: File) => {
    try {
      const { requirements: imported, invalidCount } = parseImportFile(await file.text());
      if (imported.length === 0) {
        message.warning(
          invalidCount > 0 ? `没有可导入的数据（${invalidCount} 条格式非法）` : '文件中没有数据',
        );
        return;
      }
      const existingIds = new Set(requirements.map((r) => r.id));
      const freshCount = imported.filter((r) => !existingIds.has(r.id)).length;
      if (freshCount === 0) {
        message.info(`${imported.length} 条数据均已存在，无需导入`);
        return;
      }
      modal.confirm({
        title: '确认导入',
        content:
          `共解析出 ${imported.length} 条有效数据` +
          (imported.length > freshCount ? `，其中 ${imported.length - freshCount} 条与现有数据重复将跳过` : '') +
          (invalidCount > 0 ? `，${invalidCount} 条格式非法被丢弃` : '') +
          `。实际导入 ${freshCount} 条。`,
        okText: '导入',
        cancelText: '取消',
        onOk: () => {
          const fresh = merge(imported);
          message.success(`已导入 ${fresh.length} 条数据`);
        },
      });
    } catch (e) {
      message.error(`导入失败：${(e as Error).message}`);
    }
  };

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          工作记录
        </Typography.Title>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateForm}>
            登记需求
          </Button>
          <Upload
            accept=".json,application/json"
            showUploadList={false}
            beforeUpload={(file) => {
              void handleImportFile(file);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />}>导入数据</Button>
          </Upload>
          <Button onClick={handleExportAll}>导出全部</Button>
          <Button onClick={handleExportAndClean}>导出并清理一月前数据</Button>
          <Badge count={activeCount} size="small" offset={[-2, 2]}>
            <Button
              icon={<ContainerOutlined />}
              onClick={() => setTasksOpen(true)}
              data-testid="build-tasks-open-button"
            >
              构建任务
            </Button>
          </Badge>
        </Space>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <StatsBar
          requirements={requirements}
          activeStatuses={filter.statuses}
          onToggle={toggleStatusFilter}
        />
        <Button
          type="text"
          icon={<BarChartOutlined />}
          onClick={() => setStatsOpen(true)}
          style={{ flexShrink: 0, color: '#1677ff' }}
        >
          统计项目
        </Button>
      </div>

      <FilterBar
        value={filter}
        onChange={setFilter}
        statusOptions={statusOptions}
        apps={devopsApps.apps}
      />

      <RequirementTable
        data={filtered}
        apps={devopsApps.apps}
        branches={branches}
        buildPlan={buildPlan}
        onEdit={openEditForm}
        onDelete={handleDelete}
        onChangeStatus={handleStatusChange}
        onChangeReleaseDate={(id, releaseDate) => update(id, { releaseDate })}
        onReorder={handleReorder}
        sortMode={sortMode}
        onChangeSortMode={handleChangeSortMode}
      />

      <RequirementForm
        open={formOpen}
        editing={editing}
        apps={devopsApps.apps}
        onCancel={closeForm}
        onSubmit={handleSubmit}
      />

      <ProjectStatsModal
        open={statsOpen}
        requirements={filtered}
        onClose={() => setStatsOpen(false)}
      />

      <Drawer
        title={`构建任务${activeCount > 0 ? `（进行中 ${activeCount}）` : ''}`}
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        width={460}
        extra={
          tasks.length > 0 ? (
            <Button type="link" onClick={clear} data-testid="build-tasks-clear-button">
              清空记录
            </Button>
          ) : null
        }
      >
        {tasks.length === 0 ? (
          <Empty description="暂无构建任务" />
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {tasks.map((t) => (
              <BuildTaskItem
                key={t.id}
                task={t}
                onCancel={() => cancelTask(t.id)}
                onRemove={() => removeTask(t.id)}
              />
            ))}
          </Space>
        )}
      </Drawer>
    </Card>
  );
}

const TASK_PHASE_TEXT: Record<BuildTaskPhase, { text: string; color: string }> = {
  building: { text: '构建中', color: 'processing' },
  waiting: { text: '等待重试', color: 'warning' },
  done: { text: '已完成', color: 'success' },
  failed: { text: '失败', color: 'error' },
  cancelled: { text: '已取消', color: 'default' },
};

function BuildTaskItem({
  task,
  onCancel,
  onRemove,
}: {
  task: import('../hooks/useBuildTasks').BuildTask;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const phase = TASK_PHASE_TEXT[task.phase];
  const active = task.phase === 'building' || task.phase === 'waiting';
  return (
    <Card size="small" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{task.reqName}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#555' }}>
            {task.app} · {task.env}
          </div>
          <div style={{ marginTop: 6 }}>
            <Tag color={phase.color}>{phase.text}</Tag>
            {task.phase === 'waiting' && (
              <span style={{ fontSize: 12, color: '#888' }}>
                第 {task.retry} 次重试，{task.nextInSec}s 后
              </span>
            )}
            {task.detail && task.phase !== 'building' && (
              <div style={{ fontSize: 12, color: '#999', marginTop: 4, wordBreak: 'break-all' }}>
                {task.detail}
              </div>
            )}
            {task.recordUrl && (
              <div style={{ marginTop: 4 }}>
                <a
                  href={task.recordUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12 }}
                  data-testid="build-task-record-link"
                >
                  查看构建记录
                </a>
              </div>
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {active ? (
            <Button
              danger
              size="small"
              onClick={onCancel}
              data-testid="build-task-cancel-button"
            >
              取消
            </Button>
          ) : (
            <Button size="small" onClick={onRemove} data-testid="build-task-remove-button">
              移除
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
