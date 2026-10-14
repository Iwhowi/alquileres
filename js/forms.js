// Formularios (diálogos) de alta y edición de todas las entidades.
import {
  html, raw, abrirDialogo, cerrarDialogo, campo, inp, money, dec, mesSel, sel, chk, confirmar, toast, fmtEUR, fmtFecha, fmtMes,
} from './ui.js';
import {
  app, today, commit, piso, contrato, unidad, unidadesDe, turisticos, titular, nombreUnidad,
} from './state.js';
import { uid, nuevoPiso, unidadesPara, reajustarRecibos, reajustarUnidad, sincronizar, regenerarRecurrente } from './store.js';
import {
  num, r2, addDays, ymOf, diffDays, solapes, CAT, MODALIDADES, hipotecaBase, hipotecaMes, cuotaFrancesa, addMonths, monthsDiff,
  addMonthsISO, rentaDelMes, esperadoReserva,
} from './calc.js';
import { opcionesCategoria, opcionesPiso } from './views/gastos.js';

function error(form, msg) {
  let el = form.querySelector('.form-error');
  if (!el) {
    el = document.createElement('p');
    el.className = 'form-error';
    el.setAttribute('role', 'alert');
    form.querySelector('.dlg-body').prepend(el);
  }
  el.textContent = msg;
  el.scrollIntoView({ block: 'nearest' });
  return false;
}

const borrar = (accion) => html`<button type="button" class="btn btn-ghost btn-danger-text" data-dlg-action="${accion}">Eliminar</button>`;

function onDlg(form, accion, fn) {
  form.querySelector(`[data-dlg-action="${accion}"]`)?.addEventListener('click', fn);
}

/* ───────────── Cobros ───────────── */

/** Historial de pagos tras editar a mano lo cobrado: un aumento se apunta como pago nuevo con `fecha`. */
function ajustarPagos(obj, cobrado, fecha) {
  const antes = num(obj.cobrado);
  const pagos = obj.pagos?.length ? obj.pagos : antes > 0 ? [{ fecha: obj.fechaCobro || fecha, importe: antes }] : [];
  if (cobrado <= 0) return [];
  if (Math.abs(cobrado - antes) < 0.005) return pagos;
  if (cobrado > antes) return [...pagos, { fecha, importe: r2(cobrado - antes) }];
  return [{ fecha, importe: cobrado }];
}

function refCobro(tipo, id) {
  return tipo === 'reserva' ? app.s.reservas.find((r) => r.id === id) : app.s.cobros.find((c) => c.id === id);
}

export function cobrar(tipo, id) {
  const ref = refCobro(tipo, id);
  if (!ref) return;
  const total = tipo === 'reserva' ? esperadoReserva(ref) : num(ref.importe);
  const pendiente = r2(total - num(ref.cobrado));
  abrirDialogo({
    titulo: 'Registrar cobro',
    textoOk: 'Marcar cobrado',
    cuerpo: html`
      <p class="muted">${tipo === 'reserva' ? ref.huesped : contrato(ref.contratoId)?.inquilino || ref.pagador || ''} · ${tipo === 'reserva' ? `Estancia del ${fmtFecha(ref.entrada, { corto: true })}` : ref.concepto} · ${tipo === 'reserva' && ref.comisionDescontada ? `neto a recibir ${fmtEUR(total)}` : `total ${fmtEUR(total)}`}${num(ref.cobrado) ? ` · ya cobrado ${fmtEUR(ref.cobrado)}` : ''}</p>
      <div class="form-grid">
        ${campo('Cantidad recibida', money('cantidad', pendiente, { req: true }), { ayuda: 'Si es un pago parcial, el resto seguirá pendiente.' })}
        ${campo('Fecha de cobro', inp('fecha', today(), { type: 'date', req: true }))}
      </div>`,
    submit: (d, form) => {
      const c = num(d.cantidad);
      if (!(c > 0)) return error(form, 'Indica la cantidad recibida.');
      const antes = num(ref.cobrado);
      ref.cobrado = r2(Math.min(total, antes + c));
      ref.pagos = [...(ref.pagos || (antes > 0 ? [{ fecha: ref.fechaCobro || d.fecha, importe: antes }] : [])), { fecha: d.fecha, importe: r2(ref.cobrado - antes) }];
      ref.fechaCobro = d.fecha;
      commit(ref.cobrado >= total - 0.005 ? 'Cobro registrado' : `Cobro parcial registrado · faltan ${fmtEUR(total - ref.cobrado)}`);
    },
  });
}

export function descobrar(tipo, id) {
  const ref = refCobro(tipo, id);
  if (!ref) return;
  const prev = { cobrado: ref.cobrado, fechaCobro: ref.fechaCobro, pagos: ref.pagos };
  ref.cobrado = 0;
  ref.fechaCobro = '';
  ref.pagos = [];
  commit('Marcado como no cobrado', { accion: { texto: 'Deshacer', fn: () => { Object.assign(ref, prev); commit(); } } });
}

function opcionesUnidades(soloPisoId) {
  return app.s.pisos
    .filter((p) => !soloPisoId || p.id === soloPisoId)
    .map((p) => ({ grupo: p.nombre, items: unidadesDe(p.id).map((u) => ({ v: u.id, t: nombreUnidad(p, u) })) }));
}

export function formCobro(id) {
  const c = id ? app.s.cobros.find((x) => x.id === id) : null;
  const k = c?.contratoId ? contrato(c.contratoId) : null;
  const v = c || { unidadId: '', periodo: ymOf(today()), vencimiento: today(), importe: 0, cobrado: 0, concepto: '', pagador: '', telefono: '' };
  const form = abrirDialogo({
    titulo: c ? 'Editar cobro' : 'Cobro manual',
    cuerpo: html`
      ${k ? html`<p class="muted">Recibo del contrato de <b>${k.inquilino}</b>. Si cambias el importe, este recibo dejará de ajustarse automáticamente con el contrato.</p>` : ''}
      <div class="form-grid">
        ${k ? '' : campo('Piso / habitación', sel('unidadId', opcionesUnidades(), v.unidadId, { req: true }), { clase: 'span2' })}
        ${k ? '' : campo('Pagador', inp('pagador', v.pagador, { req: true, ph: 'Nombre' }))}
        ${k ? '' : campo('Teléfono', inp('telefono', v.telefono, { type: 'tel', ph: '600 000 000' }))}
        ${campo('Concepto', inp('concepto', v.concepto, { req: true, ph: 'Ej.: suministros de marzo' }), { clase: 'span2' })}
        ${campo('Importe', money('importe', v.importe, { req: true }))}
        ${campo('Mes al que corresponde', mesSel('periodo', v.periodo, { req: true }))}
        ${campo('Vencimiento', inp('vencimiento', v.vencimiento, { type: 'date', req: true }))}
        ${campo('Cobrado hasta ahora', money('cobrado', v.cobrado, { cero: true }))}
        ${campo('Fecha de cobro', inp('fechaCobro', v.fechaCobro || '', { type: 'date' }))}
      </div>`,
    extra: c ? borrar('borrar') : '',
    submit: (d, f) => {
      const importe = r2(num(d.importe));
      if (!(importe > 0)) return error(f, 'El importe debe ser mayor que cero.');
      const obj = c || { id: uid(), auto: false };
      if (!k) {
        const u = unidad(d.unidadId);
        if (!u) return error(f, 'Elige el piso o la habitación.');
        Object.assign(obj, { unidadId: u.id, pisoId: u.pisoId, pagador: d.pagador, telefono: d.telefono });
      }
      if (c && c.auto && (importe !== c.importe || d.vencimiento !== c.vencimiento)) obj.editado = true;
      const cobrado = Math.min(importe, r2(num(d.cobrado)));
      const fechaCobro = cobrado > 0 ? d.fechaCobro || today() : '';
      obj.pagos = ajustarPagos(obj, cobrado, fechaCobro);
      Object.assign(obj, { concepto: d.concepto, importe, periodo: d.periodo, vencimiento: d.vencimiento, cobrado, fechaCobro });
      if (!c) app.s.cobros.push(obj);
      commit(c ? 'Cobro actualizado' : 'Cobro añadido');
    },
  });
  onDlg(form, 'borrar', async () => {
    if (!(await confirmar('Eliminar cobro', c.auto ? 'Este recibo se generó desde el contrato. Se anulará y no volverá a crearse.' : 'Se eliminará este cobro.'))) return;
    cerrarDialogo();
    if (c.auto) c.anulado = true;
    else app.s.cobros = app.s.cobros.filter((x) => x !== c);
    commit('Cobro eliminado');
  });
}

/* ───────────── Contratos ───────────── */

export function formContrato(id, { pisoId, unidadId, base } = {}) {
  const k = id ? contrato(id) : null;
  const v = k || base || { unidadId, inquilino: '', telefono: '', email: '', dni: '', renta: 0, diaPago: 5, inicio: today(), fin: '', fianza: 0, prorratear: true, notas: '' };
  const pId = k?.pisoId || pisoId || unidad(v.unidadId)?.pisoId;
  const p = piso(pId);
  const habit = p?.modalidad === 'habitaciones';
  const form = abrirDialogo({
    titulo: k ? 'Editar contrato' : base ? 'Renovar contrato' : 'Nuevo contrato',
    cuerpo: html`
      <div class="form-grid">
        ${habit ? campo('Habitación', sel('unidadId', opcionesUnidades(pId), v.unidadId, { req: true }), { clase: 'span2' }) : html`<input type="hidden" name="unidadId" value="${v.unidadId || unidadesDe(pId)[0]?.id}">`}
        ${campo('Inquilino', inp('inquilino', v.inquilino, { req: true, ph: 'Nombre y apellidos' }), { clase: 'span2' })}
        ${campo('Teléfono (WhatsApp)', inp('telefono', v.telefono, { type: 'tel', ph: '600 000 000' }))}
        ${campo('Email', inp('email', v.email, { type: 'email' }))}
        ${campo('DNI / NIE', inp('dni', v.dni))}
        ${campo('Fianza', money('fianza', v.fianza))}
        ${campo((v.rentas || []).length && k ? 'Renta inicial' : 'Renta mensual', money('renta', v.renta, { req: true }), { ayuda: (v.rentas || []).length && k ? `Actual: ${fmtEUR(rentaDelMes(v, ymOf(today())))}. Las subidas se gestionan con «Actualizar renta».` : '' })}
        ${campo('Día de pago', inp('diaPago', v.diaPago, { type: 'number', min: 1, max: 31, req: true }), { ayuda: 'Si el mes tiene menos días, vence el último.' })}
        ${campo('Inicio', inp('inicio', v.inicio, { type: 'date', req: true }))}
        ${campo('Fin', inp('fin', v.fin, { type: 'date' }), { ayuda: 'Vacío si no tiene fecha de fin.' })}
        <div class="span2">${chk('prorratear', v.prorratear !== false, 'Prorratear la renta del primer y último mes por días')}</div>
        ${campo('Notas', raw(`<textarea name="notas" rows="2">${String(html`${v.notas || ''}`)}</textarea>`), { clase: 'span2' })}
      </div>`,
    extra: k ? borrar('borrar') : '',
    submit: (d, f) => {
      const renta = r2(num(d.renta));
      if (!(renta > 0)) return error(f, 'Indica la renta mensual.');
      if (d.fin && d.fin < d.inicio) return error(f, 'La fecha de fin es anterior a la de inicio.');
      const u = unidad(d.unidadId);
      if (!u) return error(f, 'Elige la habitación.');
      const choca = app.s.contratos.find((o) => o.id !== k?.id && o.unidadId === u.id && o.inicio <= (d.fin || '9999-12-31') && d.inicio <= (o.fin || '9999-12-31'));
      if (choca) return error(f, `Se solapa con el contrato de ${choca.inquilino} (${fmtFecha(choca.inicio, { corto: true })} – ${choca.fin ? fmtFecha(choca.fin, { corto: true }) : 'indefinido'}). Ajusta las fechas o finaliza ese contrato.`);
      const obj = k || { id: uid(), avisosHechos: [], finalizado: false };
      const finCambia = k && k.fin !== d.fin;
      Object.assign(obj, {
        pisoId: u.pisoId, unidadId: u.id, inquilino: d.inquilino, telefono: d.telefono, email: d.email, dni: d.dni,
        renta, diaPago: Math.min(31, Math.max(1, num(d.diaPago) | 0)), inicio: d.inicio, fin: d.fin, fianza: r2(num(d.fianza)),
        prorratear: d.prorratear, notas: d.notas,
      });
      if (finCambia) { obj.avisosHechos = []; obj.finalizado = false; }
      if (!k) app.s.contratos.push(obj);
      if (base?.desdeId) {
        const anterior = contrato(base.desdeId);
        if (anterior) anterior.avisosHechos = [0, ...(app.s.ajustes.tramos || [90, 60, 30])];
      }
      reajustarUnidad(app.s, obj, today());
      commit(k ? 'Contrato actualizado' : 'Contrato creado · recibos generados');
    },
  });
  onDlg(form, 'borrar', async () => {
    const cobrados = app.s.cobros.filter((c) => c.contratoId === k.id && num(c.cobrado) > 0).length;
    if (!(await confirmar('Eliminar contrato', `Se eliminará el contrato de ${k.inquilino} y sus recibos sin cobrar.${cobrados ? ` Los ${cobrados} recibos ya cobrados se conservan como historial.` : ''} Si el inquilino simplemente se ha ido, usa «Finalizar».`))) return;
    cerrarDialogo();
    app.s.cobros = app.s.cobros.filter((c) => c.contratoId !== k.id || num(c.cobrado) > 0);
    for (const c of app.s.cobros) if (c.contratoId === k.id) { c.pagador = k.inquilino; c.telefono = k.telefono; c.contratoId = null; c.auto = false; }
    app.s.contratos = app.s.contratos.filter((x) => x !== k);
    sincronizar(app.s, today());
    commit('Contrato eliminado');
  });
}

export function renovar(id) {
  const k = contrato(id);
  if (!k) return;
  if (!k.fin) {
    actualizarRenta(id);
    return;
  }
  const inicio = addDays(k.fin, 1);
  // Misma duración en meses que el contrato anterior (1 año si no es un número de meses exacto).
  const sigue = addDays(k.fin, 1);
  const meses = sigue.slice(8) === k.inicio.slice(8) ? Math.max(1, monthsDiff(ymOf(k.inicio), ymOf(sigue))) : 12;
  const fin = addDays(addMonthsISO(inicio, meses), -1);
  const rentaActual = rentaDelMes(k, ymOf(k.fin));
  abrirDialogo({
    titulo: 'Renovar contrato',
    textoOk: 'Continuar',
    cuerpo: html`
      <p class="muted">Se crea un contrato nuevo para <b>${k.inquilino}</b> a continuación del actual. El historial se conserva.</p>
      <div class="form-grid">
        ${campo('Renta actual', inp('_r', fmtEUR(rentaActual), { attrs: 'readonly' }))}
        ${campo('Actualización (%)', dec('pct', '0'), { ayuda: 'IPC o índice pactado, p. ej. 2,25. Negativo si baja.' })}
      </div>`,
    submit: (d) => {
      const renta = r2(rentaActual * (1 + num(d.pct) / 100));
      setTimeout(() => formContrato(null, { pisoId: k.pisoId, base: { ...k, id: undefined, desdeId: k.id, inicio, fin, renta, rentas: [], avisosHechos: [], finalizado: false } }), 0);
    },
  });
}

/** Actualización de renta (IPC) a partir de un mes, sin tocar los recibos anteriores. */
export function actualizarRenta(id) {
  const k = contrato(id);
  if (!k) return;
  const ym = ymOf(today());
  const actual = rentaDelMes(k, ym);
  const form = abrirDialogo({
    titulo: 'Actualizar renta',
    textoOk: 'Actualizar',
    cuerpo: html`
      <p class="muted">Contrato de <b>${k.inquilino}</b>. Renta actual ${fmtEUR(actual)}. Los recibos anteriores al mes indicado no cambian.</p>
      <div class="form-grid">
        ${campo('Desde el mes', mesSel('desde', addMonths(ym, 1), { req: true }), { clase: 'span2' })}
        ${campo('Actualización (%)', dec('pct', ''), { ayuda: 'Ej.: 2,25' })}
        ${campo('o nueva renta', money('nueva', ''))}
      </div>
      <div class="calc-preview" data-preview></div>
      ${(k.rentas || []).length ? html`<p class="foot-note">Historial: ${k.rentas.map((r) => `${fmtMes(r.desde)}: ${fmtEUR(r.renta)}`).join(' · ')}</p>` : ''}`,
    submit: (d, f) => {
      const nueva = num(d.nueva) > 0 ? r2(num(d.nueva)) : r2(actual * (1 + num(d.pct) / 100));
      if (!(nueva > 0) || (!num(d.nueva) && !num(d.pct))) return error(f, 'Indica el porcentaje o la nueva renta.');
      if (d.desde < ymOf(k.inicio)) return error(f, 'El mes es anterior al inicio del contrato.');
      k.rentas = [...(k.rentas || []).filter((r) => r.desde !== d.desde), { desde: d.desde, renta: nueva }];
      reajustarRecibos(app.s, k, today(), d.desde);
      commit(`Renta actualizada a ${fmtEUR(nueva)} desde ${fmtMes(d.desde).toLowerCase()}`);
    },
  });
  const prev = form.querySelector('[data-preview]');
  form.addEventListener('input', () => {
    const n = num(form.elements.nueva.value) > 0 ? num(form.elements.nueva.value) : actual * (1 + num(form.elements.pct.value) / 100);
    prev.innerHTML = String(html`<span>Nueva renta <b>${fmtEUR(n)}</b></span><span>${n >= actual ? '+' : ''}${fmtEUR(n - actual)}/mes</span>`);
  });
}

export function finalizarContrato(id) {
  const k = contrato(id);
  if (!k) return;
  const def = k.fin && k.fin < today() ? k.fin : today();
  abrirDialogo({
    titulo: 'Finalizar contrato',
    textoOk: 'Finalizar',
    cuerpo: html`
      <p class="muted">El contrato de <b>${k.inquilino}</b> termina en la fecha indicada. Se ajusta el último recibo y se quitan los posteriores sin cobrar.</p>
      <div class="form-grid">${campo('Último día de alquiler', inp('fin', def, { type: 'date', req: true, min: k.inicio }))}</div>`,
    submit: (d, f) => {
      if (d.fin < k.inicio) return error(f, 'No puede ser anterior al inicio del contrato.');
      k.fin = d.fin;
      k.finalizado = true;
      reajustarRecibos(app.s, k, today());
      commit('Contrato finalizado');
    },
  });
}

export function avisoHecho(id, tramo) {
  const k = contrato(id);
  if (!k) return;
  const t = Number(tramo);
  k.avisosHechos = [...new Set([...(k.avisosHechos || []), ...(app.s.ajustes.tramos || []).filter((x) => x >= t), t])];
  commit('Aviso marcado como visto', { accion: { texto: 'Deshacer', fn: () => { k.avisosHechos = k.avisosHechos.filter((x) => x !== t); commit(); } } });
}

/* ───────────── Pisos, unidades y titulares ───────────── */

export function formPiso(id) {
  const p = id ? piso(id) : null;
  const v = p || nuevoPiso({ titularId: app.s.titulares[0]?.id });
  const nHab = p ? unidadesDe(p.id).length : 4;
  const form = abrirDialogo({
    titulo: p ? 'Datos del piso' : 'Nuevo piso',
    ancho: 'wide',
    cuerpo: html`
      <div class="form-grid">
        ${campo('Nombre corto', inp('nombre', v.nombre, { req: true, ph: 'Ej.: Mayor 12' }))}
        ${campo('Titular', sel('titularId', app.s.titulares.map((t) => ({ v: t.id, t: t.nombre })), v.titularId, { req: true }))}
        ${campo('Dirección', inp('direccion', v.direccion), { clase: 'span2' })}
        ${campo('Modalidad', sel('modalidad', Object.entries(MODALIDADES).map(([k, t]) => ({ v: k, t })), v.modalidad, { req: true }))}
        ${p ? campo('Habitaciones / unidades', inp('_n', String(nHab), { attrs: 'readonly' }), { ayuda: 'Se gestionan desde la ficha del piso.' }) : campo('Nº de habitaciones', inp('habitaciones', nHab, { type: 'number', min: 1, max: 20 }), { ayuda: 'Solo si se alquila por habitaciones.' })}
        ${campo('Referencia catastral', inp('refCatastral', v.refCatastral))}
        ${campo('Fecha de adquisición', inp('fechaAdquisicion', v.fechaAdquisicion, { type: 'date' }))}
        ${campo('Precio de adquisición total', money('precioAdquisicion', v.precioAdquisicion), { ayuda: 'Con impuestos, notaría y gastos. Base de la rentabilidad.' })}
        ${campo('Base amortizable de la construcción', money('valorConstruccion', v.valorConstruccion), { ayuda: 'El mayor entre el coste de adquisición de la construcción (precio total × % de construcción del recibo del IBI) y el valor catastral de la construcción. Sin suelo.' })}
        ${campo('Reducción IRPF por vivienda (%)', dec('reduccion', v.reduccion), { ayuda: 'Solo personas físicas y vivienda habitual del inquilino: 60 % contratos anteriores al 26/5/2023; 50 % (hasta 90 % en zona tensionada) en los nuevos. Turístico: 0.' })}
        ${campo('Días arrendado (%)', dec('pctFiscal', v.pctFiscal ?? '', { ph: 'Automático' }), { ayuda: 'Vacío = se calcula cada año con los contratos o las noches reservadas. Prorratea gastos generales y amortización (solo IRPF). Por habitaciones cuenta como arrendado si hay al menos una ocupada.' })}
        ${campo('Exceso pendiente de años anteriores', money('excesoPrevio', v.excesoPrevio), { ayuda: 'Intereses + reparación no deducidos antes de usar la app (casilla de la última renta).' })}
        ${campo('Año de ese exceso', inp('excesoPrevioAnio', v.excesoPrevioAnio, { type: 'number', min: 2015, max: 2100, ph: 'Ej.: 2024' }))}
        ${campo('Notas', raw(`<textarea name="notas" rows="2">${String(html`${v.notas || ''}`)}</textarea>`), { clase: 'span2' })}
      </div>`,
    extra: p ? borrar('borrar') : '',
    submit: (d, f) => {
      const obj = p || nuevoPiso();
      Object.assign(obj, {
        nombre: d.nombre, titularId: d.titularId, direccion: d.direccion, modalidad: d.modalidad, refCatastral: d.refCatastral,
        fechaAdquisicion: d.fechaAdquisicion, precioAdquisicion: r2(num(d.precioAdquisicion)), valorConstruccion: r2(num(d.valorConstruccion)),
        reduccion: Math.min(90, Math.max(0, num(d.reduccion))), pctFiscal: d.pctFiscal === '' ? null : Math.min(100, Math.max(0, num(d.pctFiscal))),
        excesoPrevio: r2(num(d.excesoPrevio)), excesoPrevioAnio: d.excesoPrevioAnio, notas: d.notas,
      });
      if (!p) {
        app.s.pisos.push(obj);
        app.s.unidades.push(...unidadesPara(obj, Math.min(20, Math.max(1, num(d.habitaciones) | 0))));
      }
      commit(p ? 'Piso actualizado' : 'Piso añadido');
      if (!p) location.hash = `#/piso/${obj.id}`;
    },
  });
  onDlg(form, 'borrar', async () => {
    if (!(await confirmar('Eliminar piso', `Se eliminará «${p.nombre}» con todos sus contratos, cobros, reservas, gastos e hipotecas. No se puede deshacer.`))) return;
    cerrarDialogo();
    const s = app.s;
    for (const k of ['unidades', 'contratos', 'cobros', 'reservas', 'gastos', 'recurrentes', 'hipotecas']) s[k] = s[k].filter((x) => x.pisoId !== p.id);
    s.pisos = s.pisos.filter((x) => x !== p);
    location.hash = '#/pisos';
    commit('Piso eliminado');
  });
}

export function formUnidad(id, pisoId) {
  const u = id ? unidad(id) : null;
  const pid = u?.pisoId || pisoId;
  const form = abrirDialogo({
    titulo: u ? 'Habitación' : 'Nueva habitación',
    cuerpo: html`<div class="form-grid">${campo('Nombre', inp('nombre', u?.nombre || `Habitación ${unidadesDe(pid).length + 1}`, { req: true }), { clase: 'span2' })}</div>`,
    extra: u ? borrar('borrar') : '',
    submit: (d) => {
      if (u) u.nombre = d.nombre;
      else app.s.unidades.push({ id: uid(), pisoId: pid, nombre: d.nombre });
      commit();
    },
  });
  onDlg(form, 'borrar', async () => {
    if (app.s.contratos.some((k) => k.unidadId === u.id)) return error(form, 'Tiene contratos. Elimínalos antes de quitar la habitación.');
    if (unidadesDe(pid).length <= 1) return error(form, 'El piso debe tener al menos una unidad.');
    if (!(await confirmar('Eliminar habitación', `Se eliminará «${u.nombre}».`))) return;
    cerrarDialogo();
    app.s.unidades = app.s.unidades.filter((x) => x !== u);
    commit('Habitación eliminada');
  });
}

export function formTitular(id) {
  const t = id ? titular(id) : null;
  const v = t || { nombre: '', nif: '', tipo: 'persona', tipoEstimado: 30 };
  const form = abrirDialogo({
    titulo: t ? 'Titular' : 'Nuevo titular',
    cuerpo: html`
      <div class="form-grid">
        ${campo('Nombre', inp('nombre', v.nombre, { req: true }), { clase: 'span2' })}
        ${campo('NIF / CIF', inp('nif', v.nif))}
        ${campo('Tipo', sel('tipo', [{ v: 'persona', t: 'Persona física (IRPF)' }, { v: 'sociedad', t: 'Sociedad (IS)' }], v.tipo))}
        ${campo('Tipo impositivo estimado (%)', dec('tipoEstimado', v.tipoEstimado), { clase: 'span2', ayuda: 'IRPF: tu tipo marginal aproximado. IS: 25 % general (las entidades patrimoniales no aplican los tipos reducidos).' })}
      </div>`,
    extra: t ? borrar('borrar') : '',
    submit: (d) => {
      const obj = t || { id: uid() };
      Object.assign(obj, { nombre: d.nombre, nif: d.nif, tipo: d.tipo, tipoEstimado: num(d.tipoEstimado) });
      if (!t) app.s.titulares.push(obj);
      commit('Titular guardado');
    },
  });
  onDlg(form, 'borrar', async () => {
    if (app.s.pisos.some((p) => p.titularId === t.id)) return error(form, 'Tiene pisos asignados. Cámbialos de titular antes de eliminarlo.');
    if (!(await confirmar('Eliminar titular', `Se eliminará «${t.nombre}».`))) return;
    cerrarDialogo();
    app.s.titulares = app.s.titulares.filter((x) => x !== t);
    commit('Titular eliminado');
  });
}

/* ───────────── Gastos ───────────── */

export function formGasto(id, pisoId) {
  const g = id ? app.s.gastos.find((x) => x.id === id) : null;
  const v = g || { fecha: today(), pisoId: pisoId || app.ui.ultimoPiso || app.s.pisos[0]?.id, categoria: app.ui.ultimaCat || 'reparacion', concepto: '', proveedor: '', importe: 0, extraordinario: false, deducible: true };
  const form = abrirDialogo({
    titulo: g ? 'Editar gasto' : 'Nuevo gasto',
    cuerpo: html`
      ${g?.recurrenteId ? html`<p class="muted">Generado por un gasto fijo. Los cambios afectan solo a este apunte.</p>` : ''}
      <div class="form-grid">
        ${campo('Fecha', inp('fecha', v.fecha, { type: 'date', req: true }))}
        ${campo('Importe', money('importe', v.importe, { req: true }))}
        ${campo('Piso', sel('pisoId', opcionesPiso(), v.pisoId, { req: true }), { clase: 'span2' })}
        ${campo('Categoría', sel('categoria', opcionesCategoria(), v.categoria, { req: true }), { clase: 'span2', ayuda: 'Las reparaciones mantienen el inmueble y se deducen en el año; las mejoras y el mobiliario se amortizan.' })}
        ${campo('Concepto', inp('concepto', v.concepto, { ph: 'Ej.: cambio de cerradura' }))}
        ${campo('Proveedor', inp('proveedor', v.proveedor))}
        <div class="span2 checks">
          ${chk('extraordinario', v.extraordinario, 'Gasto extraordinario (no recurrente)')}
          ${chk('deducible', v.deducible !== false, 'Tengo factura y es deducible')}
        </div>
      </div>`,
    extra: g ? borrar('borrar') : '',
    submit: (d, f) => {
      const importe = r2(num(d.importe));
      if (!(importe > 0)) return error(f, 'Indica el importe.');
      const obj = g || { id: uid() };
      Object.assign(obj, { fecha: d.fecha, importe, pisoId: d.pisoId, categoria: d.categoria, concepto: d.concepto, proveedor: d.proveedor, extraordinario: d.extraordinario, deducible: d.deducible });
      if (g?.recurrenteId) obj.editado = true;
      if (!g) app.s.gastos.push(obj);
      app.ui.ultimoPiso = d.pisoId;
      app.ui.ultimaCat = d.categoria;
      commit(g ? 'Gasto actualizado' : 'Gasto añadido');
    },
  });
  onDlg(form, 'borrar', async () => {
    if (!(await confirmar('Eliminar gasto', `${g.concepto || CAT[g.categoria]?.nombre} · ${fmtEUR(g.importe)}`))) return;
    cerrarDialogo();
    eliminarGasto(g);
  });
}

export function eliminarGasto(g) {
  const rec = g.recurrenteId ? app.s.recurrentes.find((r) => r.id === g.recurrenteId) : null;
  if (rec) rec.omitidos = [...new Set([...(rec.omitidos || []), g.periodo])];
  app.s.gastos = app.s.gastos.filter((x) => x !== g);
  commit('Gasto eliminado', {
    accion: { texto: 'Deshacer', fn: () => { app.s.gastos.push(g); if (rec) rec.omitidos = rec.omitidos.filter((p) => p !== g.periodo); commit(); } },
  });
}

export function gastoRapido(d) {
  const importe = r2(num(d.importe));
  if (!(importe > 0)) return toast('Indica el importe.', { tipo: 'error' });
  app.s.gastos.push({ id: uid(), fecha: d.fecha || today(), pisoId: d.pisoId, categoria: d.categoria, concepto: d.concepto, proveedor: '', importe, extraordinario: !!d.extraordinario, deducible: true });
  app.ui.ultimoPiso = d.pisoId;
  app.ui.ultimaCat = d.categoria;
  commit(`Gasto de ${fmtEUR(importe)} añadido a ${piso(d.pisoId)?.nombre}`);
}

export function formRecurrente(id, pisoId) {
  const r = id ? app.s.recurrentes.find((x) => x.id === id) : null;
  const v = r || { pisoId, categoria: 'comunidad', concepto: '', importe: 0, cadaMeses: 1, dia: 1, desde: `${ymOf(today())}-01`, hasta: '', deducible: true };
  const form = abrirDialogo({
    titulo: r ? 'Gasto fijo' : 'Nuevo gasto fijo',
    cuerpo: html`
      <div class="form-grid">
        ${campo('Piso', sel('pisoId', opcionesPiso(), v.pisoId, { req: true }), { clase: 'span2' })}
        ${campo('Categoría', sel('categoria', opcionesCategoria(), v.categoria, { req: true }))}
        ${campo('Concepto', inp('concepto', v.concepto, { req: true, ph: 'Ej.: cuota de comunidad' }))}
        ${campo('Importe', money('importe', v.importe, { req: true }))}
        ${campo('Periodicidad', sel('cadaMeses', [[1, 'Mensual'], [2, 'Bimestral'], [3, 'Trimestral'], [6, 'Semestral'], [12, 'Anual']].map(([a, b]) => ({ v: a, t: b })), v.cadaMeses))}
        ${campo('Primer cargo', inp('desde', v.desde, { type: 'date', req: true }), { ayuda: 'Fija el día y, si no es mensual, los meses de los siguientes cargos.' })}
        ${campo('Hasta (opcional)', inp('hasta', v.hasta, { type: 'date' }))}
        <div class="span2">${chk('deducible', v.deducible !== false, 'Deducible')}</div>
      </div>
      <p class="foot-note">Se apunta automáticamente un gasto en cada cargo hasta hoy. Cambiar el importe solo afecta a los próximos; cambiar las fechas rehace los apuntes que no hayas editado a mano.</p>`,
    extra: r ? borrar('borrar') : '',
    submit: (d, f) => {
      const importe = r2(num(d.importe));
      if (!(importe > 0)) return error(f, 'Indica el importe.');
      if (d.hasta && d.hasta < d.desde) return error(f, '«Hasta» es anterior al primer cargo.');
      const obj = r || { id: uid(), omitidos: [] };
      const dia = Number(d.desde.slice(8, 10));
      const calendarioCambia = r && (r.desde !== d.desde || Number(r.cadaMeses) !== Number(d.cadaMeses) || r.hasta !== d.hasta || r.pisoId !== d.pisoId || r.dia !== dia);
      Object.assign(obj, { pisoId: d.pisoId, categoria: d.categoria, concepto: d.concepto, importe, cadaMeses: Number(d.cadaMeses), dia, desde: d.desde, hasta: d.hasta, deducible: d.deducible });
      if (!r) app.s.recurrentes.push(obj);
      const n = calendarioCambia ? regenerarRecurrente(app.s, obj, today()) : sincronizar(app.s, today());
      commit(n ? `Gasto fijo guardado · ${n} apuntes generados` : 'Gasto fijo guardado');
    },
  });
  onDlg(form, 'borrar', async () => {
    const n = app.s.gastos.filter((g) => g.recurrenteId === r.id).length;
    if (!(await confirmar('Eliminar gasto fijo', `Dejará de apuntarse. Los ${n} apuntes ya generados se conservan.`))) return;
    cerrarDialogo();
    for (const g of app.s.gastos) if (g.recurrenteId === r.id) g.recurrenteId = null;
    app.s.recurrentes = app.s.recurrentes.filter((x) => x !== r);
    commit('Gasto fijo eliminado');
  });
}

/* ───────────── Hipotecas ───────────── */

export function formHipoteca(id, pisoId) {
  const h = id ? app.s.hipotecas.find((x) => x.id === id) : null;
  const ym = ymOf(today());
  const v = h || { pisoId, entidad: '', capitalPendiente: 0, mesRef: ym, tipo: 3, mesFin: addMonths(ym, 239), cuota: 0, mesInicio: '', notas: '' };
  const form = abrirDialogo({
    titulo: h ? 'Hipoteca' : 'Nueva hipoteca',
    cuerpo: html`
      <p class="muted">Copia los datos del último recibo del banco. Si el tipo cambia (revisión del variable), actualiza el capital pendiente, el mes y el tipo.</p>
      <div class="form-grid">
        ${campo('Entidad', inp('entidad', v.entidad, { ph: 'Banco' }))}
        ${campo('Tipo de interés nominal (%)', dec('tipo', v.tipo, { req: true }), { ayuda: 'TIN, no TAE. Ej.: 2,95' })}
        ${campo('Capital pendiente', money('capitalPendiente', v.capitalPendiente, { req: true }), { ayuda: 'Antes de pagar la cuota del mes indicado.' })}
        ${campo('Mes de referencia', mesSel('mesRef', v.mesRef, { req: true }))}
        ${campo('Última cuota', mesSel('mesFin', v.mesFin, { req: true, anios: Array.from({ length: 46 }, (_, i) => new Date().getFullYear() + i) }))}
        ${campo('Cuota mensual (opcional)', money('cuota', v.cuota), { ayuda: 'Vacío = se calcula (sistema francés).' })}
        ${campo('Primera cuota de la hipoteca', mesSel('mesInicio', v.mesInicio, { vacio: true }), { clase: 'span2', ayuda: 'Opcional. Si la indicas, se reconstruyen las cuotas anteriores al mes de referencia (para el histórico y la renta de años pasados). Si no, solo se cuentan desde el mes de referencia.' })}
      </div>
      <div class="calc-preview" data-preview></div>`,
    extra: h ? borrar('borrar') : '',
    submit: (d, f) => {
      if (d.mesFin < d.mesRef) return error(f, 'La última cuota es anterior al mes de referencia.');
      if (d.mesInicio && d.mesInicio > d.mesRef) return error(f, 'La primera cuota no puede ser posterior al mes de referencia.');
      if (!(num(d.capitalPendiente) > 0)) return error(f, 'Indica el capital pendiente.');
      if (!/^\s*\d+([.,]\d+)?\s*%?\s*$/.test(d.tipo)) return error(f, 'El tipo de interés debe ser un número, p. ej. 2,95.');
      const obj = h || { id: uid(), pisoId };
      Object.assign(obj, { entidad: d.entidad, tipo: num(d.tipo), capitalPendiente: r2(num(d.capitalPendiente)), mesRef: d.mesRef, mesFin: d.mesFin, cuota: r2(num(d.cuota)), mesInicio: d.mesInicio });
      const cuota = hipotecaBase(obj).cuota;
      const int1 = num(obj.capitalPendiente) * (obj.tipo / 1200);
      if (cuota <= int1) return error(f, `Con esa cuota (${fmtEUR(cuota)}) no se cubren ni los intereses (${fmtEUR(int1)}). Revisa los datos.`);
      if (!h) app.s.hipotecas.push(obj);
      commit('Hipoteca guardada');
    },
  });
  const prev = form.querySelector('[data-preview]');
  const upd = () => {
    const el = form.elements;
    const mes = (k) => (el[`${k}__y`].value && el[`${k}__m`].value ? `${el[`${k}__y`].value}-${el[`${k}__m`].value}` : ym);
    const n = monthsDiff(mes('mesRef'), mes('mesFin')) + 1;
    const cap = num(el.capitalPendiente.value);
    if (!(cap > 0) || n <= 0) { prev.textContent = ''; return; }
    const cuota = num(el.cuota.value) > 0 ? num(el.cuota.value) : cuotaFrancesa(cap, num(el.tipo.value), n);
    const int = cap * (num(el.tipo.value) / 1200);
    prev.innerHTML = String(html`<span>Cuota <b>${fmtEUR(cuota)}</b></span><span>Intereses del primer mes <b>${fmtEUR(int)}</b></span><span>${n} cuotas</span>`);
  };
  form.addEventListener('input', upd);
  upd();
  onDlg(form, 'borrar', async () => {
    if (!(await confirmar('Eliminar hipoteca', 'Dejará de descontarse del cash-flow y de deducirse sus intereses.'))) return;
    cerrarDialogo();
    app.s.hipotecas = app.s.hipotecas.filter((x) => x !== h);
    commit('Hipoteca eliminada');
  });
}

/* ───────────── Reservas ───────────── */

export function formReserva(id, { pisoId, fecha } = {}) {
  const r = id ? app.s.reservas.find((x) => x.id === id) : null;
  const ts = turisticos();
  const entrada = fecha || today();
  const v = r || { pisoId: pisoId || ts[0]?.id, huesped: '', telefono: '', canal: 'Airbnb', entrada, salida: addDays(entrada, 2), huespedes: 2, importe: 0, comision: 0, comisionDescontada: true, cobrado: 0, fechaCobro: '', vencimiento: '', notas: '' };
  const pagada = r ? num(r.cobrado) >= esperadoReserva(r) - 0.005 && num(r.importe) > 0 : false;
  const form = abrirDialogo({
    titulo: r ? 'Reserva' : 'Nueva reserva',
    cuerpo: html`
      <div class="form-grid">
        ${ts.length > 1 ? campo('Piso', sel('pisoId', ts.map((p) => ({ v: p.id, t: p.nombre })), v.pisoId, { req: true }), { clase: 'span2' }) : html`<input type="hidden" name="pisoId" value="${v.pisoId}">`}
        ${campo('Huésped', inp('huesped', v.huesped, { req: true }))}
        ${campo('Teléfono', inp('telefono', v.telefono, { type: 'tel' }))}
        ${campo('Entrada', inp('entrada', v.entrada, { type: 'date', req: true }))}
        ${campo('Salida', inp('salida', v.salida, { type: 'date', req: true }))}
        ${campo('Canal', sel('canal', ['Airbnb', 'Booking', 'Directo', 'Otro'].map((c) => ({ v: c, t: c })), v.canal))}
        ${campo('Huéspedes', inp('huespedes', v.huespedes, { type: 'number', min: 1, max: 20 }))}
        ${campo('Importe total', money('importe', v.importe, { req: true }), { ayuda: 'Lo que paga el huésped, con limpieza.' })}
        ${campo('Comisión plataforma', money('comision', v.comision), { ayuda: 'Gasto deducible.' })}
        <div class="span2">${chk('comisionDescontada', !!v.comisionDescontada, 'La plataforma me paga ya descontada la comisión')}</div>
        ${campo('Cobrado', money('cobrado', v.cobrado, { cero: true }), { ayuda: pagada ? 'Cobrada por completo.' : 'Lo que ya ha llegado a tu cuenta.' })}
        ${campo('Fecha prevista de cobro', inp('vencimiento', v.vencimiento || '', { type: 'date' }), { ayuda: 'Vacío = estimada: Airbnb 3 días tras la entrada, Booking 10 tras la salida, directo el día de entrada.' })}
        ${campo('Notas', raw(`<textarea name="notas" rows="2">${String(html`${v.notas || ''}`)}</textarea>`), { clase: 'span2' })}
        ${r ? html`<div class="span2">${chk('cancelada', !!v.cancelada, 'Reserva cancelada (libera el calendario; lo cobrado y no devuelto cuenta como ingreso)')}</div>` : ''}
      </div>
      <div class="calc-preview" data-preview></div>`,
    extra: html`${r ? borrar('borrar') : ''}<button type="button" class="btn btn-ghost" data-dlg-action="pagada">Marcar cobrada</button>`,
    submit: (d, f) => {
      if (!(d.salida > d.entrada)) return error(f, 'La salida debe ser posterior a la entrada.');
      const importe = r2(num(d.importe));
      if (!(importe > 0)) return error(f, 'Indica el importe total.');
      const choques = d.cancelada ? [] : solapes(app.s.reservas.filter((x) => x.pisoId === d.pisoId), d.entrada, d.salida, r?.id);
      if (choques.length) return error(f, `Se solapa con la reserva de ${choques[0].huesped} (${fmtFecha(choques[0].entrada, { corto: true })} → ${fmtFecha(choques[0].salida, { corto: true })}).`);
      const obj = r || { id: uid(), cancelada: false };
      const comision = r2(num(d.comision));
      if (comision >= importe) return error(f, 'La comisión no puede ser mayor que el importe.');
      const esperado = d.comisionDescontada ? importe - comision : importe;
      const cobrado = Math.min(r2(esperado), r2(num(d.cobrado)));
      obj.pagos = ajustarPagos(obj, cobrado, today());
      Object.assign(obj, {
        pisoId: d.pisoId, huesped: d.huesped, telefono: d.telefono, entrada: d.entrada, salida: d.salida, canal: d.canal,
        huespedes: num(d.huespedes) | 0, importe, comision, comisionDescontada: d.comisionDescontada, cobrado, vencimiento: d.vencimiento,
        fechaCobro: cobrado > 0 ? obj.fechaCobro || today() : '', notas: d.notas, cancelada: d.cancelada,
      });
      if (!r) app.s.reservas.push(obj);
      app.ui.cal.mes = ymOf(obj.entrada) > app.ui.cal.mes || ymOf(obj.salida) < app.ui.cal.mes ? ymOf(obj.entrada) : app.ui.cal.mes;
      commit(r ? 'Reserva actualizada' : 'Reserva creada');
    },
  });
  const prev = form.querySelector('[data-preview]');
  const upd = () => {
    const el = form.elements;
    const n = el.entrada.value && el.salida.value ? diffDays(el.entrada.value, el.salida.value) : 0;
    const imp = num(el.importe.value);
    prev.innerHTML = n > 0 ? String(html`<span><b>${n}</b> ${n === 1 ? 'noche' : 'noches'}</span><span>${fmtEUR(imp / n)}/noche</span><span>Neto <b>${fmtEUR(imp - num(el.comision.value))}</b></span>`) : '';
  };
  form.addEventListener('input', upd);
  upd();
  onDlg(form, 'pagada', () => {
    const el = form.elements;
    const neto = num(el.importe.value) - (el.comisionDescontada.checked ? num(el.comision.value) : 0);
    el.cobrado.value = String(r2(neto)).replace('.', ',');
    upd();
  });
  // Canal directo: normalmente sin comisión descontada.
  form.elements.canal.addEventListener('change', (e) => { if (!r) form.elements.comisionDescontada.checked = e.target.value === 'Airbnb' || e.target.value === 'Booking'; });
  onDlg(form, 'borrar', async () => {
    if (!(await confirmar('Eliminar reserva', `${r.huesped} · ${fmtFecha(r.entrada, { corto: true })} → ${fmtFecha(r.salida, { corto: true })}`))) return;
    cerrarDialogo();
    app.s.reservas = app.s.reservas.filter((x) => x !== r);
    commit('Reserva eliminada', { accion: { texto: 'Deshacer', fn: () => { app.s.reservas.push(r); commit(); } } });
  });
}

export { cerrarDialogo, fmtMes, hipotecaMes };
