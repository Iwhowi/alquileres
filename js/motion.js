// Capa de movimiento de la interfaz: entrada escalonada al llegar a una planta y al hacer
// scroll, contadores animados, píldoras que se deslizan y crecimiento de gráficos.

const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let observador = null;

function observar() {
  if (observador) return observador;
  observador = new IntersectionObserver((entradas) => {
    const visibles = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
    visibles.forEach((e, i) => {
      e.target.style.setProperty('--d', `${Math.min(i, 8) * 70}ms`);
      e.target.classList.add('in');
      observador.unobserve(e.target);
      if (e.target.matches('.kpi')) contar(e.target);
      e.target.querySelectorAll('.kpi').forEach(contar);
    });
  }, { rootMargin: '0px 0px -4% 0px', threshold: 0 });
  return observador;
}

const OBJETIVOS = '.page-head, .back, .banner, .quick-tile, .card, .piso-card, .group-head, .welcome > *, .kpis > .kpi, .cards > *';

/** Al llegar a una página: prepara la entrada escalonada de sus bloques. */
export function entrar(main) {
  if (reducido()) { main.querySelectorAll('.kpi').forEach(contar); return; }
  const obs = observar();
  const els = [...main.querySelectorAll(OBJETIVOS)].filter((el) => !el.parentElement.closest('.card, .welcome-options'));
  for (const el of els) {
    // Los bloques muy altos (listas largas) no se esconden: se verían vacíos al hacer scroll.
    if (el.offsetHeight > innerHeight * 0.8) { el.classList.add('rv', 'in'); el.style.setProperty('--d', '60ms'); continue; }
    el.classList.add('rv');
    obs.observe(el);
  }
  main.querySelectorAll('.chart .bar').forEach((b, i) => b.style.setProperty('--i', i));
  main.querySelectorAll('.cal-bar').forEach((b, i) => b.style.setProperty('--i', i));
  main.querySelectorAll('.aviso').forEach((b, i) => b.style.setProperty('--i', i));
  main.classList.add('animando');
  clearTimeout(main._anim);
  main._anim = setTimeout(() => main.classList.remove('animando'), 2200);
}

/* ───────────── Contadores ───────────── */

const RE = /^(-?)([\d.]+)(?:,(\d+))?\s?(€|%)?$/;
function contar(kpi) {
  const el = kpi.querySelector?.('.kpi-value') || (kpi.classList?.contains('kpi-value') ? kpi : null);
  if (!el || el.dataset.contado) return;
  el.dataset.contado = '1';
  const txt = el.textContent.trim();
  const m = txt.replace(/ /g, ' ').match(RE);
  if (!m || reducido()) return;
  const dec = m[3] ? m[3].length : 0;
  const final = Number(`${m[1]}${m[2].replace(/\./g, '')}.${m[3] || 0}`);
  if (!Number.isFinite(final) || Math.abs(final) < 0.01) return;
  const fmt = new Intl.NumberFormat('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' });
  const suf = m[4] ? ` ${m[4]}` : '';
  const t0 = performance.now();
  const dur = 1100;
  const paso = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - t, 4);
    el.textContent = `${fmt.format(final * e)}${suf}`;
    if (t < 1) requestAnimationFrame(paso);
    else el.textContent = txt;
  };
  requestAnimationFrame(paso);
}

/* ───────────── Píldoras deslizantes ───────────── */

const ultimas = new Map();

/** Coloca un indicador bajo la opción activa y lo anima desde su posición anterior. */
export function pildoras(raiz) {
  raiz.querySelectorAll('.segmented').forEach((seg, i) => {
    const on = seg.querySelector('button.on');
    if (!on) return;
    const pill = document.createElement('span');
    pill.className = 'seg-pill';
    seg.prepend(pill);
    const clave = `${location.hash.split('/')[1] || ''}|${i}`;
    const destino = { left: on.offsetLeft, width: on.offsetWidth };
    const antes = ultimas.get(clave);
    const aplicar = (p) => { pill.style.left = `${p.left}px`; pill.style.width = `${p.width}px`; };
    if (antes && !reducido()) {
      pill.style.transition = 'none';
      aplicar(antes);
      requestAnimationFrame(() => requestAnimationFrame(() => { pill.style.transition = ''; aplicar(destino); }));
    } else aplicar(destino);
    ultimas.set(clave, destino);
  });
}

let navAntes = null;
/** Indicador del menú lateral que se desliza como la cabina del ascensor. */
export function indicadorNav(nav) {
  const act = nav.querySelector('.nav-item.active');
  if (!act) return;
  const ind = document.createElement('span');
  ind.className = 'nav-indicator';
  nav.prepend(ind);
  const pos = { y: act.offsetTop, h: act.offsetHeight };
  const set = (p) => { ind.style.transform = `translateY(${p.y}px)`; ind.style.height = `${p.h}px`; };
  if (navAntes && navAntes.y !== pos.y && !reducido()) {
    ind.style.transition = 'none';
    set(navAntes);
    requestAnimationFrame(() => requestAnimationFrame(() => { ind.style.transition = ''; set(pos); }));
  } else set(pos);
  navAntes = pos;
}
