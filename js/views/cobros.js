import { html, raw, fmtEUR, fmtFecha, fmtMes, ICON, sel, diasTexto } from '../ui.js';
import { app, today, piso, unidad, listaCobros, nombreUnidad, mensajeCobro } from '../state.js';
import { diffDays, ymOf } from '../calc.js';
import { botonWhatsApp } from './panel.js';

const ESTADOS = [
  ['abiertos', 'Por cobrar'],
  ['impagado', 'Impagados'],
  ['pagado', 'Cobrados'],
  ['todos', 'Todo'],
];

export function vistaCobros() {
  const f = app.ui.cobros;
  const todos = listaCobros();
  const sum = (arr) => arr.reduce((a, c) => a + c.importe - c.cobrado, 0);
  const imp = todos.filter((c) => c.estado === 'impagado');
  const pen = todos.filter((c) => c.estado === 'pendiente');
  const mesActual = ymOf(today());
  const cobradoMes = todos.reduce((a, c) => {
    if (c.pagos?.length) return a + c.pagos.filter((x) => x.fecha && ymOf(x.fecha) === mesActual).reduce((b, x) => b + x.importe, 0);
    return a + (c.fechaCobro && ymOf(c.fechaCobro) === mesActual ? c.cobrado : 0);
  }, 0);

  let lista = todos;
  if (f.piso) lista = lista.filter((c) => c.pisoId === f.piso);
  if (f.mes) lista = lista.filter((c) => c.periodo === f.mes);
  if (f.estado === 'abiertos') lista = lista.filter((c) => c.estado !== 'pagado');
  else if (f.estado !== 'todos') lista = lista.filter((c) => c.estado === f.estado);
  // Abiertos: lo más antiguo primero (lo más urgente arriba).
  if (f.estado === 'abiertos' || f.estado === 'impagado' || f.estado === 'pendiente') lista = [...lista].reverse();
  const visibles = lista.slice(0, 300);

  return html`
    <header class="page-head">
      <div><h1>Cobros</h1><p class="muted">Recibos de contratos y reservas del turístico</p></div>
      <button class="btn btn-primary" data-action="nuevo-cobro">${raw(ICON.plus)}<span>Cobro manual</span></button>
    </header>

    <section class="kpis kpis-3">
      <button class="kpi kpi-btn ${f.estado === 'impagado' ? 'active' : ''}" data-action="filtro-cobros" data-estado="impagado">
        <span class="kpi-label"><span class="dot dot-crit"></span>Impagado</span>
        <span class="kpi-value ${imp.length ? 't-neg' : ''}">${fmtEUR(sum(imp))}</span>
        <span class="kpi-sub">${imp.length} ${imp.length === 1 ? 'recibo' : 'recibos'}</span>
      </button>
      <button class="kpi kpi-btn ${f.estado === 'pendiente' ? 'active' : ''}" data-action="filtro-cobros" data-estado="pendiente">
        <span class="kpi-label"><span class="dot dot-warn"></span>En plazo</span>
        <span class="kpi-value">${fmtEUR(sum(pen))}</span>
        <span class="kpi-sub">${pen.length} ${pen.length === 1 ? 'recibo' : 'recibos'}</span>
      </button>
      <button class="kpi kpi-btn ${f.estado === 'pagado' ? 'active' : ''}" data-action="filtro-cobros" data-estado="pagado">
        <span class="kpi-label"><span class="dot dot-ok"></span>Cobrado este mes</span>
        <span class="kpi-value">${fmtEUR(cobradoMes)}</span>
        <span class="kpi-sub">${fmtMes(mesActual)}</span>
      </button>
    </section>

    <section class="card">
      <div class="filters">
        <div class="segmented" role="tablist">
          ${ESTADOS.map(([v, t]) => html`<button role="tab" aria-selected="${f.estado === v}" class="${f.estado === v ? 'on' : ''}" data-action="filtro-cobros" data-estado="${v}">${t}</button>`)}
        </div>
        <div class="filters-right">
          ${sel('piso', [{ v: '', t: 'Todos los pisos' }, ...app.s.pisos.map((p) => ({ v: p.id, t: p.nombre }))], f.piso, { attrs: 'data-filter="cobros" aria-label="Piso"' })}
          ${sel('mes', [{ v: '', t: 'Todos los meses' }, ...[...new Set(todos.map((c) => c.periodo))].sort().reverse().map((m) => ({ v: m, t: fmtMes(m) }))], f.mes, { attrs: 'data-filter="cobros" aria-label="Mes"' })}
        </div>
      </div>
      ${visibles.length
        ? html`<ul class="list">${visibles.map(filaCobro)}</ul>${lista.length > visibles.length ? html`<p class="foot-note">Mostrando 300 de ${lista.length}. Usa los filtros para acotar.</p>` : ''}`
        : html`<div class="empty">${raw(ICON.check)}<p>${f.estado === 'abiertos' ? 'No hay nada pendiente de cobro.' : 'No hay cobros con estos filtros.'}</p>${app.s.contratos.length ? '' : html`<a class="btn" href="#/pisos">Añadir inquilinos y contratos</a>`}</div>`}
    </section>`;
}

const CHIP = { pagado: ['chip-ok', 'Cobrado'], pendiente: ['chip-warn', 'En plazo'], impagado: ['chip-crit', 'Impagado'] };

export function filaCobro(c) {
  const p = piso(c.pisoId);
  const [cls, txt] = CHIP[c.estado];
  const parcial = c.cobrado > 0 && c.cobrado < c.importe;
  const dias = diffDays(c.vencimiento, today());
  const ubic = c.tipo === 'reserva' ? p?.nombre : nombreUnidad(p, unidad(c.unidadId));
  return html`
    <li class="row row-cobro estado-${c.estado}">
      <div class="row-date"><span class="d">${c.vencimiento.slice(8)}</span><span class="m">${fmtFecha(c.vencimiento, { corto: true }).split(' ').slice(1).join(' ')}</span></div>
      <div class="row-main">
        <div class="row-title"><strong>${c.nombre}</strong><span class="muted"> · ${ubic}</span></div>
        <div class="row-sub">${c.concepto}${c.estado === 'pagado' && c.fechaCobro ? ` · cobrado el ${fmtFecha(c.fechaCobro, { corto: true })}` : ''}${c.estado === 'impagado' ? ` · vencido ${diasTexto(-dias)}` : ''}</div>
      </div>
      <div class="row-amount">
        <span class="num">${fmtEUR(c.importe)}</span>
        ${parcial ? html`<small class="muted">cobrado ${fmtEUR(c.cobrado)}</small>` : ''}
        <span class="chip ${cls}">${parcial && c.estado !== 'pagado' ? 'Parcial · ' : ''}${txt}</span>
      </div>
      <div class="row-actions">
        ${c.estado !== 'pagado'
          ? html`${c.plataforma ? '' : botonWhatsApp(c.telefono, mensajeCobro([c], c.vencimiento === today() ? 'hoy' : ''), { texto: 'Recordar' })}
                 <button class="btn btn-sm" data-action="cobrar" data-tipo="${c.tipo}" data-id="${c.id}">${raw(ICON.check)}<span>Cobrado</span></button>`
          : html`<button class="btn btn-sm btn-ghost" data-action="descobrar" data-tipo="${c.tipo}" data-id="${c.id}">Deshacer</button>`}
        <button class="icon-btn" data-action="${c.tipo === 'reserva' ? 'editar-reserva' : 'editar-cobro'}" data-id="${c.id}" aria-label="Editar">${raw(ICON.edit)}</button>
      </div>
    </li>`;
}
