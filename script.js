/* =========================================================================
   GEARZONE — script.js
   Vanilla ES2015+. No build step, no dependencies.
   One file shared by index.html / products.html / compare.html / faq.html /
   blog.html: every init function no-ops when its markup is absent.
   Data: data/products.json. Cart, wishlist and compare persist in localStorage.
   ========================================================================= */
(function () {
  'use strict';

  /* ===== constants ===== */
  const LS = { wishlist: 'gearzone_wishlist', cart: 'gearzone_cart', compare: 'gearzone_compare' };
  const MAX_COMPARE = 4, HOVER_INTENT = 120, HOVER_GRACE = 120, TRANSITION = 200, DEBOUNCE = 200, TOP_AT = 600;
  const CATEGORY = { mouse: 'Chuột', keyboard: 'Bàn phím', headset: 'Tai nghe', accessory: 'Phụ kiện' };
  const SPEC_LABEL = {
    weight: 'Trọng lượng', sensor: 'Cảm biến', dpi: 'DPI', pollingRate: 'Polling rate', connection: 'Kết nối', battery: 'Pin',
    switches: 'Switch', switchType: 'Loại switch', layout: 'Layout', size: 'Kích thước', dimensions: 'Kích thước',
    compatibility: 'Tương thích', driver: 'Driver', microphone: 'Micro', surface: 'Bề mặt', material: 'Chất liệu'
  };
  const ICO = {
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5h2.2l2 10.5h10.4L19.5 8H6.2" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="19" r="1.4" fill="currentColor"/><circle cx="16.5" cy="19" r="1.4" fill="currentColor"/></svg>',
    compare: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h7M4 17h7M17 4v16M14 8l3-4 3 4M14 16l3 4 3-4" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20s-7-4.5-7-9.5A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.5c0 5-7 9.5-7 9.5Z" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 13 4.5 4.5L19 7" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>'
  };

  /* ===== state (single source of truth) ===== */
  const state = {
    products: [],
    filters: { category: 'all', brands: new Set(), connections: new Set(), useCases: new Set(), priceMax: null, wishlistOnly: false },
    sort: 'featured', query: '', compare: [], wishlist: [], cart: [], ready: false
  };
  let orderIndex = new Map();   // product id -> position in the JSON (authored oldest -> newest)
  let maxPrice = null;         // highest catalogue price, rounded up to the next 500.000
  let priceEl = null, loadPromise = null;
  let hoverCard = null, hoverTimer = 0, qvTimer = 0, cartTimer = 0, sheetTrigger = null, scrollRaf = 0;
  let cartOpen = false, sheetOpen = false, faqCat = 'all', faqQuery = '';

  /* ===== tiny DOM / format helpers ===== */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  /** Bind only when the node exists — the five pages share this one file. */
  const on = (node, type, fn, opts) => { if (node) node.addEventListener(type, fn, opts); };
  /** First existing node out of one selector, several selectors, or a node. */
  const pick = (sels) => (sels && sels.nodeType === 1 ? sels : (Array.isArray(sels) ? sels : [sels]).map((s) => $(s)).filter(Boolean)[0] || null);
  /** Never writes undefined/null into the DOM: no node, no write. */
  const fill = (sels, text) => { const el = pick(sels); if (el) el.textContent = String(text); };
  /** Toggle visibility via the hidden attribute alone — styles.css carries a global
      [hidden]{display:none!important} guard, so no inline style is needed. */
  const show = (sels, visible) => {
    const el = pick(sels);
    if (el) el.hidden = !visible;
  };
  /** Escape every interpolated string: product data lands in HTML text and attributes. */
  function escapeHtml(value) {
    if (value == null) return '';
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const esc = escapeHtml;
  /** 2990000 -> "2.990.000đ" */
  const formatVND = (n) => (isFinite(Number(n)) ? Math.round(Number(n)) : 0).toLocaleString('vi-VN') + 'đ';
  /** Diacritic-insensitive lowercase so "chuot" finds "Chuột". */
  const norm = (v) => String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const isDesktop = () => !!(window.matchMedia && window.matchMedia('(hover:hover) and (min-width:768px)').matches);
  const page = () => (document.body && document.body.getAttribute('data-page')) || '';
  const detailHref = (p) => 'products.html?id=' + encodeURIComponent(p.id);
  /** schema.org wants absolute addresses; relative hrefs resolved against the current page. */
  const absUrl = (href) => new URL(href, window.location.href).href;
  const roundUp500 = (n) => Math.max(0, Math.ceil(Number(n) / 500000) * 500000);
  const str = (v) => (v == null ? '' : String(v));
  function params() { try { return new URLSearchParams(window.location.search); } catch (err) { return new URLSearchParams(''); } }
  function debounce(fn, wait) {
    let t = 0;
    return function () { const args = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
  }
  /** Spec key -> Vietnamese label; unknown keys fall back to a spaced, capitalised name. */
  function specLabel(key) {
    if (SPEC_LABEL[key]) return SPEC_LABEL[key];
    const words = String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /* ===== storage (may throw in private mode / blocked storage) ===== */
  function readStore(key, fallback) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (err) { return fallback; }
  }
  function writeStore(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* unavailable */ } }
  function loadStores() {
    state.wishlist = readStore(LS.wishlist, []).map(String);
    state.compare = readStore(LS.compare, []).map(String).slice(0, MAX_COMPARE);
    state.cart = readStore(LS.cart, []).map((e) => ({ id: str(e && e.id), qty: Math.max(1, parseInt(e && e.qty, 10) || 1) })).filter((e) => e.id);
  }
  /** Forget stored ids that no longer exist in the catalogue. */
  function pruneStores() {
    const known = (id) => !!getProduct(id);
    state.wishlist = state.wishlist.filter(known);
    state.compare = state.compare.filter(known).slice(0, MAX_COMPARE);
    state.cart = state.cart.filter((e) => known(e.id));
  }

  /* ===== toast ===== */
  function toast(message) {
    const stack = $('#toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = str(message);
    stack.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 2400);
  }

  /* ===== data loading ===== */
  /** Fetch data/products.json (relative path works from every page). */
  function loadProducts() {
    if (loadPromise) return loadPromise;
    loadPromise = fetch('data/products.json')
      .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then((data) => {
        state.products = (Array.isArray(data) ? data : []).filter((p) => p && p.id != null);
        orderIndex = new Map(state.products.map((p, i) => [String(p.id), i]));
        maxPrice = roundUp500(state.products.reduce((top, p) => Math.max(top, Number(p.price) || 0), 0));
        state.ready = true;
        return state.products;
      });
    return loadPromise;
  }
  const getProducts = () => state.products;
  function getProduct(id) {
    if (id == null) return null;
    const key = String(id);
    return state.products.filter((p) => String(p.id) === key)[0] || null;
  }
  /** Replace the skeletons with a readable message instead of spinning forever. */
  function showLoadError() {
    const message = '<p class="state-msg">Không tải được dữ liệu sản phẩm. Vui lòng tải lại trang.</p>';
    $$('#product-grid, #featured-rail, #compare-grid').forEach((el) => { el.removeAttribute('aria-busy'); el.innerHTML = message; });
    fill(['#catalog-result', '#products-result'], '0 sản phẩm');
  }

  /* ===== filter / search / sort (pure: list in -> list out) ===== */
  /** AND across facets, OR inside one facet's Set. */
  function filterProducts(list) {
    const f = state.filters;
    return (list || state.products).filter((p) => {
      if (f.category !== 'all' && p.category !== f.category) return false;
      if (f.brands.size && !f.brands.has(p.brand)) return false;
      if (f.connections.size && !f.connections.has(p.connection)) return false;
      if (f.useCases.size && !(p.useCases || []).some((u) => f.useCases.has(u))) return false;
      if (f.priceMax != null && Number(p.price) > f.priceMax) return false;
      if (f.wishlistOnly && state.wishlist.indexOf(String(p.id)) === -1) return false;
      return true;
    });
  }
  /** Accent-insensitive multi-word AND search across name, brand, description, use cases. */
  function searchProducts(list) {
    const words = norm(state.query).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return list;
    return list.filter((p) => {
      const hay = norm([p.name, p.brand, p.category, p.shortDescription, p.description, (p.useCases || []).join(' ')].join(' '));
      return words.every((w) => hay.indexOf(w) !== -1);
    });
  }
  function sortProducts(list) {
    const out = list.slice(), pos = (p) => (orderIndex.has(String(p.id)) ? orderIndex.get(String(p.id)) : 0);
    switch (state.sort) {
      case 'price-asc': out.sort((a, b) => a.price - b.price); break;
      case 'price-desc': out.sort((a, b) => b.price - a.price); break;
      case 'rating': out.sort((a, b) => (b.rating - a.rating) || (b.reviewCount - a.reviewCount)); break;
      case 'newest': out.sort((a, b) => pos(b) - pos(a)); break;   // JSON is authored oldest -> newest
      default: out.sort((a, b) => ((b.featured ? 1 : 0) - (a.featured ? 1 : 0)) || (b.rating - a.rating));
    }
    return out;
  }
  const visible = () => sortProducts(searchProducts(filterProducts(state.products)));
  function applyQuery() { const list = visible(); renderProducts(list); return list; }

  /* ===== product card ===== */
  const priceHtml = (p) => `<span class="price-now">${formatVND(p.price)}</span>` +
    (Number(p.compareAtPrice) > Number(p.price) ? ` <s class="price-was">${formatVND(p.compareAtPrice)}</s>` : '');
  function productCard(p) {
    const href = esc(detailHref(p)), id = esc(p.id);
    const wished = state.wishlist.indexOf(String(p.id)) !== -1, compared = state.compare.indexOf(String(p.id)) !== -1;
    const badge = p.badge ? `<span class="product-badge" data-badge="${esc(p.badge)}">${esc(p.badge)}</span>` : '';
    const button = (cls, icon, label, pressed) => `<button class="icon-btn ${cls}" type="button" data-id="${id}"${pressed ? ` aria-pressed="${pressed}"` : ''} aria-label="${esc(label)}">${icon}</button>`;
    return `<article class="product-card" data-id="${id}" data-category="${esc(p.category)}">
${badge}<a class="product-media" href="${href}" aria-label="${esc(p.name)}"><img src="${esc(p.image)}" alt="${esc(p.name + ' — ' + p.brand)}" width="900" height="900" loading="lazy" decoding="async"></a>
<p class="product-brand">${esc(p.brand)}</p><h3 class="product-name"><a href="${href}">${esc(p.name)}</a></h3>
<p class="product-rating"><span class="star" aria-hidden="true">★</span> ${esc(p.rating)} <span>(${esc(p.reviewCount)})</span></p>
<p class="product-price">${priceHtml(p)}</p>
<div class="product-actions">
${button('js-add-cart', ICO.cart, 'Thêm ' + p.name + ' vào giỏ')}${button('js-add-compare' + (compared ? ' is-active' : ''), ICO.compare, 'So sánh ' + p.name, compared ? 'true' : '')}${button('js-toggle-wishlist' + (wished ? ' is-active' : ''), ICO.heart, 'Yêu thích ' + p.name, wished ? 'true' : 'false')}
</div></article>`;
  }
  /** Fill the catalogue grid (home + products) and its counters. */
  function renderProducts(list) {
    const items = list || visible(), grid = $('#product-grid');
    if (grid) {
      grid.innerHTML = items.length ? items.map(productCard).join('') : '';
      grid.setAttribute('aria-busy', 'false');
    }
    show(grid, items.length > 0);
    show('#catalog-empty', items.length > 0);
    fill('#catalog-count', '(' + items.length + ')');
    fill(['#catalog-result', '#products-result'], items.length + ' sản phẩm');
    return items;
  }
  function renderFeatured() {
    const rail = $('#featured-rail');
    if (!rail) return;
    const items = state.products.filter((p) => p.featured === true).slice(0, 5);
    rail.innerHTML = items.length ? items.map(productCard).join('') : '<p class="state-msg">Chưa có sản phẩm nổi bật.</p>';
  }
  /** Home-only "N sản phẩm" line under each category card. */
  function renderCategoryCounts() {
    const tally = {};
    state.products.forEach((p) => { tally[p.category] = (tally[p.category] || 0) + 1; });
    $$('[data-category-count]').forEach((el) => { el.textContent = (tally[el.getAttribute('data-category-count')] || 0) + ' sản phẩm'; });
  }
  function renderCatalog() { renderProducts(visible()); renderCategoryCounts(); }

  /* ===== quick view — desktop hover popup, touch bottom sheet ===== */
  function quickViewHtml(p) {
    const keys = Object.keys(p.specifications || {}), promos = p.promotions || [];
    const specRows = keys.map((k) => `<div><dt>${esc(specLabel(k))}</dt><dd>${esc(p.specifications[k])}</dd></div>`).join('');
    const promoRows = promos.map((t) => `<li>${ICO.check} <span>${esc(t)}</span></li>`).join('');
    return `<button class="icon-btn js-quickview-close" type="button" aria-label="Đóng thông tin nhanh">${ICO.close}</button>
<p class="product-brand">${esc(p.brand)}</p><h3 class="qv-name">${esc(p.name)}</h3>
<p class="qv-price">${priceHtml(p)}</p><p class="qv-warranty">Bảo hành ${esc(p.warranty)}</p>
<p class="qv-desc">${esc(p.shortDescription)}</p>
${keys.length ? `<dl class="qv-specs">${specRows}</dl>` : ''}${promos.length ? `<ul class="qv-promos">${promoRows}</ul>` : ''}
<div class="qv-actions"><a class="btn btn-secondary" href="${esc(detailHref(p))}">Xem sản phẩm</a><button class="btn btn-primary js-add-cart" type="button" data-id="${esc(p.id)}">Thêm vào giỏ</button></div>`;
  }
  /** Desktop placement: right of the card, else left, else centred; always clamped to the viewport. */
  function positionQuickView() {
    const qv = $('#quickview');
    if (!qv || qv.hidden || !hoverCard || !hoverCard.isConnected) return;
    const r = hoverCard.getBoundingClientRect(), w = qv.offsetWidth, h = qv.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight, pad = 12;
    let left = r.right + pad, top = r.top;
    if (left + w > vw - pad) left = r.left - w - pad;
    if (left < pad) left = Math.min(Math.max(pad, r.left + r.width / 2 - w / 2), Math.max(pad, vw - w - pad));
    if (top + h > vh - pad) top = vh - h - pad;
    if (top < pad) top = pad;
    qv.style.left = Math.round(left) + 'px';
    qv.style.top = Math.round(top) + 'px';
  }
  function showQuickView(product, cardEl) {
    const qv = $('#quickview'), inner = $('#quickview-inner');
    if (!qv || !inner || !product) return;
    clearTimeout(hoverTimer);
    clearTimeout(qvTimer);
    hoverCard = cardEl || hoverCard;
    inner.innerHTML = quickViewHtml(product);
    qv.hidden = false;                                 // must be laid out before measuring
    if (isDesktop()) positionQuickView();
    else {
      qv.style.left = ''; qv.style.top = '';
      show('#sheet-backdrop', true);
      sheetOpen = true; sheetTrigger = cardEl || null;
      lockScroll();
    }
    requestAnimationFrame(() => qv.classList.add('is-open'));
    updateBackToTop();
  }
  function hideQuickView() {
    clearTimeout(hoverTimer);
    clearTimeout(qvTimer);
    const qv = $('#quickview');
    if (!qv || qv.hidden) return;
    qv.classList.remove('is-open');
    show('#sheet-backdrop', false);
    const wasSheet = sheetOpen, trigger = sheetTrigger;
    sheetOpen = false; hoverCard = null; sheetTrigger = null;
    lockScroll();
    qvTimer = setTimeout(() => { qv.hidden = true; }, TRANSITION);
    if (wasSheet && trigger && trigger.isConnected && trigger.focus) trigger.focus();
    updateBackToTop();
  }
  function initQuickView() {
    if (!$('#quickview')) return;
    const cardOf = (e) => (e.target.closest ? e.target.closest('.product-card') : null);
    document.addEventListener('mouseover', (e) => {
      if (!isDesktop() || !e.target.closest) return;
      const card = cardOf(e), qv = $('#quickview');
      if (card) {
        clearTimeout(hoverTimer);
        if (card === hoverCard) return;
        hoverCard = card;
        hoverTimer = setTimeout(() => {                    // 120ms hover intent
          const p = getProduct(card.getAttribute('data-id'));
          if (p && card.isConnected) showQuickView(p, card);
        }, HOVER_INTENT);
      } else if (qv && !qv.hidden && qv.contains(e.target)) clearTimeout(hoverTimer);   // hovering the popup keeps it open
    });
    document.addEventListener('mouseout', (e) => {
      if (!isDesktop() || !e.target.closest) return;
      const card = cardOf(e), qv = $('#quickview'), to = e.relatedTarget;
      const inside = (el) => !!(el && to && el.contains(to));
      if (card) { if (card !== hoverCard || inside(card) || inside(qv)) return; }
      else if (qv && !qv.hidden && qv.contains(e.target)) { if (inside(qv)) return; }
      else return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(hideQuickView, HOVER_GRACE);   // 120ms grace period
    });
    document.addEventListener('focusin', (e) => {
      if (!isDesktop() || !e.target.closest || e.target.closest('.product-actions')) return;
      const card = cardOf(e), p = card ? getProduct(card.getAttribute('data-id')) : null;
      if (p) showQuickView(p, card);
    });
    document.addEventListener('focusout', (e) => {
      const card = cardOf(e);
      if (!card) return;
      const to = e.relatedTarget, qv = $('#quickview');
      if (to && (card.contains(to) || (qv && qv.contains(to)))) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(hideQuickView, HOVER_GRACE);
    });
    on(window, 'scroll', () => {                           // keep it anchored, rAF-throttled
      const qv = $('#quickview');
      if (!qv || qv.hidden || !isDesktop() || scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; positionQuickView(); });
    }, { passive: true });
    on(window, 'resize', () => {
      const qv = $('#quickview');
      if (!qv || qv.hidden) return;
      if (isDesktop()) positionQuickView(); else hideQuickView();
    });
  }

  /* ===== compare ===== */
  function parseGrams(value) {
    const m = value == null ? null : String(value).replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|g)?/i);
    const n = m ? parseFloat(m[1]) : NaN;
    return isFinite(n) ? (/kg/i.test(m[2] || '') ? n * 1000 : n) : null;
  }
  /** Spec keys of all compared products, most common first, then alphabetical. */
  function unionSpecKeys(items) {
    const freq = new Map();
    items.forEach((p) => Object.keys(p.specifications || {}).forEach((k) => freq.set(k, (freq.get(k) || 0) + 1)));
    return Array.prototype.slice.call(freq.keys()).sort((a, b) => (freq.get(b) - freq.get(a)) || a.localeCompare(b));
  }
  function addToCompare(id) {
    const product = getProduct(id);
    if (!product) return;
    const key = String(product.id);
    if (state.compare.indexOf(key) !== -1) { toast('Sản phẩm đã có trong danh sách so sánh.'); return; }
    if (state.compare.length >= MAX_COMPARE) { toast('Bạn chỉ có thể so sánh tối đa 4 sản phẩm.'); return; }
    state.compare = state.compare.concat([key]);
    writeStore(LS.compare, state.compare);
    updateBadges();
    syncCompareButtons();
    renderCompare();
    toast('Đã thêm vào danh sách so sánh');
  }
  function removeFromCompare(id) {
    const key = String(id);
    state.compare = state.compare.filter((x) => x !== key);
    writeStore(LS.compare, state.compare);
    updateBadges(); syncCompareButtons(); renderCompare();
  }
  function renderCompare() {
    const root = $('#compare-root');
    if (!root) return;
    const items = state.compare.map(getProduct).filter(Boolean);
    show('#compare-empty', items.length >= 2);
    let out = $('#compare-output');
    if (items.length < 2) { if (out) out.hidden = true; return; }
    if (!out) { out = document.createElement('div'); out.id = 'compare-output'; root.appendChild(out); }
    out.hidden = false;
    const row = (label, cell) => `<tr class="compare-row"><th class="compare-label" scope="row">${esc(label)}</th>${items.map((p) => `<td class="compare-cell">${cell(p)}</td>`).join('')}</tr>`;
    const rows = [
      row('Ảnh', (p) => `<img class="compare-media" src="${esc(p.image)}" alt="${esc(p.name)}" width="72" height="72" loading="lazy" decoding="async">`),
      row('Thương hiệu', (p) => esc(p.brand)),
      row('Giá', (p) => `<strong>${formatVND(p.price)}</strong>`),
      row('Giá gốc', (p) => (Number(p.compareAtPrice) > Number(p.price) ? `<s>${formatVND(p.compareAtPrice)}</s>` : '—')),
      row('Đánh giá', (p) => `<span class="star" aria-hidden="true">★</span> ${esc(p.rating)} (${esc(p.reviewCount)})`),
      row('Bảo hành', (p) => esc(p.warranty) || '—'),
      row('Kết nối', (p) => esc(p.connection) || '—')
    ].concat(unionSpecKeys(items).map((key) => row(specLabel(key), (p) => esc((p.specifications || {})[key]) || '—')));
    const head = `<tr class="compare-head"><th class="compare-label" scope="col">Sản phẩm</th>${items.map((p) => `<th scope="col">${esc(p.name)} <button class="compare-remove" type="button" data-id="${esc(p.id)}" aria-label="Xoá ${esc(p.name)} khỏi so sánh">Xoá</button></th>`).join('')}</tr>`;
    out.innerHTML = `<div class="compare-wrapper"><table class="compare-table"><thead>${head}</thead><tbody>${rows.join('')}</tbody></table></div>` + compareSummary(items);
  }
  /** "Kết luận nhanh" — a line is skipped whenever its data is missing. */
  function compareSummary(items) {
    const lines = [], cheapest = items.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a), items[0]);
    if (isFinite(Number(cheapest.price))) lines.push(`<li>Giá tốt nhất: <strong>${esc(cheapest.name)}</strong> — ${formatVND(cheapest.price)}</li>`);
    const best = items.reduce((a, b) => ((Number(b.rating) - Number(a.rating)) || (Number(b.reviewCount) - Number(a.reviewCount))) > 0 ? b : a, items[0]);
    if (isFinite(Number(best.rating))) lines.push(`<li>Đánh giá cao nhất: <strong>${esc(best.name)}</strong> — ★ ${esc(best.rating)} (${esc(best.reviewCount)} đánh giá)</li>`);
    const weighed = items.map((p) => ({ p: p, g: parseGrams((p.specifications || {}).weight) })).filter((x) => x.g != null);
    if (weighed.length) {
      const lightest = weighed.reduce((a, b) => (b.g < a.g ? b : a), weighed[0]);
      lines.push(`<li>Nhẹ nhất: <strong>${esc(lightest.p.name)}</strong> — ${Math.round(lightest.g)}g</li>`);
    }
    return lines.length ? `<section class="compare-summary"><h2 class="section-title">Kết luận nhanh</h2><ul>${lines.join('')}</ul></section>` : '';
  }
  /** Keep every rendered compare button in sync with state.compare. */
  function syncCompareButtons() {
    $$('.js-add-compare').forEach((btn) => {
      const active = state.compare.indexOf(String(btn.getAttribute('data-id'))) !== -1;
      btn.classList.toggle('is-active', active);
      if (active) btn.setAttribute('aria-pressed', 'true'); else btn.removeAttribute('aria-pressed');
    });
  }

  /* ===== wishlist ===== */
  function toggleWishlist(id) {
    const product = getProduct(id);
    if (!product) return;
    const key = String(product.id), added = state.wishlist.indexOf(key) === -1;
    state.wishlist = added ? state.wishlist.concat([key]) : state.wishlist.filter((x) => x !== key);
    writeStore(LS.wishlist, state.wishlist);
    updateBadges();
    $$('.js-toggle-wishlist').forEach((btn) => {
      if (String(btn.getAttribute('data-id')) !== key) return;
      btn.classList.toggle('is-active', added);
      btn.setAttribute('aria-pressed', added ? 'true' : 'false');
    });
    if (state.filters.wishlistOnly) applyQuery();
    toast(added ? 'Đã thêm vào yêu thích' : 'Đã xoá khỏi yêu thích');
  }

  /* ===== cart ===== */
  const cartCount = () => state.cart.reduce((sum, e) => sum + (parseInt(e.qty, 10) || 0), 0);
  function addToCart(id) {
    const product = getProduct(id);
    if (!product) return;
    const key = String(product.id), exists = state.cart.some((e) => e.id === key);
    state.cart = exists                                 // increment, never duplicate the line
      ? state.cart.map((e) => (e.id === key ? { id: key, qty: (parseInt(e.qty, 10) || 0) + 1 } : e))
      : state.cart.concat([{ id: key, qty: 1 }]);
    writeStore(LS.cart, state.cart);
    renderCart();
    toast('Đã thêm vào giỏ hàng');
  }
  function removeFromCart(id) {
    const key = String(id);
    state.cart = state.cart.filter((e) => e.id !== key);
    writeStore(LS.cart, state.cart);
    renderCart();
    if (page() === 'checkout') renderCheckoutSummary();
  }
  function setCartQuantity(id, qty) {
    const key = String(id), next = parseInt(qty, 10);
    if (!isFinite(next) || next < 1) { removeFromCart(key); return; }   // stepping below 1 removes the line
    state.cart = state.cart.map((e) => (e.id === key ? { id: key, qty: next } : e));
    writeStore(LS.cart, state.cart);
    renderCart();
    if (page() === 'checkout') renderCheckoutSummary();
  }
  function renderCheckoutSummary() {
    const lines = state.cart.map((e) => ({ qty: Math.max(1, parseInt(e.qty, 10) || 1), p: getProduct(e.id) })).filter((x) => x.p);
    const countEl = $('#checkout-item-count');
    const itemsEl = $('#checkout-items');
    const subtotalEl = $('#checkout-subtotal');
    const shippingEl = $('#checkout-shipping');
    const totalEl = $('#checkout-total');
    const emptyEl = $('#checkout-empty');
    const invoice = lines.reduce((sum, x) => sum + Number(x.p.price) * x.qty, 0);
    const shipping = invoice > 0 && invoice >= 1000000 ? 0 : (invoice > 0 ? 49000 : 0);
    const total = invoice + shipping;

    if (countEl) countEl.textContent = lines.length + ' sản phẩm';
    if (itemsEl) {
      if (!lines.length) {
        itemsEl.innerHTML = '<div class="flex flex-col gap-space-sm rounded-lg border border-dashed border-outline/50 bg-surface-container-low p-space-md text-on-surface-variant">Giỏ hàng đang trống. <a href="products.html" class="text-primary hover:underline">Tiếp tục mua sắm</a></div>';
      } else {
        itemsEl.innerHTML = lines.map(({ p, qty }) => `
          <div class="flex gap-space-sm p-space-xs bg-surface-container-low rounded-lg items-center">
            <div class="w-16 h-16 rounded bg-surface-container-lowest shrink-0 overflow-hidden relative p-1 flex items-center justify-center">
              <img alt="${esc(p.name)}" class="w-full h-full object-contain" src="${esc(p.image)}" width="64" height="64" loading="lazy" decoding="async">
            </div>
            <div class="flex flex-col flex-1 min-w-0">
              <div class="flex items-start justify-between gap-1">
                <h3 class="font-body-md text-body-md font-semibold text-on-surface truncate">${esc(p.name)}</h3>
                <span class="font-label-md text-label-md font-mono text-on-surface shrink-0">${formatVND(Number(p.price) * qty)}</span>
              </div>
              <div class="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
                <span>${esc(p.brand)} | ${esc(p.connection || 'Cơ bản')}</span>
                <span>SL: ${qty}</span>
              </div>
              <div class="flex items-center justify-between gap-1 text-on-surface-variant font-label-sm text-label-sm mt-0.5">
                <span>🎁 ${esc(p.badge || 'Bảo hành chính hãng')}</span>
                <button class="cart-remove text-primary hover:underline" type="button" data-id="${esc(p.id)}" aria-label="Xoá ${esc(p.name)} khỏi giỏ">Xoá</button>
              </div>
            </div>
          </div>
        `).join('');
      }
    }
    if (subtotalEl) subtotalEl.textContent = formatVND(invoice);
    if (shippingEl) shippingEl.textContent = shipping === 0 ? 'Miễn phí' : formatVND(shipping);
    if (totalEl) totalEl.textContent = formatVND(total);
    if (emptyEl) emptyEl.hidden = lines.length > 0;
    const confirmBtn = $('#checkout-submit');
    if (confirmBtn) confirmBtn.disabled = lines.length === 0;
  }
  function initCheckoutPage() {
    const pageName = page();
    if (pageName !== 'checkout') return;
    const form = $('#checkout-form');
    if (form) {
      on(form, 'submit', (e) => {
        e.preventDefault();
        const lines = state.cart.map((entry) => ({ qty: Math.max(1, parseInt(entry.qty, 10) || 1), p: getProduct(entry.id) })).filter((x) => x.p);
        if (!lines.length) {
          toast('Giỏ hàng đang trống.');
          return;
        }
        window.location.href = 'dat-hang-thanh-cong.html';
      });
    }
    const confirmBtn = $('#checkout-submit');
    if (confirmBtn) {
      on(confirmBtn, 'click', (e) => {
        if (!e || !e.preventDefault) return;
        e.preventDefault();
        const lines = state.cart.map((entry) => ({ qty: Math.max(1, parseInt(entry.qty, 10) || 1), p: getProduct(entry.id) })).filter((x) => x.p);
        if (!lines.length) {
          toast('Giỏ hàng đang trống.');
          return;
        }
        window.location.href = 'dat-hang-thanh-cong.html';
      });
    }
    renderCheckoutSummary();
  }
 function cartLineHtml(p, qty) {
   return `<div class="cart-line" data-id="${esc(p.id)}">
<img src="${esc(p.image)}" alt="${esc(p.name)}" width="56" height="56" loading="lazy" decoding="async">
<div class="cart-line-info"><em>${esc(p.brand)}</em><strong>${esc(p.name)}</strong><b>${formatVND(Number(p.price) * qty)}</b></div>
<button class="qty-btn" type="button" data-cart-step="-1" data-id="${esc(p.id)}" aria-label="Giảm số lượng">−</button><span class="qty-value">${qty}</span><button class="qty-btn" type="button" data-cart-step="1" data-id="${esc(p.id)}" aria-label="Tăng số lượng">+</button>
<button class="cart-remove" type="button" data-id="${esc(p.id)}" aria-label="Xoá ${esc(p.name)} khỏi giỏ">Xoá</button>
</div>`;
 }
 function renderCart() {
    const lines = state.cart.map((e) => ({ qty: Math.max(1, parseInt(e.qty, 10) || 1), p: getProduct(e.id) })).filter((x) => x.p);
    const body = $('#cart-body');
    if (body) body.innerHTML = lines.length ? lines.map((x) => cartLineHtml(x.p, x.qty)).join('') : '<p class="state-msg">Giỏ hàng đang trống.</p>';
    show('#cart-foot', lines.length > 0);
    fill('#cart-subtotal', formatVND(lines.reduce((sum, x) => sum + Number(x.p.price) * x.qty, 0)));
    updateBadges();
  }
  function initCart() {
    on($('#cart-toggle'), 'click', (e) => { e.preventDefault(); openCart(); });
    on($('#cart-close'), 'click', closeCart);
    on($('#cart-checkout'), 'click', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      window.location.href = 'thanhtoan.html';
    });
    on($('#sheet-backdrop'), 'click', () => { closeCart(); hideQuickView(); });
    document.addEventListener('click', (e) => {          // clicking outside closes the drawer
      if (!cartOpen || !e.target.closest || e.target.closest('#cart-toggle')) return;
      const drawer = $('#cart-drawer');
      if (drawer && !drawer.contains(e.target)) closeCart();
    });
    /* Cart and wishlist live in localStorage, so another tab can change them under us:
       storage fires in every document except the writer. pageshow(persisted) covers the
       back button after checkout — dat-hang-thanh-cong.html empties the cart. */
    const resync = () => {
      loadStores();
      updateBadges();
      renderCart();
      if (page() === 'checkout') renderCheckoutSummary();
    };
    window.addEventListener('storage', (e) => { if (e.key === LS.cart || e.key === LS.wishlist) resync(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) resync(); });
  }
  function openCart() {
    const drawer = $('#cart-drawer'), toggle = $('#cart-toggle');
    if (!drawer || !drawer.hidden) return;
    clearTimeout(cartTimer);
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    cartOpen = true;
    lockScroll();
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    const close = $('#cart-close');
    if (close && close.focus) close.focus();             // move focus into the drawer
    updateBackToTop();
  }
  function closeCart() {
    const drawer = $('#cart-drawer');
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    const toggle = $('#cart-toggle');
    if (toggle) { toggle.setAttribute('aria-expanded', 'false'); if (toggle.focus) toggle.focus(); }
    cartOpen = false;
    lockScroll();
    clearTimeout(cartTimer);
    cartTimer = setTimeout(() => { drawer.hidden = true; }, TRANSITION);
    updateBackToTop();
  }
  function lockScroll() { if (document.body) document.body.style.overflow = (cartOpen || sheetOpen) ? 'hidden' : ''; }

  /* ===== badges ===== */
  const setBadge = (sel, value) => $$(sel).forEach((el) => { el.textContent = String(value); el.hidden = !(value > 0); });
  function updateBadges() {
    setBadge('[data-cart-count]', cartCount());
    setBadge('[data-wishlist-count]', state.wishlist.length);
    setBadge('[data-compare-count]', state.compare.length);
    show('#compare-bar', state.compare.length > 0);
  }

  /* ===== header, nav, back-to-top ===== */
  function closeNav() {
    if (document.body) document.body.classList.remove('nav-open');
    const toggle = $('#nav-toggle'); if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  function initNavigation() {
    const navToggle = $('#nav-toggle'), searchToggle = $('#search-toggle'), headerSearch = $('#header-search');
    on(navToggle, 'click', () => {
      const open = document.body.classList.toggle('nav-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    on($('#main-nav'), 'click', (e) => { if (e.target.closest && e.target.closest('a')) closeNav(); });
    on(searchToggle, 'click', () => {
      if (!headerSearch) return;
      const open = headerSearch.hidden;
      headerSearch.hidden = !open;
      searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      const field = $('#site-search');
      if (open && field && field.focus) field.focus();
    });
    on($('#search-clear'), 'click', () => {
      $$('[data-search-input]').forEach((input) => { input.value = ''; });
      state.query = '';
      syncSearchInputs(); syncSearchStatus(); applyQuery();
      const field = $('#site-search'); if (field && field.focus) field.focus();
    });
    on(window, 'resize', () => { if (window.innerWidth > 1024) closeNav(); });
    on(document, 'keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeNav();
      if (headerSearch && !headerSearch.hidden) {
        headerSearch.hidden = true;
        if (searchToggle) searchToggle.setAttribute('aria-expanded', 'false');
      }
      closeCart();
      hideQuickView();
    });
    // Mark the nav entry for the page (and category) we are on.
    const links = $$('#main-nav .nav-link');
    if (!links.length) return;
    const here = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const wanted = params().get('category') || '';
    let best = null, score = 0;
    links.forEach((link) => {
      let url;
      try { url = new URL(link.getAttribute('href') || '', window.location.href); } catch (err) { return; }
      if ((url.pathname.split('/').pop() || '').toLowerCase() !== here) return;
      const rank = (wanted && url.searchParams.get('category') === wanted) ? 2 : (url.search ? 0 : 1);
      if (rank > score) { score = rank; best = link; }
    });
    links.forEach((link) => link.removeAttribute('aria-current'));
    if (best) best.setAttribute('aria-current', 'page');
  }
  function updateBackToTop() {
    const btn = $('#back-to-top'), qv = $('#quickview');
    if (btn) btn.hidden = cartOpen || sheetOpen || !!(qv && !qv.hidden) || window.scrollY < TOP_AT;
  }
  function initBackToTop() {
    const btn = $('#back-to-top');
    if (!btn) return;
    on(btn, 'click', () => window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }));
    let ticking = false;
    on(window, 'scroll', () => {                         // rAF-throttled, passive
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; updateBackToTop(); });
    }, { passive: true });
    updateBackToTop();
  }

  /* ===== search ===== */
  function syncSearchStatus() {
    const field = $('#site-search'), clear = $('#search-clear');
    if (clear && field) clear.hidden = field.value.trim() === '';
  }
  /** Every [data-search-input] field shares the same query. */
  function syncSearchInputs(source) {
    $$('[data-search-input]').forEach((input) => { if (input !== source && input.value !== state.query) input.value = state.query; });
    syncSearchStatus();
  }
  function submitSearch() {
    const field = $('#site-search') || $('[data-search-input]');
    state.query = field ? field.value : state.query;
    syncSearchInputs(field);
    if (page() === 'products') { applyQuery(); renderActiveFilters(); syncUrl(); }
    else if (page() === 'home') { applyQuery(); renderActiveFilters(); if (state.query.trim()) scrollToCatalog(); }
    else window.location.href = 'products.html?q=' + encodeURIComponent(state.query);
  }
  function initSearch() {
    if (!$('[data-search-input]')) return;
    on($('.search-form'), 'submit', (e) => { e.preventDefault(); submitSearch(); });
    const live = debounce(() => { syncSearchInputs(); applyQuery(); renderActiveFilters(); }, DEBOUNCE);
    on(document, 'input', (e) => {
      const input = e.target;
      if (!input.matches || !input.matches('[data-search-input]')) return;
      state.query = input.value;
      syncSearchInputs(input);
      if ($('#product-grid') && (input.id !== 'site-search' || page() === 'products')) live();   // live on a visible grid
      else renderActiveFilters();
    });
    on(document, 'keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches && e.target.matches('#site-search')) { e.preventDefault(); submitSearch(); }
    });
    syncSearchInputs();
  }

  /* ===== chips, category cards, sort ===== */
  function syncChips() {
    $$('.chip[data-filter]').forEach((chip) => { chip.classList.toggle('is-active', chip.getAttribute('data-filter') === state.filters.category); });
  }
  function setCategory(category) {
    state.filters.category = category || 'all';
    syncChips(); syncFacetInputs();
    applyQuery(); renderActiveFilters(); syncUrl();
  }
  function scrollToCatalog() {
    const target = $('#catalog');
    if (target && target.scrollIntoView) target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  }

  /* ===== products page: URL params, facets, active filter pills ===== */
  function readUrlParams() {
    const p = params();
    if (p.has('category')) state.filters.category = p.get('category') || 'all';
    if (p.has('q')) state.query = p.get('q') || '';
    if (p.get('wishlist') === '1') state.filters.wishlistOnly = true;
    p.getAll('brand').forEach((raw) => { raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((b) => state.filters.brands.add(b)); });
    const ids = p.get('ids');
    if (ids) state.compare = ids.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_COMPARE);
  }
  /** Keep products.html shareable without ever reloading the page. */
  function syncUrl() {
    if (page() !== 'products' || !window.history || !window.history.replaceState) return;
    const p = new URLSearchParams();
    if (state.filters.category !== 'all') p.set('category', state.filters.category);
    if (state.query.trim()) p.set('q', state.query.trim());
    state.filters.brands.forEach((b) => p.append('brand', b));
    if (state.filters.wishlistOnly) p.set('wishlist', '1');
    const qs = p.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }
  const facetSet = (kind) => (kind === 'brand' ? state.filters.brands : kind === 'connection' ? state.filters.connections : kind === 'useCase' ? state.filters.useCases : null);
  /** Author-written options keep their markup (counts refresh); the empty brand/useCase lists are generated. */
  function renderFacets() {
    const tally = {}, bump = (kind, value) => {
      if (value == null) return;
      tally[kind] = tally[kind] || {};
      tally[kind][value] = (tally[kind][value] || 0) + 1;
    };
    state.products.forEach((p) => {
      bump('category', p.category); bump('brand', p.brand); bump('connection', p.connection);
      (p.useCases || []).forEach((u) => bump('useCase', u));
    });
    $$('.facet-list[data-facet]').forEach((list) => {
      const kind = list.getAttribute('data-facet'), counts = tally[kind] || {}, inputs = $$('input', list);
      if (inputs.length) {
        inputs.forEach((input) => { const badge = $('.facet-count', input.parentNode); if (badge) badge.textContent = String(counts[input.value] || 0); });
        return;
      }
      list.innerHTML = Object.keys(counts).sort((a, b) => a.localeCompare(b)).map((value) =>
        `<label class="facet-item"><input type="checkbox" name="${kind}" value="${esc(value)}"><span>${esc(value)}</span><span class="facet-count">${counts[value]}</span></label>`).join('');
    });
  }
  function initFacets() {
    priceEl = $('#price-range');
    if (priceEl) {
      if (maxPrice && Number(priceEl.max) < maxPrice) priceEl.max = String(maxPrice);
      if (state.filters.priceMax == null) state.filters.priceMax = maxPrice;
      priceEl.value = String(state.filters.priceMax == null ? priceEl.max : state.filters.priceMax);
    }
    renderFacets();
    syncFacetInputs();
  }
  /** Mirror state into the facet controls (category radio, checkbox sets, price range). */
  function syncFacetInputs() {
    const f = state.filters;
    $$('input[name="category"]').forEach((input) => { input.checked = input.value === f.category; });
    $$('.facet-list[data-facet] input[type="checkbox"]').forEach((input) => {
      const group = facetSet(input.name);
      if (group) input.checked = group.has(input.value);
    });
    if (priceEl && f.priceMax != null) priceEl.value = String(f.priceMax);
    if (f.priceMax != null) fill('#price-range-out', formatVND(f.priceMax));
  }
  function renderActiveFilters() {
    show('#wishlist-note', state.filters.wishlistOnly);
    const box = $('#active-filters');
    if (!box) return;
    const f = state.filters, pills = [];
    const pill = (label, kind, value) =>
      `<span class="filter-pill">${esc(label)}<button type="button" data-remove-facet="${esc(kind)}" data-value="${esc(value)}" aria-label="Bỏ lọc ${esc(label)}">✕</button></span>`;
    if (f.category !== 'all') pills.push(pill(CATEGORY[f.category] || f.category, 'category', f.category));
    f.brands.forEach((v) => pills.push(pill('Hãng: ' + v, 'brand', v)));
    f.connections.forEach((v) => pills.push(pill('Kết nối: ' + v, 'connection', v)));
    f.useCases.forEach((v) => pills.push(pill('Nhu cầu: ' + v, 'useCase', v)));
    if (f.priceMax != null && maxPrice != null && f.priceMax < maxPrice) pills.push(pill('Giá ≤ ' + formatVND(f.priceMax), 'price', String(f.priceMax)));
    if (f.wishlistOnly) pills.push(pill('Chỉ yêu thích', 'wishlist', '1'));
    box.innerHTML = pills.join('');
    box.hidden = pills.length === 0;
  }
  function removeFacet(kind, value) {
    const f = state.filters;
    if (kind === 'category') f.category = 'all';
    else if (kind === 'wishlist') f.wishlistOnly = false;
    else if (kind === 'price') { f.priceMax = maxPrice; if (priceEl && maxPrice != null) priceEl.value = String(maxPrice); }
    else { const group = facetSet(kind); if (group) group.delete(value); }
    syncChips(); syncFacetInputs();
    applyQuery(); renderActiveFilters(); syncUrl();
  }
  function resetFilters() {
    const f = state.filters;
    f.category = 'all'; f.wishlistOnly = false; f.priceMax = maxPrice;
    f.brands.clear(); f.connections.clear(); f.useCases.clear();
    state.query = ''; state.sort = 'featured';
    $$('[data-search-input]').forEach((input) => { input.value = ''; });
    const sort = $('[data-sort]'); if (sort) sort.value = state.sort;
    syncChips(); syncFacetInputs(); syncSearchStatus();
    applyQuery(); renderActiveFilters(); syncUrl();
  }

  /* ===== one delegated listener for every interactive control ===== */
  function initDelegates() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      let el;
      if ((el = t.closest('.js-add-cart'))) { addToCart(el.getAttribute('data-id')); return; }
      if ((el = t.closest('.js-add-compare'))) { addToCompare(el.getAttribute('data-id')); return; }
      if ((el = t.closest('.js-toggle-wishlist'))) { toggleWishlist(el.getAttribute('data-id')); return; }
      if ((el = t.closest('.compare-remove'))) { removeFromCompare(el.getAttribute('data-id')); return; }
      if ((el = t.closest('.cart-remove'))) { removeFromCart(el.getAttribute('data-id')); return; }
      if ((el = t.closest('[data-cart-step]'))) {
        const id = el.getAttribute('data-id'), entry = state.cart.filter((x) => x.id === String(id))[0];
        setCartQuantity(id, (entry ? parseInt(entry.qty, 10) || 0 : 0) + Number(el.getAttribute('data-cart-step')));
        return;
      }
      if ((el = t.closest('[data-remove-facet]'))) { removeFacet(el.getAttribute('data-remove-facet'), el.getAttribute('data-value')); return; }
      if (t.closest('[data-facet-reset]')) { resetFilters(); return; }
      if ((el = t.closest('.chip[data-filter]'))) { setCategory(el.getAttribute('data-filter')); return; }
      if ((el = t.closest('.category-card[data-category-filter]'))) { setCategory(el.getAttribute('data-category-filter')); scrollToCatalog(); return; }
      if ((el = t.closest('.chip[data-faq-cat]'))) { setFaqCat(el.getAttribute('data-faq-cat')); return; }
      if (t.closest('.js-quickview-close')) { hideQuickView(); return; }
      // Touch: tapping the card body opens the bottom sheet; links and buttons keep working.
      const card = t.closest('.product-card');
      if (card && !isDesktop() && !t.closest('a, button')) {
        const product = getProduct(card.getAttribute('data-id'));
        if (product) showQuickView(product, card);
      }
    });
    document.addEventListener('change', (e) => {
      const t = e.target;
      if (!t || !t.matches) return;
      if (t.matches('[data-sort]')) { state.sort = t.value || 'featured'; applyQuery(); return; }
      if (t.name === 'category') { state.filters.category = t.value || 'all'; syncChips(); applyQuery(); renderActiveFilters(); syncUrl(); return; }
      const group = t.type === 'checkbox' ? facetSet(t.name) : null;
      if (!group) return;
      if (t.checked) group.add(t.value); else group.delete(t.value);
      applyQuery(); renderActiveFilters(); syncUrl();
    });
    document.addEventListener('input', (e) => {
      if (!priceEl || e.target !== priceEl) return;
      const value = Number(priceEl.value);
      state.filters.priceMax = isFinite(value) ? value : maxPrice;
      applyQuery(); renderActiveFilters(); syncUrl();
    });
    const facetToggle = $('#facet-toggle'), facetPanel = $('#facet-panel');
    if (facetPanel && facetToggle && window.innerWidth < 1024) facetPanel.hidden = true;   // mobile: panel starts closed
    on(facetToggle, 'click', () => {
      if (!facetPanel) return;
      const open = facetPanel.hidden;
      facetPanel.hidden = !open;
      facetToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    on(window, 'resize', () => { if (facetPanel && window.innerWidth >= 1024) facetPanel.hidden = false; });
  }

  /* ===== FAQ ===== */
  const faqGroup = (item) => item.closest('.faq-group') || item.closest('.faq-list') || document;
  function filterFAQ() {
    const items = $$('.faq-item');
    if (!items.length) return;
    const words = norm(faqQuery).trim().split(/\s+/).filter(Boolean);
    let shown = 0;
    items.forEach((item) => {
      const hitCat = faqCat === 'all' || item.getAttribute('data-faq-cat') === faqCat;
      const hitText = !words.length || words.every((w) => norm(item.textContent).indexOf(w) !== -1);
      const ok = hitCat && hitText;
      item.hidden = !ok;
      if (ok) shown++; else item.open = false;
    });
    fill('#faq-count', shown > 0 ? shown + ' câu hỏi' : 'Không tìm thấy câu hỏi phù hợp.');
  }
  function setFaqCat(cat) {
    faqCat = cat || 'all';
    $$('.chip[data-faq-cat]').forEach((chip) => { chip.classList.toggle('is-active', chip.getAttribute('data-faq-cat') === faqCat); });
    filterFAQ();
  }
  function initFAQ() {
    const items = $$('.faq-item');
    if (!items.length) return;
    document.addEventListener('toggle', (e) => {         // "toggle" does not bubble -> capture phase
      const el = e.target;
      if (!el || el.tagName !== 'DETAILS' || !el.open || !el.classList.contains('faq-item')) return;
      faqGroup(el).querySelectorAll('.faq-item').forEach((other) => { if (other !== el) other.open = false; });   // one open per group
    }, true);
    const linked = document.getElementById((window.location.hash || '').slice(1));   // deep link from another page
    if (linked && linked.classList.contains('faq-item')) {
      linked.open = true;
      if (linked.scrollIntoView) linked.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    }
    const search = $('#faq-search');
    if (search) {
      on(search, 'input', debounce(() => { faqQuery = search.value; filterFAQ(); }, DEBOUNCE));
      faqQuery = search.value || '';
      filterFAQ();
    }
  }

  /* ===== blog table of contents ===== */
  function initTabs() {
    const links = $$('.toc-list a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    const pairs = links.map((link) => ({ link: link, section: document.getElementById((link.getAttribute('href') || '').slice(1)) })).filter((pair) => !!pair.section);
    if (!pairs.length) return;
    const seen = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) seen.add(entry.target.id); else seen.delete(entry.target.id); });
      const current = pairs.filter((pair) => seen.has(pair.section.id))[0];
      pairs.forEach((pair) => {
        const active = pair === current;
        pair.link.classList.toggle('is-active', active);
        if (active) pair.link.setAttribute('aria-current', 'location'); else pair.link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-96px 0px -60% 0px' });
    pairs.forEach((pair) => observer.observe(pair.section));
  }

  /* ===== JSON-LD ItemList (home) ===== */
  function buildItemListLd() {
    const node = document.getElementById('ld-itemlist');
    if (!node || !state.products.length) return;
    node.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Danh mục gaming gear GEARZONE',
      numberOfItems: state.products.length,
      itemListElement: state.products.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: p.name,
          sku: p.id,
          brand: { '@type': 'Brand', name: p.brand },
          image: absUrl(p.image),
          description: p.shortDescription,
          offers: {
            '@type': 'Offer',
            url: absUrl(detailHref(p)),
            price: p.price,
            priceCurrency: 'VND',
            availability: 'https://schema.org/InStock',
            itemCondition: 'https://schema.org/NewCondition'
          },
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: p.rating,
            reviewCount: p.reviewCount,
            bestRating: 5,
            worstRating: 1
          }
        }
      }))
    });
  }

  /* ===== boot ===== */
  function boot() {
    loadStores();
    initNavigation(); initBackToTop(); initDelegates(); initQuickView(); initCart(); initFAQ(); initTabs(); initSearch();
    updateBadges(); renderCart(); renderActiveFilters();
    const here = page();
    if (here === 'products') readUrlParams();
    else if (here === 'compare') {
      const ids = params().get('ids');
      if (ids) state.compare = ids.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_COMPARE);
    }
    const sort = $('[data-sort]'); if (sort) sort.value = state.sort;
    loadProducts().then(() => {
      pruneStores();
      updateBadges(); renderCart(); syncChips(); syncCompareButtons(); syncSearchInputs(); renderActiveFilters();
      if (here === 'products') { initFacets(); applyQuery(); }
      else if ($('#product-grid')) renderCatalog();
      if (here === 'compare') {
        renderCompare();
        const picker = $('#compare-grid');
        if (picker) { picker.innerHTML = state.products.map(productCard).join(''); picker.removeAttribute('aria-busy'); }
      }
      if (here === 'home') { renderFeatured(); buildItemListLd(); }
      if (here === 'products') {                                 // ?id= opens that product's quick view
        const wanted = getProduct(params().get('id'));
        if (wanted) {
          const card = $$('.product-card').filter((c) => c.getAttribute('data-id') === String(wanted.id))[0];
          showQuickView(wanted, card || null);
        }
      }
      if (here === 'checkout') initCheckoutPage();
    }).catch(showLoadError);
  }

  /* ===== global API ===== */
  window.GZ = {
    loadProducts: loadProducts,
    getProducts: getProducts,
    getProduct: getProduct,
    formatVND: formatVND,
    addToCart: addToCart,
    toggleWishlist: toggleWishlist,
    addToCompare: addToCompare,
    showQuickView: showQuickView,
    toast: toast
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
