const products = [
  { id: 1, name: 'Rose Drape Saree', price: 2499, old: 3299, category: 'Women', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=500&q=85', badge: 'BESTSELLER' },
  { id: 2, name: 'Soft Glam Kit', price: 1299, old: 1599, category: 'Beauty', image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=500&q=85', badge: 'NEW' },
  { id: 3, name: 'Ivory Linen Co-ord', price: 2199, old: 2799, category: 'Women', image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=500&q=85' },
  { id: 4, name: 'Classic Resort Shirt', price: 1699, old: 2199, category: 'Men', image: 'https://images.unsplash.com/photo-1598554747436-c9293d6a588f?auto=format&fit=crop&w=500&q=85' },
  { id: 5, name: 'Little Bloom Dress', price: 999, old: 1299, category: 'Girls', image: 'https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?auto=format&fit=crop&w=500&q=85', badge: 'NEW' },
  { id: 6, name: 'Weekend Adventure Set', price: 1199, old: 1499, category: 'Boys', image: 'https://images.unsplash.com/photo-1519457431-44ccd64a579b?auto=format&fit=crop&w=500&q=85' },
  { id: 7, name: 'Velvet Lip Collection', price: 799, old: 999, category: 'Beauty', image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=500&q=85' },
  { id: 8, name: 'Everyday Edit Tote', price: 1499, old: 1899, category: 'Women', image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=500&q=85' },
];

let cart = [];
let activeCategory = 'All';
let selectedProduct = null;
const savedProducts = new Set();
let checkout = { step: 1, address: null, payment: null };
window.appliedPromo = 0;
const SHIPPING_FEE = 99;
const FREE_SHIPPING_OVER = 999;
const DB_USER = 'akriva_user';
const DB_ORDERS = 'akriva_orders';
const DB_ADDRESSES = 'akriva_addresses';
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN = 30;

let otpState = { phone: null, code: null, expiresAt: 0, attempts: 0 };
let otpCountdownTimer = null;

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};

const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let currentUser = store.get(DB_USER, null);

/* ---------- Delivery location ---------- */
let deliverTo = store.get('akriva_deliver_to', { city: 'New Delhi', pin: '110001' });
const LOC_PRESETS = {
  'New Delhi|110001': 'New Delhi 110001',
  'Mumbai|400001': 'Mumbai 400001',
  'Bengaluru|560001': 'Bengaluru 560001',
  'Pune|411001': 'Pune 411001',
  'Kolkata|700001': 'Kolkata 700001',
  'Hyderabad|500001': 'Hyderabad 500001',
};

function renderLocationLabel() {
  const label = document.getElementById('location-label');
  if (label) label.textContent = `${deliverTo.city} ${deliverTo.pin}`;
  const chips = document.querySelectorAll('.loc-chip');
  chips.forEach(chip => chip.classList.toggle('selected', LOC_PRESETS[chip.dataset.locPreset] === `${deliverTo.city} ${deliverTo.pin}`));
}

function openLocationModal() {
  const modal = document.getElementById('location-modal');
  document.getElementById('loc-pin').value = deliverTo.pin;
  document.getElementById('loc-city').value = deliverTo.city;
  renderLocationLabel();
  modal.classList.remove('hidden');
}

function closeLocationModal() {
  document.getElementById('location-modal').classList.add('hidden');
}

function applyLocation() {
  const pin = document.getElementById('loc-pin').value.trim();
  const city = document.getElementById('loc-city').value.trim();
  if (!/^\d{6}$/.test(pin)) { toast('Enter a valid 6-digit pincode'); return; }
  if (!city) { toast('Enter your city name'); return; }
  deliverTo = { city, pin };
  store.set('akriva_deliver_to', deliverTo);
  renderLocationLabel();
  closeLocationModal();
  const hasCustom = !LOC_PRESETS[`${city}|${pin}`];
  toast(hasCustom ? `Delivering to ${city} ${pin}` : `Delivering to ${city} ${pin}`);
}

/* ---------- Akriva support widget ---------- */
function openSupportDrawer() {
  document.getElementById('supportDrawer').classList.add('open');
  document.getElementById('drawerBackdrop').classList.add('active');
  seedChat();
  document.getElementById('chat-input').focus();
}

function closeSupportDrawer() {
  document.getElementById('supportDrawer').classList.remove('open');
  document.getElementById('drawerBackdrop').classList.remove('active');
}

function validateSupportForm() {
  const ready = document.getElementById('issueCategory').value !== ''
    && document.getElementById('userPhone').value.length === 10
    && document.getElementById('issueDetails').value.trim().length >= 10;
  document.getElementById('submitSupportBtn').disabled = !ready;
}

function handleSupportSubmit(event) {
  event.preventDefault();
  toast('Thank you! Your support request has been submitted successfully.');
  closeSupportDrawer();
  document.getElementById('akrivaSupportForm').reset();
  document.getElementById('submitSupportBtn').disabled = true;
}

/* ---------- Support chatbot ---------- */
const chatQuickChips = ['Track my order', 'Return & refund', 'Delivery time', 'Promo codes', 'Talk to a human'];
let chatSeeded = false;

const chatIntents = [
  { keys: ['payment', 'upi', 'cod', 'card', 'failed', 'paid'], reply: 'We accept UPI, Cards and COD. Payments confirm instantly. If money was deducted but the order did not go through, the amount auto-refunds in 3–5 working days — no action needed.' },
  { keys: ['return', 'exchange', 'refund', 'refund money', 'replace'], reply: 'Returns and exchanges are free within 7 days on most items. Go to Profile → Your orders, open the order and use Request return. Refunds settle back in 5–7 working days to the original payment method.' },
  { keys: ['order status', 'track', 'where is my order', 'delivery date', 'shipped', 'my order', 'not delivered'], reply: 'Your live order status shows under Profile → Your orders. Every order gets an AKR-XXXXXX id at checkout. If it has been 5+ working days and still no update, raise a ticket and we will check it personally.' },
  { keys: ['cancel', 'change address', 'edit order'], reply: 'Orders can be cancelled shortly after placing. To change the delivery address, raise a ticket quickly or call 1800-419-0000 and our team will assist before dispatch.' },
  { keys: ['size', 'fit'], reply: 'Most Akriva styles run true to size. Tap any product and pick a size (S–XL) before adding to bag. If you share your usual size and the style name, I can suggest the best pick.' },
  { keys: ['delivery', 'shipping', 'courier', 'when will', 'how long', 'ship'], reply: 'Shipping is free above ₹999, otherwise a flat ₹99. Standard delivery takes 3–5 working days. You can pick or change your delivery area at checkout.' },
  { keys: ['product', 'fabric', 'material', 'quality', 'wash', 'care'], reply: 'Every piece shows its category and price on the card — tap it for the full product view with Add to bag and Buy now. Share a product name and I can tell you more about it.' },
  { keys: ['promo', 'coupon', 'discount', 'offer', 'code'], reply: 'Try promo code AKRIVA10 for 10% off! On the bag screen, paste the code in the Promo box and tap Apply — the discount is applied instantly.' },
  { keys: ['human', 'agent', 'call', 'phone', 'talk'], reply: 'Absolutely — call our care team at 1800-419-0000, or switch to “Raise a ticket” and we will call you back on your number.' },
  { keys: ['hi', 'hello', 'hey', 'namaste', 'yo', 'help'], reply: 'Hi! I am Akrish, Akriva\'s support bot. Ask me about orders, returns, payments or delivery, or use a suggestion below. For detailed issues, switch to “Raise a ticket”.' },
  { keys: ['thank', 'thx', 'thanks', 'great', 'awesome', 'ok'], reply: 'Anytime! Is there anything else I can help you with?' },
];

function botReply(raw) {
  const t = raw.toLowerCase();
  const tokens = new Set(t.split(/\W+/).filter(Boolean));
  for (const intent of chatIntents) {
    const hit = intent.keys.some(k => (k.includes(' ') ? t.includes(k) : tokens.has(k)));
    if (hit) return intent.reply;
  }
  return 'I am still learning! I can help with orders, returns, payments, delivery and products. For anything detailed, switch to “Raise a ticket” and our team will follow up on your phone number.';
}

function appendChatMessage(text, from, asHtml = false) {
  const wrap = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${from}`;
  div.innerHTML = from === 'bot'
    ? `<span class="chat-avatar">A</span><div class="chat-bubble">${asHtml ? text : escapeHTML(text)}</div>`
    : `<div class="chat-bubble">${asHtml ? text : escapeHTML(text)}</div>`;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function sendChatText(text) {
  appendChatMessage(text, 'user');
  setTimeout(() => appendChatMessage(botReply(text), 'bot'), 300);
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  sendChatText(text);
  input.value = '';
}

function seedChat() {
  if (chatSeeded) return;
  chatSeeded = true;
  appendChatMessage('Hi! I am <b>Akrish</b>, Akriva\'s support bot. Ask me about <b>orders</b>, <b>returns</b>, <b>payments</b> or <b>delivery</b> — or use a suggestion below.', 'bot', true);
  document.getElementById('chat-chips').innerHTML = chatQuickChips.map(c => `<button type="button" class="chat-chip" data-chip="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join('');
}
const money = value => `₹${value.toLocaleString('en-IN')}`;
const ratings = {
  1: { v: 4.4, n: 231 }, 2: { v: 4.7, n: 180 }, 3: { v: 4.2, n: 96 },
  4: { v: 4.1, n: 214 }, 5: { v: 4.5, n: 87 }, 6: { v: 4.0, n: 64 },
  7: { v: 4.6, n: 312 }, 8: { v: 4.3, n: 147 }
};
const pctOff = (old, now) => (old && now < old) ? Math.round((1 - now / old) * 100) : 0;
const starRating = id => {
  const r = ratings[id] || { v: 4.0, n: 120 };
  const full = Math.floor(r.v);
  const half = r.v - full >= 0.4 && r.v - full < 0.9;
  const stars = '★'.repeat(full) + (half ? '☆' : '');
  return `${stars} <em class="pc-val">${r.v.toFixed(1)}</em> <span class="pc-rc">(${r.n.toLocaleString('en-IN')})</span>`;
};
const productCard = p => `<article class="product-card" data-product="${p.id}" role="button" tabindex="0" aria-label="View ${p.name}">
  <div class="pc-img">${p.badge ? `<span class="pc-badge">${p.badge}</span>` : ''}<img src="${p.image}" alt="${p.name}" loading="lazy"><button class="heart ${savedProducts.has(p.id) ? 'is-saved' : ''}" type="button" aria-label="Save ${p.name} to wishlist">${savedProducts.has(p.id) ? '♥' : '♡'}</button></div>
  <div class="pc-body">
    <div class="pc-rating">${starRating(p.id)}</div>
    <h3 class="pc-title">${p.name}</h3>
    <div class="pc-price"><span class="pc-new">${money(p.price)}</span>${p.old ? `<del>${money(p.old)}</del> <span class="pc-off">${pctOff(p.old, p.price)}% off</span>` : ''}</div>
    <div class="pc-meta">Free delivery over ₹999</div>
  </div>
</article>`;

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(x => x.classList.add('hidden'));
  document.getElementById(`${screen}-screen`).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(x => x.classList.toggle('selected', x.dataset.action === screen));
  window.scrollTo(0, 0);
}

function renderHome() {
  const deals = [...products.filter(p => p.badge), ...products.filter(p => !p.badge).slice(0, 3)];
  document.getElementById('deal-slider').innerHTML = deals.map(productCard).join('');
  const catGrid = [
    { name: 'Women', img: products[0].image },
    { name: 'Men', img: products[3].image },
    { name: 'Girls', img: products[4].image },
    { name: 'Boys', img: products[5].image },
    { name: 'Beauty', img: products[1].image },
    { name: 'View All', img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=300&q=85', all: true }
  ];
  document.getElementById('cat-grid').innerHTML = catGrid.map(c => `<button class="amz-cat" type="button" data-action="${c.all ? 'all' : 'category'}" data-category="${c.name}"><span class="amz-cat-img" style="background-image:url('${c.img}')"></span><b>${c.name}</b></button>`).join('');
  const trend = [4, 1, 8, 3, 7, 2];
  document.getElementById('trend-slider').innerHTML = trend.map(id => products.find(p => p.id === id)).filter(Boolean).map(productCard).join('');
  document.getElementById('products').innerHTML = [5, 3, 7, 8].map(id => products.find(p => p.id === id)).map(productCard).join('');
}

const filterState = { price: 'any', disc: 0, rating: 0 };

function getCatalogProducts() {
  const price = filterState.price;
  const [pMin, pMax] = price === 'any' ? [null, null] : price === '3000+' ? [3000, null] : price.split('-').map(Number);
  let list = products.filter(p => activeCategory === 'All' || p.category === activeCategory);
  if (pMin !== null) list = list.filter(p => p.price >= pMin && (pMax === null || p.price <= pMax));
  if (filterState.disc) list = list.filter(p => pctOff(p.old, p.price) >= filterState.disc);
  if (filterState.rating) list = list.filter(p => (ratings[p.id]?.v || 4) >= filterState.rating);
  const s = document.getElementById('sort-select')?.value || 'relevance';
  if (s === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
  else if (s === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
  else if (s === 'savings') list = [...list].sort((a, b) => pctOff(b.old, b.price) - pctOff(a.old, a.price));
  else if (s === 'rating') list = [...list].sort((a, b) => (ratings[b.id]?.v || 4) - (ratings[a.id]?.v || 4));
  return list;
}

function filterActiveCount() {
  return (filterState.price !== 'any' ? 1 : 0) + (filterState.disc ? 1 : 0) + (filterState.rating ? 1 : 0);
}

function syncFilterBadge() {
  const fc = document.getElementById('filter-count');
  if (!fc) return;
  const n = filterActiveCount();
  if (n) { fc.textContent = n; fc.classList.remove('hidden'); }
  else fc.classList.add('hidden');
}

function openFilterModal() {
  document.querySelector(`input[name="f-price"][value="${filterState.price}"]`).checked = true;
  document.querySelector(`input[name="f-disc"][value="${filterState.disc}"]`).checked = true;
  document.querySelector(`input[name="f-rating"][value="${filterState.rating}"]`).checked = true;
  document.getElementById('filter-modal').classList.remove('hidden');
}

function closeFilterModal() {
  document.getElementById('filter-modal').classList.add('hidden');
}

function readFilterInputs() {
  const v = name => document.querySelector(`input[name="${name}"]:checked`)?.value || 'any';
  filterState.price = v('f-price');
  filterState.disc = Number(v('f-disc'));
  filterState.rating = Number(v('f-rating'));
}

function applyFilters() {
  readFilterInputs();
  closeFilterModal();
  syncFilterBadge();
  renderCatalog();
}

function resetFilters() {
  filterState.price = 'any';
  filterState.disc = 0;
  filterState.rating = 0;
  document.querySelector('input[name="f-price"][value="any"]').checked = true;
  document.querySelector('input[name="f-disc"][value="0"]').checked = true;
  document.querySelector('input[name="f-rating"][value="0"]').checked = true;
  syncFilterBadge();
  renderCatalog();
}

function renderCatalog() {
  const display = getCatalogProducts();
  document.getElementById('catalog-title').textContent = activeCategory === 'All' ? 'All collections' : (activeCategory.endsWith('s') ? `${activeCategory}' collection` : `${activeCategory}'s collection`);
  document.getElementById('filters').innerHTML = ['All', 'Women', 'Men', 'Girls', 'Boys', 'Beauty'].map(c => `<button class="filter ${c === activeCategory ? 'selected' : ''}" data-filter="${c}">${c}</button>`).join('');
  syncFilterBadge();
  document.getElementById('catalog-count').textContent = `${display.length} ${display.length === 1 ? 'piece' : 'pieces'}`;
  document.getElementById('catalog-products').innerHTML = display.length ? display.map(productCard).join('') : emptyState('No pieces found', 'Try clearing filters to see everything.');
}

function renderExplore() {
  const lookbookImg = 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=500';
  const cards = [
    `<article class="explore-card tall" data-lookbook role="button" tabindex="0" aria-label="Summer Resort Lookbook"><img src="${lookbookImg}" alt="Summer Resort Lookbook"><div class="card-overlay"><h4 class="card-title">Summer Resort Lookbook</h4><span class="card-price">Explore all 16 pieces</span></div></article>`,
    `<article class="explore-card" data-product="1" role="button" tabindex="0" aria-label="View Rose Drape Saree"><img src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=500" alt="Rose Drape Saree"><div class="card-overlay"><h4 class="card-title">Rose Drape Saree</h4><span class="card-price">₹2,499 · BESTSELLER</span></div></article>`,
    `<article class="explore-card" data-product="2" role="button" tabindex="0" aria-label="View Soft Glam Kit"><img src="https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=500" alt="Soft Glam Kit"><div class="card-overlay"><h4 class="card-title">Soft Glam Kit</h4><span class="card-price">₹1,299 · NEW</span></div></article>`,
    `<article class="explore-card" data-product="4" role="button" tabindex="0" aria-label="View Classic Resort Shirt"><img src="https://images.unsplash.com/photo-1598554747436-c9293d6a588f?w=500" alt="Classic Resort Shirt"><div class="card-overlay"><h4 class="card-title">Classic Resort Shirt</h4><span class="card-price">₹1,699</span></div></article>`,
    ...products.filter(p => ![1, 2, 4].includes(p.id)).map(p => `<article class="explore-card" data-product="${p.id}" role="button" tabindex="0" aria-label="View ${p.name}"><img src="${p.image}" alt="${p.name}"><div class="card-overlay"><h4 class="card-title">${p.name}</h4><span class="card-price">${money(p.price)}${p.badge ? ` · ${p.badge}` : ''}</span></div></article>`),
  ];
  document.getElementById('explore-grid').innerHTML = cards.join('');
}

function updateCart() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll('.cart-count').forEach(x => x.textContent = count);
}

function renderCart() {
  const items = document.getElementById('cart-items');
  const footer = document.getElementById('cart-footer');
  if (!cart.length) {
    items.innerHTML = emptyState('Your bag is waiting', 'Add your Akriva favourites here.', '<button class="go-shop" type="button" data-action="home">Start shopping</button>');
    footer.innerHTML = '';
    return;
  }
  items.innerHTML = cart.map(item => `<article class="cart-item"><div class="cart-thumb" style="background-image:url('${item.image}')"></div><div class="cart-detail"><small>${item.category.toUpperCase()}</small><h3>${item.name}</h3><p class="cart-price">${money(item.price * item.qty)}</p><div class="quantity"><button data-quantity="${item.id}" data-change="-1" aria-label="Decrease">−</button><b>${item.qty}</b><button data-quantity="${item.id}" data-change="1" aria-label="Increase">+</button></div><button class="cart-remove" type="button" data-quantity="${item.id}" data-change="remove" aria-label="Remove ${item.name} from bag">Delete</button></div></article>`).join('');
  const { subtotal, shipping, discount, total } = cartTotals();
  const progress = Math.min(100, Math.round(subtotal / FREE_SHIPPING_OVER * 100));
  const toGo = FREE_SHIPPING_OVER - subtotal;
  const progressHtml = toGo > 0
    ? `<div class="ship-progress"><div class="ship-bar"><span style="width:${progress}%"></span></div><p class="ship-msg">Add <b>${money(toGo)}</b> more for <b>FREE Delivery</b></p></div>`
    : `<div class="ship-progress"><div class="ship-bar full"><span style="width:100%"></span></div><p class="ship-msg ok">Your order is eligible for FREE Delivery!</p></div>`;
  footer.innerHTML = `${progressHtml}<div class="promo-row"><input id="promo-input" type="text" placeholder="Promo code — try AKRIVA10" autocomplete="off"><button type="button" data-promo>Apply</button></div><div class="price-box"><h4>Price details</h4><div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div><div class="summary-row"><span>Delivery</span><span>${shipping ? money(shipping) : '<b class="free">FREE</b>'}</span></div>${discount ? `<div class="summary-row save"><span>Promo (AKRIVA10)</span><span>− ${money(discount)}</span></div>` : ''}<div class="summary-row total"><span>Total</span><span>${money(total)}</span></div></div><button class="checkout" data-checkout>Proceed to check out →</button>`;
}

function emptyState(bold, sub, button = '') {
  return `<div class="empty"><b>${bold}</b>${sub}${button}</div>`;
}

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.add('hidden'), 2100);
}

function addItem(product) {
  const inCart = cart.find(x => x.id === product.id);
  if (inCart) inCart.qty += 1;
  else cart.push({ ...product, qty: 1 });
  updateCart();
  toast(`${product.name} added to your bag`);
}

function openProduct(id) {
  selectedProduct = products.find(p => p.id === Number(id));
  if (!selectedProduct) return;
  document.getElementById('modal-image').style.backgroundImage = `url('${selectedProduct.image}')`;
  document.getElementById('modal-category').textContent = selectedProduct.category.toUpperCase();
  document.getElementById('modal-name').textContent = selectedProduct.name;
  document.getElementById('modal-rating').innerHTML = `${starRating(selectedProduct.id)}<span class="modal-badge">${selectedProduct.badge ? `${selectedProduct.badge} · ` : ''}Akriva choice</span>`;
  document.getElementById('modal-price').innerHTML = `${money(selectedProduct.price)}${selectedProduct.old ? ` <del>${money(selectedProduct.old)}</del>` : ''}${selectedProduct.old ? ` <span class="pc-off">${pctOff(selectedProduct.old, selectedProduct.price)}% off</span>` : ''}`;
  const bought = document.getElementById('modal-bought');
  if (bought) bought.textContent = `🔥 ${2 + (selectedProduct.id * 3) % 9} people bought this today`;
  document.getElementById('product-modal').classList.remove('hidden');
}

function syncSavedButtons() {
  document.querySelectorAll('.heart').forEach(button => {
    const card = button.closest('[data-product]');
    if (!card) return;
    const saved = savedProducts.has(Number(card.dataset.product));
    button.classList.toggle('is-saved', saved);
    button.textContent = saved ? '♥' : '♡';
  });
}

function renderSearchResults(query = '') {
  const normalized = query.trim().toLowerCase();
  const matches = normalized
    ? products.filter(product => `${product.name} ${product.category}`.toLowerCase().includes(normalized))
    : products;
  document.getElementById('popular-searches').classList.toggle('hidden', Boolean(normalized));
  document.getElementById('result-count').textContent = normalized ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'} for “${query.trim()}”` : 'Curated for you';
  document.getElementById('search-results').innerHTML = matches.length
    ? matches.map(productCard).join('')
    : emptyState('No exact match yet', 'Try searching for fashion, beauty, dresses or shirts.');
  syncSavedButtons();
}

function openSearch() {
  showScreen('search');
  document.getElementById('search-input').value = '';
  renderSearchResults();
  setTimeout(() => document.getElementById('search-input').focus(), 0);
}

function renderHomeSearch(query = '') {
  const normalized = query.trim().toLowerCase();
  const matches = normalized
    ? products.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(normalized))
    : products;
  document.getElementById('home-popular-searches').classList.toggle('hidden', Boolean(normalized));
  document.getElementById('home-result-count').textContent = normalized ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'} for “${query.trim()}”` : 'Curated for you';
  document.getElementById('home-search-results').innerHTML = matches.length
    ? matches.map(productCard).join('')
    : emptyState('No exact match yet', 'Try searching for fashion, beauty, dresses or shirts.');
  syncSavedButtons();
}

function setHomeSearchMode(on) {
  const input = document.getElementById('home-search');
  document.getElementById('home-screen').classList.toggle('searching', on);
  document.getElementById('home-search-panel').classList.toggle('hidden', !on);
  document.getElementById('home-search-clear').classList.toggle('hidden', !on || !input.value);
  if (on) window.scrollTo(0, 0);
}

const wishlistCard = p => `<article class="wishlist-card" data-product="${p.id}" role="button" tabindex="0" aria-label="View ${p.name}">
  <div class="wishlist-thumb" style="background-image:url('${p.image}')"><span class="badge">${p.badge || 'LOVED'}</span><button class="heart is-saved" type="button" aria-label="Remove ${p.name} from saved loves">♥</button></div>
  <div class="wishlist-info"><small>${p.category.toUpperCase()}</small><h3>${p.name}</h3><p>${money(p.price)}${p.old ? ` <del>${money(p.old)}</del>` : ''}</p><span class="wish-save">priced for keeps</span><button class="wish-add" type="button" data-wish-add="${p.id}">Add to bag <b>+</b></button></div>
</article>`;

function renderWishlist() {
  const saved = products.filter(product => savedProducts.has(product.id));
  const tools = document.getElementById('wishlist-tools');
  if (saved.length) {
    const total = saved.reduce((sum, p) => sum + p.price, 0);
    tools.innerHTML = `<div class="wishlist-stats"><span>${saved.length} ${saved.length === 1 ? 'piece' : 'pieces'} loved</span><b>${money(total)}</b></div><div class="wishlist-btns"><button type="button" data-wish-all>Add all to bag →</button><button type="button" data-wish-share>Share my pick</button></div>`;
  } else {
    tools.innerHTML = '';
  }
  document.getElementById('wishlist-products').innerHTML = saved.length
    ? saved.map(wishlistCard).join('')
    : emptyState('Your edit is waiting', 'Tap the heart on any product to save it here.');
  syncSavedButtons();
}

function openWishlist() {
  renderWishlist();
  showScreen('wishlist');
}

function renderProfile() {
  const wrap = document.getElementById('profile-welcome');
  if (currentUser && currentUser.phone) {
    wrap.innerHTML = `<span class="profile-avatar">✓</span><div><p>LOGGED IN</p><h2>Signed in</h2><p class="profile-sub">☏ +91 ${escapeHTML(currentUser.phone.slice(0, 2))}XXXXX${escapeHTML(currentUser.phone.slice(7))}</p><button type="button" data-sign-out>Sign out</button></div>`;
  } else {
    wrap.innerHTML = `<span class="profile-avatar">A</span><div><p>WELCOME TO AKRIVA</p><h2>Create your account</h2><button type="button" id="sign-in-button">Sign in or create account ›</button></div>`;
  }
}

function openProfile() {
  renderProfile();
  showScreen('profile');
}

function renderSignin() {
  document.getElementById('signin-content').innerHTML = `<p class="support-intro">Enter your mobile number to sign in to your Akriva account. Your orders, addresses and wishlist sync to this account.</p>
    <form class="checkout-form" id="signin-form" novalidate>
      <label class="field"><span>Mobile number</span><input id="si-phone" type="tel" placeholder="10-digit number" maxlength="10" inputmode="numeric" autocomplete="tel"></label>
      <button class="checkout" type="submit">Send OTP →</button>
    </form>`;
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskPhone(phone) {
  return '+91 ' + phone.slice(0, 2) + 'XXXXX' + phone.slice(7);
}

function requestOtp() {
  const phone = document.getElementById('si-phone').value.replace(/\D/g, '');
  const phoneValid = /^[6-9]\d{9}$/.test(phone);
  document.getElementById('si-phone').classList.toggle('invalid', phone && !phoneValid);
  if (!phone) { toast('Please enter your mobile number'); return; }
  if (!phoneValid) { toast('Enter a valid 10-digit mobile number'); return; }
  otpState = { phone, code: generateOtpCode(), expiresAt: Date.now() + OTP_EXPIRY_MS, attempts: OTP_MAX_ATTEMPTS };
  renderOtpStep();
  toast(`OTP sent to ${maskPhone(phone)}`);
}

function renderOtpStep() {
  clearTimeout(otpCountdownTimer);
  const boxes = Array.from({ length: 6 }, (_, i) =>
    `<input class="otp-input" type="tel" maxlength="1" inputmode="numeric" autocomplete="one-time-code" aria-label="OTP digit ${i + 1}">`).join('');
  document.getElementById('signin-content').innerHTML = `
    <p class="support-intro">Enter the 6-digit code sent to <b>${maskPhone(otpState.phone)}</b>.</p>
    <div class="otp-boxes" id="otp-boxes">${boxes}</div>
    <button class="checkout" type="button" id="otp-verify-btn">Verify OTP →</button>
    <div class="otp-footer">
      <button class="link-btn" type="button" id="otp-resend-btn" disabled>Resend code in <b id="otp-countdown">${OTP_RESEND_COOLDOWN}</b>s</button>
      <button class="link-btn" type="button" id="otp-change-btn">Change number</button>
    </div>
    <div class="dev-otp-chip">Demo mode — no SMS. Your OTP is <b id="otp-dev-code"></b></div>`;
  document.getElementById('otp-dev-code').textContent = otpState.code;
  const inputs = document.querySelectorAll('.otp-input');
  if (inputs[0]) inputs[0].focus();
  startOtpCountdown(OTP_RESEND_COOLDOWN);
}

function startOtpCountdown(seconds) {
  clearTimeout(otpCountdownTimer);
  const span = document.getElementById('otp-countdown');
  const btn = document.getElementById('otp-resend-btn');
  let remaining = seconds;
  span.textContent = remaining;
  btn.disabled = true;
  const tick = () => {
    remaining -= 1;
    if (remaining > 0) {
      span.textContent = remaining;
      otpCountdownTimer = setTimeout(tick, 1000);
    } else {
      span.textContent = '0';
      btn.disabled = false;
      btn.innerHTML = 'Resend code';
    }
  };
  otpCountdownTimer = setTimeout(tick, 1000);
}

function getOtpDigits() {
  return Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');
}

function verifyOtp() {
  const digits = getOtpDigits();
  if (digits.length !== 6) { toast('Enter the full 6-digit code'); return; }
  if (!otpState || !otpState.code) { toast('Please request a fresh OTP'); return; }
  if (Date.now() > otpState.expiresAt) { toast('OTP has expired. Request a new one.'); return; }
  if (otpState.attempts <= 0) { toast('Too many wrong attempts. Request a new OTP.'); return; }
  if (digits === otpState.code) {
    currentUser = { phone: otpState.phone };
    store.set(DB_USER, currentUser);
    toast(`Verified! Welcome to Akriva 🎉`);
    openProfile();
  } else {
    otpState.attempts -= 1;
    const left = otpState.attempts;
    document.querySelectorAll('.otp-input').forEach(i => { i.value = ''; });
    const first = document.querySelector('.otp-input');
    if (first) first.focus();
    toast(left > 0 ? `Wrong OTP. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.` : 'Too many wrong attempts. Request a new OTP.');
  }
}

function resendOtp() {
  otpState.code = generateOtpCode();
  otpState.expiresAt = Date.now() + OTP_EXPIRY_MS;
  otpState.attempts = OTP_MAX_ATTEMPTS;
  renderOtpStep();
  toast(`New OTP sent to ${maskPhone(otpState.phone)}`);
}

function openSignin() {
  renderSignin();
  showScreen('signin');
}

function signOut() {
  currentUser = null;
  store.set(DB_USER, null);
  clearTimeout(otpCountdownTimer);
  otpState = { phone: null, code: null, expiresAt: 0, attempts: 0 };
  toast('Signed out of Akriva');
  openProfile();
}

function renderOrders() {
  const list = document.getElementById('orders-list');
  const orders = store.get(DB_ORDERS, []).sort((a, b) => b.date - a.date);
  if (!orders.length) {
    list.innerHTML = emptyState('No orders yet', 'Your orders will appear here after you check out.');
    return;
  }
  list.innerHTML = orders.map(o => `<article class="order-card">
    <div class="order-head">
      <div><b>#${o.id}</b><small>${new Date(o.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${o.paymentName}</small></div>
      <span class="order-status">${o.status}</span>
    </div>
    <div class="order-items">${o.items.slice(0, 2).map(i => `<div class="mini-item"><img src="${i.image}" alt="${i.name}"><span>${i.name} × ${i.qty}</span></div>`).join('')}${o.items.length > 2 ? `<p class="more-items">+${o.items.length - 2} more item${o.items.length - 2 > 1 ? 's' : ''}</p>` : ''}</div>
    <div class="order-foot"><span>${money(o.total)}</span><small>Deliver to ${escapeHTML(o.address.city)} · ${o.address.pin}</small></div>
  </article>`).join('');
}

function openOrders() {
  renderOrders();
  showScreen('orders');
}

function renderAddresses() {
  const list = document.getElementById('address-list');
  const addresses = store.get(DB_ADDRESSES, []);
  list.innerHTML = addresses.length
    ? addresses.map((a, i) => `<article class="address-card"><div class="address-chip"><span>⌖</span><div><b>${escapeHTML(a.name)} · ${a.phone}</b><p>${escapeHTML(a.address)}, ${escapeHTML(a.city)} — ${a.pin}</p></div></div><button class="link-btn" type="button" data-remove-address="${i}">Remove</button></article>`).join('')
    : emptyState('No saved addresses', 'Addresses you use at checkout are saved here automatically.');
  document.getElementById('address-form-wrap').classList.add('hidden');
}

function openAddresses() {
  renderAddresses();
  showScreen('addresses');
}

function openAddressForm() {
  const wrap = document.getElementById('address-form-wrap');
  wrap.classList.remove('hidden');
  wrap.innerHTML = `<div class="checkout-step-label">ADD A DELIVERY ADDRESS</div>
    <form class="checkout-form" id="new-address-form" novalidate>
      <label class="field"><span>Full name</span><input id="nd-name" type="text" placeholder="Full name" autocomplete="name"></label>
      <label class="field"><span>Mobile number</span><input id="nd-phone" type="tel" placeholder="10-digit number" maxlength="10" autocomplete="tel"></label>
      <label class="field"><span>Address</span><textarea id="nd-address" rows="2" placeholder="House, street, landmark"></textarea></label>
      <div class="field-row">
        <label class="field"><span>City</span><input id="nd-city" type="text" placeholder="City"></label>
        <label class="field"><span>Pincode</span><input id="nd-pin" type="text" placeholder="6-digit" maxlength="6" inputmode="numeric"></label>
      </div>
      <button class="checkout" type="button" data-save-address>Save address →</button>
    </form>`;
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function saveNewAddress() {
  const name = document.getElementById('nd-name').value.trim();
  const phone = document.getElementById('nd-phone').value.trim();
  const address = document.getElementById('nd-address').value.trim();
  const city = document.getElementById('nd-city').value.trim();
  const pin = document.getElementById('nd-pin').value.trim();
  if (!name || !/^[6-9]\d{9}$/.test(phone) || !address || !city || !/^\d{6}$/.test(pin)) {
    toast('Please fill all address details correctly');
    return;
  }
  const addresses = store.get(DB_ADDRESSES, []);
  addresses.push({ name, phone, address, city, pin });
  store.set(DB_ADDRESSES, addresses);
  toast('Address saved');
  renderAddresses();
}

function renderSupport() {
  const faqs = [
    ['How do I return or exchange an item?', 'You have 15 days from delivery to raise a return. Go to Your Orders → select the order → Return or exchange, and we\'ll arrange a free pickup.'],
    ['When will my order be delivered?', 'Orders ship within 24 hours and typically reach you in 3–5 working days. City deliveries can arrive faster. You will get a tracking update on your mobile.'],
    ['How do I track my order?', 'Open Your Orders to see the latest status of every order placed with your account.'],
    ['What payment methods are accepted?', 'We accept UPI (GPay, PhonePe, Paytm), credit/debit cards, and Cash on Delivery. 100% secure checkout.'],
    ['Is there cash on delivery?', 'Yes. COD is available on all orders with a ₹99 delivery fee for orders below ₹999.'],
  ];
  document.getElementById('support-content').innerHTML = `<p class="support-intro">We\'re here to help with anything Akriva. Browse the FAQs below or reach out to our team.</p>
    <div class="faq">
      ${faqs.map((f, i) => `<div class="faq-item"><button type="button" data-faq="${i}">${f[0]}<i>+</i></button><p class="faq-a hidden">${f[1]}</p></div>`).join('')}
    </div>
    <div class="support-contacts">
      <button type="button" data-support="call"><span>☏</span><div><b>Call us</b><small>1800-419-0000 · 9am–9pm</small></div><i>›</i></button>
      <button type="button" data-support="whatsapp"><span>✆</span><div><b>WhatsApp us</b><small>Chat with our stylists</small></div><i>›</i></button>
      <button type="button" data-support="email"><span>✉</span><div><b>Email us</b><small>care@akriva.in</small></div><i>›</i></button>
    </div>`;
}

function openSupport() {
  renderSupport();
  showScreen('support');
}

function cartTotals() {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FEE;
  const discount = window.appliedPromo || 0;
  const total = subtotal - discount + shipping;
  return { subtotal, shipping, discount, total };
}

function cartSummary() {
  const { subtotal, shipping, discount, total } = cartTotals();
  return `<div class="order-summary">
    <p class="summary-head">ORDER SUMMARY</p>
    <div class="summary-row"><span>Subtotal (${cart.length} item${cart.length === 1 ? '' : 's'})</span><span>${money(subtotal)}</span></div>
    ${discount ? `<div class="summary-row ok"><span>Promo applied</span><span>−${money(discount)}</span></div>` : ''}
    <div class="summary-row"><span>Delivery</span><span>${shipping ? money(shipping) : 'FREE'}</span></div>
    <div class="summary-row total"><span>Total payable</span><span>${money(total)}</span></div>
  </div>`;
}

function checkoutAddressForm() {
  const a = checkout.address || {};
  return `<div class="checkout-step-label">STEP 1 OF 2 — DELIVERY</div>
    <form class="checkout-form" id="checkout-address-form" novalidate>
      <label class="field"><span>Full name</span><input id="addr-name" type="text" placeholder="e.g. Asha Verma" value="${a.name || ''}" autocomplete="name"></label>
      <label class="field"><span>Mobile number</span><input id="addr-phone" type="tel" placeholder="10-digit number" value="${a.phone || ''}" maxlength="10" autocomplete="tel"></label>
      <label class="field"><span>Address</span><textarea id="addr-address" rows="2" placeholder="House, street, landmark">${a.address || ''}</textarea></label>
      <div class="field-row">
        <label class="field"><span>City</span><input id="addr-city" type="text" placeholder="City" value="${a.city || ''}" autocomplete="address-level2"></label>
        <label class="field"><span>Pincode</span><input id="addr-pin" type="text" placeholder="6-digit" value="${a.pin || ''}" maxlength="6" inputmode="numeric" autocomplete="postal-code"></label>
      </div>
      <button class="checkout" type="button" data-checkout-next>Continue to payment →</button>
    </form>`;
}

function checkoutPaymentView() {
  const a = checkout.address;
  const payOptions = [
    { id: 'cod', icon: '₹', title: 'Cash on Delivery', note: 'Pay when your order arrives' },
    { id: 'upi', icon: '⌘', title: 'UPI', note: 'GPay · PhonePe · Paytm' },
    { id: 'card', icon: '♠', title: 'Credit / Debit Card', note: 'Visa · Mastercard · RuPay' },
  ];
  return `<div class="checkout-step-label">STEP 2 OF 2 — PAYMENT</div>
    <div class="address-chip"><span>⌖</span><div><b>${escapeHTML(a.name)} · ${escapeHTML(a.phone)}</b><p>${escapeHTML(a.address)}, ${escapeHTML(a.city)} — ${escapeHTML(a.pin)}</p></div><button type="button" data-checkout-edit aria-label="Edit address">✎</button></div>
    <div class="pay-options">
      ${payOptions.map(p => `<button type="button" class="pay-option ${checkout.payment === p.id ? 'selected' : ''}" data-payment="${p.id}"><span class="pay-icon">${p.icon}</span><span class="pay-text"><b>${p.title}</b><small>${p.note}</small></span><i>${checkout.payment === p.id ? '●' : '○'}</i></button>`).join('')}
    </div>
    ${cartSummary()}
    <button class="checkout" type="button" data-place-order>Place order securely →</button>
    <p class="secure-note">✓ 100% secure checkout · Free returns on eligible items</p>`;
}

function checkoutConfirmView(orderId, total) {
  return `<div class="order-confirm">
    <span class="confirm-mark">✓</span>
    <b>Order placed!</b>
    <p>Thank you for shopping with Akriva. Your order <strong>#${orderId}</strong> of <strong>${money(total)}</strong> is confirmed.</p>
    <p class="confirm-note">Order details have been sent to your mobile & email. We'll notify you at every step.</p>
    <div class="confirm-details"><span>Payment</span><b>${checkout.payment === 'cod' ? 'Cash on Delivery' : checkout.payment === 'upi' ? 'UPI' : 'Card'}</b></div>
    <button class="checkout" type="button" data-continue-shopping>Continue shopping →</button>
  </div>`;
}

function renderCheckout() {
  const container = document.getElementById('checkout-content');
  if (checkout.step === 1) container.innerHTML = checkoutAddressForm();
  else if (checkout.step === 2) container.innerHTML = checkoutPaymentView();
  window.scrollTo(0, 0);
}

function openCheckout() {
  if (!cart.length) { toast('Your bag is empty'); return; }
  checkout.step = 1;
  checkout.address = checkout.address || null;
  checkout.payment = null;
  renderCheckout();
  showScreen('checkout');
}

function validateAddress() {
  const name = document.getElementById('addr-name').value.trim();
  const phone = document.getElementById('addr-phone').value.trim();
  const address = document.getElementById('addr-address').value.trim();
  const city = document.getElementById('addr-city').value.trim();
  const pin = document.getElementById('addr-pin').value.trim();
  const phoneValid = /^[6-9]\d{9}$/.test(phone);
  const pinValid = /^\d{6}$/.test(pin);
  document.getElementById('addr-name').classList.toggle('invalid', !name);
  document.getElementById('addr-phone').classList.toggle('invalid', !phoneValid);
  document.getElementById('addr-address').classList.toggle('invalid', !address);
  document.getElementById('addr-city').classList.toggle('invalid', !city);
  document.getElementById('addr-pin').classList.toggle('invalid', !pinValid);
  if (!name) { toast('Please enter your full name'); return; }
  if (!phoneValid) { toast('Enter a valid 10-digit mobile number'); return; }
  if (!address) { toast('Please enter your delivery address'); return; }
  if (!city) { toast('Please enter your city'); return; }
  if (!pinValid) { toast('Enter a valid 6-digit pincode'); return; }
  checkout.address = { name, phone, address, city, pin };
  checkout.step = 2;
  renderCheckout();
}

function placeOrder() {
  const { total } = cartTotals();
  const orderId = 'AKR-' + Math.floor(100000 + Math.random() * 900000);
  const orderedItems = cart.map(i => ({ name: i.name, image: i.image, price: i.price, qty: i.qty }));
  const order = {
    id: orderId,
    date: Date.now(),
    items: orderedItems,
    total,
    paymentName: checkout.payment === 'cod' ? 'Cash on Delivery' : checkout.payment === 'upi' ? 'UPI' : 'Card',
    status: 'Confirmed',
    address: checkout.address,
  };
  const orders = store.get(DB_ORDERS, []);
  orders.unshift(order);
  store.set(DB_ORDERS, orders);

  const addresses = store.get(DB_ADDRESSES, []);
  const a = checkout.address;
  if (!addresses.some(x => x.phone === a.phone && x.address === a.address)) {
    addresses.push(a);
    store.set(DB_ADDRESSES, addresses);
  }

  document.getElementById('checkout-content').innerHTML = checkoutConfirmView(orderId, total);
  checkout.step = 0;
  cart = [];
  window.appliedPromo = 0;
  updateCart();
  window.scrollTo(0, 0);
}

/* ---------- Flash sale timer ---------- */
const SALE_MS = 5 * 60 * 60 * 1000 + 30 * 60 * 1000;
const pad2 = n => String(n).padStart(2, '0');

function saleEndTime() {
  let end = Number(localStorage.getItem('akriva_sale_end'));
  const now = Date.now();
  if (!end || end <= now) {
    end = now + SALE_MS;
    localStorage.setItem('akriva_sale_end', end);
  }
  return end;
}

function renderSaleTimer() {
  const el = document.getElementById('sale-timer');
  if (!el) return;
  const diff = Math.max(0, Math.floor((saleEndTime() - Date.now()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  el.textContent = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  if (diff === 0) localStorage.removeItem('akriva_sale_end');
}

/* ---------- Activity ticker ---------- */
const tickerNames = ['Priya', 'Ananya', 'Riya', 'Sneha', 'Meera', 'Kavya', 'Ishita', 'Divya', 'Nikhil', 'Aarav'];
const tickerCities = ['Delhi', 'Mumbai', 'Bengaluru', 'Pune', 'Kolkata', 'Hyderabad', 'Jaipur', 'Chennai'];
let tickerIndex = 0;

function tickerMessage(product) {
  const name = tickerNames[Math.floor(Math.random() * tickerNames.length)];
  const city = tickerCities[Math.floor(Math.random() * tickerCities.length)];
  const mins = 1 + Math.floor(Math.random() * 58);
  return `${name} from ${city} just picked ${product.name} · ${mins} min ago`;
}

function startTicker() {
  const el = document.getElementById('ticker-text');
  if (!el) return;
  const pool = products.filter(p => p.badge).length ? products.filter(p => p.badge) : products;
  const swap = () => {
    el.textContent = tickerMessage(pool[tickerIndex++ % pool.length]);
    el.style.transition = 'opacity 0.25s ease';
    el.style.opacity = 1;
  };
  el.style.opacity = 0;
  setTimeout(swap, 250);
  setInterval(() => {
    el.style.opacity = 0;
    setTimeout(swap, 250);
  }, 6000);
}

/* ---------- Share look ---------- */
function shareText() {
  const saved = products.filter(p => savedProducts.has(p.id));
  const names = saved.length ? saved.slice(0, 5).map(p => p.name).join(', ') : 'Akriva picks';
  return `My Akriva edit 💜 ${names}${saved.length > 5 ? ' & more' : ''} — shop at https://akriva787.github.io/akrivabeautyandfashion/`;
}

function shareLook(extra = '') {
  const text = extra ? `${extra}\n\n${shareText()}` : shareText();
  if (navigator.share) {
    navigator.share({ title: 'Akriva edit', text }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('Share text copied to clipboard')).catch(() => toast('Share text ready — copy it below?'));
  } else {
    toast('Share: select & copy the wishlist link');
  }
}

document.addEventListener('click', event => {
  if (event.target.closest('#chatBubble')) { openSupportDrawer(); return; }

  if (event.target.closest('#closeDrawerBtn') || event.target.closest('#drawerBackdrop')) { closeSupportDrawer(); return; }

  const chatTab = event.target.closest('[data-chat-tab]');
  if (chatTab) {
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.toggle('active', t === chatTab));
    const isChat = chatTab.dataset.chatTab === 'chat';
    document.getElementById('chat-panel').classList.toggle('hidden', !isChat);
    document.getElementById('akrivaSupportForm').classList.toggle('hidden', isChat);
    if (isChat) {
      seedChat();
      document.getElementById('chat-input').focus();
    }
    return;
  }

  const chip = event.target.closest('[data-chip]');
  if (chip) {
    sendChatText(chip.dataset.chip);
    return;
  }

  if (event.target.closest('#chat-send')) { sendChatMessage(); return; }

  if (event.target.closest('.location')) {
    openLocationModal();
    return;
  }

  if (event.target.closest('#location-modal')) {
    if (event.target.closest('[data-location-save]')) { applyLocation(); return; }
    if (event.target.closest('[data-location-close]')) { closeLocationModal(); return; }
    const preset = event.target.closest('[data-loc-preset]');
    if (preset) {
      const [city, pin] = preset.dataset.locPreset.split('|');
      document.getElementById('loc-city').value = city;
      document.getElementById('loc-pin').value = pin;
      renderLocationLabel();
      return;
    }
    if (event.target.id === 'location-modal') { closeLocationModal(); return; }
  }

  const heart = event.target.closest('.heart');
  if (heart) {
    event.preventDefault();
    event.stopPropagation();
    const card = heart.closest('[data-product]');
    const id = Number(card.dataset.product);
    if (savedProducts.has(id)) {
      savedProducts.delete(id);
      toast('Removed from your saved loves');
    } else {
      savedProducts.add(id);
      toast('Saved to your Akriva edit ♡');
    }
    syncSavedButtons();
    const wishlistScreen = document.getElementById('wishlist-screen');
    if (wishlistScreen && !wishlistScreen.classList.contains('hidden')) renderWishlist();
    return;
  }

  const mood = event.target.closest('[data-mood]');
  if (mood) {
    document.querySelectorAll('.mood-card').forEach(card => card.classList.toggle('selected', card === mood));
    const hero = document.getElementById('hero');
    hero.classList.remove('mood-soft-hero', 'mood-glow-hero', 'mood-bold-hero');
    hero.classList.add(mood.dataset.mood === 'soft' ? 'mood-soft-hero' : mood.dataset.mood === 'glow' ? 'mood-glow-hero' : 'mood-bold-hero');
    document.getElementById('hero-eyebrow').textContent = mood.dataset.label;
    document.getElementById('hero-title').innerHTML = mood.dataset.copy;
    toast('Your Akriva mood edit is ready');
    return;
  }

  const story = event.target.closest('[data-story]');
  if (story) {
    activeCategory = story.dataset.story;
    renderCatalog();
    showScreen('catalog');
    return;
  }

  const lookbook = event.target.closest('[data-lookbook]');
  if (lookbook) {
    activeCategory = 'All';
    renderCatalog();
    showScreen('catalog');
    return;
  }

  const wishAll = event.target.closest('[data-wish-all]');
  if (wishAll) {
    products.filter(p => savedProducts.has(p.id)).forEach(p => addItem(p));
    toast('All saved pieces added to your bag');
    renderCart();
    showScreen('cart');
    return;
  }

  const wishAdd = event.target.closest('[data-wish-add]');
  if (wishAdd) {
    addItem(products.find(p => p.id === Number(wishAdd.dataset.wishAdd)));
    return;
  }

  const productButton = event.target.closest('[data-product]');
  if (productButton) {
    openProduct(productButton.dataset.product);
    return;
  }

  const filter = event.target.closest('[data-filter]');
  if (filter) {
    activeCategory = filter.dataset.filter;
    renderCatalog();
    return;
  }

  const quantity = event.target.closest('[data-quantity]');
  if (quantity) {
    const item = cart.find(x => x.id === Number(quantity.dataset.quantity));
    if (quantity.dataset.change === 'remove' || (item.qty === 1 && quantity.dataset.change === '-1')) cart = cart.filter(x => x.id !== item.id);
    else item.qty += Number(quantity.dataset.change);
    updateCart();
    renderCart();
    return;
  }

  const searchTerm = event.target.closest('[data-search-term]')?.dataset.searchTerm;
  if (searchTerm) {
    const input = document.getElementById('search-input');
    input.value = searchTerm;
    renderSearchResults(searchTerm);
    input.focus();
    return;
  }

  if (event.target.closest('#clear-search')) {
    const input = document.getElementById('search-input');
    input.value = '';
    renderSearchResults();
    input.focus();
    return;
  }

  const sizeButton = event.target.closest('.sizes button');
  if (sizeButton) {
    document.querySelectorAll('.sizes button').forEach(b => b.classList.remove('selected-size'));
    sizeButton.classList.add('selected-size');
    return;
  }

  if (event.target.closest('[data-checkout]')) {
    openCheckout();
    return;
  }

  if (event.target.closest('[data-checkout-back]')) {
    renderCart();
    showScreen('cart');
    return;
  }

  if (event.target.closest('[data-checkout-edit]')) {
    checkout.step = 1;
    renderCheckout();
    return;
  }

  if (event.target.closest('[data-checkout-next]')) {
    validateAddress();
    return;
  }

  const payment = event.target.closest('[data-payment]')?.dataset.payment;
  if (payment) {
    checkout.payment = payment;
    renderCheckout();
    return;
  }

  if (event.target.closest('[data-place-order]')) {
    if (!checkout.payment) { toast('Please select a payment method'); return; }
    placeOrder();
    return;
  }

  if (event.target.closest('[data-continue-shopping]')) {
    showScreen('home');
    return;
  }

  if (event.target.closest('[data-promo]')) {
    const code = (document.getElementById('promo-input').value || '').trim().toUpperCase();
    if (code === 'AKRIVA10') {
      const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
      window.appliedPromo = Math.round(subtotal * 0.10);
      renderCart();
      toast('AKRIVA10 applied — 10% off! 🎉');
    } else {
      toast('That promo code is not valid');
    }
    return;
  }

  const profileAction = event.target.closest('[data-profile-action]')?.dataset.profileAction;
  if (profileAction) {
    if (profileAction === 'orders') openOrders();
    else if (profileAction === 'addresses') openAddresses();
    else if (profileAction === 'support') openSupport();
    return;
  }

  if (event.target.closest('#sign-in-button')) {
    openSignin();
    return;
  }

  if (event.target.closest('#otp-verify-btn')) {
    verifyOtp();
    return;
  }

  if (event.target.closest('#otp-resend-btn')) {
    resendOtp();
    return;
  }

  if (event.target.closest('#otp-change-btn')) {
    renderSignin();
    return;
  }

  if (event.target.closest('[data-sign-out]')) {
    signOut();
    return;
  }

  const backTo = event.target.closest('[data-back]')?.dataset.back;
  if (backTo) {
    if (backTo === 'profile') openProfile();
    return;
  }

  if (event.target.closest('[data-add-address]')) {
    openAddressForm();
    return;
  }

  const removeAddress = event.target.closest('[data-remove-address]');
  if (removeAddress) {
    const addresses = store.get(DB_ADDRESSES, []);
    addresses.splice(Number(removeAddress.dataset.removeAddress), 1);
    store.set(DB_ADDRESSES, addresses);
    toast('Address removed');
    renderAddresses();
    return;
  }

  if (event.target.closest('[data-save-address]')) {
    saveNewAddress();
    return;
  }

  const faq = event.target.closest('[data-faq]');
  if (faq) {
    const item = faq.closest('.faq-item');
    const answer = item.querySelector('.faq-a');
    answer.classList.toggle('hidden');
    faq.querySelector('i').textContent = answer.classList.contains('hidden') ? '+' : '−';
    return;
  }

  const support = event.target.closest('[data-support]')?.dataset.support;
  if (support) {
    const labels = {
      call: 'Calling Akriva support at 1800-419-0000 (9am–9pm)',
      whatsapp: 'Opening WhatsApp chat with your stylist',
      email: 'Email us at care@akriva.in',
    };
    toast(labels[support]);
    return;
  }

  if (event.target.closest('[data-filter-open]')) { openFilterModal(); return; }
  if (event.target.closest('[data-filter-close]')) { closeFilterModal(); return; }
  if (event.target.closest('[data-filter-clear]')) { resetFilters(); renderCatalog(); return; }
  if (event.target.closest('[data-filter-apply]')) { applyFilters(); return; }
  if (event.target.id === 'filter-modal') { closeFilterModal(); return; }

  if (event.target.closest('[data-wish-share]')) { shareLook(); return; }
  if (event.target.closest('#modal-share')) {
    shareLook(selectedProduct ? `Just saved ${selectedProduct.name} (${money(selectedProduct.price)}) — my Akriva pick` : '');
    return;
  }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'close') {
    document.getElementById('product-modal').classList.add('hidden');
  } else if (action === 'cart') {
    renderCart();
    showScreen('cart');
  } else if (action === 'home') {
    showScreen('home');
  } else if (action === 'explore') {
    renderExplore();
    showScreen('explore');
  } else if (action === 'all') {
    activeCategory = 'All';
    renderCatalog();
    showScreen('catalog');
  } else if (action === 'category') {
    activeCategory = event.target.closest('[data-category]').dataset.category;
    renderCatalog();
    showScreen('catalog');
  } else if (action === 'search') {
    openSearch();
  } else if (action === 'wishlist') {
    openWishlist();
  } else if (action === 'profile') {
    openProfile();
  } else {
    toast('This section is coming soon');
  }
});

document.addEventListener('submit', event => {
  if (event.target.id === 'checkout-address-form') {
    event.preventDefault();
    validateAddress();
  } else if (event.target.id === 'new-address-form') {
    event.preventDefault();
    saveNewAddress();
  } else if (event.target.id === 'signin-form') {
    event.preventDefault();
    requestOtp();
  } else if (event.target.id === 'akrivaSupportForm') {
    event.preventDefault();
    handleSupportSubmit(event);
  }
});

document.getElementById('userPhone').addEventListener('input', event => {
  event.target.value = event.target.value.replace(/[^0-9]/g, '');
  validateSupportForm();
});

document.getElementById('chat-input').addEventListener('keydown', event => {
  if (event.key === 'Enter') sendChatMessage();
});

document.getElementById('issueCategory').addEventListener('change', validateSupportForm);
document.getElementById('issueDetails').addEventListener('input', validateSupportForm);

document.getElementById('search-input').addEventListener('input', event => renderSearchResults(event.target.value));

const homeSearchInput = document.getElementById('home-search');
homeSearchInput.addEventListener('focus', () => {
  setHomeSearchMode(true);
  renderHomeSearch(homeSearchInput.value);
});
homeSearchInput.addEventListener('input', () => {
  setHomeSearchMode(true);
  renderHomeSearch(homeSearchInput.value);
});
homeSearchInput.addEventListener('blur', () => {
  setTimeout(() => {
    if (!homeSearchInput.value && !document.activeElement.classList.contains('amz-search-clear')) {
      setHomeSearchMode(false);
      renderHomeSearch('');
    }
  }, 150);
});
homeSearchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    homeSearchInput.value = '';
    renderHomeSearch('');
    setHomeSearchMode(false);
    homeSearchInput.blur();
  }
});
document.getElementById('home-search-clear').addEventListener('click', () => {
  homeSearchInput.value = '';
  renderHomeSearch('');
  homeSearchInput.focus();
  setHomeSearchMode(true);
});

document.getElementById('sort-select').addEventListener('change', () => renderCatalog());
document.addEventListener('click', event => {
  const term = event.target.closest('[data-home-search-term]')?.dataset.homeSearchTerm;
  if (!term) return;
  homeSearchInput.value = term;
  renderHomeSearch(term);
  homeSearchInput.focus();
});
document.getElementById('modal-add').addEventListener('click', () => {
  addItem(selectedProduct);
  document.getElementById('product-modal').classList.add('hidden');
});
document.getElementById('modal-buy').addEventListener('click', () => {
  addItem(selectedProduct);
  document.getElementById('product-modal').classList.add('hidden');
  openCheckout();
});

document.addEventListener('input', event => {
  if (event.target.classList.contains('otp-input')) {
    event.target.value = event.target.value.replace(/\D/g, '');
    if (event.target.value.length > 1) event.target.value = event.target.value.slice(-1);
    const inputs = Array.from(document.querySelectorAll('.otp-input'));
    const idx = inputs.indexOf(event.target);
    if (event.target.value && idx < inputs.length - 1) {
      inputs[idx + 1].focus();
    }
    if (inputs.every(i => i.value)) verifyOtp();
  }
  if (event.target.id === 'si-phone') {
    event.target.value = event.target.value.replace(/\D/g, '');
  }
});

document.addEventListener('keydown', event => {
  if (!event.target.classList.contains('otp-input')) return;
  const inputs = Array.from(document.querySelectorAll('.otp-input'));
  const idx = inputs.indexOf(event.target);
  if (event.key === 'Backspace' && !event.target.value && idx > 0) {
    inputs[idx - 1].focus();
    inputs[idx - 1].value = '';
  }
  if (event.key === 'Enter') {
    verifyOtp();
  }
});

renderHome();
updateCart();
renderLocationLabel();
renderSaleTimer();
setInterval(renderSaleTimer, 1000);
startTicker();