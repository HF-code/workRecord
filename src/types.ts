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

/**
 * 轨环境状态（三态语义，必须显式区分，不可用 `!env` 一把抓）：
 * - `undefined`：该轨已被用户手动移除（不参与发布，卡片不渲染该轨）
 * - `null`：参与但未开始
 * - 环境值：已推进到该环境
 *
 * 注意：`JSON.stringify` 会丢弃值为 `undefined` 的键，因此「已移除轨」持久化/导出后
 * 表现为**键缺失**——判断旧格式数据不可依赖该键是否存在（见 utils/legacyImport.ts）。
 */
export type TrackEnvState = BuildEnv | null | undefined;

/** 唯一的数据格式：内存与 localStorage 中只存在这一种形态（旧格式仅在导入边界转换） */
export interface Requirement {
  id: string;
  name: string;
  tapdUrl: string;
  items: ProjectBranch[];
  releaseDate: string | null; // 'YYYY-MM-DD'
  /** 版本标签（必填，缺省 '大版'） */
  version: Version;
  remark?: string;
  /** 微赞轨状态（undefined = 该轨已移除） */
  envWeizan: TrackEnvState;
  /** 星享轨状态（undefined = 该轨已移除） */
  envStar: TrackEnvState;
  /** 微赞轨「测试通过」手动标记（测试同学确认用；推进阶段时自动重置） */
  testPassWeizan?: boolean;
  /** 星享轨「测试通过」手动标记 */
  testPassStar?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 新增/编辑表单提交的输入：只含用户可编辑字段，
 * 轨状态与环境标记由 useRequirements 维护，时间戳由存储层维护。
 */
export interface RequirementInput {
  name: string;
  tapdUrl: string;
  releaseDate: string | null;
  version: Version;
  items: { id?: string; project: string; branch: string }[];
  remark?: string;
}

/** 整体派生状态（由两条轨进度投影，用于统计/筛选「已发布」） */
export type OverallStatus = '开发中' | '进行中' | '部分上线' | '已发布';
