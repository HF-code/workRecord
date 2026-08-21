import { Button, DatePicker, Form, Input, Modal, Select, Space } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { STATUSES, VERSIONS, type Requirement, type Status, type Version } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import ProjectSelect from './ProjectSelect';

interface FormValues {
  name: string;
  tapdUrl: string;
  status: Status;
  releaseDate?: dayjs.Dayjs | null;
  version: Version;
  items: { id?: string; project: string; branch: string }[];
  remark?: string;
}

/** 表单提交的值（releaseDate 已格式化为 'YYYY-MM-DD'） */
export interface RequirementFormValues {
  name: string;
  tapdUrl: string;
  status: Status;
  releaseDate: string | null;
  version: Version;
  items: { id?: string; project: string; branch: string }[];
  remark?: string;
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

  const initialValues: FormValues = editing
    ? {
        name: editing.name,
        tapdUrl: editing.tapdUrl,
        status: editing.status,
        releaseDate: editing.releaseDate ? dayjs(editing.releaseDate) : null,
        version: editing.version ?? '大版',
        items: editing.items.map((it) => ({ id: it.id, project: it.project, branch: it.branch })),
        remark: editing.remark ?? '',
      }
    : {
        name: '',
        tapdUrl: '',
        status: '开发中',
        releaseDate: null,
        version: '大版',
        items: [{ project: undefined as unknown as string, branch: '' }],
        remark: '',
      };

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit({
      name: values.name.trim(),
      tapdUrl: values.tapdUrl.trim(),
      status: values.status,
      releaseDate: values.releaseDate ? values.releaseDate.format('YYYY-MM-DD') : null,
      version: values.version,
      items: values.items.map((it) => ({
        id: it.id,
        project: it.project,
        branch: it.branch.trim(),
      })),
      remark: values.remark?.trim() || undefined,
    });
  };

  return (
    <Modal
      key={editing?.id ?? 'new'}
      title={editing ? '编辑需求' : '登记需求'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
      width={720}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false} initialValues={initialValues}>
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
          <Form.Item name="version" label="版本" rules={[{ required: true }]} style={{ width: 140 }}>
            <Select options={VERSIONS.map((v) => ({ label: v, value: v }))} />
          </Form.Item>
        </Space>
        <Form.List name="items">
          {(fields, { add, remove }, { errors }) => (
            <>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>项目 / 分支</div>
              {fields.map((field) => (
                <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item
                    name={[field.name, 'project']}
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
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={3} placeholder="选填，补充说明" maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
