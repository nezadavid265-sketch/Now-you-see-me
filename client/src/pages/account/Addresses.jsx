import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { usePageTitle } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { AddressForm } from '../../components/shared/AddressForm.jsx';
import { Badge, Button, Card, EmptyState, PageHeader, PageLoader } from '../../components/ui/index.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';

export default function Addresses() {
  usePageTitle('Addresses');
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['addresses'], queryFn: () => api('/account/addresses') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['addresses'] });

  return (
    <div>
      <PageHeader title="Delivery addresses" description="Save places you get deliveries — home, office or family." actions={<Button icon={Plus} onClick={() => setEditing('new')}>Add address</Button>} />
      {isLoading ? (
        <PageLoader />
      ) : !data.items.length ? (
        <EmptyState icon={MapPin} title="No saved addresses" description="Add an address to check out faster." action={<Button onClick={() => setEditing('new')}>Add address</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.items.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 font-semibold"><MapPin className="size-4 text-brand-600" /> {a.label}</p>
                {a.isDefault && <Badge tone="brand">Default</Badge>}
              </div>
              <div className="mt-2 text-sm text-slate-600">
                <p className="font-medium text-slate-800">{a.recipientName} · {a.phone}</p>
                <p>{[a.line1, a.line2].filter(Boolean).join(', ')}</p>
                <p>{[a.sector, a.district, a.city].filter(Boolean).join(', ')}</p>
                {a.latitude && <p className="mt-1 text-xs text-emerald-700">📍 Location pinned on map</p>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(a)}>Edit</Button>
                {!a.isDefault && (
                  <Button size="sm" variant="ghost" onClick={async () => { await api(`/account/addresses/${a.id}`, { method: 'PATCH', body: { isDefault: true } }); refresh(); }}>
                    Set as default
                  </Button>
                )}
                <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600" onClick={() => setDeleting(a)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'New address' : 'Edit address'} size="lg">
        {editing && (
          <AddressForm
            address={editing === 'new' ? null : editing}
            defaultName={user.name}
            defaultPhone={user.phone ?? ''}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              refresh();
              setEditing(null);
              toast.success('Address saved');
            }}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this address?"
        description={deleting ? `${deleting.label}: ${deleting.line1}, ${deleting.city}` : ''}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          await api(`/account/addresses/${deleting.id}`, { method: 'DELETE' });
          refresh();
        }}
      />
    </div>
  );
}
