import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RequireRole } from './RequireRole';

type AuthStub = { user: null | { id: string }; loading: boolean; hasRole: (...r: string[]) => boolean };
const auth = vi.hoisted(() => ({ value: { user: null, loading: false, hasRole: () => false } as AuthStub }));
vi.mock('@/state/auth', () => ({ useAuth: () => auth.value }));

function Login() {
  const loc = useLocation();
  return <p>login {loc.search}</p>;
}
const tree = (
  <MemoryRouter initialEntries={['/admin/reviews?tab=1']}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/admin/reviews" element={<RequireRole roles={['admin']}><p>secret</p></RequireRole>} />
    </Routes>
  </MemoryRouter>
);

describe('RequireRole', () => {
  it('redirects signed-out visitors to login with a safe next path', () => {
    auth.value = { user: null, loading: false, hasRole: () => false };
    render(tree);
    expect(screen.getByText(/login/)).toHaveTextContent('?next=%2Fadmin%2Freviews%3Ftab%3D1');
  });
  it('shows an access message, not the page, to users without the role', () => {
    auth.value = { user: { id: 'u' }, loading: false, hasRole: () => false };
    render(tree);
    expect(screen.queryByText('secret')).toBeNull();
    expect(screen.getByRole('heading', { name: /don.t have access/ })).toBeInTheDocument();
  });
  it('renders for permitted roles', () => {
    auth.value = { user: { id: 'u' }, loading: false, hasRole: () => true };
    render(tree);
    expect(screen.getByText('secret')).toBeInTheDocument();
  });
});
