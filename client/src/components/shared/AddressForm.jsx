import { api } from '../../lib/api.js';
import { useForm } from '../../hooks/index.js';
import { Alert, Button, Checkbox, Input, Select, Textarea } from '../ui/index.jsx';
import { LocationPicker } from '../Maps.jsx';

const DISTRICTS = {
  Kigali: ['Gasabo', 'Kicukiro', 'Nyarugenge'],
  'Northern Province': ['Burera', 'Gakenke', 'Gicumbi', 'Musanze', 'Rulindo'],
  'Southern Province': ['Gisagara', 'Huye', 'Kamonyi', 'Muhanga', 'Nyamagabe', 'Nyanza', 'Nyaruguru', 'Ruhango'],
  'Eastern Province': ['Bugesera', 'Gatsibo', 'Kayonza', 'Kirehe', 'Ngoma', 'Nyagatare', 'Rwamagana'],
  'Western Province': ['Karongi', 'Ngororero', 'Nyabihu', 'Nyamasheke', 'Rubavu', 'Rusizi', 'Rutsiro'],
};
const CITY_FOR = Object.fromEntries(Object.entries(DISTRICTS).flatMap(([prov, ds]) => ds.map((d) => [d, prov === 'Kigali' ? 'Kigali' : d])));

/** Create/edit a delivery address (Rwandan districts, optional map pin). */
export function AddressForm({ address, defaultName = '', defaultPhone = '', onSaved, onCancel, submitLabel = 'Save address' }) {
  const form = useForm({
    label: address?.label ?? 'Home',
    recipientName: address?.recipientName ?? defaultName,
    phone: address?.phone ?? defaultPhone,
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    sector: address?.sector ?? '',
    district: address?.district ?? 'Gasabo',
    instructions: address?.instructions ?? '',
    latitude: address?.latitude ?? null,
    longitude: address?.longitude ?? null,
    isDefault: address?.isDefault ?? false,
  });

  const onSubmit = form.submit(async (v) => {
    const body = { ...v, city: CITY_FOR[v.district] ?? 'Kigali', country: 'RW' };
    const res = address
      ? await api(`/account/addresses/${address.id}`, { method: 'PATCH', body })
      : await api('/account/addresses', { method: 'POST', body });
    onSaved?.(res.address);
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {form.formError && <Alert tone="error">{form.formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Full name" required autoComplete="name" {...form.field('recipientName')} />
        <Input label="Phone number" required type="tel" autoComplete="tel" placeholder="07XX XXX XXX" {...form.field('phone')} />
      </div>
      <Input label="Street address / house" required placeholder="e.g. KG 9 Ave, House 24" autoComplete="address-line1" {...form.field('line1')} />
      <Input label="Building, floor, landmark (optional)" autoComplete="address-line2" {...form.field('line2')} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="District" required {...form.field('district')}>
          {Object.entries(DISTRICTS).map(([prov, ds]) => (
            <optgroup key={prov} label={prov}>
              {ds.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Input label="Sector (optional)" placeholder="e.g. Kimihurura" {...form.field('sector')} />
        <Select label="Label" options={['Home', 'Office', 'Other'].map((l) => ({ value: l, label: l }))} {...form.field('label')} />
      </div>
      <Textarea label="Delivery instructions (optional)" rows={2} maxLength={300} placeholder="Gate colour, nearby landmark, best time to call…" {...form.field('instructions')} />
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Pin your location</p>
        <LocationPicker
          value={{ latitude: form.values.latitude, longitude: form.values.longitude }}
          onChange={({ latitude, longitude }) => {
            form.set('latitude', latitude);
            form.set('longitude', longitude);
          }}
        />
      </div>
      <Checkbox label="Use as my default address" checked={form.values.isDefault} onChange={(e) => form.set('isDefault', e.target.checked)} />
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={form.submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
