import { useState } from 'react';
import {
  App as AntdApp,
  Button,
  Card,
  Input,
  Popconfirm,
  Radio,
  Space,
  Table,
  Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { BranchConfig } from '../config/branches';
import { BUILTIN_BUILD_ENVS, DEFAULT_BRANCHES } from '../config/branches';
import type { BuildEnv } from '../build';
import { useBranches } from '../hooks/useWorkTracker';

export default function BranchConfigPage() {
  const { branches, save, reset } = useBranches();
  const { message } = AntdApp.useApp();
  const [draft, setDraft] = useState<BranchConfig[]>(branches);
  const [labelDraft, setLabelDraft] = useState('');
  const [valueDraft, setValueDraft] = useState('');

  // 外部 branches 变化（如重置）时同步 draft
  const syncDraft = (next: BranchConfig[]) => {
    setDraft(next);
  };

  const handleAdd = () => {
    const value = valueDraft.trim();
    const label = labelDraft.trim() || value;
    if (!value) {
      message.warning('请填写分支标识');
      return;
    }
    if (draft.some((b) => b.value === value)) {
      message.warning('该分支标识已存在');
      return;
    }
    // 允许自定义标识（运维平台新增环境无需改代码），非内置环境给轻提示防拼写错误
    if (!BUILTIN_BUILD_ENVS.includes(value)) {
      message.info('非内置环境，请确认运维平台支持该分支标识');
    }
    syncDraft([...draft, { value, label }]);
    setLabelDraft('');
    setValueDraft('');
  };

  const handleRemove = (value: BuildEnv) => {
    const next = draft.filter((b) => b.value !== value);
    syncDraft(next);
  };

  const handleSetDefault = (value: BuildEnv) => {
    syncDraft(draft.map((b) => ({ ...b, isDefault: b.value === value })));
  };

  const handleSave = () => {
    if (draft.length === 0) {
      message.warning('至少保留一个分支');
      return;
    }
    if (!draft.some((b) => b.isDefault)) {
      message.warning('请指定一个默认分支');
      return;
    }
    save(draft);
    message.success('分支配置已保存');
  };

  const handleReset = () => {
    reset();
    syncDraft(DEFAULT_BRANCHES);
    message.success('已恢复默认分支配置');
  };

  const columns: ColumnsType<BranchConfig> = [
    {
      title: '分支标识',
      dataIndex: 'value',
      key: 'value',
      width: 200,
      render: (value: BuildEnv) => <span style={{ fontFamily: 'monospace' }}>{value}</span>,
    },
    {
      title: '展示文案',
      dataIndex: 'label',
      key: 'label',
      width: 220,
      render: (label: string) => label || '—',
    },
    {
      title: '默认选中',
      key: 'isDefault',
      width: 140,
      render: (_, record) => (
        <Radio
          checked={!!record.isDefault}
          onChange={() => handleSetDefault(record.value)}
        >
          设为默认
        </Radio>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      render: (_, record) => (
        <Popconfirm
          title="删除该分支？"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => handleRemove(record.value)}
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        构建按钮前的分支下拉选项，可在此自定义增删与排序（拖拽行顺序调整）及默认选中项。
        内置环境：{BUILTIN_BUILD_ENVS.join(' / ')}；也可输入自定义分支标识（需运维平台支持）。
      </Typography.Paragraph>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Input
          placeholder="分支标识，如 test 或自定义"
          value={valueDraft}
          onChange={(e) => setValueDraft(e.target.value)}
          style={{ width: 180 }}
        />
        <Input
          placeholder="展示文案（选填，默认同标识）"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          style={{ width: 200 }}
        />
        <Button icon={<PlusOutlined />} onClick={handleAdd}>
          添加分支
        </Button>
        <Space style={{ marginLeft: 'auto' }}>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            恢复默认
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
            保存配置
          </Button>
        </Space>
      </div>

      <Table<BranchConfig>
        rowKey="value"
        bordered
        size="middle"
        columns={columns}
        dataSource={draft}
        pagination={false}
        locale={{ emptyText: '暂无分支，请在上方添加' }}
      />
    </Card>
  );
}
