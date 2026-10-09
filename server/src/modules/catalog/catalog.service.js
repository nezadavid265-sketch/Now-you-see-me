import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { pageResult, paginate } from '../../lib/pagination.js';
import { productAvailability } from '../../domain/pricing.js';

/** Products the public may see. */
export const PUBLIC_PRODUCT_WHERE = {
  status: 'PUBLISHED',
  moderationStatus: 'APPROVED',
  deletedAt: null,
  shop: { status: 'ACTIVE' },
};

export const CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  brand: true,
  price: true,
  compareAtPrice: true,
  stock: true,
  ratingAvg: true,
  ratingCount: true,
  soldCount: true,
  isFeatured: true,
  images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true, alt: true } },
  shop: { select: { name: true, slug: true, vacationMode: true, isOpen: true } },
};

export function toCard(p) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    price: p.price,
    compareAtPrice: p.compareAtPrice && p.compareAtPrice > p.price ? p.compareAtPrice : null,
    image: p.images?.[0]?.url ?? null,
    ratingAvg: Math.round(p.ratingAvg * 10) / 10,
    ratingCount: p.ratingCount,
    stock: p.stock,
    inStock: p.stock > 0 && p.shop.isOpen && !p.shop.vacationMode,
    isFeatured: p.isFeatured,
    shop: { name: p.shop.name, slug: p.shop.slug },
  };
}

// ── Category tree (cached briefly; categories change rarely) ──
let treeCache = null;
let treeCacheAt = 0;

export async function getCategoryTree({ fresh = false } = {}) {
  if (!fresh && treeCache && Date.now() - treeCacheAt < 30_000) return treeCache;
  const [categories, counts] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.product.groupBy({ by: ['categoryId'], where: PUBLIC_PRODUCT_WHERE, _count: { _all: true } }),
  ]);
  const countMap = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  const byId = new Map(
    categories.map((c) => [
      c.id,
      { id: c.id, name: c.name, slug: c.slug, icon: c.icon, imageUrl: c.imageUrl, description: c.description, parentId: c.parentId, productCount: countMap.get(c.id) ?? 0, children: [] },
    ]),
  );
  const roots = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId).children.push(node);
    else if (!node.parentId) roots.push(node);
  }
  for (const root of roots) root.productCount += root.children.reduce((s, c) => s + c.productCount, 0);
  treeCache = { roots, byId, bySlug: new Map([...byId.values()].map((n) => [n.slug, n])) };
  treeCacheAt = Date.now();
  return treeCache;
}

export function invalidateCategoryCache() {
  treeCache = null;
}

function descendantIds(node) {
  return [node.id, ...node.children.flatMap(descendantIds)];
}

const SORTS = {
  relevance: [{ isFeatured: 'desc' }, { soldCount: 'desc' }, { ratingAvg: 'desc' }, { createdAt: 'desc' }],
  popular: [{ soldCount: 'desc' }, { ratingAvg: 'desc' }],
  newest: [{ createdAt: 'desc' }],
  price_asc: [{ price: 'asc' }],
  price_desc: [{ price: 'desc' }],
  rating: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }],
};

export async function searchProducts(query) {
  const { q, category, minPrice, maxPrice, rating, brands, inStock, onSale, shop, sort, page, pageSize } = query;
  const and = [PUBLIC_PRODUCT_WHERE];
  let categoryNode = null;

  if (q) {
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const term of terms) {
      and.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { brand: { contains: term, mode: 'insensitive' } },
          { tags: { has: term.toLowerCase() } },
          { category: { name: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }
  }
  if (category) {
    const tree = await getCategoryTree();
    categoryNode = tree.bySlug.get(category) ?? null;
    and.push({ categoryId: { in: categoryNode ? descendantIds(categoryNode) : ['__none__'] } });
  }
  if (shop) and.push({ shop: { slug: shop } });
  if (minPrice !== undefined) and.push({ price: { gte: minPrice } });
  if (maxPrice !== undefined) and.push({ price: { lte: maxPrice } });
  if (rating) and.push({ ratingAvg: { gte: rating } });
  if (inStock) and.push({ stock: { gt: 0 }, shop: { isOpen: true, vacationMode: false } });
  if (onSale) and.push({ compareAtPrice: { not: null } });

  const baseWhere = { AND: and };
  const where = brands?.length
    ? { AND: [...and, { OR: brands.map((b) => ({ brand: { equals: b, mode: 'insensitive' } })) }] }
    : baseWhere;

  const [total, rows, brandFacets, priceRange] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, select: CARD_SELECT, orderBy: SORTS[sort] ?? SORTS.relevance, ...paginate({ page, pageSize }) }),
    prisma.product.groupBy({
      by: ['brand'],
      where: { AND: [...and, { brand: { not: null } }] },
      _count: { _all: true },
      orderBy: { _count: { brand: 'desc' } },
      take: 15,
    }),
    prisma.product.aggregate({ where: baseWhere, _min: { price: true }, _max: { price: true } }),
  ]);

  // "On sale" means a real markdown, not just any compare-at price.
  const items = rows.map(toCard);
  return {
    ...pageResult(items, total, { page, pageSize }),
    facets: {
      brands: brandFacets.map((b) => ({ value: b.brand, count: b._count._all })),
      price: { min: priceRange._min.price ?? 0, max: priceRange._max.price ?? 0 },
    },
    category: categoryNode
      ? { id: categoryNode.id, name: categoryNode.name, slug: categoryNode.slug, description: categoryNode.description, children: categoryNode.children.map(({ children: _c, ...c }) => c) }
      : null,
  };
}

export async function suggest(q) {
  const term = q.trim();
  if (term.length < 2) return { products: [], categories: [] };
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: {
        AND: [
          PUBLIC_PRODUCT_WHERE,
          { OR: [{ name: { contains: term, mode: 'insensitive' } }, { brand: { contains: term, mode: 'insensitive' } }] },
        ],
      },
      select: { name: true, slug: true, price: true, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } } },
      orderBy: [{ soldCount: 'desc' }],
      take: 6,
    }),
    prisma.category.findMany({
      where: { isActive: true, name: { contains: term, mode: 'insensitive' } },
      select: { name: true, slug: true },
      take: 4,
    }),
  ]);
  return {
    products: products.map((p) => ({ name: p.name, slug: p.slug, price: p.price, image: p.images[0]?.url ?? null })),
    categories,
  };
}

export async function getProductDetail(slug) {
  const product = await prisma.product.findFirst({
    where: { slug, ...PUBLIC_PRODUCT_WHERE },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      category: { include: { parent: { select: { name: true, slug: true } } } },
      shop: {
        select: {
          id: true, name: true, slug: true, logoUrl: true, city: true, ratingAvg: true, ratingCount: true,
          createdAt: true, isOpen: true, vacationMode: true, vacationMessage: true, status: true, fulfillmentMode: true,
          _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } },
        },
      },
    },
  });
  if (!product) throw notFound('Product');

  const distribution = await prisma.review.groupBy({
    by: ['rating'],
    where: { productId: product.id, isHidden: false },
    _count: { _all: true },
  });
  const availability = productAvailability(product, 1);
  const breadcrumb = [
    ...(product.category.parent ? [{ name: product.category.parent.name, slug: product.category.parent.slug }] : []),
    { name: product.category.name, slug: product.category.slug },
  ];

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    brand: product.brand,
    sku: product.sku,
    price: product.price,
    compareAtPrice: product.compareAtPrice && product.compareAtPrice > product.price ? product.compareAtPrice : null,
    stock: product.stock,
    lowStock: product.stock > 0 && product.stock <= product.lowStockThreshold,
    available: availability.available,
    unavailableReason: availability.reason ?? null,
    specifications: Array.isArray(product.specifications) ? product.specifications : [],
    tags: product.tags,
    ratingAvg: Math.round(product.ratingAvg * 10) / 10,
    ratingCount: product.ratingCount,
    soldCount: product.soldCount,
    images: product.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt ?? product.name })),
    category: { id: product.category.id, name: product.category.name, slug: product.category.slug },
    breadcrumb,
    shop: {
      id: product.shop.id,
      name: product.shop.name,
      slug: product.shop.slug,
      logoUrl: product.shop.logoUrl,
      city: product.shop.city,
      ratingAvg: Math.round(product.shop.ratingAvg * 10) / 10,
      ratingCount: product.shop.ratingCount,
      memberSince: product.shop.createdAt,
      productCount: product.shop._count.products,
      isOpen: product.shop.isOpen && !product.shop.vacationMode,
      vacationMessage: product.shop.vacationMode ? product.shop.vacationMessage : null,
      fulfillmentMode: product.shop.fulfillmentMode,
    },
    ratingDistribution: [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: distribution.find((d) => d.rating === r)?._count._all ?? 0 })),
  };
}

export async function getProductReviews(slug, { page, pageSize, sort }) {
  const product = await prisma.product.findFirst({ where: { slug, ...PUBLIC_PRODUCT_WHERE }, select: { id: true } });
  if (!product) throw notFound('Product');
  const where = { productId: product.id, isHidden: false };
  const orderBy = { newest: { createdAt: 'desc' }, highest: [{ rating: 'desc' }, { createdAt: 'desc' }], lowest: [{ rating: 'asc' }, { createdAt: 'desc' }] }[sort];
  const [total, rows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({ where, orderBy, ...paginate({ page, pageSize }), include: { user: { select: { name: true } } } }),
  ]);
  const items = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    author: shortName(r.user.name),
    verifiedPurchase: true,
    createdAt: r.createdAt,
    sellerReply: r.sellerReply,
    sellerRepliedAt: r.sellerRepliedAt,
  }));
  return pageResult(items, total, { page, pageSize });
}

/** "Jane Mukamana" → "Jane M." (reviews never expose full names). */
export function shortName(name) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first;
}

export async function getRelatedProducts(slug) {
  const product = await prisma.product.findFirst({ where: { slug, ...PUBLIC_PRODUCT_WHERE }, select: { id: true, categoryId: true } });
  if (!product) throw notFound('Product');
  const rows = await prisma.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, categoryId: product.categoryId, id: { not: product.id } },
    select: CARD_SELECT,
    orderBy: [{ soldCount: 'desc' }, { ratingAvg: 'desc' }],
    take: 8,
  });
  return rows.map(toCard);
}

export async function getShop(slug) {
  const shop = await prisma.shop.findFirst({
    where: { slug, status: 'ACTIVE' },
    select: {
      id: true, name: true, slug: true, description: true, logoUrl: true, bannerUrl: true, city: true,
      ratingAvg: true, ratingCount: true, createdAt: true, isOpen: true, vacationMode: true, vacationMessage: true,
      _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } },
    },
  });
  if (!shop) throw notFound('Shop');
  return {
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    description: shop.description,
    logoUrl: shop.logoUrl,
    bannerUrl: shop.bannerUrl,
    city: shop.city,
    ratingAvg: Math.round(shop.ratingAvg * 10) / 10,
    ratingCount: shop.ratingCount,
    memberSince: shop.createdAt,
    productCount: shop._count.products,
    isOpen: shop.isOpen && !shop.vacationMode,
    vacationMessage: shop.vacationMode ? shop.vacationMessage : null,
  };
}

export async function getHome() {
  const now = new Date();
  const activeWindow = { isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] };
  const list = (args) => prisma.product.findMany({ where: PUBLIC_PRODUCT_WHERE, select: CARD_SELECT, take: 12, ...args }).then((r) => r.map(toCard));
  const [banners, tree, featured, deals, popular, newArrivals] = await Promise.all([
    prisma.banner.findMany({ where: activeWindow, orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }] }),
    getCategoryTree(),
    list({ where: { ...PUBLIC_PRODUCT_WHERE, isFeatured: true }, orderBy: { updatedAt: 'desc' } }),
    list({ where: { ...PUBLIC_PRODUCT_WHERE, compareAtPrice: { not: null }, stock: { gt: 0 } }, orderBy: { updatedAt: 'desc' } }),
    list({ orderBy: [{ soldCount: 'desc' }, { ratingAvg: 'desc' }] }),
    list({ orderBy: { createdAt: 'desc' } }),
  ]);
  return {
    banners: banners.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, imageUrl: b.imageUrl, linkUrl: b.linkUrl, ctaLabel: b.ctaLabel, theme: b.theme, position: b.position })),
    categories: tree.roots.map(({ children, ...c }) => ({ ...c, children: children.map(({ children: _x, ...cc }) => cc) })),
    featured,
    deals: deals.filter((d) => d.compareAtPrice),
    popular,
    newArrivals,
  };
}

/**
 * Lightweight recommendations: products from categories the shopper has
 * bought, wish-listed or recently viewed, excluding what they already own;
 * falls back to best sellers.
 */
export async function getRecommendations(userId, viewedSlugs = []) {
  const categoryIds = new Set();
  const exclude = new Set();
  if (userId) {
    const [items, wishlist] = await Promise.all([
      prisma.orderItem.findMany({
        where: { sellerOrder: { order: { buyerId: userId } } },
        select: { productId: true, product: { select: { categoryId: true } } },
        orderBy: { sellerOrder: { createdAt: 'desc' } },
        take: 30,
      }),
      prisma.wishlistItem.findMany({ where: { userId }, select: { product: { select: { categoryId: true } } }, take: 30 }),
    ]);
    items.forEach((i) => {
      categoryIds.add(i.product.categoryId);
      exclude.add(i.productId);
    });
    wishlist.forEach((w) => categoryIds.add(w.product.categoryId));
  }
  if (viewedSlugs.length) {
    const viewed = await prisma.product.findMany({ where: { slug: { in: viewedSlugs.slice(0, 10) } }, select: { id: true, categoryId: true } });
    viewed.forEach((v) => {
      categoryIds.add(v.categoryId);
      exclude.add(v.id);
    });
  }
  let rows = [];
  if (categoryIds.size) {
    rows = await prisma.product.findMany({
      where: { ...PUBLIC_PRODUCT_WHERE, categoryId: { in: [...categoryIds] }, id: { notIn: [...exclude] }, stock: { gt: 0 } },
      select: CARD_SELECT,
      orderBy: [{ ratingAvg: 'desc' }, { soldCount: 'desc' }],
      take: 12,
    });
  }
  if (rows.length < 6) {
    const more = await prisma.product.findMany({
      where: { ...PUBLIC_PRODUCT_WHERE, id: { notIn: [...exclude, ...rows.map((r) => r.id)] }, stock: { gt: 0 } },
      select: CARD_SELECT,
      orderBy: [{ ratingAvg: 'desc' }, { soldCount: 'desc' }],
      take: 12 - rows.length,
    });
    rows = [...rows, ...more];
  }
  return rows.map(toCard);
}
