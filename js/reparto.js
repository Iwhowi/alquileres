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
  const ym = addMonths(ymOf(fin), 1);
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
      <div class="voz-en-form"><button type="button" class="voz-mini" data-reparto-micro aria-label="Dictar datos">${raw(MICRO)}</button><span class="muted small" data-reparto-oido>Toca el micro y di, p. ej.: «luz 96,40 y agua 38,20, del 1 al 31 de octubre; Miguel 20 días»</span></div>
      <p class="muted">${p.nombre}. Cada factura se reparte entre las habitaciones ocupadas, en proporción a los días que ha estado cada inquilino en el periodo. Se crea un recibo para cobrarlo con la siguiente mensualidad.</p>
      <div class="form-grid">
        ${campo('Desde', inp('inicio', ini0, { type: 'date', req: true }), { ayuda: 'Primer día de la factura' })}
        ${campo('Hasta', inp('fin', fin0, { type: 'date', req: true }), { ayuda: 'Último día de la factura' })}
      </div>
      ${recientes.length ? html`<div class="reparto-chips"><span class="muted small">Gastos apuntados (toca para usarlos):</span>
        ${recientes.map((g) => html`<button type="button" class="chip chip-soft" data-usar-gasto="${g.id}">${g.concepto || CAT[g.categoria]?.nombre} · ${fmtFecha(g.fecha, { corto: true })} · ${fmtEUR(g.importe)}</button>`)}</div>` : ''}
      <h3 class="sub-h">Facturas del periodo</h3>
      <div class="form-grid reparto-facturas">
        ${FACTURAS.map(([k, nombre]) => campo(nombre, money(`f_${k}`, '')))}
      </div>
      <div class="form-grid">
        ${campo('Incluido en la renta (tope por inquilino)', money('tope', ''), { clase: 'span2', ayuda: 'Opcional. Si cada renta ya incluye, p. ej., 30 € de suministros, solo se cobra lo que pase de ahí. Vacío = se cobra todo.' })}
      </div>
      <h3 class="sub-h">Reparto</h3>
      <div data-reparto-tabla></div>`,
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
    const ocup = ocupantesDe(app.s, pisoId, inicio, fin);
    if (!ocup.length) { tabla.innerHTML = String(html`<p class="muted">No hay inquilinos con contrato en esas fechas.</p>`); return; }
    const r = calcular();
    const usadas = FACTURAS.filter(([k]) => n(val(`f_${k}`)) > 0);
    const dias = (o) => form.elements[`dias_${o.k.id}`]?.value ?? o.dias;
    const fila = (o) => r?.filas.find((x) => x.k.id === o.k.id);
    const tope = n(val('tope'));
    tabla.innerHTML = String(html`
      <div class="table-wrap"><table class="tabla reparto-tabla">
        <thead><tr><th>Inquilino</th><th class="num">Días</th>${usadas.map(([, nom]) => html`<th class="num">${nom}</th>`)}<th class="num">Total</th>${tope ? html`<th class="num">A cobrar</th>` : ''}</tr></thead>
        <tbody>${ocup.map((o) => { const f = fila(o); return html`<tr>
          <td><strong>${o.k.inquilino}</strong><br><small class="muted">${o.unidad.nombre}</small></td>
          <td class="num"><input class="reparto-dias" name="dias_${o.k.id}" type="number" min="0" max="366" inputmode="numeric" value="${dias(o)}" aria-label="Días de ${o.k.inquilino}"></td>
          ${usadas.map(([k]) => html`<td class="num">${f ? fmtEUR(f.partes[k] || 0) : '—'}</td>`)}
          <td class="num"><b>${f ? fmtEUR(f.total) : '—'}</b></td>
          ${tope ? html`<td class="num"><b>${f ? fmtEUR(f.aCobrar) : '—'}</b></td>` : ''}</tr>`; })}</tbody>
        ${r ? html`<tfoot><tr><td>Total</td><td class="num">${r.diasTotales}</td>${usadas.map(([k]) => html`<td class="num">${fmtEUR(r.facturas[k])}</td>`)}<td class="num"><b>${fmtEUR(r.filas.reduce((a, x) => a + x.total, 0))}</b></td>${tope ? html`<td class="num"><b>${fmtEUR(r.filas.reduce((a, x) => a + x.aCobrar, 0))}</b></td>` : ''}</tr></tfoot>` : ''}
      </table></div>
      <p class="muted small">Puedes cambiar los días si alguien no ha estado (p. ej. vacaciones pactadas). ${r ? `Coste por día y habitación: ${fmtEUR(Object.values(r.facturas).reduce((a, x) => a + x, 0) / r.diasTotales)}.` : 'Escribe el importe de alguna factura.'}</p>`);
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
    if (e.target.closest('[data-reparto-compartir]')) compartir();
    const mic = e.target.closest('[data-reparto-micro]');
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
  void telefonoWhatsApp;
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const lista = (xs) => (xs.length <= 1 ? xs[0] || 'suministros' : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
function error(form, msg) {
  let el = form.querySelector('.form-error');
  if (!el) { el = document.createElement('p'); el.className = 'form-error'; el.setAttribute('role', 'alert'); form.querySelector('.dlg-body').prepend(el); }
  el.textContent = msg;
  return false;
}
void raw;
