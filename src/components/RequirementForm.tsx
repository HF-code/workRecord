import { useEffect } from 'react';
import { Button, DatePicker, Form, Input, Modal, Select, Space } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { STATUSES, type Requirement, type Status } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import ProjectSelect from './ProjectSelect';

interface FormValues {
  name: string;
  tapdUrl: string;
  status: Status;
  releaseDate?: dayjs.Dayjs | null;
  items: { id?: string; project: string; branch: string }[];
}

/** 表单提交的值（releaseDate 已格式化为 'YYYY-MM-DD'） */
export interface RequirementFormValues {
  name: string;
  tapdUrl: string;
  status: Status;
  releaseDate: string | null;
  items: { id?: string; project: string; branch: string }[];
}

interface Props {
  open: boolean;
  editing: Requirement | null;
  apps: DevopsApp[];
  onCancel: () => void;
  onSubmit: (values: RequirementFormValues) => void;
}

export default function RequirementForm({ open, editing, apps, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        tapdUrl: editing.tapdUrl,
        status: editing.status,
        releaseDate: editing.releaseDate ? dayjs(editing.releaseDate) : null,
        items: editing.items.map((it) => ({ id: it.id, project: it.project, branch: it.branch })),
      });
    } else {
      form.setFieldsValue({
        name: '',
        tapdUrl: '',
        status: '开发中',
        releaseDate: null,
        items: [{ project: undefined as unknown as string, branch: '' }],
      });
    }
  }, [open, editing, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit({
      name: values.name.trim(),
      tapdUrl: values.tapdUrl.trim(),
      status: values.status,
      releaseDate: values.releaseDate ? values.releaseDate.format('YYYY-MM-DD') : null,
      items: values.items.map((it) => ({
        id: it.id,
        project: it.project,
        branch: it.branch.trim(),
      })),
    });
  };

  return (
    <Modal
      title={editing ? '编辑需求' : '登记需求'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
      width={720}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="name"
          label="需求名称"
          rules={[{ required: true, whitespace: true, message: '请输入需求名称' }]}
        >
          <Input placeholder="请输入需求名称" maxLength={100} />
        </Form.Item>
        <Form.Item
          name="tapdUrl"
          label="TAPD 链接"
          rules={[
            { required: true, message: '请输入 TAPD 链接' },
            { type: 'url', message: '请输入合法的 http(s) 链接' },
          ]}
        >
          <Input placeholder="https://www.tapd.cn/..." />
        </Form.Item>
        <Space size="large" style={{ display: 'flex' }}>
          <Form.Item name="status" label="状态" rules={[{ required: true }]} style={{ width: 200 }}>
            <Select options={STATUSES.map((s) => ({ label: s, value: s }))} />
          </Form.Item>
          <Form.Item name="releaseDate" label="发版时间" style={{ width: 200 }}>
            <DatePicker allowClear style={{ width: '100%' }} placeholder="可留空" />
          </Form.Item>
        </Space>
        <Form.List
          name="items"
          rules={[
            {
              validator: (_, items) =>
                items && items.length > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error('至少添加一条项目分支')),
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>项目 / 分支</div>
              {fields.map((field) => (
                <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item
                    name={[field.name, 'project']}
                    rules={[{ required: true, message: '请选择项目' }]}
                    style={{ width: 280, marginBottom: 0 }}
                  >
                    <ProjectSelect apps={apps} />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'branch']}
                    rules={[{ required: true, whitespace: true, message: '请输入分支' }]}
                    style={{ width: 320, marginBottom: 0 }}
                  >
                    <Input placeholder="开发分支，如 feat-xxx" />
                  </Form.Item>
                  <MinusCircleOutlined
                    onClick={() => remove(field.name)}
                    style={{ color: '#999' }}
                  />
                </Space>
              ))}
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  添加项目分支
                </Button>
                <Form.ErrorList errors={errors} />
              </Form.Item>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
