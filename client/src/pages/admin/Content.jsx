import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Megaphone, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { date, dateTime } from '../../lib/format.js';
import { useForm, usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Input, PageHeader, Select, Textarea } from '../../components/ui/index.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';

function PageEditor({ page, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm({ slug: page?.slug ?? '', title: page?.title ?? '', body: page?.body ?? '', isPublished: page?.isPublished ?? true });
  const onSubmit = form.submit(async (v) => {
    if (page) await api(`/admin/pages/${page.id}`, { method: 'PATCH', body: v });
    else await api('/admin/pages', { method: 'POST', body: v });
    queryClient.invalidateQueries({ queryKey: ['admin', 'pages'] });
    queryClient.invalidateQueries({ queryKey: ['content'] });
    toast.success('Page saved');
    onClose();
  });
  return (
    <Modal open onClose={onClose} title={page ? `Edit “${page.title}”` : 'New page'} size="xl" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Save page</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4">
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Title" required {...form.field('title')} />
          <Input label="URL" prefix="/pages/" required {...form.field('slug')} />
        </div>
        <Textarea label="Content" rows={16} required hint="Plain text. Separate paragraphs with a blank line; a short first line becomes a heading." {...form.field('body')} />
        <Checkbox label="Published" checked={form.values.isPublished} onChange={(e) => form.set('isPublished', e.target.checked)} />
      </form>
    </Modal>
  );
}

export function PagesPage() {
  usePageTitle('Pages');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'pages'], queryFn: () => api('/admin/pages') });
  return (
    <div>
      <PageHeader title="Pages" description="Help, policies and information pages." actions={<Button icon={Plus} onClick={() => setEditing('new')}>New page</Button>} />
      <DataTable
        loading={isLoading}
        rows={data?.items}
        columns={[
          { key: 'title', header: 'Title', render: (p) => <span className="font-medium">{p.title}</span> },
          { key: 'slug', header: 'URL', render: (p) => <a href={`/pages/${p.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">/pages/{p.slug} <ExternalLink className="size-3" /></a> },
          { key: 'updatedAt', header: 'Updated', render: (p) => date(p.updatedAt) },
          { key: 'isPublished', header: 'Status', render: (p) => (p.isPublished ? <Badge tone="green">Published</Badge> : <Badge>Draft</Badge>) },
          { key: 'actions', header: '', render: (p) => <div className="flex gap-1"><Button size="xs" variant="ghost" icon={Pencil} onClick={() => setEditing(p)}>Edit</Button><Button size="xs" variant="ghost" icon={Trash2} className="text-red-600" onClick={() => setDeleting(p)} aria-label="Delete" /></div> },
        ]}
      />
      {editing && <PageEditor page={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete page?" description={deleting?.title} tone="danger" confirmLabel="Delete" onConfirm={async () => { await api(`/admin/pages/${deleting.id}`, { method: 'DELETE' }); queryClient.invalidateQueries({ queryKey: ['admin', 'pages'] }); }} />
    </div>
  );
}

export function AnnouncementsPage() {
  usePageTitle('Announcements');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [publishing, setPublishing] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'announcements'], queryFn: () => api('/admin/announcements') });
  const form = useForm({ title: '', body: '', audience: 'SELLERS' });
  const onSubmit = form.submit(async (v) => {
    await api('/admin/announcements', { method: 'POST', body: v });
    queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    form.setValues({ title: '', body: '', audience: 'SELLERS' });
    setOpen(false);
    toast.success('Draft saved — publish it to notify the audience');
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
  return (
    <div>
      <PageHeader title="Announcements" description="Publishing sends an in-app notification to everyone in the audience." actions={<Button icon={Plus} onClick={() => setOpen(true)}>New announcement</Button>} />
      {isLoading ? null : !data.items.length ? (
        <EmptyState icon={Megaphone} title="No announcements yet" description="Tell sellers about policy changes, payout schedules or promotions." />
      ) : (
        <div className="space-y-3">
          {data.items.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.title}</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-slate-600">{a.body}</p>
                  <p className="mt-2 text-xs text-slate-500">Audience: {a.audience.toLowerCase()} · {a.isPublished ? `published ${dateTime(a.publishedAt)}` : `draft created ${date(a.createdAt)}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  {a.isPublished ? <Badge tone="green">Published</Badge> : <Button size="sm" icon={Send} onClick={() => setPublishing(a)}>Publish</Button>}
                  <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600" aria-label="Delete" onClick={async () => { await api(`/admin/announcements/${a.id}`, { method: 'DELETE' }); refresh(); }} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New announcement" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Save draft</Button></>}>
        <form onSubmit={onSubmit} className="space-y-4">
          {form.formError && <Alert tone="error">{form.formError}</Alert>}
          <Select label="Audience" {...form.field('audience')} options={[{ value: 'SELLERS', label: 'All sellers' }, { value: 'BUYERS', label: 'All buyers' }, { value: 'ALL', label: 'Everyone' }]} />
          <Input label="Title" required maxLength={120} {...form.field('title')} />
          <Textarea label="Message" required rows={5} maxLength={2000} {...form.field('body')} />
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(publishing)}
        onClose={() => setPublishing(null)}
        title="Publish announcement?"
        description={`Every ${publishing?.audience === 'ALL' ? 'buyer and seller' : publishing?.audience?.toLowerCase().replace(/s$/, '')} receives a notification. Published announcements cannot be edited.`}
        confirmLabel="Publish now"
        onConfirm={async () => {
          const res = await api(`/admin/announcements/${publishing.id}/publish`, { method: 'POST' });
          toast.success(`Sent to ${res.recipients} people`);
          refresh();
        }}
      />
    </div>
  );
}
