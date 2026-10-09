import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Star } from 'lucide-react';
import { api } from '../../lib/api.js';
import { date } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Badge, Button, Card, EmptyState, PageHeader, Pagination, Select, Stars, Textarea } from '../../components/ui/index.jsx';

function ReplyBox({ review }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(review.sellerReply ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/seller/reviews/${review.id}/reply`, { method: 'POST', body: { reply: text } });
      toast.success('Reply published');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['seller', 'reviews'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return review.sellerReply ? (
      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
        <p className="text-xs font-semibold text-slate-500">Your reply</p>
        <p className="mt-1 text-slate-700">{review.sellerReply}</p>
        <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs font-semibold text-brand-700 hover:underline">Edit reply</button>
      </div>
    ) : (
      <Button className="mt-3" size="sm" variant="outline" icon={MessageSquare} onClick={() => setOpen(true)}>Reply publicly</Button>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <Textarea aria-label="Reply" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Thank the customer or explain how you’ll make it right." />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} loading={busy} disabled={text.trim().length < 2}>Publish reply</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export default function Reviews() {
  usePageTitle('Reviews');
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['seller', 'reviews', page, rating], queryFn: () => api('/seller/reviews', { query: { page, rating } }), placeholderData: (p) => p });
  return (
    <div>
      <PageHeader
        title="Customer reviews"
        description="Reviews come only from verified buyers. Replying shows customers you care."
        actions={<Select aria-label="Filter by rating" value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }} className="w-40" placeholder="All ratings" options={[5, 4, 3, 2, 1].map((r) => ({ value: r, label: `${r} stars` }))} />}
      />
      {!isLoading && !data?.items.length ? (
        <EmptyState icon={Star} title="No reviews yet" description="Buyers can review products after delivery." />
      ) : (
        <ul className="space-y-4">
          {data?.items.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><Stars value={r.rating} size="md" />{r.title && <span className="font-semibold">{r.title}</span>}</div>
                  {r.isHidden && <Badge tone="red">Hidden by moderators</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{r.author} on <Link to={`/p/${r.product.slug}`} className="font-medium text-brand-700 hover:underline">{r.product.name}</Link> · {date(r.createdAt)}</p>
                <p className="mt-2 text-sm text-slate-700">{r.body}</p>
                <ReplyBox review={r} />
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination pagination={data?.pagination} onChange={setPage} />
    </div>
  );
}
