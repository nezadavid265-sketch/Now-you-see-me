import { usePageTitle } from '../../hooks/index.js';
import { NotificationPrefsCard, PasswordCard, ProfileCard } from '../../components/shared/AccountSecurity.jsx';
import { PageHeader } from '../../components/ui/index.jsx';

export default function Settings() {
  usePageTitle('Account settings');
  return (
    <div className="space-y-6">
      <PageHeader title="Account settings" />
      <ProfileCard />
      <NotificationPrefsCard />
      <PasswordCard />
    </div>
  );
}
