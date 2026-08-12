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
