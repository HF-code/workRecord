import { useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Button, Card, DatePicker, Input, Select, Space, Typography, Upload } from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Requirement, Status } from './types';
import { loadProjects, loadRequirements, saveProjects, saveRequirements } from './storage';
import { downloadJson, buildExportPayload, exportAll, findOlderThanOneMonth, parseImportFile } from './export';
import RequirementForm from './components/RequirementForm';
import RequirementTable from './components/RequirementTable';
import StatsBar from './components/StatsBar';
import ProjectManager from './components/ProjectManager';

export default function App() {
  const { message, modal } = AntdApp.useApp();
  const [requirements, setRequirements] = useState<Requirement[]>(() => loadRequirements());
  const [projects, setProjects] = useState<string[]>(() => loadProjects());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [projectMgrOpen, setProjectMgrOpen] = useState(false);

  const [filterStatuses, setFilterStatuses] = useState<Status[]>([]);
  const [filterProject, setFilterProject] = useState<string | undefined>(undefined);
  const [filterReleaseDate, setFilterReleaseDate] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    saveRequirements(requirements);
  }, [requirements]);

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return requirements.filter((r) => {
      if (filterStatuses.length > 0 && !filterStatuses.includes(r.status)) return false;
      if (filterProject && !r.items.some((it) => it.project === filterProject)) return false;
      if (filterReleaseDate && r.releaseDate !== filterReleaseDate) return false;
      if (kw && !r.name.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [requirements, filterStatuses, filterProject, filterReleaseDate, keyword]);

  const updateRequirement = (id: string, patch: Partial<Requirement>) => {
    setRequirements((list) =>
      list.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
      ),
    );
  };

  const handleSubmit = (values: {
    name: string;
    tapdUrl: string;
    status: Status;
    releaseDate: string | null;
    items: { id?: string; project: string; branch: string }[];
  }) => {
    const now = new Date().toISOString();
    const items = values.items.map((it) => ({
      id: it.id ?? crypto.randomUUID(),
      project: it.project,
      branch: it.branch,
    }));
    if (editing) {
      updateRequirement(editing.id, { ...values, items });
      message.success('已保存');
    } else {
      setRequirements((list) => [
        {
          id: crypto.randomUUID(),
          ...values,
          items,
          createdAt: now,
          updatedAt: now,
        },
        ...list,
      ]);
      message.success('登记成功');
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    setRequirements((list) => list.filter((r) => r.id !== id));
    message.success('已删除');
  };

  const handleAddProject = (name: string) => {
    setProjects((list) => (list.includes(name) ? list : [...list, name]));
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
        const ids = new Set(targets.map((r) => r.id));
        setRequirements((list) => list.filter((r) => !ids.has(r.id)));
        message.success(`已导出并清理 ${targets.length} 条数据`);
      },
    });
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const { requirements: imported, invalidCount } = parseImportFile(text);
      if (imported.length === 0) {
        message.warning(
          invalidCount > 0 ? `没有可导入的数据（${invalidCount} 条格式非法）` : '文件中没有数据',
        );
        return;
      }
      const existingIds = new Set(requirements.map((r) => r.id));
      const fresh = imported.filter((r) => !existingIds.has(r.id));
      const dupCount = imported.length - fresh.length;
      if (fresh.length === 0) {
        message.info(`${imported.length} 条数据均已存在，无需导入`);
        return;
      }
      modal.confirm({
        title: '确认导入',
        content:
          `共解析出 ${imported.length} 条有效数据` +
          (dupCount > 0 ? `，其中 ${dupCount} 条与现有数据重复将跳过` : '') +
          (invalidCount > 0 ? `，${invalidCount} 条格式非法被丢弃` : '') +
          `。实际导入 ${fresh.length} 条。`,
        okText: '导入',
        cancelText: '取消',
        onOk: () => {
          setRequirements((list) => {
            const ids = new Set(list.map((r) => r.id));
            return [...imported.filter((r) => !ids.has(r.id)), ...list];
          });
          setProjects((list) => [
            ...new Set([...list, ...fresh.flatMap((r) => r.items.map((it) => it.project))]),
          ]);
          message.success(`已导入 ${fresh.length} 条数据`);
        },
      });
    } catch (e) {
      message.error(`导入失败：${(e as Error).message}`);
    }
  };

  const toggleStatusFilter = (status: Status) => {
    setFilterStatuses((list) =>
      list.includes(status) ? list.filter((s) => s !== status) : [...list, status],
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '24px 16px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
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
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                登记需求
              </Button>
              <Button onClick={() => setProjectMgrOpen(true)}>项目管理</Button>
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

          <div style={{ marginBottom: 16 }}>
            <StatsBar
              requirements={requirements}
              activeStatuses={filterStatuses}
              onToggle={toggleStatusFilter}
            />
          </div>

          <Space size="middle" wrap style={{ marginBottom: 16 }}>
            <Select
              mode="multiple"
              allowClear
              placeholder="状态筛选"
              style={{ minWidth: 220 }}
              value={filterStatuses}
              onChange={setFilterStatuses}
              options={[...new Set(requirements.map((r) => r.status))].map((s) => ({
                label: s,
                value: s,
              }))}
              maxTagCount="responsive"
            />
            <Select
              allowClear
              showSearch
              placeholder="项目筛选"
              style={{ minWidth: 180 }}
              value={filterProject}
              onChange={setFilterProject}
              options={projects.map((p) => ({ label: p, value: p }))}
            />
            <DatePicker
              allowClear
              placeholder="按发版日期筛选"
              value={filterReleaseDate ? dayjs(filterReleaseDate) : null}
              onChange={(d) => setFilterReleaseDate(d ? d.format('YYYY-MM-DD') : null)}
              presets={[{ label: '今天', value: dayjs() }]}
            />
            <Input.Search
              allowClear
              placeholder="搜索需求名"
              style={{ width: 220 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </Space>

          <RequirementTable
            data={filtered}
            onEdit={(req) => {
              setEditing(req);
              setFormOpen(true);
            }}
            onDelete={handleDelete}
            onChangeStatus={(id, status) => updateRequirement(id, { status })}
            onChangeReleaseDate={(id, releaseDate) => updateRequirement(id, { releaseDate })}
          />
        </Card>
      </div>

      <RequirementForm
        open={formOpen}
        editing={editing}
        projects={projects}
        onAddProject={handleAddProject}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />

      <ProjectManager
        open={projectMgrOpen}
        projects={projects}
        onChange={setProjects}
        onClose={() => setProjectMgrOpen(false)}
      />
    </div>
  );
}
