import { html, raw, ICON, toast, descargar, abrirDialogo, confirmar, esc, fmtEUR, fmtMes } from './ui.js';
import { app, today, commit, avisos, piso, unidad, contrato, nombreUnidad, listaCobros, ctxPiso, resultado } from './state.js';
import { cargar, guardar, estructuraInicial, sincronizar, migrar, borrarTodo, PLANTILLAS, uid } from './store.js';
import { datosDemo } from './demo.js';
import { addMonths, ymOf, monthStart, monthEnd, CAT, num, r2, cuadroAmortizacion, diffDays, todayISO } from './calc.js';
import { aCSV, deCSV, fechaISO } from './csv.js';
import { vistaPanel } from './views/panel.js';
import { vistaCobros } from './views/cobros.js';
import { vistaPisos, vistaPiso } from './views/pisos.js';
import { vistaGastos } from './views/gastos.js';
import { vistaCalendario } from './views/calendario.js';
import { vistaFiscal, calculoFiscal } from './views/fiscal.js';
import { vistaAjustes } from './views/ajustes.js';
import * as F from './forms.js';
import { guardarArchivo, leerBlob, ponerBlob, crearZip, leerZip, extension, urlDe } from './docs.js';
import { iniciarEscena, irAPlanta, plantaDe, asomar, SECCIONES, numeroSeccion, definirPisos, nombrarPisos } from './building.js';
import { entrar, pildoras, indicadorNav } from './motion.js';

app.version = '2.2.0';

const NAV = [
  ['', 'Panel', 'panel'],
  ['cobros', 'Cobros', 'cobros'],
  ['gastos', 'Gastos', 'gastos'],
  ['calendario', 'Calendario', 'calendario'],
  ['pisos', 'Pisos', 'pisos'],
  ['fiscal', 'Fiscal', 'fiscal'],
  ['ajustes', 'Ajustes', 'ajustes'],
];
const NAV_MOVIL = ['', 'cobros', 'gastos', 'calendario', 'pisos'];
const PAGINAS = ['', 'cobros', 'gastos', 'calendario', 'pisos', 'fiscal', 'ajustes'];
/** Planta del edificio de cada ruta: las fichas de piso tienen cada una la suya. */
function destino(seccion, id) {
  if (seccion === 'piso') {
    const i = Math.max(0, app.s?.pisos.findIndex((p) => p.id === id) ?? 0);
    return { pagina: 'piso', idx: i, nombre: app.s?.pisos[i]?.nombre || 'Ficha del piso' };
  }
  if (seccion === 'calendario' && id) return { pagina: 'calendario', idx: 1, nombre: `Calendario · ${app.s?.pisos.find((p) => p.id === id)?.nombre || ''}` };
  return { pagina: PAGINAS.includes(seccion) ? seccion : '', idx: 0 };
}

function ruta() {
  const h = location.hash.replace(/^#\/?/, '');
  const [seccion = '', id = ''] = h.split('/');
  return { seccion, id: decodeURIComponent(id) };
}

let ultimaSeccion = null;
let ultimoId = null;
let vieneDeBienvenida = false;
let ultimoDia = todayISO();

function render({ oculto = false } = {}) {
  const { seccion, id } = ruta();
  const main = document.getElementById('main');
  if (!app.s) { ultimaSeccion = null; return renderBienvenida(); }
  // Si la app ha estado abierta de un día para otro, genera los recibos y gastos nuevos.
  if (todayISO() !== ultimoDia) {
    ultimoDia = todayISO();
    if (sincronizar(app.s, ultimoDia)) guardar(app.s);
  }
  let vista;
  switch (seccion) {
    case '': vista = vistaPanel(); break;
    case 'cobros': vista = vistaCobros(); break;
    case 'gastos': if (ultimaSeccion !== 'gastos') app.ui.gastosLimite = 60; vista = vistaGastos(); break;
    case 'calendario': vista = vistaCalendario(id); break;
    case 'pisos': vista = vistaPisos(); break;
    case 'piso': vista = vistaPiso(id); break;
    case 'fiscal': vista = vistaFiscal(); break;
    case 'ajustes': vista = vistaAjustes(); break;
    default: vista = vistaPanel();
  }
  const activa = seccion === 'piso' ? 'pisos' : seccion;
  document.body.dataset.ruta = activa || 'panel';
  const entrando = seccion !== ultimaSeccion || id !== ultimoId;
  const ids = app.s.pisos.map((p) => p.id).join('|');
  nombrarPisos(app.s.pisos.map((p) => p.nombre));
  if (ids !== render._ids) { definirPisos(app.s.pisos.map((p) => p.id)); render._ids = ids; }
  const primera = ultimaSeccion === null;
  const scroll = entrando ? 0 : window.scrollY;
  main.classList.remove('saliendo');
  main.innerHTML = String(vista);
  renderNav(activa, entrando);
  ultimaSeccion = seccion;
  ultimoId = id;
  if (entrando) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
    const dest = destino(seccion, id);
    if (oculto) main.classList.add('en-viaje');
    else if (primera && vieneDeBienvenida) {
      // Al salir del portal el ascensor sube hasta el Panel; el contenido aparece al frenar.
      vieneDeBienvenida = false;
      main.classList.add('en-viaje');
      llegar(main, irAPlanta(dest.pagina, dest));
    } else if (primera) {
      // Al abrir la app: el contenido se ve al instante y el edificio sube por detrás.
      irAPlanta(dest.pagina, { ...dest, desde: plantaDe(dest.pagina, dest.idx) - 2.5 });
      entrar(main);
    } else {
      irAPlanta(dest.pagina, dest);
      entrar(main);
    }
  } else window.scrollTo(0, scroll);
  pildoras(main);
  main.querySelectorAll('img[data-thumb]').forEach(async (img) => { img.src = (await urlDe(img.dataset.thumb, true)) || ''; });
  document.title = `${NAV.find((n) => n[0] === activa)?.[1] || 'Panel'} · Alquileres`;
}
app.render = render;

/** Muestra la página en cuanto la cabina empieza a frenar (o a los 0,6 s, por si acaso). */
function llegar(main, viaje) {
  const id = ++navId;
  Promise.race([viaje.casi, new Promise((r) => setTimeout(r, viaje.espera || 250))]).then(() => {
    if (id !== navId) return;
    main.classList.remove('en-viaje');
    entrar(main);
  });
}

function renderNav(activa, entrando) {
  const n = avisos().total;
  const badge = (k) => (k === '' && n ? `<span class="badge" aria-label="${n} avisos">${n}</span>` : '');
  const nav = document.getElementById('sidenav');
  nav.innerHTML = NAV.map(
    ([k, t, i]) => `<a href="#/${k}" class="nav-item${activa === k ? ' active' : ''}"${activa === k ? ' aria-current="page"' : ''} data-pagina="${k}">${ICON[i]}<span>${t}</span>${badge(k)}</a>`,
  ).join('');
  indicadorNav(nav);
  const movil = NAV_MOVIL.map((k) => NAV.find((x) => x[0] === k));
  const enMas = !NAV_MOVIL.includes(activa);
  document.getElementById('tabbar').innerHTML =
    movil.map(([k, t, i]) => `<a href="#/${k}" class="tab${activa === k ? ' active' : ''}${activa === k && entrando ? ' salto' : ''}"${activa === k ? ' aria-current="page"' : ''}>${ICON[i]}<span>${t}</span>${badge(k)}</a>`).join('') +
    `<button class="tab${enMas ? ' active' : ''}" data-action="menu-mas">${ICON.mas}<span>Más</span></button>`;
}

function renderBienvenida() {
  document.getElementById('sidenav').innerHTML = '';
  document.getElementById('tabbar').innerHTML = '';
  delete document.body.dataset.ruta;
  vieneDeBienvenida = true;
  irAPlanta('__portal');
  const main = document.getElementById('main');
  main.classList.remove('saliendo');
  setTimeout(() => entrar(main), 0);
  main.innerHTML = String(html`
    <section class="welcome">
      <div class="welcome-mark">${raw(ICON.key)}</div>
      <h1>Gestión de alquileres</h1>
      <p class="muted">Cobros, impagos, contratos, gastos, hipotecas, rentabilidad y fiscalidad de tus pisos. Los datos se guardan solo en este dispositivo.</p>
      <div class="welcome-options">
        <button class="welcome-opt" data-action="empezar">
          <strong>Empezar con mi cartera</strong>
          <span>6 pisos listos para rellenar: 4 a tu nombre (2 tradicionales, 1 por habitaciones, 1 turístico) y 2 de tu sociedad por habitaciones.</span>
        </button>
        <button class="welcome-opt" data-action="cargar-demo">
          <strong>Ver con datos de ejemplo</strong>
          <span>Explora la app con inquilinos, reservas e impagos ficticios. Podrás borrarlos después.</span>
        </button>
        <label class="welcome-opt">
          <strong>Restaurar una copia</strong>
          <span>Importa un archivo JSON exportado desde otro dispositivo.</span>
          <input type="file" accept=".json,application/json" data-import="json" hidden>
        </label>
      </div>
    </section>`);
}

/* ───────────── Acciones ───────────── */

const acciones = {
  empezar: () => { app.s = estructuraInicial(); commit('Cartera creada. Empieza por los datos de cada piso.'); location.hash = '#/pisos'; },
  'cargar-demo': async () => {
    if (app.s && !app.s.ajustes.demo && !(await confirmar('Cargar datos de ejemplo', 'Se sustituirán tus datos actuales por datos ficticios. Exporta antes una copia si quieres conservarlos.', { ok: 'Cargar ejemplo' }))) return;
    app.s = datosDemo(today());
    commit('Datos de ejemplo cargados');
    location.hash = '#/';
  },
  'quitar-demo': async () => {
    if (!(await confirmar('Empezar con mis datos', 'Se borrarán los datos de ejemplo y se creará tu cartera vacía de 6 pisos.', { ok: 'Empezar' }))) return;
    app.s = estructuraInicial();
    commit('Listo. Ya puedes introducir tus datos.');
    location.hash = '#/pisos';
  },
  'borrar-todo': async () => {
    if (!(await confirmar('Borrar todos los datos', 'Se eliminará toda la información de este dispositivo. Exporta antes una copia de seguridad. No se puede deshacer.', { ok: 'Borrar todo' }))) return;
    borrarTodo();
    app.s = null;
    location.hash = '#/';
    render();
  },
  mes: (el) => {
    const k = el.dataset.k;
    if (k === 'cal') app.ui.cal.mes = addMonths(app.ui.cal.mes, Number(el.dataset.d));
    else app.ui.mes = addMonths(app.ui.mes, Number(el.dataset.d));
    render();
  },
  'mes-hoy': (el) => {
    if (el.dataset.k === 'cal') app.ui.cal.mes = ymOf(today());
    else app.ui.mes = ymOf(today());
    render();
  },
  'toggle-extra': (el) => { app.ui.incluirExtra = el.checked; render(); },
  'ir-planta': (el) => {
    if (!app.s) return;
    const r = ruta();
    const actual = r.id ? `${r.seccion}/${encodeURIComponent(r.id)}` : r.seccion;
    if (el.dataset.ir === actual || el.dataset.ir === r.seccion && !r.id) {
      // Número de la sección actual: baja (o sube) hasta esa altura de la página.
      const max = document.documentElement.scrollHeight - innerHeight;
      window.scrollTo({ top: max * Number(el.dataset.frac || 0), behavior: 'smooth' });
    } else location.hash = `#/${el.dataset.ir}`;
  },
  ascensor: () => {
    if (!app.s) return;
    const actual = destino(ruta().seccion, ruta().id).pagina;
    const pag = actual === 'piso' ? 'pisos' : actual;
    abrirDialogo({
      titulo: 'Ascensor',
      cuerpo: html`<p class="muted">Cada sección es una planta del edificio. Elige a cuál quieres ir.</p>
        <div class="ascensor">${[...SECCIONES].reverse().map(([k, nombre]) => html`
          <button type="button" class="boton-planta${k === pag ? ' on' : ''}" data-ir="${k}"><b>${numeroSeccion(k)}</b><span><strong>${nombre}</strong><small>Planta ${numeroSeccion(k)}</small></span></button>`)}</div>
        <h3 class="sub-h">Planta 3 · fichas de cada piso</h3>
        <div class="ascensor-pisos">${app.s.pisos.map((p, i) => html`<button type="button" class="chip-planta${ruta().id === p.id ? ' on' : ''}" data-ir="piso/${encodeURIComponent(p.id)}"><b>3${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[3 + 2 * i] || ''}</b>${p.nombre}</button>`)}</div>`,
    });
    document.querySelectorAll('#dialogo [data-ir]').forEach((b) => b.addEventListener('click', () => { F.cerrarDialogo(); location.hash = `#/${b.dataset.ir}`; }));
  },
  'mas-gastos': () => { app.ui.gastosLimite = (app.ui.gastosLimite || 60) + 60; render(); },
  'ver-sin-just': (el, e) => { e.preventDefault(); Object.assign(app.ui.gastos, { anio: el.dataset.anio, mes: '', cat: 'sinjust', q: '', piso: '' }); location.hash = '#/gastos'; },
  'filtro-sinjust': () => { app.ui.gastos.cat = app.ui.gastos.cat === 'sinjust' ? '' : 'sinjust'; render(); },
  'zip-gestor': () => zipGestor(false),
  'compartir-gestor': () => zipGestor(true),
  'exportar-zip': () => exportarZipCompleto(),
  'ver-doc': async (el) => { const { verDoc } = await import('./adjuntos.js'); verDoc(app.s.docs.find((d) => d.id === el.dataset.id)); },
  'tip-visto': () => { app.s.ajustes.tipEdificio = true; commit(); },
  'avisos-todos': () => { app.ui.avisosTodos = !app.ui.avisosTodos; render(); },
  'actualizar-renta': (el) => F.actualizarRenta(el.dataset.id),
  'filtro-cobros': (el) => { app.ui.cobros.estado = el.dataset.estado; if (el.tagName !== 'A') render(); },
  'cal-piso': (el) => { app.ui.cal.piso = el.dataset.id; location.hash = `#/calendario/${el.dataset.id}`; },
  'ver-gastos-piso': (el, e) => { e.preventDefault(); Object.assign(app.ui.gastos, { piso: el.dataset.piso, anio: '', mes: '', cat: '', q: '' }); location.hash = '#/gastos'; },
  copiar: async (el) => {
    try {
      await navigator.clipboard.writeText(el.dataset.texto);
      toast('Mensaje copiado');
    } catch {
      abrirDialogo({ titulo: 'Copia el mensaje', cuerpo: html`<textarea class="copy-area" rows="6" readonly>${el.dataset.texto}</textarea>` });
      document.querySelector('.copy-area')?.select();
    }
  },
  cobrar: (el) => F.cobrar(el.dataset.tipo, el.dataset.id),
  descobrar: (el) => F.descobrar(el.dataset.tipo, el.dataset.id),
  'nuevo-cobro': () => F.formCobro(null),
  'editar-cobro': (el) => F.formCobro(el.dataset.id),
  'nuevo-contrato': (el) => F.formContrato(null, { pisoId: el.dataset.piso, unidadId: el.dataset.unidad }),
  'editar-contrato': (el) => F.formContrato(el.dataset.id),
  renovar: (el) => F.renovar(el.dataset.id),
  'finalizar-contrato': (el) => F.finalizarContrato(el.dataset.id),
  'aviso-hecho': (el) => F.avisoHecho(el.dataset.id, el.dataset.tramo),
  'nuevo-piso': () => F.formPiso(null),
  'editar-piso': (el) => F.formPiso(el.dataset.id),
  'nueva-unidad': (el) => F.formUnidad(null, el.dataset.piso),
  'editar-unidad': (el) => F.formUnidad(el.dataset.id),
  'nuevo-titular': () => F.formTitular(null),
  'editar-titular': (el) => F.formTitular(el.dataset.id),
  'nuevo-gasto': (el) => F.formGasto(null, el.dataset.piso),
  'editar-gasto': (el) => F.formGasto(el.dataset.id),
  'nuevo-recurrente': (el) => F.formRecurrente(null, el.dataset.piso),
  'editar-recurrente': (el) => F.formRecurrente(el.dataset.id),
  'nueva-hipoteca': (el) => F.formHipoteca(null, el.dataset.piso),
  'editar-hipoteca': (el) => F.formHipoteca(el.dataset.id),
  'nueva-reserva': (el) => F.formReserva(null, { pisoId: el.dataset.piso, fecha: el.dataset.fecha }),
  'editar-reserva': (el) => F.formReserva(el.dataset.id),
  'plantillas-defecto': () => { app.s.ajustes.plantillas = { ...PLANTILLAS }; commit('Textos restaurados'); },
  'exportar-json': () => exportarJSON(),
  'exportar-csv': (el) => exportarCSV(el.dataset.tabla),
  'exportar-fiscal': () => exportarFiscal(),
  'menu-mas': () => {
    abrirDialogo({
      titulo: 'Más',
      cuerpo: html`<nav class="more-nav">${NAV.filter(([k]) => !NAV_MOVIL.includes(k)).map(([k, t, i]) => html`<a href="#/${k}" data-dlg-close>${raw(ICON[i])}<span>${t}</span></a>`)}</nav>`,
    });
    document.querySelectorAll('.more-nav a').forEach((a) => a.addEventListener('click', () => F.cerrarDialogo()));
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = acciones[el.dataset.action];
  if (!fn) return;
  if (el.type !== 'checkbox' && el.tagName !== 'A') e.preventDefault();
  fn(el, e);
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.filter) {
    const grupo = app.ui[el.dataset.filter];
    grupo[el.name] = el.value;
    render();
    return;
  }
  if (el.dataset.import) importar(el);
  if (el.matches('[data-rapido-foto]')) fotoRapida(el);
});

let tBusqueda;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.filter && el.type === 'search') {
    clearTimeout(tBusqueda);
    tBusqueda = setTimeout(() => {
      app.ui[el.dataset.filter][el.name] = el.value;
      render();
      const nuevo = document.querySelector(`input[type=search][name="${el.name}"]`);
      if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }
    }, 250);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form).entries());
  if (form.dataset.form === 'gasto-rapido') {
    d.extraordinario = form.elements.extraordinario.checked;
    if (F.gastoRapido(d, app.ui.adjRapido || [])) app.ui.adjRapido = [];
    setTimeout(() => document.querySelector('[data-form="gasto-rapido"] [name="importe"]')?.focus(), 0);
  }
  if (form.dataset.form === 'ajustes') {
    const a = app.s.ajustes;
    a.gracia = Math.max(0, Math.min(30, num(d.gracia) | 0));
    const tramos = String(d.tramos || '').split(',').map((x) => parseInt(x, 10)).filter((x) => x > 0);
    a.tramos = tramos.length ? [...new Set(tramos)].sort((x, y) => y - x) : [90, 60, 30];
    a.plantillas = { impago: d.impago, hoy: d.hoy, varios: d.varios, reserva: d.reserva };
    commit('Ajustes guardados');
  }
});

/* Tooltip del gráfico */
function tip(e) {
  const g = e.target.closest?.('.bar-g');
  const chart = e.target.closest?.('[data-chart]');
  if (!chart) return;
  const box = chart.querySelector('.chart-tip');
  if (!g) { box.hidden = true; return; }
  box.textContent = g.dataset.tip;
  box.hidden = false;
  const r = chart.getBoundingClientRect();
  const gr = g.getBoundingClientRect();
  const x = gr.left - r.left + gr.width / 2;
  box.style.left = `${Math.min(r.width - 90, Math.max(90, x))}px`;
}
document.addEventListener('pointerover', tip);
document.addEventListener('focusin', tip);
document.addEventListener('pointerleave', (e) => { if (e.target.closest?.('[data-chart]')) e.target.querySelector('.chart-tip').hidden = true; }, true);

/** Foto del ticket desde el alta rápida de gastos: se guarda y se asocia al gasto al pulsar «Añadir». */
async function fotoRapida(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const cuenta = document.querySelector('[data-rapido-cuenta]');
  if (cuenta) cuenta.textContent = 'Guardando…';
  try {
    app.ui.adjRapido = [...(app.ui.adjRapido || []), await guardarArchivo(file, uid())];
  } catch (e) {
    console.error(e);
    toast('No se ha podido guardar la foto en este dispositivo.', { tipo: 'error' });
  }
  const n = app.ui.adjRapido?.length || 0;
  if (cuenta) cuenta.textContent = n ? `${n} foto${n > 1 ? 's' : ''}` : 'Ticket';
  cuenta?.closest('.btn-foto')?.classList.toggle('con', n > 0);
}

/* ───────────── Exportación / importación ───────────── */

const fechaArchivo = () => today();

async function exportarJSON() {
  const s = app.s;
  const nombre = `alquileres-copia-${fechaArchivo()}.json`;
  const json = JSON.stringify({ ...s, ajustes: { ...s.ajustes, ultimoBackup: today() } }, null, 1);
  const marcar = (msg) => {
    s.ajustes.ultimoBackup = today();
    commit(msg);
  };
  // En iPhone / app instalada la descarga directa es poco fiable: se usa la hoja de compartir («Guardar en Archivos»).
  const movil = matchMedia('(pointer: coarse)').matches;
  try {
    const file = new File([json], nombre, { type: 'application/json' });
    if (movil && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Copia de Alquileres' });
      marcar('Copia guardada');
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return toast('Copia cancelada', { tipo: 'warn' });
  }
  descargar(nombre, json);
  marcar('Copia descargada. Guárdala en iCloud Drive o similar.');
}

function exportarCSV(tabla) {
  const s = app.s;
  const pn = (id) => piso(id)?.nombre || '';
  let filas;
  let cols;
  if (tabla === 'cobros') {
    filas = listaCobros();
    cols = [['vencimiento', (c) => c.vencimiento], ['periodo', (c) => c.periodo], ['tipo', (c) => c.tipo], ['piso', (c) => pn(c.pisoId)], ['unidad', (c) => unidad(c.unidadId)?.nombre || ''], ['pagador', (c) => c.nombre], ['telefono', (c) => c.telefono], ['concepto', (c) => c.concepto], ['importe', (c) => c.importe], ['cobrado', (c) => c.cobrado], ['fecha_cobro', (c) => c.fechaCobro || ''], ['estado', (c) => c.estado]];
  } else if (tabla === 'gastos') {
    filas = [...s.gastos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    cols = [['fecha', (g) => g.fecha], ['piso', (g) => pn(g.pisoId)], ['categoria', (g) => CAT[g.categoria]?.nombre || g.categoria], ['concepto', (g) => g.concepto], ['proveedor', (g) => g.proveedor], ['importe', (g) => num(g.importe)], ['extraordinario', (g) => !!g.extraordinario], ['deducible', (g) => g.deducible !== false && CAT[g.categoria]?.trato !== 'no'], ['fijo', (g) => !!g.recurrenteId]];
  } else if (tabla === 'reservas') {
    filas = [...s.reservas].sort((a, b) => (a.entrada < b.entrada ? -1 : 1));
    cols = [['piso', (r) => pn(r.pisoId)], ['huesped', (r) => r.huesped], ['telefono', (r) => r.telefono], ['canal', (r) => r.canal], ['entrada', (r) => r.entrada], ['salida', (r) => r.salida], ['noches', (r) => diffDays(r.entrada, r.salida)], ['huespedes', (r) => r.huespedes], ['importe', (r) => num(r.importe)], ['comision', (r) => num(r.comision)], ['cobrado', (r) => num(r.cobrado)]];
  } else if (tabla === 'contratos') {
    filas = s.contratos;
    cols = [['piso', (k) => pn(k.pisoId)], ['unidad', (k) => unidad(k.unidadId)?.nombre || ''], ['inquilino', (k) => k.inquilino], ['dni', (k) => k.dni], ['telefono', (k) => k.telefono], ['email', (k) => k.email], ['renta', (k) => num(k.renta)], ['dia_pago', (k) => k.diaPago], ['inicio', (k) => k.inicio], ['fin', (k) => k.fin], ['fianza', (k) => num(k.fianza)], ['finalizado', (k) => !!k.finalizado]];
  } else if (tabla === 'resumen') {
    const meses = [];
    const hasta = ymOf(today());
    for (let m = addMonths(hasta, -23); m <= hasta; m = addMonths(m, 1)) meses.push(m);
    filas = [];
    for (const m of meses) for (const p of s.pisos) filas.push({ m, p, r: resultado(p.id, monthStart(m), monthEnd(m)) });
    cols = [['mes', (x) => x.m], ['titular', (x) => s.titulares.find((t) => t.id === x.p.titularId)?.nombre || ''], ['piso', (x) => x.p.nombre], ['ingresos', (x) => x.r.ingresos], ['cobrado', (x) => x.r.cobrado], ['gastos_ordinarios', (x) => x.r.gastosOrdinarios], ['gastos_extraordinarios', (x) => x.r.gastosExtra], ['neto_operativo', (x) => x.r.neto], ['cuota_hipoteca', (x) => x.r.cuota], ['intereses', (x) => x.r.intereses], ['cash_flow', (x) => x.r.cashflow]];
  } else if (tabla === 'hipotecas') {
    filas = [];
    for (const h of s.hipotecas) for (const c of cuadroAmortizacion(h, h.mesRef)) filas.push({ h, c });
    cols = [['piso', (x) => pn(x.h.pisoId)], ['entidad', (x) => x.h.entidad], ['mes', (x) => x.c.ym], ['cuota', (x) => x.c.cuota], ['intereses', (x) => x.c.intereses], ['capital', (x) => x.c.capital], ['pendiente_tras_cuota', (x) => r2(x.c.pendiente - x.c.capital)]];
  }
  descargar(`alquileres-${tabla}-${fechaArchivo()}.csv`, aCSV(filas, cols), 'text/csv');
}

function exportarFiscal() {
  const anio = app.ui.fiscal.anio;
  descargar(`alquileres-fiscal-${anio}.csv`, csvFiscal(anio), 'text/csv');
}

function csvFiscal(anio) {
  const datos = calculoFiscal(anio);
  const filas = [];
  for (const d of datos) {
    for (const x of d.pisos) {
      filas.push({ t: d.t.nombre, reg: d.reg, p: x.p, f: x.f });
    }
  }
  const g = (k) => (x) => x.f.grupos[k];
  const cols = [
    ['ejercicio', () => anio], ['titular', (x) => x.t], ['regimen', (x) => x.reg], ['piso', (x) => x.p.nombre], ['direccion', (x) => x.p.direccion], ['ref_catastral', (x) => x.p.refCatastral],
    ['ingresos_integros', (x) => x.f.ingresos], ['intereses_financiacion', g('financiacion')], ['reparacion_conservacion', g('conservacion')], ['tributos_tasas', g('tributos')],
    ['dudoso_cobro', g('dudoso')], ['formalizacion_juridico', g('juridico')], ['seguros', g('seguros')], ['servicios_terceros', g('servicios')], ['suministros_comunidad', g('suministros')],
    ['otros', g('otros')], ['exceso_anos_anteriores_aplicado', g('arrastre')], ['amortizacion_inmueble', g('amort_inm')], ['amortizacion_muebles', g('amort_mue')], ['total_gastos', (x) => x.f.gastosDeducibles],
    ['exceso_no_deducido', (x) => x.f.exceso], ['pendiente_anos_futuros', (x) => x.f.pendienteFuturo], ['dias_arrendado_pct', (x) => Math.round(x.f.pct * 1000) / 10], ['rendimiento_neto', (x) => x.f.rendimientoNeto], ['reduccion', (x) => x.f.reduccion], ['rendimiento_reducido', (x) => x.f.rendimientoReducido],
  ];
  return aCSV(filas, cols);
}

/* ───────────── Justificantes para el gestor y copia con documentos ───────────── */

const limpio = (t) => String(t || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 70) || 'documento';

/** ZIP con los justificantes de un ejercicio, ordenados por carpetas, con un índice y el resumen fiscal. */
async function zipGestor(compartir) {
  const s = app.s;
  const anio = app.ui.fiscal.anio;
  const ini = `${anio}-01-01`;
  const fin = `${anio}-12-31`;
  const raiz = `Justificantes ${anio}`;
  const pn = (id) => limpio(piso(id)?.nombre || 'Sin piso');
  const entradas = [];
  const indice = [];
  const usados = new Set();
  let faltan = 0;
  toast('Preparando los justificantes…', { ms: 2500 });
  const anadir = async (d, carpeta, base, info) => {
    const b = await leerBlob(d.id);
    if (!b) { faltan++; return; }
    let nombre = `${carpeta}/${limpio(base)}`;
    for (let n = 2; usados.has(nombre); n++) nombre = `${carpeta}/${limpio(base)} (${n})`;
    usados.add(nombre);
    nombre += `.${extension(d.mime, d.nombre)}`;
    entradas.push({ nombre: `${raiz}/${nombre}`, datos: b });
    indice.push({ ...info, archivo: nombre });
  };
  const de = (tipo, id) => s.docs.filter((d) => d.tipo === tipo && d.refId === id);
  for (const g of s.gastos.filter((x) => x.fecha >= ini && x.fecha <= fin).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))) {
    for (const d of de('gasto', g.id)) {
      await anadir(d, `Gastos/${pn(g.pisoId)}`, `${g.fecha} ${g.concepto || CAT[g.categoria]?.nombre || 'Gasto'} ${fmtEUR(g.importe)}`, { tipo: 'Gasto', piso: piso(g.pisoId)?.nombre, fecha: g.fecha, concepto: g.concepto || CAT[g.categoria]?.nombre, categoria: CAT[g.categoria]?.nombre, importe: num(g.importe) });
    }
  }
  for (const k of s.contratos.filter((x) => x.inicio <= fin && (!x.fin || x.fin >= ini))) {
    for (const d of de('contrato', k.id)) await anadir(d, `Contratos/${pn(k.pisoId)}`, `${k.inquilino} desde ${k.inicio}`, { tipo: 'Contrato', piso: piso(k.pisoId)?.nombre, fecha: k.inicio, concepto: `Contrato de ${k.inquilino}`, importe: num(k.renta) });
  }
  for (const r of s.reservas.filter((x) => x.entrada <= fin && x.salida >= ini)) {
    for (const d of de('reserva', r.id)) await anadir(d, `Reservas/${pn(r.pisoId)}`, `${r.entrada} ${r.huesped}`, { tipo: 'Reserva', piso: piso(r.pisoId)?.nombre, fecha: r.entrada, concepto: `${r.huesped} · ${r.canal || ''}`, importe: num(r.importe) });
  }
  for (const h of s.hipotecas) for (const d of de('hipoteca', h.id)) await anadir(d, `Hipotecas/${pn(h.pisoId)}`, `${h.entidad || 'Hipoteca'} ${d.nombre.replace(/\.\w+$/, '')}`, { tipo: 'Hipoteca', piso: piso(h.pisoId)?.nombre, concepto: h.entidad });
  for (const p of s.pisos) for (const d of de('piso', p.id)) await anadir(d, `Pisos/${limpio(p.nombre)}`, d.nombre.replace(/\.\w+$/, ''), { tipo: 'Documento del piso', piso: p.nombre, concepto: d.nombre });

  const sinJust = s.gastos.filter((g) => g.fecha >= ini && g.fecha <= fin && CAT[g.categoria]?.trato !== 'no' && g.deducible !== false && !g.recurrenteId && !s.docs.some((d) => d.tipo === 'gasto' && d.refId === g.id));
  entradas.push({ nombre: `${raiz}/indice.csv`, datos: aCSV(indice, [['tipo', (x) => x.tipo], ['piso', (x) => x.piso], ['fecha', (x) => x.fecha || ''], ['concepto', (x) => x.concepto], ['categoria', (x) => x.categoria || ''], ['importe', (x) => x.importe ?? ''], ['archivo', (x) => x.archivo]]) });
  entradas.push({ nombre: `${raiz}/resumen-fiscal-${anio}.csv`, datos: csvFiscal(anio) });
  if (sinJust.length) entradas.push({ nombre: `${raiz}/gastos-sin-justificante.csv`, datos: aCSV(sinJust, [['fecha', (g) => g.fecha], ['piso', (g) => piso(g.pisoId)?.nombre], ['concepto', (g) => g.concepto || CAT[g.categoria]?.nombre], ['importe', (g) => num(g.importe)]]) });
  entradas.push({ nombre: `${raiz}/LEEME.txt`, datos: [
    `Justificantes del ejercicio ${anio}`,
    `Generado el ${today()} con la app Alquileres.`,
    '',
    `Documentos: ${indice.length}`,
    `Gastos deducibles sin justificante: ${sinJust.length}${sinJust.length ? ' (ver gastos-sin-justificante.csv)' : ''}`,
    faltan ? `Documentos no disponibles en este dispositivo: ${faltan}` : '',
    '',
    'Carpetas: Gastos, Contratos, Reservas, Hipotecas y Pisos, cada una por inmueble.',
    'indice.csv relaciona cada archivo con su apunte; resumen-fiscal contiene el cálculo por inmueble.',
    'Conserva estos justificantes al menos 4 años (plazo de prescripción ante Hacienda).',
  ].join('\r\n') });
  const zip = await crearZip(entradas);
  const nombre = `justificantes-${anio}.zip`;
  const file = new File([zip], nombre, { type: 'application/zip' });
  if (compartir && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `Justificantes ${anio}`, text: `Justificantes del alquiler ${anio}` }); } catch {}
    return;
  }
  descargar(nombre, zip);
  toast(`ZIP con ${indice.length} documentos descargado${sinJust.length ? ` · faltan ${sinJust.length} justificantes` : ''}`, { tipo: sinJust.length ? 'warn' : 'ok', ms: 6000 });
}

/** Copia completa: los datos y todos los documentos en un único ZIP. */
async function exportarZipCompleto() {
  const s = app.s;
  toast('Preparando la copia con documentos…', { ms: 2500 });
  const entradas = [{ nombre: 'alquileres.json', datos: JSON.stringify({ ...s, ajustes: { ...s.ajustes, ultimoBackup: today() } }) }];
  for (const d of s.docs) {
    const b = await leerBlob(d.id);
    if (b) entradas.push({ nombre: `docs/${d.id}`, datos: b });
    const t = d.miniatura ? await leerBlob(`${d.id}:t`) : null;
    if (t) entradas.push({ nombre: `docs/${d.id}.t`, datos: t });
  }
  const zip = await crearZip(entradas);
  const nombre = `alquileres-copia-con-documentos-${today()}.zip`;
  const file = new File([zip], nombre, { type: 'application/zip' });
  s.ajustes.ultimoBackup = today();
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Copia de Alquileres' }); commit('Copia guardada'); } catch {}
    return;
  }
  descargar(nombre, zip);
  commit(`Copia con ${s.docs.length} documentos descargada`);
}

async function importarZip(file) {
  const entradas = await leerZip(file);
  const json = entradas.find((e) => e.nombre === 'alquileres.json');
  if (!json) throw new Error('El ZIP no es una copia de la app (falta alquileres.json).');
  const datos = migrar(JSON.parse(new TextDecoder().decode(json.datos)));
  if (app.s && !(await confirmar('Restaurar copia con documentos', `Se sustituirán los datos actuales por los de «${file.name}» (${datos.pisos.length} pisos, ${datos.gastos.length} gastos, ${datos.docs.length} documentos).`, { ok: 'Restaurar' }))) return;
  for (const e of entradas) {
    if (!e.nombre.startsWith('docs/')) continue;
    const clave = e.nombre.slice(5).replace(/\.t$/, ':t');
    const ficha = datos.docs.find((d) => d.id === clave.replace(/:t$/, ''));
    await ponerBlob(clave, new Blob([e.datos], { type: clave.endsWith(':t') ? 'image/jpeg' : ficha?.mime || 'application/octet-stream' }));
  }
  app.s = datos;
  sincronizar(app.s, today());
  commit(`Copia restaurada con ${datos.docs.length} documentos`);
  location.hash = '#/';
}

async function importar(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const tipo = input.dataset.import;
  if (tipo === 'json' && /\.zip$/i.test(file.name)) {
    try { await importarZip(file); } catch (err) { console.error(err); toast(`No se ha podido restaurar: ${err.message}`, { tipo: 'error', ms: 7000 }); }
    return;
  }
  const texto = await file.text();
  try {
    if (tipo === 'json') {
      const datos = migrar(JSON.parse(texto));
      if (app.s && !(await confirmar('Restaurar copia', `Se sustituirán los datos actuales por los de «${file.name}» (${datos.pisos.length} pisos, ${datos.cobros.length} cobros, ${datos.gastos.length} gastos).`, { ok: 'Restaurar' }))) return;
      app.s = datos;
      sincronizar(app.s, today());
      commit('Copia restaurada');
      location.hash = '#/';
      return;
    }
    const filas = deCSV(texto);
    if (!filas.length) throw new Error('El CSV está vacío.');
    const pisoPor = (v) => {
      const t = String(v || '').trim().toLowerCase();
      return app.s.pisos.find((p) => p.nombre.toLowerCase() === t || p.id === v) || null;
    };
    const errores = [];
    let n = 0;
    let dup = 0;
    if (tipo === 'csv-gastos') {
      const catPor = (v) => {
        const t = String(v || '').trim().toLowerCase();
        return Object.values(CAT).find((c) => c.id === t || c.nombre.toLowerCase() === t)?.id || 'otros_ded';
      };
      filas.forEach((f, i) => {
        const p = pisoPor(f.piso);
        const fecha = fechaISO(f.fecha);
        const importe = r2(num(f.importe));
        if (!p || !fecha || !(importe > 0)) { errores.push(i + 2); return; }
        const concepto = f.concepto || '';
        if (app.s.gastos.some((g) => g.pisoId === p.id && g.fecha === fecha && Math.abs(g.importe - importe) < 0.005 && (g.concepto || '') === concepto)) { dup++; return; }
        app.s.gastos.push({ id: uid(), pisoId: p.id, fecha, categoria: catPor(f.categoria), concepto, proveedor: f.proveedor || '', importe, extraordinario: /^(s|si|sí|x|1|true)$/i.test(f.extraordinario || ''), deducible: !/^(no|0|false)$/i.test(f.deducible || '') });
        n++;
      });
    } else if (tipo === 'csv-reservas') {
      filas.forEach((f, i) => {
        const p = pisoPor(f.piso);
        const entrada = fechaISO(f.entrada);
        const salida = fechaISO(f.salida);
        const importe = r2(num(f.importe));
        if (!p || !entrada || !(salida > entrada) || !(importe > 0)) { errores.push(i + 2); return; }
        if (app.s.reservas.some((r) => r.pisoId === p.id && r.entrada === entrada && r.salida === salida && !r.cancelada)) { dup++; return; }
        app.s.reservas.push({ id: uid(), pisoId: p.id, huesped: f.huesped || 'Huésped', telefono: f.telefono || '', canal: f.canal || 'Directo', entrada, salida, huespedes: num(f.huespedes) | 0, importe, comision: r2(num(f.comision)), cobrado: Math.min(importe, r2(num(f.cobrado))), fechaCobro: num(f.cobrado) > 0 ? entrada : '', vencimiento: '', notas: '', cancelada: false });
        n++;
      });
    }
    commit(`${n} filas importadas${dup ? ` · ${dup} ya existían` : ''}${errores.length ? ` · ${errores.length} ignoradas (filas ${errores.slice(0, 8).join(', ')}${errores.length > 8 ? '…' : ''})` : ''}`, { tipo: errores.length ? 'warn' : 'ok', ms: 7000 });
  } catch (err) {
    console.error(err);
    toast(`No se ha podido importar: ${err.message}`, { tipo: 'error', ms: 7000 });
  }
}

/* ───────────── Arranque ───────────── */

/**
 * Cambio de página, coreografiado: el contenido sale (0,19 s), la cabina cierra puertas y el
 * edificio viaja con la escena a la vista; al llegar se abren las puertas y entra la nueva planta.
 */
let navId = 0;
function navegar() {
  const main = document.getElementById('main');
  const { seccion, id } = ruta();
  if (!app.s || ultimaSeccion === null || (seccion === ultimaSeccion && id === ultimoId) || matchMedia('(prefers-reduced-motion: reduce)').matches) return render();
  const nuevo = destino(seccion, id);
  const viejo = destino(ultimaSeccion, ultimoId);
  const a = plantaDe(nuevo.pagina, nuevo.idx);
  const de = plantaDe(viejo.pagina, viejo.idx);
  asomar(null);
  const viaje = irAPlanta(nuevo.pagina, nuevo);
  const miId = ++navId;
  // Navegación rápida (otro clic durante la salida o el viaje): se oculta ya, sin reiniciar animaciones.
  const enCurso = main.classList.contains('saliendo') || main.classList.contains('en-viaje');
  if (enCurso) main.classList.add('en-viaje');
  else {
    main.dataset.dir = a > de ? 'up' : 'down';
    main.classList.add('saliendo');
  }
  setTimeout(() => {
    if (miId !== navId) return;
    render({ oculto: true });
    llegar(main, viaje);
  }, enCurso ? 0 : 60);
}

// Al pasar por el menú, el edificio se asoma hacia la planta de destino.
document.addEventListener('pointerover', (e) => {
  const a = e.target.closest?.('.nav-item[data-pagina]');
  if (a && !a.classList.contains('active')) asomar(a.dataset.pagina);
});
document.addEventListener('pointerout', (e) => {
  const a = e.target.closest?.('.nav-item[data-pagina]');
  if (a && !a.contains(e.relatedTarget)) asomar(null);
});

function iniciar() {
  iniciarEscena();
  app.s = cargar();
  if (app.s) {
    if (sincronizar(app.s, today())) guardar(app.s);
  }
  window.addEventListener('hashchange', navegar);
  // Al volver a la app solo se repinta si ha cambiado el día (para no perder lo que se esté escribiendo).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && app.s && todayISO() !== ultimoDia && !document.querySelector('dialog[open]')) render();
  });
  render();
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Hay una versión nueva disponible', { accion: { texto: 'Actualizar', fn: () => location.reload() }, ms: 15000 });
          }
        });
      });
    }).catch(() => {});
  }
}

iniciar();

export { esc, fmtEUR, fmtMes, contrato, nombreUnidad, ctxPiso };
