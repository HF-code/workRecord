import { Select } from 'antd';
import type { DevopsApp } from '../config/devopsApps';

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  apps: DevopsApp[];
}

export function projectLabel(app: DevopsApp): string {
  return app.alias ? `${app.app}（${app.alias}）` : app.app;
}

export default function ProjectSelect({ value, onChange, apps }: Props) {
  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder="选择项目"
      showSearch
      optionFilterProp="label"
      style={{ width: '100%' }}
      options={apps.map((a) => ({ label: projectLabel(a), value: a.app }))}
    />
  );
}
