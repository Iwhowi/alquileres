// Reparto de suministros en pisos por habitaciones: cada factura (luz, agua, gas, internet,
// limpieza…) se divide entre las habitaciones ocupadas en proporción a los días que cada inquilino ha
// vivido en el periodo facturado. Opcionalmente, un tope por inquilino incluido en la renta: solo se
// cobra lo que lo supere. Crea un recibo por inquilino para cobrarlo con la siguiente mensualidad.
import { html, raw, abrirDialogo, campo, inp, money, fmtEUR, fmtFecha, toast } from './ui.js';
import { app, commit } from './state.js';
import { uid } from './store.js';
import { dictarEn, rellenar, MICRO } from './voz.js';
import { camposReparto } from './voz-ordenes.js';
import { CAT, addDays, diffDays, ymOf, addMonths, dayInMonth, telefonoWhatsApp, todayISO } from './calc.js';

export const FACTURAS = [
  ['luz', 'Luz', /luz|electric|endesa|iberdrola|holaluz|repsol/],
  ['agua', 'Agua', /agua|emasesa|aljarafesa/],
  ['gas', 'Gas', /\bgas\b|naturgy|butano/],
  ['internet', 'Internet', /internet|fibra|wifi|digi|movistar|vodafone|orange|jazztel|masmovil|pepephone/],
  ['limpieza', 'Limpieza', /limpieza|limpiadora/],
  ['otros', 'Otros', null],
];
const r2 = (x) => Math.round(x * 100) / 100;
const n = (v) => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;
const nd = (v) => Number(String(v ?? '').replace(',', '.')) || 0;

/** Inquilinos del piso con contrato durante el periodo y los días que han estado (ambos días incluidos). */
export function ocupantesDe(s, pisoId, inicio, fin) {
  if (!inicio || !fin || fin < inicio) return [];
  const uds = new Map(s.unidades.filter((u) => u.pisoId === pisoId).map((u) => [u.id, u]));
  return s.contratos
    .filter((k) => uds.has(k.unidadId) && k.inicio <= fin && (k.fin || '9999-12-31') >= inicio)
    .map((k) => {
      const a = k.inicio > inicio ? k.inicio : inicio;
      const b = k.fin && k.fin < fin ? k.fin : fin;
      return { k, unidad: uds.get(k.unidadId), dias: Math.max(0, diffDays(a, b) + 1) };
    })
    .filter((o) => o.dias > 0)
    .sort((x, y) => (x.unidad.nombre < y.unidad.nombre ? -1 : x.unidad.nombre > y.unidad.nombre ? 1 : 0));
}

/**
 * Reparte cada factura por días de ocupación. El último inquilino absorbe el redondeo, para que la
 * suma cuadre al céntimo con la factura.
 */
export function repartir(facturas, ocupantes, tope = 0) {
  const total = ocupantes.reduce((a, o) => a + o.dias, 0);
  const filas = ocupantes.map((o) => ({ ...o, partes: {}, total: 0 }));
  for (const [clave, importe] of Object.entries(facturas)) {
    if (!(importe > 0) || !total) continue;
    let resto = r2(importe);
    filas.forEach((f, i) => {
      const parte = i === filas.length - 1 ? resto : r2((importe * f.dias) / total);
      f.partes[clave] = parte;
      f.total = r2(f.total + parte);
      resto = r2(resto - parte);
    });
  }
  for (const f of filas) f.aCobrar = r2(Math.max(0, f.total - (tope || 0)));
  return { filas, diasTotales: total };
}

/** Fecha de cobro con la siguiente mensualidad del inquilino. */
function siguienteVencimiento(k, fin) {
  const hoy = todayISO();
  const base = addDays(fin, 1) > hoy ? addDays(fin, 1) : hoy;
  let ym = ymOf(base);
  if (dayInMonth(ym, k.diaPago || 5) < base) ym = addMonths(ym, 1);
  return dayInMonth(ym, k.diaPago || 5);
}

export function abrirReparto(pisoId) {
  const p = app.s.pisos.find((x) => x.id === pisoId);
  if (!p) return;
  // Periodo por defecto: el mes pasado completo
  const hoy = todayISO();
  const ymPas = addMonths(ymOf(hoy), -1);
  const ini0 = `${ymPas}-01`;
  const fin0 = addDays(`${ymOf(hoy)}-01`, -1);
  const recientes = app.s.gastos
    .filter((g) => g.pisoId === pisoId && (g.categoria === 'suministros' || g.categoria === 'limpieza') && g.fecha >= addDays(hoy, -100))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .slice(0, 8);
  const form = abrirDialogo({
    titulo: 'Repartir suministros',
    textoOk: 'Crear recibos',
    ancho: 'wide',
    cuerpo: html`
      <button type="button" class="reparto-dictar" data-reparto-micro><span class="voz-mini">${raw(MICRO)}</span><span><strong>Díctalo</strong><small data-reparto-oido>Por ejemplo: «luz 96,40 y agua 38,20 de octubre»</small></span></button>
      <div class="reparto-paso"><b>1</b> ¿De qué fechas es la factura?</div>
      <div class="reparto-meses">${[addMonths(ymOf(hoy), -2), ymPas, ymOf(hoy)].map((ym) => html`<button type="button" class="pill" data-mes="${ym}">${cap(mesLargo(ym))}</button>`)}<button type="button" class="pill" data-otras-fechas>Otras fechas</button></div>
      <div class="form-grid reparto-fechas" data-fechas hidden>
        ${campo('Desde', inp('inicio', ini0, { type: 'date', req: true }))}
        ${campo('Hasta', inp('fin', fin0, { type: 'date', req: true }))}
      </div>
      <p class="reparto-periodo" data-periodo></p>
      <div class="reparto-paso"><b>2</b> ¿Cuánto es cada factura?</div>
      <div class="form-grid reparto-facturas">
        ${FACTURAS.slice(0, 2).map(([k, nombre]) => campo(nombre, money(`f_${k}`, '')))}
      </div>
      ${recientes.length ? html`<div class="reparto-chips"><span class="muted small">O toca una ya apuntada:</span>
        ${recientes.map((g) => html`<button type="button" class="chip chip-soft" data-usar-gasto="${g.id}">${g.concepto || CAT[g.categoria]?.nombre} · ${fmtEUR(g.importe)}</button>`)}</div>` : ''}
      <details class="reparto-mas" data-otras><summary>Otra factura (gas, internet, limpieza…)</summary>
        <div class="form-grid reparto-facturas">${FACTURAS.slice(2).map(([k, nombre]) => campo(nombre, money(`f_${k}`, '')))}</div>
      </details>
      <div class="reparto-paso"><b>3</b> Lo que paga cada uno</div>
      <div data-reparto-tabla></div>
      <details class="reparto-mas" data-opciones><summary>Más opciones</summary>
        ${campo('Ya incluido en cada renta', money('tope', ''), { ayuda: 'Si la renta ya incluye, p. ej., 30 € de suministros, solo se cobra lo que pase de ahí.' })}
      </details>`,
    submit: (d, f) => {
      const r = calcular();
      if (!r) return error(f, 'Indica el periodo y al menos una factura.');
      const conCobro = r.filas.filter((x) => x.aCobrar > 0.004);
      if (!conCobro.length) return error(f, 'No hay nada que cobrar: todo queda dentro del tope.');
      const tramo = `del ${d.inicio.split('-').reverse().join('/')} al ${d.fin.split('-').reverse().join('/')}`;
      const nombres = FACTURAS.filter(([k]) => n(d[`f_${k}`]) > 0).map(([, nom]) => nom.toLowerCase());
      for (const x of conCobro) {
        const venc = siguienteVencimiento(x.k, d.fin);
        app.s.cobros.push({
          id: uid(), auto: false, pisoId, unidadId: x.unidad.id, pagador: x.k.inquilino, telefono: x.k.telefono || '',
          concepto: `${cap(lista(nombres))} ${tramo} (${x.dias} de ${r.diasTotales} días)`,
          importe: x.aCobrar, periodo: ymOf(venc), vencimiento: venc, cobrado: 0, fechaCobro: '', pagos: [],
        });
      }
      commit(`${conCobro.length} recibo${conCobro.length > 1 ? 's' : ''} de suministros creado${conCobro.length > 1 ? 's' : ''}`);
    },
    extra: html`<button type="button" class="btn btn-ghost" data-reparto-compartir>Compartir</button>`,
  });
  const tabla = form.querySelector('[data-reparto-tabla]');
  const val = (k) => form.elements[k]?.value || '';
  function calcular() {
    const inicio = val('inicio'), fin = val('fin');
    const facturas = Object.fromEntries(FACTURAS.map(([k]) => [k, n(val(`f_${k}`))]));
    if (!inicio || !fin || fin < inicio || !Object.values(facturas).some((x) => x > 0)) return null;
    const ocup = ocupantesDe(app.s, pisoId, inicio, fin).map((o) => {
      const manual = form.elements[`dias_${o.k.id}`]?.value;
      return manual !== undefined && manual !== '' ? { ...o, dias: Math.max(0, nd(manual) | 0) } : o;
    });
    if (!ocup.length) return null;
    return { ...repartir(facturas, ocup, n(val('tope'))), facturas, inicio, fin };
  }
  function pintar() {
    const inicio = val('inicio'), fin = val('fin');
    const fmtC = (f) => f.split('-').reverse().slice(0, 2).join('/');
    const mesDe = inicio && fin && inicio.endsWith('-01') && fin === addDays(`${addMonths(ymOf(inicio), 1)}-01`, -1) ? ymOf(inicio) : null;
    form.querySelectorAll('[data-mes]').forEach((b) => b.classList.toggle('on', b.dataset.mes === mesDe));
    form.querySelector('[data-otras-fechas]').classList.toggle('on', !mesDe);
    if (!mesDe) form.querySelector('[data-fechas]').hidden = false;
    form.querySelector('[data-periodo]').textContent = inicio && fin && fin >= inicio ? `Del ${fmtC(inicio)} al ${fmtC(fin)} · ${diffDays(inicio, fin) + 1} días` : 'Elige las fechas de la factura.';
    if (FACTURAS.slice(2).some(([k]) => n(val(`f_${k}`)) > 0)) form.querySelector('[data-otras]').open = true;
    if (n(val('tope')) > 0) form.querySelector('[data-opciones]').open = true;
    const ocup = ocupantesDe(app.s, pisoId, inicio, fin);
    if (!ocup.length) { tabla.innerHTML = String(html`<p class="muted">No hay inquilinos con contrato en esas fechas.</p>`); return; }
    const r = calcular();
    const dias = (o) => form.elements[`dias_${o.k.id}`]?.value ?? o.dias;
    const fila = (o) => r?.filas.find((x) => x.k.id === o.k.id);
    const tope = n(val('tope'));
    const usadas = FACTURAS.filter(([k]) => n(val(`f_${k}`)) > 0);
    tabla.innerHTML = String(html`
      <ul class="reparto-lista">${ocup.map((o) => { const f = fila(o); return html`
        <li>
          <div class="reparto-quien"><strong>${o.k.inquilino}</strong><small>${o.unidad.nombre} · <label><input class="reparto-dias" name="dias_${o.k.id}" type="number" min="0" max="366" inputmode="numeric" value="${dias(o)}" aria-label="Días de ${o.k.inquilino}"> días</label></small></div>
          <div class="reparto-cuanto"><b>${f ? fmtEUR(tope ? f.aCobrar : f.total) : '—'}</b>${f && usadas.length > 1 ? html`<small>${usadas.map(([k, nom]) => `${nom} ${fmtEUR(f.partes[k] || 0)}`).join(' · ')}</small>` : ''}${f && tope ? html`<small>de ${fmtEUR(f.total)}, menos ${fmtEUR(tope)} incluidos</small>` : ''}${f ? html`<button type="button" class="reparto-ticket" data-ticket="${o.k.id}">Ticket</button>` : ''}</div>
        </li>`; })}</ul>
      ${r ? html`<div class="reparto-total"><span>Total a cobrar</span><b>${fmtEUR(r.filas.reduce((a, x) => a + x.aCobrar, 0))}</b></div>
        <button type="button" class="btn reparto-todos" data-ticket="todos">Tickets para todos</button>` : html`<p class="muted small">Escribe el importe de la factura y verás lo que paga cada uno.</p>`}
      <p class="muted small">Se reparte por los días que ha vivido cada uno. Si alguien no ha estado, cambia sus días.</p>`);
  }
  let pendiente = null;
  form.addEventListener('input', (e) => {
    if (e.target.name?.startsWith('dias_')) { clearTimeout(pendiente); pendiente = setTimeout(() => { const pos = e.target.name; pintar(); const el = form.elements[pos]; el?.focus(); }, 500); return; }
    if (['inicio', 'fin'].includes(e.target.name)) tabla.querySelectorAll('.reparto-dias').forEach((x) => x.remove());
    pintar();
  });
  form.addEventListener('change', (e) => { if (!e.target.name?.startsWith('dias_')) pintar(); });
  form.addEventListener('click', (e) => {
    const g = e.target.closest('[data-usar-gasto]');
    if (g) {
      const gasto = app.s.gastos.find((x) => x.id === g.dataset.usarGasto);
      const texto = `${gasto.concepto} ${gasto.proveedor || ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const tipo = gasto.categoria === 'limpieza' ? 'limpieza' : FACTURAS.find(([, , re]) => re && re.test(texto))?.[0] || 'otros';
      const el = form.elements[`f_${tipo}`];
      el.value = String(r2(n(el.value) + gasto.importe)).replace('.', ',');
      g.disabled = true;
      pintar();
      return;
    }
    const mesB = e.target.closest('[data-mes]');
    if (mesB) { const ym = mesB.dataset.mes; form.elements.inicio.value = `${ym}-01`; form.elements.fin.value = addDays(`${addMonths(ym, 1)}-01`, -1); form.querySelector('[data-fechas]').hidden = true; tabla.querySelectorAll('.reparto-dias').forEach((x) => x.remove()); pintar(); return; }
    if (e.target.closest('[data-otras-fechas]')) { form.querySelector('[data-fechas]').hidden = false; form.elements.inicio.focus(); return; }
    const tk = e.target.closest('[data-ticket]');
    if (tk) {
      const r = calcular();
      if (!r) return;
      const filas = r.filas.filter((x) => tk.dataset.ticket === 'todos' || x.k.id === tk.dataset.ticket);
      verTickets(filas.map((f) => datosTicket(p, r, f, n(val('tope')))));
      return;
    }
    if (e.target.closest('[data-reparto-compartir]')) compartir();
    const mic = e.target.closest('[data-reparto-micro]')?.querySelector('.voz-mini');
    if (mic) {
      const oido = form.querySelector('[data-reparto-oido]');
      oido.textContent = 'Te escucho…';
      dictarEn(mic, (texto) => {
        const c = camposReparto(texto, app.s, todayISO(), pisoId);
        const dias = Object.fromEntries(Object.entries(c).filter(([k]) => k.startsWith('dias_')));
        const resto = Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith('dias_')));
        if (resto.inicio || resto.fin) tabla.querySelectorAll('.reparto-dias').forEach((x) => x.remove());
        let n = rellenar(form, resto);
        pintar();
        n += rellenar(form, dias);
        if (Object.keys(dias).length) pintar();
        oido.textContent = n ? `«${texto}» · ${n === 1 ? 'He rellenado lo marcado' : `He rellenado ${n} datos`} en color.` : `«${texto}» · No he encontrado datos. Di, p. ej.: «luz 120 euros del 1 al 31 de octubre».`;
      }, (m) => { oido.textContent = m; });
    }
  });
  function compartir() {
    const r = calcular();
    if (!r) { toast('Indica el periodo y alguna factura.', { tipo: 'warn' }); return; }
    const tope = n(val('tope'));
    const lineas = [`Reparto de suministros · ${p.nombre}`, `Periodo: ${fmtFecha(r.inicio, { corto: true })} – ${fmtFecha(r.fin, { corto: true })}`, ''];
    for (const [k, nom] of FACTURAS) if (r.facturas[k] > 0) lineas.push(`${nom}: ${fmtEUR(r.facturas[k])}`);
    lineas.push('', 'Reparto por días de ocupación:');
    for (const f of r.filas) lineas.push(`• ${f.k.inquilino} (${f.unidad.nombre}, ${f.dias} días): ${fmtEUR(f.total)}${tope ? ` → a pagar ${fmtEUR(f.aCobrar)}` : ''}`);
    lineas.push('', 'Se paga junto con la próxima mensualidad.');
    const texto = lineas.join('\n');
    if (navigator.share) navigator.share({ title: 'Reparto de suministros', text: texto }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }
  pintar();
}

const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesLargo = (ym) => MESES_L[Number(ym.slice(5, 7)) - 1];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const lista = (xs) => (xs.length <= 1 ? xs[0] || 'suministros' : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
function error(form, msg) {
  let el = form.querySelector('.form-error');
  if (!el) { el = document.createElement('p'); el.className = 'form-error'; el.setAttribute('role', 'alert'); form.querySelector('.dlg-body').prepend(el); }
  el.textContent = msg;
  return false;
}
void raw;

/* ───────────── Tickets: una imagen por inquilino con lo que tiene que pagar ───────────── */

function datosTicket(p, r, f, tope) {
  const t = app.s.titulares.find((x) => x.id === p.titularId);
  const iban = (f.k.notas || '').match(/\bES\d{2}(?:\s?\d{4}){5}\b/)?.[0] || '';
  const venc = siguienteVencimiento(f.k, r.fin);
  return {
    emisor: t ? `${t.nombre}${t.nif ? ` · ${t.nif}` : ''}` : '',
    piso: p.direccion || p.nombre,
    inquilino: f.k.inquilino,
    habitacion: f.unidad.nombre,
    periodo: `Del ${r.inicio.split('-').reverse().join('/')} al ${r.fin.split('-').reverse().join('/')}`,
    dias: `${f.dias} días de ${diffDays(r.inicio, r.fin) + 1} · ${r.filas.length} habitaciones ocupadas`,
    lineas: FACTURAS.filter(([k]) => r.facturas[k] > 0).map(([k, nom]) => [`${nom} (factura de ${fmtEUR(r.facturas[k])})`, fmtEUR(f.partes[k] || 0)]),
    total: f.total, tope, aPagar: f.aCobrar,
    pago: `Con la mensualidad, antes del ${venc.split('-').reverse().join('/')}`,
    iban,
    telefono: f.k.telefono || '',
    nombreArchivo: `Suministros ${f.k.inquilino} ${r.inicio.slice(0, 7)}.png`.replace(/[^\w .-]/g, ''),
  };
}

/** Dibuja el ticket en un lienzo (sin librerías). */
function dibujarTicket(d) {
  const W = 720, PAD = 48, esc = 2;
  const FONT = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const filas = [];
  const add = (tipo, a, b) => filas.push({ tipo, a, b });
  add('titulo', 'Suministros');
  add('sub', d.piso);
  if (d.emisor) add('sub', d.emisor);
  add('hr');
  add('etq', 'Inquilino'); add('fuerte', `${d.inquilino}`); add('norm', d.habitacion);
  add('esp');
  add('etq', 'Periodo de las facturas'); add('norm', d.periodo); add('sub', d.dias);
  add('hr');
  for (const [a, b] of d.lineas) add('linea', a, b);
  if (d.tope) { add('linea', 'Total suministros', fmtEUR(d.total)); add('linea', 'Incluido en la renta', `− ${fmtEUR(Math.min(d.tope, d.total))}`); }
  add('hr2');
  add('total', 'A pagar', fmtEUR(d.aPagar));
  add('esp');
  add('sub', d.pago);
  if (d.iban) add('sub', `Transferencia a ${d.iban}`);
  add('pie', 'Reparto en proporción a los días de ocupación de cada habitación.');
  const alto = { titulo: 58, sub: 30, hr: 34, hr2: 30, etq: 28, fuerte: 40, norm: 34, esp: 16, linea: 44, total: 64, pie: 56 };
  const H = PAD * 2 + filas.reduce((a, f) => a + alto[f.tipo], 0);
  c.width = W * esc; c.height = H * esc; ctx.scale(esc, esc);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1f5c4a'; ctx.fillRect(0, 0, W, 10);
  let y = PAD;
  const texto = (t, x, size, peso = 400, color = '#1c2421', alinea = 'left') => { ctx.font = `${peso} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = alinea; ctx.fillText(t, x, y); };
  const cortar = (t, max, size, peso) => { ctx.font = `${peso} ${size}px ${FONT}`; if (ctx.measureText(t).width <= max) return t; while (t.length > 3 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1); return `${t}…`; };
  for (const f of filas) {
    const h = alto[f.tipo];
    if (f.tipo === 'titulo') { y += 36; texto(f.a, PAD, 36, 750, '#1f5c4a'); y += h - 36; continue; }
    if (f.tipo === 'hr' || f.tipo === 'hr2') { ctx.strokeStyle = f.tipo === 'hr2' ? '#1c2421' : '#d9dfdc'; ctx.lineWidth = f.tipo === 'hr2' ? 2 : 1; ctx.setLineDash(f.tipo === 'hr' ? [6, 6] : []); ctx.beginPath(); ctx.moveTo(PAD, y + h / 2); ctx.lineTo(W - PAD, y + h / 2); ctx.stroke(); ctx.setLineDash([]); y += h; continue; }
    if (f.tipo === 'esp') { y += h; continue; }
    y += h - 10;
    if (f.tipo === 'sub') texto(cortar(f.a, W - PAD * 2, 19, 400), PAD, 19, 400, '#5d6863');
    if (f.tipo === 'etq') texto(f.a.toUpperCase(), PAD, 15, 650, '#7a8580');
    if (f.tipo === 'fuerte') texto(cortar(f.a, W - PAD * 2, 28, 700), PAD, 28, 700);
    if (f.tipo === 'norm') texto(cortar(f.a, W - PAD * 2, 22, 450), PAD, 22, 450);
    if (f.tipo === 'linea') { texto(cortar(f.a, W - PAD * 2 - 170, 21, 450), PAD, 21, 450); texto(f.b, W - PAD, 22, 650, '#1c2421', 'right'); }
    if (f.tipo === 'total') { texto(f.a, PAD, 30, 750); texto(f.b, W - PAD, 40, 800, '#1f5c4a', 'right'); }
    if (f.tipo === 'pie') texto(f.a, PAD, 15, 400, '#9aa39f');
    y += 10;
  }
  return c;
}

function verTickets(lista) {
  const v = document.getElementById('visor');
  const tickets = lista.map((d) => ({ d, canvas: dibujarTicket(d) }));
  v.innerHTML = String(html`
    <div class="visor-barra">
      <div class="visor-tit"><strong>${tickets.length === 1 ? `Ticket de ${lista[0].inquilino}` : `${tickets.length} tickets`}</strong><small>Para enviar a cada inquilino</small></div>
      <button type="button" class="icon-btn" data-t="cerrar" aria-label="Cerrar">✕</button>
    </div>
    <div class="visor-cuerpo visor-pdf tickets">${tickets.map((t, i) => html`
      <figure class="ticket">
        <img alt="Ticket de ${t.d.inquilino}" src="${t.canvas.toDataURL('image/png')}">
        <figcaption>
          <button type="button" class="btn btn-sm btn-primary" data-t="compartir" data-i="${i}">Enviar imagen</button>
          ${t.d.telefono ? html`<button type="button" class="btn btn-sm" data-t="whatsapp" data-i="${i}">WhatsApp con texto</button>` : ''}
          <button type="button" class="btn btn-sm btn-ghost" data-t="descargar" data-i="${i}">Descargar</button>
        </figcaption>
      </figure>`)}</div>`);
  const blob = (i) => new Promise((r) => tickets[i].canvas.toBlob(r, 'image/png'));
  v.onclick = async (e) => {
    const b = e.target.closest('[data-t]');
    if (e.target === v || b?.dataset.t === 'cerrar') { v.close(); return; }
    if (!b) return;
    const t = tickets[Number(b.dataset.i)];
    if (b.dataset.t === 'compartir') {
      const file = new File([await blob(Number(b.dataset.i))], t.d.nombreArchivo, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file], title: `Suministros · ${t.d.inquilino}` }).catch(() => {});
      else descargarBlob(file, t.d.nombreArchivo);
    }
    if (b.dataset.t === 'descargar') descargarBlob(await blob(Number(b.dataset.i)), t.d.nombreArchivo);
    if (b.dataset.t === 'whatsapp') {
      const d = t.d;
      const txt = [`Hola ${d.inquilino.split(' ')[0]}, te paso tu parte de los suministros (${d.periodo.toLowerCase()}):`, ...d.lineas.map(([a, x]) => `• ${a}: ${x}`), d.tope ? `• Incluido en la renta: −${fmtEUR(Math.min(d.tope, d.total))}` : '', `*A pagar: ${fmtEUR(d.aPagar)}*`, d.pago + (d.iban ? `, por transferencia a ${d.iban}` : '') + '.'].filter(Boolean).join('\n');
      window.open(`https://wa.me/${telefonoWhatsApp(d.telefono)}?text=${encodeURIComponent(txt)}`, '_blank');
    }
  };
  if (!v.open) v.showModal();
}

function descargarBlob(b, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
