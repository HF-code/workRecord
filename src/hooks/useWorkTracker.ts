import { useEffect, useState } from 'react';
import type { Requirement } from '../types';
import { loadProjects, loadRequirements, saveProjects, saveRequirements } from '../storage';
import type { RequirementFormValues } from '../components/RequirementForm';

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
      id: it.id ?? crypto.randomUUID(),
      project: it.project,
      branch: it.branch,
    }));
    if (editingId) {
      update(editingId, { ...values, items });
      return true;
    }
    const now = new Date().toISOString();
    setRequirements((list) => [
      { id: crypto.randomUUID(), ...values, items, createdAt: now, updatedAt: now },
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

export function useProjects() {
  const [projects, setProjects] = useState<string[]>(() => loadProjects());

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  const add = (name: string) => {
    setProjects((list) => (list.includes(name) ? list : [...list, name]));
  };

  /** 合并一批项目名（去重） */
  const merge = (names: string[]) => {
    setProjects((list) => [...new Set([...list, ...names])]);
  };

  return { projects, setProjects, add, merge };
}
