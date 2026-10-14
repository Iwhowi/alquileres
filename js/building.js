// Escena de fondo: un edificio de viviendas en sección (como una casa de muñecas) que hace de
// fondo de toda la app, con un ascensor panorámico en la fachada.
//  · Cada página tiene su planta de entrada; el ascensor viaja hasta ella al cambiar de página.
//  · Al hacer scroll se baja de planta (una planta cada ~1,6 alturas de planta de scroll).
//  · Cada planta tiene tres capas (pared del fondo, muebles y primer plano) con paralaje.
// Las plantas se virtualizan: solo existen en el DOM las que están cerca de la cámara.
// Todo es decorativo (aria-hidden, sin eventos de puntero) y de bajo contraste.

export const TOP = 46; // índice del ático; 0 = bajo (portal); TOP + 1 = azotea; -1 = calle
const PAGINAS = { '': 46, cobros: 38, gastos: 30, calendario: 23, pisos: 19, fiscal: 8, ajustes: 3 };
const PISO_DETALLE = 17; // la ficha de cada piso vive en su propia planta, por debajo de Pisos
export const NOMBRE_PAGINA = { '': 'Panel', cobros: 'Cobros', gastos: 'Gastos', calendario: 'Calendario', pisos: 'Pisos', fiscal: 'Fiscal', ajustes: 'Ajustes', piso: 'Ficha del piso', __portal: 'Portal' };

/** Planta de entrada de una ruta. `idx` = posición del piso para las fichas. */
export function plantaDe(pagina, idx = 0) {
  if (pagina === '__portal') return -0.38;
  if (pagina === 'piso') return PISO_DETALLE - Math.max(0, idx);
  return PAGINAS[pagina] ?? TOP;
}
export const nombrePlanta = (k) => (k <= 0 ? 'Bajo' : k >= TOP ? 'Ático' : `Planta ${k}`);
export const etiquetaPlanta = (k) => (k <= 0 ? 'B' : k >= TOP ? 'Á' : String(k));

/* ───────────── Dibujo (SVG, 1600 × 700 por planta; suelo en y = 672) ───────────── */

const W = 1600;
const HF = 700;
const Y = 672; // nivel del suelo de cada planta

const ln = (d, c = '') => `<path d="${d}" class="ln ${c}"/>`;
const rc = (x, y, w, h, c = '', r = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="${c || 'ln fl'}"/>`;

function ventana(x, w = 190, y = 170, h = 300) {
  const m = x + w / 2;
  return `<g class="win-g">
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
  return `<g>${rc(x, y, w, h, 'ln fl')}${rc(x + 12, y + 12, w - 24, h - 24, 'ln art')}${ln(`M${x + 12} ${y + h - 30}l${(w - 24) * 0.35} -${h * 0.35}l${(w - 24) * 0.25} ${h * 0.2}l${(w - 24) * 0.4} -${h * 0.3}`, 'thin')}</g>`;
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


/* ───────────── Habitaciones en tres capas: fondo (bk), muebles (md) y primer plano (fg) ───────────── */

function azulejos(x0, w, y0 = 300) {
  let s = rc(x0, y0, w, Y - y0, 'tile');
  for (let y = y0 + 40; y < Y; y += 40) s += ln(`M${x0} ${y}H${x0 + w}`, 'thin');
  for (let x = x0 + 40; x < x0 + w; x += 40) s += ln(`M${x} ${y0}V${Y}`, 'thin');
  return s;
}
const HABS = {
  salon: (x0, w) => ({
    bk: `${ventana(x0 + w * 0.5 - 95)}${cuadro(x0 + 60, 210, 120, 150)}`,
    md: `${lampara(x0 + w * 0.42)}${alfombra(x0 + w * 0.18, w * 0.6)}${sofa(x0 + w * 0.18)}${mesaCentro(x0 + w * 0.62)}${lamparaPie(x0 + 50)}`,
    fg: planta(x0 + w - 70, 1.15),
  }),
  tele: (x0, w) => ({ bk: ventana(x0 + w - 260, 170), md: `${tele(x0 + 50)}${lampara(x0 + w * 0.5, 0, 120)}`, fg: planta(x0 + w * 0.62, 0.9) }),
  cocina: (x0, w) => ({ bk: azulejos(x0 + 20, w - 40), md: `${cocina(x0 + 40)}${lampara(x0 + w * 0.35, 0, 110)}${lampara(x0 + w * 0.6, 0, 110)}`, fg: '' }),
  comedor: (x0, w) => ({
    bk: `${ventana(x0 + w * 0.5 - 95)}${cuadro(x0 + w - 170, 230, 110, 130)}`,
    md: `${comedor(x0 + w * 0.5 - 130)}${lampara(x0 + w * 0.5, 0, 170)}`,
    fg: planta(x0 + 70, 1),
  }),
  dormitorio: (x0, w) => ({ bk: ventana(x0 + w * 0.62, 160), md: `${cama(x0 + 110)}${mesilla(x0 + 20)}${armario(x0 + w - 220)}${lampara(x0 + w * 0.32, 0, 120)}`, fg: '' }),
  bano: (x0, w) => ({ bk: azulejos(x0 + 10, w - 20, 260), md: `${banera(x0 + 30)}${lampara(x0 + w * 0.5, 0, 100)}`, fg: planta(x0 + w - 50, 0.7) }),
  estudio: (x0, w) => ({ bk: ventana(x0 + w * 0.55, 180), md: `${escritorio(x0 + 60)}${estanteria(x0 + w - 230)}${lampara(x0 + w * 0.3, 0, 140)}`, fg: '' }),
};
const DISTRIBUCIONES = [
  [['salon', 620], ['cocina', 660], ['bano', 240]],
  [['dormitorio', 560], ['estudio', 560], ['comedor', 400]],
  [['comedor', 480], ['tele', 520], ['dormitorio', 520]],
  [['cocina', 660], ['salon', 620], ['bano', 240]],
  [['estudio', 520], ['dormitorio', 560], ['tele', 440]],
];

/** Capas SVG de una planta. */
function capasPlanta(k) {
  const L = { bk: rc(40, 0, W - 80, Y, 'backwall'), md: '', fg: '' };
  if (k === 0) {
    let buz = '';
    for (let f = 0; f < 4; f++) for (let c = 0; c < 4; c++) {
      const bx = 1000 + c * 62;
      const by = 300 + f * 52;
      buz += `${rc(bx, by, 56, 46, 'ln fl', 3)}${ln(`M${bx + 12} ${by + 14}h32`, 'thin')}`;
    }
    L.bk += `${rc(560, 140, 380, 532, 'win door')}${ln('M750 140V672M560 300H940', 'thin')}${rc(540, 120, 420, 20, 'ln fl')}
      <text x="750" y="105" class="sign" text-anchor="middle">Nº 22</text>${cuadro(180, 250, 180, 220)}`;
    L.md += `${ln('M720 420v60M780 420v60')}${rc(990, 290, 268, 220, 'ln fl', 6)}${buz}${rc(160, 560, 260, 26, 'ln fl', 6)}${ln('M180 586v86M400 586v86')}
      ${lampara(750, 0, 60)}${lampara(300, 0, 140)}${lampara(1200, 0, 140)}`;
    L.fg += `${planta(480, 1.2)}${planta(1380, 1.3)}`;
  } else if (k === TOP) {
    L.bk += `${rc(80, 120, 1060, 400, 'win big')}${[1, 2, 3, 4].map((i) => ln(`M${80 + i * 212} 120V520`, 'thin')).join('')}${ln('M80 520H1140', 'thin')}`;
    L.md += `${sofa(240)}${mesaCentro(600)}${alfombra(200, 560)}${lampara(460, 0, 90)}${lamparaPie(150)}${tabique(1180, true)}
      ${rc(1250, 520, 260, 14, 'ln fl', 4)}${ln('M1270 534V672M1490 534V672')}`;
    L.fg += `${planta(1280, 1.3)}${planta(1470, 1)}`;
  } else {
    const dist = DISTRIBUCIONES[k % DISTRIBUCIONES.length];
    let x = 40;
    dist.forEach(([tipo, w], i) => {
      const ancho = i === dist.length - 1 ? W - 40 - x : w;
      const h = HABS[tipo](x, ancho);
      L.bk += `<g class="room r${i}">${h.bk}</g>`;
      L.md += `<g class="room r${i}">${h.md}</g>`;
      L.fg += h.fg;
      x += ancho;
      if (i < dist.length - 1) L.md += tabique(x - 9, i % 2 === 0);
    });
  }
  L.md += `${rc(0, Y, W, HF - Y, 'slab')}${rc(0, 0, 40, Y, 'facade')}${rc(W - 40, 0, 40, Y, 'facade')}`;
  return L;
}

function nube(x, y) {
  return `<path class="cloud-p" d="M${x} ${y}c0 -30 40 -46 66 -30c14 -34 76 -34 92 4c34 -6 54 22 40 46H${x - 8}c-28 0 -30 -20 -8 -20z"/>`;
}

const svg = (cls, body, vb = `0 0 ${W} ${HF}`, par = 'xMidYMax slice') => `<svg class="ly-svg" viewBox="${vb}" preserveAspectRatio="${par}">${body}</svg>`;

/** HTML completo de una planta k (incluye azotea y calle). */
const cache = new Map();
function htmlPlanta(k) {
  if (cache.has(k)) return cache.get(k);
  let h;
  if (k === TOP + 1) {
    let placas = '';
    for (let i = 0; i < 4; i++) placas += `<path class="ln fl" d="M${980 + i * 120} 560l40 -70h100l-40 70z"/>`;
    h = `<div class="ly bk">${svg('', `<circle cx="1240" cy="170" r="70" class="sun"/><g class="cloud c1">${nube(260, 170)}</g><g class="cloud c2">${nube(820, 110)}</g><g class="cloud c3">${nube(1420, 250)}</g>`)}</div>
      <div class="ly md">${svg('', `${rc(0, 600, W, 100, 'slab')}${rc(20, 560, W - 40, 40, 'ln fl')}${rc(160, 360, 160, 200, 'ln fl', 10)}${ln('M150 360h180M240 300v60M210 300h60')}
        ${ln('M420 560V250M380 300h80M395 330h50M420 250l-26 -40M420 250l26 -40')}${ln('M560 420H900', 'thin')}
        ${[600, 660, 720, 800, 860].map((x, i) => `<path class="ln cloth" d="M${x} 420h${30 + (i % 2) * 14}v${60 + (i % 3) * 16}h-${30 + (i % 2) * 14}z"/>`).join('')}
        ${ln('M560 420V560M900 420V560')}${placas}`)}</div>
      <div class="ly fg">${svg('', planta(1440, 1.1))}</div>`;
  } else if (k === -1) {
    h = `<div class="ly md">${svg('', `${rc(0, 0, W, 60, 'pave')}${rc(0, 60, W, 640, 'road')}${[120, 380, 640, 900, 1160, 1420].map((x) => rc(x, 210, 120, 10, 'lane', 3)).join('')}
      <g class="car">${rc(-280, 120, 220, 60, 'ln fl', 20)}<path class="ln fl" d="M-240 120l30 -40h100l40 40"/><circle cx="-230" cy="182" r="20" class="ln wheel"/><circle cx="-100" cy="182" r="20" class="ln wheel"/></g>`, `0 0 ${W} ${HF}`, 'xMidYMin slice')}</div>`;
  } else {
    const L = capasPlanta(k);
    h = `<div class="ly bk">${svg('', L.bk)}</div><div class="ly md">${svg('', L.md)}</div><div class="ly fg">${svg('', L.fg)}</div>
      <div class="planta-num"><span>${etiquetaPlanta(k)}</span></div>
      <div class="balcon"><i class="b-losa"></i><i class="b-barandilla"></i><i class="b-maceta"></i></div>`;
  }
  cache.set(k, h);
  return h;
}

const variante = (k) => (k === -1 || k === 0 || k === TOP || k === TOP + 1 ? `e${k}` : `v${k % DISTRIBUCIONES.length}`);

/* ───────────── Motor ───────────── */

const st = {
  el: null, edificio: null, torre: null, cabina: null, contrapeso: null, sky: null, far: null, near: null, hud: null,
  H: 600, cy: 600, f: -0.38, tween: null, pagina: '__portal', idx: 0, activa: null,
  mx: 0, my: 0, mxs: 0, mys: 0, asomo: 0, asomoS: 0, raf: 0, tPrev: 0, escala: 1,
  pool: new Map(), libres: [], hudK: null,
};
const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function iniciarEscena() {
  const el = document.getElementById('escena');
  st.el = el;
  el.innerHTML = `<svg width="0" height="0" style="position:absolute"><defs>
      <radialGradient id="g-glow"><stop offset="0" stop-color="var(--sc-glow)"/><stop offset="1" stop-color="var(--sc-glow)" stop-opacity="0"/></radialGradient>
      <linearGradient id="g-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sc-glow)" stop-opacity="0.5"/><stop offset="1" stop-color="var(--sc-glow)" stop-opacity="0"/></linearGradient>
    </defs></svg>
    <div class="sky"></div><div class="skyline far"></div><div class="skyline near"></div>
    <div class="edificio"></div>
    <div class="torre"><div class="torre-estructura"></div><div class="contrapeso"></div>
      <div class="cabina"><div class="cabina-luz"></div><div class="persona"></div><div class="puerta pi"></div><div class="puerta pd"></div></div></div>`;
  st.edificio = el.querySelector('.edificio');
  st.torre = el.querySelector('.torre-estructura');
  st.contrapeso = el.querySelector('.contrapeso');
  st.sky = el.querySelector('.sky');
  st.far = el.querySelector('.skyline.far');
  st.near = el.querySelector('.skyline.near');
  st.hud = document.getElementById('hud');
  prepararHud();
  medir();
  addEventListener('resize', () => { medir(); despertar(); }, { passive: true });
  addEventListener('scroll', despertar, { passive: true });
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    st.mx = e.clientX / innerWidth - 0.5;
    st.my = e.clientY / innerHeight - 0.5;
    despertar();
  }, { passive: true });
  despertar();
}

function medir() {
  // Planta algo más baja que la pantalla: se ven la planta actual y parte de las vecinas.
  st.H = Math.round(Math.min(720, Math.max(380, innerHeight * 0.62)));
  st.cy = Math.round((innerHeight + st.H) / 2);
  document.documentElement.style.setProperty('--planta-h', `${st.H}px`);
  document.documentElement.style.setProperty('--suelo-y', `${st.cy}px`);
}

/** Planta (fracción) según la página y el scroll: se baja una planta cada ~1,6 alturas de planta. */
function plantaScroll() {
  const base = plantaDe(st.pagina, st.idx);
  if (st.pagina === '__portal') return base;
  return Math.max(-0.38, base - scrollY / (st.H * 1.6));
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Cambio de página: el ascensor viaja hasta la planta de la página.
 * Devuelve una promesa que se resuelve al llegar (con las puertas abriéndose).
 */
export function irAPlanta(pagina, { idx = 0, instantaneo = false, desde = null } = {}) {
  const misma = pagina === st.pagina && idx === st.idx;
  st.pagina = pagina;
  st.idx = idx;
  if (desde != null && !reducido()) { st.f = desde; st.activa = null; }
  actualizarHud();
  if (misma && st.tween) return st.tween.promesa;
  const destino = plantaDe(pagina, idx);
  const dist = Math.abs(destino - st.f);
  if (instantaneo || reducido() || dist < 0.05) {
    if (instantaneo || reducido()) st.f = plantaScroll();
    st.tween = null;
    despertar();
    return Promise.resolve();
  }
  if (st.tween) st.tween.resolver();
  let resolver;
  const promesa = new Promise((r) => { resolver = r; });
  st.tween = { from: st.f, t0: performance.now(), dur: Math.min(1250, 650 + dist * 22), dist, promesa, resolver, sube: destino > st.f };
  st.el.classList.add('viajando');
  st.el.classList.toggle('subiendo', destino > st.f);
  st.el.classList.remove('llegada');
  despertar();
  return promesa;
}

/** Al pasar el ratón por el menú, el edificio se asoma hacia la planta de destino. */
export function asomar(pagina, idx = 0) {
  if (pagina == null) st.asomo = 0;
  else {
    const d = plantaDe(pagina, idx) - st.f;
    st.asomo = Math.abs(d) < 0.5 ? 0 : Math.sign(d) * 0.22;
  }
  despertar();
}

function despertar() {
  if (!st.raf && st.el) { st.tPrev = performance.now(); st.raf = requestAnimationFrame(tick); }
}

function tick(now) {
  const dt = Math.min(64, now - st.tPrev);
  st.tPrev = now;
  const suave = (tau) => (reducido() ? 1 : 1 - Math.exp(-dt / tau));
  let quieto = true;
  if (st.tween) {
    const tw = st.tween;
    const t = Math.min(1, (now - tw.t0) / tw.dur);
    const to = plantaScroll();
    const signo = Math.sign(to - tw.from) || 1;
    // Rebote al llegar: pasa un poco de la planta y vuelve, como una cabina que frena.
    const ov = Math.min(0.12, tw.dist * 0.03);
    const rebote = t > 0.72 ? Math.sin(Math.PI * ((t - 0.72) / 0.28)) * ov : 0;
    st.f = tw.from + (to - tw.from) * easeInOut(t) + signo * rebote;
    st.escala = 1 - 0.065 * Math.sin(Math.PI * t) * Math.min(1, tw.dist / 3);
    quieto = false;
    if (t >= 1) {
      st.tween = null;
      st.escala = 1;
      st.el.classList.remove('viajando', 'subiendo');
      st.el.classList.add('llegada');
      setTimeout(() => st.el.classList.remove('llegada'), 1200);
      tw.resolver();
      actualizarHud();
    }
  } else {
    const obj = plantaScroll() + st.asomoS;
    const nf = st.f + (obj - st.f) * suave(120);
    if (Math.abs(obj - nf) > 0.0004) quieto = false;
    st.f = Math.abs(obj - nf) <= 0.0004 ? obj : nf;
  }
  st.asomoS += (st.asomo - st.asomoS) * suave(160);
  st.mxs += (st.mx - st.mxs) * suave(220);
  st.mys += (st.my - st.mys) * suave(220);
  if (Math.abs(st.asomo - st.asomoS) > 0.001 || Math.abs(st.mx - st.mxs) > 0.001 || Math.abs(st.my - st.mys) > 0.001) quieto = false;
  pintar();
  st.raf = quieto ? 0 : requestAnimationFrame(tick);
}

function pintar() {
  const { H, cy, f } = st;
  const tx = st.mxs * -16;
  const tyRaton = st.mys * -10;
  st.edificio.style.transform = `translate3d(${tx.toFixed(1)}px, ${tyRaton.toFixed(1)}px, 0) scale(${st.escala.toFixed(4)})`;

  // Plantas visibles (virtualizadas)
  const kmin = Math.max(-1, Math.floor(f - (innerHeight - cy) / H) - 1);
  const kmax = Math.min(TOP + 1, Math.ceil(f + cy / H));
  for (const [k, el] of st.pool) if (k < kmin || k > kmax) { st.pool.delete(k); el.style.visibility = 'hidden'; st.libres.push(el); }
  for (let k = kmin; k <= kmax; k++) {
    let el = st.pool.get(k);
    if (!el) {
      // Las plantas comparten 5 distribuciones: se reutiliza un elemento con la misma y solo cambia el número.
      const v = variante(k);
      const i = st.libres.findIndex((x) => x._var === v);
      el = i >= 0 ? st.libres.splice(i, 1)[0] : st.libres.pop() || st.edificio.appendChild(document.createElement('div'));
      if (el._var !== v) {
        el.innerHTML = htmlPlanta(k);
        el._var = v;
        el._bk = el.querySelector('.ly.bk > svg');
        el._fg = el.querySelector('.ly.fg');
        el._num = el.querySelector('.planta-num');
        el._numTxt = el.querySelector('.planta-num span');
      }
      if (el._numTxt) el._numTxt.textContent = etiquetaPlanta(k);
      el.className = `planta${k === 0 ? ' bajo' : ''}${k === TOP ? ' atico' : ''}${k === TOP + 1 ? ' azotea' : ''}${k === -1 ? ' calle' : ''}${(k * 7) % 5 < 2 ? ' lit' : ''}`;
      el.style.visibility = '';
      st.pool.set(k, el);
    }
    const bottom = cy + (f - k) * H;
    el.style.transform = `translate3d(0, ${(bottom - H).toFixed(1)}px, 0)`;
    const d = k - f; // >0 planta por encima de la cámara
    if (el._bk) el._bk.style.transform = `translate3d(0, ${(d * H * 0.12).toFixed(1)}px, 0)`;
    if (el._fg) el._fg.style.transform = `translate3d(${(st.mxs * -14).toFixed(1)}px, ${(d * H * -0.09).toFixed(1)}px, 0)`;
    if (el._num) el._num.style.transform = `translate3d(0, ${(d * H * 0.3).toFixed(1)}px, 0)`;
  }
  const activa = Math.max(-1, Math.min(TOP + 1, Math.round(f)));
  if (activa !== st.activa) {
    for (const [k, el] of st.pool) { el.classList.toggle('on', k === activa); el.classList.toggle('cerca', Math.abs(k - activa) === 1); }
    st.activa = activa;
    actualizarHud();
  } else {
    for (const [k, el] of st.pool) if (k === activa && !el.classList.contains('on')) el.classList.add('on');
  }

  // Torre del ascensor (fuera del edificio) y contrapeso que se mueve al revés
  const off = ((f * H) % H + H) % H;
  st.torre.style.transform = `translate3d(0, ${(off - H).toFixed(1)}px, 0)`;
  const cp = ((f * H * 0.9) % (innerHeight + 240) + innerHeight + 240) % (innerHeight + 240) - 120;
  st.contrapeso.style.transform = `translate3d(0, ${cp.toFixed(1)}px, 0)`;

  // Cielo según la altura y siluetas de la ciudad con paralaje
  const alt = Math.max(0, Math.min(1, f / TOP));
  const a2 = alt.toFixed(2);
  if (a2 !== st.alto) { st.sky.style.setProperty('--alto', a2); st.alto = a2; }
  st.far.style.transform = `translate3d(${(st.mxs * -5).toFixed(1)}px, ${(f * H * 0.06).toFixed(1)}px, 0)`;
  st.near.style.transform = `translate3d(${(st.mxs * -9).toFixed(1)}px, ${(f * H * 0.16).toFixed(1)}px, 0)`;
}

/* ───────────── Indicador de planta (cuentakilómetros) ───────────── */

function prepararHud() {
  const hud = st.hud;
  if (!hud) return;
  const etiquetas = Array.from({ length: TOP + 1 }, (_, k) => etiquetaPlanta(k));
  hud.querySelector('.hud-num').innerHTML = `<span class="odo">${etiquetas.map((e) => `<b>${e}</b>`).join('')}</span>`;
}

function actualizarHud() {
  const hud = st.hud;
  if (!hud) return;
  const k = Math.max(0, Math.min(TOP, st.activa ?? Math.round(st.f)));
  const odo = hud.querySelector('.odo');
  if (odo) odo.style.transform = `translateY(${-k * 1.25}em)`;
  hud.querySelector('.hud-nom').textContent = NOMBRE_PAGINA[st.pagina] || '';
  hud.querySelector('.hud-planta').textContent = nombrePlanta(k);
  hud.dataset.dir = st.tween ? (st.tween.sube ? 'up' : 'down') : '';
}
