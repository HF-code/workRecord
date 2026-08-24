import { useState } from 'react';
import { App as AntdApp, Button, Select, Space } from 'antd';
import { BuildOutlined, MergeOutlined } from '@ant-design/icons';
import { getCsrfToken, requestBuild, type BuildEnv } from '../build';

interface Props {
  /** 项目名（构建 payload 的 app 字段） */
  app: string;
  /** Git 仓库地址（项目配置页填写），用于拼接 MR 链接 */
  gitUrl?: string;
  /** 源分支（需求登记的开发分支） */
  branch?: string;
}

/** 将 git 仓库地址（scp 或 http 形式）转为 GitLab 预填 MR 链接
 * @param branch 源分支（需求登记的开发分支）
 * @param targetBranch 目标分支（构建环境下拉所选，默认 master）
 */
export function buildMergeRequestUrl(gitUrl: string, branch: string, targetBranch = 'master'): string {
  let web = gitUrl.trim().replace(/\.git$/, '');
  const scp = web.match(/^git@([^:]+):(.+)$/);
  if (scp) web = `https://${scp[1]}/${scp[2]}`;
  const params = new URLSearchParams({
    'merge_request[source_branch]': branch,
    'merge_request[target_branch]': targetBranch,
  });
  return `${web}/-/merge_requests/new?${params.toString()}`;
}

const ENV_OPTIONS: { label: string; value: BuildEnv }[] = [
  { label: 'dev', value: 'dev' },
  { label: 'test', value: 'test' },
  { label: 'pre', value: 'pre' },
  { label: 'pre-txnj', value: 'pre-txnj' },
];

export default function BuildControls({ app, gitUrl, branch }: Props) {
  const { message } = AntdApp.useApp();
  const [env, setEnv] = useState<BuildEnv>('test');
  const [building, setBuilding] = useState(false);

  const handleBuild = async () => {
    if (!getCsrfToken()) {
      message.warning('未登录运维平台，请先登录后再构建');
      return;
    }
    setBuilding(true);
    try {
      const result = await requestBuild({ app, env, update: false });
      if (result.ok) {
        message.success(`【${app}】构建触发成功`);
        return;
      }
      if (result.status === 401 || result.status === 403) {
        message.error('登录态已失效，请重新登录运维平台');
        return;
      }
      message.error(`构建失败：${result.detail}`);
    } finally {
      setBuilding(false);
    }
  };

  const handleOpenMr = () => {
    if (!gitUrl) {
      message.warning(`【${app}】未配置 Git 仓库地址，请先在「项目配置」页填写`);
      return;
    }
    if (!branch) {
      message.warning('该需求未填写开发分支，无法生成 MR 链接');
      return;
    }
    window.open(buildMergeRequestUrl(gitUrl, branch, env), '_blank', 'noreferrer');
  };

  return (
    <Space.Compact size="small">
      <Select
        value={env}
        onChange={setEnv}
        options={ENV_OPTIONS}
        style={{ width: 96 }}
      />
      <Button icon={<BuildOutlined />} loading={building} onClick={() => void handleBuild()}>
        构建
      </Button>
      <Button icon={<MergeOutlined />} onClick={handleOpenMr}>
        提交MR
      </Button>
    </Space.Compact>
  );
}
