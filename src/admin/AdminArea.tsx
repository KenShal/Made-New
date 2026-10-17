import { Route, Routes } from 'react-router-dom';
import { WorkspaceLayout } from '@/components/Workspace';
import { RequireRole } from '@/components/RequireRole';
import { useAuth } from '@/state/auth';
import { AdminEarnings, AdminOrders, AdminOverview, AdminPayouts, AdminProducts, AdminSettings, AdminUsers, ReviewDetail, ReviewQueue } from './AdminPages';

export default function AdminArea() {
  const { hasRole } = useAuth();
  const nav = [
    { to: '/admin', label: 'Overview', end: true },
    { to: '/admin/design-reviews', label: 'Design reviews', show: hasRole('reviewer', 'admin') },
    { to: '/admin/users', label: 'Users', show: hasRole('admin') },
    { to: '/admin/products', label: 'Products', show: hasRole('admin') },
    { to: '/admin/orders', label: 'Orders', show: hasRole('admin', 'finance') },
    { to: '/admin/earnings', label: 'Earnings', show: hasRole('finance') },
    { to: '/admin/payouts', label: 'Payouts', show: hasRole('finance') },
    { to: '/admin/settings', label: 'Settings', show: hasRole('admin') },
  ];
  // Finance is deliberately separate from design review: neither implies the other.
  return (
    <Routes>
      <Route element={<WorkspaceLayout title="Control centre" nav={nav} id="admin" />}>
        <Route index element={<AdminOverview />} />
        <Route path="design-reviews" element={<RequireRole roles={['reviewer', 'admin']}><ReviewQueue /></RequireRole>} />
        <Route path="design-reviews/:designId" element={<RequireRole roles={['reviewer', 'admin']}><ReviewDetail /></RequireRole>} />
        <Route path="users" element={<RequireRole roles={['admin']}><AdminUsers /></RequireRole>} />
        <Route path="products" element={<RequireRole roles={['admin']}><AdminProducts /></RequireRole>} />
        <Route path="orders" element={<RequireRole roles={['admin', 'finance']}><AdminOrders /></RequireRole>} />
        <Route path="earnings" element={<RequireRole roles={['finance']}><AdminEarnings /></RequireRole>} />
        <Route path="payouts" element={<RequireRole roles={['finance']}><AdminPayouts /></RequireRole>} />
        <Route path="settings" element={<RequireRole roles={['admin']}><AdminSettings /></RequireRole>} />
      </Route>
    </Routes>
  );
}
