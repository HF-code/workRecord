import { Button, DatePicker, Empty, Popconfirm, Select, Table, Tag, Tooltip } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { STATUSES, STATUS_COLORS, type Requirement, type Status } from '../types';
import BuildControls from './BuildControls';

interface Props {
  data: Requirement[];
  onEdit: (req: Requirement) => void;
  onDelete: (id: string) => void;
  onChangeStatus: (id: string, status: Status) => void;
  onChangeReleaseDate: (id: string, date: string | null) => void;
}

export default function RequirementTable({
  data,
  onEdit,
  onDelete,
  onChangeStatus,
  onChangeReleaseDate,
}: Props) {
  const columns: ColumnsType<Requirement> = [
    {
      title: '需求名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div>
          <a href={record.tapdUrl} target="_blank" rel="noreferrer">
            {name} <ExportOutlined style={{ fontSize: 12 }} />
          </a>
          {record.remark ? (
            <div
              style={{
                fontSize: 12,
                color: '#888',
                marginTop: 2,
                wordBreak: 'break-all',
                lineHeight: '18px',
              }}
            >
              {record.remark}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: '项目 / 分支',
      key: 'items',
      width: 320,
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {record.items.map((it) => (
            <div key={it.id}>
              <Tag color="blue" style={{ marginRight: 0 }}>
                {it.project}
              </Tag>
              <div
                style={{
                  fontSize: 12,
                  color: '#888',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  lineHeight: '18px',
                  marginTop: 2,
                  marginBottom: 4,
                }}
              >
                {it.branch}
              </div>
              <BuildControls app={it.project} />
            </div>
          ))}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: Status, record) => (
        <Select
          value={status}
          size="small"
          style={{ width: 130 }}
          onChange={(v) => onChangeStatus(record.id, v)}
          options={STATUSES.map((s) => ({
            label: s,
            value: s,
          }))}
          labelRender={() => (
            <span
              style={{
                display: 'inline-block',
                padding: '0 7px',
                borderRadius: 4,
                fontSize: 12,
                lineHeight: '20px',
              }}
              className={`ant-tag ant-tag-${STATUS_COLORS[record.status]}`}
            >
              {record.status}
            </span>
          )}
        />
      ),
    },
    {
      title: '发版时间',
      dataIndex: 'releaseDate',
      key: 'releaseDate',
      width: 150,
      render: (date: string | null, record) => (
        <DatePicker
          size="small"
          allowClear
          value={date ? dayjs(date) : null}
          onChange={(d) => onChangeReleaseDate(record.id, d ? d.format('YYYY-MM-DD') : null)}
          placeholder="未设置"
          style={{ width: 130 }}
        />
      ),
    },
    {
      title: '登记时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 110,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <>
          <Button type="link" size="small" onClick={() => onEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除该需求？"
            description="删除后不可恢复"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(record.id)}
          >
            <Tooltip title="删除">
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Tooltip>
          </Popconfirm>
        </>
      ),
    },
  ];

  return (
    <Table<Requirement>
      rowKey="id"
      columns={columns}
      dataSource={data}
      pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
      locale={{ emptyText: <Empty description="暂无需求，点击右上角「登记需求」开始" /> }}
    />
  );
}
