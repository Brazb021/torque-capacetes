/**
 * Motor 3D dos capacetes.
 *
 *  - Capacetes de catálogo: modelos 3D feitos por artistas (models.js), com a pintura
 *    de catálogo aplicada no casco, viseira de vidro e acabamentos próprios.
 *  - Capacetes cadastrados por fotos: malha 3D gerada pela IA local (GLB) + as
 *    FOTOS REAIS projetadas sobre a malha (pintura fiel ao capacete físico).
 *
 * Convenção do espaço do capacete: frente = +Z, topo = +Y, lado direito do piloto = −X.
 * Foto a A graus: câmera em (−sen A, 0, cos A) — 0° frente, 90° direita, 180° traseira, 270° esquerda.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { paintLivery, THETA_LEN } from './liveries.js';
import { HELMET_MODELS, modelFor } from './models.js';

// Rotação aplicada às malhas geradas pelo Hunyuan3D-2 para a frente ficar em +Z.
const AI_MESH_YAW = 0;

// ---------------------------------------------------------------------------
// Estúdio: ambiente de luz para reflexos de verniz (softboxes e faixas)
// ---------------------------------------------------------------------------

function studioEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0a0a0c, side: THREE.BackSide })));
  const panel = (w, h, intensity, pos, look, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    scene.add(m);
  };
  panel(10, 6, 3.2, [0, 9, 1], [0, 0, 0]);            // softbox principal (teto)
  panel(2, 9, 2.2, [-8, 1, 3], [0, 0, 0]);            // faixa lateral esquerda
  panel(2, 9, 1.6, [8, 1, 2], [0, 0, 0]);             // faixa lateral direita
  panel(12, 1.2, 2.5, [0, 2, -9], [0, 0, 0]);         // faixa de contorno traseira
  panel(6, 2, 0.6, [0, -6, 5], [0, 0, 0], 0xfff2e6);  // rebatedor quente embaixo
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return tex;
}

function contactShadowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}

// ---------------------------------------------------------------------------
// Carregamento de malhas e configuração da loja
// ---------------------------------------------------------------------------

const gltf = new GLTFLoader();
const meshCache = new Map();
const texLoader = new THREE.TextureLoader();
const textureCache = new Map();

function loadGeometry(url) {
  if (!meshCache.has(url)) {
    meshCache.set(url, gltf.loadAsync(url).then((g) => {
      const geos = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        if (o.isMesh) geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
      });
      const geo = geos[0];
      geo.deleteAttribute('uv');
      geo.deleteAttribute('color');
      return geo;
    }));
  }
  return meshCache.get(url);
}

function loadTexture(url) {
  if (!textureCache.has(url)) {
    textureCache.set(url, texLoader.loadAsync(url).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    }));
  }
  return textureCache.get(url);
}


// ---------------------------------------------------------------------------
// Material com projeção das fotos reais sobre a malha
// ---------------------------------------------------------------------------

/**
 * @param {THREE.BufferGeometry} geometry  já orientada (frente = +Z)
 * @param {{texture:THREE.Texture, angle:number, bbox:{x,y,w,h}}[]} views
 * @param {THREE.Texture|null} livery  pintura de catálogo (aplicada onde a foto é tinta clara)
 */
function projectionMaterial(geometry, views, livery = null, matte = false, { cavity = true, darkGloss = true, liner = false } = {}) {
  const liveryOnly = Boolean(livery) && views.length === 0;
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  const uniforms = {};
  views.forEach((view, i) => {
    const a = (view.angle * Math.PI) / 180;
    const dir = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const right = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    // silhueta da malha vista daquele ângulo: alinha com a bbox do capacete na foto
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const sx = v.dot(right);
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
      if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    }
    uniforms[`uTex${i}`] = { value: view.texture };
    uniforms[`uDir${i}`] = { value: dir };
    uniforms[`uRight${i}`] = { value: right };
    uniforms[`uBounds${i}`] = { value: new THREE.Vector4(minX, maxX, minY, maxY) };
    uniforms[`uBox${i}`] = { value: new THREE.Vector4(view.bbox.x, view.bbox.y, view.bbox.w, view.bbox.h) };
  });
  uniforms.uLivery = { value: livery };
  // Fotos já trazem luz "embutida": parte da cor entra como emissiva para não escurecer.
  // Pintura de catálogo pura usa iluminação física (verniz de carro).
  uniforms.uSelfLit = { value: liveryOnly ? 0.06 : 0.55 };

  const material = new THREE.MeshPhysicalMaterial({
    color: liveryOnly ? 0xffffff : 0x9a9a9a,
    roughness: matte ? 0.62 : liveryOnly ? 0.26 : 0.32,
    metalness: 0.0,
    clearcoat: matte ? 0.0 : 1.0,
    clearcoatRoughness: 0.03,
    envMapIntensity: liveryOnly ? 1.0 : 0.9,
  });

  // Mistura das fotos: cada ponto do casco usa quase só a foto que o vê mais de frente
  // (as vizinhas entram só numa faixa estreita de transição). Misturar várias fotos com peso
  // parecido gerava "imagem dupla" (viseira e letras repetidas) quando os ângulos não batiam.
  // Reflexos de luz (branco estourado e sem cor) perdem peso: outra foto preenche a área.
  const maxDot = views.map((_, i) => `cMax = max(cMax, dot(pn, uDir${i}));`).join(' ');
  const perView = views.map((_, i) => `
    {
      float c = dot(pn, uDir${i});
      // > -0.25: o topo do casco (que nenhuma foto vê de frente) recebe a borda das fotos
      if (c > -0.25) {
        float cc = c + 0.25;
        float sx = dot(vObjPos, uRight${i});
        vec2 uv = vec2(
          uBox${i}.x + uBox${i}.z * (sx - uBounds${i}.x) / (uBounds${i}.y - uBounds${i}.x),
          1.0 - (uBox${i}.y + uBox${i}.w * (uBounds${i}.w - vObjPos.y) / (uBounds${i}.w - uBounds${i}.z)));
        vec4 s = texture2D(uTex${i}, uv);
        float hi = max(s.r, max(s.g, s.b));
        float glare = smoothstep(0.80, 0.97, hi) * (1.0 - smoothstep(0.06, 0.22, hi - min(s.r, min(s.g, s.b))));
        float w = exp(-14.0 * (cMax - c)) * cc * smoothstep(0.2, 0.9, s.a) * (1.0 - 0.92 * glare) + 1e-5 * s.a;
        acc += vec4(s.rgb * w, w);
        seen = max(seen, cc * smoothstep(0.2, 0.9, s.a));
      }
    }`).join('');

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjNormal = normal;');

    const decl = views.map((_, i) => `uniform sampler2D uTex${i}; uniform vec3 uDir${i}; uniform vec3 uRight${i}; uniform vec4 uBounds${i}; uniform vec4 uBox${i};`).join('\n');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObjPos; varying vec3 vObjNormal;
        uniform float uSelfLit;
        ${livery ? '#define USE_LIVERY\nuniform sampler2D uLivery;' : ''}
        ${cavity ? '#define USE_CAVITY' : ''}
        ${darkGloss ? '#define USE_DARK_GLOSS' : ''}
        ${liner ? '#define USE_LINER' : ''}
        ${decl}`)
      .replace('#include <map_fragment>', `
        vec3 pn = normalize(vObjNormal);
        vec4 acc = vec4(0.0);
        float cMax = 0.0;
        float seen = 0.0;
        ${maxDot}
        ${perView}
        // regiões que nenhuma foto enxerga recebem um neutro claro (a pintura cobre por cima)
        float coverage = smoothstep(0.0, 0.08, seen);
        vec3 projColor = mix(vec3(0.72), acc.rgb / max(acc.w, 1e-4), coverage);
        float projLum = dot(projColor, vec3(0.2126, 0.7152, 0.0722));
        #ifdef USE_LIVERY
          vec3 sd = normalize(vObjPos);
          float phi = atan(sd.z, -sd.x);
          if (phi < 0.0) phi += 6.2831853;
          float theta = acos(clamp(sd.y, -1.0, 1.0));
          vec3 liv = texture2D(uLivery, vec2(phi / 6.2831853, 1.0 - theta / ${THETA_LEN.toFixed(6)})).rgb;
          float paint = smoothstep(0.10, 0.28, projLum);          // tinta clara do capacete base
          projColor = mix(projColor, liv * clamp(projLum / 0.62, 0.0, 1.25), paint);
          #ifdef USE_CAVITY
            // Viseira/abertura do rosto detectadas pela geometria: onde a superfície aponta para
            // dentro do capacete (cavidade), fica escuro e espelhado em vez de pintado.
            float outward = dot(pn, normalize(vObjPos));
            float cavity = 1.0 - smoothstep(0.05, 0.4, outward);
            projColor = mix(projColor, vec3(0.012, 0.014, 0.018), cavity);
            projLum = mix(projLum, 0.0, cavity);
          #endif
        #endif
        #ifdef USE_LINER
          // lado de dentro de cascos modelados como superfície única: forro escuro
          if (!gl_FrontFacing) { projColor = vec3(0.025, 0.026, 0.03); projLum = 0.0; }
        #endif
        diffuseColor.rgb *= projColor;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        #ifdef USE_DARK_GLOSS
          // áreas muito escuras (viseira da foto) ficam espelhadas
          roughnessFactor = mix(roughnessFactor, 0.03, 1.0 - smoothstep(0.015, 0.09, projLum));
        #endif`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        #ifdef USE_DARK_GLOSS
          metalnessFactor = mix(metalnessFactor, 0.7, 1.0 - smoothstep(0.015, 0.09, projLum));
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += projColor * uSelfLit;`);
  };
  if (liner) material.side = THREE.DoubleSide;
  material.customProgramCacheKey = () => `proj2-${views.length}-${Boolean(livery)}-${cavity}-${darkGloss}-${liner}`;
  return material;
}

// ---------------------------------------------------------------------------
// Montagem do capacete
// ---------------------------------------------------------------------------

async function photoViews(photos) {
  const usable = photos.filter((p) => p.cutout && p.bbox);
  return Promise.all(usable.map(async (p) => ({ texture: await loadTexture(p.cutout), angle: p.angle, bbox: p.bbox })));
}

async function realHelmet(glbUrl, photos, projection = {}) {
  const geometry = (await loadGeometry(glbUrl)).clone();
  geometry.rotateY(AI_MESH_YAW + (projection.yaw ?? 0));
  if (projection.pitch) geometry.rotateX(projection.pitch);
  geometry.computeVertexNormals();
  // centraliza para o mapeamento esférico da pintura partir do meio do capacete
  geometry.computeBoundingBox();
  geometry.translate(...geometry.boundingBox.getCenter(new THREE.Vector3()).negate().toArray());
  const views = await photoViews(photos);
  const mesh = new THREE.Mesh(geometry, projectionMaterial(geometry, views));
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

const sceneCache = new Map();
const loadScene = (url) => {
  if (!sceneCache.has(url)) sceneCache.set(url, gltf.loadAsync(url).then((g) => g.scene));
  return sceneCache.get(url);
};

/**
 * Capacete de catálogo sobre um modelo 3D feito por artista: o casco recebe a pintura
 * (mapeamento esférico em volta do centro), a viseira vira vidro espelhado e faixas,
 * grades e borrachas ganham materiais próprios.
 */
async function artistHelmet(product, modelId) {
  const cfg = HELMET_MODELS[modelId];
  const scene = await loadScene(cfg.file);
  scene.updateMatrixWorld(true);

  // junta todas as peças num espaço comum: centralizado, frente em +Z
  const parts = [];
  const box = new THREE.Box3();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox);
    const role = cfg.parts.find(([re]) => re.test(o.name))?.[1] ?? 'keep';
    parts.push({ geometry, role, original: o.material });
  });
  const center = box.getCenter(new THREE.Vector3());
  const scale = 2 / box.getSize(new THREE.Vector3()).length();

  const livery = product.livery ?? {};
  const c = livery.colors ?? {};
  await document.fonts.load('800 64px "Unbounded"').catch(() => {});
  const tex = new THREE.CanvasTexture(paintLivery(livery, product.slug));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const materials = {
    accent: () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(c.secondary ?? '#ff4d1a'), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04 }),
    visor: () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(c.visor ?? '#1a1d24'), metalness: 0.85, roughness: 0.03,
      clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, iridescence: 0.25,
    }),
    trim: () => new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.55, metalness: 0.15 }),
    // viseira transparente fumê (vê-se o casco e o interior através dela)
    glass: () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(c.visor ?? '#1a1d24').lerp(new THREE.Color('#ffffff'), 0.35),
      metalness: 0, roughness: 0.02, transparent: true, opacity: 0.32, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 2.2, side: THREE.DoubleSide,
    }),
  };

  const group = new THREE.Group();
  for (const { geometry, role, original } of parts) {
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(scale, scale, scale);
    geometry.rotateY(cfg.yaw);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const material = role === 'paint'
      ? projectionMaterial(geometry, [], tex, livery.finish === 'matte', { cavity: true, darkGloss: false, liner: true })
      : role === 'keep' ? original : materials[role]();
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}

/**
 * Monta o capacete de um produto (sempre assíncrono: malhas e fotos são carregadas).
 * `override` permite pré-visualizar no admin: { glb, photos, projection }.
 */
export async function buildHelmet(product, override = null) {
  if (override?.glb) return realHelmet(override.glb, override.photos, override.projection);
  if (product.glb) return realHelmet(product.glb, product.photos, product.projection);
  return artistHelmet(product, modelFor(product));
}

/** Centraliza o capacete e padroniza o tamanho (raio ≈ 0,8) para todas as câmeras enquadrarem igual. */
function frame(group) {
  let box = new THREE.Box3().setFromObject(group);
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  group.scale.multiplyScalar(0.8 / radius);
  box = new THREE.Box3().setFromObject(group);
  group.position.sub(box.getCenter(new THREE.Vector3()));
  return { height: box.getSize(new THREE.Vector3()).y };
}

// ---------------------------------------------------------------------------
// Visualizador interativo
// ---------------------------------------------------------------------------

export class HelmetViewer {
  constructor(container, { controls = true, autoRotate = true, parallax = false, distance = 3.3 } = {}) {
    this.container = container;
    this.distance = distance;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.environment = studioEnvironment(this.renderer);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    this.camera.position.set(1.6, 0.45, 2.7).setLength(distance);

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    this.rimLight = new THREE.DirectionalLight(0xff6a3d, 1.4);
    this.rimLight.position.set(-3, 1, -3);
    this.scene.add(this.rimLight);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    if (controls) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.enablePan = false;
      this.controls.minDistance = distance * 0.55;
      this.controls.maxDistance = distance * 1.8;
      this.controls.autoRotate = autoRotate;
      this.controls.autoRotateSpeed = 1.4;
    }
    this.autoSpin = !controls && autoRotate;
    this.parallax = parallax;
    this.mouse = { x: 0, y: 0 };
    if (parallax) {
      window.addEventListener('pointermove', (e) => {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
      });
    }

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  async setProduct(product, override = null) {
    const token = (this.token = Symbol('load'));
    const helmet = await buildHelmet(product, override);
    if (token !== this.token) return; // outro produto foi pedido no meio do caminho
    this.pivot.clear();
    const { height } = frame(helmet);
    this.pivot.add(helmet);
    this.shadow.position.y = -height / 2 - 0.01;
    const accent = product.livery?.colors?.secondary;
    if (accent) this.rimLight.color.set(accent);
    this.helmet = helmet;
  }

  setAutoRotate(on) {
    if (this.controls) this.controls.autoRotate = on;
    else this.autoSpin = on;
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // telas em pé (celular): abre o campo de visão para o capacete caber na largura
    this.camera.fov = Math.min(58, 30 / Math.min(1, this.camera.aspect * 1.1));
    this.camera.updateProjectionMatrix();
  }

  tick() {
    const dt = this.clock.getDelta();
    if (this.autoSpin) this.pivot.rotation.y += dt * 0.35;
    if (this.parallax) {
      this.pivot.rotation.x += (this.mouse.y * 0.2 - this.pivot.rotation.x) * 0.05;
      this.pivot.position.x += (this.mouse.x * 0.1 - this.pivot.position.x) * 0.05;
    }
    this.controls?.update();
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }
}

/**
 * Um único renderizador compartilhado para desenhar vários capacetes em
 * cards (navegadores limitam a quantidade de contextos WebGL por página).
 */
export class HelmetStudio {
  constructor(size = 640) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.scene = new THREE.Scene();
    this.scene.environment = studioEnvironment(this.renderer);
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 100);
    this.camera.position.set(0, 0.35, 4.3);
    this.camera.lookAt(0, -0.02, 0);
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    this.rim = new THREE.DirectionalLight(0xffffff, 1.2);
    this.rim.position.set(-3, 1, -3);
    this.scene.add(this.rim);
    this.models = new Map();
  }

  /** Carrega o capacete (malha + fotos). Chame antes de draw(). */
  async prepare(product) {
    if (!this.models.has(product.slug)) {
      this.models.set(product.slug, buildHelmet(product).then((h) => { frame(h); const g = new THREE.Group(); g.add(h); return g; }));
    }
    return this.models.get(product.slug);
  }

  /** Renderiza o capacete (já preparado) no ângulo indicado e copia para o canvas 2D. */
  async draw(product, angle, target) {
    const m = await this.prepare(product);
    this.scene.add(m);
    m.rotation.set(0.06, angle, 0);
    this.rim.color.set(product.livery?.colors?.secondary ?? '#ffffff');
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(m);
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(this.renderer.domElement, 0, 0, target.width, target.height);
  }
}

export { THREE };
