import type { Requirement } from './types';
import type { BuildEnv } from './build';
import { DEFAULT_DEVOPS_APPS, type DevopsApp } from './config/devopsApps';
import { DEFAULT_BRANCHES, type BranchConfig } from './config/branches';
import { normalizePollInterval } from './config/buildConfig';

const REQ_KEY = 'work-tracker:requirements:v1';
const DEVOPS_APPS_KEY = 'work-tracker:devops-apps:v1';
const DEVOPS_SYNCED_AT_KEY = 'work-tracker:devops-apps:synced-at';
const BRANCHES_KEY = 'work-tracker:branches:v1';
const BUILD_POLL_INTERVAL_KEY = 'work-tracker:build-poll-interval:v1';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储失败（如容量满）静默处理，不阻塞界面
  }
}

export function loadRequirements(): Requirement[] {
  return loadJson<Requirement[]>(REQ_KEY, []);
}

export function saveRequirements(list: Requirement[]): void {
  saveJson(REQ_KEY, list);
}

/** 读取运维平台应用配置，无本地存储时回退配置文件默认数据 */
export function loadDevopsApps(): DevopsApp[] {
  return loadJson<DevopsApp[]>(DEVOPS_APPS_KEY, DEFAULT_DEVOPS_APPS);
}

export function saveDevopsApps(list: DevopsApp[]): void {
  saveJson(DEVOPS_APPS_KEY, list);
}

/** 最近一次同步成功时间（ISO 字符串），从未同步返回 null */
export function loadDevopsSyncedAt(): string | null {
  return localStorage.getItem(DEVOPS_SYNCED_AT_KEY);
}

export function saveDevopsSyncedAt(iso: string): void {
  try {
    localStorage.setItem(DEVOPS_SYNCED_AT_KEY, iso);
  } catch {
    // 静默处理
  }
}

/** 读取构建分支配置，无本地存储时回退配置文件默认数据 */
export function loadBranches(): BranchConfig[] {
  return loadJson<BranchConfig[]>(BRANCHES_KEY, DEFAULT_BRANCHES);
}

export function saveBranches(list: BranchConfig[]): void {
  saveJson(BRANCHES_KEY, list);
}

/** 读取构建轮询间隔（秒），缺失或非法时回退默认配置 */
export function loadBuildPollInterval(): number {
  const raw = localStorage.getItem(BUILD_POLL_INTERVAL_KEY);
  return normalizePollInterval(raw ? Number(raw) : NaN);
}

export function saveBuildPollInterval(seconds: number): void {
  try {
    localStorage.setItem(BUILD_POLL_INTERVAL_KEY, String(normalizePollInterval(seconds)));
  } catch {
    // 静默处理
  }
}

/* ---------- 失败时是否自动轮询构建（开关） ---------- */
const AUTO_BUILD_ON_FAIL_KEY = 'work-tracker:auto-build-on-fail:v1';

/** 默认开启：构建失败且为「上一任务尚未完成」时自动轮询重试 */
export function loadAutoBuildOnFail(): boolean {
  const raw = localStorage.getItem(AUTO_BUILD_ON_FAIL_KEY);
  if (raw === null) return true;
  return raw === '1' || raw === 'true';
}

export function saveAutoBuildOnFail(on: boolean): void {
  try {
    localStorage.setItem(AUTO_BUILD_ON_FAIL_KEY, on ? '1' : '0');
  } catch {
    // 静默处理
  }
}

/** 一次性迁移：本地已存的项目数据中 vzanlive_weapp 未标记「不参与构建」时补上（幂等）。
 *  未存过（走默认数据）无需处理——默认数据已含标记。 */
export function migrateDevopsAppsExcludeFlag(): void {
  try {
    const raw = localStorage.getItem(DEVOPS_APPS_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as Array<{ app?: unknown; excludeFromBuild?: unknown }>;
    if (!Array.isArray(list)) return;
    let changed = false;
    const next = list.map((a) => {
      if (a && typeof a === 'object' && a.app === 'vzanlive_weapp' && a.excludeFromBuild === undefined) {
        changed = true;
        return { ...a, excludeFromBuild: true };
      }
      return a;
    });
    if (changed) localStorage.setItem(DEVOPS_APPS_KEY, JSON.stringify(next));
  } catch {
    // 迁移失败不影响主流程
  }
}

/** 一次性迁移：将旧版本独立存储的构建目标分支 / 勾选项并回 requirements（同表），并清理旧 key。
 *  双轨模型下旧 buildEnv 按环境所属集群落到对应轨的目标环境字段。 */
export function migrateLegacyBuildPlan(): void {
  const LEGACY_ENVS_KEY = 'work-tracker:build-envs:v1';
  const LEGACY_SELECTED_KEY = 'work-tracker:build-selected:v1';
  try {
    const rawEnvs = localStorage.getItem(LEGACY_ENVS_KEY);
    const rawSelected = localStorage.getItem(LEGACY_SELECTED_KEY);
    if (!rawEnvs && !rawSelected) return;
    const envs = rawEnvs ? (JSON.parse(rawEnvs) as Record<string, string>) : {};
    const selected = rawSelected ? (JSON.parse(rawSelected) as Record<string, string[]>) : {};
    const list = loadRequirements();
    const next = list.map((r) => {
      const patch: Record<string, unknown> = {
        buildItems: (selected[r.id] as string[] | undefined) ?? r.buildItems,
      };
      const legacyEnv = envs[r.id] as BuildEnv | undefined;
      if (legacyEnv) {
        // 旧目标分支按环境所属集群落到对应轨的显式目标（微赞 test/pre → targetWeizan，星享环境 → targetStar）
        if (legacyEnv === 'dev' || legacyEnv === 'test' || legacyEnv === 'pre' || legacyEnv === 'master') {
          patch.targetWeizan = legacyEnv;
        } else {
          patch.targetStar = legacyEnv;
        }
      }
      return { ...r, ...patch };
    });
    saveRequirements(next as typeof list);
    localStorage.removeItem(LEGACY_ENVS_KEY);
    localStorage.removeItem(LEGACY_SELECTED_KEY);
  } catch {
    // 迁移失败不影响主流程
  }
}
