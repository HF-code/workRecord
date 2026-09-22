/**
 * 需求新增/编辑表单。
 *
 * 状态分工（关键设计）：**只托管标量字段，数组不交给表单库**。
 * - 标量字段（名称 / TAPD 链接 / 发版日期 / 版本 / 备注）由 antd Form 管理；
 * - `items`（项目 + 分支，三级数组）由本地 `useState` 独占，增删改查都是纯数组操作。
 *
 * 为什么不用 `Form.List`：那会让 items 同时存在于 React state 与表单内部 store 两份状态中，
 * 一旦回填时机或 `preserve` 配置不匹配，就会出现「编辑时新增分支、再次打开只剩一条空分支」
 * 这类数据丢失（`initialValues` 只在挂载时生效，对动态数组不可靠）。
 * 现在数据流单向：`editing` → 打开时一次性回填 → 本地 CRUD → 提交时整组交回 `onSubmit`。
 */
import { useEffect, useState } from 'react';
import { Button, DatePicker, Form, Input, Modal, Select, Space } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { VERSIONS, type Requirement, type RequirementInput, type Version } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import ProjectSelect from './ProjectSelect';

/** 表单内一行草稿（key 仅用于渲染与校验定位，提交时丢弃，不落库） */
interface ItemDraft {
  key: string;
  /** 已有条目沿用原 id，新增条目为 undefined（由 upsert 生成） */
  id?: string;
  project?: string;
  branch: string;
}

/** 草稿行 key 自增序号（渲染稳定，不使用随机数） */
let draftSeq = 0;

/** 新建一条空草稿行 */
function newDraft(): ItemDraft {
  draftSeq += 1;
  return { key: `draft-${draftSeq}`, project: undefined, branch: '' };
}

/** 由已有条目生成草稿行（沿用条目 id 作为 key，保证回填稳定） */
function draftOf(item: { id: string; project: string; branch: string }): ItemDraft {
  return { key: item.id, id: item.id, project: item.project, branch: item.branch };
}

/** antd Form 托管的标量字段 */
interface ScalarValues {
  name: string;
  tapdUrl: string;
  releaseDate?: dayjs.Dayjs | null;
  version: Version;
  remark?: string;
}

interface Props {
  open: boolean;
  editing: Requirement | null;
  apps: DevopsApp[];
  onCancel: () => void;
  onSubmit: (values: RequirementInput) => void;
}

export default function RequirementForm({ open, editing, apps, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm<ScalarValues>();
  /** 项目/分支草稿行（唯一数据源） */
  const [items, setItems] = useState<ItemDraft[]>([newDraft()]);
  /** 校验未通过的草稿行 key（驱动行级红色错误态） */
  const [invalidKeys, setInvalidKeys] = useState<Set<string>>(new Set());
  /** items 区整体错误提示 */
  const [itemsError, setItemsError] = useState<string | null>(null);

  // 回填时机：只在「打开弹窗」或「切换到另一条需求」时执行一次。
  // 依赖刻意用 editing?.id 而非 editing 对象——父层数据刷新会换掉对象引用，
  // 若跟着重跑会冲掉用户尚未保存的编辑内容。
  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: editing?.name ?? '',
      tapdUrl: editing?.tapdUrl ?? '',
      releaseDate: editing?.releaseDate ? dayjs(editing.releaseDate) : null,
      version: editing?.version ?? '大版',
      remark: editing?.remark ?? '',
    });
    setItems(editing && editing.items.length > 0 ? editing.items.map(draftOf) : [newDraft()]);
    setInvalidKeys(new Set());
    setItemsError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, form]);

  const patchItem = (key: string, patch: Partial<ItemDraft>) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const addItem = () => {
    setItems((list) => [...list, newDraft()]);
    setItemsError(null);
  };

  const removeItem = (key: string) => {
    setItems((list) => list.filter((it) => it.key !== key));
    setInvalidKeys((s) => {
      if (!s.has(key)) return s;
      const next = new Set(s);
      next.delete(key);
      return next;
    });
  };

  const handleOk = async () => {
    // 1) 标量字段校验（失败时 antd 抛错并自动聚焦）
    const values = await form.validateFields();

    // 2) 剥离「项目与分支都没填」的整行（用户点了添加但没填），不落库
    const kept = items.filter((it) => (it.project ?? '').trim() !== '' || it.branch.trim() !== '');
    if (kept.length === 0) {
      setInvalidKeys(new Set());
      setItemsError('请至少添加一个项目分支');
      return;
    }

    // 3) 逐行必填校验：项目与分支都不可为空
    const invalid = new Set<string>();
    for (const it of kept) {
      if (!(it.project ?? '').trim() || !it.branch.trim()) invalid.add(it.key);
    }
    if (invalid.size > 0) {
      setInvalidKeys(invalid);
      setItemsError('请补全标记为红色的行（项目与分支均为必填）');
      return;
    }

    // 4) 通过：把剥离后的列表同步回界面，保证「看到的就是提交的」
    setItems(kept);
    setInvalidKeys(new Set());
    setItemsError(null);
    onSubmit({
      name: values.name.trim(),
      tapdUrl: values.tapdUrl.trim(),
      releaseDate: values.releaseDate ? values.releaseDate.format('YYYY-MM-DD') : null,
      version: values.version,
      items: kept.map((it) => ({
        id: it.id,
        project: (it.project ?? '').trim(),
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
      <Form form={form} layout="vertical">
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
        <Space size="large" style={{ display: 'flex', flexWrap: 'wrap' }}>
          <Form.Item name="releaseDate" label="发版日期" style={{ width: 160 }}>
            <DatePicker allowClear style={{ width: '100%' }} placeholder="可留空" />
          </Form.Item>
          <Form.Item name="version" label="版本" rules={[{ required: true }]} style={{ width: 120 }}>
            <Select options={VERSIONS.map((v) => ({ label: v, value: v }))} />
          </Form.Item>
        </Space>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={3} placeholder="选填，补充说明" maxLength={500} showCount />
        </Form.Item>
      </Form>

      {/* 项目 / 分支：普通数组增删改查，不经过表单库托管 */}
      <div style={{ marginBottom: 8, fontWeight: 500 }}>项目 / 分支</div>
      {items.map((it, index) => {
        const invalid = invalidKeys.has(it.key);
        const projectMissing = invalid && !(it.project ?? '').trim();
        const branchMissing = invalid && !it.branch.trim();
        return (
          <div key={it.key} style={{ marginBottom: invalid ? 4 : 8 }} data-testid={`requirement-form-item-${index}`}>
            <Space style={{ display: 'flex' }} align="baseline">
              <div style={{ width: 280, flexShrink: 0 }}>
                <ProjectSelect
                  apps={apps}
                  value={it.project}
                  onChange={(v) => patchItem(it.key, { project: v })}
                  status={projectMissing ? 'error' : undefined}
                />
              </div>
              <Input
                value={it.branch}
                onChange={(e) => patchItem(it.key, { branch: e.target.value })}
                placeholder="开发分支，如 feat-xxx"
                status={branchMissing ? 'error' : undefined}
                style={{ width: 320 }}
                data-testid={`requirement-form-branch-input-${index}`}
              />
              <Button
                type="text"
                size="small"
                icon={<MinusCircleOutlined style={{ color: '#999' }} />}
                onClick={() => removeItem(it.key)}
                data-testid={`requirement-form-remove-item-${index}`}
              />
            </Space>
            {invalid ? (
              <div style={{ color: '#ff4d4f', fontSize: 12, marginBottom: 4 }}>请选择项目并填写分支</div>
            ) : null}
          </div>
        );
      })}
      <Button
        type="dashed"
        onClick={addItem}
        block
        icon={<PlusOutlined />}
        data-testid="requirement-form-add-item-button"
      >
        添加项目分支
      </Button>
      {itemsError ? (
        <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 8 }} data-testid="requirement-form-items-error">
          {itemsError}
        </div>
      ) : null}
    </Modal>
  );
}
