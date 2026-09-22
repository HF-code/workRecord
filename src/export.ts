/**
 * 数据导出（与清理辅助）。
 *
 * 导出两种产物：
 * - 「导出数据」：当前唯一格式（version: 2），供备份与跨设备搬运；
 * - 「导出旧数据」：把浏览器中现存的 requirements **原始字符串**原样打包（version: 'legacy-raw'），
 *   不做任何解析——即使内容已损坏或仍是旧格式也能完整取回，用于旧版数据逃生。
 *
 * 导入解析（含旧格式转换）不在此文件，统一收口到 utils/legacyImport.ts。
 */
import dayjs from 'dayjs';
import { loadRequirementsRaw } from './storage';
import { LEGACY_RAW_VERSION } from './utils/legacyImport';
import type { Requirement } from './types';

/** 当前唯一格式的导出载荷版本 */
export const EXPORT_VERSION = 2;

export interface ExportPayload {
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  type: 'all' | 'archive';
  requirements: Requirement[];
}

/** 「导出旧数据」载荷：原样保留 localStorage 原始字符串 */
export interface LegacyRawPayload {
  version: typeof LEGACY_RAW_VERSION;
  exportedAt: string;
  raw: string;
}

function downloadJson(payload: ExportPayload | LegacyRawPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const label = payload.version === EXPORT_VERSION ? payload.type : LEGACY_RAW_VERSION;
  a.download = `work-tracker-${label}-${dayjs().format('YYYYMMDD-HHmm')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildExportPayload(
  type: 'all' | 'archive',
  requirements: Requirement[],
): ExportPayload {
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    type,
    requirements,
  };
}

/** 找出「发版时间在一个月以前」的需求（releaseDate 为空的永不清理） */
export function findOlderThanOneMonth(list: Requirement[]): Requirement[] {
  const threshold = dayjs().subtract(1, 'month').format('YYYY-MM-DD');
  return list.filter((r) => r.releaseDate !== null && r.releaseDate < threshold);
}

export function exportAll(list: Requirement[]): void {
  downloadJson(buildExportPayload('all', list));
}

/** 归档导出：把待清理的数据单独打包下载（「导出并清理」的导出环节，先导出再删除） */
export function exportArchive(list: Requirement[]): void {
  downloadJson(buildExportPayload('archive', list));
}

/**
 * 导出旧数据：原样打包浏览器中现存的 requirements 字符串，不做任何转换。
 * 用于旧版环境逃生——拿到文件后经「导入数据」自动转换为新格式。
 * @returns 浏览器中无需求数据（从未存储）时返回 false
 */
export function exportLegacyRaw(): boolean {
  const raw = loadRequirementsRaw();
  if (raw === null) return false;
  downloadJson({ version: LEGACY_RAW_VERSION, exportedAt: new Date().toISOString(), raw });
  return true;
}
