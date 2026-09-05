/**
 * 批量操作纯函数：MR 目标汇总、构建目标去重（project+env）与统计。
 *
 * 数据模型约定（见 docs/ui-revamp-plan.md）：
 * - 勾选卡片 = 该需求**全部项目**直接进入批量范围（不依赖卡片内子勾选）；
 * - 临时排除：excluded[reqId] = 被用户在批量面板 X 掉的 itemId 列表（仅会话内，不回写数据）；
 * - 有效批量范围 = 需求全部项目 − excluded。
 */
import type { Requirement, ProjectBranch, Status } from './types';
import type { DevopsApp } from './config/devopsApps';
import { buildMergeRequestUrl, type BuildEnv } from './build';

/** 批量计算依赖的最小接口（仅 env；卡片子勾选已会话化，不再参与批量范围） */
export interface BuildPlanLike {
  getEnv: (req: Requirement) => BuildEnv;
}

/** 完整构建计划（useBuildPlan 返回值中 UI 仍需的部分） */
export interface BuildPlan extends BuildPlanLike {
  setEnv: (req: Requirement, env: BuildEnv) => void;
}

/** 一条可触发的 MR 目标（需求 × 项目，不去重） */
export interface MrTarget {
  reqId: string;
  reqName: string;
  itemId: string;
  project: string;
  /** 开发分支（MR 源分支） */
  branch: string;
  /** 目标分支（MR target / 构建目标） */
  env: BuildEnv;
  /** GitLab 预填 MR 链接 */
  url: string;
}

/** 一条无法生成 MR 的跳过项及原因 */
export interface MrSkipped {
  reqName: string;
  project: string;
  reason: string;
}

/** 一条去重后的构建目标（同 project + 同 env 只构建一次） */
export interface BuildTarget {
  /** `${project}::${env}`，同 key 合并 */
  key: string;
  project: string;
  env: BuildEnv;
  /** 参与该构建目标的需求名列表（构建任务名合并展示用） */
  reqNames: string[];
}

/** 批量面板顶部的统计 */
export interface BatchSummary {
  /** 参与批量的需求数 */
  reqCount: number;
  /** 有效项目实例总数（= MR 触发数，不去重） */
  itemCount: number;
  /** 去重后的构建任务数 */
  buildCount: number;
  /** 因缺 gitUrl/分支被跳过的 MR 项数 */
  skippedCount: number;
}

/** 取某需求的有效批量项目（全部项目 − 临时排除） */
export function getBatchItems(
  req: Requirement,
  excluded: Record<string, string[]>,
): ProjectBranch[] {
  const excludedIds = new Set(excluded[req.id] ?? []);
  return req.items.filter((it) => !excludedIds.has(it.id));
}

/**
 * MR 目标汇总：对每个需求的有效项目全量生成 GitLab 预填链接（不去重）。
 * 缺 gitUrl / 未填开发分支的项归入 skipped 并给出原因。
 */
export function collectMrTargets(
  reqs: Requirement[],
  apps: DevopsApp[],
  buildPlan: BuildPlanLike,
  excluded: Record<string, string[]>,
): { targets: MrTarget[]; skipped: MrSkipped[] } {
  const targets: MrTarget[] = [];
  const skipped: MrSkipped[] = [];
  for (const req of reqs) {
    const env = buildPlan.getEnv(req);
    for (const it of getBatchItems(req, excluded)) {
      const gitUrl = apps.find((a) => a.app === it.project)?.gitUrl;
      if (!gitUrl) {
        skipped.push({ reqName: req.name, project: it.project, reason: '未配置 Git 仓库地址' });
        continue;
      }
      if (!it.branch) {
        skipped.push({ reqName: req.name, project: it.project, reason: '未填写开发分支' });
        continue;
      }
      targets.push({
        reqId: req.id,
        reqName: req.name,
        itemId: it.id,
        project: it.project,
        branch: it.branch,
        env,
        url: buildMergeRequestUrl(gitUrl, it.branch, env),
      });
    }
  }
  return { targets, skipped };
}

/**
 * 构建目标汇总：按 `project::env` 去重合并——同项目同目标分支只构建一次，
 * reqNames 合并用于构建任务名展示（如"需求A、需求B"）。
 * dupCount = 有效项目实例数 − 构建目标数（即被合并掉的次数）。
 */
export function collectBuildTargets(
  reqs: Requirement[],
  buildPlan: BuildPlanLike,
  excluded: Record<string, string[]>,
): { builds: BuildTarget[]; dupCount: number } {
  const map = new Map<string, BuildTarget>();
  let itemCount = 0;
  for (const req of reqs) {
    const env = buildPlan.getEnv(req);
    for (const it of getBatchItems(req, excluded)) {
      itemCount += 1;
      const key = `${it.project}::${env}`;
      const existing = map.get(key);
      if (existing) {
        // 同项目同分支去重合并，仅追加需求名（去重防止同名需求重复）
        if (!existing.reqNames.includes(req.name)) existing.reqNames.push(req.name);
      } else {
        map.set(key, { key, project: it.project, env, reqNames: [req.name] });
      }
    }
  }
  const builds = [...map.values()];
  return { builds, dupCount: Math.max(0, itemCount - builds.length) };
}

/**
 * 汇总统计：需求数 / 有效项目数（MR 触发数）/ 去重后构建任务数 / 跳过数。
 * skippedCount 由调用方从 collectMrTargets 结果传入。
 */
export function summarize(
  reqs: Requirement[],
  buildPlan: BuildPlanLike,
  excluded: Record<string, string[]>,
  skippedCount: number,
): BatchSummary {
  const itemCount = reqs.reduce((sum, req) => sum + getBatchItems(req, excluded).length, 0);
  const { builds } = collectBuildTargets(reqs, buildPlan, excluded);
  return {
    reqCount: reqs.length,
    itemCount,
    buildCount: builds.length,
    skippedCount,
  };
}

/** 状态 → 卡片阶段分组（视觉分色用）：开发中 / 进行中（提测后~发布前）/ 发布后 */
export function getCardTone(status: Status): { bg: string; border: string } {
  if (status === '开发中') return { bg: '#F0F5FF', border: '#D6E4FF' };
  if (status === '已发布' || status === '线上验证中') return { bg: '#F5F5F5', border: '#D9D9D9' };
  return { bg: '#FAF5ED', border: '#EBDFC9' };
}
