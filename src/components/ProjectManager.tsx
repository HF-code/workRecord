import { useState } from 'react';
import { App as AntdApp, Button, Empty, Input, List, Modal, Popconfirm, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

interface Props {
  open: boolean;
  projects: string[];
  onChange: (projects: string[]) => void;
  onClose: () => void;
}

export default function ProjectManager({ open, projects, onChange, onClose }: Props) {
  const { message } = AntdApp.useApp();
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (projects.includes(name)) {
      message.warning('该项目已存在');
      return;
    }
    onChange([...projects, name]);
    setNewName('');
    message.success('已添加');
  };

  const handleDelete = (name: string) => {
    onChange(projects.filter((p) => p !== name));
    message.success('已删除');
  };

  return (
    <Modal
      title="项目管理"
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnClose
    >
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Input
          placeholder="输入新项目名称，回车或点击添加"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleAdd}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加
        </Button>
      </Space.Compact>
      <List
        size="small"
        bordered
        dataSource={projects}
        locale={{ emptyText: <Empty description="暂无项目" /> }}
        style={{ maxHeight: 400, overflow: 'auto' }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Popconfirm
                key="del"
                title="删除该项目？"
                description="不影响已登记需求中的记录"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(item)}
              >
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>,
            ]}
          >
            {item}
          </List.Item>
        )}
      />
    </Modal>
  );
}
