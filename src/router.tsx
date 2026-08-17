import { createHashRouter, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import RequirementListPage from './pages/RequirementListPage';
import ProjectConfigPage from './pages/ProjectConfigPage';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <RequirementListPage /> },
      {
        path: 'projects',
        element: <ProjectConfigPage />,
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
