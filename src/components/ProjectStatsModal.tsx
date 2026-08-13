import { useMemo } from 'react';
import { App as AntdApp, Button, Empty, Input, List, Modal, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { Requirement } from '../types';

interface Props {
  open: boolean;
  requirements: Requirement[];
  onClose: () => void;
}

export default function ProjectStatsModal({ open, requirements, onClose }: Props) {
  const { message } = AntdApp.useApp();

  // 各项目的需求数（一条需求涉及多个项目时分别计数，同需求内同项目只计一次）
  const stats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of requirements) {
      for (const p of new Set(r.items.map((it) => it.project))) {
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [requirements]);

  const namesText = stats.map(([p]) => `【${p}】`).join('\n');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(namesText);
    message.success('已复制');
  };

  return (
    <Modal
      title={`涉及项目（${stats.length} 个）`}
      open={open}
      onCancel={onClose}
      width={420}
      footer={null}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          当前筛选结果共 {requirements.length} 条需求，按需求数排序
        </Typography.Text>
        <Button
          type="primary"
          size="small"
          icon={<CopyOutlined />}
          onClick={handleCopy}
          disabled={stats.length === 0}
        >
          复制项目名
        </Button>
      </div>
      <Input.TextArea
        readOnly
        value={namesText}
        autoSize={{ minRows: 3, maxRows: 8 }}
        style={{ fontFamily: 'monospace', fontSize: 12, margin: '8px 0' }}
        onFocus={(e) => e.target.select()}
      />
      <List
        size="small"
        dataSource={stats}
        locale={{ emptyText: <Empty description="当前筛选结果不涉及任何项目" /> }}
        style={{ maxHeight: 300, overflow: 'auto' }}
        renderItem={([project, count]) => (
          <List.Item style={{ padding: '6px 0' }}>
            <span>{project}</span>
            <span style={{ marginLeft: 'auto', color: '#999', fontSize: 12 }}>{count} 条</span>
          </List.Item>
        )}
      />
    </Modal>
  );
}
