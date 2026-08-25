import type { BuildEnv } from './build';

export const STATUSES = [
  '开发中',
  '已提测',
  '测试中',
  '测试通过',
  '验收通过',
  '预发布测试中',
  '待发布',
  '线上验证中',
  '已发布',
] as const;

export type Status = (typeof STATUSES)[number];

export const VERSIONS = ['大版', '独立'] as const;

export type Version = (typeof VERSIONS)[number];

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
  status: Status;
  releaseDate: string | null; // 'YYYY-MM-DD'
  version?: Version; // 旧数据可能无此字段，缺省视为 '大版'
  remark?: string;
  /** 构建目标分支（整需求共用），缺省视为系统配置默认分支 */
  buildEnv?: BuildEnv;
  /** 参与构建的项目 itemId 列表，缺省视为全部项目 */
  buildItems?: string[];
  createdAt: string;
  updatedAt: string;
}

export const STATUS_COLORS: Record<Status, string> = {
  开发中: 'blue',
  已提测: 'cyan',
  测试中: 'gold',
  测试通过: 'green',
  验收通过: 'green',
  预发布测试中: 'purple',
  待发布: 'orange',
  线上验证中: 'cyan',
  已发布: 'default',
};
