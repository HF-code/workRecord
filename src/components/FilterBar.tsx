import { Input, Select, Space } from 'antd';
import type { DevopsApp } from '../config/devopsApps';
import { projectLabel } from './ProjectSelect';

export interface FilterValue {
  project?: string;
  /** 发版日期（单选，值为 'YYYY-MM-DD'）；null = 不筛 */
  releaseDate?: string | null;
  keyword: string;
  /** 已达环境（任一轨当前阶段命中）；null = 不筛 */
  currentEnv?: string | null;
}

interface Props {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  /** 全部环境（已达环境筛选项，按轨序） */
  envOptions: string[];
  /** 全部需求已填的发版日期去重列表（降序，供单选） */
  dateOptions: string[];
  apps: DevopsApp[];
}

export default function FilterBar({ value, onChange, envOptions, dateOptions, apps }: Props) {
  const patch = (p: Partial<FilterValue>) => onChange({ ...value, ...p });

  return (
    <Space size="middle" wrap style={{ marginBottom: 16 }}>
      <Select
        allowClear
        showSearch
        optionFilterProp="label"
        placeholder="项目筛选"
        style={{ minWidth: 200 }}
        value={value.project}
        onChange={(project) => patch({ project })}
        options={apps.map((a) => ({ label: projectLabel(a), value: a.app }))}
        data-testid="filter-project-select"
      />
      <Select
        allowClear
        placeholder="已达环境（任一轨）"
        style={{ minWidth: 160 }}
        value={value.currentEnv ?? undefined}
        onChange={(env) => patch({ currentEnv: env ?? null })}
        options={envOptions.map((e) => ({ label: e, value: e }))}
        data-testid="filter-env-select"
      />
      <Select
        allowClear
        placeholder="发版日期"
        style={{ minWidth: 140 }}
        value={value.releaseDate ?? undefined}
        onChange={(d) => patch({ releaseDate: d ?? null })}
        options={dateOptions.map((d) => ({ label: d, value: d }))}
        data-testid="filter-release-date-select"
      />
      <Input.Search
        allowClear
        placeholder="搜索需求名"
        style={{ width: 200 }}
        value={value.keyword}
        onChange={(e) => patch({ keyword: e.target.value })}
      />
    </Space>
  );
}
