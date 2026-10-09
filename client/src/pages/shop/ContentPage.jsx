import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { api } from '../../lib/api.js';
import { date } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { Button, EmptyState, PageLoader } from '../../components/ui/index.jsx';

/** CMS pages are stored as plain text and rendered safely (no raw HTML). */
export default function ContentPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['content', slug], queryFn: () => api(`/content/${slug}`) });
  usePageTitle(data?.page.title);
  if (isLoading) return <PageLoader />;
  if (error) return <div className="container-page py-16"><EmptyState icon={FileText} title="Page not found" action={<Button to="/">Go home</Button>} /></div>;
  const paragraphs = data.page.body.split(/\n{2,}/);
  return (
    <article className="container-page max-w-3xl py-10">
      <h1 className="text-3xl font-bold tracking-tight">{data.page.title}</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated {date(data.page.updatedAt)}</p>
      <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-slate-700">
        {paragraphs.map((p, i) => {
          const [first, ...rest] = p.split('\n');
          // A short first line ending with "?" or without a full stop reads as a heading.
          const isHeading = rest.length > 0 && first.length < 80 && !first.endsWith('.');
          return isHeading ? (
            <section key={i}>
              <h2 className="mb-1 text-lg font-semibold text-slate-900">{first}</h2>
              <p className="whitespace-pre-line">{rest.join('\n')}</p>
            </section>
          ) : (
            <p key={i} className="whitespace-pre-line">{p}</p>
          );
        })}
      </div>
    </article>
  );
}
