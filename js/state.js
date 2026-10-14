// Contexto compartido por las vistas: estado, guardado y selectores.
import { guardar, finEfectivo } from './store.js';
import {
  todayISO, ymOf, estadoCobro, esperadoReserva, diffDays, tramoContrato, resultadoPiso, sumar, MODALIDADES, num, addDays,
} from './calc.js';
import { toast, fmtFecha, fmtEUR } from './ui.js';

export const app = {
  s: null,
  ui: {
    mes: ymOf(todayISO()),
    incluirExtra: true,
    cobros: { estado: 'abiertos', piso: '', mes: '' },
    gastos: { piso: '', anio: todayISO().slice(0, 4), mes: '', cat: '', q: '' },
    cal: { piso: '', mes: ymOf(todayISO()) },
    fiscal: { anio: String(Number(todayISO().slice(0, 4)) - (Number(todayISO().slice(5, 7)) <= 6 ? 1 : 0)) },
  },
  render: () => {},
};

export const today = () => todayISO();

/** Guarda y vuelve a pintar. */
export function commit(msg, opts) {
  try {
    guardar(app.s);
  } catch (e) {
    console.error(e);
    toast('No se ha podido guardar en este dispositivo. Exporta una copia de seguridad.', { tipo: 'error', ms: 8000 });
  }
  app.render();
  if (msg) toast(msg, opts);
}

/* ───────────── Selectores ───────────── */

export const piso = (id) => app.s.pisos.find((p) => p.id === id);
export const titular = (id) => app.s.titulares.find((t) => t.id === id);
export const unidad = (id) => app.s.unidades.find((u) => u.id === id);
export const contrato = (id) => app.s.contratos.find((c) => c.id === id);
export const unidadesDe = (pisoId) => app.s.unidades.filter((u) => u.pisoId === pisoId);
export const pisosDe = (titularId) => app.s.pisos.filter((p) => p.titularId === titularId);
export const turisticos = () => app.s.pisos.filter((p) => p.modalidad === 'turistico');
export const regimen = (t) => (t?.tipo === 'sociedad' ? 'IS' : 'IRPF');
export const modalidad = (p) => MODALIDADES[p.modalidad] || p.modalidad;

export function nombreUnidad(p, u) {
  if (!u || p?.modalidad !== 'habitaciones') return p?.nombre || '—';
  return `${p.nombre} · ${u.nombre}`;
}

/** Contrato vigente de una unidad en una fecha. */
export function contratoVigente(unidadId, fecha = today()) {
  return app.s.contratos
    .filter((k) => {
      if (k.unidadId !== unidadId || k.inicio > fecha) return false;
      const fin = finEfectivo(app.s, k, today());
      return !fin || fin >= fecha;
    })
    .sort((a, b) => (a.inicio < b.inicio ? 1 : -1))[0];
}

/** Datos de un piso para los cálculos. */
export function ctxPiso(pisoId) {
  const s = app.s;
  return {
    cobros: s.cobros.filter((c) => c.pisoId === pisoId),
    reservas: s.reservas.filter((r) => r.pisoId === pisoId),
    gastos: s.gastos.filter((g) => g.pisoId === pisoId),
    hipotecas: s.hipotecas.filter((h) => h.pisoId === pisoId),
    contratos: s.contratos.filter((k) => k.pisoId === pisoId).map((k) => ({ ...k, finEfectivo: finEfectivo(s, k, today()) })),
  };
}

export function resultado(pisoId, desde, hasta, opts) {
  return resultadoPiso(ctxPiso(pisoId), desde, hasta, opts);
}

export function resultadoVarios(pisoIds, desde, hasta, opts) {
  return sumar(pisoIds.map((id) => resultado(id, desde, hasta, opts)));
}

/** Inversión total de un conjunto de pisos (precio de adquisición con gastos). */
export const inversion = (pisos) => pisos.reduce((a, p) => a + num(p.precioAdquisicion), 0);

/* ───────────── Cobros normalizados (recibos + reservas) ───────────── */

export function listaCobros() {
  const s = app.s;
  const hoy = today();
  const gracia = num(s.ajustes.gracia);
  const out = [];
  for (const c of s.cobros) {
    if (c.anulado) continue;
    const k = c.contratoId ? contrato(c.contratoId) : null;
    const item = {
      tipo: 'recibo',
      id: c.id,
      pisoId: c.pisoId,
      unidadId: c.unidadId,
      nombre: k?.inquilino || c.pagador || '—',
      telefono: k?.telefono || c.telefono || '',
      concepto: c.concepto,
      periodo: c.periodo,
      importe: num(c.importe),
      cobrado: Math.min(num(c.cobrado), num(c.importe)),
      vencimiento: c.vencimiento,
      fechaCobro: c.fechaCobro,
      pagos: c.pagos,
      ref: c,
    };
    item.estado = estadoCobro(item, hoy, gracia);
    out.push(item);
  }
  for (const r of s.reservas) {
    if (r.cancelada) continue;
    const noches = diffDays(r.entrada, r.salida);
    const item = {
      tipo: 'reserva',
      id: r.id,
      pisoId: r.pisoId,
      unidadId: null,
      nombre: r.huesped || '—',
      telefono: r.telefono || '',
      concepto: `Estancia ${fmtFecha(r.entrada, { corto: true, anio: false })} – ${fmtFecha(r.salida, { corto: true, anio: false })} · ${noches} ${noches === 1 ? 'noche' : 'noches'}${r.canal ? ` · ${r.canal}` : ''}`,
      periodo: ymOf(r.entrada),
      importe: esperadoReserva(r),
      cobrado: Math.min(num(r.cobrado), esperadoReserva(r)),
      vencimiento: r.vencimiento || vencimientoReserva(r),
      fechaCobro: r.fechaCobro,
      pagos: r.pagos,
      plataforma: !!r.comisionDescontada,
      textoMsg: `tu estancia del ${fmtFecha(r.entrada, { anio: false })} al ${fmtFecha(r.salida, { anio: false })}`,
      ref: r,
    };
    // Si paga la plataforma, lo pendiente es su liquidación, no el huésped.
    if (item.plataforma) item.concepto = `Liquidación de ${r.canal || 'la plataforma'} · ${item.concepto}`;
    item.estado = estadoCobro(item, hoy, gracia);
    out.push(item);
  }
  return out.sort((a, b) => (a.vencimiento < b.vencimiento ? 1 : a.vencimiento > b.vencimiento ? -1 : 0));
}

/** Fecha prevista de cobro de una reserva si no se indica: plataformas pagan tras la entrada o la salida. */
export function vencimientoReserva(r) {
  const c = String(r.canal || '').toLowerCase();
  if (c === 'airbnb') return addDays(r.entrada, 3);
  if (c === 'booking') return addDays(r.salida, 10);
  if (c === 'directo' || !c) return r.entrada;
  return r.salida;
}

/* ───────────── Avisos ───────────── */

export function avisos() {
  const s = app.s;
  const hoy = today();
  const cobros = listaCobros();
  const impagos = [];
  const grupos = new Map();
  for (const c of cobros) {
    if (c.estado !== 'impagado') continue;
    const key = `${c.pisoId}|${c.tipo}|${c.nombre.trim().toLowerCase()}|${c.telefono}`;
    if (!grupos.has(key)) grupos.set(key, { key, nombre: c.nombre, telefono: c.telefono, pisoId: c.pisoId, items: [] });
    grupos.get(key).items.push(c);
  }
  for (const g of grupos.values()) {
    g.items.sort((a, b) => (a.vencimiento < b.vencimiento ? -1 : 1));
    g.total = g.items.reduce((a, c) => a + c.importe - c.cobrado, 0);
    g.dias = diffDays(g.items[0].vencimiento, hoy);
    impagos.push(g);
  }
  impagos.sort((a, b) => b.dias - a.dias);

  const hoyVence = cobros.filter((c) => c.estado === 'pendiente' && c.vencimiento === hoy);

  const tramos = s.ajustes.tramos?.length ? s.ajustes.tramos : [90, 60, 30];
  const contratos = [];
  for (const k of s.contratos) {
    if (k.finalizado) continue;
    const t = tramoContrato(k.fin, hoy, tramos);
    if (!t) continue;
    // Si hay un contrato posterior en la misma unidad, no hace falta avisar.
    const sucesor = s.contratos.some((o) => o.id !== k.id && o.unidadId === k.unidadId && o.inicio > k.inicio);
    if (sucesor) continue;
    if ((k.avisosHechos || []).includes(t.tramo)) continue;
    contratos.push({ contrato: k, ...t });
  }
  contratos.sort((a, b) => a.dias - b.dias);

  const manana = addDays(hoy, 1);
  const movimientos = [];
  for (const r of s.reservas) {
    if (r.cancelada) continue;
    if (r.entrada === hoy || r.entrada === manana) movimientos.push({ tipo: 'entrada', dia: r.entrada === hoy ? 'hoy' : 'mañana', r });
    if (r.salida === hoy || r.salida === manana) movimientos.push({ tipo: 'salida', dia: r.salida === hoy ? 'hoy' : 'mañana', r });
  }
  movimientos.sort((a, b) => (a.dia === b.dia ? (a.tipo === 'salida' ? -1 : 1) : a.dia === 'hoy' ? -1 : 1));

  const total = impagos.length + hoyVence.length + contratos.length;
  return { impagos, hoyVence, contratos, movimientos, total };
}

/** Texto de WhatsApp para un grupo de cobros de una misma persona. */
export function mensajeCobro(items, tipo) {
  const s = app.s;
  const tpl = s.ajustes.plantillas;
  const p = piso(items[0].pisoId);
  const nombre = (items[0].nombre || '').split(' ')[0];
  const pendiente = (c) => c.importe - c.cobrado;
  if (items.length > 1) {
    return rellenar(tpl.varios, {
      nombre,
      piso: p?.nombre || '',
      lista: items.map((c) => `${c.concepto} (${fmtEUR(pendiente(c))}, vencido el ${fmtFecha(c.vencimiento, { corto: true })})`).join('; '),
      importe: fmtEUR(items.reduce((a, c) => a + pendiente(c), 0)),
    });
  }
  const c = items[0];
  const hoy = today();
  const plantilla = c.vencimiento > hoy ? tpl.proximo : c.vencimiento === hoy || tipo === 'hoy' ? tpl.hoy : c.tipo === 'reserva' ? tpl.reserva : tpl.impago;
  return rellenar(plantilla, {
    nombre,
    piso: p?.nombre || '',
    concepto: c.textoMsg || (c.concepto.toLowerCase().startsWith('renta') ? `la ${c.concepto.toLowerCase()}` : c.concepto),
    importe: fmtEUR(pendiente(c)),
    fecha: fmtFecha(c.vencimiento),
    dias: Math.max(0, diffDays(c.vencimiento, today())),
  });
}

function rellenar(tpl, datos) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (datos[k] != null ? String(datos[k]) : m));
}
