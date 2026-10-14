import { html, raw, fmtEUR, ICON, sel } from '../ui.js';
import { app, today, pisosDe, ctxPiso, regimen } from '../state.js';
import { fiscalPiso, GRUPOS_FISCALES, num, r2 } from '../calc.js';

export function calculoFiscal(anio) {
  const y = Number(anio);
  return app.s.titulares.map((t) => {
    const reg = regimen(t);
    const pisos = pisosDe(t.id).map((p) => ({ p, f: fiscalPiso(p, ctxPiso(p.id), y, reg, today()) }));
    const suma = (k) => r2(pisos.reduce((a, x) => a + x.f[k], 0));
    const base = reg === 'IS' ? suma('rendimientoNeto') : suma('rendimientoReducido');
    const tipo = num(t.tipoEstimado);
    return {
      t, reg, pisos,
      ingresos: suma('ingresos'),
      gastos: suma('gastosDeducibles'),
      neto: suma('rendimientoNeto'),
      reduccion: suma('reduccion'),
      base,
      cuota: r2(Math.max(0, base) * (tipo / 100)),
      tipo,
    };
  });
}

export function vistaFiscal() {
  const anio = app.ui.fiscal.anio;
  const anios = [...new Set([today().slice(0, 4), String(Number(today().slice(0, 4)) - 1), ...app.s.gastos.map((g) => g.fecha.slice(0, 4)), ...app.s.cobros.map((c) => c.periodo.slice(0, 4))])].sort().reverse();
  const datos = calculoFiscal(anio);
  return html`
    <header class="page-head">
      <div><h1>Fiscal</h1><p class="muted">Rendimientos del alquiler por titular: IRPF (modelo 100) e Impuesto de Sociedades</p></div>
      <div class="head-actions">
        ${sel('anio', anios.map((a) => ({ v: a, t: `Ejercicio ${a}` })), anio, { attrs: 'data-filter="fiscal" aria-label="Ejercicio"' })}
        <button class="btn" data-action="exportar-fiscal">${raw(ICON.download)}<span>CSV para el asesor</span></button>
      </div>
    </header>
    <div class="banner banner-soft">${raw(ICON.doc)}<span>Estimación orientativa calculada con tus datos. Revísala con tu asesor antes de presentar la declaración.</span></div>
    ${datos.map(bloqueTitular)}`;
}

function sumaF(fs) {
  const out = { grupos: {} };
  for (const f of fs) {
    for (const k of ['ingresos', 'gastosDeducibles', 'rendimientoNeto', 'reduccion', 'rendimientoReducido']) out[k] = (out[k] || 0) + f[k];
    for (const [k, v] of Object.entries(f.grupos)) out.grupos[k] = (out.grupos[k] || 0) + v;
  }
  return out;
}

function bloqueTitular(d) {
  const esIS = d.reg === 'IS';
  const filasGrupos = Object.entries(GRUPOS_FISCALES).map(([k, nombre]) => {
    const vals = d.pisos.map((x) => x.f.grupos[k]);
    const total = vals.reduce((a, v) => a + v, 0);
    if (!total) return '';
    return html`<tr><td>${nombre}${k === 'amort_inm' ? html` <small class="muted">(${esIS ? '2' : '3'} %)</small>` : ''}</td>${vals.map((v) => html`<td>${v ? fmtEUR(v) : '—'}</td>`)}<td class="strong">${fmtEUR(total)}</td></tr>`;
  });
  const fila = (label, key, cls = '') => html`<tr class="${cls}"><td>${label}</td>${d.pisos.map((x) => html`<td class="${x.f[key] < 0 ? 't-neg' : ''}">${fmtEUR(x.f[key])}</td>`)}<td class="strong">${fmtEUR(d.pisos.reduce((a, x) => a + x.f[key], 0))}</td></tr>`;
  const excesos = d.pisos.filter((x) => x.f.exceso > 0);
  return html`
    <section class="card">
      <div class="card-head">
        <h2>${d.t.nombre} <span class="muted">· ${esIS ? 'Impuesto de Sociedades' : 'IRPF · capital inmobiliario'}</span></h2>
        ${d.pisos[0]?.f.enCurso ? html`<span class="chip chip-info">Año en curso · hasta hoy</span>` : ''}
      </div>
      <section class="kpis kpis-inner">
        <div class="kpi"><span class="kpi-label">Ingresos íntegros</span><span class="kpi-value">${fmtEUR(d.ingresos)}</span></div>
        <div class="kpi"><span class="kpi-label">Gastos deducibles</span><span class="kpi-value">${fmtEUR(d.gastos)}</span></div>
        <div class="kpi"><span class="kpi-label">${esIS ? 'Resultado (base imponible)' : 'Rendimiento neto reducido'}</span><span class="kpi-value ${d.base < 0 ? 't-neg' : ''}">${fmtEUR(d.base)}</span>${!esIS && d.reduccion ? html`<span class="kpi-sub">tras ${fmtEUR(d.reduccion)} de reducción</span>` : ''}</div>
        <div class="kpi kpi-main"><span class="kpi-label">Cuota estimada</span><span class="kpi-value">${fmtEUR(d.cuota)}</span><span class="kpi-sub">al ${d.tipo} % ${esIS ? 'del IS' : 'marginal'} · <button class="link" data-action="editar-titular" data-id="${d.t.id}">cambiar</button></span></div>
      </section>
      <div class="tbl-wrap tbl-fiscal-wrap">
        <table class="tbl tbl-fiscal">
          <thead><tr><th>Concepto</th>${d.pisos.map((x) => html`<th>${x.p.nombre}</th>`)}<th>Total</th></tr></thead>
          <tbody>
            ${fila('Ingresos íntegros', 'ingresos', 'tr-strong')}
            ${filasGrupos}
            ${fila('Total gastos deducibles', 'gastosDeducibles', 'tr-strong')}
            ${fila(esIS ? 'Resultado' : 'Rendimiento neto', 'rendimientoNeto', 'tr-strong')}
            ${esIS ? '' : fila('Reducción por arrendamiento de vivienda', 'reduccion')}
            ${esIS ? '' : fila('Rendimiento neto reducido', 'rendimientoReducido', 'tr-total')}
            ${fila('No deducible (informativo)', 'noDeducible', 'tr-muted')}
          </tbody>
        </table>
      </div>
      <div class="tbl-cards">
        ${[...d.pisos.map((x) => ({ nombre: x.p.nombre, f: x.f })), d.pisos.length > 1 ? { nombre: `Total ${d.t.nombre}`, f: sumaF(d.pisos.map((x) => x.f)) } : null].filter(Boolean).map((c) => html`
          <div class="tcard">
            <h3>${c.nombre}</h3>
            <dl>
              <dt class="tc-strong">Ingresos íntegros</dt><dd class="tc-strong">${fmtEUR(c.f.ingresos)}</dd>
              ${Object.entries(GRUPOS_FISCALES).filter(([k]) => c.f.grupos[k]).map(([k, n]) => html`<dt>${n}</dt><dd>${fmtEUR(c.f.grupos[k])}</dd>`)}
              <dt class="tc-strong tc-total">Gastos deducibles</dt><dd class="tc-strong tc-total">${fmtEUR(c.f.gastosDeducibles)}</dd>
              <dt class="tc-strong">${esIS ? 'Resultado' : 'Rendimiento neto'}</dt><dd class="tc-strong ${c.f.rendimientoNeto < 0 ? 't-neg' : ''}">${fmtEUR(c.f.rendimientoNeto)}</dd>
              ${esIS ? '' : html`<dt>Reducción</dt><dd>${fmtEUR(c.f.reduccion)}</dd><dt class="tc-strong">Neto reducido</dt><dd class="tc-strong">${fmtEUR(c.f.rendimientoReducido)}</dd>`}
            </dl>
          </div>`)}
      </div>
      ${excesos.length
        ? html`<p class="foot-note t-warn">Intereses y reparación superan los ingresos en ${excesos.map((x) => `${x.p.nombre} (${fmtEUR(x.f.exceso)})`).join(', ')}. Ese exceso se aplica automáticamente en los cuatro años siguientes.</p>`
        : ''}
      ${d.pisos.some((x) => x.f.pendienteFuturo > 0) && !esIS ? html`<p class="foot-note">Pendiente de aplicar en años futuros: ${d.pisos.filter((x) => x.f.pendienteFuturo > 0).map((x) => `${x.p.nombre} ${fmtEUR(x.f.pendienteFuturo)}`).join(' · ')}.</p>` : ''}
      ${esIS
        ? html`<p class="foot-note">En el IS los inmuebles están afectos a la actividad aunque estén vacíos: gastos y amortización sin prorrateo por días.</p>`
        : html`<p class="foot-note">Días arrendado${d.pisos[0]?.f.enCurso ? ' en lo que va de año' : ''} (prorrateo de gastos generales, intereses y amortización): ${d.pisos.map((x) => `${x.p.nombre} ${Math.round(x.f.pct * 100)} %`).join(' · ')}. Limpieza, consumibles y comisiones se imputan enteros.</p>`}
      ${d.pisos.some((x) => !num(x.p.valorConstruccion)) ? html`<p class="foot-note t-warn">Sin base amortizable: ${d.pisos.filter((x) => !num(x.p.valorConstruccion)).map((x) => x.p.nombre).join(', ')}. Añádela en los datos del piso para deducir la amortización.</p>` : ''}
      <p class="foot-note">
        ${esIS
          ? 'Amortización del inmueble al 2 % (tabla oficial, edificios de viviendas) y mobiliario al 10 %. Comprueba si la sociedad puede aplicar tipo reducido; las entidades patrimoniales tributan al tipo general.'
          : 'Amortización al 3 % de la base amortizable de la construcción indicada en cada piso (el mayor entre coste y valor catastral, sin suelo). Intereses + reparación limitados a los ingresos de cada inmueble. La reducción solo se aplica a rendimientos positivos de alquiler de vivienda habitual (no turístico). No incluye la imputación de rentas por los días que el piso estuvo vacío.'}
      </p>
    </section>`;
}
