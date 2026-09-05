import { DatePicker, Input, Select, Space } from 'antd';

const { RangePicker } = DatePicker;
import dayjs from 'dayjs';
import type { Status } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import { projectLabel } from './ProjectSelect';

export interface FilterValue {
  statuses: Status[];
  project?: string;
  releaseDateRange: [string, string] | null; // ['YYYY-MM-DD', 'YYYY-MM-DD']
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
      <RangePicker
        allowClear
        placeholder={['发版日期起', '发版日期止']}
        value={
          value.releaseDateRange
            ? [dayjs(value.releaseDateRange[0]), dayjs(value.releaseDateRange[1])]
            : null
        }
        onChange={(dates) =>
          patch({
            releaseDateRange: dates
              ? [dates[0]!.format('YYYY-MM-DD'), dates[1]!.format('YYYY-MM-DD')]
              : null,
          })
        }
        presets={[
          { label: '今天', value: [dayjs(), dayjs()] },
          { label: '近一周', value: [dayjs().subtract(6, 'day'), dayjs()] },
          { label: '近一月', value: [dayjs().subtract(1, 'month'), dayjs()] },
        ]}
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
