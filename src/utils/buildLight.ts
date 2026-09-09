/**
 * 需求卡片「构建小灯」：按需求 id 汇总全局构建任务状态。
 * 列表卡与看板卡共用；点击小灯展开右侧构建面板。
 */
import type { BuildTask } from '../hooks/useBuildTasks';

export interface BuildLight {
  /** 进行中（building/waiting）任务数 */
  active: number;
  /** 触发失败任务数 */
  failed: number;
  /** 已触发成功（done）任务数 */
  succeeded: number;
}

/** 汇总某需求关联任务的灯态（按 reqIds 命中过滤） */
export function getBuildLight(tasks: BuildTask[], reqId: string): BuildLight {
  const light: BuildLight = { active: 0, failed: 0, succeeded: 0 };
  for (const t of tasks) {
    if (!t.reqIds?.includes(reqId)) continue;
    if (t.phase === 'building' || t.phase === 'waiting') light.active += 1;
    else if (t.phase === 'failed') light.failed += 1;
    else if (t.phase === 'done') light.succeeded += 1;
  }
  return light;
}

/** 灯态展示配置：优先进行中 > 失败 > 成功；全 0 不渲染 */
export function buildLightLevel(
  light: BuildLight,
): { color: string; count: number; title: string } | null {
  if (light.active > 0) {
    return { color: '#1677ff', count: light.active, title: `${light.active} 个构建进行中` };
  }
  if (light.failed > 0) {
    return { color: '#ff4d4f', count: light.failed, title: `${light.failed} 个构建失败` };
  }
  if (light.succeeded > 0) {
    return { color: '#52c41a', count: light.succeeded, title: `${light.succeeded} 个构建已触发` };
  }
  return null;
}
