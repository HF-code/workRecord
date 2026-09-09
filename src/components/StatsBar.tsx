import { Space, Tag } from 'antd';
import type { Requirement, Track } from '../types';
import { CLUSTER_COLOR, ENV_CLUSTER, TRACK_ENVS, TRACK_LABELS, trackEnvOf } from '../config/track';

/** 轨 × 当前阶段 的计数项 */
interface TrackEnvCount {
  track: Track;
  env: string;
  count: number;
}

interface Props {
  requirements: Requirement[];
  /** 当前「已达环境」筛选值（null = 不筛） */
  activeEnv: string | null;
  /** 点击某环境 Tag = 设置/取消「已达环境」筛选 */
  onToggleEnv: (env: string) => void;
}

const TRACKS: Track[] = ['weizan', 'star'];

/** 顶部双轨统计条：按 轨 × 当前阶段 计数（如 微赞·test 3），点击 = 筛选该环境 */
export default function StatsBar({ requirements, activeEnv, onToggleEnv }: Props) {
  const counts: TrackEnvCount[] = [];
  const map = new Map<string, number>();
  for (const r of requirements) {
    for (const track of TRACKS) {
      const env = trackEnvOf(r, track);
      if (env == null) continue;
      const key = `${track}::${env}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  // 按轨序 + 环境顺序输出
  for (const track of TRACKS) {
    for (const env of TRACK_ENVS[track]) {
      const count = map.get(`${track}::${env}`);
      if (count) counts.push({ track, env, count });
    }
  }

  return (
    <Space size={[8, 8]} wrap>
      <span style={{ color: '#666' }}>共 {requirements.length} 条</span>
      {counts.map(({ track, env, count }) => {
        const active = activeEnv === env;
        const cluster = ENV_CLUSTER[env] ?? '微赞';
        return (
          <Tag
            key={`${track}-${env}`}
            style={{
              cursor: 'pointer',
              color: CLUSTER_COLOR[cluster as '微赞' | '星享'],
              opacity: active ? 1 : 0.85,
              border: active ? '1.5px solid currentColor' : undefined,
            }}
            onClick={() => onToggleEnv(env)}
            data-testid={`stats-track-env-${track}-${env}`}
          >
            {TRACK_LABELS[track]}·{env} {count}
          </Tag>
        );
      })}
    </Space>
  );
}
