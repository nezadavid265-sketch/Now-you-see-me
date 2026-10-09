import { Compass } from 'lucide-react';
import { usePageTitle } from '../../hooks/index.js';
import { Button, EmptyState } from '../../components/ui/index.jsx';

export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <div className="container-page py-16">
      <EmptyState icon={Compass} title="We couldn’t find that page" description="The link may be broken or the page may have moved." action={<Button to="/">Back to the homepage</Button>} />
    </div>
  );
}
