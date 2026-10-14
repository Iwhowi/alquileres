// Escena de fondo: un edificio de pisos en sección (como una casa de muñecas) que hace de
// fondo de toda la app. Cada página vive en dos plantas; al cambiar de página el ascensor
// viaja hasta su planta y al hacer scroll se baja a la planta siguiente.
// Todo es decorativo (aria-hidden, sin eventos de puntero) y de bajo contraste para no tapar datos.

export const PLANTAS = 14; // 0 = bajo (portal) … 13 = ático
const NOMBRES_PAGINA = {
  '': 'Panel', cobros: 'Cobros', gastos: 'Gastos', calendario: 'Calendario', pisos: 'Pisos', fiscal: 'Fiscal', ajustes: 'Ajustes',
};
// Planta de entrada de cada página (al hacer scroll se baja una planta).
export const PLANTA_DE = { '': 13, cobros: 11, gastos: 9, calendario: 7, pisos: 5, fiscal: 3, ajustes: 1 };
const PAGINA_DE_PLANTA = {};
for (const [k, v] of Object.entries(PLANTA_DE)) { PAGINA_DE_PLANTA[v] = k; PAGINA_DE_PLANTA[v - 1] = k; }

export const nombrePlanta = (k) => (k <= 0 ? 'Bajo' : k >= PLANTAS - 1 ? 'Ático' : `Planta ${k}`);
export const etiquetaPlanta = (k) => (k <= 0 ? 'B' : k >= PLANTAS - 1 ? 'Á' : String(k));

/* ───────────── Dibujo (SVG, 1600 × 700 por planta; suelo en y = 672) ───────────── */

const W = 1600;
const HF = 700;
const Y = 672; // nivel del suelo de cada planta

const ln = (d, c = '') => `<path d="${d}" class="ln ${c}"/>`;
const rc = (x, y, w, h, c = '', r = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="${c || 'ln fl'}"/>`;

function ventana(x, w = 190, y = 170, h = 300) {
  const m = x + w / 2;
  return `<g class="win-g bk">
    ${rc(x, y, w, h, 'win')}
    ${ln(`M${m} ${y}V${y + h}M${x} ${y + h * 0.38}H${x + w}`, 'thin')}
    ${rc(x - 10, y + h, w + 20, 10, 'ln fl')}
    <path class="curtain" d="M${x - 16} ${y - 18}h34c-6 ${h * 0.4} 4 ${h * 0.75} -6 ${h + 30}h-28z"/>
    <path class="curtain" d="M${x + w + 16} ${y - 18}h-34c6 ${h * 0.4} -4 ${h * 0.75} 6 ${h + 30}h28z"/>
    ${ln(`M${x - 26} ${y - 20}H${x + w + 26}`)}
  </g>`;
}
function lampara(x, y0 = 0, largo = 150) {
  const y = y0 + largo;
  return `<g class="lamp">
    ${ln(`M${x} ${y0}V${y}`, 'thin')}
    <ellipse class="glow" cx="${x}" cy="${y + 40}" rx="120" ry="90"/>
    <path class="ln fl shade" d="M${x - 34} ${y + 34}L${x - 14} ${y}H${x + 14}L${x + 34} ${y + 34}Z"/>
    <path class="beam" d="M${x - 30} ${y + 34}L${x - 150} ${Y}H${x + 150}L${x + 30} ${y + 34}Z"/>
  </g>`;
}
function sofa(x) {
  return `<g>${rc(x, Y - 120, 300, 70, 'ln fl', 14)}${rc(x - 18, Y - 92, 40, 80, 'ln fl', 10)}${rc(x + 278, Y - 92, 40, 80, 'ln fl', 10)}
    ${rc(x + 8, Y - 62, 284, 44, 'ln fl', 8)}${ln(`M${x + 150} ${Y - 62}V${Y - 18}`, 'thin')}
    ${ln(`M${x + 10} ${Y - 18}v18M${x + 290} ${Y - 18}v18`)}
    ${rc(x + 30, Y - 108, 60, 40, 'ln acc', 8)}</g>`;
}
function mesaCentro(x) {
  return `<g>${rc(x, Y - 52, 150, 12, 'ln fl', 4)}${ln(`M${x + 14} ${Y - 40}V${Y}M${x + 136} ${Y - 40}V${Y}`)}
    ${rc(x + 30, Y - 70, 40, 18, 'ln fl', 3)}<circle cx="${x + 108}" cy="${Y - 62}" r="10" class="ln acc"/></g>`;
}
function alfombra(x, w) { return `<ellipse cx="${x + w / 2}" cy="${Y - 3}" rx="${w / 2}" ry="9" class="ln rug"/>`; }
function planta(x, s = 1) {
  const p = (v) => v * s;
  return `<g transform="translate(${x} ${Y})">
    <path class="ln fl" d="M${p(-26)} 0L${p(-32)} ${p(-56)}H${p(32)}L${p(26)} 0Z"/>
    <g class="sway" style="transform-origin:0 ${p(-56)}px">
      ${ln(`M0 ${p(-56)}C${p(-10)} ${p(-110)} ${p(-60)} ${p(-130)} ${p(-74)} ${p(-170)}C${p(-30)} ${p(-150)} ${p(-6)} ${p(-110)} 0 ${p(-56)}Z`, 'leaf')}
      ${ln(`M0 ${p(-56)}C${p(12)} ${p(-120)} ${p(50)} ${p(-150)} ${p(70)} ${p(-190)}C${p(76)} ${p(-140)} ${p(30)} ${p(-100)} 0 ${p(-56)}Z`, 'leaf')}
      ${ln(`M0 ${p(-56)}C${p(-4)} ${p(-130)} ${p(10)} ${p(-180)} ${p(-6)} ${p(-230)}C${p(24)} ${p(-190)} ${p(18)} ${p(-120)} 0 ${p(-56)}Z`, 'leaf')}
    </g></g>`;
}
function lamparaPie(x) {
  return `<g class="lamp">${ln(`M${x} ${Y}V${Y - 250}M${x - 30} ${Y}H${x + 30}`)}<ellipse class="glow" cx="${x}" cy="${Y - 250}" rx="90" ry="70"/>
    <path class="ln fl shade" d="M${x - 36} ${Y - 240}L${x - 22} ${Y - 290}H${x + 22}L${x + 36} ${Y - 240}Z"/></g>`;
}
function cuadro(x, y, w, h) {
  return `<g class="bk">${rc(x, y, w, h, 'ln fl')}${rc(x + 12, y + 12, w - 24, h - 24, 'ln art')}${ln(`M${x + 12} ${y + h - 30}l${(w - 24) * 0.35} -${h * 0.35}l${(w - 24) * 0.25} ${h * 0.2}l${(w - 24) * 0.4} -${h * 0.3}`, 'thin')}</g>`;
}
function tele(x) {
  return `<g>${rc(x, Y - 80, 300, 80, 'ln fl', 6)}${ln(`M${x + 100} ${Y - 80}v80M${x + 200} ${Y - 80}v80`, 'thin')}
    ${rc(x + 40, Y - 330, 220, 130, 'ln screen', 6)}${ln(`M${x + 150} ${Y - 200}v18`)}</g>`;
}
function estanteria(x) {
  let libros = '';
  for (let f = 0; f < 4; f++) {
    let bx = x + 12;
    for (let i = 0; i < 6; i++) {
      const w = 12 + ((i * 7 + f * 3) % 10);
      const h = 60 - ((i * 11 + f * 5) % 22);
      libros += rc(bx, Y - 120 - f * 92 - h + 80, w, h, i % 3 === 0 ? 'ln acc' : 'ln fl', 2);
      bx += w + 4;
    }
  }
  return `<g>${rc(x, Y - 420, 190, 420, 'ln fl')}${[1, 2, 3, 4].map((f) => ln(`M${x} ${Y - 40 - (f - 1) * 92}H${x + 190}`, 'thin')).join('')}${libros}</g>`;
}
function cama(x) {
  return `<g>${rc(x, Y - 210, 22, 210, 'ln fl', 6)}${rc(x, Y - 110, 380, 60, 'ln fl', 10)}${rc(x + 22, Y - 140, 340, 34, 'ln fl', 16)}
    ${rc(x + 30, Y - 168, 90, 34, 'ln fl', 14)}${rc(x + 130, Y - 132, 220, 26, 'ln acc', 10)}${ln(`M${x + 8} ${Y - 50}V${Y}M${x + 372} ${Y - 50}V${Y}`)}</g>`;
}
function mesilla(x) {
  return `<g>${rc(x, Y - 90, 80, 90, 'ln fl', 4)}${ln(`M${x} ${Y - 45}H${x + 80}`, 'thin')}
    <g class="lamp">${ln(`M${x + 40} ${Y - 90}v-40`)}<ellipse class="glow" cx="${x + 40}" cy="${Y - 140}" rx="60" ry="46"/><path class="ln fl shade" d="M${x + 18} ${Y - 128}L${x + 28} ${Y - 160}H${x + 52}L${x + 62} ${Y - 128}Z"/></g></g>`;
}
function armario(x) {
  return `<g>${rc(x, Y - 440, 200, 440, 'ln fl', 4)}${ln(`M${x + 100} ${Y - 440}V${Y}`, 'thin')}${ln(`M${x + 88} ${Y - 230}v40M${x + 112} ${Y - 230}v40`)}</g>`;
}
function cocina(x) {
  let s = `${rc(x, Y - 150, 440, 150, 'ln fl', 4)}${rc(x - 6, Y - 160, 452, 14, 'ln fl', 3)}`;
  for (let i = 0; i < 4; i++) s += `${rc(x + 12 + i * 108, Y - 136, 96, 124, 'ln fl', 4)}${ln(`M${x + 50 + i * 108} ${Y - 110}h20`)}`;
  for (let i = 0; i < 4; i++) s += rc(x + i * 110, Y - 470, 104, 150, 'ln fl', 4);
  s += `${ln(`M${x + 250} ${Y - 320}l-30 70h120l-30 -70`)}${ln(`M${x + 230} ${Y - 172}h80`)}
    <g class="steam">${ln(`M${x + 255} ${Y - 190}c-10 -20 10 -30 0 -50M${x + 285} ${Y - 190}c-10 -20 10 -30 0 -50`, 'thin')}</g>
    ${rc(x + 470, Y - 360, 130, 360, 'ln fl', 8)}${ln(`M${x + 470} ${Y - 230}H${x + 600}M${x + 488} ${Y - 300}v40M${x + 488} ${Y - 200}v40`)}`;
  return `<g>${s}</g>`;
}
function comedor(x) {
  const silla = (cx, d) => `${ln(`M${cx} ${Y}V${Y - 70}h${d * 40}M${cx} ${Y - 70}V${Y - 170}`)}`;
  return `<g>${rc(x, Y - 110, 260, 14, 'ln fl', 4)}${ln(`M${x + 20} ${Y - 96}V${Y}M${x + 240} ${Y - 96}V${Y}`)}
    ${silla(x - 30, 1)}${silla(x + 290, -1)}${rc(x + 100, Y - 150, 60, 40, 'ln acc', 6)}</g>`;
}
function banera(x) {
  return `<g>${rc(x, Y - 110, 300, 110, 'ln fl', 30)}${ln(`M${x + 20} ${Y - 110}V${Y - 250}h50`)}
    <g class="drops">${ln(`M${x + 60} ${Y - 236}v14M${x + 72} ${Y - 230}v14`, 'thin')}</g>
    ${rc(x + 380, Y - 160, 120, 22, 'ln fl', 8)}${ln(`M${x + 440} ${Y - 138}V${Y}`)}${rc(x + 390, Y - 380, 100, 150, 'ln screen', 50)}
    ${rc(x + 560, Y - 120, 70, 120, 'ln fl', 12)}${rc(x + 550, Y - 220, 90, 90, 'ln fl', 8)}</g>`;
}
function escritorio(x) {
  return `<g>${rc(x, Y - 140, 280, 14, 'ln fl', 4)}${ln(`M${x + 14} ${Y - 126}V${Y}M${x + 266} ${Y - 126}V${Y}`)}
    ${rc(x + 90, Y - 280, 130, 90, 'ln screen', 6)}${ln(`M${x + 155} ${Y - 190}v50M${x + 125} ${Y - 140}h60`)}
    ${ln(`M${x + 320} ${Y}l20 -60h50l20 60M${x + 340} ${Y - 60}v-110h50v110`)}</g>`;
}
function tabique(x, puerta = true) {
  return puerta ? `${rc(x, 0, 18, Y - 330, 'wall')}${ln(`M${x} ${Y - 330}h18`, 'thin')}` : rc(x, 0, 18, Y, 'wall');
}

// Habitaciones: cada una devuelve el SVG para un ancho dado empezando en x0.
const HABS = {
  salon: (x0, w) => `${ventana(x0 + w * 0.5 - 95)}${cuadro(x0 + 60, 210, 120, 150)}${lampara(x0 + w * 0.42)}${alfombra(x0 + w * 0.18, w * 0.6)}
    ${sofa(x0 + w * 0.18)}${mesaCentro(x0 + w * 0.62)}${planta(x0 + w - 70, 1)}${lamparaPie(x0 + 50)}`,
  tele: (x0, w) => `${ventana(x0 + w - 260, 170)}${tele(x0 + 50)}${planta(x0 + w * 0.62, 0.8)}${lampara(x0 + w * 0.5, 0, 120)}`,
  cocina: (x0, w) => `${cocina(x0 + 40)}${lampara(x0 + w * 0.35, 0, 110)}${lampara(x0 + w * 0.6, 0, 110)}`,
  comedor: (x0, w) => `${ventana(x0 + w * 0.5 - 95)}${comedor(x0 + w * 0.5 - 130)}${lampara(x0 + w * 0.5, 0, 170)}${planta(x0 + 70, 0.9)}${cuadro(x0 + w - 170, 230, 110, 130)}`,
  dormitorio: (x0, w) => `${ventana(x0 + w * 0.62, 160)}${cama(x0 + 110)}${mesilla(x0 + 20)}${armario(x0 + w - 220)}${lampara(x0 + w * 0.32, 0, 120)}`,
  bano: (x0, w) => `${banera(x0 + 30)}${lampara(x0 + w * 0.5, 0, 100)}${planta(x0 + w - 50, 0.6)}`,
  estudio: (x0, w) => `${ventana(x0 + w * 0.55, 180)}${escritorio(x0 + 60)}${estanteria(x0 + w - 230)}${lampara(x0 + w * 0.3, 0, 140)}`,
};
const DISTRIBUCIONES = [
  [['salon', 620], ['cocina', 660], ['bano', 240]],
  [['dormitorio', 560], ['estudio', 560], ['comedor', 400]],
  [['comedor', 480], ['tele', 520], ['dormitorio', 520]],
  [['cocina', 660], ['salon', 620], ['bano', 240]],
  [['estudio', 520], ['dormitorio', 560], ['tele', 440]],
];

function dibujarPlanta(k) {
  if (k === 0) return dibujarPortal();
  if (k === PLANTAS - 1) return dibujarAtico();
  const dist = DISTRIBUCIONES[k % DISTRIBUCIONES.length];
  let x = 40;
  let s = '';
  dist.forEach(([tipo, w], i) => {
    const ancho = i === dist.length - 1 ? W - 40 - x : w;
    s += `<g class="room">${HABS[tipo](x, ancho)}</g>`;
    x += ancho;
    if (i < dist.length - 1) s += tabique(x - 9, i % 2 === 0);
  });
  return s;
}

function dibujarPortal() {
  let buzones = '';
  for (let f = 0; f < 4; f++) for (let c = 0; c < 4; c++) {
    const bx = 1000 + c * 62;
    const by = 300 + f * 52;
    buzones += `${rc(bx, by, 56, 46, 'ln fl', 3)}${ln(`M${bx + 12} ${by + 14}h32`, 'thin')}`;
  }
  return `
    ${rc(560, 140, 380, 532, 'win door')}${ln('M750 140V672M560 300H940', 'thin')}${ln('M720 420v60M780 420v60')}
    ${rc(540, 120, 420, 20, 'ln fl')}
    <text x="750" y="105" class="sign" text-anchor="middle">Nº 22</text>
    ${rc(990, 290, 268, 220, 'ln fl', 6)}${buzones}
    ${rc(160, 560, 260, 26, 'ln fl', 6)}${ln('M180 586v86M400 586v86')}
    ${planta(480, 1.1)}${planta(1360, 1.2)}${lampara(750, 0, 60)}${lampara(300, 0, 140)}${lampara(1200, 0, 140)}
    ${cuadro(180, 250, 180, 220)}`;
}

function dibujarAtico() {
  return `
    ${rc(80, 120, 1060, 400, 'win big')}${[1, 2, 3, 4].map((i) => ln(`M${80 + i * 212} 120V520`, 'thin')).join('')}
    ${ln('M80 520H1140', 'thin')}
    ${sofa(240)}${mesaCentro(600)}${alfombra(200, 560)}${lampara(460, 0, 90)}${lamparaPie(150)}
    ${tabique(1180, true)}
    <g class="room">${planta(1280, 1.2)}${planta(1460, 0.9)}${rc(1250, 520, 260, 14, 'ln fl', 4)}${ln('M1270 534V672M1490 534V672')}</g>`;
}

function dibujarAzotea() {
  let placas = '';
  for (let i = 0; i < 4; i++) placas += `<path class="ln fl" d="M${980 + i * 120} 560l40 -70h100l-40 70z"/>`;
  return `<svg viewBox="0 0 ${W} 700" preserveAspectRatio="xMidYMax slice" class="floor-svg">
    <circle cx="1240" cy="170" r="70" class="sun"/>
    <g class="cloud c1">${nube(260, 170)}</g><g class="cloud c2">${nube(820, 110)}</g><g class="cloud c3">${nube(1420, 250)}</g>
    ${rc(0, 600, W, 100, 'slab')}${rc(20, 560, W - 40, 40, 'ln fl')}
    ${rc(160, 360, 160, 200, 'ln fl', 10)}${ln('M150 360h180M240 300v60M210 300h60')}
    ${ln('M420 560V250M380 300h80M395 330h50M420 250l-26 -40M420 250l26 -40')}
    ${ln('M560 420H900', 'thin')}${[600, 660, 720, 800, 860].map((x, i) => `<path class="ln cloth" d="M${x} 420h${30 + (i % 2) * 14}v${60 + (i % 3) * 16}h-${30 + (i % 2) * 14}z"/>`).join('')}
    ${ln('M560 420V560M900 420V560')}
    ${placas}${planta(1440, 1)}
  </svg>`;
}
function nube(x, y) {
  return `<path class="cloud-p" d="M${x} ${y}c0 -30 40 -46 66 -30c14 -34 76 -34 92 4c34 -6 54 22 40 46H${x - 8}c-28 0 -30 -20 -8 -20z"/>`;
}

function dibujarCalle() {
  return `<svg viewBox="0 0 ${W} 400" preserveAspectRatio="xMidYMin slice" class="floor-svg">
    ${rc(0, 0, W, 60, 'pave')}${rc(0, 60, W, 340, 'road')}
    ${[120, 380, 640, 900, 1160, 1420].map((x) => rc(x, 210, 120, 10, 'lane', 3)).join('')}
    <g class="car">${rc(-280, 120, 220, 60, 'ln fl', 20)}<path class="ln fl" d="M-240 120l30 -40h100l40 40"/><circle cx="-230" cy="182" r="20" class="ln wheel"/><circle cx="-100" cy="182" r="20" class="ln wheel"/></g>
  </svg>`;
}

/* ───────────── Motor de la escena ───────────── */

const st = {
  el: null, edificio: null, plantas: [], hud: null, H: 600,
  f: PLANTAS - 1, objetivo: PLANTAS - 1, tween: null, pagina: '', activa: -1, mx: 0, my: 0, mxs: 0, mys: 0, raf: 0, ultimoT: '',
};
const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function iniciarEscena({ desdePortal = true } = {}) {
  if (desdePortal) { st.f = -0.42; st.pagina = '__portal'; }
  const el = document.getElementById('escena');
  st.el = el;
  let html = `<svg width="0" height="0" style="position:absolute"><defs>
    <radialGradient id="g-glow"><stop offset="0" stop-color="var(--sc-glow)"/><stop offset="1" stop-color="var(--sc-glow)" stop-opacity="0"/></radialGradient>
    <linearGradient id="g-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sc-glow)" stop-opacity="0.5"/><stop offset="1" stop-color="var(--sc-glow)" stop-opacity="0"/></linearGradient>
  </defs></svg>`;
  html += '<div class="sky"></div><div class="skyline far"></div><div class="skyline near"></div><div class="edificio">';
  html += `<div class="azotea">${dibujarAzotea()}</div>`;
  for (let k = PLANTAS - 1; k >= 0; k--) {
    const pagina = PAGINA_DE_PLANTA[k];
    html += `<div class="planta${k === 0 ? ' bajo' : ''}${k === PLANTAS - 1 ? ' atico' : ''}" data-k="${k}">
      <svg viewBox="0 0 ${W} ${HF}" preserveAspectRatio="xMidYMax slice" class="floor-svg">
        ${dibujarPlanta(k)}
        ${rc(0, Y, W, HF - Y, 'slab')}${rc(0, 0, 40, Y, 'facade')}${rc(W - 40, 0, 40, Y, 'facade')}
      </svg>
      <div class="planta-num"><span>${etiquetaPlanta(k)}</span><small>${nombrePlanta(k)}${pagina != null ? ` · ${NOMBRES_PAGINA[pagina]}` : ''}</small></div>
    </div>`;
  }
  html += `<div class="calle">${dibujarCalle()}</div><div class="hueco"><div class="cables"></div></div></div>
    <div class="cabina"><div class="puerta pi"></div><div class="puerta pd"></div><div class="cabina-luz"></div></div>`;
  el.innerHTML = html;
  st.edificio = el.querySelector('.edificio');
  st.plantas = [...el.querySelectorAll('.planta')].sort((a, b) => a.dataset.k - b.dataset.k);
  st.hud = document.getElementById('hud');
  medir();
  addEventListener('resize', medir, { passive: true });
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    st.mx = e.clientX / innerWidth - 0.5;
    st.my = e.clientY / innerHeight - 0.5;
  }, { passive: true });
  bucle();
}

function medir() {
  st.H = Math.round(Math.min(860, Math.max(500, innerHeight * 0.82)));
  document.documentElement.style.setProperty('--planta-h', `${st.H}px`);
  st.ultimoT = '';
}

/** Planta (fracción) que corresponde al scroll actual de la página. */
function plantaScroll() {
  const base = PLANTA_DE[st.pagina] ?? PLANTAS - 1;
  if (st.pagina === '__portal') return -0.42;
  const max = document.documentElement.scrollHeight - innerHeight;
  const p = max > 4 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  return base - p; // al bajar con el scroll, se baja a la planta de abajo
}

/** Cambio de página: el ascensor viaja hasta la planta de la página. */
export function irAPlanta(pagina, { instantaneo = false } = {}) {
  if (pagina === st.pagina && st.tween) return; // ya va de camino
  st.pagina = pagina;
  const destino = plantaScroll();
  const dist = Math.abs(destino - st.f);
  if (instantaneo || reducido() || dist < 0.02) {
    st.f = destino;
    st.tween = null;
  } else {
    st.tween = { from: st.f, to: destino, t0: performance.now(), dur: Math.min(1700, 650 + dist * 85) };
    st.el.classList.add('viajando');
    st.el.classList.toggle('subiendo', destino > st.f);
  }
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function bucle() {
  const tick = (now) => {
    let f;
    if (st.tween) {
      const t = Math.min(1, (now - st.tween.t0) / st.tween.dur);
      // El destino puede cambiar si la página carga más contenido: se recalcula al vuelo.
      st.tween.to = plantaScroll();
      f = st.tween.from + (st.tween.to - st.tween.from) * easeInOut(t);
      if (t >= 1) {
        st.tween = null;
        st.el.classList.remove('viajando', 'subiendo');
        st.el.classList.add('llegada');
        setTimeout(() => st.el.classList.remove('llegada'), 900);
      }
    } else {
      const obj = plantaScroll();
      f = st.f + (obj - st.f) * (reducido() ? 1 : 0.14); // inercia suave
      if (Math.abs(obj - f) < 0.0005) f = obj;
    }
    st.f = f;
    st.mxs += (st.mx - st.mxs) * 0.06;
    st.mys += (st.my - st.mys) * 0.06;
    pintar();
    st.raf = requestAnimationFrame(tick);
  };
  st.raf = requestAnimationFrame(tick);
}

function pintar() {
  const H = st.H;
  // Plantas apiladas de arriba (ático) a abajo (bajo); la azotea ocupa una planta encima.
  // Distancia desde lo alto del edificio (azotea incluida) hasta el suelo de la planta f.
  const yPlanta = (PLANTAS - st.f + 1) * H;
  const centro = (innerHeight + H) / 2; // la planta actual queda centrada en la pantalla
  const ty = Math.round((centro - yPlanta + st.mys * -14) * 10) / 10;
  const tx = Math.round(st.mxs * -18 * 10) / 10;
  const clave = `${ty}|${tx}`;
  if (clave !== st.ultimoT) {
    st.edificio.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    st.el.style.setProperty('--alt', (Math.max(-0.5, st.f) / (PLANTAS - 1)).toFixed(4));
    st.el.style.setProperty('--sky-y', `${(ty * 0.18).toFixed(1)}px`);
    st.el.style.setProperty('--far-y', `${(ty * 0.12 + st.mxs * 6).toFixed(1)}px`);
    st.el.style.setProperty('--near-y', `${(ty * 0.3).toFixed(1)}px`);
    st.el.style.setProperty('--far-x', `${(st.mxs * -6).toFixed(1)}px`);
    st.el.style.setProperty('--near-x', `${(st.mxs * -10).toFixed(1)}px`);
    st.ultimoT = clave;
  }
  // Profundidad: la pared del fondo (ventanas, cuadros) se desplaza menos que los muebles.
  const k0 = Math.floor(st.f) - 1;
  for (let k = Math.max(0, k0); k <= Math.min(PLANTAS - 1, k0 + 3); k++) {
    st.plantas[k].style.setProperty('--par', `${((k - st.f) * 34).toFixed(1)}px`);
  }
  const activa = Math.round(st.f);
  if (activa !== st.activa) {
    st.plantas.forEach((p, k) => {
      p.classList.toggle('on', k === activa);
      p.classList.toggle('cerca', Math.abs(k - activa) === 1);
    });
    st.activa = activa;
    actualizarHud(activa);
  }
}

function actualizarHud(k) {
  const hud = st.hud;
  if (!hud) return;
  const num = hud.querySelector('.hud-num');
  const nom = hud.querySelector('.hud-nom');
  if (!num) return;
  const k2 = Math.max(0, Math.min(PLANTAS - 1, k));
  num.textContent = etiquetaPlanta(k2);
  nom.textContent = nombrePlanta(k2);
  num.classList.remove('tick');
  void num.offsetWidth;
  num.classList.add('tick');
  hud.dataset.dir = st.tween ? (st.tween.to > st.tween.from ? 'up' : 'down') : '';
}

export function plantaActual() { return Math.round(st.f); }
