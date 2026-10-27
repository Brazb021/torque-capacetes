import { api, money, kg, esc, qs, qsa, renderNav, cart, toast, fancyCursor, PATTERN_LABELS } from './api.js';
import { HelmetViewer } from './helmet3d.js';

const navReady = renderNav();
fancyCursor();

const slug = new URLSearchParams(location.search).get('m');
let product;
try {
  if (!slug) throw new Error('sem capacete');
  ({ product } = await api(`/products/${encodeURIComponent(slug)}`));
  if (!product) throw new Error('não encontrado');
} catch {
  document.body.innerHTML = '<div class="page wrap"><h1 class="page__title">Capacete não encontrado</h1><a class="btn" href="./">Voltar à loja</a></div>';
  throw new Error('produto não encontrado');
}

navReady.then((r) => { document.title = `${product.name} — ${r?.cfg.storeName ?? ''}`; });
qs('#bg-name').textContent = product.name.split(' ')[0];
qs('#brand').textContent = `${product.brand} · ${product.category}`;
qs('#name').textContent = product.name;
qs('#desc').textContent = product.description || 'Capacete de competição.';

// ---------- Visualizador 3D ----------
const viewer = new HelmetViewer(qs('#stage'), { controls: true, autoRotate: true, distance: 3.2 });
viewer.setProduct(product);

qs('#spin').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', on);
  viewer.setAutoRotate(on);
  photoSpin.auto = on;
});

// ---------- Fotos 360° (capacetes cadastrados por fotos) ----------
const photoSpin = { auto: true, angle: 0 };
if (product.photos.length >= 2) {
  qs('#mode').hidden = false;
  const frames = [...product.photos].sort((a, b) => a.angle - b.angle);
  const box = qs('#photos');
  box.innerHTML = frames.map((f) => `<img src="${esc(f.url)}" alt="Capacete a ${f.angle}°" style="opacity:0" draggable="false">`).join('');
  const imgs = qsa('img', box);

  // mostra a foto mais próxima do ângulo atual, com fusão suave entre duas vizinhas
  const show = () => {
    const a = ((photoSpin.angle % 360) + 360) % 360;
    let i = frames.findIndex((f, k) => a >= f.angle && a < (frames[k + 1]?.angle ?? 360 + frames[0].angle));
    if (i < 0) i = frames.length - 1;
    const j = (i + 1) % frames.length;
    const span = ((frames[j].angle - frames[i].angle + 360) % 360) || 360;
    const t = (((a - frames[i].angle) + 360) % 360) / span;
    imgs.forEach((img, k) => { img.style.opacity = k === i ? 1 - t : k === j ? t : 0; });
  };
  show();

  let dragging = false, lastX = 0;
  box.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    photoSpin.angle -= (e.clientX - lastX) * 0.6;
    lastX = e.clientX;
    show();
  });
  box.addEventListener('pointerup', () => { dragging = false; });
  const loop = () => {
    if (photoSpin.auto && !dragging && !box.hidden) { photoSpin.angle += 0.25; show(); }
    requestAnimationFrame(loop);
  };
  loop();

  qs('#mode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    qsa('#mode button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    const photos = b.dataset.mode === 'photos';
    box.hidden = !photos;
    qs('#stage').hidden = photos;
  });

  qs('#gallery-wrap').hidden = false;
  qs('#gallery').innerHTML = frames.map((f) => `<img src="${esc(f.url)}" alt="Foto a ${f.angle}°" loading="lazy">`).join('');
}

// ---------- Especificações ----------
const specs = [
  ['Peso', kg(product.weightGrams)],
  ['Tamanho', product.size],
  ['Marca', product.brand],
  ['Categoria', product.category],
  ['Casco', product.shellMaterial || '—'],
  ['Homologação', product.certification || '—'],
  ['Pintura', product.modelType === 'glb' ? 'Exclusiva (fotos reais)' : PATTERN_LABELS[product.livery.pattern] ?? '—'],
  ['Acabamento', product.livery.finish === 'matte' ? 'Fosco' : 'Brilhante'],
];
qs('#specs').innerHTML = specs.map(([k, v]) => `<div class="spec"><dt class="mono muted">${k}</dt><dd>${esc(v)}</dd></div>`).join('');

// ---------- Compra ----------
function renderBuy() {
  const s = product.stock;
  const stockClass = s <= 0 ? 'stock--out' : s <= 3 ? 'stock--low' : '';
  const stockText = s <= 0 ? 'Esgotado' : s <= 3 ? `Últimas ${s} unidades` : `${s} unidades em estoque`;
  const c = product.livery.colors ?? {};
  qs('#buy').innerHTML = `
    <span class="mono muted">${esc(product.brand)}</span>
    <div class="buy__price">${money(product.priceCents)}</div>
    <span class="muted" style="font-size:14px">ou 10x de ${money(Math.ceil(product.priceCents / 10))} sem juros</span><br>
    <span class="stock mono ${stockClass}">${stockText}</span>
    <div class="buy__row">
      <div class="qty"><button type="button" data-q="-1" aria-label="Diminuir">−</button><input id="qty" type="number" value="1" min="1" max="${Math.max(1, Math.min(10, s))}" aria-label="Quantidade"><button type="button" data-q="1" aria-label="Aumentar">+</button></div>
      <button class="btn btn--accent" id="add" disabled title="Versão de portfólio">Compras desativadas no portfólio</button>
    </div>
    <div class="palette">${[['primary', 'Base'], ['secondary', 'Detalhe'], ['accent', 'Acento']]
      .filter(([k]) => c[k]).map(([k, label]) => `<span><i style="background:${esc(c[k])}"></i>${label}</span>`).join('')}</div>`;

  const input = qs('#qty');
  qsa('[data-q]').forEach((b) => b.addEventListener('click', () => {
    input.value = Math.min(Number(input.max), Math.max(1, Number(input.value) + Number(b.dataset.q)));
  }));
  qs('#add').addEventListener('click', () => {
    const inCart = cart.read().find((i) => i.productId === product.id)?.quantity ?? 0;
    const q = Math.max(1, Math.min(Number(input.value) || 1, product.stock - inCart));
    if (q <= 0 || inCart >= product.stock) return toast('Você já tem todo o estoque disponível no carrinho.', 'error');
    cart.add(product.id, q);
    toast(`${product.name} adicionado ao carrinho.`);
  });
}
renderBuy();
