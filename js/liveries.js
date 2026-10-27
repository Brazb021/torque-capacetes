/**
 * Pinturas de catálogo (modelos pré-prontos), desenhadas em canvas.
 * Mapeamento esférico em volta do centro do capacete:
 *   x do canvas = azimute (phi / 2π), y do canvas = theta / THETA_LEN (topo = 0).
 *   phi = π/2 é a FRENTE (+z), phi = 3π/2 a traseira, phi = 0 o lado direito do piloto (−x).
 */
export const THETA_LEN = Math.PI * 0.74;
export const TEX_W = 2048;
export const TEX_H = 1024;
// faixa da viseira (topo da faixa e altura): as pinturas param acima dela na frente
const VISOR_THETA = [Math.PI * 0.35, Math.PI * 0.2];

// ---------------------------------------------------------------------------
// Pinturas de catálogo (modelos pré-prontos)
// ---------------------------------------------------------------------------

const X = (phi) => (phi / (Math.PI * 2)) * TEX_W;
const Y = (theta) => (theta / THETA_LEN) * TEX_H;
const FRONT = X(Math.PI / 2), BACK = X(Math.PI * 1.5), LEFT = X(Math.PI);

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hashStr(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** Texto sem distorção na esfera (compensa o estiramento horizontal do UV). */
function drawText(ctx, text, x, theta, size, color, { stroke = null, weight = 800 } = {}) {
  const sx = 0.74 / Math.max(0.35, Math.sin(theta));
  ctx.save();
  ctx.translate(x, Y(theta));
  ctx.scale(sx, 1);
  ctx.font = `${weight} ${size}px "Unbounded", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = size * 0.12; ctx.strokeStyle = stroke; ctx.strokeText(text, 0, 0); }
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function contrast(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? '#111214' : '#f4f4f0';
}

const painters = {
  solid(ctx, c) {
    ctx.fillStyle = c.primary; ctx.fillRect(0, 0, TEX_W, TEX_H);
    ctx.fillStyle = c.accent; ctx.fillRect(0, TEX_H * 0.9, TEX_W, 10);
  },
  stripes(ctx, c) {
    ctx.fillStyle = c.primary; ctx.fillRect(0, 0, TEX_W, TEX_H);
    for (const cx of [FRONT, BACK]) {
      const end = cx === FRONT ? Y(VISOR_THETA[0]) - 6 : TEX_H;
      ctx.fillStyle = c.secondary;
      ctx.fillRect(cx - 70, 0, 52, end); ctx.fillRect(cx + 18, 0, 52, end);
      ctx.fillStyle = c.accent;
      ctx.fillRect(cx - 12, 0, 24, end);
    }
    ctx.fillStyle = c.secondary; ctx.fillRect(0, TEX_H * 0.86, TEX_W, 40);
  },
  split(ctx, c) {
    ctx.fillStyle = c.primary; ctx.fillRect(0, 0, TEX_W, TEX_H);
    ctx.fillStyle = c.secondary;
    ctx.beginPath();
    ctx.moveTo(FRONT, 0);
    for (let y = 0; y <= TEX_H; y += 16) ctx.lineTo(FRONT + Math.sin(y / 90) * 40, y);
    ctx.lineTo(BACK + Math.sin(TEX_H / 90) * 40, TEX_H);
    for (let y = TEX_H; y >= 0; y -= 16) ctx.lineTo(BACK + Math.sin(y / 90) * 40, y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c.accent; ctx.lineWidth = 14;
    for (const cx of [FRONT, BACK]) {
      ctx.beginPath();
      for (let y = 0; y <= TEX_H; y += 16) ctx.lineTo(cx + Math.sin(y / 90) * 40, y);
      ctx.stroke();
    }
  },
  chevron(ctx, c) {
    ctx.fillStyle = c.primary; ctx.fillRect(0, 0, TEX_W, TEX_H);
    ctx.lineJoin = 'miter';
    // nos dois lados, as setas apontam para a frente
    for (const [center, dir] of [[LEFT, -1], [0, 1], [TEX_W, 1]]) {
      for (let i = 0; i < 4; i++) {
        const apex = center + dir * (180 - i * 120);
        ctx.strokeStyle = i % 2 ? c.accent : c.secondary;
        ctx.lineWidth = 46;
        ctx.beginPath();
        ctx.moveTo(apex - dir * 220, TEX_H * 0.38);
        ctx.lineTo(apex, TEX_H * 0.62);
        ctx.lineTo(apex - dir * 220, TEX_H * 0.86);
        ctx.stroke();
      }
    }
    ctx.fillStyle = c.secondary; ctx.fillRect(BACK - 20, 0, 40, TEX_H);
  },
  checkered(ctx, c) {
    ctx.fillStyle = c.primary; ctx.fillRect(0, 0, TEX_W, TEX_H);
    const s = 64, y0 = TEX_H * 0.58;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < TEX_W / s; col++) {
        if ((row + col) % 2) continue;
        ctx.fillStyle = c.secondary;
        ctx.fillRect(col * s, y0 + row * s, s, s);
      }
    }
    ctx.fillStyle = c.accent; ctx.fillRect(0, y0 - 22, TEX_W, 14); ctx.fillRect(0, y0 + 4 * s + 8, TEX_W, 14);
  },
  fade(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, TEX_H);
    g.addColorStop(0, c.accent); g.addColorStop(0.25, c.primary); g.addColorStop(0.95, c.secondary);
    ctx.fillStyle = g; ctx.fillRect(0, 0, TEX_W, TEX_H);
    const rnd = seeded(7);
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() > 0.5 ? c.accent : c.secondary;
      ctx.beginPath(); ctx.arc(rnd() * TEX_W, TEX_H * (0.45 + rnd() * 0.55), 2 + rnd() * 9, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
  shards(ctx, c, seed) {
    ctx.fillStyle = c.primary; ctx.fillRect(0, 0, TEX_W, TEX_H);
    const rnd = seeded(seed);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * TEX_W, y = TEX_H * (0.3 + rnd() * 0.7), s = 60 + rnd() * 200;
      ctx.fillStyle = rnd() > 0.35 ? c.secondary : c.accent;
      ctx.globalAlpha = 0.6 + rnd() * 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + s * (rnd() - 0.2), y - s * rnd()); ctx.lineTo(x + s * rnd(), y + s * 0.3 * rnd());
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
  carbon(ctx, c) {
    const t = 16;
    for (let y = 0; y < TEX_H; y += t) {
      for (let x = 0; x < TEX_W; x += t) {
        const twill = ((x / t + y / t) >> 1) % 2;
        const g = ctx.createLinearGradient(x, y, twill ? x + t : x, twill ? y : y + t);
        g.addColorStop(0, c.primary); g.addColorStop(0.5, c.accent); g.addColorStop(1, c.primary);
        ctx.fillStyle = g; ctx.fillRect(x, y, t, t);
      }
    }
    ctx.fillStyle = c.secondary;
    ctx.fillRect(0, TEX_H * 0.8, TEX_W, 18);
    for (const cx of [FRONT, BACK]) ctx.fillRect(cx - 9, 0, 18, cx === FRONT ? Y(VISOR_THETA[0]) : TEX_H);
  },
};

export function paintLivery(livery, seedText = '') {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W; canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  const c = livery.colors;
  (painters[livery.pattern] ?? painters.solid)(ctx, c, hashStr(seedText || livery.pattern));

  const t0 = VISOR_THETA[0];

  if (livery.logoText) {
    const ink = contrast(c.primary);
    drawText(ctx, livery.logoText, FRONT, t0 - 0.13, 64, ink);
    drawText(ctx, livery.logoText, BACK, Math.PI * 0.5, 72, ink);
  }
  if (livery.number) {
    for (const cx of [LEFT, 0, TEX_W]) {
      ctx.save();
      ctx.translate(cx, Y(Math.PI * 0.5));
      ctx.scale(0.74, 1);
      ctx.fillStyle = '#f4f4f0';
      ctx.beginPath(); ctx.arc(0, 0, 105, 0, 7); ctx.fill();
      ctx.lineWidth = 12; ctx.strokeStyle = c.secondary; ctx.stroke();
      ctx.restore();
      drawText(ctx, livery.number, cx, Math.PI * 0.5, 120, '#111214', { weight: 900 });
    }
  }
  return canvas;
}

