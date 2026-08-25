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

/** 一次性迁移：将旧版本独立存储的构建目标分支 / 勾选项并回 requirements（同表），并清理旧 key */
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
    const next = list.map((r) => ({
      ...r,
      buildEnv: (envs[r.id] as BuildEnv | undefined) ?? r.buildEnv,
      buildItems: selected[r.id] ?? r.buildItems,
    }));
    saveRequirements(next);
    localStorage.removeItem(LEGACY_ENVS_KEY);
    localStorage.removeItem(LEGACY_SELECTED_KEY);
  } catch {
    // 迁移失败不影响主流程
  }
}
