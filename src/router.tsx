import { createHashRouter, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import RequirementListPage from './pages/RequirementListPage';
import SettingsPage from './pages/SettingsPage';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <RequirementListPage /> },
      {
        path: 'settings',
        children: [
          { index: true, element: <Navigate to="/settings/branches" replace /> },
          { path: ':sub', element: <SettingsPage /> },
        ],
      },
      // 兼容旧入口：项目配置重定向到系统配置 → 项目配置子页
      { path: 'config', element: <Navigate to="/settings/projects" replace /> },
      { path: 'projects', element: <Navigate to="/settings/projects" replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
