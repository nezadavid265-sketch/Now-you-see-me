// Generates original placeholder artwork for seeded products and shops (no external downloads).
import sharp from 'sharp';

const G = {
  phone: '<rect x="-80" y="-150" width="160" height="300" rx="28"/><line x1="-25" y1="115" x2="25" y2="115"/>',
  tablet: '<rect x="-130" y="-160" width="260" height="320" rx="24"/><circle cx="0" cy="130" r="6"/>',
  laptop: '<rect x="-150" y="-110" width="300" height="190" rx="14"/><path d="M-200 110 H200 L170 140 H-170 Z"/>',
  tv: '<rect x="-180" y="-130" width="360" height="220" rx="12"/><path d="M-60 140 H60 M0 90 V140"/>',
  speaker: '<rect x="-90" y="-150" width="180" height="300" rx="60"/><circle cx="0" cy="-60" r="30"/><circle cx="0" cy="50" r="55"/>',
  headphones: '<path d="M-120 60 V0 A120 120 0 0 1 120 0 V60"/><rect x="-150" y="40" width="60" height="100" rx="20"/><rect x="90" y="40" width="60" height="100" rx="20"/>',
  camera: '<rect x="-170" y="-90" width="340" height="220" rx="24"/><path d="M-70 -90 L-45 -130 H45 L70 -90"/><circle cx="0" cy="20" r="70"/>',
  battery: '<rect x="-150" y="-80" width="280" height="160" rx="22"/><rect x="135" y="-30" width="25" height="60" rx="6"/><path d="M10 -50 L-40 10 H10 L-20 60"/>',
  mouse: '<rect x="-80" y="-140" width="160" height="260" rx="80"/><line x1="0" y1="-140" x2="0" y2="-60"/>',
  fridge: '<rect x="-100" y="-160" width="200" height="320" rx="18"/><line x1="-100" y1="-40" x2="100" y2="-40"/><line x1="-65" y1="-120" x2="-65" y2="-75"/><line x1="-65" y1="0" x2="-65" y2="60"/>',
  stove: '<rect x="-170" y="-20" width="340" height="130" rx="16"/><ellipse cx="-80" cy="-50" rx="60" ry="18"/><ellipse cx="80" cy="-50" rx="60" ry="18"/><circle cx="-80" cy="45" r="14"/><circle cx="80" cy="45" r="14"/>',
  kettle: '<path d="M-90 140 H90 L70 -60 H-70 Z"/><path d="M-40 -60 V-100 H40 V-60"/><path d="M70 -20 C150 -20 150 90 80 90"/>',
  blender: '<path d="M-70 -150 H70 L50 40 H-50 Z"/><rect x="-80" y="40" width="160" height="100" rx="16"/>',
  iron: '<path d="M-170 90 H170 C170 0 100 -60 0 -60 H-60 C-120 -60 -170 0 -170 90 Z"/><path d="M-40 -60 C-40 -120 80 -120 100 -60"/>',
  pot: '<path d="M-140 -40 H140 V80 C140 120 110 140 80 140 H-80 C-110 140 -140 120 -140 80 Z"/><path d="M-160 -40 H160 M-30 -80 H30 M-140 0 H-190 M140 0 H190"/>',
  chair: '<path d="M-80 -150 H80 V20 H-80 Z"/><path d="M-110 20 H110 V60 H-110 Z"/><path d="M-90 60 V150 M90 60 V150"/>',
  table: '<rect x="-180" y="-50" width="360" height="40" rx="10"/><path d="M-150 -10 V130 M150 -10 V130"/>',
  imigongo: '<rect x="-150" y="-150" width="300" height="300" rx="10"/><path d="M-150 -60 L-90 -120 L-30 -60 L30 -120 L90 -60 L150 -120 M-150 40 L-90 -20 L-30 40 L30 -20 L90 40 L150 -20 M-150 140 L-90 80 L-30 140 L30 80 L90 140 L150 80"/>',
  basket: '<path d="M-130 -20 H130 L80 150 H-80 Z"/><path d="M-110 40 H110 M-95 100 H95"/><path d="M-100 -20 L0 -150 L100 -20"/>',
  shirt: '<path d="M-60 -150 L-160 -100 L-120 -20 L-90 -40 V150 H90 V-40 L120 -20 L160 -100 L60 -150 C40 -110 -40 -110 -60 -150 Z"/>',
  trousers: '<path d="M-100 -150 H100 L120 150 H30 L0 -40 L-30 150 H-120 Z"/>',
  dress: '<path d="M-50 -150 H50 L60 -60 L150 150 H-150 L-60 -60 Z"/><path d="M-60 -60 H60"/>',
  bag: '<rect x="-150" y="-60" width="300" height="200" rx="24"/><path d="M-70 -60 V-100 C-70 -150 70 -150 70 -100 V-60"/>',
  shoe: '<path d="M-180 60 V-20 C-180 -60 -140 -60 -120 -40 L-40 20 C0 40 80 30 140 50 C180 60 190 80 190 100 V110 H-180 Z"/><path d="M-180 110 H190"/>',
  coffee: '<path d="M-120 -60 H100 V60 C100 120 60 150 0 150 H-20 C-80 150 -120 120 -120 60 Z"/><path d="M100 -20 C170 -20 170 80 100 80"/><path d="M-60 -110 C-40 -140 -80 -150 -60 -180 M0 -110 C20 -140 -20 -150 0 -180"/>',
  tea: '<path d="M-120 -40 H120 V40 C120 110 70 140 0 140 C-70 140 -120 110 -120 40 Z"/><path d="M-150 160 H150 M0 -40 V-120"/><rect x="-25" y="-160" width="50" height="40"/>',
  bottle: '<path d="M-30 -160 H30 V-110 C30 -90 70 -70 70 -30 V140 C70 150 60 160 50 160 H-50 C-60 160 -70 150 -70 140 V-30 C-70 -70 -30 -90 -30 -110 Z"/><path d="M-70 10 H70 M-70 90 H70"/>',
  jar: '<rect x="-100" y="-90" width="200" height="240" rx="30"/><rect x="-80" y="-140" width="160" height="50" rx="10"/><path d="M-60 0 H60 M-60 60 H60"/>',
  sack: '<path d="M-110 -120 C-60 -100 60 -100 110 -120 L130 120 C130 145 110 160 80 160 H-80 C-110 160 -130 145 -130 120 Z"/><path d="M-80 -150 L-110 -120 M80 -150 L110 -120 M-60 20 H60"/>',
  lotion: '<rect x="-70" y="-60" width="140" height="220" rx="30"/><path d="M-20 -60 V-110 H20 V-60 M-20 -110 H-70"/>',
  toothbrush: '<path d="M-150 140 L80 -90"/><path d="M60 -120 L120 -60 L150 -90 L90 -150 Z"/>',
  ball: '<circle cx="0" cy="0" r="150"/><path d="M0 -50 L48 -15 L30 40 H-30 L-48 -15 Z M0 -50 V-150 M48 -15 L140 -50 M30 40 L90 120 M-30 40 L-90 120 M-48 -15 L-140 -50"/>',
  mat: '<rect x="-170" y="-40" width="300" height="120" rx="20"/><circle cx="130" cy="20" r="60"/>',
  bike: '<circle cx="-110" cy="60" r="80"/><circle cx="110" cy="60" r="80"/><path d="M-110 60 L-30 -60 H70 L110 60 M-30 -60 L10 60 H-110 M10 60 L70 -60 M-50 -90 H0 M70 -60 L60 -100 H100"/>',
  blocks: '<rect x="-150" y="20" width="130" height="130" rx="10"/><rect x="20" y="20" width="130" height="130" rx="10"/><rect x="-65" y="-120" width="130" height="130" rx="10"/>',
  diaper: '<path d="M-160 -100 H160 V-40 C160 60 80 140 0 140 C-80 140 -160 60 -160 -40 Z"/><path d="M-160 -40 C-100 -40 -60 0 -60 60 M160 -40 C100 -40 60 0 60 60"/>',
  book: '<path d="M0 -110 C-50 -150 -120 -150 -170 -130 V130 C-120 110 -50 110 0 150 C50 110 120 110 170 130 V-130 C120 -150 50 -150 0 -110 Z"/><path d="M0 -110 V150"/>',
};

const PALETTES = {
  electronics: ['#0b6e75', '#14b8a6'],
  'home-kitchen': ['#b45309', '#fbbf24'],
  fashion: ['#9d174d', '#f472b6'],
  groceries: ['#166534', '#4ade80'],
  'health-beauty': ['#7c3aed', '#c4b5fd'],
  'sports-outdoors': ['#1d4ed8', '#60a5fa'],
  'baby-kids': ['#ea580c', '#fdba74'],
  'books-stationery': ['#334155', '#94a3b8'],
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

export async function productImage({ glyph, title, brand, rootCategory, variant = 0 }) {
  const [c1, c2] = PALETTES[rootCategory] ?? PALETTES.electronics;
  const angle = variant ? 'x1="1" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="1"';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs><linearGradient id="g" ${angle}><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="800" height="800" fill="#f1f5f9"/>
  <rect x="40" y="40" width="720" height="720" rx="56" fill="url(#g)"/>
  <circle cx="${variant ? 170 : 630}" cy="170" r="150" fill="#ffffff" opacity="0.12"/>
  <circle cx="${variant ? 640 : 150}" cy="680" r="190" fill="#ffffff" opacity="0.08"/>
  <g transform="translate(400 330) scale(${variant ? 1.05 : 0.95})" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">${G[glyph] ?? G.bag}</g>
  <text x="400" y="610" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(clip(title, 30))}</text>
  <text x="400" y="662" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="28" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">${esc(brand ?? '')}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function shopLogo({ name, colors: [c1, c2] }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w[0]))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="400" height="400" rx="80" fill="url(#g)"/>
  <text x="200" y="245" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="150" font-weight="800" fill="#ffffff" text-anchor="middle">${esc(initials)}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function shopBanner({ colors: [c1, c2] }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400" viewBox="0 0 1600 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="1600" height="400" fill="url(#g)"/>
  <circle cx="1350" cy="80" r="220" fill="#fff" opacity="0.10"/><circle cx="200" cy="380" r="260" fill="#fff" opacity="0.07"/>
  <path d="M0 300 L120 220 L240 300 L360 220 L480 300 L600 220 L720 300 L840 220 L960 300 L1080 220 L1200 300 L1320 220 L1440 300 L1600 200" stroke="#fff" stroke-opacity="0.18" stroke-width="18" fill="none"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
