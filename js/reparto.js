// Reparto de suministros en pisos por habitaciones: cada factura (luz, agua, gas, internet,
// limpieza…) se divide entre las habitaciones ocupadas en proporción a los días que cada inquilino ha
// vivido en el periodo facturado. Opcionalmente, una parte ya incluida en cada renta: solo se cobra lo
// que la supere. Apunta un cobro por inquilino para la siguiente mensualidad y prepara un ticket.
import { html, raw, abrirDialogo, campo, inp, money, fmtEUR, fmtFechaNum, mesNombre, errorForm, rellenar, descargar, ICON } from './ui.js';
import { app, commit } from './state.js';
import { uid } from './store.js';
import { dictarEn } from './voz.js';
import { camposReparto } from './voz-ordenes.js';
import { norm, cap, SUMINISTROS } from './voz-interpretar.js';
import { CAT, num, r2, addDays, diffDays, daysOverlap, ymOf, addMonths, dayInMonth, monthStart, monthEnd, telefonoWhatsApp, todayISO } from './calc.js';

export const FACTURAS = [...SUMINISTROS, ['otros', 'Otros', null]];

/** Inquilinos del piso con contrato durante el periodo y los días que han estado (ambos días incluidos). */
export function ocupantesDe(s, pisoId, inicio, fin) {
  if (!inicio || !fin || fin < inicio) return [];
  const uds = new Map(s.unidades.filter((u) => u.pisoId === pisoId).map((u) => [u.id, u]));
  return s.contratos
    .filter((k) => uds.has(k.unidadId))
    .map((k) => ({ k, unidad: uds.get(k.unidadId), dias: daysOverlap(k.inicio, k.fin || '9999-12-31', inicio, fin) }))
    .filter((o) => o.dias > 0)
    .sort((x, y) => x.unidad.nombre.localeCompare(y.unidad.nombre, 'es', { numeric: true }));
}

/**
 * Reparte cada factura por días de ocupación. El último inquilino con días absorbe el redondeo, para
 * que la suma cuadre al céntimo con la factura.
 */
export function repartir(facturas, ocupantes, tope = 0) {
  const total = ocupantes.reduce((a, o) => a + o.dias, 0);
  const filas = ocupantes.map((o) => ({ ...o, partes: {}, total: 0 }));
  const ultimo = filas.reduce((u, f, i) => (f.dias > 0 ? i : u), -1);
  for (const [clave, importe] of Object.entries(facturas)) {
    if (!(importe > 0) || !total) continue;
    let resto = r2(importe);
    filas.forEach((f, i) => {
      const parte = f.dias <= 0 ? 0 : i === ultimo ? resto : r2((importe * f.dias) / total);
      f.partes[clave] = parte;
      f.total = r2(f.total + parte);
      resto = r2(resto - parte);
    });
  }
  for (const f of filas) f.aCobrar = r2(Math.max(0, f.total - (tope || 0)));
  return { filas, diasTotales: total };
}

/** Fecha de cobro: la siguiente mensualidad del inquilino desde hoy (y después de la factura). */
function siguienteVencimiento(k, fin) {
  const hoy = todayISO();
  const tras = addDays(fin, 1);
  const base = tras > hoy ? tras : hoy;
  const dia = k.diaPago || 5;
  const ym = dayInMonth(ymOf(base), dia) < base ? addMonths(ymOf(base), 1) : ymOf(base);
  return dayInMonth(ym, dia);
}

const nombreMes = (ym, hoy) => cap(mesNombre(Number(ym.slice(5, 7)))) + (ym.slice(0, 4) !== hoy.slice(0, 4) ? ` ${ym.slice(0, 4)}` : '');
const lista = (xs) => (xs.length <= 1 ? xs[0] || 'suministros' : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

/** Sin piso: si solo hay uno por habitaciones se abre ese; si hay varios, se elige. */
function elegirPiso() {
  const pisos = app.s.pisos.filter((x) => x.modalidad === 'habitaciones');
  if (pisos.length === 1) { abrirReparto(pisos[0].id); return; }
  abrirDialogo({
    titulo: 'Repartir suministros',
    cuerpo: html`<p class="muted">¿De qué piso es la factura?</p>
      <div class="voz-lista">${pisos.map((x) => html`<button type="button" class="btn voz-opcion" data-reparto-piso="${x.id}"><strong>${x.nombre}</strong></button>`)}</div>`,
  });
  document.querySelectorAll('[data-reparto-piso]').forEach((b) => b.addEventListener('click', () => abrirReparto(b.dataset.repartoPiso)));
}

export function abrirReparto(pisoId) {
  if (!pisoId) { elegirPiso(); return; }
  const p = app.s.pisos.find((x) => x.id === pisoId);
  if (!p) return;
  const hoy = todayISO();
  const ymPas = addMonths(ymOf(hoy), -1); // por defecto, el mes pasado completo
  const recientes = app.s.gastos
    .filter((g) => g.pisoId === pisoId && (g.categoria === 'suministros' || g.categoria === 'limpieza') && g.fecha >= addDays(hoy, -100))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .slice(0, 8);
  const diasManual = new Map(); // contratoId → días cambiados a mano (se olvidan al cambiar las fechas)
  const form = abrirDialogo({
    titulo: 'Repartir suministros',
    textoOk: 'Apuntar en Cobros',
    ancho: 'wide',
    cuerpo: html`
      <button type="button" class="reparto-dictar" data-reparto-micro><span class="voz-micro voz-micro-sm">${raw(ICON.micro)}</span><span><strong>Díctalo</strong><small data-reparto-oido>Por ejemplo: «octubre, luz 96,40 y agua 38,20»</small></span></button>
      <div class="reparto-paso"><b>1</b> ¿De qué fechas es la factura?</div>
      <div class="reparto-meses">${[addMonths(ymOf(hoy), -2), ymPas, ymOf(hoy)].map((ym) => html`<button type="button" class="chip-planta" data-mes="${ym}">${nombreMes(ym, hoy)}</button>`)}<button type="button" class="chip-planta" data-otras-fechas>Otras fechas</button></div>
      <div class="form-grid reparto-fechas" data-fechas hidden>
        ${campo('Desde', inp('inicio', monthStart(ymPas), { type: 'date', req: true }))}
        ${campo('Hasta', inp('fin', monthEnd(ymPas), { type: 'date', req: true }))}
      </div>
      <p class="reparto-periodo" data-periodo></p>
      <div class="reparto-paso"><b>2</b> ¿Cuánto es cada factura?</div>
      <div class="form-grid reparto-facturas">${FACTURAS.slice(0, 2).map(([k, nombre]) => campo(nombre, money(`f_${k}`, '')))}</div>
      ${recientes.length ? html`<div class="reparto-chips"><span class="muted small">Usar una factura ya apuntada:</span>
        ${recientes.map((g) => html`<button type="button" class="chip chip-soft" data-usar-gasto="${g.id}">${g.concepto || CAT[g.categoria]?.nombre} · ${fmtEUR(g.importe)}</button>`)}</div>` : ''}
      <details class="reparto-mas" data-otras><summary>Otra factura (gas, internet, limpieza…)</summary>
        <div class="form-grid reparto-facturas">${FACTURAS.slice(2).map(([k, nombre]) => campo(nombre, money(`f_${k}`, '')))}</div>
      </details>
      <div class="reparto-paso"><b>3</b> Lo que paga cada uno</div>
      <p class="muted small">Se reparte por los días que ha vivido cada uno. Si alguien no ha estado, cambia sus días.</p>
      <div data-reparto-tabla></div>
      <details class="reparto-mas" data-opciones><summary>¿La renta ya incluye suministros?</summary>
        ${campo('Incluido en cada renta', money('tope', ''), { ayuda: 'Si cada renta ya incluye, p. ej., 30 € de suministros, solo se cobra lo que pase de ahí.' })}
      </details>`,
    submit: (d, f) => {
      const r = calcular();
      if (!r) return errorForm(f, 'Indica el periodo y al menos una factura.');
      const conCobro = r.filas.filter((x) => x.aCobrar > 0.004);
      if (!conCobro.length) return errorForm(f, 'No hay nada que cobrar: todo está incluido en la renta.');
      const tramo = `del ${fmtFechaNum(r.inicio)} al ${fmtFechaNum(r.fin)}`;
      const nombres = FACTURAS.filter(([k]) => r.facturas[k] > 0).map(([, nom]) => nom.toLowerCase());
      for (const x of conCobro) {
        const venc = siguienteVencimiento(x.k, r.fin);
        app.s.cobros.push({
          id: uid(), auto: false, pisoId, unidadId: x.unidad.id, pagador: x.k.inquilino, telefono: x.k.telefono || '',
          concepto: `${cap(lista(nombres))} ${tramo} (${x.dias} de ${r.diasTotales} días)`,
          importe: x.aCobrar, periodo: ymOf(venc), vencimiento: venc, cobrado: 0, fechaCobro: '', pagos: [],
        });
      }
      commit(`${conCobro.length === 1 ? 'Apuntado 1 cobro' : `Apuntados ${conCobro.length} cobros`} de suministros`);
    },
  });
  const tabla = form.querySelector('[data-reparto-tabla]');
  const val = (k) => form.elements[k]?.value || '';

  /** Reparto con lo que hay escrito; null si falta el periodo, alguna factura o inquilinos. */
  function calcular(ocup = ocupantesDe(app.s, pisoId, val('inicio'), val('fin'))) {
    const facturas = Object.fromEntries(FACTURAS.map(([k]) => [k, num(val(`f_${k}`))]));
    if (!ocup.length || !Object.values(facturas).some((x) => x > 0)) return null;
    const conDias = ocup.map((o) => (diasManual.has(o.k.id) ? { ...o, dias: diasManual.get(o.k.id) } : o));
    return { ...repartir(facturas, conDias, num(val('tope'))), facturas, inicio: val('inicio'), fin: val('fin') };
  }

  function pintarCabecera() {
    const inicio = val('inicio'), fin = val('fin');
    const mesDe = inicio && fin && inicio === monthStart(ymOf(inicio)) && fin === monthEnd(ymOf(inicio)) ? ymOf(inicio) : null;
    form.querySelectorAll('[data-mes]').forEach((b) => b.classList.toggle('on', b.dataset.mes === mesDe));
    form.querySelector('[data-otras-fechas]').classList.toggle('on', !mesDe);
    if (!mesDe) form.querySelector('[data-fechas]').hidden = false;
    const corta = (f) => fmtFechaNum(f).slice(0, 5);
    form.querySelector('[data-periodo]').textContent = inicio && fin && fin >= inicio ? `Del ${corta(inicio)} al ${corta(fin)} · ${diffDays(inicio, fin) + 1} días` : 'Elige las fechas de la factura.';
    if (FACTURAS.slice(2).some(([k]) => num(val(`f_${k}`)) > 0)) form.querySelector('[data-otras]').open = true;
    if (num(val('tope')) > 0) form.querySelector('[data-opciones]').open = true;
  }

  function pintar() {
    pintarCabecera();
    const ocup = ocupantesDe(app.s, pisoId, val('inicio'), val('fin'));
    if (!ocup.length) { tabla.innerHTML = String(html`<p class="muted">No hay inquilinos con contrato en esas fechas.</p>`); return; }
    const r = calcular(ocup);
    if (!r) { tabla.innerHTML = String(html`<p class="muted small">Escribe el importe de la factura y verás lo que paga cada uno.</p>`); return; }
    const tope = num(val('tope'));
    const usadas = FACTURAS.filter(([k]) => r.facturas[k] > 0);
    const desglose = (f) => (usadas.length > 1 ? html`<small>${usadas.map(([k, nom]) => `${nom} ${fmtEUR(f.partes[k] || 0)}`).join(' · ')}</small>` : '');
    const incluido = (f) => (tope ? html`<small>de ${fmtEUR(f.total)}, menos ${fmtEUR(tope)} incluidos</small>` : '');
    tabla.innerHTML = String(html`
      <ul class="reparto-lista">${r.filas.map((f) => html`
        <li>
          <div class="reparto-quien"><strong>${f.k.inquilino}</strong>
            <small>${f.unidad.nombre} · <label><input class="reparto-dias" name="dias_${f.k.id}" type="number" min="0" max="366" inputmode="numeric" value="${f.dias}" aria-label="Días de ${f.k.inquilino}"> días</label></small></div>
          <div class="reparto-cuanto"><b>${fmtEUR(f.aCobrar)}</b>${desglose(f)}${incluido(f)}
            <button type="button" class="btn btn-sm" data-ticket="${f.k.id}">Enviar ticket</button></div>
        </li>`)}</ul>
      <div class="reparto-total"><span>Total a cobrar</span><b>${fmtEUR(r.filas.reduce((a, x) => a + x.aCobrar, 0))}</b></div>
      <button type="button" class="btn reparto-todos" data-ticket="todos">Enviar tickets a todos</button>
      <p class="muted small">Al pulsar «Apuntar en Cobros» se añade a la próxima mensualidad de cada uno.</p>`);
  }

  let espera = null;
  form.addEventListener('input', (e) => {
    const nombre = e.target.name || '';
    if (nombre.startsWith('dias_')) {
      // Se guarda al momento y se repinta al dejar de escribir, devolviendo el cursor a la casilla
      diasManual.set(nombre.slice(5), Math.max(0, Math.trunc(num(e.target.value))));
      clearTimeout(espera);
      espera = setTimeout(() => { pintar(); form.elements[nombre]?.focus(); }, 500);
      return;
    }
    if (nombre === 'inicio' || nombre === 'fin') diasManual.clear();
    pintar();
  });
  form.addEventListener('click', (e) => {
    const g = e.target.closest('[data-usar-gasto]');
    if (g) { usarGasto(g); return; }
    const mes = e.target.closest('[data-mes]');
    if (mes) {
      form.elements.inicio.value = monthStart(mes.dataset.mes);
      form.elements.fin.value = monthEnd(mes.dataset.mes);
      form.querySelector('[data-fechas]').hidden = true;
      diasManual.clear();
      pintar();
      return;
    }
    if (e.target.closest('[data-otras-fechas]')) { form.querySelector('[data-fechas]').hidden = false; form.elements.inicio.focus(); return; }
    const tk = e.target.closest('[data-ticket]');
    if (tk) {
      const r = calcular();
      if (r) verTickets(r.filas.filter((x) => tk.dataset.ticket === 'todos' || x.k.id === tk.dataset.ticket).map((f) => datosTicket(p, r, f, num(val('tope')))));
      return;
    }
    const mic = e.target.closest('[data-reparto-micro]')?.querySelector('.voz-micro');
    if (mic) dictar(mic);
  });

  function usarGasto(boton) {
    const gasto = app.s.gastos.find((x) => x.id === boton.dataset.usarGasto);
    const texto = norm(`${gasto.concepto} ${gasto.proveedor || ''}`);
    const tipo = gasto.categoria === 'limpieza' ? 'limpieza' : FACTURAS.find(([, , re]) => re?.test(texto))?.[0] || 'otros';
    const el = form.elements[`f_${tipo}`];
    el.value = String(r2(num(el.value) + gasto.importe)).replace('.', ',');
    boton.disabled = true;
    boton.textContent = `✓ ${boton.textContent}`;
    pintar();
  }

  function dictar(mic) {
    const oido = form.querySelector('[data-reparto-oido]');
    oido.textContent = 'Te escucho… (toca el micro para parar)';
    dictarEn(mic, (texto) => {
      const c = camposReparto(texto, app.s, todayISO(), pisoId);
      if (c.inicio || c.fin) diasManual.clear();
      let n = 0;
      for (const [k, v] of Object.entries(c)) if (k.startsWith('dias_')) { diasManual.set(k.slice(5), v); n++; delete c[k]; }
      n += rellenar(form, c, { eventos: false });
      pintar();
      oido.textContent = n ? `«${texto}» · He rellenado ${n === 1 ? 'lo marcado' : `${n} datos`} en color.` : `«${texto}» · No he encontrado datos. Di, p. ej.: «octubre, luz 120 euros».`;
    }, (m) => { oido.textContent = m; });
  }

  pintar();
}

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
    periodo: `Del ${fmtFechaNum(r.inicio)} al ${fmtFechaNum(r.fin)}`,
    dias: `${f.dias} días de ${diffDays(r.inicio, r.fin) + 1} · ${r.filas.length} habitaciones ocupadas`,
    lineas: FACTURAS.filter(([k]) => r.facturas[k] > 0).map(([k, nom]) => [`${nom} (factura de ${fmtEUR(r.facturas[k])})`, fmtEUR(f.partes[k] || 0)]),
    total: f.total, tope, aPagar: f.aCobrar,
    pago: `Con la mensualidad, antes del ${fmtFechaNum(venc)}`,
    iban,
    telefono: f.k.telefono || '',
    nombreArchivo: `Suministros ${f.k.inquilino} ${r.inicio.slice(0, 7)}.png`.replace(/[\\/:*?"<>|]/g, ''),
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
  const tickets = lista.map((d) => ({ d, canvas: dibujarTicket(d), png: null }));
  const puedeCompartir = !!navigator.canShare;
  v.innerHTML = String(html`
    <div class="visor-barra">
      <div class="visor-tit"><strong>${tickets.length === 1 ? `Ticket de ${lista[0].inquilino}` : `${tickets.length} tickets`}</strong><small>Para enviar a cada inquilino</small></div>
      <button type="button" class="icon-btn" data-t="cerrar" aria-label="Cerrar">${raw(ICON.x)}</button>
    </div>
    <div class="visor-cuerpo tickets">${tickets.map((t, i) => html`
      <figure class="ticket" data-i="${i}">
        <figcaption>
          <button type="button" class="btn btn-sm btn-primary" data-t="compartir" data-i="${i}">${puedeCompartir ? 'Enviar imagen' : 'Descargar imagen'}</button>
          ${t.d.telefono ? html`<button type="button" class="btn btn-sm btn-ghost" data-t="whatsapp" data-i="${i}">Enviar como texto</button>` : ''}
        </figcaption>
      </figure>`)}</div>`);
  // Se muestra el propio lienzo: la imagen PNG solo se genera (una vez) al enviarla
  v.querySelectorAll('.ticket').forEach((fig) => {
    const t = tickets[Number(fig.dataset.i)];
    t.canvas.setAttribute('role', 'img');
    t.canvas.setAttribute('aria-label', `Ticket de ${t.d.inquilino}`);
    fig.prepend(t.canvas);
  });
  const png = async (t) => (t.png ||= await new Promise((r) => t.canvas.toBlob(r, 'image/png')));
  v.onclick = async (e) => {
    const b = e.target.closest('[data-t]');
    if (e.target === v || b?.dataset.t === 'cerrar') { v.close(); return; }
    if (!b) return;
    const t = tickets[Number(b.dataset.i)];
    if (b.dataset.t === 'compartir') {
      const file = new File([await png(t)], t.d.nombreArchivo, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file], title: `Suministros · ${t.d.inquilino}` }).catch(() => {});
      else descargar(t.d.nombreArchivo, file);
    }
    if (b.dataset.t === 'whatsapp') window.open(`https://wa.me/${telefonoWhatsApp(t.d.telefono)}?text=${encodeURIComponent(textoTicket(t.d))}`, '_blank');
  };
  // Al cerrar se sueltan los lienzos (pesan varios MB cada uno)
  v.addEventListener('close', () => {
    for (const t of tickets) { t.canvas.width = 0; t.canvas.height = 0; }
    v.onclick = null;
    v.innerHTML = '';
  }, { once: true });
  if (!v.open) v.showModal();
}

function textoTicket(d) {
  return [
    `Hola ${d.inquilino.split(' ')[0]}, te paso tu parte de los suministros (${d.periodo.toLowerCase()}):`,
    ...d.lineas.map(([a, x]) => `• ${a}: ${x}`),
    d.tope ? `• Incluido en la renta: −${fmtEUR(Math.min(d.tope, d.total))}` : '',
    `*A pagar: ${fmtEUR(d.aPagar)}*`,
    `${d.pago}${d.iban ? `, por transferencia a ${d.iban}` : ''}.`,
  ].filter(Boolean).join('\n');
}
