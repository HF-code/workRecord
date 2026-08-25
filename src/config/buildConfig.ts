/**
 * 构建相关系统配置。
 * 目前包含「构建轮询间隔」：当构建失败的原因为「上一任务尚未完成，请耐心等待」时，
 * 前端按该间隔自动重试触发本次构建。
 * 默认 10 秒，最小 5 秒，最大不限制。
 */

export const DEFAULT_BUILD_POLL_INTERVAL = 10; // 秒
export const MIN_BUILD_POLL_INTERVAL = 5; // 秒
// 最小 5 秒，最大暂时不限制

/** 归一化轮询间隔：缺失或非数字回退默认；小于最小值取最小值；无上限 */
export function normalizePollInterval(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BUILD_POLL_INTERVAL;
  return Math.max(MIN_BUILD_POLL_INTERVAL, Math.floor(n));
}

/** 构建失败且需轮询重试的提示文案（精确匹配 detail） */
export const BUILD_BUSY_DETAIL = '上一任务尚未完成，请耐心等待';
