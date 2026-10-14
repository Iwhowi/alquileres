import { html, raw, fmtEUR, fmtEUR0, fmtPct, fmtFecha, ICON, DIAS_C, esc } from '../ui.js';
import { app, today, turisticos, resultado, vencimientoReserva } from '../state.js';
import { monthStart, monthEnd, daysInMonth, dayNum, addDays, diffDays, fromDayNum, nightsInRange, esperadoReserva } from '../calc.js';
import { selectorMes } from './panel.js';

export function vistaCalendario(pisoIdRuta) {
  const ts = turisticos();
  if (!ts.length) {
    return html`<header class="page-head"><div><h1>Calendario</h1></div></header>
      <div class="empty"><p>No hay ningún piso turístico. Cambia la modalidad de un piso a «Turístico» para usar el calendario.</p><a class="btn" href="#/pisos">Ir a pisos</a></div>`;
  }
  if (pisoIdRuta && ts.some((p) => p.id === pisoIdRuta)) app.ui.cal.piso = pisoIdRuta;
  if (!ts.some((p) => p.id === app.ui.cal.piso)) app.ui.cal.piso = ts[0].id;
  const p = ts.find((x) => x.id === app.ui.cal.piso);
  const ym = app.ui.cal.mes;
  const desde = monthStart(ym);
  const hasta = monthEnd(ym);
  const reservas = app.s.reservas.filter((r) => r.pisoId === p.id && !r.cancelada);
  const canceladas = app.s.reservas.filter((r) => r.pisoId === p.id && r.cancelada && r.entrada <= hasta && r.salida >= desde);
  const delMes = reservas.filter((r) => nightsInRange(r.entrada, r.salida, desde, hasta) > 0 || (r.salida >= desde && r.salida <= hasta)).sort((a, b) => (a.entrada < b.entrada ? -1 : 1));
  const r = resultado(p.id, desde, hasta);
  const dim = daysInMonth(ym);
  const occ = r.noches / dim;
  const adr = r.noches ? r.ingresos / r.noches : 0;

  return html`
    <header class="page-head">
      <div><h1>Calendario</h1><p class="muted">Ocupación, entradas y salidas del turístico</p></div>
      <div class="head-actions">
        ${selectorMes(ym, 'cal')}
        <button class="btn btn-primary" data-action="nueva-reserva" data-piso="${p.id}">${raw(ICON.plus)}<span>Reserva</span></button>
      </div>
    </header>
    ${ts.length > 1 ? html`<div class="segmented mb">${ts.map((t) => html`<button class="${t.id === p.id ? 'on' : ''}" data-action="cal-piso" data-id="${t.id}">${t.nombre}</button>`)}</div>` : ''}

    <section class="kpis">
      <div class="kpi"><span class="kpi-label">Ocupación</span><span class="kpi-value">${fmtPct(occ)}</span><span class="kpi-sub">${r.noches} de ${dim} noches</span></div>
      <div class="kpi"><span class="kpi-label">Precio medio por noche</span><span class="kpi-value">${r.noches ? fmtEUR(adr) : '—'}</span><span class="kpi-sub">RevPAR ${fmtEUR(r.ingresos / dim)}</span></div>
      <div class="kpi"><span class="kpi-label">Ingresos</span><span class="kpi-value">${fmtEUR(r.ingresos)}</span><span class="kpi-sub">${fmtEUR0(r.comisiones)} de comisiones</span></div>
      <div class="kpi kpi-main"><span class="kpi-label">Cash‑flow</span><span class="kpi-value ${r.cashflow < 0 ? 't-neg' : 't-pos'}">${fmtEUR(r.cashflow)}</span><span class="kpi-sub">tras gastos e hipoteca</span></div>
    </section>

    <section class="card cal-card">
      ${calendario(ym, reservas)}
      <div class="legend">
        ${['Airbnb', 'Booking', 'Directo', 'Otro'].map((c) => html`<span><i class="sw canal-${c.toLowerCase()}"></i>${c}</span>`)}
        <span><i class="sw sw-unpaid"></i>Cobro vencido</span>
        <span class="muted small">Toca un día libre para crear una reserva.</span>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Reservas del mes</h2></div>
      ${delMes.length
        ? html`<ul class="list">${delMes.map((x) => {
            const n = diffDays(x.entrada, x.salida);
            const pendiente = esperadoReserva(x) - (x.cobrado || 0);
            return html`
              <li class="row">
                <div class="row-date"><span class="d">${x.entrada.slice(8)}</span><span class="m">${fmtFecha(x.entrada, { corto: true }).split(' ')[1]}</span></div>
                <div class="row-main">
                  <div class="row-title"><i class="sw canal-${canalCls(x.canal)}"></i><strong>${x.huesped}</strong><span class="muted"> · ${x.canal || 'Directo'}${x.huespedes ? ` · ${x.huespedes} pers.` : ''}</span></div>
                  <div class="row-sub">${fmtFecha(x.entrada, { corto: true })} → ${fmtFecha(x.salida, { corto: true })} · ${n} ${n === 1 ? 'noche' : 'noches'} · ${fmtEUR(x.importe / Math.max(1, n))}/noche</div>
                </div>
                <div class="row-amount"><span class="num">${fmtEUR(x.importe)}</span>${pendiente > 0.005 ? html`<span class="chip ${(x.vencimiento || vencimientoReserva(x)) < today() ? 'chip-crit' : 'chip-warn'}">${(x.vencimiento || vencimientoReserva(x)) < today() ? 'Impagada' : 'Por cobrar'} ${fmtEUR0(pendiente)}</span>` : html`<span class="chip chip-ok">Cobrada</span>`}</div>
                <div class="row-actions"><button class="icon-btn" data-action="editar-reserva" data-id="${x.id}" aria-label="Editar">${raw(ICON.edit)}</button></div>
              </li>`;
          })}</ul>`
        : html`<p class="muted">Sin reservas este mes.</p>`}
      ${canceladas.length ? html`
        <h3 class="list-month"><span>Canceladas</span></h3>
        <ul class="list">${canceladas.map((x) => html`
          <li class="row row-cancel">
            <div class="row-main"><div class="row-title"><strong>${x.huesped}</strong><span class="muted"> · ${x.canal || 'Directo'}</span></div>
            <div class="row-sub">${fmtFecha(x.entrada, { corto: true })} → ${fmtFecha(x.salida, { corto: true })}${x.cobrado ? ` · retenido ${fmtEUR(x.cobrado)}` : ''}</div></div>
            <div class="row-amount"><span class="chip chip-soft">Cancelada</span></div>
            <div class="row-actions"><button class="icon-btn" data-action="editar-reserva" data-id="${x.id}" aria-label="Editar">${raw(ICON.edit)}</button></div>
          </li>`)}</ul>` : ''}
    </section>`;
}

export const canalCls = (c) => {
  const k = String(c || 'Directo').toLowerCase();
  return ['airbnb', 'booking', 'directo'].includes(k) ? k : 'otro';
};

function calendario(ym, reservas) {
  const hoy = today();
  const d0 = monthStart(ym);
  // Primer lunes de la cuadrícula
  const dow = (new Date(Date.UTC(...d0.split('-').map((x, i) => (i === 1 ? x - 1 : +x)))).getUTCDay() + 6) % 7;
  const inicio = dayNum(d0) - dow;
  const fin = dayNum(monthEnd(ym));
  const semanas = Math.ceil((fin - inicio + 1) / 7);
  const filas = [];
  for (let w = 0; w < semanas; w++) {
    const a = inicio + w * 7;
    const b = a + 6;
    const celdas = [];
    for (let i = 0; i < 7; i++) {
      const dn = a + i;
      const f = fromDayNum(dn);
      const fuera = f.slice(0, 7) !== ym;
      const ocupado = reservas.some((r) => dayNum(r.entrada) <= dn && dn < dayNum(r.salida));
      celdas.push(`<button class="cal-day${fuera ? ' out' : ''}${f === hoy ? ' today' : ''}${ocupado ? ' busy' : ''}" style="grid-column:${i * 2 + 1}/span 2" ${ocupado ? 'tabindex="-1"' : `data-action="nueva-reserva" data-piso="${esc(app.ui.cal.piso)}" data-fecha="${f}"`} aria-label="${esc(fmtFecha(f))}${ocupado ? ', ocupado' : ', libre'}"><span>${Number(f.slice(8))}</span></button>`);
    }
    const barras = [];
    for (const r of reservas) {
      const e = dayNum(r.entrada);
      const s = dayNum(r.salida);
      if (s < a || e > b + 1) continue;
      // Media celda: la entrada empieza a mitad del día y la salida termina a mitad del día.
      const colIni = e < a ? 1 : (e - a) * 2 + 2;
      const colFin = s > b ? 15 : (s - a) * 2 + 2;
      if (colFin <= colIni) continue;
      const n = diffDays(r.entrada, r.salida);
      barras.push(`<button class="cal-bar canal-${canalCls(r.canal)}${e < a ? ' cont-l' : ''}${s > b ? ' cont-r' : ''}${(r.cobrado || 0) < esperadoReserva(r) - 0.005 && (r.vencimiento || vencimientoReserva(r)) < hoy ? ' unpaid' : ''}" style="grid-column:${colIni}/${colFin}" data-action="editar-reserva" data-id="${esc(r.id)}" title="${esc(`${r.huesped} · ${n} noches · ${fmtEUR(r.importe)}`)}"><span>${esc(r.huesped)}</span></button>`);
    }
    filas.push(`<div class="cal-week">${celdas.join('')}${barras.join('')}</div>`);
  }
  return html`
    <div class="cal">
      <div class="cal-dow">${DIAS_C.map((d) => html`<span>${d}</span>`)}</div>
      ${raw(filas.join(''))}
    </div>`;
}

export { addDays };
