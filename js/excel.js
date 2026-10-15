// Excel de la cartera: exporta todos los datos a un .xlsx editable y lo vuelve a importar.
// Al importar: fila con ID existente → se actualiza; fila sin ID → se crea; «Borrar» = sí → se elimina.
// Las celdas vacías no cambian nada (para vaciar un campo se escribe «-»). Nada se aplica sin
// revisar antes el resumen, y se guarda una copia para deshacer la importación.
import { app, today, commit } from './state.js';
import { html, raw, ICON, toast, descargar, abrirDialogo, confirmar } from './ui.js';
import { uid, nuevoPiso, unidadesPara, reajustarUnidad, regenerarRecurrente, sincronizar, migrar, estadoVacio } from './store.js';
import { CATEGORIAS, CAT, MODALIDADES, num, r2, estadoCobro } from './calc.js';
import { crearXlsx, leerXlsx, isoDeSerial } from './xlsx.js';
import { normalizar, fechaISO } from './csv.js';

/* ───────────── Conversión de valores ───────────── */

const SI = new Set(['si', 'sí', 'x', '1', 'true', 'verdadero', 'yes', 's']);
const NO = new Set(['no', '0', 'false', 'falso', 'n']);
const vacio = (v) => v === '' || v == null;
const borrarCampo = (v) => typeof v === 'string' && v.trim() === '-';

function aFecha(v) {
  if (typeof v === 'number') return v > 20000 && v < 80000 ? isoDeSerial(v) : null;
  const s = String(v).trim();
  return fechaISO(s) || null;
}
function aMes(v) {
  if (typeof v === 'number') return v > 20000 ? isoDeSerial(v).slice(0, 7) : null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  const f = fechaISO(s);
  return f ? f.slice(0, 7) : null;
}
function aBool(v) {
  const s = normalizar(v);
  if (SI.has(s) || s === 'si') return true;
  if (NO.has(s)) return false;
  return null;
}
const siNo = (b) => (b ? 'sí' : 'no');

const MOD_TXT = { tradicional: 'Tradicional', habitaciones: 'Por habitaciones', turistico: 'Turístico' };
const modalidadDe = (v) => {
  const s = normalizar(v);
  if (s.includes('habitac')) return 'habitaciones';
  if (s.includes('turist') || s.includes('vacacion')) return 'turistico';
  if (s.includes('tradic') || s.includes('vivienda') || s.includes('larga')) return 'tradicional';
  return MODALIDADES[s] ? s : null;
};
const tipoTitularDe = (v) => {
  const s = normalizar(v);
  if (s.startsWith('soc') || s === 'is' || s === 'empresa') return 'sociedad';
  if (s.startsWith('per') || s.includes('fisica') || s === 'irpf' || s === 'particular') return 'persona';
  return null;
};
const categoriaDe = (v) => {
  const s = normalizar(v);
  if (!s) return null;
  return CATEGORIAS.find((c) => c.id === s || normalizar(c.nombre) === s)?.id
    || CATEGORIAS.find((c) => normalizar(c.nombre).startsWith(s))?.id
    || CATEGORIAS.find((c) => normalizar(c.nombre).split('_').includes(s))?.id || null;
};
const CANALES = ['Airbnb', 'Booking', 'Directo', 'Otro'];
const canalDe = (v) => CANALES.find((c) => normalizar(c) === normalizar(v)) || String(v).trim();

/* ───────────── Definición de hojas ───────────── */
// Cada columna: [titulo, propiedad, tipo, opciones]. Tipos: id, texto, numero, importe, fecha, mes, bool,
// y referencias (piso, titular, unidad, contrato). `ro` = solo informativa (no se importa).

const H = {
  titulares: {
    hoja: 'Titulares', col: 'titulares',
    cols: [['ID', 'id', 'id'], ['Nombre', 'nombre', 'texto', { req: true }], ['NIF', 'nif', 'texto'], ['Tipo', 'tipo', 'tipoTitular', { lista: 'Tipo de titular' }],
      ['Tipo impositivo %', 'tipoEstimado', 'numero'], ['Borrar', '_borrar', 'bool', { lista: 'Sí/No' }]],
  },
  pisos: {
    hoja: 'Pisos', col: 'pisos',
    cols: [['ID', 'id', 'id'], ['Nombre', 'nombre', 'texto', { req: true }], ['Titular', 'titularId', 'titular', { lista: 'Titulares' }], ['Dirección', 'direccion', 'texto'],
      ['Modalidad', 'modalidad', 'modalidad', { lista: 'Modalidad', req: true }], ['Nº habitaciones (al crear)', '_habitaciones', 'numero'], ['Ref. catastral', 'refCatastral', 'texto'],
      ['Fecha adquisición', 'fechaAdquisicion', 'fecha'], ['Inicio del alquiler', 'fechaInicioAlquiler', 'fecha'], ['Precio adquisición', 'precioAdquisicion', 'importe'], ['Base amortizable construcción', 'valorConstruccion', 'importe'],
      ['Reducción IRPF %', 'reduccion', 'numero'], ['Días arrendado % (auto = automático)', 'pctFiscal', 'pct'], ['Exceso pendiente años anteriores', 'excesoPrevio', 'importe'],
      ['Año del exceso', 'excesoPrevioAnio', 'numero'], ['Notas', 'notas', 'texto'], ['Borrar', '_borrar', 'bool', { lista: 'Sí/No' }]],
  },
  unidades: {
    hoja: 'Habitaciones', col: 'unidades',
    cols: [['ID', 'id', 'id'], ['Piso', 'pisoId', 'piso', { lista: 'Pisos', req: true }], ['Nombre', 'nombre', 'texto', { req: true }], ['Borrar', '_borrar', 'bool', { lista: 'Sí/No' }]],
  },
  contratos: {
    hoja: 'Contratos', col: 'contratos',
    cols: [['ID', 'id', 'id'], ['Piso', 'pisoId', 'piso', { lista: 'Pisos', req: true }], ['Habitación', 'unidadId', 'unidad'], ['Inquilino', 'inquilino', 'texto', { req: true }],
      ['Teléfono', 'telefono', 'texto'], ['Email', 'email', 'texto'], ['DNI', 'dni', 'texto'], ['Renta inicial', 'renta', 'importe', { req: true }],
      ['Subidas de renta (AAAA-MM=importe; …)', 'rentas', 'rentas'], ['Día de pago', 'diaPago', 'numero'], ['Inicio', 'inicio', 'fecha', { req: true }],
      ['Fin', 'fin', 'fecha'], ['Fianza', 'fianza', 'importe'], ['Prorratear', 'prorratear', 'bool', { lista: 'Sí/No' }], ['Finalizado', 'finalizado', 'bool', { lista: 'Sí/No' }],
      ['Notas', 'notas', 'texto'], ['Borrar', '_borrar', 'bool', { lista: 'Sí/No' }]],
  },
  hipotecas: {
    hoja: 'Hipotecas', col: 'hipotecas',
    cols: [['ID', 'id', 'id'], ['Piso', 'pisoId', 'piso', { lista: 'Pisos', req: true }], ['Entidad', 'entidad', 'texto'], ['Tipo de interés %', 'tipo', 'numero', { req: true }],
      ['Capital pendiente', 'capitalPendiente', 'importe', { req: true }], ['Mes de referencia', 'mesRef', 'mes', { req: true }], ['Última cuota (mes)', 'mesFin', 'mes', { req: true }],
      ['Cuota mensual', 'cuota', 'importe'], ['Primera cuota (mes)', 'mesInicio', 'mes'], ['Borrar', '_borrar', 'bool', { lista: 'Sí/No' }]],
  },
  recurrentes: {
    hoja: 'Gastos fijos', col: 'recurrentes',
    cols: [['ID', 'id', 'id'], ['Piso', 'pisoId', 'piso', { lista: 'Pisos', req: true }], ['Categoría', 'categoria', 'categoria', { lista: 'Categorías', req: true }],
      ['Concepto', 'concepto', 'texto', { req: true }], ['Importe', 'importe', 'importe', { req: true }], ['Cada (meses)', 'cadaMeses', 'numero'],
      ['Primer cargo', 'desde', 'fecha', { req: true }], ['Hasta', 'hasta', 'fecha'], ['Deducible', 'deducible', 'bool', { lista: 'Sí/No' }], ['Borrar', '_borrar', 'bool', { lista: 'Sí/No' }]],
  },
  gastos: {
    hoja: 'Gastos', col: 'gastos',
    cols: [['ID', 'id', 'id'], ['Fecha', 'fecha', 'fecha', { req: true }], ['Piso', 'pisoId', 'piso', { lista: 'Pisos', req: true }], ['Categoría', 'categoria', 'categoria', { lista: 'Categorías', req: true }],
      ['Concepto', 'concepto', 'texto'], ['Proveedor', 'proveedor', 'texto'], ['Importe', 'importe', 'importe', { req: true }], ['Extraordinario', 'extraordinario', 'bool', { lista: 'Sí/No' }],
      ['Deducible', 'deducible', 'bool', { lista: 'Sí/No' }], ['Gasto fijo', '_fijo', 'ro'], ['Justificantes', '_docs', 'ro'], ['Borrar', '_borrar', 'bool', { lista: 'Sí/No' }]],
  },
  cobros: {
    hoja: 'Cobros', col: 'cobros',
    cols: [['ID', 'id', 'id'], ['Piso', 'pisoId', 'piso', { lista: 'Pisos', req: true }], ['Habitación', 'unidadId', 'unidad'], ['Contrato (ID o inquilino)', 'contratoId', 'contrato'],
      ['Pagador', 'pagador', 'texto'], ['Teléfono', 'telefono', 'texto'], ['Concepto', 'concepto', 'texto', { req: true }], ['Mes', 'periodo', 'mes', { req: true }],
      ['Importe', 'importe', 'importe', { req: true }], ['Vencimiento', 'vencimiento', 'fecha', { req: true }], ['Cobrado', 'cobrado', 'importe'], ['Fecha de cobro', 'fechaCobro', 'fecha'],
      ['Anulado', 'anulado', 'bool', { lista: 'Sí/No' }], ['Estado', '_estado', 'ro'], ['Borrar', '_borrar', 'bool', { lista: 'Sí/No' }]],
  },
  reservas: {
    hoja: 'Reservas', col: 'reservas',
    cols: [['ID', 'id', 'id'], ['Piso', 'pisoId', 'piso', { lista: 'Pisos turísticos', req: true }], ['Huésped', 'huesped', 'texto', { req: true }], ['Teléfono', 'telefono', 'texto'],
      ['Canal', 'canal', 'canal', { lista: 'Canal' }], ['Entrada', 'entrada', 'fecha', { req: true }], ['Salida', 'salida', 'fecha', { req: true }], ['Huéspedes', 'huespedes', 'numero'],
      ['Importe total', 'importe', 'importe', { req: true }], ['Comisión', 'comision', 'importe'], ['Comisión descontada por la plataforma', 'comisionDescontada', 'bool', { lista: 'Sí/No' }],
      ['Cobrado', 'cobrado', 'importe'], ['Fecha prevista de cobro', 'vencimiento', 'fecha'], ['Cancelada', 'cancelada', 'bool', { lista: 'Sí/No' }], ['Notas', 'notas', 'texto'],
      ['Borrar', '_borrar', 'bool', { lista: 'Sí/No' }]],
  },
};
// Orden de importación: primero lo que otros referencian.
const ORDEN = ['titulares', 'pisos', 'unidades', 'contratos', 'hipotecas', 'recurrentes', 'gastos', 'cobros', 'reservas'];
const TIPO_COL = { id: 'id', importe: 'importe', numero: 'numero', fecha: 'fecha', ro: 'id' };

const AJUSTES = [
  ['Días de cortesía antes de marcar impagado', (s) => s.ajustes.gracia, (s, v) => { s.ajustes.gracia = Math.max(0, Math.min(30, num(v) | 0)); }],
  ['Avisos de fin de contrato (días, separados por comas)', (s) => (s.ajustes.tramos || []).join(', '), (s, v) => { const t = String(v).split(/[,;]/).map((x) => parseInt(x, 10)).filter((x) => x > 0); if (t.length) s.ajustes.tramos = [...new Set(t)].sort((a, b) => b - a); }],
  ['Mensaje de impago', (s) => s.ajustes.plantillas.impago, (s, v) => { s.ajustes.plantillas.impago = String(v); }],
  ['Mensaje el día del vencimiento', (s) => s.ajustes.plantillas.hoy, (s, v) => { s.ajustes.plantillas.hoy = String(v); }],
  ['Mensaje de próximo vencimiento', (s) => s.ajustes.plantillas.proximo, (s, v) => { s.ajustes.plantillas.proximo = String(v); }],
  ['Mensaje de varios recibos', (s) => s.ajustes.plantillas.varios, (s, v) => { s.ajustes.plantillas.varios = String(v); }],
  ['Mensaje de reserva pendiente', (s) => s.ajustes.plantillas.reserva, (s, v) => { s.ajustes.plantillas.reserva = String(v); }],
];

/* ───────────── Exportar ───────────── */

function valorExport(s, obj, [, prop, tipo]) {
  const pisoNom = (id) => s.pisos.find((p) => p.id === id)?.nombre || '';
  switch (tipo) {
    case 'titular': return s.titulares.find((t) => t.id === obj.titularId)?.nombre || '';
    case 'piso': return pisoNom(obj.pisoId);
    case 'unidad': return s.unidades.find((u) => u.id === obj.unidadId)?.nombre || '';
    case 'contrato': return obj.contratoId || '';
    case 'modalidad': return MOD_TXT[obj.modalidad] || obj.modalidad;
    case 'tipoTitular': return obj.tipo === 'sociedad' ? 'Sociedad (IS)' : 'Persona física (IRPF)';
    case 'categoria': return CAT[obj.categoria]?.nombre || obj.categoria;
    case 'bool': return prop === '_borrar' ? '' : siNo(prop === 'deducible' || prop === 'prorratear' ? obj[prop] !== false : !!obj[prop]);
    case 'pct': return obj.pctFiscal == null || obj.pctFiscal === '' ? 'auto' : num(obj.pctFiscal);
    case 'rentas': return (obj.rentas || []).map((r) => `${r.desde}=${String(r.renta).replace('.', ',')}`).join('; ');
    case 'importe': return obj[prop] == null || obj[prop] === '' ? '' : num(obj[prop]);
    case 'numero': return obj[prop] == null || obj[prop] === '' ? '' : num(obj[prop]);
    case 'ro':
      if (prop === '_fijo') return obj.recurrenteId ? s.recurrentes.find((r) => r.id === obj.recurrenteId)?.concepto || 'sí' : '';
      if (prop === '_docs') return (s.docs || []).filter((d) => d.tipo === 'gasto' && d.refId === obj.id).length || '';
      if (prop === '_estado') return ({ pagado: 'Cobrado', pendiente: 'En plazo', impagado: 'Impagado' })[estadoCobro({ importe: num(obj.importe), cobrado: num(obj.cobrado), vencimiento: obj.vencimiento }, today(), num(s.ajustes.gracia))] || '';
      return '';
    default: return obj[prop] ?? '';
  }
}

export async function exportarExcel(s = app.s) {
  const listas = {
    'Sí/No': ['sí', 'no'],
    Modalidad: Object.values(MOD_TXT),
    'Tipo de titular': ['Persona física (IRPF)', 'Sociedad (IS)'],
    Titulares: s.titulares.map((t) => t.nombre),
    Pisos: s.pisos.map((p) => p.nombre),
    'Pisos turísticos': s.pisos.filter((p) => p.modalidad === 'turistico').map((p) => p.nombre),
    Categorías: CATEGORIAS.map((c) => c.nombre),
    Canal: CANALES,
  };
  const hojas = [{
    nombre: 'LEEME',
    cabecera: [
      { texto: 'Excel de tu cartera de alquileres', titulo: true }, '',
      'Este libro contiene TODOS los datos de la app. Edítalo y vuelve a importarlo en Ajustes → Excel.',
      '• Fila con ID: se actualiza ese registro. Deja el ID tal cual, no lo cambies.',
      '• Fila sin ID: se crea un registro nuevo (piso, contrato, gasto, cobro, reserva…).',
      '• Columna «Borrar» = sí: se elimina ese registro.',
      '• Celda vacía: no se cambia nada. Para vaciar un campo escribe un guion: -',
      '• Pisos, titulares y habitaciones se indican por su nombre (hay desplegables).',
      '• Fechas: dd/mm/aaaa o fecha de Excel. Meses: aaaa-mm. Importes con coma o punto.',
      '• Antes de aplicar verás un resumen de los cambios y podrás deshacer la importación.',
      '• Los recibos de cada contrato y los apuntes de gastos fijos se generan solos al importar.',
      '• Las columnas en gris (Estado, Gasto fijo, Justificantes) son informativas y no se importan.',
      '', `Generado el ${today()}.`,
    ],
  }];
  for (const k of ORDEN) {
    const h = H[k];
    let filas = s[h.col];
    if (k === 'cobros') filas = [...filas].sort((a, b) => (a.vencimiento < b.vencimiento ? -1 : 1));
    if (k === 'gastos') filas = [...filas].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    if (k === 'reservas') filas = [...filas].sort((a, b) => (a.entrada < b.entrada ? -1 : 1));
    hojas.push({
      nombre: h.hoja,
      columnas: h.cols.map(([titulo, prop, tipo, o = {}]) => ({ titulo, tipo: TIPO_COL[tipo] || 'texto', ancho: prop === 'id' ? 18 : /notas|concepto|direccion|rentas/.test(prop) ? 34 : titulo.length > 22 ? 24 : 16, lista: o.lista })),
      filas: filas.map((obj) => h.cols.map((c) => valorExport(s, obj, c))),
    });
  }
  hojas.push({ nombre: 'Ajustes', columnas: [{ titulo: 'Ajuste', tipo: 'texto', ancho: 48 }, { titulo: 'Valor', tipo: 'texto', ancho: 90 }], filas: AJUSTES.map(([t, get]) => [t, get(s) ?? '']) });
  return crearXlsx(hojas, listas);
}

/* ───────────── Importar ───────────── */

/** Lee el Excel y aplica los cambios sobre una copia del estado. Devuelve { estado, informe }. */
export async function prepararImportacion(file, base = app.s) {
  const libro = await leerXlsx(file);
  const s = migrar(JSON.parse(JSON.stringify(base || estadoVacio())));
  const informe = { hojas: [], errores: [], total: { nuevos: 0, cambiados: 0, borrados: 0 } };
  const hojaPorNombre = Object.fromEntries(Object.keys(libro).map((n) => [normalizar(n), libro[n]]));
  if (!ORDEN.some((k) => hojaPorNombre[normalizar(H[k].hoja)])) {
    throw new Error('No se ha encontrado ninguna hoja de la app (Pisos, Gastos, Contratos…). Descarga primero el Excel desde la app y úsalo como plantilla.');
  }
  const tocados = { contratos: new Set(), recurrentes: new Set(), pisosNuevos: new Set() };
  // Nombres originales: si en el Excel se renombra un piso, las demás hojas aún lo citan por su nombre antiguo.
  const original = {};
  for (const col of ['titulares', 'pisos', 'unidades']) original[col] = new Map(s[col].map((x) => [x.id, normalizar(x.nombre)]));
  const buscar = (col, v, campo = 'nombre', filtro = () => true) => {
    if (vacio(v)) return null;
    const t = normalizar(v);
    const id = String(v).trim();
    return s[col].find((x) => filtro(x) && (x.id === id || normalizar(x[campo]) === t))
      || (original[col] && s[col].find((x) => filtro(x) && original[col].get(x.id) === t)) || null;
  };

  for (const k of ORDEN) {
    const h = H[k];
    const filas = hojaPorNombre[normalizar(h.hoja)];
    if (!filas) continue;
    // Cabecera: la primera fila con al menos dos títulos reconocidos (vale un Excel hecho a mano, sin ID).
    // Se aceptan los títulos sin el paréntesis: «Cada» por «Cada (meses)».
    const claves = h.cols.map(([titulo]) => [normalizar(titulo), normalizar(titulo.replace(/\s*\(.*\)\s*$/, ''))]);
    const reconocidos = (f) => f.filter((c) => claves.some((k) => k.includes(normalizar(c)) && normalizar(c))).length;
    const iCab = filas.findIndex((f) => reconocidos(f) >= Math.min(2, h.cols.length));
    if (iCab < 0) continue;
    const cab = filas[iCab].map(normalizar);
    const idx = claves.map(([k, corto]) => { const i = cab.indexOf(k); return i >= 0 ? i : cab.indexOf(corto); });
    const res = { hoja: h.hoja, nuevos: 0, cambiados: 0, borrados: 0, errores: 0 };
    for (let r = iCab + 1; r < filas.length; r++) {
      const fila = filas[r] || [];
      if (fila.every(vacio)) continue;
      const val = (i) => (idx[i] >= 0 ? fila[idx[i]] : '');
      const err = (m) => { informe.errores.push(`${h.hoja}, fila ${r + 1}: ${m}`); res.errores++; };
      const idTxt = String(val(0) ?? '').trim();
      let obj = idTxt ? s[h.col].find((x) => x.id === idTxt) : null;
      const iBorrar = h.cols.findIndex((c) => c[1] === '_borrar');
      if (iBorrar >= 0 && aBool(val(iBorrar)) === true) {
        if (!obj) { err('no se puede borrar: no existe ese ID'); continue; }
        if (k === 'titulares' && s.pisos.some((p) => p.titularId === obj.id)) { err(`el titular «${obj.nombre}» tiene pisos; cámbialos antes`); continue; }
        if (k === 'unidades' && s.contratos.some((c) => c.unidadId === obj.id)) { err(`la habitación «${obj.nombre}» tiene contratos`); continue; }
        // Recibos automáticos y apuntes de gastos fijos: se anulan / omiten para que no se vuelvan a generar.
        if (k === 'cobros' && obj.auto) { if (!obj.anulado) { obj.anulado = true; res.borrados++; } continue; }
        if (k === 'gastos' && obj.recurrenteId) {
          const rec = s.recurrentes.find((x) => x.id === obj.recurrenteId);
          if (rec) rec.omitidos = [...new Set([...(rec.omitidos || []), obj.periodo])];
        }
        s[h.col] = s[h.col].filter((x) => x !== obj);
        if (k === 'pisos') for (const c of ['unidades', 'contratos', 'cobros', 'reservas', 'gastos', 'recurrentes', 'hipotecas']) s[c] = s[c].filter((x) => x.pisoId !== obj.id);
        if (k === 'contratos') s.cobros = s.cobros.filter((c) => c.contratoId !== obj.id || num(c.cobrado) > 0);
        if (k === 'recurrentes') for (const g of s.gastos) if (g.recurrenteId === obj.id) g.recurrenteId = null;
        res.borrados++;
        continue;
      }
      const nuevo = !obj;
      const cambios = {};
      let fallo = null;
      const pisoDeFila = () => {
        const i = h.cols.findIndex((c) => c[2] === 'piso');
        return i >= 0 && !vacio(val(i)) ? buscar('pisos', val(i)) : obj ? s.pisos.find((p) => p.id === obj.pisoId) : null;
      };
      h.cols.forEach(([titulo, prop, tipo, o = {}], i) => {
        if (fallo || tipo === 'id' || tipo === 'ro' || prop === '_borrar') return;
        const v = val(i);
        if (vacio(v)) { if (nuevo && o.req) fallo = `falta «${titulo}»`; return; }
        if (borrarCampo(v)) { if (o.req) fallo = `«${titulo}» no puede quedar vacío`; else cambios[prop] = tipo === 'numero' || tipo === 'importe' ? 0 : tipo === 'bool' ? false : ''; return; }
        let x;
        switch (tipo) {
          case 'texto': x = String(v).trim(); break;
          case 'numero': x = typeof v === 'number' ? v : num(v); if (!Number.isFinite(x)) fallo = `«${titulo}» no es un número`; break;
          case 'importe': x = r2(typeof v === 'number' ? v : num(v)); break;
          case 'pct': x = normalizar(v) === 'auto' ? null : Math.min(100, Math.max(0, typeof v === 'number' ? v : num(v))); break;
          case 'fecha': x = aFecha(v); if (!x) fallo = `«${titulo}» no es una fecha válida (${v})`; break;
          case 'mes': x = aMes(v); if (!x) fallo = `«${titulo}» no es un mes válido (usa aaaa-mm)`; break;
          case 'bool': x = aBool(v); if (x == null) fallo = `«${titulo}» debe ser sí o no`; break;
          case 'modalidad': x = modalidadDe(v); if (!x) fallo = `modalidad desconocida «${v}»`; break;
          case 'tipoTitular': x = tipoTitularDe(v); if (!x) fallo = `tipo de titular desconocido «${v}» (Persona o Sociedad)`; break;
          case 'categoria': x = categoriaDe(v); if (!x) fallo = `categoría desconocida «${v}»`; break;
          case 'canal': x = canalDe(v); break;
          case 'titular': {
            let t = buscar('titulares', v);
            if (!t) { // se crea el titular si no existe
              t = { id: uid(), nombre: String(v).trim(), nif: '', tipo: /\b(s\.?l\.?u?|s\.?a\.?|sociedad|slu)\b/i.test(String(v)) ? 'sociedad' : 'persona', tipoEstimado: 0 };
              t.tipoEstimado = t.tipo === 'sociedad' ? 25 : 30;
              s.titulares.push(t);
              informe.titularesCreados = (informe.titularesCreados || 0) + 1;
            }
            x = t.id;
            break;
          }
          case 'piso': { const p = buscar('pisos', v); if (!p) fallo = `no existe el piso «${v}»`; else x = p.id; break; }
          case 'unidad': {
            const p = pisoDeFila();
            if (!p) { fallo = 'indica el piso de la habitación'; break; }
            let u = buscar('unidades', v, 'nombre', (u2) => u2.pisoId === p.id);
            if (!u) { u = { id: uid(), pisoId: p.id, nombre: String(v).trim() }; s.unidades.push(u); }
            x = u.id;
            break;
          }
          case 'contrato': {
            const p = pisoDeFila();
            const c = s.contratos.find((k2) => k2.id === String(v).trim()) || buscar('contratos', v, 'inquilino', (k2) => !p || k2.pisoId === p.id);
            if (!c) fallo = `no existe el contrato «${v}»`; else x = c.id;
            break;
          }
          case 'rentas': {
            x = [];
            for (const parte of String(v).split(/[;\n]/)) {
              if (!parte.trim()) continue;
              const m = parte.split(/[=:]/);
              const mes = aMes(m[0]);
              const renta = r2(num(m[1]));
              if (!mes || !(renta > 0)) { fallo = `subida de renta no válida «${parte.trim()}» (usa 2026-11=950)`; break; }
              x.push({ desde: mes, renta });
            }
            break;
          }
          default: x = v;
        }
        if (fallo) return;
        // Sin cambio real (p. ej. «no» frente a un campo que no existía): no se toca.
        if (!nuevo) {
          const actual = obj[prop];
          const igual = tipo === 'bool' ? x === (prop === 'deducible' || prop === 'prorratear' ? actual !== false : !!actual)
            : tipo === 'numero' || tipo === 'importe' ? Math.abs(num(actual) - x) < 0.005 && (actual !== '' && actual != null || x === 0)
              : JSON.stringify(actual ?? '') === JSON.stringify(x ?? '');
          if (igual) return;
        }
        cambios[prop] = x;
      });
      if (fallo) { err(fallo); continue; }

      // Valores por defecto y comprobaciones de coherencia al crear
      if (nuevo) {
        if (k === 'pisos') obj = nuevoPiso({ titularId: s.titulares[0]?.id, modalidad: cambios.modalidad || 'tradicional' });
        else if (k === 'titulares') obj = { id: uid(), nif: '', tipo: 'persona', tipoEstimado: 30 };
        else if (k === 'contratos') obj = { id: uid(), diaPago: 1, fianza: 0, prorratear: true, avisosHechos: [], finalizado: false, email: '', dni: '', telefono: '', notas: '' };
        else if (k === 'hipotecas') obj = { id: uid(), cuota: 0, mesInicio: '', entidad: '' };
        else if (k === 'recurrentes') obj = { id: uid(), cadaMeses: 1, hasta: '', omitidos: [], deducible: true };
        else if (k === 'gastos') obj = { id: uid(), concepto: '', proveedor: '', extraordinario: false, deducible: true };
        else if (k === 'cobros') obj = { id: uid(), cobrado: 0, fechaCobro: '', auto: false };
        else if (k === 'reservas') obj = { id: uid(), canal: 'Directo', huespedes: 0, comision: 0, comisionDescontada: false, cobrado: 0, fechaCobro: '', vencimiento: '', notas: '', cancelada: false, telefono: '' };
        else obj = { id: uid() };
        if (idTxt) obj.id = idTxt; // respeta un ID escrito a mano
      }
      const antes = JSON.stringify(obj);
      const prueba = { ...obj, ...cambios };
      if (k === 'contratos') {
        if (!prueba.unidadId || s.unidades.find((u) => u.id === prueba.unidadId)?.pisoId !== prueba.pisoId) prueba.unidadId = s.unidades.find((u) => u.pisoId === prueba.pisoId)?.id;
        if (!prueba.unidadId) { err('el piso no tiene habitaciones'); continue; }
        if (prueba.fin && prueba.fin < prueba.inicio) { err('la fecha de fin es anterior al inicio'); continue; }
        if (!(num(prueba.renta) > 0)) { err('la renta debe ser mayor que cero'); continue; }
        prueba.diaPago = Math.min(31, Math.max(1, num(prueba.diaPago) | 0 || 1));
      }
      if (k === 'reservas' && !(prueba.salida > prueba.entrada)) { err('la salida debe ser posterior a la entrada'); continue; }
      if (k === 'reservas' && s.pisos.find((p) => p.id === prueba.pisoId)?.modalidad !== 'turistico') { err('las reservas solo pueden ir en pisos turísticos'); continue; }
      if ((k === 'gastos' || k === 'recurrentes' || k === 'cobros') && !(num(prueba.importe) > 0)) { err('el importe debe ser mayor que cero'); continue; }
      if (k === 'hipotecas' && prueba.mesFin < prueba.mesRef) { err('la última cuota es anterior al mes de referencia'); continue; }
      if (k === 'recurrentes') { prueba.dia = Number(String(prueba.desde).slice(8, 10)) || 1; prueba.cadaMeses = Math.max(1, num(prueba.cadaMeses) | 0 || 1); }
      if (k === 'cobros') {
        const kk = prueba.contratoId ? s.contratos.find((c) => c.id === prueba.contratoId) : null;
        if (kk) { prueba.pisoId = kk.pisoId; prueba.unidadId = kk.unidadId; }
        if (!prueba.unidadId || s.unidades.find((u) => u.id === prueba.unidadId)?.pisoId !== prueba.pisoId) prueba.unidadId = s.unidades.find((u) => u.pisoId === prueba.pisoId)?.id;
        prueba.cobrado = r2(Math.min(num(prueba.importe), num(prueba.cobrado)));
        if (prueba.cobrado > 0 && !prueba.fechaCobro) prueba.fechaCobro = prueba.vencimiento;
        if (!nuevo && obj.auto && (cambios.importe != null && cambios.importe !== obj.importe || cambios.vencimiento && cambios.vencimiento !== obj.vencimiento)) prueba.editado = true;
        if (prueba.cobrado !== num(obj.cobrado)) prueba.pagos = prueba.cobrado > 0 ? [{ fecha: prueba.fechaCobro, importe: prueba.cobrado }] : [];
      }
      if (k === 'reservas') {
        const esperado = r2(num(prueba.importe) - (prueba.comisionDescontada ? num(prueba.comision) : 0));
        prueba.cobrado = Math.min(esperado, num(prueba.cobrado));
        if (prueba.cobrado > 0 && !prueba.fechaCobro) prueba.fechaCobro = prueba.entrada;
      }
      if (k === 'gastos' && !nuevo && obj.recurrenteId && JSON.stringify({ ...obj, ...cambios }) !== antes) prueba.editado = true;
      const habitaciones = prueba._habitaciones;
      delete prueba._habitaciones;
      Object.assign(obj, prueba);
      for (const kk of Object.keys(obj)) if (kk.startsWith('_')) delete obj[kk];
      if (nuevo) {
        s[h.col].push(obj);
        res.nuevos++;
        if (k === 'pisos') { tocados.pisosNuevos.add(obj.id); obj._hab = habitaciones; }
      } else if (JSON.stringify(obj) !== antes) res.cambiados++;
      if (k === 'contratos' && (nuevo || JSON.stringify(obj) !== antes)) tocados.contratos.add(obj.id);
      if (k === 'recurrentes' && (nuevo || JSON.stringify(obj) !== antes)) tocados.recurrentes.add(obj.id);
    }
    if (k === 'pisos') {
      for (const p of s.pisos) if (!s.titulares.some((t) => t.id === p.titularId)) {
        let t = s.titulares[0];
        if (!t) { t = { id: uid(), nombre: 'A mi nombre', nif: '', tipo: 'persona', tipoEstimado: 30 }; s.titulares.push(t); }
        p.titularId = t.id;
      }
      // Pisos nuevos: habitaciones por defecto si la hoja Habitaciones no las trae
      for (const p of s.pisos) if (tocados.pisosNuevos.has(p.id)) {
        const n = p._hab;
        delete p._hab;
        if (!s.unidades.some((u) => u.pisoId === p.id) && !(hojaPorNombre.habitaciones || []).some((f) => f.some((c) => normalizar(c) === normalizar(p.nombre)))) s.unidades.push(...unidadesPara(p, Math.max(1, num(n) | 0 || 4)));
      }
    }
    if (k === 'unidades') for (const p of s.pisos) if (!s.unidades.some((u) => u.pisoId === p.id)) s.unidades.push(...unidadesPara(p, 1));
    if (res.nuevos || res.cambiados || res.borrados || res.errores) informe.hojas.push(res);
    informe.total.nuevos += res.nuevos; informe.total.cambiados += res.cambiados; informe.total.borrados += res.borrados;
  }

  // Ajustes (hoja de clave / valor)
  const aj = hojaPorNombre.ajustes;
  if (aj) {
    let n = 0;
    for (const f of aj) {
      const def = AJUSTES.find(([t]) => normalizar(t) === normalizar(f[0]));
      if (!def || vacio(f[1])) continue;
      const antes = JSON.stringify(s.ajustes);
      def[2](s, f[1]);
      if (JSON.stringify(s.ajustes) !== antes) n++;
    }
    if (n) { informe.hojas.push({ hoja: 'Ajustes', nuevos: 0, cambiados: n, borrados: 0, errores: 0 }); informe.total.cambiados += n; }
  }

  // Recibos de los contratos y apuntes de los gastos fijos tocados
  const hoy = today();
  const autos = () => s.cobros.filter((c) => c.auto).length + s.gastos.filter((g) => g.recurrenteId).length;
  const autosAntes = autos();
  for (const id of tocados.contratos) { const c = s.contratos.find((x) => x.id === id); if (c) reajustarUnidad(s, c, hoy); }
  for (const id of tocados.recurrentes) { const r = s.recurrentes.find((x) => x.id === id); if (r) regenerarRecurrente(s, r, hoy); }
  sincronizar(s, hoy);
  informe.generados = Math.max(0, autos() - autosAntes);
  return { estado: s, informe };
}

/* ───────────── Interfaz ───────────── */

const CLAVE_DESHACER = 'alquileres.antesImport';

export async function descargarExcel() {
  try {
    const blob = await exportarExcel(app.s);
    const nombre = `alquileres-${today()}.xlsx`;
    const file = new File([blob], nombre, { type: blob.type });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Excel de Alquileres' }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    descargar(nombre, blob);
    toast('Excel descargado. Edítalo y vuelve a importarlo aquí.');
  } catch (e) {
    console.error(e);
    toast(`No se ha podido crear el Excel: ${e.message}`, { tipo: 'error', ms: 7000 });
  }
}

export const hayDeshacer = () => { try { return !!localStorage.getItem(CLAVE_DESHACER); } catch { return false; } };

export async function importarExcel(file) {
  let res;
  try {
    res = await prepararImportacion(file, app.s);
  } catch (e) {
    console.error(e);
    toast(`No se ha podido leer el Excel: ${e.message}`, { tipo: 'error', ms: 8000 });
    return;
  }
  const { estado, informe } = res;
  const { nuevos, cambiados, borrados } = informe.total;
  const sinCambios = !nuevos && !cambiados && !borrados;
  const cuerpo = html`
    <p class="muted">Archivo: <b>${file.name}</b>. Revisa los cambios antes de aplicarlos. Tus datos actuales se guardan para poder deshacer.</p>
    ${sinCambios ? html`<p class="import-nota">El Excel no trae cambios respecto a lo que ya hay en la app.</p>` : html`
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Hoja</th><th class="num">Nuevos</th><th class="num">Cambiados</th><th class="num">Borrados</th><th class="num">Con error</th></tr></thead>
      <tbody>${informe.hojas.map((h) => html`<tr><td>${h.hoja}</td><td class="num">${h.nuevos || ''}</td><td class="num">${h.cambiados || ''}</td><td class="num">${h.borrados ? html`<b class="import-borra">${h.borrados}</b>` : ''}</td><td class="num">${h.errores ? html`<b class="import-err">${h.errores}</b>` : ''}</td></tr>`)}</tbody>
    </table></div>`}
    ${informe.titularesCreados ? html`<p class="small muted">${informe.titularesCreados === 1 ? 'Se creará 1 titular nuevo' : `Se crearán ${informe.titularesCreados} titulares nuevos`} que no existía${informe.titularesCreados === 1 ? '' : 'n'}.</p>` : ''}
    ${informe.generados ? html`<p class="small muted">Además se generarán ${informe.generados} recibos o apuntes de gastos fijos automáticos.</p>` : ''}
    ${informe.errores.length ? html`<details class="import-errores" open><summary><b>${informe.errores.length === 1 ? '1 fila no se importará' : `${informe.errores.length} filas no se importarán`}</b> (el resto sí)</summary>
      <ul class="small">${informe.errores.slice(0, 60).map((e) => html`<li>${e}</li>`)}${informe.errores.length > 60 ? html`<li>… y ${informe.errores.length - 60} más</li>` : ''}</ul></details>` : ''}`;
  abrirDialogo({
    titulo: 'Importar Excel',
    cuerpo,
    ancho: 'wide',
    textoOk: sinCambios ? 'Cerrar' : 'Aplicar cambios',
    submit: () => {
      if (sinCambios) return true;
      let copia = false;
      if (app.s) try { localStorage.setItem(CLAVE_DESHACER, JSON.stringify({ fecha: new Date().toISOString(), archivo: file.name, estado: app.s })); copia = true; } catch (e) { console.warn('Sin copia para deshacer', e); }
      app.s = estado;
      commit(`Excel importado: ${nuevos} nuevos, ${cambiados} cambiados, ${borrados} borrados`, { ms: 8000, accion: copia ? { texto: 'Deshacer', fn: deshacerImportacion } : undefined });
      return true;
    },
  });
}

export async function deshacerImportacion() {
  let copia;
  try { copia = JSON.parse(localStorage.getItem(CLAVE_DESHACER) || 'null'); } catch { copia = null; }
  if (!copia?.estado) return toast('No hay ninguna importación que deshacer.', { tipo: 'warn' });
  const cuando = new Date(copia.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  if (!(await confirmar('Deshacer importación', `Se volverá a los datos que había antes de importar «${copia.archivo}» (${cuando}). Lo que hayas cambiado después se perderá.`, { ok: 'Deshacer', peligro: true }))) return;
  app.s = migrar(copia.estado);
  try { localStorage.removeItem(CLAVE_DESHACER); } catch {}
  commit('Importación deshecha');
}
