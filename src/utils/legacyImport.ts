/**
 * 旧数据导入边界（本次「数据来源单点化」的唯一转换点）。
 *
 * 设计原则：**运行时零兼容**——内存与 localStorage 中只存在 types.ts 定义的一种格式；
 * 所有「旧格式识别 + 转换」集中在本文件，且全部为无副作用纯函数，只被导入流程调用。
 * 因此渲染、编辑、卡片、批量、构建等链路都不会出现「猜字段」的分支。
 *
 * 兼容的四种输入（由 parseImportFile 统一识别）：
 * 1. 朴素数组：`[{...}, {...}]`（如旧版 localStorage 原始值被直接另存为文件）
 * 2. `version: 1`：旧版「导出数据」产物
 * 3. `version: 2`：当前版本「导出数据」产物
 * 4. `version: 'legacy-raw'`：当前版本「导出旧数据」产物（原样字符串，递归解包后再走同一管线）
 */
import type { BuildEnv } from '../build';
import { trackFinalEnv, trackOfEnv } from '../config/track';
import { VERSIONS, type ProjectBranch, type Requirement, type TrackEnvState, type Version } from '../types';

/** 旧格式特征键：这些键在双轨重构时已被删除，出现即证明记录来自旧格式 */
const LEGACY_FEATURE_KEYS = ['currentEnv', 'buildEnv', 'versionPipeline'] as const;

/** 「导出旧数据」载荷的版本标识 */
export const LEGACY_RAW_VERSION = 'legacy-raw';

/** `legacy-raw` 载荷递归解包的最大层数（防御异常/自引用数据） */
const MAX_UNWRAP_DEPTH = 3;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 历史状态枚举 → 环境映射（覆盖两代旧枚举：9 态与 10 态）。
 * 仅供旧格式转换使用，运行时不引用。
 */
export const LEGACY_STATUS_TO_ENV: Record<string, BuildEnv> = {
  开发中: 'dev',
  已提测: 'test',
  测试中: 'test',
  测试通过: 'test',
  验收通过: 'test',
  预发布测试中: 'pre-txnj',
  'preb-txnj测试中': 'preb-txnj',
  'preb-txnj测试通过': 'preb-txnj',
  'pre-txnj测试中': 'pre-txnj',
  'pre-txnj测试通过': 'pre-txnj',
  待发布: 'pre',
  pre测试中: 'pre',
  pre测试通过: 'pre',
  线上验证中: 'pre',
  已发布: 'master',
};

/**
 * 单条记录是否为旧格式。
 *
 * 判定依据必须是「旧格式特征字段」，**不能**用 `envWeizan` 键是否存在——
 * 因为 `JSON.stringify` 会丢弃值为 `undefined` 的键，「该轨已被用户移除」在持久化/导出后
 * 同样表现为「键缺失」，两者不可区分。
 */
export function isLegacyRecord(rec: unknown): boolean {
  if (typeof rec !== 'object' || rec === null || Array.isArray(rec)) return false;
  const r = rec as Record<string, unknown>;
  if (LEGACY_FEATURE_KEYS.some((k) => r[k] !== undefined)) return true;
  // 更早（双轨之前）的版本：两轨字段都不存在，此时必须同时带旧 status 才认定，
  // 避免把「两条轨都被用户移除」误判为旧数据。
  return !('envWeizan' in r) && !('envStar' in r) && typeof r.status === 'string';
}

/** 读新格式的轨状态：键缺失 = 该轨已移除；null = 未开始；非空字符串 = 该环境；其余非法值按未开始处理 */
function readTrackState(v: unknown): TrackEnvState {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === 'string' && v.trim() !== '') return v;
  return null;
}

/** 归一化项目分支条目：三项均为非空字符串才保留（顺手剥掉旧格式的多余字段） */
function normalizeItems(raw: unknown): ProjectBranch[] {
  if (!Array.isArray(raw)) return [];
  const out: ProjectBranch[] = [];
  for (const v of raw) {
    if (typeof v !== 'object' || v === null) continue;
    const it = v as Record<string, unknown>;
    if (typeof it.id !== 'string' || !it.id.trim()) continue;
    if (typeof it.project !== 'string' || !it.project.trim()) continue;
    if (typeof it.branch !== 'string' || !it.branch.trim()) continue;
    out.push({ id: it.id, project: it.project, branch: it.branch });
  }
  return out;
}

/**
 * 旧格式拆轨：把单流水线字段还原为双轨状态。
 * - 旧 `currentEnv`（若属于某轨）→ 该轨阶段；
 * - 旧 `status`：'已发布' → 两条轨都置末段；其余按 LEGACY_STATUS_TO_ENV 反推所属轨；
 * - 旧 `versionPipeline`：starOnly → 移除微赞轨；weizanOnly → 移除星享轨。
 */
function splitLegacyTracks(r: Record<string, unknown>): { envWeizan: TrackEnvState; envStar: TrackEnvState } {
  let envWeizan: TrackEnvState = readTrackState(r.envWeizan) ?? null;
  let envStar: TrackEnvState = readTrackState(r.envStar) ?? null;

  if (typeof r.currentEnv === 'string' && r.currentEnv) {
    const track = trackOfEnv(r.currentEnv);
    if (track === 'weizan') envWeizan = r.currentEnv;
    else if (track === 'star') envStar = r.currentEnv;
  }

  if (envWeizan === null && envStar === null && typeof r.status === 'string') {
    if (r.status === '已发布') {
      envWeizan = trackFinalEnv('weizan');
      envStar = trackFinalEnv('star');
    } else {
      const env = LEGACY_STATUS_TO_ENV[r.status];
      if (env) {
        const track = trackOfEnv(env);
        if (track === 'weizan') envWeizan = env;
        else if (track === 'star') envStar = env;
      }
    }
  }

  if (r.versionPipeline === 'starOnly') envWeizan = undefined;
  else if (r.versionPipeline === 'weizanOnly') envStar = undefined;

  return { envWeizan, envStar };
}

/**
 * 单条记录归一化：兼容旧字段并转换为当前唯一格式。
 * 关键字段（id / name / tapdUrl / items 至少一项）缺失或不合法时返回 null，由调用方计入 invalidCount。
 *
 * @param raw 任意来源的单条记录
 * @param now 时间戳兜底值（ISO 字符串，注入以便纯函数可测）
 */
export function normalizeRequirement(raw: unknown, now: string): Requirement | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== 'string' || !r.id.trim()) return null;
  if (typeof r.name !== 'string' || !r.name.trim()) return null;
  if (typeof r.tapdUrl !== 'string' || !/^https?:\/\//.test(r.tapdUrl)) return null;

  const items = normalizeItems(r.items);
  if (items.length === 0) return null;

  const { envWeizan, envStar } = isLegacyRecord(r)
    ? splitLegacyTracks(r)
    : { envWeizan: readTrackState(r.envWeizan), envStar: readTrackState(r.envStar) };

  const version: Version =
    typeof r.version === 'string' && (VERSIONS as readonly string[]).includes(r.version)
      ? (r.version as Version)
      : '大版';

  return {
    id: r.id,
    name: r.name,
    tapdUrl: r.tapdUrl,
    items,
    releaseDate: typeof r.releaseDate === 'string' && DATE_RE.test(r.releaseDate) ? r.releaseDate : null,
    version,
    remark: typeof r.remark === 'string' && r.remark.trim() ? r.remark : undefined,
    envWeizan,
    envStar,
    testPassWeizan: typeof r.testPassWeizan === 'boolean' ? r.testPassWeizan : undefined,
    testPassStar: typeof r.testPassStar === 'boolean' ? r.testPassStar : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : now,
  };
}

/**
 * 旧数据检测：列表中任意一条为旧格式即返回 true。
 * 供页面提示条使用（仅提示用户走「导出旧数据 → 导入数据」闭环，不自动改动数据）。
 */
export function hasLegacyData(list: unknown[]): boolean {
  return list.some(isLegacyRecord);
}

/**
 * 列表级「一键迁移」：把列表中的旧格式记录**就地转换**为当前格式。
 *
 * 与导入（按 id 合并、可能跳过）不同，这里是原地替换，因此
 * 「旧数据已经在浏览器里」这一最常见的场景无需导出/导入文件往返。
 *
 * - 只处理 `isLegacyRecord` 命中的记录，其余（已是当前格式）原样返回，不产生任何 diff；
 * - 无法识别的记录**保持原样**（绝不丢数据）并计入 `failed`；
 * - 时间戳沿用记录自身的值，仅缺失时补 `now`（迁移不算一次"更新"）。
 *
 * @param list 当前需求列表
 * @param now 时间戳兜底值（ISO 字符串）
 * @returns 迁移后的新列表与统计（`migrated + failed = 旧格式记录数`）
 */
export function migrateLegacyList(
  list: Requirement[],
  now: string,
): { list: Requirement[]; migrated: number; failed: number } {
  let migrated = 0;
  let failed = 0;
  const next = list.map((r) => {
    if (!isLegacyRecord(r)) return r;
    const normalized = normalizeRequirement(r, now);
    if (!normalized) {
      failed += 1;
      return r;
    }
    migrated += 1;
    return normalized;
  });
  return { list: next, migrated, failed };
}

/**
 * 解包导入文件，取出记录数组。
 * 支持：朴素数组 / 带 requirements 数组的载荷（v1、v2）/ legacy-raw 载荷（递归解包 raw 字符串）。
 * @throws 文件非 JSON、结构无法识别、legacy-raw 缺少 raw 字段或嵌套过深时抛错
 */
function extractRecords(text: string, depth: number): unknown[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && data !== null) {
    const payload = data as Record<string, unknown>;
    if (payload.version === LEGACY_RAW_VERSION) {
      if (typeof payload.raw !== 'string') throw new Error('文件格式不正确，旧数据包缺少 raw 内容');
      if (depth >= MAX_UNWRAP_DEPTH) throw new Error('文件格式不正确，旧数据包嵌套过深');
      return extractRecords(payload.raw, depth + 1);
    }
    if (Array.isArray(payload.requirements)) return payload.requirements;
  }
  throw new Error('文件格式不正确，请使用本系统导出的 JSON 文件');
}

export interface ImportResult {
  requirements: Requirement[];
  /** 文件中格式非法被丢弃的条数 */
  invalidCount: number;
}

/**
 * 解析导入文件（唯一的数据入口）：识别朴素数组 / v1 / v2 / legacy-raw 四种输入，
 * 逐条归一化为当前唯一格式并剥离无效记录。
 *
 * @param text 文件文本内容
 * @throws 最外层结构无法识别时抛错（提示用户使用本系统导出的文件）
 */
export function parseImportFile(text: string): ImportResult {
  const records = extractRecords(text, 0);
  const now = new Date().toISOString();
  const requirements: Requirement[] = [];
  let invalidCount = 0;
  for (const raw of records) {
    const normalized = normalizeRequirement(raw, now);
    if (normalized) requirements.push(normalized);
    else invalidCount += 1;
  }
  return { requirements, invalidCount };
}
