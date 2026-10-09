import { BarChart3, BadgeCheck, CircleDollarSign, PackageCheck, Smartphone, Store, Truck } from 'lucide-react';
import { usePageTitle } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, Card } from '../../components/ui/index.jsx';

const STEPS = [
  ['Create your account', 'Sign up as a seller in under a minute.'],
  ['Tell us about your business', 'Add your shop name, contact details and how you want to be paid.'],
  ['Get approved', 'Our team reviews your shop, usually within one business day.'],
  ['Start selling', 'Add products with photos and prices. Orders arrive with SMS alerts.'],
];

export default function SellLanding() {
  usePageTitle('Sell on Rivoshoppa');
  const { user } = useAuth();
  return (
    <div>
      <section className="bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 text-white">
        <div className="container-page grid gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-accent-200">
              <Store className="size-4" /> Rivoshoppa Seller Center
            </p>
            <h1 className="mt-5 text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">Grow your business with buyers across Rwanda</h1>
            <p className="mt-4 max-w-xl text-lg text-brand-100">List your products, accept Mobile Money payments and let us help with delivery. Simple tools — no technical skills needed.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="accent" to={user?.role === 'SELLER' ? '/seller' : '/register/seller'}>
                {user?.role === 'SELLER' ? 'Go to Seller Center' : 'Start selling today'}
              </Button>
              <Button size="lg" variant="outline" to="/login" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                I already sell here
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 self-center">
            {[
              [Smartphone, 'Get paid by MoMo', 'Payouts to MTN MoMo, Airtel Money or bank.'],
              [Truck, 'Delivery options', 'Deliver yourself or use Rivoshoppa couriers.'],
              [BarChart3, 'Clear sales reports', 'See revenue, best sellers and stock at a glance.'],
              [BadgeCheck, 'Trusted marketplace', 'Verified sellers and protected buyers.'],
            ].map(([Icon, title, text]) => (
              <div key={title} className="rounded-2xl bg-white/10 p-5 backdrop-blur">
                <Icon className="size-7 text-accent-300" />
                <p className="mt-3 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-brand-100">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="container-page py-14">
        <h2 className="text-center text-2xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <Card className="h-full">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent-500 font-bold text-white">{i + 1}</span>
                <p className="mt-3 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-slate-500">{text}</p>
              </Card>
            </li>
          ))}
        </ol>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card className="flex gap-4">
            <CircleDollarSign className="size-8 shrink-0 text-brand-600" />
            <div>
              <p className="font-semibold">Transparent commission</p>
              <p className="text-sm text-slate-500">You only pay a commission when you make a sale. Every order shows exactly what you earn.</p>
            </div>
          </Card>
          <Card className="flex gap-4">
            <PackageCheck className="size-8 shrink-0 text-brand-600" />
            <div>
              <p className="font-semibold">Protected deliveries</p>
              <p className="text-sm text-slate-500">Buyers confirm delivery with a secret code, so you have proof every order arrived.</p>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
