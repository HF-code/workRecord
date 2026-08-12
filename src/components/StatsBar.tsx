import { Space, Tag } from 'antd';
import { STATUSES, STATUS_COLORS, type Requirement, type Status } from '../types';

interface Props {
  requirements: Requirement[];
  activeStatuses: Status[];
  onToggle: (status: Status) => void;
}

export default function StatsBar({ requirements, activeStatuses, onToggle }: Props) {
  const counts = new Map<Status, number>();
  for (const r of requirements) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  }

  return (
    <Space size={[8, 8]} wrap>
      <span style={{ color: '#666' }}>共 {requirements.length} 条</span>
      {STATUSES.map((s) => {
        const count = counts.get(s) ?? 0;
        if (count === 0) return null;
        const active = activeStatuses.includes(s);
        return (
          <Tag
            key={s}
            color={STATUS_COLORS[s]}
            style={{
              cursor: 'pointer',
              opacity: activeStatuses.length === 0 || active ? 1 : 0.4,
              border: active ? '1px solid currentColor' : undefined,
            }}
            onClick={() => onToggle(s)}
          >
            {s} {count}
          </Tag>
        );
      })}
    </Space>
  );
}
