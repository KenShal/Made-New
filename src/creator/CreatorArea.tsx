import { Navigate, Route, Routes } from 'react-router-dom';
import { WorkspaceLayout } from '@/components/Workspace';
import { RequireRole } from '@/components/RequireRole';
import { CreatorAnalytics, CreatorCampaigns, CreatorDashboard, CreatorEarnings, CreatorSettings, DesignsList, Onboarding } from './CreatorPages';
import { DesignDetail, NewDesign } from './DesignDetail';

const NAV = [
  { to: '/creator/dashboard', label: 'Overview' },
  { to: '/creator/designs', label: 'Designs', end: true },
  { to: '/creator/designs/new', label: 'New design' },
  { to: '/creator/campaigns', label: 'Campaigns' },
  { to: '/creator/analytics', label: 'Analytics' },
  { to: '/creator/earnings', label: 'Earnings' },
  { to: '/creator/settings', label: 'Settings' },
];

export default function CreatorArea() {
  const creator = (el: JSX.Element) => <RequireRole roles={['creator']}>{el}</RequireRole>;
  return (
    <Routes>
      <Route element={<WorkspaceLayout title="Creator studio" nav={NAV} id="creator" />}>
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="dashboard" element={creator(<CreatorDashboard />)} />
        <Route path="designs" element={creator(<DesignsList />)} />
        <Route path="designs/new" element={creator(<NewDesign />)} />
        <Route path="designs/:designId" element={creator(<DesignDetail />)} />
        <Route path="campaigns" element={creator(<CreatorCampaigns />)} />
        <Route path="analytics" element={creator(<CreatorAnalytics />)} />
        <Route path="earnings" element={creator(<CreatorEarnings />)} />
        <Route path="settings" element={creator(<CreatorSettings />)} />
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  );
}
