import { useState } from 'react';
import { App as AntdApp, Button, Select, Space } from 'antd';
import { BuildOutlined } from '@ant-design/icons';
import { getCsrfToken, requestBuild, type BuildEnv } from '../build';

interface Props {
  /** 项目名（构建 payload 的 app 字段） */
  app: string;
}

const ENV_OPTIONS: { label: string; value: BuildEnv }[] = [
  { label: 'dev', value: 'dev' },
  { label: 'test', value: 'test' },
  { label: 'pre', value: 'pre' },
];

export default function BuildControls({ app }: Props) {
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

  return (
    <Space.Compact size="small">
      <Select
        value={env}
        onChange={setEnv}
        options={ENV_OPTIONS}
        style={{ width: 76 }}
      />
      <Button icon={<BuildOutlined />} loading={building} onClick={() => void handleBuild()}>
        构建
      </Button>
    </Space.Compact>
  );
}
