import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useForm } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Alert, Button, Card, CardHeader, Input, PasswordInput, Toggle } from '../ui/index.jsx';

export function ProfileCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const form = useForm({ name: user.name, phone: user.phone ?? '' });
  const onSubmit = form.submit(async (v) => {
    const { user: updated } = await api('/account/profile', { method: 'PATCH', body: v });
    setUser(updated);
    toast.success('Profile updated');
  });
  return (
    <Card>
      <CardHeader title="Personal details" description="Used for deliveries and account communication." />
      <form onSubmit={onSubmit} className="space-y-4">
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" required {...form.field('name')} />
          <Input label="Phone number" type="tel" {...form.field('phone')} />
        </div>
        <Input label="Email" value={user.email} disabled hint="Contact support to change your sign-in email." />
        <div className="flex justify-end">
          <Button type="submit" loading={form.submitting}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function NotificationPrefsCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const save = async (patch) => {
    try {
      const { user: updated } = await api('/account/profile', { method: 'PATCH', body: patch });
      setUser(updated);
      toast.success('Preferences saved');
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <Card>
      <CardHeader title="Notifications" description="In-app notifications are always on. Choose extra channels." />
      <div className="space-y-4">
        <Toggle label="Email updates" description="Order confirmations, shipping and refund updates." checked={user.notifyEmail} onChange={(v) => save({ notifyEmail: v })} />
        <Toggle label="SMS updates" description={user.phone ? `Text messages to ${user.phone} for important order steps.` : 'Add a phone number to receive SMS.'} checked={user.notifySms} disabled={!user.phone} onChange={(v) => save({ notifySms: v })} />
      </div>
    </Card>
  );
}

export function PasswordCard() {
  const { setAccessToken } = useAuth();
  const toast = useToast();
  const form = useForm({ currentPassword: '', newPassword: '', confirm: '' });
  const onSubmit = form.submit(async (v) => {
    if (v.newPassword !== v.confirm) {
      const err = new Error('The new passwords do not match.');
      err.fieldErrors = { confirm: 'Passwords do not match' };
      throw err;
    }
    const res = await api('/account/change-password', { method: 'POST', body: { currentPassword: v.currentPassword, newPassword: v.newPassword } });
    setAccessToken(res.accessToken);
    form.setValues({ currentPassword: '', newPassword: '', confirm: '' });
    toast.success(res.message);
  });
  return (
    <Card>
      <CardHeader title="Password" description="Changing your password signs you out on other devices." />
      <form onSubmit={onSubmit} className="space-y-4">
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <PasswordInput label="Current password" autoComplete="current-password" required {...form.field('currentPassword')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordInput label="New password" autoComplete="new-password" required hint="At least 8 characters with letters and numbers." {...form.field('newPassword')} />
          <PasswordInput label="Confirm new password" autoComplete="new-password" required {...form.field('confirm')} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={form.submitting}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const toast = useToast();
  const [sent, setSent] = useState(false);
  if (!user || user.emailVerified) return null;
  const resend = async () => {
    try {
      const res = await api('/auth/resend-verification', { method: 'POST' });
      setSent(true);
      toast.success(res.message);
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <Alert
      tone="warning"
      title="Please confirm your email address"
      action={
        <Button size="sm" variant="outline" icon={MailCheck} onClick={resend} disabled={sent}>
          {sent ? 'Email sent' : 'Resend email'}
        </Button>
      }
    >
      We sent a confirmation link to {user.email}.
    </Alert>
  );
}
