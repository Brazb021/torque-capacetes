/**
 * Modelos 3D de capacete feitos por artistas (estrutura dos capacetes de catálogo).
 * Licença CC BY 4.0: uso comercial permitido, com crédito ao autor (exibido no rodapé).
 * Fonte: Sketchfab, via cópia pública do Objaverse (Allen Institute).
 *
 * `yaw`: rotação para a frente do capacete ficar em +Z.
 * `parts`: como tratar cada peça (pelo nome da malha no arquivo):
 *   paint  → casco, recebe a pintura de catálogo
 *   accent → faixas/detalhes, na cor de acento da pintura
 *   visor  → viseira, vidro escuro espelhado
 *   glass  → viseira transparente fumê
 *   trim   → borrachas, grades e acabamentos escuros
 *   keep   → mantém o material original do modelo
 */
export const HELMET_MODELS = {
  classico: {
    label: 'Clássico (Fórmula/Endurance)',
    file: './modelos/classico.glb',
    yaw: -Math.PI / 2,
    parts: [[/^Object_3/, 'glass'], [/^Object_2/, 'paint']],
    credit: '"motorcycle helmet" de speed_show',
    url: 'https://sketchfab.com/3d-models/d77af1e61296449da833e24b46076dc0',
  },
  esportivo: {
    label: 'Esportivo',
    file: './modelos/motor-helmet.glb',
    yaw: Math.PI,
    parts: [[/^Body/, 'paint'], [/^Glass/, 'visor'], [/Stripe/, 'accent'], [/Light/, 'keep'], [/^Pattern_/, 'trim']],
    credit: '"Motor Helmet" de VerbeeckTom',
    url: 'https://sketchfab.com/3d-models/43e1596b7548478ab4a12ee433cedd5d',
  },
  agressivo: {
    label: 'Agressivo',
    file: './modelos/elementza.glb',
    yaw: 0,
    parts: [[/blinn2/, 'visor'], [/blinn1/, 'paint'], [/lambert1/, 'trim']],
    credit: '"Elementza Bike Helmet" de BaseOptimal',
    url: 'https://sketchfab.com/3d-models/02cc6c3b10d14048b06a518bb6870c40',
  },
};

/** Modelo padrão por categoria, quando a pintura não escolhe um. */
export const MODEL_BY_CATEGORY = {
  Fórmula: 'classico', Kart: 'classico', Endurance: 'classico', Fechado: 'esportivo', Rally: 'agressivo',
};

export const modelFor = (product) =>
  HELMET_MODELS[product.livery?.model] ? product.livery.model : MODEL_BY_CATEGORY[product.category] ?? 'classico';

export const MODEL_CREDITS =
  `Modelos 3D: ${Object.values(HELMET_MODELS).map((m) => m.credit).join(', ')} — Sketchfab, licença CC BY 4.0.`;
