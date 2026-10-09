import { Navigate, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useAuth, homeFor } from '../context/AuthContext.jsx';
import { Button, EmptyState, PageLoader } from './ui/index.jsx';

/**
 * Client-side route guard (for navigation only — every API endpoint enforces
 * the same rules on the server).
 */
export function RequireRole({ roles, permission, children }) {
  const { user, status, can } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <AccessDenied />;
  if (permission && !can(permission)) return <AccessDenied message="Your administrator role does not include this area." />;
  return children;
}

export function AccessDenied({ message }) {
  const { user } = useAuth();
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={ShieldAlert}
        title="You don’t have access to this page"
        description={message ?? `You are signed in as a ${user?.role?.toLowerCase()} account. Switch accounts to continue.`}
        action={<Button to={homeFor(user)}>Go to my dashboard</Button>}
      />
    </div>
  );
}

export function GuestOnly({ children }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (user) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(user)} replace />;
  }
  return children;
}
