import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { api } from '../../lib/api.js';
import { usePageTitle } from '../../hooks/index.js';
import { ProductGrid, useWishlist } from '../../components/ProductCard.jsx';
import { Button, EmptyState, PageHeader } from '../../components/ui/index.jsx';

export default function Wishlist() {
  usePageTitle('Wishlist');
  const wishlist = useWishlist();
  const { data, isLoading } = useQuery({ queryKey: ['wishlist'], queryFn: () => api('/wishlist') });
  const products = data?.items.map((i) => i.product).filter((p) => wishlist.ids.size === 0 || wishlist.ids.has(p.id));
  return (
    <div>
      <PageHeader title="Wishlist" description="Products you’ve saved for later." />
      {!isLoading && !products?.length ? (
        <EmptyState icon={Heart} title="Your wishlist is empty" description="Tap the heart on any product to save it here." action={<Button to="/">Discover products</Button>} />
      ) : (
        <ProductGrid products={products} loading={isLoading} wishlist={wishlist} className="lg:grid-cols-3 xl:grid-cols-4" />
      )}
    </div>
  );
}
