import { useEffect, useState } from 'react';
import type { Requirement } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import {
  loadDevopsApps,
  loadDevopsSyncedAt,
  loadRequirements,
  saveDevopsApps,
  saveDevopsSyncedAt,
  saveRequirements,
} from '../storage';
import type { RequirementFormValues } from '../components/RequirementForm';

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
  const upsert = (editingId: string | null, values: RequirementFormValues): boolean => {
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
      { id: genId(), ...values, items, createdAt: now, updatedAt: now },
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

  return { requirements, upsert, update, remove, removeMany, merge };
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
