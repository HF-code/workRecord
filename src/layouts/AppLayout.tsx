import { Layout, Menu } from 'antd';
import { BarChartOutlined, SettingOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Header, Content } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey = location.pathname.startsWith('/projects') ? '/projects' : '/';

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 24 }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>工作记录</span>
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          style={{ flex: 1, borderBottom: 'none' }}
          onClick={({ key }) => navigate(key)}
          items={[
            { key: '/', icon: <BarChartOutlined />, label: '需求记录' },
            { key: '/projects', icon: <SettingOutlined />, label: '项目配置' },
          ]}
        />
      </Header>
      <Content style={{ padding: '24px 16px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}
