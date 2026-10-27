// Utilitários compartilhados por todas as páginas.
import { MODEL_CREDITS } from './models.js';

const getJson = async (file) => (await fetch(file)).json();
/** Versão de portfólio: os dados vêm de arquivos JSON (não há servidor). */
export async function api(p) {
  if (p === '/config') return getJson('data/config.json');
  if (p === '/products') return getJson('data/products.json');
  if (p === '/auth/me') return { user: null };
  const m = p.match(/^\/products\/(.+)$/);
  if (m) {
    const product = (await getJson('data/products.json')).products.find((x) => x.slug === decodeURIComponent(m[1]));
    if (product) return { product };
  }
  throw Object.assign(new Error('Indisponível na versão de portfólio.'), { status: 404 });
}

export const money = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const kg = (g) => `${(g / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const qs = (s, root = document) => root.querySelector(s);
export const qsa = (s, root = document) => [...root.querySelectorAll(s)];

// ---------- Sessão ----------

let mePromise;
export function getMe() {
  mePromise ??= api('/auth/me').then((d) => d.user).catch(() => null);
  return mePromise;
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' });
  location.href = '/';
}

// ---------- Carrinho (localStorage) ----------

const CART_KEY = 'cart.v1';
export const cart = {
  read() {
    let items;
    try { items = JSON.parse(localStorage.getItem(CART_KEY)); } catch { items = null; }
    // o armazenamento local pode ter sido mexido: só aceita números inteiros válidos
    return (Array.isArray(items) ? items : [])
      .map((i) => ({ productId: Number(i?.productId), quantity: Number(i?.quantity) }))
      .filter((i) => Number.isInteger(i.productId) && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 10);
  },
  write(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* armazenamento indisponível */ }
    window.dispatchEvent(new Event('cart:change'));
  },
  add(productId, quantity = 1) {
    const items = this.read();
    const found = items.find((i) => i.productId === productId);
    if (found) found.quantity = Math.min(10, found.quantity + quantity);
    else items.push({ productId, quantity });
    this.write(items);
  },
  set(productId, quantity) {
    this.write(this.read().map((i) => (i.productId === productId ? { ...i, quantity } : i)).filter((i) => i.quantity > 0));
  },
  clear() { this.write([]); },
  count() { return this.read().reduce((s, i) => s + i.quantity, 0); },
};

// ---------- UI ----------

export function toast(message, type = 'ok') {
  let host = qs('.toasts');
  if (!host) { host = document.createElement('div'); host.className = 'toasts'; document.body.append(host); }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}

/** Cabeçalho comum: logo, links, conta e carrinho. */
export async function renderNav() {
  const nav = qs('[data-nav]');
  if (!nav) return;
  const cfg = await api('/config').catch(() => ({ storeName: 'TORQUE Capacetes' }));
  const [brand, ...rest] = cfg.storeName.split(' ');
  const me = await getMe();
  nav.innerHTML = `
    <a class="nav__logo" href="./"><span>${esc(brand)}</span><small>${esc(rest.join(' '))}</small></a>
    <nav class="nav__links">
      <a href="./#colecao">Coleção</a>
      <span class="mono muted" style="font-size:12px">Portfólio</span>
    </nav>`;
  const updateCount = () => {
    const n = cart.count();
    const el = qs('[data-cart-count]', nav);
    if (!el) return;
    el.textContent = n || '';
    el.hidden = !n;
  };
  updateCount();
  window.addEventListener('cart:change', updateCount);
  window.addEventListener('storage', updateCount);
  window.addEventListener('scroll', () => nav.classList.toggle('nav--scrolled', scrollY > 30), { passive: true });
  document.title = document.title.replace('{loja}', cfg.storeName);
  qsa('[data-store-name]').forEach((el) => { el.textContent = cfg.storeName; });
  // crédito exigido pela licença dos modelos 3D (CC BY 4.0)
  qsa('[data-credit]').forEach((el) => { el.textContent = MODEL_CREDITS; });
  portfolioFooter();
  return { cfg, me };
}

/** Rodapé da versão de portfólio. */
function portfolioFooter() {
  if (qs('.legal-footer')) return;
  const el = document.createElement('div');
  el.className = 'legal-footer';
  el.innerHTML = '<span>Projeto de portfólio — vitrine 3D. A loja completa (Node.js, cadastro, carrinho, Pix e cartão via Mercado Pago, painel admin com auditoria e IA 3D por fotos) roda em servidor próprio.</span>';
  document.body.append(el);
}

/** Links das políticas no fim de todas as páginas. */
function legalFooter() {
  if (qs('.legal-footer')) return;
  const el = document.createElement('div');
  el.className = 'legal-footer';
  el.innerHTML = '<a href="/privacidade.html">Política de Privacidade</a><a href="/cookies.html">Política de Cookies</a><span>Nunca pedimos senha ou pagamento por WhatsApp.</span>';
  document.body.append(el);
}

/** Aviso de cookies (só usamos cookies essenciais, então é informativo: basta "Entendi"). */
function cookieNotice() {
  const KEY = 'cookie-notice.v1';
  try { if (localStorage.getItem(KEY)) return; } catch { /* sem armazenamento: mostra o aviso */ }
  const el = document.createElement('div');
  el.className = 'cookie-notice';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Aviso de cookies');
  el.innerHTML = `<p>Usamos apenas cookies <b>essenciais</b> para manter você conectado e guardar seu carrinho. Nada de rastreamento ou publicidade.
    <a href="/cookies.html">Saiba mais</a></p><button class="btn btn--sm btn--accent" type="button">Entendi</button>`;
  el.querySelector('button').addEventListener('click', () => {
    try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* ignora */ }
    el.remove();
  });
  document.body.append(el);
}

/** Cursor customizado (anel que segue o mouse e cresce sobre itens interativos). */
export function fancyCursor() {
  if (!matchMedia('(pointer: fine)').matches) return;
  const ring = document.createElement('div');
  ring.className = 'cursor';
  ring.innerHTML = '<span></span>';
  document.body.append(ring);
  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y;
  addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; });
  const loop = () => {
    x += (tx - x) * 0.2; y += (ty - y) * 0.2;
    ring.style.transform = `translate(${x}px, ${y}px)`;
    requestAnimationFrame(loop);
  };
  loop();
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-cursor]');
    ring.classList.toggle('cursor--big', Boolean(t));
    ring.querySelector('span').textContent = t?.dataset.cursor ?? '';
  });
}

/** Revela elementos com [data-reveal] ao entrar na tela. */
export function reveal() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  qsa('[data-reveal]').forEach((el) => io.observe(el));
  return io;
}

export const PATTERN_LABELS = {
  stripes: 'Faixas', split: 'Bicolor', chevron: 'Chevron', checkered: 'Quadriculado',
  fade: 'Degradê', shards: 'Estilhaços', carbon: 'Carbono', solid: 'Liso',
};

export const ORDER_STATUS = {
  pending_payment: 'Aguardando pagamento', paid: 'Pago', cancelled: 'Cancelado', shipped: 'Enviado', delivered: 'Entregue',
};
