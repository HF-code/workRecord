import { useState } from 'react';
import { Button, Divider, Input, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  projects: string[];
  onAddProject: (name: string) => void;
}

export default function ProjectSelect({ value, onChange, projects, onAddProject }: Props) {
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (!projects.includes(name)) {
      onAddProject(name);
    }
    onChange?.(name);
    setNewName('');
  };

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder="选择项目"
      showSearch
      style={{ width: '100%' }}
      options={projects.map((p) => ({ label: p, value: p }))}
      popupRender={(menu) => (
        <>
          {menu}
          <Divider style={{ margin: '8px 0' }} />
          <Space style={{ padding: '0 8px 4px' }}>
            <Input
              placeholder="新项目名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onPressEnter={handleAdd}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <Button type="text" icon={<PlusOutlined />} onClick={handleAdd}>
              添加
            </Button>
          </Space>
        </>
      )}
    />
  );
}
