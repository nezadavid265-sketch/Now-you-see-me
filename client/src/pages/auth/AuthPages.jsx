import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CircleCheck, MailCheck, Store } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth, homeFor } from '../../context/AuthContext.jsx';
import { useForm, usePageTitle } from '../../hooks/index.js';
import { Alert, Button, Input, PasswordInput, Spinner } from '../../components/ui/index.jsx';

function safeNext(params) {
  const next = params.get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

function Heading({ title, subtitle }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

export function Login() {
  usePageTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm({ email: '', password: '' });
  const onSubmit = form.submit(async ({ email, password }) => {
    const user = await login(email, password);
    navigate(safeNext(params) ?? homeFor(user), { replace: true });
  });
  return (
    <>
      <Heading title="Welcome back" subtitle="Sign in to shop, track orders or manage your store." />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <Input label="Email address" type="email" autoComplete="email" required autoFocus {...form.field('email')} />
        <PasswordInput label="Password" autoComplete="current-password" required {...form.field('password')} />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={form.submitting}>
          Sign in
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-slate-600">
        New to Rivoshoppa?{' '}
        <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`} className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-slate-600">
        Want to sell?{' '}
        <Link to="/register/seller" className="font-semibold text-brand-700 hover:underline">
          Open a shop
        </Link>
      </p>
    </>
  );
}

function RegisterForm({ seller }) {
  const { register, registerSeller } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm({ name: '', email: '', phone: '', password: '' });
  const onSubmit = form.submit(async (values) => {
    const user = await (seller ? registerSeller(values) : register(values));
    navigate(seller ? '/seller/onboarding' : safeNext(params) ?? homeFor(user), { replace: true });
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {form.formError && <Alert tone="error">{form.formError}</Alert>}
      <Input label="Full name" autoComplete="name" required autoFocus {...form.field('name')} />
      <Input label="Email address" type="email" autoComplete="email" required {...form.field('email')} />
      <Input label={seller ? 'Phone number' : 'Phone number (optional)'} type="tel" autoComplete="tel" placeholder="07XX XXX XXX" required={seller} hint="Used for delivery updates." {...form.field('phone')} />
      <PasswordInput label="Password" autoComplete="new-password" required hint="At least 8 characters, with letters and numbers." {...form.field('password')} />
      <Button type="submit" size="lg" className="w-full" loading={form.submitting}>
        {seller ? 'Create seller account' : 'Create account'}
      </Button>
      <p className="text-center text-xs text-slate-500">
        By continuing you agree to our{' '}
        <Link to="/pages/terms" className="underline">Terms</Link> and <Link to="/pages/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </form>
  );
}

export function Register() {
  usePageTitle('Create account');
  return (
    <>
      <Heading title="Create your account" subtitle="Shop thousands of products from verified Rwandan sellers." />
      <RegisterForm />
      <p className="mt-8 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link>
      </p>
    </>
  );
}

export function RegisterSeller() {
  usePageTitle('Open a shop');
  return (
    <>
      <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
        <Store className="size-6" />
      </div>
      <Heading title="Start selling on Rivoshoppa" subtitle="Create your seller account. Next, you’ll add your shop and business details — it takes about 5 minutes." />
      <RegisterForm seller />
      <p className="mt-8 text-center text-sm text-slate-600">
        Already selling?{' '}
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link>
      </p>
    </>
  );
}

export function ForgotPassword() {
  usePageTitle('Reset password');
  const [sent, setSent] = useState(false);
  const form = useForm({ email: '' });
  const onSubmit = form.submit(async (v) => {
    await api('/auth/forgot-password', { method: 'POST', body: v });
    setSent(true);
  });
  if (sent) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto size-12 text-brand-600" />
        <Heading title="Check your email" subtitle={`If an account exists for ${form.values.email}, we’ve sent a link to reset your password. It expires in 30 minutes.`} />
        <Button to="/login" variant="outline">Back to sign in</Button>
      </div>
    );
  }
  return (
    <>
      <Heading title="Forgot your password?" subtitle="Enter your email and we’ll send you a reset link." />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <Input label="Email address" type="email" autoComplete="email" required autoFocus {...form.field('email')} />
        <Button type="submit" size="lg" className="w-full" loading={form.submitting}>Send reset link</Button>
      </form>
      <p className="mt-8 text-center text-sm">
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">Back to sign in</Link>
      </p>
    </>
  );
}

export function ResetPassword() {
  usePageTitle('Choose a new password');
  const [params] = useSearchParams();
  const [done, setDone] = useState(false);
  const form = useForm({ password: '', confirm: '' });
  const token = params.get('token');
  const onSubmit = form.submit(async (v) => {
    if (v.password !== v.confirm) {
      const err = new Error('Passwords do not match.');
      err.fieldErrors = { confirm: 'Passwords do not match' };
      throw err;
    }
    await api('/auth/reset-password', { method: 'POST', body: { token, password: v.password } });
    setDone(true);
  });
  if (!token) return <Alert tone="error" title="Invalid link">This password reset link is incomplete. Request a new one.</Alert>;
  if (done) {
    return (
      <div className="text-center">
        <CircleCheck className="mx-auto size-12 text-emerald-600" />
        <Heading title="Password updated" subtitle="You can now sign in with your new password. Other devices have been signed out." />
        <Button to="/login">Sign in</Button>
      </div>
    );
  }
  return (
    <>
      <Heading title="Choose a new password" />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <PasswordInput label="New password" autoComplete="new-password" required hint="At least 8 characters, with letters and numbers." {...form.field('password')} />
        <PasswordInput label="Confirm password" autoComplete="new-password" required {...form.field('confirm')} />
        <Button type="submit" size="lg" className="w-full" loading={form.submitting}>Update password</Button>
      </form>
    </>
  );
}

export function VerifyEmail() {
  usePageTitle('Confirm email');
  const [params] = useSearchParams();
  const { user, reloadUser } = useAuth();
  const [state, setState] = useState({ status: 'loading' });
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token: params.get('token') ?? '' } })
      .then((res) => {
        setState({ status: 'done', message: res.message });
        if (user) reloadUser().catch(() => {});
      })
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [params, user, reloadUser]);
  if (state.status === 'loading') return <div className="flex justify-center"><Spinner className="size-8" /></div>;
  return (
    <div className="text-center">
      {state.status === 'done' ? <CircleCheck className="mx-auto size-12 text-emerald-600" /> : null}
      <Heading title={state.status === 'done' ? 'Email confirmed' : 'Link not valid'} subtitle={state.message} />
      <Button to={user ? homeFor(user) : '/login'}>{user ? 'Continue' : 'Sign in'}</Button>
    </div>
  );
}
