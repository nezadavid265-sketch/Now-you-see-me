import {
  Armchair, Baby, BookOpen, Camera, Coffee, CookingPot, Dumbbell, Footprints, Headphones, Lamp, Laptop, LayoutGrid,
  Monitor, Refrigerator, Shirt, ShoppingBag, ShoppingBasket, Smartphone, Sofa, Sparkles, Tv, Wheat,
} from 'lucide-react';

const ICONS = {
  monitor: Monitor, smartphone: Smartphone, laptop: Laptop, tv: Tv, camera: Camera, headphones: Headphones,
  sofa: Sofa, refrigerator: Refrigerator, 'cooking-pot': CookingPot, armchair: Armchair, lamp: Lamp,
  shirt: Shirt, 'shopping-bag': ShoppingBag, footprints: Footprints, 'shopping-basket': ShoppingBasket,
  coffee: Coffee, wheat: Wheat, sparkles: Sparkles, dumbbell: Dumbbell, baby: Baby, 'book-open': BookOpen,
};

export const CATEGORY_ICON_NAMES = Object.keys(ICONS);

export function CategoryIcon({ name, className }) {
  const Icon = ICONS[name] ?? LayoutGrid;
  return <Icon className={className} aria-hidden />;
}
