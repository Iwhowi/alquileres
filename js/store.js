// Estado de la aplicación, persistencia en localStorage y sincronización
// (recibos de contratos y gastos recurrentes).
import { recibosEsperados, ymOf, addMonths, dayInMonth, todayISO, num, r2, monthsDiff, addDays } from './calc.js';

const KEY = 'alquileres.v1';
export const VERSION = 2;

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).replace(/-/g, '').slice(0, 16);

export const PLANTILLAS = {
  impago:
    'Hola {nombre}, te escribo por el pago de {concepto} de {piso}, por importe de {importe}, que venció el {fecha}. ¿Puedes confirmarme cuándo lo vas a realizar? Si ya lo has hecho, ignora este mensaje. Gracias.',
  proximo: 'Hola {nombre}, te recuerdo que el {fecha} vence el pago de {concepto} de {piso} ({importe}). Gracias.',
  hoy: 'Hola {nombre}, te recuerdo que hoy vence el pago de {concepto} de {piso} ({importe}). Gracias.',
  varios:
    'Hola {nombre}, tienes pendientes los siguientes pagos de {piso}: {lista}. Total: {importe}. ¿Me confirmas cuándo puedes realizarlos? Si ya lo has hecho, ignora este mensaje. Gracias.',
  reserva: 'Hola {nombre}, te escribo por el pago pendiente de tu estancia en {piso} ({fecha}), por importe de {importe}. Gracias.',
};

export function estadoVacio() {
  return {
    version: VERSION,
    ajustes: {
      gracia: 0,
      tramos: [90, 60, 30],
      plantillas: { ...PLANTILLAS },
      ultimoBackup: null,
      creado: todayISO(),
      demo: false,
    },
    titulares: [],
    pisos: [],
    unidades: [],
    contratos: [],
    cobros: [],
    reservas: [],
    gastos: [],
    recurrentes: [],
    hipotecas: [],
    docs: [], // fichas de documentos adjuntos (los archivos están en IndexedDB)
  };
}

/** Estructura inicial: 4 pisos a título personal y 2 de la sociedad, sin datos. */
export function estructuraInicial() {
  const s = estadoVacio();
  const yo = { id: uid(), nombre: 'A mi nombre', nif: '', tipo: 'persona', tipoEstimado: 30 };
  const soc = { id: uid(), nombre: 'Mi sociedad', nif: '', tipo: 'sociedad', tipoEstimado: 25 };
  s.titulares.push(yo, soc);
  const def = [
    [yo, 'Piso 1', 'tradicional', 0],
    [yo, 'Piso 2', 'tradicional', 0],
    [yo, 'Piso 3', 'habitaciones', 4],
    [yo, 'Piso 4', 'turistico', 0],
    [soc, 'Piso 5', 'habitaciones', 4],
    [soc, 'Piso 6', 'habitaciones', 4],
  ];
  for (const [t, nombre, modalidad, hab] of def) {
    const p = nuevoPiso({ titularId: t.id, nombre, modalidad });
    s.pisos.push(p);
    s.unidades.push(...unidadesPara(p, hab));
  }
  return s;
}

export function nuevoPiso(over = {}) {
  return {
    id: uid(),
    nombre: '',
    direccion: '',
    titularId: '',
    modalidad: 'tradicional',
    refCatastral: '',
    fechaAdquisicion: '',
    precioAdquisicion: 0,
    valorConstruccion: 0,
    fechaInicioAlquiler: '',
    reduccion: over.modalidad === 'turistico' ? 0 : 50,
    pctFiscal: null, // null = automático según contratos o noches reservadas
    excesoPrevio: 0,
    excesoPrevioAnio: '',
    notas: '',
    ...over,
  };
}

export function unidadesPara(piso, habitaciones) {
  if (piso.modalidad !== 'habitaciones') return [{ id: uid(), pisoId: piso.id, nombre: piso.modalidad === 'turistico' ? 'Apartamento' : 'Vivienda completa' }];
  return Array.from({ length: habitaciones || 1 }, (_, i) => ({ id: uid(), pisoId: piso.id, nombre: `Habitación ${i + 1}` }));
}

/* ───────────── Persistencia ───────────── */

export function cargar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const datos = JSON.parse(raw);
    const m = migrar(datos);
    if ((Number(datos.version) || 1) < VERSION) guardar(m); // la migración se aplica una sola vez
    return m;
  } catch (e) {
    console.error(e);
    return null;
  }
}

let trasGuardar = null;
/** Aviso tras cada guardado (lo usa la sincronización para saber qué ha cambiado). */
export function alGuardar(fn) { trasGuardar = fn; }

export function guardar(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
  try { trasGuardar?.(state); } catch (e) { console.error(e); }
}

export function borrarTodo() {
  localStorage.removeItem(KEY);
}

/** Completa campos que falten en datos importados o de versiones anteriores. */
export function migrar(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.pisos)) throw new Error('El archivo no contiene datos de la aplicación.');
  const base = estadoVacio();
  const out = { ...base, ...s, ajustes: { ...base.ajustes, ...(s.ajustes || {}) } };
  out.ajustes.plantillas = { ...PLANTILLAS, ...(s.ajustes?.plantillas || {}) };
  for (const k of ['titulares', 'pisos', 'unidades', 'contratos', 'cobros', 'reservas', 'gastos', 'recurrentes', 'hipotecas', 'docs']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  const previa = Number(s.version) || 1;
  if (previa < 2) {
    const hoy = todayISO();
    // En la v1 los recibos se paraban en la fecha de fin; ahora un contrato vencido sin finalizar se
    // considera prorrogado. Los ya vencidos al migrar se dan por finalizados para no inventar deuda.
    // Solo los que vencieron hace más de 2 meses o ya tienen sucesor; los recientes quedan en prórroga.
    const limite = addDays(hoy, -60);
    for (const k of out.contratos) {
      if (!k.fin || k.fin >= hoy) continue;
      const sucesor = out.contratos.some((o) => o.id !== k.id && o.unidadId === k.unidadId && o.inicio > k.inicio);
      if (sucesor || k.fin < limite) k.finalizado = true;
    }
    for (const p of out.pisos) if (p.pctFiscal === 100 || p.pctFiscal === '') p.pctFiscal = null;
    // El día de cargo pasa a ser el del primer cargo.
    for (const r of out.recurrentes) if (r.desde) r.dia = Number(r.desde.slice(8, 10));
  }
  out.version = VERSION;
  return out;
}

/* ───────────── Sincronización ───────────── */

/**
 * Fin efectivo de un contrato para generar recibos: si ha pasado su fecha de fin sin finalizarlo
 * ni haber otro contrato posterior en la misma unidad, se considera prorrogado (sigue vigente).
 */
export function finEfectivo(s, k, today = todayISO()) {
  if (k.finalizado) return k.fin || null;
  const sucesor = s.contratos
    .filter((o) => o.id !== k.id && o.unidadId === k.unidadId && o.inicio > k.inicio)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1))[0];
  if (sucesor) {
    const tope = addDays(sucesor.inicio, -1);
    // Vencido sin finalizar: la prórroga dura hasta que empieza el contrato siguiente.
    if (k.fin && k.fin < today) return tope;
    return k.fin && k.fin < tope ? k.fin : tope;
  }
  if (k.fin && k.fin < today) return null; // prórroga tácita
  return k.fin || null;
}

/**
 * Crea los recibos de los contratos y los gastos recurrentes que falten hasta hoy.
 * Devuelve el número de elementos creados.
 */
export function sincronizar(s, today = todayISO()) {
  let creados = 0;
  const hastaYm = ymOf(today);
  const existentes = new Set(s.cobros.filter((c) => c.contratoId).map((c) => `${c.contratoId}|${c.periodo}`));
  for (const k of s.contratos) {
    for (const r of recibosEsperados(k, hastaYm, finEfectivo(s, k, today))) {
      const key = `${k.id}|${r.periodo}`;
      if (existentes.has(key)) continue;
      s.cobros.push({
        id: uid(),
        pisoId: k.pisoId,
        unidadId: k.unidadId,
        contratoId: k.id,
        periodo: r.periodo,
        concepto: r.concepto,
        importe: r.importe,
        vencimiento: r.vencimiento,
        cobrado: 0,
        fechaCobro: '',
        auto: true,
      });
      existentes.add(key);
      creados++;
    }
  }
  const gastosRec = new Set(s.gastos.filter((g) => g.recurrenteId).map((g) => `${g.recurrenteId}|${g.periodo}`));
  for (const rec of s.recurrentes) {
    if (!rec.desde || !(num(rec.importe) > 0)) continue;
    const paso = Math.max(1, num(rec.cadaMeses) | 0);
    const omitidos = new Set(rec.omitidos || []);
    const fin = rec.hasta && rec.hasta < today ? rec.hasta : today;
    for (let ym = ymOf(rec.desde), i = 0; ym <= ymOf(fin) && i < 600; ym = addMonths(ym, paso), i++) {
      const fecha = dayInMonth(ym, rec.dia || Number(rec.desde.slice(8, 10)) || 1);
      if (fecha < rec.desde || fecha > fin) continue;
      const key = `${rec.id}|${ym}`;
      if (gastosRec.has(key) || omitidos.has(ym)) continue;
      s.gastos.push({
        id: uid(),
        pisoId: rec.pisoId,
        fecha,
        categoria: rec.categoria,
        concepto: rec.concepto,
        proveedor: rec.proveedor || '',
        importe: r2(num(rec.importe)),
        extraordinario: false,
        deducible: rec.deducible !== false,
        recurrenteId: rec.id,
        periodo: ym,
      });
      gastosRec.add(key);
      creados++;
    }
  }
  return creados;
}

/**
 * Tras editar un contrato: ajusta sus recibos automáticos sin cobrar ni editar a mano de `desdeYm`
 * en adelante (por defecto, el mes actual; los meses pasados conservan su importe) y elimina los
 * que han quedado fuera de las nuevas fechas.
 */
export function reajustarRecibos(s, contrato, today = todayISO(), desdeYm = ymOf(today)) {
  const esperados = new Map(recibosEsperados(contrato, ymOf(today), finEfectivo(s, contrato, today)).map((r) => [r.periodo, r]));
  s.cobros = s.cobros.filter((c) => {
    if (c.contratoId !== contrato.id || !c.auto || c.editado || num(c.cobrado) > 0) return true;
    const e = esperados.get(c.periodo);
    if (!e) return false;
    Object.assign(c, { pisoId: contrato.pisoId, unidadId: contrato.unidadId });
    if (c.periodo >= desdeYm || e.importe < c.importe) Object.assign(c, { importe: e.importe, vencimiento: e.vencimiento, concepto: e.concepto });
    return true;
  });
  sincronizar(s, today);
}

/**
 * Tras cambiar la periodicidad o las fechas de un gasto fijo: mueve a su nueva fecha los apuntes cuyo
 * periodo sigue existiendo (conservando su importe), quita los que ya no tocan y crea los que falten
 * con el importe vigente en esa fecha. Los apuntes editados a mano y los meses borrados se respetan.
 */
export function regenerarRecurrente(s, rec, today = todayISO()) {
  const nuevos = new Map(periodosRecurrente(rec, today).map((x) => [x.ym, x.fecha]));
  const antiguos = s.gastos.filter((g) => g.recurrenteId === rec.id).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const historial = antiguos.map((g) => ({ fecha: g.fecha, importe: g.importe }));
  for (const g of antiguos) {
    if (g.editado) continue;
    if (nuevos.has(g.periodo)) Object.assign(g, { fecha: nuevos.get(g.periodo), pisoId: rec.pisoId, categoria: rec.categoria, concepto: rec.concepto, deducible: rec.deducible !== false });
    else g._quitar = true;
  }
  s.gastos = s.gastos.filter((g) => !g._quitar);
  const antes = new Set(s.gastos.map((g) => g.id));
  const n = sincronizar(s, today);
  for (const g of s.gastos) {
    if (antes.has(g.id) || g.recurrenteId !== rec.id) continue;
    // Importe que estaba vigente en esa fecha según los apuntes anteriores.
    // Importe vigente en esa fecha según los apuntes anteriores; tras el último, el importe actual.
    const ultimo = historial[historial.length - 1];
    if (!ultimo || g.fecha > ultimo.fecha) { g.importe = r2(num(rec.importe)); continue; }
    const previo = [...historial].reverse().find((h) => h.fecha <= g.fecha) || historial[0];
    g.importe = previo.importe;
  }
  return n;
}

/** Cargos que corresponden a un gasto fijo hasta hoy: [{ ym, fecha }]. */
export function periodosRecurrente(rec, today = todayISO()) {
  const out = [];
  if (!rec.desde) return out;
  const paso = Math.max(1, num(rec.cadaMeses) | 0);
  const fin = rec.hasta && rec.hasta < today ? rec.hasta : today;
  for (let ym = ymOf(rec.desde), i = 0; ym <= ymOf(fin) && i < 600; ym = addMonths(ym, paso), i++) {
    const fecha = dayInMonth(ym, rec.dia || Number(rec.desde.slice(8, 10)) || 1);
    if (fecha >= rec.desde && fecha <= fin) out.push({ ym, fecha });
  }
  return out;
}

/** Tras guardar un contrato, recalcula los demás de la misma unidad (p. ej. corta una prórroga tácita). */
export function reajustarUnidad(s, contrato, today = todayISO()) {
  // Solo recorta lo que queda fuera del nuevo fin efectivo; no cambia importes pasados.
  for (const o of s.contratos) if (o.id !== contrato.id && o.unidadId === contrato.unidadId) reajustarRecibos(s, o, today);
  reajustarRecibos(s, contrato, today);
}

/** Meses de antigüedad del último backup, o null si nunca se hizo. */
export function mesesDesdeBackup(s, today = todayISO()) {
  if (!s.ajustes.ultimoBackup) return null;
  return monthsDiff(ymOf(s.ajustes.ultimoBackup), ymOf(today));
}
