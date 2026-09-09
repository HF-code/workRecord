/**
 * 常驻右侧构建面板（替代原 Drawer）：
 * - 展开态（默认）：380px sticky 等高列（高度=视口减头部与边距），构建任务列表 + 制品清单内部滚动；
 * - 折叠态：44px 竖条（竖排「构建任务」+ 进行中 Badge），点击展开。
 * 数据与 useBuildTasks 全局同源：单卡构建 / 批量构建 / 快速构建触发的任务均汇入此处。
 */
import { Badge, Button, Card, Empty, Space, Tag, Typography } from 'antd';
import { ContainerOutlined } from '@ant-design/icons';
import { useBuildTasks, type BuildTask, type BuildTaskPhase } from '../hooks/useBuildTasks';
import ArtifactList from './ArtifactList';

const TASK_PHASE_TEXT: Record<BuildTaskPhase, { text: string; color: string }> = {
  building: { text: '构建中', color: 'processing' },
  waiting: { text: '等待重试', color: 'warning' },
  done: { text: '已完成', color: 'success' },
  failed: { text: '失败', color: 'error' },
  cancelled: { text: '已取消', color: 'default' },
};

/** 单条构建任务卡片（仅展示 项目·环境 + 状态 + 制品链接，不展示需求名） */
function BuildTaskItem({
  task,
  onCancel,
  onRemove,
}: {
  task: BuildTask;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const phase = TASK_PHASE_TEXT[task.phase];
  const active = task.phase === 'building' || task.phase === 'waiting';
  return (
    <Card size="small" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#333', fontWeight: 600 }}>
            {task.app} · {task.env}
          </div>
          <div style={{ marginTop: 6 }}>
            <Tag color={phase.color}>{phase.text}</Tag>
            {task.phase === 'waiting' && (
              <span style={{ fontSize: 12, color: '#888' }}>
                第 {task.retry} 次重试，{task.nextInSec}s 后
              </span>
            )}
            {task.artifact?.status === 'success' && task.artifact.fileUrl && (
              <div style={{ marginTop: 4 }}>
                <a
                  href={task.artifact.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12 }}
                  data-testid="build-task-artifact-link"
                >
                  制品链接
                </a>
              </div>
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {active ? (
            <Button danger size="small" onClick={onCancel} data-testid="build-task-cancel-button">
              取消
            </Button>
          ) : (
            <Button size="small" onClick={onRemove} data-testid="build-task-remove-button">
              移除
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

interface Props {
  /** 面板展开/折叠状态 */
  open: boolean;
  /** 切换展开/折叠 */
  onToggle: () => void;
}

export default function BuildPanel({ open, onToggle }: Props) {
  const { tasks, activeCount, cancelTask, removeTask, clear } = useBuildTasks();

  // 折叠态：44px 竖条（竖排标题 + 进行中 Badge），点击展开
  if (!open) {
    return (
      <div
        style={{
          width: 44,
          height: 'calc(100vh - 88px)',
          flexShrink: 0,
          position: 'sticky',
          top: 16,
          borderLeft: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0',
          gap: 12,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={onToggle}
        data-testid="build-panel-collapsed-bar"
        title="展开构建面板"
      >
        <Badge count={activeCount} size="small" offset={[0, 2]}>
          <Button type="text" icon={<ContainerOutlined />} />
        </Badge>
        <span style={{ writingMode: 'vertical-rl', letterSpacing: 4, fontSize: 12, color: '#666' }}>
          构建任务
        </span>
      </div>
    );
  }

  // 展开态：sticky 等高列（高度=视口减头部/边距），内部各自滚动
  return (
    <div
      style={{
        width: 380,
        height: 'calc(100vh - 88px)',
        flexShrink: 0,
        position: 'sticky',
        top: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 0,
      }}
    >
      {/* 标题行 + 清空 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Typography.Text strong>
          构建任务{activeCount > 0 ? <span style={{ color: '#1677ff' }}>（进行中 {activeCount}）</span> : null}
        </Typography.Text>
        <Space size={4}>
          {tasks.length > 0 ? (
            <Button type="link" size="small" onClick={clear} data-testid="build-tasks-clear-button">
              清空记录
            </Button>
          ) : null}
          <Button type="text" size="small" onClick={onToggle} data-testid="build-panel-collapse-button" title="折叠面板">
            收起
          </Button>
        </Space>
      </div>

      {/* 任务列表（独立滚动） */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tasks.length === 0 ? (
          <Empty description="暂无构建任务" style={{ padding: '24px 0' }} />
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {tasks.map((t) => (
              <BuildTaskItem
                key={t.id}
                task={t}
                onCancel={() => cancelTask(t.id)}
                onRemove={() => removeTask(t.id)}
              />
            ))}
          </Space>
        )}
      </div>

      {/* 制品清单：与任务同源，常驻可见（内部自带限高滚动） */}
      <ArtifactList />
    </div>
  );
}
