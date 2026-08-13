/**
 * 插件侧独立维护的类型声明。
 *
 * 与前端 src/types.ts 保持字段一致（extension 侧只做透传与存取，不做业务校验）。
 * 字段变更时需同步两处。
 */

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
  createdAt: string;
  updatedAt: string;
}
