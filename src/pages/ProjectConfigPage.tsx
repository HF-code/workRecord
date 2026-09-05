import { useMemo, useEffect, useState } from 'react';
import {
  App as AntdApp,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Table,
  Tag,
} from 'antd';
import { PlusOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { DEVOPS_GROUPS, type DevopsApp, type DevopsGroup } from '../config/devopsApps';
import { fetchDevopsApps } from '../build';
import { useDevopsApps } from '../hooks/useWorkTracker';
import { loadAutoBuildOnFail, saveAutoBuildOnFail } from '../storage';

const GROUP_COLORS: Record<DevopsGroup, string> = {
  JenkinsFrontweb: 'blue',
  JenkinsPAAS: 'purple',
};

interface AddFormValues {
  group: DevopsGroup;
  app: string;
  alias?: string;
  gitUrl?: string;
}

/** Git 仓库地址行内编辑：失焦/回车保存 */
function GitUrlInput({ value, onSave }: { value?: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value ?? '');

  useEffect(() => {
    setText(value ?? '');
  }, [value]);

  const save = () => {
    const trimmed = text.trim();
    if (trimmed !== (value ?? '')) onSave(trimmed);
  };

  return (
    <Input
      size="small"
      variant="filled"
      placeholder="选填，如 git@gitlab.vzan.com:group/repo.git"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onPressEnter={save}
    />
  );
}

export default function ProjectConfigPage() {
  const { apps, syncedAt, add, remove, update, mergeSynced } = useDevopsApps();
  const { message } = AntdApp.useApp();
  const [syncing, setSyncing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [autoBuildOnFail, setAutoBuildOnFail] = useState<boolean>(() => loadAutoBuildOnFail());
  const [form] = Form.useForm<AddFormValues>();

  const handleToggleAutoBuild = (checked: boolean) => {
    setAutoBuildOnFail(checked);
    saveAutoBuildOnFail(checked);
  };

  // 按项目名 / 别名 / Git 地址模糊过滤
  const filteredApps = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return apps;
    return apps.filter((a) => {
      const alias = (a.alias ?? '').toLowerCase();
      const gitUrl = (a.gitUrl ?? '').toLowerCase();
      return (
        a.app.toLowerCase().includes(kw) ||
        alias.includes(kw) ||
        gitUrl.includes(kw)
      );
    });
  }, [apps, keyword]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const remote = await fetchDevopsApps();
      const added = mergeSynced(remote);
      message.success(added > 0 ? `同步完成，新增 ${added} 个项目` : '同步完成，项目列表已是最新');
    } catch (e) {
      message.error((e as Error).message || '同步失败，请稍后重试');
    } finally {
      setSyncing(false);
    }
  };

  const handleAdd = async () => {
    const values = await form.validateFields();
    const app: DevopsApp = {
      app: values.app.trim(),
      alias: values.alias?.trim() ?? '',
      group: values.group,
      gitUrl: values.gitUrl?.trim() || undefined,
    };
    if (!add(app)) {
      message.warning('该项目已存在');
      return;
    }
    message.success('已添加');
    setAddOpen(false);
  };

  const columns: ColumnsType<DevopsApp> = [
    {
      title: '分组',
      dataIndex: 'group',
      key: 'group',
      width: 160,
      render: (group: DevopsGroup) => <Tag color={GROUP_COLORS[group]}>{group}</Tag>,
      filters: DEVOPS_GROUPS.map((g) => ({ text: g, value: g })),
      onFilter: (value, record) => record.group === value,
    },
    {
      title: '项目名',
      dataIndex: 'app',
      key: 'app',
      width: 220,
      render: (app: string) => <span style={{ fontFamily: 'monospace' }}>{app}</span>,
      sorter: (a, b) => a.app.localeCompare(b.app),
      defaultSortOrder: 'ascend',
    },
    {
      title: '别名',
      dataIndex: 'alias',
      key: 'alias',
      width: 220,
      render: (alias: string) => alias || <span style={{ color: '#bbb' }}>—</span>,
    },
    {
      title: 'Git 仓库地址',
      dataIndex: 'gitUrl',
      key: 'gitUrl',
      render: (gitUrl: string | undefined, record) => (
        <GitUrlInput value={gitUrl} onSave={(v) => update(record.app, { gitUrl: v || undefined })} />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      render: (_, record) => (
        <Popconfirm
          title="删除该项目？"
          description="不影响已登记需求中的记录"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => {
            remove(record.app);
            message.success('已删除');
          }}
        >
          <Button type="link" size="small" danger>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div style={{ color: '#888', fontSize: 12 }}>
          共 {apps.length} 个项目 · 最近同步：
          {syncedAt ? dayjs(syncedAt).format('YYYY-MM-DD HH:mm') : '从未同步'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input.Search
            allowClear
            placeholder="搜索项目名 / 别名 / Git 地址"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 280 }}
            data-testid="project-config-search-input"
          />
          <Button type="dashed" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            新增项目
          </Button>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            loading={syncing}
            onClick={() => void handleSync()}
          >
            一键同步
          </Button>
        </div>
      </div>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
        共 {apps.length} 个项目
        {keyword.trim() && `（匹配 ${filteredApps.length} 个）`} · 最近同步：
        {syncedAt ? dayjs(syncedAt).format('YYYY-MM-DD HH:mm') : '从未同步'}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          padding: '8px 12px',
          background: '#fafafa',
          borderRadius: 6,
        }}
      >
        <Switch
          checked={autoBuildOnFail}
          onChange={handleToggleAutoBuild}
          data-testid="project-config-auto-build-switch"
        />
        <span style={{ fontWeight: 500 }}>失败自动构建</span>
        <span style={{ color: '#888', fontSize: 12 }}>
          构建返回「上一任务尚未完成」时按配置间隔自动轮询重试（默认开启）
        </span>
      </div>
      <Table<DevopsApp>
        rowKey="app"
        bordered
        size="middle"
        columns={columns}
        dataSource={filteredApps}
        pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
        locale={{
          emptyText: (
            <Empty
              description={keyword.trim() ? '没有匹配的项目' : '暂无项目，点击右上角「一键同步」拉取'}
            />
          ),
        }}
      />

      <Modal
        title="新增项目"
        open={addOpen}
        onOk={() => void handleAdd()}
        onCancel={() => setAddOpen(false)}
        okText="添加"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false} initialValues={{ group: 'JenkinsFrontweb' }}>
          <Form.Item name="group" label="分组" rules={[{ required: true, message: '请选择分组' }]}>
            <Select options={DEVOPS_GROUPS.map((g) => ({ label: g, value: g }))} />
          </Form.Item>
          <Form.Item
            name="app"
            label="项目名"
            rules={[{ required: true, whitespace: true, message: '请输入项目名' }]}
          >
            <Input placeholder="与运维平台 app 名一致，如 live-h5-2" maxLength={100} />
          </Form.Item>
          <Form.Item name="alias" label="别名">
            <Input placeholder="选填，中文说明" maxLength={100} />
          </Form.Item>
          <Form.Item name="gitUrl" label="Git 仓库地址">
            <Input placeholder="选填，如 git@gitlab.vzan.com:group/repo.git" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
