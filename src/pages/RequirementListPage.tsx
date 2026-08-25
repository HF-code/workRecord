import { useMemo, useState } from 'react';
import { App as AntdApp, Button, Card, Space, Typography, Upload } from 'antd';
import { BarChartOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { Requirement, Status } from '../types';
import { downloadJson, buildExportPayload, exportAll, findOlderThanOneMonth, parseImportFile } from '../export';
import { useDevopsApps, useBranches, useRequirements } from '../hooks/useWorkTracker';
import { getDefaultBranch } from '../config/branches';
import RequirementForm, { type RequirementFormValues } from '../components/RequirementForm';
import RequirementTable from '../components/RequirementTable';
import StatsBar from '../components/StatsBar';
import ProjectStatsModal from '../components/ProjectStatsModal';
import FilterBar, { type FilterValue } from '../components/FilterBar';

const INITIAL_FILTER: FilterValue = {
  statuses: [],
  project: undefined,
  releaseDateRange: null,
  keyword: '',
};

export default function RequirementListPage() {
  const { message, modal } = AntdApp.useApp();
  const { requirements, upsert, update, remove, removeMany, merge } = useRequirements();
  const devopsApps = useDevopsApps();
  const { branches } = useBranches();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>(INITIAL_FILTER);

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
    message.success(isEdit ? '已保存' : '登记成功');
    closeForm();
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
        defaultBranch={getDefaultBranch(branches)}
        onEdit={openEditForm}
        onDelete={handleDelete}
        onChangeStatus={(id, status) => update(id, { status })}
        onChangeReleaseDate={(id, releaseDate) => update(id, { releaseDate })}
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
    </Card>
  );
}
