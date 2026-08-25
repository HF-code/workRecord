import { useNavigate, useParams } from 'react-router-dom';
import { Card, Layout, Menu, Typography } from 'antd';
import { ApartmentOutlined, AppstoreOutlined } from '@ant-design/icons';
import BranchConfigPage from './BranchConfigPage';
import ProjectConfigPage from './ProjectConfigPage';

const { Sider, Content } = Layout;

const SUBMENU = [
  { key: 'branches', label: '分支配置', icon: <ApartmentOutlined /> },
  { key: 'projects', label: '项目配置', icon: <AppstoreOutlined /> },
];

/** 根据当前 sub 参数直接渲染对应子配置，避免嵌套 Routes 因动态段导致匹配空白 */
function renderSub(sub?: string) {
  if (sub === 'projects') return <ProjectConfigPage />;
  return <BranchConfigPage />;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { sub } = useParams();
  const active = sub && sub !== 'branches' && sub !== 'projects' ? 'branches' : sub ?? 'branches';

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        系统配置
      </Typography.Title>
      <Layout style={{ background: 'transparent' }}>
        <Sider width={180} theme="light" style={{ background: 'transparent' }}>
          <Menu
            mode="inline"
            selectedKeys={[active]}
            onClick={({ key }) => navigate(`/settings/${key}`)}
            items={SUBMENU}
            style={{ borderInlineEnd: 'none' }}
          />
        </Sider>
        <Content style={{ padding: '0 0 0 16px' }}>{renderSub(sub)}</Content>
      </Layout>
    </Card>
  );
}
