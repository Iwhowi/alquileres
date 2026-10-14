import { html, raw, fmtEUR, fmtEUR0, fmtPct, fmtFecha, fmtMes, ICON, diasTexto, plural } from '../ui.js';
import {
  app, today, piso, titular, pisosDe, unidadesDe, contratoVigente, resultado, modalidad, regimen, ctxPiso, avisos,
} from '../state.js';
import { finEfectivo } from '../store.js';
import {
  monthStart, monthEnd, ymOf, diffDays, tramoContrato, hipotecaMes, cuadroAmortizacion, hipotecaBase, CAT, num, addMonths, monthsDiff, rentaDelMes, factorArrendado,
} from '../calc.js';
import { selectorMes } from './panel.js';

let avisosContratos = [];

export function vistaPisos() {
  const s = app.s;
  avisosContratos = avisos().contratos;
  const ym = ymOf(today());
  return html`
    <header class="page-head">
      <div><h1>Pisos</h1><p class="muted">Inquilinos, contratos, hipotecas y datos de cada inmueble</p></div>
      <button class="btn btn-primary" data-action="nuevo-piso">${raw(ICON.plus)}<span>Añadir piso</span></button>
    </header>
    ${s.titulares.map((t) => {
      const ps = pisosDe(t.id);
      return html`
        <section class="group">
          <div class="group-head">
            <h2>${t.nombre}</h2>
            <span class="muted">${t.tipo === 'sociedad' ? 'Sociedad · Impuesto de Sociedades' : 'Persona física · IRPF'}</span>
            <button class="icon-btn" data-action="editar-titular" data-id="${t.id}" aria-label="Editar titular">${raw(ICON.edit)}</button>
          </div>
          ${ps.length ? html`<div class="cards">${ps.map((p) => tarjetaPiso(p, ym))}</div>` : html`<p class="muted">Sin pisos.</p>`}
        </section>`;
    })}`;
}

function tarjetaPiso(p, ym) {
  const r = resultado(p.id, monthStart(ym), monthEnd(ym));
  const uds = unidadesDe(p.id);
  const hoy = today();
  let ocup;
  if (p.modalidad === 'turistico') {
    ocup = `${r.noches} noches este mes`;
  } else {
    const ocupadas = uds.filter((u) => contratoVigente(u.id, hoy)).length;
    ocup = p.modalidad === 'habitaciones' ? `${ocupadas}/${uds.length} habitaciones ocupadas` : ocupadas ? 'Alquilado' : 'Vacío';
  }
  const alertas = avisosContratos.filter((a) => a.contrato.pisoId === p.id).length;
  return html`
    <a class="piso-card" href="#/piso/${p.id}">
      <div class="piso-card-top">
        <span class="tag tag-${p.modalidad}">${modalidad(p)}</span>
        ${alertas ? html`<span class="chip chip-warn">${alertas} ${alertas === 1 ? 'contrato vence' : 'contratos vencen'}</span>` : ''}
      </div>
      <h3>${p.nombre}</h3>
      <p class="muted small">${p.direccion || ' '}</p>
      <p class="small">${ocup}</p>
      <dl class="mini-stats">
        <div><dt>Ingresos mes</dt><dd>${fmtEUR0(r.ingresos)}</dd></div>
        <div><dt>Cash‑flow</dt><dd class="${r.cashflow < 0 ? 't-neg' : ''}">${fmtEUR0(r.cashflow)}</dd></div>
      </dl>
    </a>`;
}

export function vistaPiso(id) {
  const p = piso(id);
  if (!p) return html`<div class="empty"><p>Este piso no existe.</p><a class="btn" href="#/pisos">Volver</a></div>`;
  const t = titular(p.titularId);
  const ym = app.ui.mes;
  const rm = resultado(p.id, monthStart(ym), monthEnd(ym), { incluirExtra: app.ui.incluirExtra });
  const y = ym.slice(0, 4);
  const ra = resultado(p.id, `${y}-01-01`, monthEnd(ym), { incluirExtra: app.ui.incluirExtra });
  const r12 = resultado(p.id, monthStart(addMonths(ym, -11)), monthEnd(ym), { incluirExtra: app.ui.incluirExtra });
  const inv = num(p.precioAdquisicion);
  return html`
    <a class="back" href="#/pisos">${raw(ICON.left)}<span>Pisos</span></a>
    <header class="page-head">
      <div>
        <h1>${p.nombre}</h1>
        <p class="muted">${modalidad(p)} · ${t?.nombre || 'Sin titular'}${p.direccion ? ` · ${p.direccion}` : ''}</p>
      </div>
      <div class="head-actions">
        ${selectorMes(ym, 'mes')}
        <button class="btn" data-action="editar-piso" data-id="${p.id}">${raw(ICON.edit)}<span>Datos</span></button>
      </div>
    </header>

    <section class="kpis">
      ${k('Ingresos del mes', rm.ingresos, rm.pendiente > 0.5 ? html`<span class="t-warn">${fmtEUR0(rm.pendiente)} por cobrar</span>` : `${fmtEUR0(rm.cobrado)} cobrado`)}
      ${k('Gastos del mes', rm.gastos, rm.gastosExtra ? `${fmtEUR0(rm.gastosExtra)} extraordinarios` : '')}
      ${k('Cash‑flow del mes', rm.cashflow, rm.cuota ? `tras ${fmtEUR0(rm.cuota)} de hipoteca` : 'Sin hipoteca', true)}
      ${k(`Acumulado ${y}`, ra.cashflow, inv > 0 ? `Rent. neta ${fmtPct(r12.neto / inv)} (últimos 12 meses)` : 'Añade el precio de compra para ver la rentabilidad', true)}
    </section>

    ${p.modalidad === 'turistico' ? bloqueTuristico(p) : bloqueUnidades(p)}
    ${bloqueHipotecas(p)}
    ${bloqueRecurrentes(p)}
    ${bloqueUltimosGastos(p)}
    ${bloqueFicha(p, t)}`;
}

function k(label, v, sub, main) {
  return html`<div class="kpi ${main ? 'kpi-main' : ''}"><span class="kpi-label">${label}</span><span class="kpi-value ${main ? (v < 0 ? 't-neg' : 't-pos') : ''}">${fmtEUR(v)}</span><span class="kpi-sub">${sub || ''}</span></div>`;
}

function bloqueUnidades(p) {
  const uds = unidadesDe(p.id);
  const hoy = today();
  const habit = p.modalidad === 'habitaciones';
  return html`
    <section class="card">
      <div class="card-head">
        <h2>${habit ? 'Habitaciones e inquilinos' : 'Inquilino y contrato'}</h2>
        ${habit ? html`<button class="btn btn-sm" data-action="nueva-unidad" data-piso="${p.id}">${raw(ICON.plus)}<span>Habitación</span></button>` : ''}
      </div>
      <ul class="units">
        ${uds.map((u) => {
          const k = contratoVigente(u.id, hoy);
          const futuro = app.s.contratos.filter((c) => c.unidadId === u.id && c.inicio > hoy).sort((a, b) => (a.inicio < b.inicio ? -1 : 1))[0];
          const historial = app.s.contratos.filter((c) => c.unidadId === u.id && c !== k && c !== futuro).sort((a, b) => (a.inicio < b.inicio ? 1 : -1));
          return html`
            <li class="unit">
              <div class="unit-head">
                <strong>${u.nombre}</strong>
                ${habit ? html`<button class="icon-btn icon-btn-sm" data-action="editar-unidad" data-id="${u.id}" aria-label="Renombrar">${raw(ICON.edit)}</button>` : ''}
                <span class="grow"></span>
                <button class="btn btn-sm" data-action="nuevo-contrato" data-piso="${p.id}" data-unidad="${u.id}">${raw(ICON.plus)}<span>Contrato</span></button>
              </div>
              ${k ? contratoCard(k, hoy) : html`<p class="muted small unit-empty">Libre${futuro ? '' : ' · sin contrato vigente'}</p>`}
              ${futuro ? html`<div class="unit-next"><span class="chip chip-info">Próximo</span>${contratoCard(futuro, hoy)}</div>` : ''}
              ${historial.length
                ? html`<details class="history"><summary>${plural(historial.length, 'contrato anterior', 'contratos anteriores')}</summary>
                    ${historial.map((c) => html`<div class="hist-row"><span>${c.inquilino}</span><span class="muted">${fmtFecha(c.inicio, { corto: true })} – ${fmtFecha(c.fin, { corto: true })} · ${fmtEUR(c.renta)}</span><button class="icon-btn icon-btn-sm" data-action="editar-contrato" data-id="${c.id}" aria-label="Editar">${raw(ICON.edit)}</button></div>`)}
                  </details>`
                : ''}
            </li>`;
        })}
      </ul>
    </section>`;
}

function contratoCard(k, hoy) {
  const t = k.finalizado ? null : tramoContrato(k.fin, hoy, app.s.ajustes.tramos);
  const dias = k.fin ? diffDays(hoy, k.fin) : null;
  const prorroga = !k.fin ? false : k.fin < hoy && !finEfectivo(app.s, k, hoy);
  const renta = rentaDelMes(k, ymOf(hoy));
  const proxima = (k.rentas || []).filter((r) => r.desde > ymOf(hoy)).sort((a, b) => (a.desde < b.desde ? -1 : 1))[0];
  return html`
    <div class="contract">
      <div class="contract-main">
        <div><strong>${k.inquilino}</strong>${k.telefono ? html` <a class="muted small" href="tel:${k.telefono}">${k.telefono}</a>` : ''}</div>
        <div class="muted small">${fmtEUR(renta)}/mes${renta !== num(k.renta) ? ` (inicial ${fmtEUR(k.renta)})` : ''}${proxima ? html` · <span class="t-info">sube a ${fmtEUR(proxima.renta)} en ${fmtMes(proxima.desde, { corto: true })}</span>` : ''} · paga el día ${k.diaPago || 1} · fianza ${fmtEUR(k.fianza || 0)}</div>
        <div class="small">
          ${fmtFecha(k.inicio, { corto: true })} – ${k.fin ? fmtFecha(k.fin, { corto: true }) : 'indefinido'}
          ${prorroga ? html` <span class="chip chip-warn">en prórroga desde ${fmtFecha(k.fin, { corto: true })}</span>` : t && t.tramo > 0 ? html` <span class="chip ${t.tramo <= 30 ? 'chip-crit' : t.tramo <= 60 ? 'chip-warn' : 'chip-info'}">vence ${diasTexto(dias)}</span>` : ''}
        </div>
      </div>
      <div class="contract-actions">
        ${k.fin && !k.finalizado ? html`<button class="btn btn-sm" data-action="renovar" data-id="${k.id}">Renovar</button>` : ''}
        ${k.finalizado ? html`<span class="chip chip-soft">Finalizado</span>` : html`<button class="btn btn-sm btn-ghost" data-action="actualizar-renta" data-id="${k.id}">Actualizar renta</button>
        <button class="btn btn-sm btn-ghost" data-action="finalizar-contrato" data-id="${k.id}">Finalizar</button>`}
        <button class="icon-btn" data-action="editar-contrato" data-id="${k.id}" aria-label="Editar contrato">${raw(ICON.edit)}</button>
      </div>
    </div>`;
}

function bloqueTuristico(p) {
  const hoy = today();
  const prox = app.s.reservas.filter((r) => r.pisoId === p.id && !r.cancelada && r.salida >= hoy).sort((a, b) => (a.entrada < b.entrada ? -1 : 1)).slice(0, 6);
  return html`
    <section class="card">
      <div class="card-head">
        <h2>Próximas reservas</h2>
        <div class="head-actions">
          <a class="btn btn-sm btn-ghost" href="#/calendario/${p.id}">${raw(ICON.calendario)}<span>Calendario</span></a>
          <button class="btn btn-sm" data-action="nueva-reserva" data-piso="${p.id}">${raw(ICON.plus)}<span>Reserva</span></button>
        </div>
      </div>
      ${prox.length
        ? html`<ul class="list">${prox.map((r) => html`
            <li class="row">
              <div class="row-main"><div class="row-title"><strong>${r.huesped}</strong><span class="muted"> · ${r.canal || 'Directo'}</span></div>
              <div class="row-sub">${fmtFecha(r.entrada, { corto: true })} → ${fmtFecha(r.salida, { corto: true })} · ${diffDays(r.entrada, r.salida)} noches${r.entrada <= hoy ? ' · en curso' : ''}</div></div>
              <div class="row-amount"><span class="num">${fmtEUR(r.importe)}</span></div>
              <div class="row-actions"><button class="icon-btn" data-action="editar-reserva" data-id="${r.id}" aria-label="Editar">${raw(ICON.edit)}</button></div>
            </li>`)}</ul>`
        : html`<p class="muted">No hay reservas próximas.</p>`}
    </section>`;
}

function bloqueHipotecas(p) {
  const hs = app.s.hipotecas.filter((h) => h.pisoId === p.id);
  const ym = app.ui.mes;
  return html`
    <section class="card">
      <div class="card-head">
        <h2>Hipoteca</h2>
        <button class="btn btn-sm" data-action="nueva-hipoteca" data-piso="${p.id}">${raw(ICON.plus)}<span>Hipoteca</span></button>
      </div>
      ${hs.length
        ? hs.map((h) => {
            const m = hipotecaMes(h, ym);
            const b = hipotecaBase(h);
            const cuadro = cuadroAmortizacion(h, ym, 12);
            const interesesAnio = Array.from({ length: 12 }, (_, i) => hipotecaMes(h, `${ym.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`).intereses).reduce((a, x) => a + x, 0);
            return html`
              <div class="mortgage">
                <div class="mortgage-head">
                  <strong>${h.entidad || 'Hipoteca'}</strong>
                  <span class="muted small">${String(h.tipo).replace('.', ',')} % · hasta ${fmtMes(b.mesFin).toLowerCase()} (${plural(Math.max(0, monthsDiff(ym, b.mesFin) + 1), 'cuota pendiente', 'cuotas pendientes')})</span>
                  <span class="grow"></span>
                  <button class="icon-btn" data-action="editar-hipoteca" data-id="${h.id}" aria-label="Editar hipoteca">${raw(ICON.edit)}</button>
                </div>
                <dl class="mini-stats mini-stats-4">
                  <div><dt>Cuota ${fmtMes(ym, { corto: true })}</dt><dd>${fmtEUR(m.cuota)}</dd></div>
                  <div><dt>Intereses</dt><dd>${fmtEUR(m.intereses)}</dd></div>
                  <div><dt>Capital</dt><dd>${fmtEUR(m.capital)}</dd></div>
                  <div><dt>Pendiente</dt><dd>${fmtEUR0(m.pendiente)}</dd></div>
                </dl>
                <p class="foot-note">Intereses estimados ${ym.slice(0, 4)}: <b>${fmtEUR(interesesAnio)}</b> (deducibles). El capital amortizado no es gasto deducible.</p>
                <details class="history"><summary>Cuadro de amortización (12 meses)</summary>
                  <table class="tbl"><thead><tr><th>Mes</th><th>Cuota</th><th>Intereses</th><th>Capital</th><th>Pendiente</th></tr></thead>
                  <tbody>${cuadro.map((c) => html`<tr><td>${fmtMes(c.ym, { corto: true })}</td><td>${fmtEUR(c.cuota)}</td><td>${fmtEUR(c.intereses)}</td><td>${fmtEUR(c.capital)}</td><td>${fmtEUR(c.pendiente - c.capital)}</td></tr>`)}</tbody></table>
                </details>
              </div>`;
          })
        : html`<p class="muted">Sin hipoteca. Si la tiene, añádela para descontar la cuota del cash-flow y deducir los intereses.</p>`}
    </section>`;
}

function bloqueRecurrentes(p) {
  const rs = app.s.recurrentes.filter((r) => r.pisoId === p.id);
  const per = { 1: 'mensual', 2: 'bimestral', 3: 'trimestral', 6: 'semestral', 12: 'anual' };
  return html`
    <section class="card">
      <div class="card-head">
        <h2>Gastos fijos</h2>
        <button class="btn btn-sm" data-action="nuevo-recurrente" data-piso="${p.id}">${raw(ICON.plus)}<span>Gasto fijo</span></button>
      </div>
      ${rs.length
        ? html`<ul class="list">${rs.map((r) => html`
            <li class="row">
              <div class="row-main"><div class="row-title"><strong>${r.concepto}</strong></div>
              <div class="row-sub">${CAT[r.categoria]?.nombre || ''} · ${per[r.cadaMeses] || `cada ${r.cadaMeses} meses`}, día ${r.dia}${r.hasta ? ` · hasta ${fmtFecha(r.hasta, { corto: true })}` : ''}</div></div>
              <div class="row-amount"><span class="num">${fmtEUR(r.importe)}</span></div>
              <div class="row-actions"><button class="icon-btn" data-action="editar-recurrente" data-id="${r.id}" aria-label="Editar">${raw(ICON.edit)}</button></div>
            </li>`)}</ul>`
        : html`<p class="muted">Comunidad, IBI, seguro, suministros… Se apuntan solos cada periodo.</p>`}
    </section>`;
}

function bloqueUltimosGastos(p) {
  const gs = app.s.gastos.filter((g) => g.pisoId === p.id).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 5);
  return html`
    <section class="card">
      <div class="card-head">
        <h2>Últimos gastos</h2>
        <div class="head-actions">
          <a class="link" href="#/gastos" data-action="ver-gastos-piso" data-piso="${p.id}">Ver todos</a>
          <button class="btn btn-sm" data-action="nuevo-gasto" data-piso="${p.id}">${raw(ICON.plus)}<span>Gasto</span></button>
        </div>
      </div>
      ${gs.length
        ? html`<ul class="list">${gs.map((g) => html`
            <li class="row">
              <div class="row-main"><div class="row-title"><strong>${g.concepto || CAT[g.categoria]?.nombre}</strong>${g.extraordinario ? html` <span class="chip chip-info">Extra</span>` : ''}</div>
              <div class="row-sub">${fmtFecha(g.fecha, { corto: true })} · ${CAT[g.categoria]?.nombre || ''}</div></div>
              <div class="row-amount"><span class="num">${fmtEUR(g.importe)}</span></div>
              <div class="row-actions"><button class="icon-btn" data-action="editar-gasto" data-id="${g.id}" aria-label="Editar">${raw(ICON.edit)}</button></div>
            </li>`)}</ul>`
        : html`<p class="muted">Sin gastos registrados.</p>`}
    </section>`;
}

function bloqueFicha(p, t) {
  const reg = regimen(t);
  const coef = reg === 'IS' ? '2 %' : '3 %';
  return html`
    <section class="card">
      <div class="card-head"><h2>Ficha y datos fiscales</h2><button class="btn btn-sm btn-ghost" data-action="editar-piso" data-id="${p.id}">Editar</button></div>
      <dl class="facts">
        <div><dt>Referencia catastral</dt><dd>${p.refCatastral || '—'}</dd></div>
        <div><dt>Adquisición</dt><dd>${p.fechaAdquisicion ? fmtFecha(p.fechaAdquisicion) : '—'}</dd></div>
        <div><dt>Precio de adquisición</dt><dd>${num(p.precioAdquisicion) ? fmtEUR(p.precioAdquisicion) : '—'}</dd></div>
        <div><dt>Base amortizable construcción (${coef})</dt><dd>${num(p.valorConstruccion) ? fmtEUR(p.valorConstruccion) : html`<span class="t-warn">Sin indicar · no se amortiza</span>`}</dd></div>
        ${reg === 'IRPF' ? html`<div><dt>Reducción por alquiler de vivienda</dt><dd>${num(p.reduccion)} %</dd></div>` : ''}
        <div><dt>Días arrendado ${app.ui.mes.slice(0, 4)} (prorrateo fiscal)</dt><dd>${Math.round(factorArrendado(p, ctxPiso(p.id), Number(app.ui.mes.slice(0, 4)), { regimen: reg, hasta: app.ui.mes.slice(0, 4) === today().slice(0, 4) ? today() : `${app.ui.mes.slice(0, 4)}-12-31` }) * 100)} %${p.pctFiscal == null || p.pctFiscal === '' ? html` <span class="muted small">automático</span>` : ''}</dd></div>
      </dl>
      ${p.notas ? html`<p class="notes">${p.notas}</p>` : ''}
    </section>`;
}

export { addMonths };
