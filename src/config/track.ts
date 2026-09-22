/**
 * 双轨环境模型（取代原单流水线 config/pipeline.ts）：
 * - 微赞轨：dev → test → pre → master（master = 微赞已上线）
 * - 星享轨：preb-txnj → pre-txnj → prod-txnj（prod-txnj = 星享已上线）
 * - 一个需求两条轨并行推进，状态由轨阶段派生（每轨 + 整体粗粒度），不再手工维护状态枚举。
 * - 本文件为纯派生函数，不含任何旧数据兼容逻辑（旧格式转换统一在 utils/legacyImport.ts）。
 */
import type { BuildEnv } from '../build';
import type { OverallStatus, Requirement, Track } from '../types';

/** 轨展示名 */
export const TRACK_LABELS: Record<Track, string> = {
  weizan: '微赞',
  star: '星享',
};

/** 每条轨的有序环境链路 */
export const TRACK_ENVS: Record<Track, BuildEnv[]> = {
  weizan: ['dev', 'test', 'pre', 'master'],
  star: ['preb-txnj', 'pre-txnj', 'prod-txnj'],
};

/** 全部环境（筛选选项用，按轨序拼接） */
export const ALL_ENVS: BuildEnv[] = [...TRACK_ENVS.weizan, ...TRACK_ENVS.star];

/** 环境所属集群 */
export const ENV_CLUSTER: Record<string, '微赞' | '星享'> = {
  dev: '微赞',
  test: '微赞',
  pre: '微赞',
  master: '微赞',
  'preb-txnj': '星享',
  'pre-txnj': '星享',
  'prod-txnj': '星享',
};

/** 集群展示色（轨色点用） */
export const CLUSTER_COLOR: Record<'微赞' | '星享', string> = {
  微赞: '#1677ff',
  星享: '#fa8c16',
};

/** 环境属于哪条轨（未知环境返回 null） */
export function trackOfEnv(env: string): Track | null {
  if (TRACK_ENVS.weizan.includes(env)) return 'weizan';
  if (TRACK_ENVS.star.includes(env)) return 'star';
  return null;
}

/** 轨的末段环境（上线判定） */
export function trackFinalEnv(track: Track): BuildEnv {
  const envs = TRACK_ENVS[track];
  return envs[envs.length - 1];
}

/** 环境在该轨中的序号（不在该轨返回 -1） */
export function trackStageIndex(track: Track, env: BuildEnv | null | undefined): number {
  if (env == null) return -1;
  return TRACK_ENVS[track].indexOf(env);
}

/** 取需求某轨的当前阶段（null = 未开始） */
export function trackEnvOf(req: Requirement, track: Track): BuildEnv | null {
  return (track === 'weizan' ? req.envWeizan : req.envStar) ?? null;
}

/**
 * 构建/MR 作用的环境：直接取该轨当前环境（未开始回退该轨首环境）。
 * 每轨只有「当前环境」一个选择——构建与提交 MR 都作用于它，不再有单独的目标环境。
 */
export function trackBuildEnv(req: Requirement, track: Track): BuildEnv {
  return trackEnvOf(req, track) ?? TRACK_ENVS[track][0];
}

/** 轨是否已上线（到达末段） */
export function isTrackOnline(req: Requirement, track: Track): boolean {
  return trackEnvOf(req, track) === trackFinalEnv(track);
}

/** 每轨派生状态展示（阶段投影 + 手动测试通过标记） */
export interface TrackStatusView {
  label: string;
  color: string;
}

/** 单轨派生状态（未开始返回 null 不展示） */
export function trackStatus(track: Track, env: BuildEnv | null, testPass: boolean | undefined): TrackStatusView | null {
  if (env == null) return null;
  const passed = !!testPass;
  if (track === 'weizan') {
    switch (env) {
      case 'dev':
        return { label: '开发中', color: 'blue' };
      case 'test':
        return passed ? { label: '测试通过', color: 'green' } : { label: '测试中', color: 'gold' };
      case 'pre':
        return passed
          ? { label: 'pre测试通过', color: 'green' }
          : { label: 'pre测试中', color: 'purple' };
      case 'master':
        return { label: '微赞已上线', color: 'default' };
    }
  }
  switch (env) {
    case 'preb-txnj':
      return passed
        ? { label: 'preb-txnj测试通过', color: 'green' }
        : { label: 'preb-txnj测试中', color: 'purple' };
    case 'pre-txnj':
      return passed
        ? { label: 'pre-txnj测试通过', color: 'green' }
        : { label: 'pre-txnj测试中', color: 'purple' };
    case 'prod-txnj':
      return { label: '星享已上线', color: 'default' };
  }
  return null;
}

/** 已开始的轨（阶段非 null 的轨） */
export function startedTracks(req: Requirement): Track[] {
  const tracks: Track[] = [];
  if (trackEnvOf(req, 'weizan') != null) tracks.push('weizan');
  if (trackEnvOf(req, 'star') != null) tracks.push('star');
  return tracks;
}

/**
 * 整体派生状态（粗粒度投影）：
 * - 无任何轨开始 → 开发中
 * - 已开始的轨全部到末段 → 已发布；部分到末段 → 部分上线
 * - 其余：已开始的轨都还停在各自第一阶段 → 开发中；否则 → 进行中
 */
export function overallStatus(req: Requirement): OverallStatus {
  const tracks = startedTracks(req);
  if (tracks.length === 0) return '开发中';
  const onlineCount = tracks.filter((t) => isTrackOnline(req, t)).length;
  if (onlineCount === tracks.length) return '已发布';
  if (onlineCount > 0) return '部分上线';
  const allAtFirst = tracks.every((t) => trackStageIndex(t, trackEnvOf(req, t)) === 0);
  return allAtFirst ? '开发中' : '进行中';
}
