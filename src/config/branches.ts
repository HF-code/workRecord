import type { BuildEnv } from '../build';

/**
 * 构建分支（构建环境）配置。
 * 现在的 dev/test/pre/pre-txnj 作为默认数据，
 * 可在「系统配置 → 分支配置」中自定义增删、调整顺序与默认选中项。
 * value 必须与构建接口支持的 BuildEnv 一致。
 */

export interface BranchConfig {
  /** 分支标识（构建 payload 的 env 字段，须为 BuildEnv 之一） */
  value: BuildEnv;
  /** 下拉展示文案 */
  label: string;
  /** 是否设为默认选中项 */
  isDefault?: boolean;
}

export const DEFAULT_BRANCHES: BranchConfig[] = [
  { value: 'dev', label: 'dev' },
  { value: 'test', label: 'test', isDefault: true },
  { value: 'pre', label: 'pre' },
  { value: 'pre-txnj', label: 'pre-txnj' },
  { value: 'preb-txnj', label: 'preb-txnj' },
];

/** 取默认分支（优先 isDefault，否则取首项），供构建控件初始选中 */
export function getDefaultBranch(branches: BranchConfig[]): BuildEnv {
  const def = branches.find((b) => b.isDefault) ?? branches[0];
  return def ? def.value : 'test';
}
