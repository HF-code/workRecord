/**
 * 双轨环境模型（取代原单流水线 config/pipeline.ts）：
 * - 微赞轨：dev → test → pre → master（master = 微赞已上线）
 * - 星享轨：preb-txnj → pre-txnj → prod-txnj（prod-txnj = 星享已上线）
 * - 一个需求两条轨并行推进，状态由轨阶段派生（每轨 + 整体粗粒度），不再手工维护状态枚举。
 * - 旧数据迁移：单 currentEnv / 旧 status 枚举按环境所属集群拆到对应轨。
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

/** 轨构建/MR 目标环境的推导默认值：当前阶段的下一环境（末段/未开始 → 首环境） */
export function defaultTrackTarget(track: Track, env: BuildEnv | null): BuildEnv {
  const envs = TRACK_ENVS[track];
  if (env == null) return envs[0];
  const idx = envs.indexOf(env);
  if (idx < 0 || idx === envs.length - 1) return envs[envs.length - 1];
  return envs[idx + 1];
}

/** 取需求某轨的构建/MR 目标环境（显式值优先，缺省按阶段推导） */
export function trackTargetOf(req: Requirement, track: Track): BuildEnv {
  const explicit = track === 'weizan' ? req.targetWeizan : req.targetStar;
  if (explicit && TRACK_ENVS[track].includes(explicit)) return explicit;
  return defaultTrackTarget(track, trackEnvOf(req, track));
}

/** 某轨的目标环境是否已显式设置（用于「恢复推导」判断，暂留） */
export function hasExplicitTarget(req: Requirement, track: Track): boolean {
  const explicit = track === 'weizan' ? req.targetWeizan : req.targetStar;
  return !!explicit && TRACK_ENVS[track].includes(explicit);
}

/* ---------- 旧数据迁移 ---------- */

/** 历史状态枚举 → 环境映射（覆盖两代旧枚举：9 态与 10 态） */
const LEGACY_STATUS_TO_ENV: Record<string, BuildEnv> = {
  开发中: 'dev',
  已提测: 'test',
  测试中: 'test',
  测试通过: 'test',
  验收通过: 'test',
  预发布测试中: 'pre-txnj',
  'preb-txnj测试中': 'preb-txnj',
  'preb-txnj测试通过': 'preb-txnj',
  'pre-txnj测试中': 'pre-txnj',
  'pre-txnj测试通过': 'pre-txnj',
  待发布: 'pre',
  pre测试中: 'pre',
  pre测试通过: 'pre',
  线上验证中: 'pre',
  已发布: 'master',
};

/**
 * 老数据迁移：把旧单流水线字段拆到双轨（一次性全量处理，由 useWorkTracker 的一次性标记触发）：
 * - 旧 currentEnv（若属于某轨）→ 该轨阶段；未命中时按旧 status 反推；
 * - 旧 status「已发布」→ 两条轨都置末段（微赞 master + 星享 prod-txnj）；
 * - 旧 versionPipeline：starOnly → 移除微赞轨（不显示）；weizanOnly → 移除星享轨；
 * - version 缺失 → '大版'；清理 versionPipeline / currentEnv / buildEnv 旧键。
 * 注意：轨字段为 undefined 表示「该轨已被用户移除」，本函数只在一次性迁移时执行，
 * 正常运行不会把用户移除的轨恢复出来。
 * @returns 补齐后的需求与是否发生变化
 */
export function backfillRequirement(req: Requirement): { next: Requirement; changed: boolean } {
  const legacy = req as Requirement & {
    versionPipeline?: string;
    currentEnv?: string | null;
    buildEnv?: string;
  };
  const hasLegacyKeys =
    legacy.versionPipeline !== undefined ||
    legacy.currentEnv !== undefined ||
    legacy.buildEnv !== undefined;
  if (!hasLegacyKeys && req.version !== undefined && req.envWeizan !== undefined && req.envStar !== undefined) {
    return { next: req, changed: false };
  }

  const next = { ...legacy };
  // 1) 拆轨：旧 currentEnv 优先，未命中按旧 status 反推
  let envWeizan: BuildEnv | null | undefined = req.envWeizan ?? null;
  let envStar: BuildEnv | null | undefined = req.envStar ?? null;
  if (legacy.currentEnv != null) {
    const track = trackOfEnv(legacy.currentEnv);
    if (track === 'weizan') envWeizan = legacy.currentEnv;
    else if (track === 'star') envStar = legacy.currentEnv;
  }
  if (envWeizan === null && envStar === null && req.status) {
    if (req.status === '已发布') {
      // 已发布 = 两条轨都到末段
      envWeizan = trackFinalEnv('weizan');
      envStar = trackFinalEnv('star');
    } else {
      const env = LEGACY_STATUS_TO_ENV[req.status];
      if (env) {
        if (trackOfEnv(env) === 'weizan') envWeizan = env;
        else envStar = env;
      }
    }
  }
  // 2) 旧流水线类型决定不参与的轨（undefined = 该轨已移除，卡片不显示）
  if (legacy.versionPipeline === 'starOnly') envWeizan = undefined;
  else if (legacy.versionPipeline === 'weizanOnly') envStar = undefined;
  next.envWeizan = envWeizan;
  next.envStar = envStar;
  // 3) 版本标签缺失归大版
  next.version = req.version ?? '大版';
  // 4) 清理旧键
  delete next.versionPipeline;
  delete next.currentEnv;
  delete next.buildEnv;
  return { next, changed: true };
}
