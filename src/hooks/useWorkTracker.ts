import { useEffect, useState } from 'react';
import type { Requirement, RequirementInput, Track } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import type { BranchConfig } from '../config/branches';
import { DEFAULT_BRANCHES } from '../config/branches';
import type { BuildEnv } from '../build';
import { trackBuildEnv } from '../config/track';
import { migrateLegacyList } from '../utils/legacyImport';
import {
  loadBranches,
  loadDevopsApps,
  loadDevopsSyncedAt,
  loadRequirements,
  saveBranches,
  saveDevopsApps,
  saveDevopsSyncedAt,
  saveRequirements,
} from '../storage';

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

/**
 * 需求数据读写（唯一数据源）。
 * 内存与 localStorage 中只存在 types.ts 定义的唯一格式——不在此做任何旧格式兼容，
 * 旧数据统一经「导入数据」由 utils/legacyImport.ts 转换后进入。
 */
export function useRequirements() {
  const [requirements, setRequirements] = useState<Requirement[]>(() => loadRequirements());

  useEffect(() => {
    saveRequirements(requirements);
  }, [requirements]);

  const update = (id: string, patch: Partial<Requirement>) => {
    setRequirements((list) =>
      list.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r)),
    );
  };

  /** 新增或保存编辑，返回是否为编辑 */
  const upsert = (editingId: string | null, values: RequirementInput): boolean => {
    const items = values.items.map((it) => ({
      id: it.id ?? genId(),
      project: it.project,
      branch: it.branch,
    }));
    if (editingId) {
      update(editingId, { ...values, items });
      return true;
    }
    const now = new Date().toISOString();
    setRequirements((list) => [
      // 新需求默认双轨可见（未开始态），用户可在卡片上 X 掉不参与的轨
      {
        id: genId(),
        ...values,
        items,
        envWeizan: null,
        envStar: null,
        createdAt: now,
        updatedAt: now,
      },
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

  /**
   * 一键迁移：把库中残留的旧格式记录**就地替换**为当前格式（按 id 原地转换，不新增、不丢数据）。
   * 转换规则见 utils/legacyImport.ts；原始数据由调用方在迁移前自行备份。
   * @returns 迁移成功条数与无法识别（保持原样）条数
   */
  const migrateLegacy = (): { migrated: number; failed: number } => {
    const { list, migrated, failed } = migrateLegacyList(requirements, new Date().toISOString());
    if (migrated > 0) setRequirements(list);
    return { migrated, failed };
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
    migrateLegacy,
  };
}

export function useDevopsApps() {
  const [apps, setApps] = useState<DevopsApp[]>(() => loadDevopsApps());
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
