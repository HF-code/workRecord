import dayjs from 'dayjs';
import { STATUSES, VERSIONS, type ProjectBranch, type Requirement, type Status } from './types';

export interface ExportPayload {
  version: 1;
  exportedAt: string;
  type: 'all' | 'archive';
  requirements: Requirement[];
}

export function buildExportPayload(
  type: 'all' | 'archive',
  requirements: Requirement[],
): ExportPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    type,
    requirements,
  };
}

export function downloadJson(payload: ExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `work-tracker-${payload.type}-${dayjs().format('YYYYMMDD-HHmm')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 找出「发版时间在一个月以前」的需求（releaseDate 为空的永不清理） */
export function findOlderThanOneMonth(list: Requirement[]): Requirement[] {
  const threshold = dayjs().subtract(1, 'month').format('YYYY-MM-DD');
  return list.filter((r) => r.releaseDate !== null && r.releaseDate < threshold);
}

export function exportAll(list: Requirement[]): void {
  downloadJson(buildExportPayload('all', list));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidStatus(v: unknown): v is Status {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

function isValidItem(v: unknown): v is ProjectBranch {
  if (typeof v !== 'object' || v === null) return false;
  const it = v as Record<string, unknown>;
  return (
    typeof it.id === 'string' &&
    typeof it.project === 'string' &&
    typeof it.branch === 'string' &&
    it.branch.trim() !== ''
  );
}

function isValidRequirement(v: unknown): v is Requirement {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    r.name.trim() !== '' &&
    typeof r.tapdUrl === 'string' &&
    /^https?:\/\//.test(r.tapdUrl) &&
    Array.isArray(r.items) &&
    r.items.every(isValidItem) &&
    isValidStatus(r.status) &&
    (r.releaseDate === null || (typeof r.releaseDate === 'string' && DATE_RE.test(r.releaseDate))) &&
    (r.remark === undefined || typeof r.remark === 'string') &&
    (r.version === undefined || (typeof r.version === 'string' && (VERSIONS as readonly string[]).includes(r.version)))
  );
}

export interface ImportResult {
  requirements: Requirement[];
  /** 文件中格式非法被丢弃的条数 */
  invalidCount: number;
}

/** 解析导入文件，失败时抛错（JSON 损坏 / 不是本系统导出格式） */
export function parseImportFile(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  const payload = data as Partial<ExportPayload>;
  if (payload?.version !== 1 || !Array.isArray(payload.requirements)) {
    throw new Error('文件格式不正确，请使用本系统导出的 JSON 文件');
  }
  const now = new Date().toISOString();
  const valid: Requirement[] = [];
  let invalidCount = 0;
  for (const raw of payload.requirements as unknown[]) {
    if (isValidRequirement(raw)) {
      valid.push({
        ...raw,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
      });
    } else {
      invalidCount += 1;
    }
  }
  return { requirements: valid, invalidCount };
}
