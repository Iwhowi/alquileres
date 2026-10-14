import { html, raw, fmtEUR, fmtFecha, fmtMes, ICON, sel, mesNombre } from '../ui.js';
import { app, today, piso } from '../state.js';
import { CATEGORIAS, CAT, ymOf, num } from '../calc.js';

export function opcionesCategoria() {
  return [
    { grupo: 'Deducibles en el año', items: CATEGORIAS.filter((c) => c.trato === 'gasto').map((c) => ({ v: c.id, t: c.nombre })) },
    { grupo: 'Se amortizan', items: CATEGORIAS.filter((c) => c.trato.startsWith('amort')).map((c) => ({ v: c.id, t: `${c.nombre} (${c.trato === 'amort_mue' ? '10 %/año' : '3 %/año'})` })) },
    { grupo: 'Otros', items: [{ v: 'no_deducible', t: 'No deducible' }] },
  ];
}

export const opcionesPiso = (vacio) => [
  ...(vacio ? [{ v: '', t: vacio }] : []),
  ...app.s.titulares.map((t) => ({ grupo: t.nombre, items: app.s.pisos.filter((p) => p.titularId === t.id).map((p) => ({ v: p.id, t: p.nombre })) })),
];

export function vistaGastos() {
  const f = app.ui.gastos;
  let lista = app.s.gastos;
  if (f.piso) lista = lista.filter((g) => g.pisoId === f.piso);
  if (f.anio) lista = lista.filter((g) => g.fecha.startsWith(f.anio));
  if (f.mes) lista = lista.filter((g) => g.fecha.slice(5, 7) === f.mes);
  if (f.cat) lista = lista.filter((g) => g.categoria === f.cat || (f.cat === 'extra' && g.extraordinario));
  if (f.q) {
    const q = f.q.toLowerCase();
    lista = lista.filter((g) => `${g.concepto} ${g.proveedor} ${piso(g.pisoId)?.nombre}`.toLowerCase().includes(q));
  }
  lista = [...lista].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  const total = lista.reduce((a, g) => a + num(g.importe), 0);
  const extra = lista.filter((g) => g.extraordinario).reduce((a, g) => a + num(g.importe), 0);
  const noDed = lista.filter((g) => CAT[g.categoria]?.trato === 'no' || g.deducible === false).reduce((a, g) => a + num(g.importe), 0);
  const porCat = new Map();
  for (const g of lista) porCat.set(g.categoria, (porCat.get(g.categoria) || 0) + num(g.importe));
  const cats = [...porCat.entries()].sort((a, b) => b[1] - a[1]);
  const anios = [...new Set([today().slice(0, 4), ...app.s.gastos.map((g) => g.fecha.slice(0, 4))])].sort().reverse();
  const porMes = new Map();
  const limite = app.ui.gastosLimite || 60;
  for (const g of lista.slice(0, limite)) {
    const k = ymOf(g.fecha);
    if (!porMes.has(k)) porMes.set(k, []);
    porMes.get(k).push(g);
  }

  return html`
    <header class="page-head">
      <div><h1>Gastos</h1><p class="muted">Diarios, fijos y extraordinarios, con su tratamiento fiscal</p></div>
      <button class="btn btn-primary" data-action="nuevo-gasto">${raw(ICON.plus)}<span>Nuevo gasto</span></button>
    </header>

    <section class="card quick">
      <form class="quick-form" data-form="gasto-rapido" autocomplete="off">
        <label class="field"><span class="field-label">Fecha</span><input type="date" name="fecha" value="${today()}" required></label>
        <label class="field"><span class="field-label">Piso</span>${sel('pisoId', opcionesPiso(), f.piso || app.ui.ultimoPiso || app.s.pisos[0]?.id, { req: true })}</label>
        <label class="field"><span class="field-label">Categoría</span>${sel('categoria', opcionesCategoria(), app.ui.ultimaCat || 'reparacion', { req: true })}</label>
        <label class="field grow2"><span class="field-label">Concepto</span><input name="concepto" placeholder="Ej.: fontanero, bombillas…"></label>
        <label class="field"><span class="field-label">Importe</span><input name="importe" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" required></label>
        <label class="check check-inline"><input type="checkbox" name="extraordinario"><span>Extraordinario</span></label>
        <button class="btn btn-primary" type="submit">Añadir</button>
      </form>
    </section>

    <section class="kpis kpis-3">
      <div class="kpi"><span class="kpi-label">Total filtrado</span><span class="kpi-value">${fmtEUR(total)}</span><span class="kpi-sub">${lista.length} ${lista.length === 1 ? 'gasto' : 'gastos'}</span></div>
      <div class="kpi"><span class="kpi-label">Extraordinarios</span><span class="kpi-value">${fmtEUR(extra)}</span><span class="kpi-sub">${total ? Math.round((extra / total) * 100) : 0} % del total</span></div>
      <div class="kpi"><span class="kpi-label">No deducible</span><span class="kpi-value">${fmtEUR(noDed)}</span><span class="kpi-sub">El resto computa en la declaración</span></div>
    </section>

    <div class="grid-2 grid-wide-left">
      <section class="card">
        <div class="filters">
          <div class="filters-right wrap">
            ${sel('piso', opcionesPiso('Todos los pisos'), f.piso, { attrs: 'data-filter="gastos" aria-label="Piso"' })}
            ${sel('anio', [{ v: '', t: 'Todos los años' }, ...anios.map((a) => ({ v: a, t: a }))], f.anio, { attrs: 'data-filter="gastos" aria-label="Año"' })}
            ${sel('mes', [{ v: '', t: 'Todo el año' }, ...Array.from({ length: 12 }, (_, i) => ({ v: String(i + 1).padStart(2, '0'), t: mesNombre(i + 1).replace(/^./, (c) => c.toUpperCase()) }))], f.mes, { attrs: 'data-filter="gastos" aria-label="Mes"' })}
            ${sel('cat', [{ v: '', t: 'Todas las categorías' }, { v: 'extra', t: 'Solo extraordinarios' }, ...CATEGORIAS.map((c) => ({ v: c.id, t: c.nombre }))], f.cat, { attrs: 'data-filter="gastos" aria-label="Categoría"' })}
            <label class="search">${raw(ICON.search)}<input type="search" name="q" value="${f.q}" placeholder="Buscar" data-filter="gastos" aria-label="Buscar"></label>
          </div>
        </div>
        ${lista.length
          ? [...porMes.entries()].map(([m, gs]) => html`
              <h3 class="list-month"><span>${fmtMes(m)}</span><span class="num muted">${fmtEUR(gs.reduce((a, g) => a + num(g.importe), 0))}</span></h3>
              <ul class="list">${gs.map(filaGasto)}</ul>`)
          : html`<div class="empty"><p>No hay gastos con estos filtros.</p></div>`}
        ${lista.length > limite ? html`<button class="btn btn-ghost btn-sm avisos-more" data-action="mas-gastos">Ver ${Math.min(60, lista.length - limite)} más (${lista.length - limite} restantes)</button>` : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2>Por categoría</h2></div>
        ${cats.length
          ? html`<ul class="bars">${cats.map(([c, v]) => html`
              <li><div class="bars-label"><span>${CAT[c]?.nombre || c}</span><span class="num">${fmtEUR(v)}</span></div>
              <div class="meter"><span style="width:${((v / cats[0][1]) * 100).toFixed(1)}%"></span></div></li>`)}</ul>`
          : html`<p class="muted">Sin datos.</p>`}
        <p class="foot-note">Los gastos fijos (comunidad, IBI, seguros…) se configuran en cada piso y se apuntan solos.</p>
      </section>
    </div>`;
}

function filaGasto(g) {
  const p = piso(g.pisoId);
  const c = CAT[g.categoria];
  return html`
    <li class="row">
      <div class="row-date"><span class="d">${g.fecha.slice(8)}</span><span class="m">${fmtFecha(g.fecha, { corto: true }).split(' ')[1]}</span></div>
      <div class="row-main">
        <div class="row-title"><strong>${g.concepto || c?.nombre || 'Gasto'}</strong>
          ${g.extraordinario ? html` <span class="chip chip-info">Extra</span>` : ''}
          ${g.recurrenteId ? html` <span class="chip chip-soft">Fijo</span>` : ''}
          ${c?.trato === 'no' || g.deducible === false ? html` <span class="chip chip-soft">No deducible</span>` : ''}
        </div>
        <div class="row-sub">${p?.nombre || '—'} · ${c?.nombre || g.categoria}${g.proveedor ? ` · ${g.proveedor}` : ''}</div>
      </div>
      <div class="row-amount"><span class="num">${fmtEUR(g.importe)}</span></div>
      <div class="row-actions"><button class="icon-btn" data-action="editar-gasto" data-id="${g.id}" aria-label="Editar">${raw(ICON.edit)}</button></div>
    </li>`;
}
