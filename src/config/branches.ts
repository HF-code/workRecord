import type { BuildEnv } from '../build';

/**
 * 构建分支（构建环境）配置。
 * 现在的 dev/test/pre/pre-txnj/preb-txnj 作为默认数据，
 * 可在「系统配置 → 分支配置」中自定义增删、调整顺序与默认选中项。
 * value 为构建 payload 的 env 字段，支持自定义标识（需运维平台支持）。
 */

export interface BranchConfig {
  /** 分支标识（构建 payload 的 env 字段，内置环境之一或自定义标识） */
  value: BuildEnv;
  /** 下拉展示文案 */
  label: string;
  /** 是否设为默认选中项 */
  isDefault?: boolean;
  /**
   * 构建命令（运维平台构建接口的 build_other 字段）。
   * 选该分支构建时，build_other 优先传此值；留空则回退到 value（分支标识）。
   * 当某分支的构建命令与分支标识不一致时（如分支标识=pre 但构建命令=pre-txnj），在此填写。
   */
  buildOther?: string;
}

/** 内置构建环境（构建接口已知支持），供分支配置页提示与轻提示判断共用 */
export const BUILTIN_BUILD_ENVS: readonly string[] = [
  'dev',
  'test',
  'pre',
  'pre-txnj',
  'preb-txnj',
];

export const DEFAULT_BRANCHES: BranchConfig[] = [
  { value: 'dev', label: 'dev', buildOther: 'dev' },
  { value: 'test', label: 'test', buildOther: 'test', isDefault: true },
  { value: 'pre', label: 'pre', buildOther: 'pre' },
  { value: 'pre-txnj', label: 'pre-txnj', buildOther: 'pre-txnj' },
  { value: 'preb-txnj', label: 'preb-txnj', buildOther: 'preb-txnj' },
];

/** 取默认分支（优先 isDefault，否则取首项），供构建控件初始选中 */
export function getDefaultBranch(branches: BranchConfig[]): BuildEnv {
  const def = branches.find((b) => b.isDefault) ?? branches[0];
  return def ? def.value : 'test';
}
