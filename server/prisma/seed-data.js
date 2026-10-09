// Development seed data. Kept separate from application code and never used in production.

export const CATEGORIES = [
  {
    name: 'Electronics', slug: 'electronics', icon: 'monitor', commissionRateBps: 800,
    description: 'Phones, laptops, TVs and the accessories that power your day.',
    children: [
      { name: 'Phones & Tablets', slug: 'phones-tablets', icon: 'smartphone' },
      { name: 'Laptops & Computers', slug: 'laptops-computers', icon: 'laptop' },
      { name: 'TV & Audio', slug: 'tv-audio', icon: 'tv' },
      { name: 'Cameras', slug: 'cameras', icon: 'camera' },
      { name: 'Accessories', slug: 'electronics-accessories', icon: 'headphones' },
    ],
  },
  {
    name: 'Home & Kitchen', slug: 'home-kitchen', icon: 'sofa',
    description: 'Appliances, cookware, furniture and handmade décor.',
    children: [
      { name: 'Appliances', slug: 'appliances', icon: 'refrigerator' },
      { name: 'Cookware', slug: 'cookware', icon: 'cooking-pot' },
      { name: 'Furniture', slug: 'furniture', icon: 'armchair' },
      { name: 'Home Décor', slug: 'home-decor', icon: 'lamp' },
    ],
  },
  {
    name: 'Fashion', slug: 'fashion', icon: 'shirt', commissionRateBps: 1200,
    description: 'Clothing, shoes and accessories — including proudly local designers.',
    children: [
      { name: 'Men', slug: 'men', icon: 'shirt' },
      { name: 'Women', slug: 'women', icon: 'shopping-bag' },
      { name: 'Shoes', slug: 'shoes', icon: 'footprints' },
    ],
  },
  {
    name: 'Groceries', slug: 'groceries', icon: 'shopping-basket', commissionRateBps: 600,
    description: 'Pantry staples, drinks and Rwandan favourites delivered to your door.',
    children: [
      { name: 'Beverages', slug: 'beverages', icon: 'coffee' },
      { name: 'Pantry', slug: 'pantry', icon: 'wheat' },
    ],
  },
  { name: 'Health & Beauty', slug: 'health-beauty', icon: 'sparkles', description: 'Skincare, personal care and wellness.', children: [] },
  { name: 'Sports & Outdoors', slug: 'sports-outdoors', icon: 'dumbbell', description: 'Gear for training, games and adventures.', children: [] },
  { name: 'Baby & Kids', slug: 'baby-kids', icon: 'baby', description: 'Toys, baby care and school essentials.', children: [] },
  { name: 'Books & Stationery', slug: 'books-stationery', icon: 'book-open', description: 'Books, dictionaries and office supplies.', children: [] },
];

export const SHOPS = [
  {
    key: 'tech',
    seller: { name: 'Eric Habimana', email: 'tech@rivoshoppa.local', phone: '+250788100001' },
    profile: { businessName: 'Kigali Tech Hub Ltd', businessType: 'COMPANY', registrationNumber: 'TIN 108234561', businessAddress: 'KN 4 Ave, Kigali City Tower, Kigali', businessPhone: '+250788100001', payoutMethod: 'MTN_MOMO', payoutAccountName: 'Kigali Tech Hub Ltd', payoutAccountNumber: '0788100001' },
    shop: { name: 'Kigali Tech Hub', description: 'Genuine smartphones, laptops and accessories with local warranty. Serving Kigali since 2016.', city: 'Kigali', address: 'KN 4 Ave, Kigali City Tower', phone: '+250788100001', email: 'tech@rivoshoppa.local', fulfillmentMode: 'MARKETPLACE', colors: ['#0b6e75', '#14b8a6'] },
  },
  {
    key: 'home',
    seller: { name: 'Aline Uwase', email: 'home@rivoshoppa.local', phone: '+250788100002' },
    profile: { businessName: 'Inzu Home & Living', businessType: 'COMPANY', registrationNumber: 'TIN 107765432', businessAddress: 'KG 11 Ave, Kimihurura, Kigali', businessPhone: '+250788100002', payoutMethod: 'MTN_MOMO', payoutAccountName: 'Aline Uwase', payoutAccountNumber: '0788100002' },
    shop: { name: 'Inzu Home & Living', description: 'Appliances, cookware and handmade Rwandan décor for every home.', city: 'Kigali', address: 'KG 11 Ave, Kimihurura', phone: '+250788100002', email: 'home@rivoshoppa.local', fulfillmentMode: 'SELF', colors: ['#b45309', '#f59e0b'] },
  },
  {
    key: 'fashion',
    seller: { name: 'Diane Mukamana', email: 'fashion@rivoshoppa.local', phone: '+250788100003' },
    profile: { businessName: 'Umurage Fashion House', businessType: 'INDIVIDUAL', businessAddress: 'Kimironko Market, Stall 214, Kigali', businessPhone: '+250788100003', payoutMethod: 'AIRTEL_MONEY', payoutAccountName: 'Diane Mukamana', payoutAccountNumber: '0738100003' },
    shop: { name: 'Umurage Fashion', description: 'Modern African fashion — kitenge shirts, wrap dresses and leather goods made in Kigali.', city: 'Kigali', address: 'Kimironko Market', phone: '+250788100003', email: 'fashion@rivoshoppa.local', fulfillmentMode: 'SELF', colors: ['#9d174d', '#f472b6'] },
  },
  {
    key: 'fresh',
    seller: { name: 'Jean Bosco Niyonzima', email: 'fresh@rivoshoppa.local', phone: '+250788100004' },
    profile: { businessName: 'Isoko Fresh Market', businessType: 'COOPERATIVE', registrationNumber: 'RCA 00451', businessAddress: 'Nyabugogo, Kigali', businessPhone: '+250788100004', payoutMethod: 'MTN_MOMO', payoutAccountName: 'Isoko Cooperative', payoutAccountNumber: '0788100004' },
    shop: { name: 'Isoko Fresh Market', description: 'Rwandan coffee, tea, pantry staples, wellness, sports and school supplies at fair prices.', city: 'Kigali', address: 'Nyabugogo', phone: '+250788100004', email: 'fresh@rivoshoppa.local', fulfillmentMode: 'SELF', colors: ['#166534', '#4ade80'] },
  },
];

export const PENDING_SELLER = {
  seller: { name: 'Patrick Mugisha', email: 'pending@rivoshoppa.local', phone: '+250788100005' },
  profile: { businessName: 'Nyamirambo Gadgets', businessType: 'INDIVIDUAL', businessAddress: 'Nyamirambo, Kigali', businessPhone: '+250788100005', payoutMethod: 'MTN_MOMO', payoutAccountName: 'Patrick Mugisha', payoutAccountNumber: '0788100005' },
  shop: { name: 'Nyamirambo Gadgets', description: 'Affordable phone accessories and repairs.', city: 'Kigali', phone: '+250788100005' },
};

const spec = (pairs) => pairs.map(([name, value]) => ({ name, value }));

// glyph: drawing used for the generated product image
export const PRODUCTS = [
  // ── Kigali Tech Hub ──
  { shop: 'tech', category: 'phones-tablets', glyph: 'phone', name: 'Tecno Spark 20 Pro (256GB, 8GB RAM)', brand: 'Tecno', price: 245000, compareAtPrice: 265000, stock: 25, featured: true, tags: ['smartphone', 'android', 'dual sim'], specs: spec([['Display', '6.78" FHD+ 120Hz'], ['Storage', '256GB'], ['RAM', '8GB'], ['Camera', '108MP main'], ['Battery', '5000mAh, 33W fast charge'], ['Warranty', '12 months']]), description: 'A big, smooth 120Hz display, 108MP camera and all-day battery. Dual SIM with 4G support on MTN and Airtel Rwanda networks. Includes charger, case and screen protector.' },
  { shop: 'tech', category: 'phones-tablets', glyph: 'phone', name: 'Samsung Galaxy A15 (128GB)', brand: 'Samsung', price: 219000, stock: 18, tags: ['smartphone', 'android', 'samsung'], specs: spec([['Display', '6.5" Super AMOLED 90Hz'], ['Storage', '128GB (expandable)'], ['RAM', '6GB'], ['Battery', '5000mAh'], ['Warranty', '12 months Samsung Rwanda']]), description: 'Super AMOLED display, a versatile triple camera and four generations of Android updates. Official Samsung Rwanda warranty.' },
  { shop: 'tech', category: 'phones-tablets', glyph: 'phone', name: 'Apple iPhone 13 (128GB, Renewed)', brand: 'Apple', price: 690000, compareAtPrice: 780000, stock: 6, featured: true, tags: ['iphone', 'ios', 'renewed'], specs: spec([['Condition', 'Renewed — Grade A'], ['Storage', '128GB'], ['Battery health', '90%+'], ['Warranty', '6 months']]), description: 'Professionally inspected and renewed iPhone 13 with at least 90% battery health. Fully unlocked, includes a new cable and 6-month shop warranty.' },
  { shop: 'tech', category: 'phones-tablets', glyph: 'phone', name: 'Infinix Hot 40i (128GB)', brand: 'Infinix', price: 159000, stock: 3, tags: ['smartphone', 'budget'], specs: spec([['Display', '6.56" HD+ 90Hz'], ['Storage', '128GB'], ['Battery', '5000mAh']]), description: 'Great value smartphone with a large display, long battery life and plenty of storage for photos and apps.' },
  { shop: 'tech', category: 'phones-tablets', glyph: 'tablet', name: 'Lenovo Tab M10 (64GB, Wi-Fi)', brand: 'Lenovo', price: 210000, stock: 9, tags: ['tablet', 'students'], specs: spec([['Display', '10.1" FHD'], ['Storage', '64GB'], ['RAM', '4GB'], ['Battery', '7700mAh']]), description: 'A family-friendly tablet for school, streaming and video calls, with a crisp 10-inch display and dual speakers.' },
  { shop: 'tech', category: 'laptops-computers', glyph: 'laptop', name: 'HP 250 G9 – Core i5, 8GB, 512GB SSD', brand: 'HP', price: 720000, compareAtPrice: 790000, stock: 8, featured: true, tags: ['laptop', 'windows', 'office'], specs: spec([['Processor', 'Intel Core i5-1235U'], ['Memory', '8GB DDR4'], ['Storage', '512GB SSD'], ['Display', '15.6" FHD'], ['OS', 'Windows 11 Home']]), description: 'A dependable work laptop with a fast SSD, full-size keyboard and Windows 11. Ideal for business, university and remote work.' },
  { shop: 'tech', category: 'laptops-computers', glyph: 'laptop', name: 'Lenovo IdeaPad 3 – Ryzen 5, 8GB, 256GB', brand: 'Lenovo', price: 650000, stock: 5, tags: ['laptop', 'amd'], specs: spec([['Processor', 'AMD Ryzen 5 5500U'], ['Memory', '8GB'], ['Storage', '256GB SSD'], ['Display', '15.6" FHD']]), description: 'Smooth multitasking with Ryzen 5 power in a slim, light design.' },
  { shop: 'tech', category: 'laptops-computers', glyph: 'laptop', name: 'Apple MacBook Air 13" M2 (256GB)', brand: 'Apple', price: 1550000, stock: 4, tags: ['macbook', 'apple'], specs: spec([['Chip', 'Apple M2'], ['Memory', '8GB unified'], ['Storage', '256GB SSD'], ['Battery', 'Up to 18 hours']]), description: 'Incredibly thin and fast with all-day battery life and a stunning Liquid Retina display.' },
  { shop: 'tech', category: 'tv-audio', glyph: 'tv', name: 'Hisense 43" 4K UHD Smart TV', brand: 'Hisense', price: 420000, compareAtPrice: 459000, stock: 7, featured: true, tags: ['tv', 'smart tv', '4k'], specs: spec([['Screen', '43" 4K UHD'], ['Smart platform', 'VIDAA — Netflix, YouTube'], ['Ports', '3× HDMI, 2× USB']]), description: 'Bring 4K entertainment home with built-in Netflix and YouTube, Dolby Audio and a slim bezel design.' },
  { shop: 'tech', category: 'tv-audio', glyph: 'tv', name: 'Samsung 55" Crystal UHD 4K TV', brand: 'Samsung', price: 890000, stock: 3, tags: ['tv', '4k', 'samsung'], specs: spec([['Screen', '55" Crystal UHD'], ['HDR', 'HDR10+'], ['Smart platform', 'Tizen']]), description: 'Vivid Crystal colour, HDR10+ and a powerful smart platform for all your apps.' },
  { shop: 'tech', category: 'tv-audio', glyph: 'speaker', name: 'JBL Flip 6 Portable Bluetooth Speaker', brand: 'JBL', price: 135000, stock: 14, tags: ['speaker', 'bluetooth', 'waterproof'], specs: spec([['Battery', '12 hours'], ['Rating', 'IP67 waterproof'], ['Connectivity', 'Bluetooth 5.1']]), description: 'Bold JBL sound in a rugged, waterproof speaker that goes anywhere.' },
  { shop: 'tech', category: 'tv-audio', glyph: 'headphones', name: 'Oraimo FreePods 4 Wireless Earbuds', brand: 'Oraimo', price: 39000, compareAtPrice: 45000, stock: 40, tags: ['earbuds', 'anc'], specs: spec([['Noise cancelling', 'Active (ANC)'], ['Battery', '35 hours with case']]), description: 'Active noise cancellation, punchy bass and a pocket-size charging case.' },
  { shop: 'tech', category: 'cameras', glyph: 'camera', name: 'Canon EOS 2000D DSLR with 18–55mm Lens', brand: 'Canon', price: 610000, stock: 2, tags: ['camera', 'dslr'], specs: spec([['Sensor', '24.1MP APS-C'], ['Video', 'Full HD 1080p'], ['Connectivity', 'Wi-Fi, NFC']]), description: 'Start your photography journey with a 24MP DSLR and versatile kit lens.' },
  { shop: 'tech', category: 'electronics-accessories', glyph: 'battery', name: 'Anker PowerCore 20,000mAh Power Bank', brand: 'Anker', price: 45000, stock: 30, tags: ['power bank', 'charging'], specs: spec([['Capacity', '20,000mAh'], ['Output', '2× USB-A, 1× USB-C']]), description: 'Charge your phone up to five times — perfect for power cuts and travel.' },
  { shop: 'tech', category: 'electronics-accessories', glyph: 'mouse', name: 'Logitech M185 Wireless Mouse', brand: 'Logitech', price: 15000, stock: 0, tags: ['mouse', 'wireless'], specs: spec([['Battery life', '12 months'], ['Receiver', 'USB nano']]), description: 'Reliable plug-and-play wireless mouse with a 12-month battery life.' },
  { shop: 'tech', category: 'electronics-accessories', glyph: 'battery', name: 'Oraimo 65W GaN Fast Charger', brand: 'Oraimo', price: 25000, stock: 22, tags: ['charger', 'usb-c'], specs: spec([['Power', '65W'], ['Ports', '2× USB-C, 1× USB-A']]), description: 'Compact GaN charger that fast-charges laptops, tablets and phones.' },

  // ── Inzu Home & Living ──
  { shop: 'home', category: 'appliances', glyph: 'fridge', name: 'Hisense 150L Double Door Refrigerator', brand: 'Hisense', price: 380000, stock: 5, featured: true, tags: ['fridge', 'kitchen'], specs: spec([['Capacity', '150 litres'], ['Energy class', 'A+'], ['Warranty', '24 months']]), description: 'Energy-efficient double door fridge, sized for Kigali apartments. Free delivery within Kigali.' },
  { shop: 'home', category: 'appliances', glyph: 'stove', name: 'Ramtons 2-Burner Gas Cooker', brand: 'Ramtons', price: 85000, compareAtPrice: 95000, stock: 12, tags: ['gas cooker', 'kitchen'], specs: spec([['Burners', '2'], ['Ignition', 'Auto']]), description: 'Sturdy stainless steel table-top gas cooker with auto ignition.' },
  { shop: 'home', category: 'appliances', glyph: 'kettle', name: 'Electric Kettle 1.8L (Stainless Steel)', brand: 'Nunix', price: 18000, stock: 35, tags: ['kettle', 'kitchen'], specs: spec([['Capacity', '1.8 litres'], ['Power', '1500W']]), description: 'Boils water in minutes with automatic shut-off and boil-dry protection.' },
  { shop: 'home', category: 'appliances', glyph: 'blender', name: 'Sayona 1.5L Blender with Grinder', brand: 'Sayona', price: 42000, stock: 11, tags: ['blender', 'juice'], specs: spec([['Jar', '1.5L'], ['Speeds', '3 + pulse']]), description: 'Fresh juices, smoothies and sauces — includes a dry grinder for spices.' },
  { shop: 'home', category: 'appliances', glyph: 'iron', name: 'Philips Steam Iron 2000W', brand: 'Philips', price: 32000, stock: 16, tags: ['iron'], specs: spec([['Power', '2000W'], ['Soleplate', 'Ceramic']]), description: 'Powerful steam for crisp, wrinkle-free clothes.' },
  { shop: 'home', category: 'cookware', glyph: 'pot', name: 'Non-stick Cookware Set (7 pieces)', brand: 'Inzu', price: 55000, compareAtPrice: 68000, stock: 10, tags: ['pots', 'pans'], specs: spec([['Pieces', '7'], ['Coating', 'PFOA-free non-stick']]), description: 'Everything you need to cook: pots, pan and glass lids with heat-resistant handles.' },
  { shop: 'home', category: 'cookware', glyph: 'pot', name: 'Stainless Steel Pressure Cooker 6L', brand: 'Inzu', price: 48000, stock: 8, tags: ['pressure cooker', 'beans'], specs: spec([['Capacity', '6 litres'], ['Material', 'Stainless steel']]), description: 'Cook beans and stews in a fraction of the time, saving gas and charcoal.' },
  { shop: 'home', category: 'furniture', glyph: 'chair', name: 'Ergonomic Mesh Office Chair', brand: 'Inzu', price: 120000, stock: 6, tags: ['office', 'chair'], specs: spec([['Support', 'Adjustable lumbar'], ['Max load', '120kg']]), description: 'Breathable mesh, adjustable height and lumbar support for long work days.' },
  { shop: 'home', category: 'furniture', glyph: 'table', name: 'Handcrafted Wooden Coffee Table', brand: 'Made in Rwanda', price: 95000, stock: 4, tags: ['made in rwanda', 'table'], specs: spec([['Material', 'Solid eucalyptus'], ['Size', '100 × 55 × 45 cm']]), description: 'Crafted by artisans in Gisozi from solid local hardwood.' },
  { shop: 'home', category: 'home-decor', glyph: 'imigongo', name: 'Imigongo Wall Art (Handmade, 60cm)', brand: 'Made in Rwanda', price: 60000, stock: 7, featured: true, tags: ['imigongo', 'art', 'made in rwanda'], specs: spec([['Size', '60 × 60 cm'], ['Origin', 'Kirehe district']]), description: 'Traditional geometric Imigongo art handmade by a women’s cooperative in Eastern Province.' },
  { shop: 'home', category: 'home-decor', glyph: 'basket', name: 'Agaseke Peace Basket Set (3 pieces)', brand: 'Made in Rwanda', price: 35000, stock: 15, tags: ['agaseke', 'basket', 'made in rwanda'], specs: spec([['Pieces', '3 sizes'], ['Material', 'Sisal and sweetgrass']]), description: 'Beautiful hand-woven Agaseke baskets — a timeless symbol of Rwandan craftsmanship.' },

  // ── Umurage Fashion ──
  { shop: 'fashion', category: 'men', glyph: 'shirt', name: "Men's Kitenge Shirt (Slim Fit)", brand: 'Umurage', price: 28000, stock: 24, featured: true, tags: ['kitenge', 'shirt', 'made in rwanda'], specs: spec([['Fabric', '100% cotton wax print'], ['Sizes', 'S – XXL'], ['Fit', 'Slim']]), description: 'Bold kitenge prints tailored in Kigali. Perfect for weddings, office Fridays and weekends.' },
  { shop: 'fashion', category: 'men', glyph: 'trousers', name: "Men's Stretch Chino Trousers", brand: 'Umurage', price: 22000, stock: 30, tags: ['trousers', 'chinos'], specs: spec([['Fabric', 'Cotton blend with stretch']]), description: 'Comfortable everyday chinos that pair with anything.' },
  { shop: 'fashion', category: 'women', glyph: 'dress', name: "Women's Ankara Wrap Dress", brand: 'Umurage', price: 35000, compareAtPrice: 42000, stock: 14, tags: ['ankara', 'dress'], specs: spec([['Fabric', 'Cotton wax print'], ['Length', 'Midi']]), description: 'A flattering wrap silhouette in vibrant Ankara print, made by local tailors.' },
  { shop: 'fashion', category: 'women', glyph: 'bag', name: "Women's Leather Handbag", brand: 'Umurage', price: 45000, stock: 9, tags: ['handbag', 'leather'], specs: spec([['Material', 'Genuine leather'], ['Compartments', '3']]), description: 'Elegant everyday handbag in genuine leather with an adjustable strap.' },
  { shop: 'fashion', category: 'shoes', glyph: 'shoe', name: 'Canvas Sneakers (Unisex)', brand: 'Umurage', price: 25000, stock: 40, tags: ['sneakers', 'shoes'], specs: spec([['Sizes', 'EU 36 – 45']]), description: 'Lightweight, breathable canvas sneakers for everyday comfort.' },
  { shop: 'fashion', category: 'shoes', glyph: 'shoe', name: "Men's Leather Oxford Shoes", brand: 'Umurage', price: 55000, stock: 2, tags: ['shoes', 'formal'], specs: spec([['Material', 'Genuine leather'], ['Sizes', 'EU 39 – 46']]), description: 'Classic leather Oxfords handmade for formal occasions and the office.' },

  // ── Isoko Fresh Market ──
  { shop: 'fresh', category: 'beverages', glyph: 'coffee', name: 'Rwanda Arabica Coffee – Medium Roast 500g', brand: 'Huye Mountain', price: 9500, stock: 80, featured: true, tags: ['coffee', 'arabica', 'made in rwanda'], specs: spec([['Origin', 'Huye, Southern Province'], ['Roast', 'Medium'], ['Grind', 'Whole bean']]), description: 'Award-winning single-origin Arabica with notes of red berries and caramel, roasted in Kigali.' },
  { shop: 'fresh', category: 'beverages', glyph: 'tea', name: 'Rwandan Black Tea 250g', brand: 'Sorwathe', price: 3500, stock: 120, tags: ['tea', 'made in rwanda'], specs: spec([['Weight', '250g'], ['Type', 'CTC black tea']]), description: 'Rich, bright black tea from the hills of Northern Rwanda.' },
  { shop: 'fresh', category: 'beverages', glyph: 'bottle', name: 'Mineral Water 1.5L (12-pack)', brand: 'Inyange', price: 7200, stock: 60, tags: ['water'], specs: spec([['Pack', '12 × 1.5L']]), description: 'Pure natural mineral water — delivered to your door.' },
  { shop: 'fresh', category: 'pantry', glyph: 'jar', name: 'Akabanga Chili Oil 100ml', brand: 'Akabanga', price: 1800, stock: 150, featured: true, tags: ['chili', 'akabanga', 'made in rwanda'], specs: spec([['Volume', '100ml']]), description: 'Rwanda’s famous fiery chili oil. Just a drop transforms any meal.' },
  { shop: 'fresh', category: 'pantry', glyph: 'sack', name: 'Basmati Rice 5kg', brand: 'Isoko', price: 12500, compareAtPrice: 14000, stock: 45, tags: ['rice'], specs: spec([['Weight', '5kg']]), description: 'Long-grain, aromatic basmati rice.' },
  { shop: 'fresh', category: 'pantry', glyph: 'bottle', name: 'Sunflower Cooking Oil 3L', brand: 'Isoko', price: 9800, stock: 50, tags: ['cooking oil'], specs: spec([['Volume', '3 litres']]), description: 'Light, cholesterol-free sunflower oil for everyday cooking.' },
  { shop: 'fresh', category: 'pantry', glyph: 'jar', name: 'Natural Forest Honey 500g', brand: 'Nyungwe Bees', price: 7000, stock: 25, tags: ['honey', 'made in rwanda'], specs: spec([['Weight', '500g'], ['Origin', 'Nyungwe forest']]), description: 'Raw honey harvested sustainably near Nyungwe forest.' },
  { shop: 'fresh', category: 'health-beauty', glyph: 'lotion', name: 'Shea Butter Body Lotion 400ml', brand: 'Isoko Naturals', price: 6500, stock: 40, tags: ['lotion', 'skincare'], specs: spec([['Volume', '400ml'], ['Skin type', 'All']]), description: 'Deeply moisturising lotion with natural shea butter.' },
  { shop: 'fresh', category: 'health-beauty', glyph: 'toothbrush', name: 'Rechargeable Electric Toothbrush', brand: 'Oral Care', price: 25000, stock: 12, tags: ['toothbrush'], specs: spec([['Battery', '30 days per charge']]), description: 'Cleaner teeth with a 2-minute smart timer and 3 brushing modes.' },
  { shop: 'fresh', category: 'sports-outdoors', glyph: 'ball', name: 'Football – Size 5 (Match Ball)', brand: 'Isoko Sports', price: 15000, stock: 30, tags: ['football', 'soccer'], specs: spec([['Size', '5'], ['Material', 'PU leather']]), description: 'Durable, match-quality football for grass and artificial pitches.' },
  { shop: 'fresh', category: 'sports-outdoors', glyph: 'mat', name: 'Yoga Mat 6mm (Non-slip)', brand: 'Isoko Sports', price: 18000, stock: 20, tags: ['yoga', 'fitness'], specs: spec([['Thickness', '6mm'], ['Size', '183 × 61 cm']]), description: 'Comfortable, non-slip mat for yoga, stretching and home workouts.' },
  { shop: 'fresh', category: 'sports-outdoors', glyph: 'bike', name: 'Mountain Bike 26" (21-speed)', brand: 'Isoko Sports', price: 280000, stock: 3, tags: ['bicycle', 'bike'], specs: spec([['Wheel size', '26"'], ['Gears', '21-speed Shimano']]), description: 'Built for Rwanda’s thousand hills with 21 gears and front suspension.' },
  { shop: 'fresh', category: 'baby-kids', glyph: 'blocks', name: 'Building Blocks Set (100 pieces)', brand: 'Isoko Kids', price: 20000, stock: 18, tags: ['toys', 'kids'], specs: spec([['Pieces', '100'], ['Age', '3+']]), description: 'Colourful blocks that build creativity and fine motor skills.' },
  { shop: 'fresh', category: 'baby-kids', glyph: 'diaper', name: 'Baby Diapers Size 3 (60 pieces)', brand: 'Softcare', price: 16000, stock: 35, tags: ['diapers', 'baby'], specs: spec([['Size', '3 (6–11kg)'], ['Count', '60']]), description: 'Soft, absorbent diapers with up to 12 hours of dryness.' },
  { shop: 'fresh', category: 'books-stationery', glyph: 'book', name: 'A4 Exercise Books (Pack of 10)', brand: 'Isoko', price: 6000, stock: 100, tags: ['school', 'stationery'], specs: spec([['Pages', '96 each'], ['Ruling', 'Lined']]), description: 'Quality exercise books for the new school term.' },
  { shop: 'fresh', category: 'books-stationery', glyph: 'book', name: 'Kinyarwanda – English Dictionary', brand: 'Isoko Books', price: 12000, stock: 15, tags: ['dictionary', 'kinyarwanda'], specs: spec([['Pages', '520']]), description: 'Comprehensive bilingual dictionary for students and professionals.' },
];

export const BANNERS = [
  { title: 'Tech Week: up to 15% off', subtitle: 'Smartphones, laptops and TVs from trusted Kigali sellers', ctaLabel: 'Shop electronics', linkUrl: '/search?category=electronics&onSale=true', theme: 'brand', position: 'HOME_HERO', sortOrder: 1 },
  { title: 'Proudly Made in Rwanda', subtitle: 'Imigongo art, Agaseke baskets, kitenge fashion and more', ctaLabel: 'Discover local makers', linkUrl: '/search?q=made%20in%20rwanda', theme: 'sunrise', position: 'HOME_HERO', sortOrder: 2 },
  { title: 'Groceries delivered today', subtitle: 'Coffee, tea, pantry staples — order before 2pm in Kigali', ctaLabel: 'Fill your basket', linkUrl: '/search?category=groceries', theme: 'forest', position: 'HOME_HERO', sortOrder: 3 },
  { title: 'Pay with Mobile Money', subtitle: 'MTN MoMo, Airtel Money or cash on delivery', theme: 'accent', position: 'HOME_STRIP', sortOrder: 1, linkUrl: '/pages/help' },
  { title: 'Sell on Rivoshoppa', subtitle: 'Reach buyers across Rwanda — set up your shop in minutes', ctaLabel: 'Start selling', theme: 'dark', position: 'HOME_STRIP', sortOrder: 2, linkUrl: '/sell' },
];

export const PAGES = [
  {
    slug: 'about',
    title: 'About Rivoshoppa',
    body: `Rivoshoppa is a Rwandan online marketplace connecting shoppers with trusted independent sellers.

Our mission is to make it simple, safe and affordable to buy and sell online — with local payment methods like MTN Mobile Money and Airtel Money, reliable delivery, and real customer support.

Every seller on Rivoshoppa is reviewed before their shop goes live, and every review on a product comes from a verified purchase.`,
  },
  {
    slug: 'help',
    title: 'Help Center',
    body: `How do I pay?
You can pay with MTN Mobile Money, Airtel Money or cash on delivery (for eligible orders). For mobile money, approve the payment prompt on your phone after checkout.

When will my order arrive?
Most orders in Kigali arrive within 1–2 days. Each seller ships separately, and you can track every shipment from your account.

What is the delivery code?
Each shipment has a 6-digit code shown in your order details. Give it to the courier only when you have received your package — it confirms delivery.

How do refunds work?
You can request a refund for delivered items within the refund window shown on your order. Our team reviews every request, usually within 2 business days.

Need more help?
Open a support request from your account and our team will reply as soon as possible.`,
  },
  {
    slug: 'returns',
    title: 'Returns & Refunds Policy',
    body: `You may request a refund within 7 days of delivery for items that are damaged, defective, not as described, or the wrong item.

Items must be returned in their original condition with all accessories and packaging. Perishable groceries can only be refunded if they arrive damaged or expired.

Refunds are sent to your original payment method once approved. Paid orders that are cancelled before shipping are refunded automatically.`,
  },
  {
    slug: 'shipping',
    title: 'Delivery Information',
    body: `Delivery fees are calculated per seller. Orders from the same seller above the free-delivery threshold ship free.

Some sellers deliver themselves, others use Rivoshoppa couriers. Either way, you can follow the progress of every shipment in your account and receive SMS or email updates.`,
  },
  {
    slug: 'terms',
    title: 'Terms of Service',
    body: `By using Rivoshoppa you agree to these terms. Sellers are responsible for the accuracy of their listings and for fulfilling orders on time. Rivoshoppa facilitates transactions, payments and dispute resolution between buyers and sellers.

Prohibited items, fraudulent activity and abuse of the platform may lead to account suspension.

This is template text for development. Replace it with terms reviewed by your legal advisor before launch.`,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    body: `We collect the information needed to process your orders — such as your name, contact details and delivery address — and use it only to provide our services.

Sellers only see the information required to fulfil your order. We never sell your personal data. Payment details are handled by the payment providers and are never stored by Rivoshoppa.

This is template text for development. Replace it with a policy that complies with Rwanda's data protection law (Law No. 058/2021) before launch.`,
  },
];

export const COUPONS = [
  { code: 'WELCOME10', description: '10% off your first order (up to 10,000 RWF)', type: 'PERCENTAGE', value: 10, maxDiscount: 10000, minOrderAmount: 10000, perUserLimit: 1 },
  { code: 'RIVO5000', description: '5,000 RWF off orders over 75,000 RWF', type: 'FIXED', value: 5000, minOrderAmount: 75000, perUserLimit: 3, usageLimit: 500 },
];
