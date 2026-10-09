import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Bell, CircleCheck, ClipboardList, Crosshair, MapPin, Navigation, Package, Phone, Store, Truck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { dateTime, money } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PortalLayout } from '../../layouts/PortalLayout.jsx';
import { directionsLink } from '../../components/Maps.jsx';
import { EventLog } from '../../components/OrderTimeline.jsx';
import { NotificationsPanel } from '../../components/shared/NotificationsPanel.jsx';
import { TicketList, TicketThread } from '../../components/shared/Support.jsx';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, PageLoader, StatusBadge, Tabs, Textarea, Toggle } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Modal.jsx';

/** Shares the courier's GPS position every ~30 s while enabled and deliveries are in progress. */
function useLocationSharing(enabled) {
  const [state, setState] = useState({ status: 'off' });
  const last = useRef(0);
  useEffect(() => {
    if (!enabled) {
      setState({ status: 'off' });
      return undefined;
    }
    if (!navigator.geolocation) {
      setState({ status: 'error', message: 'Location is not available on this device.' });
      return undefined;
    }
    setState({ status: 'waiting' });
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        if (Date.now() - last.current < 30_000) return;
        last.current = Date.now();
        try {
          const res = await api('/delivery/location', { method: 'POST', body: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } });
          setState({ status: 'sharing', at: new Date(), updated: res.updated });
        } catch {
          setState({ status: 'error', message: 'Could not send your location. Retrying…' });
        }
      },
      () => setState({ status: 'error', message: 'Allow location access to share your position with buyers.' }),
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return state;
}

function LocationCard() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem('rs_share_location') === '1';
    } catch {
      return false;
    }
  });
  const state = useLocationSharing(enabled);
  const toggle = (v) => {
    setEnabled(v);
    try {
      localStorage.setItem('rs_share_location', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  return (
    <Card>
      <Toggle label="Share my live location" description="Buyers see where their package is while you are out for delivery." checked={enabled} onChange={toggle} />
      {state.status === 'sharing' && <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700"><Crosshair className="size-3.5" /> Shared at {state.at.toLocaleTimeString()} ({state.updated} active deliveries)</p>}
      {state.status === 'waiting' && <p className="mt-2 text-xs text-slate-500">Getting your position…</p>}
      {state.status === 'error' && <p className="mt-2 text-xs text-red-600">{state.message}</p>}
    </Card>
  );
}

function AssignmentCard({ d }) {
  return (
    <Link to={`/delivery/${d.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-card active:bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{d.order.number}</p>
          <p className="text-xs text-slate-500">{d.order.itemCount} item{d.order.itemCount > 1 ? 's' : ''}</p>
        </div>
        <StatusBadge status={d.order.status} />
      </div>
      <div className="mt-3 space-y-1.5 text-sm">
        <p className="flex items-center gap-2 text-slate-600"><Store className="size-4 shrink-0 text-slate-400" /> {d.pickup.shop}{d.pickup.city && `, ${d.pickup.city}`}</p>
        <p className="flex items-center gap-2 text-slate-800"><MapPin className="size-4 shrink-0 text-brand-600" /> {d.dropoff.name} · {[d.dropoff.sector, d.dropoff.district].filter(Boolean).join(', ')}</p>
      </div>
      {d.order.collectAmount > 0 && <Badge tone="amber" className="mt-3"><Banknote className="size-3" /> Collect {money(d.order.collectAmount)} cash</Badge>}
    </Link>
  );
}

function Assignments() {
  usePageTitle('My deliveries');
  const [scope, setScope] = useState('active');
  const { data, isLoading } = useQuery({ queryKey: ['delivery', 'assignments', scope], queryFn: () => api('/delivery/assignments', { query: { scope } }), refetchInterval: 30_000 });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="My deliveries" description="Pick up packages, deliver them and confirm with the buyer’s code." />
      <LocationCard />
      <Tabs value={scope} onChange={setScope} tabs={[{ value: 'active', label: 'To deliver' }, { value: 'completed', label: 'Completed' }]} />
      {isLoading ? (
        <PageLoader />
      ) : !data.items.length ? (
        <EmptyState icon={Truck} title={scope === 'active' ? 'No deliveries assigned' : 'No completed deliveries yet'} description={scope === 'active' ? 'New assignments appear here and you’ll get an SMS.' : undefined} />
      ) : (
        <div className="space-y-3">{data.items.map((d) => <AssignmentCard key={d.id} d={d} />)}</div>
      )}
    </div>
  );
}

function AssignmentDetail() {
  const { id } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { data, isLoading, error: loadError } = useQuery({ queryKey: ['delivery', 'assignment', id], queryFn: () => api(`/delivery/assignments/${id}`) });
  usePageTitle(data ? `Delivery ${data.delivery.order.number}` : 'Delivery');
  if (isLoading) return <PageLoader />;
  if (loadError) return <Alert tone="error">{loadError.message}</Alert>;
  const d = data.delivery;
  const status = d.order.status;

  const act = async (path, body, message) => {
    setBusy(true);
    setError('');
    try {
      const res = await api(`/delivery/assignments/${id}/${path}`, { method: 'POST', body });
      queryClient.setQueryData(['delivery', 'assignment', id], res);
      queryClient.invalidateQueries({ queryKey: ['delivery', 'assignments'] });
      toast.success(message);
      setModal(null);
      setCode('');
      setReason('');
    } catch (err) {
      setError(err.fieldErrors?.deliveryCode ?? err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader back={{ to: '/delivery', label: 'My deliveries' }} title={d.order.number} actions={<StatusBadge status={status} />} />

      {status === 'READY' && <Button size="lg" className="w-full" icon={Package} onClick={() => act('pickup', {}, 'Picked up — the buyer has been notified')} loading={busy}>I’ve picked up the package</Button>}
      {status === 'IN_TRANSIT' && (
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" icon={CircleCheck} onClick={() => setModal('deliver')}>Delivered</Button>
          <Button size="lg" variant="outline" onClick={() => setModal('fail')}>Could not deliver</Button>
        </div>
      )}
      {status === 'DELIVERED' && <Alert tone="success" title="Delivered">Confirmed {dateTime(d.deliveredAt)}.</Alert>}
      {d.order.collectAmount > 0 && status !== 'DELIVERED' && (
        <Alert tone="warning" title={`Collect ${money(d.order.collectAmount)} in cash`}>Cash on delivery — collect the full amount before confirming.</Alert>
      )}

      <Card>
        <CardHeader title="1. Pick up from" />
        <p className="font-semibold">{d.pickup.shop}</p>
        <p className="text-sm text-slate-600">{[d.pickup.address, d.pickup.city].filter(Boolean).join(', ') || 'Address not provided'}</p>
        {d.pickup.phone && <Button className="mt-3" size="sm" variant="outline" icon={Phone} href={`tel:${d.pickup.phone}`}>Call shop</Button>}
      </Card>
      <Card>
        <CardHeader title="2. Deliver to" />
        <p className="font-semibold">{d.dropoff.name}</p>
        <p className="text-sm text-slate-600">{[d.dropoff.line1, d.dropoff.line2, d.dropoff.sector, d.dropoff.district, d.dropoff.city].filter(Boolean).join(', ')}</p>
        {d.dropoff.instructions && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">“{d.dropoff.instructions}”</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon={Phone} href={`tel:${d.dropoff.phone}`}>Call buyer</Button>
          {d.dropoff.latitude && <Button size="sm" icon={Navigation} href={directionsLink(d.dropoff.latitude, d.dropoff.longitude)} target="_blank" rel="noreferrer">Navigate</Button>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Package" />
        <ul className="space-y-1 text-sm">{d.order.items.map((i, idx) => <li key={idx} className="flex justify-between"><span>{i.name}</span><span className="font-semibold">×{i.quantity}</span></li>)}</ul>
      </Card>
      <Card>
        <CardHeader title="History" />
        <EventLog events={d.events} />
      </Card>

      <Modal open={modal === 'deliver'} onClose={() => setModal(null)} title="Confirm delivery" description="Ask the buyer for the 6-digit code shown in their Rivoshoppa order." size="sm" footer={<><Button variant="outline" onClick={() => setModal(null)}>Back</Button><Button onClick={() => act('deliver', { deliveryCode: code }, 'Delivery confirmed. Great job!')} loading={busy} disabled={code.length !== 6}>Confirm</Button></>}>
        <Input label="Delivery code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputClassName="text-center font-mono text-3xl tracking-[0.4em]" autoFocus />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Modal>
      <Modal open={modal === 'fail'} onClose={() => setModal(null)} title="Delivery not completed" size="sm" footer={<><Button variant="outline" onClick={() => setModal(null)}>Back</Button><Button variant="danger" onClick={() => act('fail', { reason }, 'Recorded. The buyer has been notified.')} loading={busy} disabled={reason.trim().length < 3}>Submit</Button></>}>
        <Textarea label="What happened?" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Buyer not reachable after 3 calls" maxLength={200} />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Modal>
    </div>
  );
}

export default function DeliveryApp() {
  const sections = [
    {
      items: [
        { to: '/delivery', label: 'My deliveries', icon: ClipboardList, end: true },
        { to: '/delivery/support', label: 'Support', icon: Phone },
        { to: '/delivery/notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ];
  return (
    <Routes>
      <Route element={<PortalLayout subtitle="Delivery" home="/delivery" sections={sections} notificationsLink="/delivery/notifications" />}>
        <Route index element={<Assignments />} />
        <Route path="notifications" element={<NotificationsPanel />} />
        <Route path="support" element={<TicketList basePath="/delivery/support" />} />
        <Route path="support/:id" element={<TicketThread basePath="/delivery/support" />} />
        <Route path=":id" element={<AssignmentDetail />} />
        <Route path="*" element={<Navigate to="/delivery" replace />} />
      </Route>
    </Routes>
  );
}
