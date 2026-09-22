import type { Requirement } from './types';
import { DEFAULT_DEVOPS_APPS, type DevopsApp } from './config/devopsApps';
import { DEFAULT_BRANCHES, type BranchConfig } from './config/branches';
import { normalizePollInterval } from './config/buildConfig';

/* ---------- localStorage 存储键定义（按业务数据分类） ---------- */

/** 需求列表：Requirement[]（types.ts 定义的唯一格式；旧格式只在导入边界转换，不在此兼容） */
const REQ_KEY = 'work-tracker:requirements:v1';
/** 运维平台应用配置：DevopsApp[]，项目名/别名/分组/gitUrl/是否参与构建，缺失时回退 DEFAULT_DEVOPS_APPS */
const DEVOPS_APPS_KEY = 'work-tracker:devops-apps:v1';
/** 运维平台应用最近一次同步成功时间：ISO 字符串（非 JSON），从未同步时为 null */
const DEVOPS_SYNCED_AT_KEY = 'work-tracker:devops-apps:synced-at';
/** 构建分支配置：BranchConfig[]，可选目标分支清单，缺失时回退 DEFAULT_BRANCHES */
const BRANCHES_KEY = 'work-tracker:branches:v1';
/** 构建状态轮询间隔（秒）：纯数字字符串，非法值由 normalizePollInterval 归一化 */
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

/**
 * 读取需求数据的**原始字符串**（不做任何解析与转换）。
 * 供「导出旧数据」使用：原样搬运，即使内容已损坏也能完整取回。
 * @returns 未存储时返回 null
 */
export function loadRequirementsRaw(): string | null {
  try {
    return localStorage.getItem(REQ_KEY);
  } catch {
    return null;
  }
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
