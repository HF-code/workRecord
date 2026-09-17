import { useEffect, useState } from 'react';
import type { Requirement, Track } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import type { BranchConfig } from '../config/branches';
import { DEFAULT_BRANCHES } from '../config/branches';
import type { BuildEnv } from '../build';
import { backfillRequirement, trackBuildEnv } from '../config/track';
import {
  loadBranches,
  loadDevopsApps,
  loadDevopsSyncedAt,
  loadRequirements,
  migrateDevopsAppsExcludeFlag,
  migrateLegacyBuildPlan,
  saveBranches,
  saveDevopsApps,
  saveDevopsSyncedAt,
  saveRequirements,
} from '../storage';
import type { RequirementFormValues } from '../components/RequirementForm';

/** 一次性双轨迁移标记 key（迁移完成后写入，此后不再执行，避免覆盖用户手动移除的轨） */
const DUAL_TRACK_MIGRATED_KEY = 'work-tracker:dual-track:migrated:v1';

/** 一次性迁移：把旧单流水线数据拆到双轨（首启执行；幂等，完成后打标记） */
function migrateToDualTrackOnce(): void {
  try {
    if (localStorage.getItem(DUAL_TRACK_MIGRATED_KEY)) return;
    const list = loadRequirements();
    const results = list.map(backfillRequirement);
    if (results.some((r) => r.changed)) {
      saveRequirements(results.map((r) => r.next));
    }
    localStorage.setItem(DUAL_TRACK_MIGRATED_KEY, '1');
  } catch {
    // 迁移失败不影响主流程
  }
}

/** 一次性清理标记 key：移除已废弃的每轨「目标环境」字段 */
const LEGACY_TARGET_STRIPPED_KEY = 'work-tracker:dual-track:strip-targets:v1';

/** 一次性清理：删除旧数据的 targetWeizan/targetStar（构建/MR 已改为直接取当前环境） */
function stripLegacyTrackTargetsOnce(): void {
  try {
    if (localStorage.getItem(LEGACY_TARGET_STRIPPED_KEY)) return;
    const list = loadRequirements();
    const next = list.map((r) => {
      const copy = { ...r } as Requirement & { targetWeizan?: unknown; targetStar?: unknown };
      delete copy.targetWeizan;
      delete copy.targetStar;
      return copy;
    });
    saveRequirements(next);
    localStorage.setItem(LEGACY_TARGET_STRIPPED_KEY, '1');
  } catch {
    // 清理失败不影响主流程
  }
}

/** 生成 UUID，兼容不支持 crypto.randomUUID 的环境（如 file:// 或非安全上下文） */
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useRequirements() {
  const [requirements, setRequirements] = useState<Requirement[]>(() => {
    migrateLegacyBuildPlan();
    // 一次性静默迁移：旧单流水线数据拆到双轨（含旧流水线类型决定隐藏哪条轨）
    migrateToDualTrackOnce();
    // 一次性静默清理：删除已废弃的每轨「目标环境」字段
    stripLegacyTrackTargetsOnce();
    return loadRequirements();
  });

  useEffect(() => {
    saveRequirements(requirements);
  }, [requirements]);

  const update = (id: string, patch: Partial<Requirement>) => {
    setRequirements((list) =>
      list.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r)),
    );
  };

  /** 新增或保存编辑，返回是否为编辑 */
  const upsert = (editingId: string | null, values: RequirementFormValues): boolean => {
    const items = values.items.map((it) => ({
      id: it.id ?? genId(),
      project: it.project,
      branch: it.branch,
    }));
    if (editingId) {
      const existing = requirements.find((r) => r.id === editingId);
      update(editingId, {
        ...values,
        items,
        buildItems: existing?.buildItems,
      });
      return true;
    }
    const now = new Date().toISOString();
    setRequirements((list) => [
      // 新需求默认双轨可见（未开始态），用户可在卡片上 X 掉不参与的轨
      { id: genId(), ...values, items, envWeizan: null, envStar: null, createdAt: now, updatedAt: now },
      ...list,
    ]);
    return false;
  };

  const remove = (id: string) => {
    setRequirements((list) => list.filter((r) => r.id !== id));
  };

  const removeMany = (ids: Set<string>) => {
    setRequirements((list) => list.filter((r) => !ids.has(r.id)));
  };

  /** 按 id 去重合并导入数据，返回实际新增的条目 */
  const merge = (imported: Requirement[]): Requirement[] => {
    const existingIds = new Set(requirements.map((r) => r.id));
    const fresh = imported.filter((r) => !existingIds.has(r.id));
    if (fresh.length > 0) {
      setRequirements((list) => {
        const ids = new Set(list.map((r) => r.id));
        return [...imported.filter((r) => !ids.has(r.id)), ...list];
      });
    }
    return fresh;
  };

  return {
    requirements,
    upsert,
    update,
    remove,
    removeMany,
    merge,
  };
}

export function useDevopsApps() {
  const [apps, setApps] = useState<DevopsApp[]>(() => {
    // 一次性迁移：本地已存数据补 vzanlive_weapp 的不参与构建标记（幂等）
    migrateDevopsAppsExcludeFlag();
    return loadDevopsApps();
  });
  const [syncedAt, setSyncedAt] = useState<string | null>(() => loadDevopsSyncedAt());

  useEffect(() => {
    saveDevopsApps(apps);
  }, [apps]);

  /** 新增项目，app 名重复返回 false */
  const add = (app: DevopsApp): boolean => {
    if (apps.some((a) => a.app === app.app)) return false;
    setApps((list) => [...list, app]);
    return true;
  };

  const remove = (appName: string) => {
    setApps((list) => list.filter((a) => a.app !== appName));
  };

  const update = (appName: string, patch: Partial<DevopsApp>) => {
    setApps((list) => list.map((a) => (a.app === appName ? { ...a, ...patch } : a)));
  };

  /**
   * 同步合并：按 app 去重——远端新应用追加；两端都有保留本地 gitUrl、刷新 alias/group；
   * 本地有而远端无的保留（可能是手动新增）。返回新增数量。
   */
  const mergeSynced = (remote: DevopsApp[]): number => {
    const existing = new Map(apps.map((a) => [a.app, a]));
    const fresh = remote.filter((a) => !existing.has(a.app));
    setApps([
      ...apps.map((local) => {
        const r = remote.find((a) => a.app === local.app);
        return r ? { ...local, alias: r.alias, group: r.group } : local;
      }),
      ...fresh,
    ]);
    const now = new Date().toISOString();
    setSyncedAt(now);
    saveDevopsSyncedAt(now);
    return fresh.length;
  };

  return { apps, syncedAt, add, remove, update, mergeSynced };
}

export function useBranches() {
  const [branches, setBranches] = useState<BranchConfig[]>(() => loadBranches());

  useEffect(() => {
    saveBranches(branches);
  }, [branches]);

  /** 保存整个分支列表（用于配置页的增删改与排序） */
  const save = (list: BranchConfig[]) => {
    setBranches(list);
  };

  /** 恢复默认数据（真正重置为 DEFAULT_BRANCHES，而非重读 localStorage 旧值） */
  const reset = () => {
    setBranches(DEFAULT_BRANCHES);
  };

  return { branches, save, reset };
}

/** 构建计划：按轨取构建与 MR 作用的环境（= 该轨当前环境，未开始回退首环境） */
export function useBuildPlan() {
  // 取分支配置，用于把环境映射为「构建命令」（build_other）
  const { branches } = useBranches();

  /** 取某需求某轨构建/MR 作用的环境 */
  const getTarget = (req: Requirement, track: Track): BuildEnv => trackBuildEnv(req, track);

  /** 取某环境对应的构建命令（运维平台 build_other 字段）：优先分支配置 buildOther，缺省回退环境本身 */
  const getBuildOther = (env: BuildEnv): string => {
    const cfg = branches.find((b) => b.value === env);
    return (cfg?.buildOther && cfg.buildOther.trim()) || env;
  };

  return { getTarget, getBuildOther };
}
