import { DatePicker, Input, Select, Space } from 'antd';
import dayjs from 'dayjs';
import type { Status } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import { projectLabel } from './ProjectSelect';

export interface FilterValue {
  statuses: Status[];
  project?: string;
  releaseDate: string | null;
  keyword: string;
}

interface Props {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  statusOptions: Status[];
  apps: DevopsApp[];
}

export default function FilterBar({ value, onChange, statusOptions, apps }: Props) {
  const patch = (p: Partial<FilterValue>) => onChange({ ...value, ...p });

  return (
    <Space size="middle" wrap style={{ marginBottom: 16 }}>
      <Select
        mode="multiple"
        allowClear
        placeholder="状态筛选"
        style={{ minWidth: 220 }}
        value={value.statuses}
        onChange={(statuses) => patch({ statuses })}
        options={statusOptions.map((s) => ({ label: s, value: s }))}
        maxTagCount="responsive"
      />
      <Select
        allowClear
        showSearch
        optionFilterProp="label"
        placeholder="项目筛选"
        style={{ minWidth: 220 }}
        value={value.project}
        onChange={(project) => patch({ project })}
        options={apps.map((a) => ({ label: projectLabel(a), value: a.app }))}
      />
      <DatePicker
        allowClear
        placeholder="按发版日期筛选"
        value={value.releaseDate ? dayjs(value.releaseDate) : null}
        onChange={(d) => patch({ releaseDate: d ? d.format('YYYY-MM-DD') : null })}
        presets={[{ label: '今天', value: dayjs() }]}
      />
      <Input.Search
        allowClear
        placeholder="搜索需求名"
        style={{ width: 220 }}
        value={value.keyword}
        onChange={(e) => patch({ keyword: e.target.value })}
      />
    </Space>
  );
}
