import { Outlet } from 'react-router';
import { BadgeCheck, ShieldCheck, Truck } from 'lucide-react';
import { Logo } from '../components/Logo.jsx';

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-800 p-12 text-white lg:flex lg:flex-col">
        <Logo inverted />
        <div className="relative z-10 my-auto max-w-md">
          <h2 className="text-4xl leading-tight font-extrabold tracking-tight">Shop Rwanda’s trusted sellers, all in one place.</h2>
          <p className="mt-4 text-lg text-brand-100">Electronics, home, fashion and groceries — paid with Mobile Money and delivered to your door.</p>
          <ul className="mt-10 space-y-4 text-brand-50">
            <li className="flex items-center gap-3"><ShieldCheck className="size-6 text-accent-400" /> Secure MTN MoMo & Airtel Money payments</li>
            <li className="flex items-center gap-3"><BadgeCheck className="size-6 text-accent-400" /> Every seller verified by our team</li>
            <li className="flex items-center gap-3"><Truck className="size-6 text-accent-400" /> Live delivery tracking with confirmation codes</li>
          </ul>
        </div>
        <svg className="absolute -right-24 -bottom-24 size-[480px] text-brand-700/60" viewBox="0 0 200 200" aria-hidden>
          <path fill="currentColor" d="M44.7,-58.4C56.9,-49.9,65.1,-35.3,70.3,-19.2C75.5,-3.1,77.7,14.5,71.6,28.6C65.6,42.7,51.3,53.3,35.9,61.3C20.4,69.3,3.8,74.7,-13.7,73.8C-31.3,72.9,-49.8,65.7,-61.8,52.3C-73.8,38.9,-79.3,19.5,-78.1,1C-76.9,-17.5,-69.1,-35,-56.5,-43.8C-43.9,-52.6,-26.5,-52.7,-10.5,-55.9C5.5,-59.1,32.5,-66.9,44.7,-58.4Z" transform="translate(100 100)" />
        </svg>
      </div>
      <div className="flex flex-col bg-white px-6 py-8 sm:px-12">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
