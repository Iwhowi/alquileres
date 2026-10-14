import { html, raw, fmtEUR, fmtEUR0, fmtPct, fmtMes, fmtFecha, diasTexto, plural, ICON, esc } from '../ui.js';
import {
  app, today, piso, titular, pisosDe, resultado, resultadoVarios, inversion, avisos, nombreUnidad, unidad, turisticos,
} from '../state.js';
import { monthStart, monthEnd, addMonths, ymOf, daysInMonth, telefonoWhatsApp } from '../calc.js';
import { mesesDesdeBackup } from '../store.js';
import { mensajeCobro } from '../state.js';

export function vistaPanel() {
  const s = app.s;
  const ym = app.ui.mes;
  const desde = monthStart(ym);
  const hasta = monthEnd(ym);
  const opts = { incluirExtra: app.ui.incluirExtra };
  const todos = s.pisos.map((p) => p.id);
  const tot = resultadoVarios(todos, desde, hasta, opts);
  const inv = inversion(s.pisos);
  const ttm = resultadoVarios(todos, monthStart(addMonths(ym, -11)), hasta, opts);
  const rentTotal = inv > 0 ? ttm.neto / inv : null;
  const av = avisos();

  return html`
    <div class="panel-flow">
    <header class="page-head">
      <div>
        <h1>Panel</h1>
        <p class="hoy">${resumenHoy(av, s)}</p>
      </div>
      ${selectorMes(ym, 'mes')}
    </header>

    <nav class="quick-tiles" aria-label="Acciones rápidas">
      <a class="quick-tile" href="#/cobros"><span class="quick-ic">${raw(ICON.cobros)}</span><span><strong>Cobrar</strong><span>Marcar recibos cobrados</span></span></a>
      <button class="quick-tile" data-action="nuevo-gasto"><span class="quick-ic">${raw(ICON.gastos)}</span><span><strong>Añadir gasto</strong><span>Factura, reparación…</span></span></button>
      ${s.pisos.some((p) => p.modalidad === 'turistico')
        ? html`<button class="quick-tile" data-action="nueva-reserva"><span class="quick-ic">${raw(ICON.calendario)}</span><span><strong>Nueva reserva</strong><span>Piso turístico</span></span></button>`
        : html`<a class="quick-tile" href="#/pisos"><span class="quick-ic">${raw(ICON.pisos)}</span><span><strong>Mis pisos</strong><span>Inquilinos y contratos</span></span></a>`}
      <a class="quick-tile" href="#/cobros" data-action="filtro-cobros" data-estado="impagado"><span class="quick-ic">${raw(ICON.bell)}</span><span><strong>Impagos</strong><span>${av.impagos.length ? `${plural(av.impagos.length, 'persona', 'personas')} por reclamar` : 'Ninguno, todo al día'}</span></span></a>
    </nav>

    ${app.s.ajustes.tipEdificio ? '' : html`
      <section class="card tip">
        <span class="tip-ic">${raw(ICON.pisos)}</span>
        <div>
          <h2>Tu cartera es un edificio</h2>
          <ol>
            <li>Cada sección es una planta: el menú es el ascensor y te lleva de una a otra.</li>
            <li>Al bajar por la página, bajas de planta; el indicador te dice dónde estás.</li>
            <li>Empieza por los botones de arriba: cobrar, añadir un gasto o reclamar un impago.</li>
          </ol>
        </div>
        <button class="btn btn-sm" data-action="tip-visto">Entendido</button>
      </section>`}
    ${bannerInstalar()}
    ${bannerBackup()}
    ${bloqueAvisos(av)}

    <section class="kpis panel-kpis" aria-label="Resumen del mes">
      ${kpi('Ingresos', tot.ingresos, html`${fmtEUR0(tot.cobrado)} cobrado${tot.pendiente > 0.5 ? html` · <span class="t-warn">${fmtEUR0(tot.pendiente)} por cobrar</span>` : ''}`)}
      ${kpi('Gastos', tot.gastos, tot.gastosExtra > 0 ? `${fmtEUR0(tot.gastosExtra)} extraordinarios${app.ui.incluirExtra ? '' : ' (excluidos)'}` : 'Sin extraordinarios')}
      ${kpi('Hipotecas', tot.cuota, tot.cuota > 0 ? `${fmtEUR0(tot.intereses)} intereses · ${fmtEUR0(tot.amortCapital)} capital` : 'Sin hipotecas')}
      ${kpi('Cash‑flow del mes', tot.cashflow, `Lo cobrado − gastos − hipoteca · rent. neta ${fmtPct(rentTotal)} (12 m)`, true)}
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Rentabilidad de ${fmtMes(ym).toLowerCase()}</h2>
        <label class="switch"><input type="checkbox" data-action="toggle-extra" ${app.ui.incluirExtra ? raw('checked') : ''}><span>Incluir extraordinarios</span></label>
      </div>
      ${tablaRentabilidad(desde, hasta, opts)}
      <p class="foot-note">
        <b>Neto operativo</b> = ingresos del mes (cobrados o no) − gastos. <b>Cash‑flow</b> = lo cobrado de los recibos de ese mes − gastos − cuota de hipoteca (un pago atrasado suma al mes del recibo).
        <b>Rent. neta</b> = neto operativo de los últimos 12 meses ÷ precio de adquisición.
      </p>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Cash‑flow, últimos 12 meses</h2></div>
        ${grafico(ym, opts)}
      </section>
      ${bloqueOcupacion(ym)}
    </div>
    </div>`;
}

/** Frase de resumen del día, para entender el estado de un vistazo. */
function resumenHoy(av, s) {
  const partes = [];
  const imp = av.impagos.reduce((a, g) => a + g.total, 0);
  if (av.impagos.length) partes.push(html`<span class="t-neg">${fmtEUR0(imp)} sin cobrar</span> de ${plural(av.impagos.length, 'persona', 'personas')}`);
  if (av.hoyVence.length) partes.push(html`<b>${plural(av.hoyVence.length, 'recibo vence', 'recibos vencen')} hoy</b>`);
  if (av.contratos.length) partes.push(html`<b>${plural(av.contratos.length, 'contrato', 'contratos')}</b> por renovar`);
  const ent = av.movimientos.filter((m) => m.tipo === 'entrada').length;
  const sal = av.movimientos.filter((m) => m.tipo === 'salida').length;
  if (ent || sal) partes.push(html`${ent ? `${ent} ${ent === 1 ? 'entrada' : 'entradas'}` : ''}${ent && sal ? ' y ' : ''}${sal ? `${sal} ${sal === 1 ? 'salida' : 'salidas'}` : ''} en el turístico`);
  if (!partes.length) return html`Todo en orden en tus ${plural(s.pisos.length, 'piso', 'pisos')}. Sin impagos ni contratos por vencer.`;
  return html`Hoy: ${partes.map((p, i) => html`${i ? (i === partes.length - 1 ? ' y ' : ', ') : ''}${p}`)}.`;
}

export function selectorMes(ym, clave) {
  return html`
    <div class="month-nav" role="group" aria-label="Mes">
      <button class="icon-btn" data-action="mes" data-k="${clave}" data-d="-1" aria-label="Mes anterior">${raw(ICON.left)}</button>
      <button class="month-label" data-action="mes-hoy" data-k="${clave}" title="Volver al mes actual">${fmtMes(ym)}</button>
      <button class="icon-btn" data-action="mes" data-k="${clave}" data-d="1" aria-label="Mes siguiente">${raw(ICON.right)}</button>
    </div>`;
}

function kpi(label, valor, sub, destacado) {
  const neg = valor < -0.005;
  const cero = Math.abs(valor) < 0.005;
  return html`
    <div class="kpi ${destacado ? 'kpi-main' : ''}">
      <span class="kpi-label">${label}</span>
      <span class="kpi-value ${destacado && !cero ? (neg ? 't-neg' : 't-pos') : ''}">${fmtEUR(valor)}</span>
      <span class="kpi-sub">${sub}</span>
    </div>`;
}

function bannerInstalar() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!ios || instalada) return '';
  return html`
    <div class="banner banner-soft">
      ${raw(ICON.download)}
      <span><b>Instálala en la pantalla de inicio</b> (Compartir → «Añadir a pantalla de inicio»). En Safari sin instalar, iOS puede borrar los datos si no abres la web en unos días.</span>
    </div>`;
}

function bannerBackup() {
  const m = mesesDesdeBackup(app.s, today());
  if (m != null && m < 1) return '';
  const datos = app.s.cobros.length + app.s.gastos.length + app.s.reservas.length;
  if (datos < 5) return '';
  return html`
    <div class="banner">
      ${raw(ICON.download)}
      <span>${m == null ? 'Aún no has hecho ninguna copia de seguridad.' : `Tu última copia de seguridad tiene ${plural(m, 'mes', 'meses')}.`} Los datos solo están en este dispositivo.</span>
      <button class="btn btn-sm" data-action="exportar-json">Descargar copia</button>
    </div>`;
}

function bloqueAvisos(av) {
  if (!av.total && !av.movimientos.length) {
    return html`<section class="card avisos-ok panel-avisos">${raw(ICON.check)}<span>Todo al día: sin impagos ni contratos próximos a vencer.</span></section>`;
  }
  const filas = [];
  for (const g of av.impagos) {
    const p = piso(g.pisoId);
    const msg = mensajeCobro(g.items);
    filas.push(html`
      <li class="aviso aviso-crit">
        <span class="aviso-dot" aria-hidden="true"></span>
        <div class="aviso-main">
          <strong>${g.nombre}</strong> <span class="muted">· ${g.items[0].tipo === 'reserva' ? p?.nombre : nombreUnidad(p, unidad(g.items[0].unidadId))}</span>
          <div class="aviso-sub"><span class="chip chip-crit">Impagado</span> ${fmtEUR(g.total)} · ${g.items.length > 1 ? `${g.items.length} recibos · ` : ''}vencido ${diasTexto(-g.dias)}</div>
        </div>
        <div class="aviso-acc">
          ${g.items[0].plataforma ? '' : botonWhatsApp(g.telefono, msg)}
          ${g.items.length === 1 ? html`<button class="btn btn-sm" data-action="cobrar" data-tipo="${g.items[0].tipo}" data-id="${g.items[0].id}">Cobrado</button>` : html`<a class="btn btn-sm" href="#/cobros">Ver</a>`}
        </div>
      </li>`);
  }
  for (const c of av.hoyVence) {
    const p = piso(c.pisoId);
    filas.push(html`
      <li class="aviso aviso-warn">
        <span class="aviso-dot" aria-hidden="true"></span>
        <div class="aviso-main">
          <strong>${c.nombre}</strong> <span class="muted">· ${c.tipo === 'reserva' ? p?.nombre : nombreUnidad(p, unidad(c.unidadId))}</span>
          <div class="aviso-sub"><span class="chip chip-warn">Vence hoy</span> ${fmtEUR(c.importe - c.cobrado)} · ${c.concepto}</div>
        </div>
        <div class="aviso-acc">
          ${c.plataforma ? '' : botonWhatsApp(c.telefono, mensajeCobro([c], 'hoy'))}
          <button class="btn btn-sm" data-action="cobrar" data-tipo="${c.tipo}" data-id="${c.id}">Cobrado</button>
        </div>
      </li>`);
  }
  for (const a of av.contratos) {
    const k = a.contrato;
    const p = piso(k.pisoId);
    const vencido = a.tramo === 0;
    filas.push(html`
      <li class="aviso ${vencido || a.tramo <= 30 ? 'aviso-crit' : a.tramo <= 60 ? 'aviso-warn' : 'aviso-info'}">
        <span class="aviso-dot" aria-hidden="true"></span>
        <div class="aviso-main">
          <strong>Contrato de ${k.inquilino}</strong> <span class="muted">· ${nombreUnidad(p, unidad(k.unidadId))}</span>
          <div class="aviso-sub">
            <span class="chip ${vencido || a.tramo <= 30 ? 'chip-crit' : a.tramo <= 60 ? 'chip-warn' : 'chip-info'}">${vencido ? 'Vencido' : `Aviso ${a.tramo} días`}</span>
            ${vencido ? `Terminó ${diasTexto(a.dias)} (${fmtFecha(k.fin)}) · se sigue cobrando como prórroga` : `Vence ${diasTexto(a.dias)} (${fmtFecha(k.fin)})`}
          </div>
        </div>
        <div class="aviso-acc">
          <button class="btn btn-sm" data-action="renovar" data-id="${k.id}">Renovar</button>
          ${vencido
            ? html`<button class="btn btn-sm btn-ghost" data-action="finalizar-contrato" data-id="${k.id}">Finalizar</button>`
            : ''}
          <button class="btn btn-sm btn-ghost" data-action="aviso-hecho" data-id="${k.id}" data-tramo="${a.tramo}" title="Ocultar este aviso hasta el siguiente tramo">Visto</button>
        </div>
      </li>`);
  }
  for (const m of av.movimientos) {
    const p = piso(m.r.pisoId);
    filas.push(html`
      <li class="aviso aviso-info">
        <span class="aviso-icon" aria-hidden="true">${raw(m.tipo === 'entrada' ? ICON.in : ICON.out)}</span>
        <div class="aviso-main">
          <strong>${m.tipo === 'entrada' ? 'Entrada' : 'Salida'} ${m.dia}</strong> <span class="muted">· ${p?.nombre}</span>
          <div class="aviso-sub">${m.r.huesped}${m.r.huespedes ? ` · ${m.r.huespedes} pers.` : ''}${m.r.canal ? ` · ${m.r.canal}` : ''}</div>
        </div>
        <div class="aviso-acc"><a class="btn btn-sm btn-ghost" href="#/calendario/${m.r.pisoId}">Calendario</a></div>
      </li>`);
  }
  const MAX = 4;
  const todos = app.ui.avisosTodos || filas.length <= MAX + 1;
  return html`
    <section class="card panel-avisos">
      <div class="card-head">
        <h2>Avisos ${av.total ? html`<span class="count">${av.total}</span>` : ''}</h2>
      </div>
      <ul class="avisos">${todos ? filas : filas.slice(0, MAX)}</ul>
      ${filas.length > MAX + 1 ? html`<button class="btn btn-ghost btn-sm avisos-more" data-action="avisos-todos">${todos ? 'Mostrar menos' : `Ver ${filas.length - MAX} más`}</button>` : ''}
    </section>`;
}

export function botonWhatsApp(telefono, mensaje, { texto = 'WhatsApp', sm = true } = {}) {
  const tel = telefonoWhatsApp(telefono);
  const href = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
  return html`
    <span class="wa-group">
      ${tel
        ? html`<a class="btn ${sm ? 'btn-sm' : ''} btn-wa" href="${href}" target="_blank" rel="noopener">${raw(ICON.wa)}<span>${texto}</span></a>`
        : html`<button class="btn ${sm ? 'btn-sm' : ''} btn-wa" disabled title="Sin teléfono">${raw(ICON.wa)}<span>${texto}</span></button>`}
      <button class="icon-btn icon-btn-sm" data-action="copiar" data-texto="${mensaje}" aria-label="Copiar mensaje" title="Copiar mensaje">${raw(ICON.copy)}</button>
    </span>`;
}

function tablaRentabilidad(desde, hasta, opts) {
  const s = app.s;
  const desde12 = monthStart(addMonths(ymOf(desde), -11));
  const neto12 = (ids) => resultadoVarios(ids, desde12, hasta, opts).neto;
  const filas = [];
  for (const t of s.titulares) {
    const ps = pisosDe(t.id);
    if (!ps.length) continue;
    filas.push(html`<div class="trow trow-group"><span>${t.nombre} <span class="muted">· ${t.tipo === 'sociedad' ? 'Sociedad (IS)' : 'Persona física (IRPF)'}</span></span></div>`);
    for (const p of ps) {
      const r = resultado(p.id, desde, hasta, opts);
      filas.push(fila(p.nombre, r, p.precioAdquisicion, neto12([p.id]), `#/piso/${p.id}`, p));
    }
    const rt = resultadoVarios(ps.map((p) => p.id), desde, hasta, opts);
    filas.push(fila(`Total ${t.nombre}`, rt, inversion(ps), neto12(ps.map((p) => p.id)), null, null, 'trow-sub'));
  }
  const tot = resultadoVarios(s.pisos.map((p) => p.id), desde, hasta, opts);
  filas.push(fila('Total cartera', tot, inversion(s.pisos), neto12(s.pisos.map((p) => p.id)), null, null, 'trow-total'));
  return html`
    <div class="table rent-table" role="table">
      <div class="trow trow-head" role="row">
        <span>Piso</span><span>Ingresos</span><span>Gastos</span><span>Neto operativo</span><span>Hipoteca</span><span>Cash‑flow</span><span title="Neto operativo de los últimos 12 meses ÷ precio de adquisición">Rent. neta 12 m</span>
      </div>
      ${filas}
    </div>`;
}

function fila(nombre, r, inv, neto12, href, p, clase = '') {
  const rent = inv > 0 ? neto12 / inv : null;
  const neg = (v) => (v < -0.005 ? 't-neg' : '');
  const etiqueta = href
    ? html`<a href="${href}" class="trow-name">${nombre}${p ? html`<small class="muted">${p.modalidad === 'turistico' ? 'Turístico' : p.modalidad === 'habitaciones' ? 'Habitaciones' : 'Tradicional'}</small>` : ''}</a>`
    : html`<span class="trow-name">${nombre}</span>`;
  return html`
    <div class="trow ${clase}" role="row">
      ${etiqueta}
      <span data-l="Ingresos">${fmtEUR(r.ingresos)}${r.pendiente > 0.5 ? html`<small class="t-warn">${fmtEUR0(r.pendiente)} pend.</small>` : ''}</span>
      <span data-l="Gastos">${fmtEUR(r.gastos)}</span>
      <span data-l="Neto" class="${neg(r.neto)}">${fmtEUR(r.neto)}</span>
      <span data-l="Hipoteca">${r.cuota ? fmtEUR(r.cuota) : '—'}</span>
      <span data-l="Cash‑flow" class="strong ${neg(r.cashflow)}">${fmtEUR(r.cashflow)}</span>
      <span data-l="Rent. neta 12 m" class="${rent != null && rent < 0 ? 't-neg' : ''}">${inv > 0 ? fmtPct(rent) : html`<small class="muted" title="Indica el precio de adquisición del piso">—</small>`}</span>
    </div>`;
}

function grafico(ym, opts) {
  const ids = app.s.pisos.map((p) => p.id);
  const meses = Array.from({ length: 12 }, (_, i) => addMonths(ym, i - 11));
  const datos = meses.map((m) => ({ m, ...resultadoVarios(ids, monthStart(m), monthEnd(m), opts) }));
  const vals = datos.map((d) => d.cashflow);
  if (datos.every((d) => !d.ingresos && !d.gastos && !d.cuota)) {
    return html`<div class="empty empty-chart"><p>El gráfico aparecerá cuando haya cobros o gastos registrados.</p></div>`;
  }
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const W = 600;
  const H = 200;
  const padT = 14;
  const padB = 26;
  const padL = 48;
  const h = H - padT - padB;
  const y = (v) => padT + ((max - v) / (max - min)) * h;
  const bw = (W - padL) / 12;
  const barW = Math.min(26, bw * 0.56);
  const ticks = niceTicks(min, max);
  const parts = [];
  for (const t of ticks) {
    parts.push(`<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid${t === 0 ? ' zero' : ''}"/>`);
    parts.push(`<text x="${padL - 8}" y="${y(t) + 4}" class="axis" text-anchor="end">${esc(fmtK(t))}</text>`);
  }
  datos.forEach((d, i) => {
    const x = padL + i * bw + (bw - barW) / 2;
    const v = d.cashflow;
    const y0 = y(0);
    const y1 = y(v);
    const top = Math.min(y0, y1);
    const alto = Math.max(1, Math.abs(y1 - y0));
    const r = Math.min(4, alto / 2, barW / 2);
    const path = v >= 0
      ? `M${x},${y0}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${y0}Z`
      : `M${x},${y0}V${top + alto - r}Q${x},${top + alto} ${x + r},${top + alto}H${x + barW - r}Q${x + barW},${top + alto} ${x + barW},${top + alto - r}V${y0}Z`;
    const tip = `${fmtMes(d.m)}\nIngresos ${fmtEUR(d.ingresos)}\nGastos ${fmtEUR(d.gastos)}\nHipoteca ${fmtEUR(d.cuota)}\nCash‑flow ${fmtEUR(v)}`;
    parts.push(`<g class="bar-g${d.m === ym ? ' current' : ''}" tabindex="0" data-tip="${esc(tip)}">
      <rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${h}" class="hit"/>
      <path d="${path}" class="bar ${v < 0 ? 'neg' : 'pos'}"/>
      <text x="${x + barW / 2}" y="${H - 8}" class="axis" text-anchor="middle">${esc(fmtMes(d.m, { corto: true }).split(' ')[0])}</text>
    </g>`);
  });
  const filasTabla = datos.map((d) => `<tr><td>${esc(fmtMes(d.m))}</td><td>${esc(fmtEUR(d.ingresos))}</td><td>${esc(fmtEUR(d.gastos))}</td><td>${esc(fmtEUR(d.cuota))}</td><td>${esc(fmtEUR(d.cashflow))}</td></tr>`).join('');
  return html`
    <div class="chart" data-chart>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cash‑flow mensual de los últimos 12 meses">${raw(parts.join(''))}</svg>
      <div class="chart-tip" hidden></div>
    </div>
    <details class="chart-table"><summary>Ver como tabla</summary>
      <table><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Hipoteca</th><th>Cash‑flow</th></tr></thead><tbody>${raw(filasTabla)}</tbody></table>
    </details>`;
}

function niceTicks(min, max) {
  const span = max - min || 1;
  const step0 = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v));
  if (!out.includes(0)) out.push(0);
  return out;
}

const fmtK = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k` : String(v));

function bloqueOcupacion(ym) {
  const ts = turisticos();
  if (!ts.length) return '';
  const desde = monthStart(ym);
  const hasta = monthEnd(ym);
  const dim = daysInMonth(ym);
  return html`
    <section class="card">
      <div class="card-head"><h2>Turístico · ${fmtMes(ym).toLowerCase()}</h2><a class="link" href="#/calendario">Calendario</a></div>
      ${ts.map((p) => {
        const r = resultado(p.id, desde, hasta, { incluirExtra: true });
        const occ = r.noches / dim;
        const adr = r.noches ? r.ingresos / r.noches : 0;
        return html`
          <div class="occ">
            <div class="occ-head"><strong>${p.nombre}</strong><span class="num">${fmtPct(occ)}</span></div>
            <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(occ * 100)}" aria-label="Ocupación"><span style="width:${Math.min(100, occ * 100).toFixed(1)}%"></span></div>
            <dl class="mini-stats">
              <div><dt>Noches</dt><dd>${r.noches} / ${dim}</dd></div>
              <div><dt>Precio medio</dt><dd>${r.noches ? fmtEUR0(adr) : '—'}</dd></div>
              <div><dt>Ingresos</dt><dd>${fmtEUR0(r.ingresos)}</dd></div>
              <div><dt>Comisiones</dt><dd>${fmtEUR0(r.comisiones)}</dd></div>
            </dl>
          </div>`;
      })}
    </section>`;
}

export { ymOf };
