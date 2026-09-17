import type { BuildEnv } from './build';

/** 版本标签（纯展示，无行为含义；缺省视为 '大版'） */
export const VERSIONS = ['大版', '独立'] as const;

export type Version = (typeof VERSIONS)[number];

/**
 * 部署轨：一个需求可在两条轨上并行推进，互不干扰。
 * - weizan 微赞轨：dev → test → pre → master（master = 微赞已上线）
 * - star 星享轨：preb-txnj → pre-txnj → prod-txnj（prod-txnj = 星享已上线）
 */
export type Track = 'weizan' | 'star';

export interface ProjectBranch {
  id: string;
  project: string;
  branch: string;
}

export interface Requirement {
  id: string;
  name: string;
  tapdUrl: string;
  items: ProjectBranch[];
  releaseDate: string | null; // 'YYYY-MM-DD'
  /** 版本标签（旧数据可能缺失，缺省视为 '大版'） */
  version?: Version;
  remark?: string;
  /** 微赞轨当前阶段（null = 未开始/不参与） */
  envWeizan?: BuildEnv | null;
  /** 星享轨当前阶段（null = 未开始/不参与） */
  envStar?: BuildEnv | null;
  /** 微赞轨「测试通过」手动标记（测试同学确认用；推进阶段时自动重置） */
  testPassWeizan?: boolean;
  /** 星享轨「测试通过」手动标记 */
  testPassStar?: boolean;
  /**
   * 旧数据遗留状态字段（历史 9/10 态枚举），已废弃——
   * 展示与筛选统一使用 config/track.ts 的派生状态（双轨投影），不再写入。
   */
  status?: string;
  /** 参与构建的项目 itemId 列表（旧数据遗留，批量范围已由会话态 excluded/included 管理） */
  buildItems?: string[];
  createdAt: string;
  updatedAt: string;
}

/** 整体派生状态（由两条轨进度投影，用于统计/筛选「已发布」） */
export type OverallStatus = '开发中' | '进行中' | '部分上线' | '已发布';
