/**
 * 构建任务完成通知（全局常驻，挂 AppLayout，跨路由生效）：
 * - antd notification：任务触发失败 / 制品查询终态时桌面弹窗（含查看记录链接）；
 * - 浏览器系统通知：标签页非激活（document.hidden）且已授权时同步系统级提醒；
 * - 标签页标题：进行中 `(N●) 工作记录`，全部结束瞬间 `(✓) 工作记录`（3 秒后还原）。
 * 幂等去重：useRef<Set> 记录已提示的终态任务 key，任务从列表消失时清理。
 */
import { useEffect, useRef } from 'react';
import { App as AntdApp } from 'antd';
import { useBuildTasks, type BuildTask } from './useBuildTasks';

/** 构建记录页链接打开文案（notification description 用） */
function recordLink(task: BuildTask): string {
  return task.recordUrl ? `编号可见于构建记录：${task.recordUrl}` : '';
}

export function useBuildNotifications(): void {
  const { notification } = AntdApp.useApp();
  const { tasks, activeCount } = useBuildTasks();

  const notifiedRef = useRef<Set<string>>(new Set());
  /** 首次挂载时的原始标题（卸载/还原依据） */
  const baseTitleRef = useRef(document.title);
  /** 完成闪烁的定时器（卸载时清理） */
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 是否已请求过浏览器通知授权 */
  const permissionAskedRef = useRef(false);

  useEffect(() => {
    // 首次出现进行中任务时请求浏览器通知授权（仅一次）
    if (!permissionAskedRef.current && activeCount > 0) {
      permissionAskedRef.current = true;
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission();
      }
    }

    // 标签页标题：进行中 (N●)；从 >0 归零时 (✓) 闪 3 秒
    if (activeCount > 0) {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      document.title = `(${activeCount}●) ${baseTitleRef.current}`;
    } else {
      const wasActive = document.title.includes('●');
      if (wasActive) {
        document.title = `(✓) ${baseTitleRef.current}`;
        flashTimerRef.current = setTimeout(() => {
          document.title = baseTitleRef.current;
        }, 3000);
      }
    }

    // 终态任务提示（幂等）
    for (const t of tasks) {
      const artifactDone =
        t.artifact?.status === 'success' || t.artifact?.status === 'fail' || t.artifact?.status === 'timeout';
      const failKey = t.phase === 'failed' ? `${t.id}:failed` : null;
      const artifactKey = artifactDone ? `${t.id}:artifact-${t.artifact!.status}` : null;
      const keys = [failKey, artifactKey].filter(Boolean) as string[];
      for (const key of keys) {
        if (notifiedRef.current.has(key)) continue;
        notifiedRef.current.add(key);
        if (key === failKey) {
          const title = `【${t.app}】构建触发失败`;
          notification.error({ message: title, description: t.detail || '请稍后重试' });
          sendSystemNotification(title, t.detail || '');
        } else if (key === artifactKey && t.artifact) {
          if (t.artifact.status === 'success') {
            const title = `【${t.app}】构建完成`;
            notification.success({
              message: title,
              description: (
                <span>
                  {t.artifact.fileUrl ? (
                    <a href={t.artifact.fileUrl} target="_blank" rel="noreferrer">
                      {t.artifact.fileUrl}
                    </a>
                  ) : (
                    '成功但未返回制品链接'
                  )}
                  {recordLink(t) ? (
                    <>
                      <br />
                      <a href={t.recordUrl} target="_blank" rel="noreferrer">
                        查看构建记录
                      </a>
                    </>
                  ) : null}
                </span>
              ),
            });
            sendSystemNotification(title, t.artifact.fileUrl ?? '制品链接见页面通知');
          } else {
            // fail / timeout
            const title = `【${t.app}】构建${t.artifact.status === 'timeout' ? '超时' : '失败'}`;
            notification.warning({ message: title, description: t.artifact.reason ?? '' });
            sendSystemNotification(title, t.artifact.reason ?? '');
          }
        }
      }
    }

    // 清理已消失任务的 key（被移除/清空后重跑同任务不再误提示）
    const alive = new Set(tasks.map((t) => t.id));
    for (const key of notifiedRef.current) {
      const id = key.split(':')[0];
      if (!alive.has(id)) notifiedRef.current.delete(key);
    }
  }, [tasks, activeCount, notification]);

  // 卸载还原标题、清定时器
  useEffect(() => {
    return () => {
      document.title = baseTitleRef.current;
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);
}

/** 浏览器系统通知：仅在已授权且标签页非激活时发送（静默失败） */
function sendSystemNotification(title: string, body: string): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    new Notification(title, { body, tag: `work-tracker:${title}` });
  } catch {
    // 部分环境（如无安全上下文）构造 Notification 会抛错，静默忽略
  }
}
