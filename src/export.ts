import dayjs from 'dayjs';
import type { Requirement } from './types';

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
