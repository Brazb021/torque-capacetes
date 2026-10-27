import { api, money, esc, qs, qsa, renderNav, fancyCursor, reveal } from './api.js';
import { HelmetViewer, HelmetStudio } from './helmet3d.js';

renderNav();
fancyCursor();
qs('#year').textContent = new Date().getFullYear();

// título do hero: letras sobem uma a uma
let i = 0;
qsa('[data-split]').forEach((el) => {
  el.innerHTML = [...el.textContent].map((ch) => `<span style="--i:${i++}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
});

const { products } = await api('/products');
const io = reveal();

// ---------- Hero: capacete em destaque ----------
if (products.length) {
  const hero = new HelmetViewer(qs('#hero-stage'), { controls: true, autoRotate: true, distance: 3.6 });
  hero.controls.enableZoom = false;
  hero.setProduct(products[0]);
}

// ---------- Coleção ----------
const studio = new HelmetStudio(560);
const grid = qs('#grid');
const categories = ['Todos', ...new Set(products.map((p) => p.category))];
let current = 'Todos';

qs('#filters').innerHTML = categories
  .map((c) => `<button class="chip" aria-pressed="${c === current}" data-cat="${esc(c)}">${esc(c)}</button>`)
  .join('');
qs('#filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  current = b.dataset.cat;
  qsa('.chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
  renderGrid();
});

function card(p, idx) {
  const c = p.livery.colors ?? {};
  const out = p.stock <= 0;
  return `
    <a class="card" href="./capacete.html?m=${encodeURIComponent(p.slug)}" data-slug="${esc(p.slug)}" data-cursor="Ver 360°"
       style="--tint:${esc(c.secondary ?? '#ff4d1a')}; --d:${(idx % 3) * 0.08}s" data-reveal>
      ${p.modelType === 'glb' ? '<span class="card__badge">Fotos reais</span>' : ''}
      <div class="card__top">
        <span class="card__index">${String(idx + 1).padStart(2, '0')}</span>
        <span class="mono muted">${esc(p.category)}</span>
      </div>
      <div class="card__stage">
        <canvas width="560" height="560" aria-label="${esc(p.name)}"></canvas>
        ${out ? '<span class="card__out">ESGOTADO</span>' : ''}
      </div>
      <div class="card__body">
        <div>
          <span class="mono muted">${esc(p.brand)}</span>
          <h3 class="card__name">${esc(p.name)}</h3>
          <div class="card__swatches">${['primary', 'secondary', 'accent'].map((k) => (c[k] ? `<i style="background:${esc(c[k])}"></i>` : '')).join('')}</div>
        </div>
        <span class="card__price">${money(p.priceCents)}</span>
      </div>
    </a>`;
}

async function renderGrid() {
  const list = products.filter((p) => current === 'Todos' || p.category === current);
  qs('#count').textContent = `(${list.length})`;
  grid.innerHTML = list.length ? list.map(card).join('') : '<p class="empty">Nenhum capacete nesta categoria.</p>';
  qsa('[data-reveal]', grid).forEach((el) => io.observe(el));

  for (const el of qsa('.card', grid)) {
    const p = products.find((x) => x.slug === el.dataset.slug);
    const canvas = el.querySelector('canvas');
    await studio.draw(p, -0.55, canvas);
    attachSpin(el, p, canvas);
  }
}

/** No hover o capacete gira; segue o mouse na horizontal. */
function attachSpin(el, p, canvas) {
  let raf = 0, angle = -0.55, target = null, hovering = false;
  const loop = () => {
    angle += target === null ? 0.025 : (target - angle) * 0.12;
    studio.draw(p, angle, canvas);
    if (hovering || Math.abs((target ?? angle) - angle) > 0.002) raf = requestAnimationFrame(loop);
    else raf = 0;
  };
  el.addEventListener('pointerenter', () => { hovering = true; target = null; if (!raf) loop(); });
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    target = -0.55 + ((e.clientX - r.left) / r.width - 0.5) * Math.PI * 1.4;
  });
  el.addEventListener('pointerleave', () => { hovering = false; target = -0.55; if (!raf) loop(); });
}

renderGrid();
