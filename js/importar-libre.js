// Importación de libros con CUALQUIER formato: el Excel que cada propietario ya tenía.
// 1) Se analiza cada hoja: qué contiene (gastos, ingresos, movimientos, reservas, inquilinos, pisos,
//    hipotecas o una tabla por meses) y qué significa cada columna, por sus títulos y sus valores.
// 2) Se muestra lo entendido para corregirlo con desplegables.
// 3) Se traduce a las hojas de la app y se importa con el mismo motor (resumen previo y deshacer).
import { app, today } from './state.js';
import { html, abrirDialogo, cerrarDialogo, toast } from './ui.js';
import { normalizar, filasCSV } from './csv.js';
import { leerXlsx, leerOds } from './xlsx.js';
import { CAT, num, r2, mesLargo, addMonths, addDays } from './calc.js';
import { prepararImportacion, mostrarResumen, importarExcel, aFecha, aNumero, aBool, categoriaDe, canalDe, H } from './excel.js';

/* ───────────── Diccionario de columnas ───────────── */
// v: tipo de valor esperado (fecha, numero, texto, estado, mes). s: sinónimos (normalizados).
const CAMPOS = {
  fecha: { t: 'Fecha', v: 'fecha', s: ['fecha', 'date', 'dia', 'fecha_factura', 'fecha_pago', 'fecha_cobro', 'fecha_gasto', 'fecha_operacion', 'fecha_valor', 'f_valor', 'f_operacion', 'f_factura', 'fecha_movimiento', 'fecha_emision', 'cuando'] },
  mes: { t: 'Mes', v: 'mes', s: ['mes', 'periodo', 'month', 'mensualidad_de', 'mes_correspondiente'] },
  piso: { t: 'Piso / inmueble', v: 'texto', s: ['piso', 'inmueble', 'vivienda', 'propiedad', 'apartamento', 'apto', 'casa', 'local', 'finca', 'activo', 'property', 'alojamiento', 'listing', 'anuncio', 'nombre_del_alojamiento', 'nombre_piso', 'nombre_del_piso', 'direccion_piso'] },
  direccion: { t: 'Dirección', v: 'texto', s: ['direccion', 'domicilio', 'calle', 'address', 'ubicacion', 'situacion'] },
  habitacion: { t: 'Habitación', v: 'texto', s: ['habitacion', 'hab', 'cuarto', 'room', 'dormitorio', 'unidad'] },
  importe: { t: 'Importe', v: 'numero', s: ['gross_earnings', 'importe', 'cantidad', 'total', 'euros', 'eur', 'precio', 'monto', 'coste', 'costo', 'valor', 'amount', 'importe_total', 'total_factura', 'suma', 'pagado', 'cobrado', 'ingreso_bruto'] },
  ingreso: { t: 'Importe de ingreso', v: 'numero', s: ['ingreso', 'ingresos', 'haber', 'abono', 'entradas', 'cobros', 'credito'] },
  gasto: { t: 'Importe de gasto', v: 'numero', s: ['gasto', 'gastos', 'debe', 'cargo', 'salidas', 'pagos', 'debito'] },
  concepto: { t: 'Concepto', v: 'texto', s: ['concepto', 'descripcion', 'detalle', 'motivo', 'description', 'partida', 'asunto', 'que', 'articulo', 'servicio'] },
  categoria: { t: 'Categoría', v: 'texto', s: ['categoria', 'tipo', 'tipo_gasto', 'tipo_de_gasto', 'clase', 'grupo', 'category', 'familia'] },
  proveedor: { t: 'Proveedor', v: 'texto', s: ['proveedor', 'empresa', 'emisor', 'acreedor', 'suministrador', 'tienda', 'comercio', 'pagado_a', 'beneficiario'] },
  deducible: { t: 'Deducible', v: 'estado', s: ['deducible', 'desgravable', 'fiscal'] },
  inquilino: { t: 'Inquilino / pagador', v: 'texto', s: ['inquilino', 'arrendatario', 'nombre', 'pagador', 'persona', 'nombre_inquilino', 'tenant', 'quien', 'cliente', 'nombre_y_apellidos', 'apellidos'] },
  huesped: { t: 'Huésped', v: 'texto', s: ['guest', 'nombre_del_huesped', 'reservado_por', 'nombre_del_cliente', 'huesped', 'cliente', 'nombre', 'guest', 'viajero', 'nombre_huesped', 'reserva_de'] },
  telefono: { t: 'Teléfono', v: 'texto', s: ['telefono', 'tlf', 'tfno', 'movil', 'phone', 'tel', 'celular', 'contacto', 'whatsapp'] },
  email: { t: 'Email', v: 'texto', s: ['email', 'correo', 'mail', 'e_mail', 'correo_electronico'] },
  dni: { t: 'DNI / NIE', v: 'texto', s: ['dni', 'nie', 'nif', 'documento', 'pasaporte', 'identificacion'] },
  renta: { t: 'Renta mensual', v: 'numero', s: ['renta', 'alquiler', 'mensualidad', 'cuota_mensual', 'precio_mes', 'importe_mensual', 'renta_mensual', 'precio_alquiler', 'alquiler_mensual', 'rent', 'precio', 'importe', 'cuota'] },
  inicio: { t: 'Inicio del contrato', v: 'fecha', s: ['inicio', 'fecha_inicio', 'desde', 'alta', 'fecha_alta', 'fecha_contrato', 'comienzo', 'firma', 'fecha_firma', 'entrada', 'fecha_entrada', 'inicio_contrato'] },
  fin: { t: 'Fin del contrato', v: 'fecha', s: ['fin', 'fecha_fin', 'hasta', 'vencimiento', 'baja', 'fecha_baja', 'finalizacion', 'fin_contrato', 'salida', 'fecha_salida', 'caducidad'] },
  fianza: { t: 'Fianza', v: 'numero', s: ['fianza', 'deposito', 'garantia', 'aval'] },
  diaPago: { t: 'Día de pago', v: 'numero', s: ['dia_pago', 'dia_de_pago', 'dia_cobro', 'dia_de_cobro', 'pago_dia'] },
  entrada: { t: 'Entrada (check-in)', v: 'fecha', s: ['start_date', 'fecha_de_entrada', 'entrada', 'check_in', 'checkin', 'llegada', 'fecha_entrada', 'fecha_llegada', 'desde', 'inicio', 'arrival', 'in'] },
  salida: { t: 'Salida (check-out)', v: 'fecha', s: ['end_date', 'fecha_de_salida', 'salida', 'check_out', 'checkout', 'fecha_salida', 'hasta', 'fin', 'departure', 'out', 'marcha'] },
  noches: { t: 'Noches', v: 'numero', s: ['noches', 'nights', 'n_noches', 'num_noches', 'estancia', 'dias'] },
  huespedes: { t: 'Nº de huéspedes', v: 'numero', s: ['huespedes', 'personas', 'pax', 'ocupantes', 'adultos', 'n_huespedes', 'num_personas', 'guests'] },
  canal: { t: 'Canal', v: 'texto', s: ['canal', 'plataforma', 'portal', 'origen', 'fuente', 'web', 'via', 'channel', 'agencia'] },
  comision: { t: 'Comisión', v: 'numero', s: ['service_fee', 'host_fee', 'importe_de_la_comision', 'comision', 'fee', 'comisiones', 'tarifa_servicio', 'comision_plataforma', 'gastos_plataforma'] },
  estado: { t: 'Estado (pagado / pendiente)', v: 'estado', s: ['estado', 'pagado', 'cobrado', 'situacion', 'pago', 'status', 'pagada', 'cobrada', 'abonado', 'ok'] },
  cobrado: { t: 'Importe cobrado', v: 'numero', s: ['paid_out', 'cobrado', 'importe_cobrado', 'pagado', 'recibido', 'abonado', 'importe_pagado'] },
  titular: { t: 'Titular / propietario', v: 'texto', s: ['titular', 'propietario', 'dueno', 'sociedad', 'empresa', 'a_nombre_de', 'owner'] },
  modalidad: { t: 'Tipo de alquiler', v: 'texto', s: ['modalidad', 'tipo', 'tipo_alquiler', 'tipo_de_alquiler', 'uso', 'regimen'] },
  refCatastral: { t: 'Ref. catastral', v: 'texto', s: ['ref_catastral', 'referencia_catastral', 'catastro', 'catastral'] },
  fechaCompra: { t: 'Fecha de compra', v: 'fecha', s: ['fecha_compra', 'fecha_adquisicion', 'adquisicion', 'compra', 'comprado'] },
  precioCompra: { t: 'Precio de compra', v: 'numero', s: ['precio_compra', 'precio_adquisicion', 'coste_compra', 'valor_compra', 'inversion', 'precio', 'compra'] },
  habitaciones: { t: 'Nº de habitaciones', v: 'numero', s: ['habitaciones', 'n_habitaciones', 'num_habitaciones', 'dormitorios', 'cuartos', 'rooms'] },
  entidad: { t: 'Banco', v: 'texto', s: ['entidad', 'banco', 'bank', 'caja', 'prestamista'] },
  capital: { t: 'Capital pendiente', v: 'numero', s: ['capital_pendiente', 'pendiente', 'deuda', 'capital', 'saldo_pendiente', 'importe_pendiente', 'principal', 'prestamo'] },
  tipoInteres: { t: 'Tipo de interés %', v: 'numero', s: ['tipo_interes', 'interes', 'tin', 'tae', 'tipo', 'euribor_diferencial', 'tipo_de_interes'] },
  cuota: { t: 'Cuota mensual', v: 'numero', s: ['cuota', 'cuota_mensual', 'mensualidad', 'pago_mensual', 'letra'] },
  finHipoteca: { t: 'Última cuota / vencimiento', v: 'fecha', s: ['vence', 'vencimiento_final', 'fecha_vencimiento', 'fin_prestamo', 'fin_hipoteca', 'fin', 'vencimiento', 'fecha_fin', 'ultima_cuota', 'hasta', 'plazo_hasta'] },
  notas: { t: 'Notas', v: 'texto', s: ['notas', 'observaciones', 'comentarios', 'obs', 'nota', 'comentario', 'notes'] },
};

// Qué puede contener cada hoja, sus columnas posibles y las imprescindibles.
const TIPOS = {
  gastos: { t: 'Gastos', campos: ['fecha', 'mes', 'piso', 'importe', 'concepto', 'categoria', 'proveedor', 'deducible', 'notas'], req: [['fecha', 'mes'], ['importe']], kw: ['gasto', 'factura', 'compra', 'pagos_realizados', 'reparacion', 'suministro', 'expenses', 'costes'] },
  cobros: { t: 'Ingresos / cobros de alquiler', campos: ['fecha', 'mes', 'piso', 'habitacion', 'inquilino', 'importe', 'concepto', 'estado', 'cobrado', 'notas'], req: [['fecha', 'mes'], ['importe']], kw: ['ingreso', 'cobro', 'renta', 'alquileres', 'recibo', 'mensualidad', 'income', 'cobrado'] },
  movimientos: { t: 'Movimientos (ingresos y gastos mezclados)', campos: ['fecha', 'mes', 'piso', 'concepto', 'importe', 'ingreso', 'gasto', 'categoria', 'proveedor', 'inquilino', 'notas'], req: [['fecha', 'mes'], ['importe', 'ingreso', 'gasto']], kw: ['movimiento', 'banco', 'extracto', 'cuenta', 'caja', 'contabilidad', 'cuentas', 'libro', 'diario', 'balance'] },
  reservas: { t: 'Reservas turísticas', campos: ['piso', 'huesped', 'telefono', 'canal', 'entrada', 'salida', 'noches', 'huespedes', 'importe', 'comision', 'estado', 'cobrado', 'notas'], req: [['entrada'], ['salida', 'noches']], kw: ['reserva', 'airbnb', 'booking', 'huesped', 'turistic', 'vacacional', 'estancia', 'ocupacion', 'bookings'] },
  contratos: { t: 'Inquilinos / contratos', campos: ['piso', 'habitacion', 'inquilino', 'telefono', 'email', 'dni', 'renta', 'diaPago', 'inicio', 'fin', 'fianza', 'notas'], req: [['inquilino'], ['renta']], kw: ['inquilino', 'contrato', 'arrendatario', 'tenant', 'alquilado', 'ocupante'] },
  pisos: { t: 'Pisos / inmuebles', campos: ['piso', 'direccion', 'titular', 'modalidad', 'habitaciones', 'refCatastral', 'fechaCompra', 'precioCompra', 'notas'], req: [['piso', 'direccion']], kw: ['piso', 'inmueble', 'propiedad', 'vivienda', 'cartera', 'activos', 'patrimonio'] },
  hipotecas: { t: 'Hipotecas / préstamos', campos: ['piso', 'entidad', 'capital', 'tipoInteres', 'cuota', 'finHipoteca', 'direccion', 'fechaCompra', 'precioCompra', 'notas'], req: [['capital', 'cuota'], ['tipoInteres']], kw: ['hipoteca', 'prestamo', 'financiacion', 'mortgage'] },
};
const ETIQUETA_TIPO = { ...Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [k, v.t])), meses: 'Tabla por meses (importes en columnas de meses)', ignorar: 'No importar esta hoja' };

/* ───────────── Utilidades ───────────── */

const vacio = (v) => v === '' || v == null;
const texto = (v) => (vacio(v) ? '' : String(v).trim());
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const ABREV = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, jan: 1, apr: 4, aug: 8, dec: 12 };

function numeroMes(palabra) {
  const w = normalizar(palabra);
  let i = MESES.indexOf(w);
  if (i < 0) i = MESES_EN.indexOf(w);
  if (i < 0 && w === 'setiembre') i = 8;
  if (i >= 0) return i + 1;
  if (w === 'sept') return 9;
  return w.length === 3 ? ABREV[w] || null : null;
}
/** Celda de cabecera que es un mes: «Enero», «ene-25», «Marzo 2025», «2025-03», «03/2025» o una fecha. */
function mesDeCelda(v, anioDefecto) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.slice(0, 7);
  const t = normalizar(v);
  if (!t) return null;
  let m = t.match(/^([a-z]+)_?(\d{2}|\d{4})?$/);
  if (m) {
    const n = numeroMes(m[1]);
    if (!n) return null;
    const y = m[2] ? (m[2].length === 2 ? `20${m[2]}` : m[2]) : anioDefecto;
    return y ? `${y}-${String(n).padStart(2, '0')}` : `????-${String(n).padStart(2, '0')}`;
  }
  m = t.match(/^(\d{4})_(\d{1,2})$/) || null;
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})_(\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${m[1].padStart(2, '0')}`;
  return null;
}
/** Número tal como lo escribe la gente: «1.234,50 €», «356.40 EUR», «(90,00)» = −90, «400 €/mes». */
function numL(v) {
  if (typeof v === 'number') return v;
  let t = String(v ?? '').trim().replace(/\s*(€|eur|euros?|\/\s*mes|al mes|mensuales?)\.?\s*$/i, '').replace(/^(€|eur)\s*/i, '').trim();
  let signo = 1;
  const par = t.match(/^\((.*)\)$/);
  if (par) { t = par[1]; signo = -1; }
  if (/^[+-]?\s*$/.test(t)) return NaN;
  const x = aNumero(t.replace(/^\+/, ''));
  return Number.isFinite(x) ? signo * x : NaN;
}
const MESES_TXT = { ...Object.fromEntries(MESES.map((m, i) => [m, i + 1])), setiembre: 9, ...ABREV, sept: 9 };
/**
 * Fecha escrita de cualquier forma: 05/01/2025, 01.03.2025, 2025/05/02, 1-feb-25, 3 de junio de 2025,
 * número de serie de Excel (si la columna es de fechas) y formato americano (mm/dd) si la columna lo usa.
 */
function fechaL(v, p = null) {
  if (vacio(v)) return null;
  if (typeof v === 'number') return p?.serial && v > 20000 && v < 80000 ? aFecha(v) : null;
  let t = String(v).trim().replace(/[ T]\d{1,2}:\d{2}(:\d{2})?(\s*[ap]\.?m\.?)?$/i, '');
  if (p?.us) { const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) t = `${m[2]}/${m[1]}/${m[3]}`; }
  const directa = aFecha(t);
  if (directa) return directa;
  let m = t.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) return aFecha(`${m[1]}-${m[2]}-${m[3]}`);
  const n = normalizar(t);
  m = n.match(/^(\d{1,2})_(?:de_)?([a-z]+)_(?:de_)?(\d{2,4})$/);
  if (m && MESES_TXT[m[2]] || m && MESES_TXT[m[2]?.slice(0, 3)]) {
    const mes = MESES_TXT[m[2]] || MESES_TXT[m[2].slice(0, 3)];
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return aFecha(`${y}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  }
  return null;
}
function mesDeValor(v, anio = String(new Date().getFullYear())) {
  const f = fechaL(v);
  if (f) return f.slice(0, 7);
  const m = mesDeCelda(v, anio);
  return m && !m.startsWith('?') ? m : null;
}
function estadoDe(v) {
  if (typeof v === 'number') return v > 0;
  const t = normalizar(v);
  if (!t) return null;
  if (/^(si|s|x|ok|1|true|verdadero|yes|y|hecho|pagad[oa]|cobrad[oa]|abonad[oa]|recibid[oa]|liquidad[oa]|completad[oa])$/.test(t) || /^(pagad|cobrad|abonad)/.test(t)) return true;
  if (/^(no|n|0|false|falso|pendiente|impagad[oa]|debe|sin_pagar|sin_cobrar|no_pagado|no_cobrado|retrasad[oa]|moroso)$/.test(t) || /pendiente|impag/.test(t)) return false;
  return null;
}

// Palabras vacías para comparar nombres de pisos
const VACIAS = new Set(['calle', 'c', 'cl', 'avda', 'av', 'avenida', 'plaza', 'pza', 'pl', 'paseo', 'de', 'del', 'la', 'el', 'los', 'las', 'n', 'no', 'num', 'numero', 'o', 'a', 'y', 'piso', 'planta', 'pta', 'puerta', 'esc', 'bajo']);
const tokens = (v) => normalizar(v).split('_').filter((x) => x && !VACIAS.has(x));
function mismoPiso(a, b) {
  const na = normalizar(a); const nb = normalizar(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = tokens(a); const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  // Los números (portal, piso, puerta) deben coincidir: «Mayor 12, 2.º A» no es «Mayor 12, 3.º A», ni «Sol 2» es «Sol 22»
  const na2 = ta.filter((x) => /\d/.test(x)); const nb2 = tb.filter((x) => /\d/.test(x));
  if (!(na2.every((x) => nb2.includes(x)) || nb2.every((x) => na2.includes(x)))) return false;
  if (na.length >= 5 && nb.length >= 5 && (na.includes(nb) || nb.includes(na))) return true;
  const comunes = ta.filter((x) => tb.includes(x)).length;
  return comunes / Math.max(ta.length, tb.length) >= 0.6 || (comunes === Math.min(ta.length, tb.length) && comunes >= 2);
}

/** «Luna 8 - Hab 2» → piso «Luna 8», habitación «Habitación 2». */
function separarHab(nombre) {
  const t = texto(nombre);
  const m = t.match(/^(.*?)[\s,;:–—-]*\b(hab(?:itaci[oó]n)?\.?|room|cuarto|dormitorio)\s*(?:n\.?º?\s*)?([A-Za-z]|\d{1,2})\s*$/i);
  if (m && m[1].trim().length >= 2) return { piso: m[1].trim(), hab: `Habitación ${m[3].toUpperCase()}` };
  return { piso: t, hab: '' };
}
/** «Hab. A», «habitacion a», «Room 1», «2» → «Habitación A», «Habitación 1», «Habitación 2». */
function normHab(v) {
  const t = texto(v);
  if (!t) return '';
  if (/^\d{1,2}$|^[A-Za-z]$/.test(t)) return `Habitación ${t.toUpperCase()}`;
  const m = t.match(/^(hab(?:itaci[oó]n)?\.?|room|cuarto|dormitorio)\s*(?:n\.?º?\s*)?([A-Za-z]|\d{1,2})$/i);
  return m ? `Habitación ${m[2].toUpperCase()}` : t;
}
/** Misma persona escrita distinto: «J. Ortega» = «Javier Ortega». */
function mismaPersona(a, b) {
  const ta = normalizar(a).split('_').filter(Boolean); const tb = normalizar(b).split('_').filter(Boolean);
  if (!ta.length || !tb.length) return false;
  if (ta.join('_') === tb.join('_')) return true;
  const corto = ta.length <= tb.length ? ta : tb; const largo = corto === ta ? tb : ta;
  return corto.every((x) => largo.some((y) => y === x || (x.length === 1 && y.startsWith(x)) || (y.length === 1 && x.startsWith(y))));
}

/** Categoría de gasto adivinada por el texto del concepto, la categoría o el proveedor. */
const PISTAS = [
  ['no_deducible', /hipoteca|prestamo|amortizacion_de_capital|multa|sancion|personal/],
  ['comunidad', /community|hoa|comunidad|cdad|derrama|administrador_de_fincas|cuota_comunit/],
  ['ibi', /property_tax|\bibi\b|^ibi|_ibi|contribucion|bienes_inmuebles/],
  ['tasas', /basura|tasa|residuo|vado|alcantarillado|impuesto_municipal/],
  ['seguro', /insurance|seguro|poliza|mapfre|axa|allianz|mutua|generali|linea_directa|ocaso|zurich|caser|santalucia|impago/],
  ['suministros', /electricity|water|power|utilities|\bluz|_luz|electric|endesa|iberdrola|naturgy|repsol_luz|holaluz|\bagua|_agua|canal_de_isabel|aigues|\bgas\b|_gas|butano|internet|fibra|movistar|vodafone|orange|digi|masmovil|jazztel|telefon|wifi|suministro|calefaccion/],
  ['limpieza', /cleaning|limpieza|lavanderia|sabana|toalla|planchado|limpiador/],
  ['consumibles', /menaje|amenities|consumible|papel_higienico|jabon|cafe|detergente|supermercado|mercadona|carrefour|lidl|bombilla/],
  ['comisiones', /comision|airbnb|booking|agencia|plataforma|vrbo|homeaway|idealista|fotocasa|inmobiliaria/],
  ['gestion', /gestor|asesor|gestoria|administra|honorario|contable|software|channel_manager|gestion/],
  ['juridico', /abogad|notari|registro|procurador|juicio|desahucio|burofax|legal|contrato_de/],
  ['financieros', /banco|bancari|comision_bancaria|interes|mantenimiento_cuenta|transferencia|tpv/],
  ['mobiliario', /furniture|mueble|ikea|sofa|cama|colchon|electrodomestico|lavadora|nevera|frigorifico|horno|television|\btv\b|microondas|lavavajillas|secadora|armario|mesa|silla|aire_acondicionado|vitro/],
  ['mejora', /reforma|obra|mejora|ampliacion|rehabilitacion|cambio_de_ventanas|instalacion_nueva/],
  ['reparacion', /repair|plumb|fix|maintenance|reparac|arreglo|fontaner|electricista|pintura|pintor|cerrajer|averia|mantenimiento|caldera|persiana|revision|desatasco|albanil|humedad|goteras|cristal/],
];
export function adivinarCategoria(...textos) {
  const directa = textos.map((x) => (x ? categoriaDe(x) : null)).find(Boolean);
  if (directa) return directa;
  const t = textos.filter(Boolean).map(normalizar).join('_');
  return PISTAS.find(([, re]) => re.test(t))?.[0] || 'otros_ded';
}
const esIngresoTexto = (t) => /alquiler|renta|ingreso|cobro|airbnb|booking|reserva|inquilino|mensualidad|huesped|fianza_recibida|deposito_recibido|abono_de/.test(normalizar(t)) && !/comision|gasto|pago_a/.test(normalizar(t));
const esTotal = (t) => /^(total|totales|suma|subtotal|saldo|beneficio|neto|resultado|balance|rentabilidad|diferencia|cash_?flow|media|promedio|acumulado|margen)/.test(normalizar(t));

/* ───────────── Análisis de una hoja ───────────── */

function tipoValor(v) {
  if (vacio(v)) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return 'fecha';
  if (typeof v === 'number') return 'numero';
  const t = String(v).trim();
  if (estadoDe(t) != null && !/^\d+$/.test(t)) return 'estado';
  if (fechaL(t) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(t)) return 'fecha';
  if (Number.isFinite(numL(t))) return 'numero';
  if (mesDeValor(t)) return 'mes';
  return 'texto';
}
function perfil(filas, col, titulo = '') {
  const p = { fecha: 0, numero: 0, estado: 0, texto: 0, mes: 0, n: 0, negativos: 0, positivos: 0, distintos: new Set(), ejemplos: [], us: false, serial: false, enteros: 0, grandes: 0 };
  let seriales = 0;
  for (const f of filas) {
    // Las filas de totales y notas no cuentan para saber qué hay en la columna
    const primero = f.find((c) => typeof c === 'string' && c && !/^\d{4}-\d{2}-\d{2}$/.test(c));
    if (primero && esTotal(primero)) continue;
    const v = f[col];
    if (typeof v === 'string') { const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}$/); if (m && +m[2] > 12 && +m[1] <= 12) p.us = true; }
    if (typeof v === 'number') { if (Number.isInteger(v)) p.enteros++; if (Math.abs(v) >= 1e6) p.grandes++; if (v > 20000 && v < 80000) seriales++; }
    const k = tipoValor(v);
    if (!k) continue;
    p[k]++; p.n++;
    if (k === 'numero') { const x = numL(v); if (x < 0) p.negativos++; else if (x > 0) p.positivos++; }
    if (p.distintos.size < 60) p.distintos.add(normalizar(v));
    if (p.ejemplos.length < 3 && !p.ejemplos.includes(String(v))) p.ejemplos.push(String(v));
  }
  // Números de serie de Excel en una columna titulada como fecha (sin formato de fecha)
  const esFecha = ['fecha', 'entrada', 'salida', 'inicio', 'fin', 'fechaCompra', 'finHipoteca'].some((c) => puntuaTitulo(titulo, c) >= 2);
  if (esFecha && seriales && seriales >= p.numero * 0.8) { p.serial = true; p.fecha += seriales; p.numero -= seriales; }
  const n = p.n || 1;
  for (const k of ['fecha', 'numero', 'estado', 'texto', 'mes']) p[`p_${k}`] = p[k] / n;
  return p;
}
// Columnas que tienen números pero no son importes: saldos, nº de reserva, de asiento, códigos…
const NO_IMPORTE = /(^|_)(saldo|balance|acumulado|disponible|n|no|nro|num|numero|id|codigo|cod|ref|referencia|asiento|localizador|confirmacion|confirmation|code|cp|codigo_postal|telefono|movil|dni|nif|ano|anio|year|mes|dia)(_|$)/;
const ES_IMPORTE = new Set(['importe', 'ingreso', 'gasto', 'cobrado', 'renta', 'fianza', 'comision', 'capital', 'cuota', 'precioCompra']);
function compatible(campo, p, titulo = '', fuerte = false) {
  if (!p.n) return 0;
  if (ES_IMPORTE.has(campo) && (NO_IMPORTE.test(normalizar(titulo)) && !/importe|precio|total|cantidad|renta|alquiler|comision|cuota|fianza/.test(normalizar(titulo)) || p.grandes > p.numero * 0.5)) return 0;
  switch (CAMPOS[campo].v) {
    case 'fecha': return p.p_fecha >= 0.6 ? 1 : 0;
    case 'mes': return p.p_fecha + p.p_mes >= 0.6 ? 1 : 0;
    case 'numero': return p.p_numero >= (fuerte ? 0.5 : 0.7) ? 1 : 0;
    case 'estado': return p.p_estado >= 0.6 || (p.p_texto >= 0.6 && p.distintos.size <= 6) ? 1 : 0;
    default: return p.p_texto + p.p_estado * 0.5 + (campo === 'telefono' || campo === 'dni' || campo === 'piso' || campo === 'habitacion' ? p.p_numero : 0) >= 0.4 ? 1 : 0;
  }
}
function puntuaTitulo(titulo, campo) {
  const h = normalizar(titulo);
  if (!h) return 0;
  let best = 0;
  for (const syn of CAMPOS[campo].s) {
    if (h === syn) best = Math.max(best, 3);
    else if (h.startsWith(`${syn}_`) || h.endsWith(`_${syn}`) || h.split('_').includes(syn)) best = Math.max(best, 2.2);
    else if (syn.length >= 4 && h.includes(syn)) best = Math.max(best, 1.4);
  }
  return best;
}

/** Fila de cabecera: la que mejor parece una fila de títulos en las primeras 25. */
function buscarCabecera(filas) {
  let mejor = -1; let puntos = 0;
  for (let r = 0; r < Math.min(25, filas.length); r++) {
    const f = filas[r] || [];
    const llenas = f.filter((c) => !vacio(c));
    if (llenas.length < 2) continue;
    const textos = llenas.filter((c) => typeof c === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(c) && !Number.isFinite(numL(c)));
    if (textos.length / llenas.length < 0.6) continue;
    const hayDatos = filas.slice(r + 1, r + 6).some((g) => (g || []).filter((c) => !vacio(c)).length >= 2);
    if (!hayDatos) continue;
    const aciertos = textos.filter((c) => Object.keys(CAMPOS).some((k) => puntuaTitulo(c, k) >= 2)).length;
    const meses = textos.filter((c) => mesDeCelda(c, '2000')).length;
    const p = aciertos * 3 + Math.max(0, meses - 2) * 3 + textos.length;
    if (p > puntos) { puntos = p; mejor = r; }
  }
  return mejor;
}

/** Asigna columnas a campos del tipo indicado. Devuelve { campo: índice de columna }. */
function mapear(hoja, tipo) {
  const T = TIPOS[tipo];
  if (!T) return {};
  const cand = [];
  hoja.columnas.forEach((c, i) => {
    for (const campo of T.campos) {
      const tit = puntuaTitulo(c.titulo, campo);
      if (!tit) continue;
      if (!compatible(campo, c.perfil, c.titulo, tit >= 3)) continue;
      cand.push({ i, campo, p: tit + (campo === 'importe' && tipo !== 'movimientos' ? 0.2 : 0) });
    }
  });
  cand.sort((a, b) => b.p - a.p);
  const map = {}; const usadas = new Set();
  for (const { i, campo } of cand) if (!(campo in map) && !usadas.has(i)) { map[campo] = i; usadas.add(i); }
  const libres = hoja.columnas.map((c, i) => i).filter((i) => !usadas.has(i) && hoja.columnas[i].perfil.n);
  const tomar = (campo, cond) => {
    if (campo in map || !T.campos.includes(campo)) return;
    const i = libres.find((j) => !usadas.has(j) && cond(hoja.columnas[j].perfil) && (!ES_IMPORTE.has(campo) || compatible(campo, hoja.columnas[j].perfil, hoja.columnas[j].titulo)));
    if (i != null) { map[campo] = i; usadas.add(i); }
  };
  // Sin título reconocible: se deduce por los valores
  if (tipo === 'reservas') { tomar('entrada', (p) => p.p_fecha >= 0.8); tomar('salida', (p) => p.p_fecha >= 0.8); }
  if (tipo === 'contratos') { tomar('inicio', (p) => p.p_fecha >= 0.8); tomar('fin', (p) => p.p_fecha >= 0.8); }
  tomar('fecha', (p) => p.p_fecha >= 0.8);
  tomar(tipo === 'contratos' ? 'renta' : tipo === 'hipotecas' ? 'capital' : 'importe', (p) => p.p_numero >= 0.8 && p.distintos.size > 1);
  if (tipo === 'contratos') tomar('inquilino', (p) => p.p_texto >= 0.8 && p.distintos.size > 1);
  if (tipo === 'reservas') tomar('huesped', (p) => p.p_texto >= 0.8 && p.distintos.size > 1);
  if (tipo === 'pisos') tomar('piso', (p) => p.p_texto >= 0.8);
  tomar('concepto', (p) => p.p_texto >= 0.8 && p.distintos.size > 1);
  return map;
}
function cumple(tipo, map) { return TIPOS[tipo].req.every((alt) => alt.some((c) => c in map)); }

const PALABRAS_GENERICAS = /^(hoja|sheet|tabla|datos|resumen|data|libro|export|informe|general|todo|hoja_?\d+|sheet_?\d+|\d{4}|ano|anio|year)/;
/** ¿El nombre de la hoja parece el de un piso? (p. ej. «Calle Mayor 12», «Piso 3», «Ático Centro») */
function hojaEsPiso(nombre) {
  const t = normalizar(nombre);
  if (!t || PALABRAS_GENERICAS.test(t)) return false;
  if (mesDeCelda(nombre, '2000') || /trimestre|semestre|^[qt]_?\d(_|$)|^\d{1,2}_?[qt]|^mes(_|$)|^ano(_|$)/.test(t)) return false;
  if (Object.values(TIPOS).some((T) => T.kw.some((k) => t.includes(k))) && !/^piso_?\w+$/.test(t)) return false;
  return /[a-z]/.test(t);
}
function puntuaNombre(nombre, tipo) {
  const t = normalizar(nombre);
  return TIPOS[tipo].kw.some((k) => t.includes(k)) ? 1 : 0;
}

/** Analiza todas las hojas y propone cómo importarlas. */
export function analizar(libro, s) {
  const hojas = [];
  // Año más frecuente en las fechas del libro (para tablas por meses sin año)
  const anios = {};
  for (const filas of Object.values(libro)) for (const f of filas.slice(0, 2000)) for (const c of f || []) {
    const y = typeof c === 'string' ? (c.match(/^(20\d{2})-\d{2}-\d{2}$/)?.[1] || c.match(/\b\d{1,2}[/.-]\d{1,2}[/.-](20\d{2})\b/)?.[1]) : null;
    if (y) anios[y] = (anios[y] || 0) + 1;
  }
  const anioLibro = Object.entries(anios).sort((a, b) => b[1] - a[1])[0]?.[0] || String(new Date().getFullYear());
  for (const [nombre, filasBrutas] of Object.entries(libro)) {
    // Array.from: las filas y celdas vacías pueden venir como huecos
    const filas = Array.from(filasBrutas || [], (f) => Array.from(f || [], (v) => (v == null ? '' : typeof v === 'string' ? v.trim() : v)));
    if (!filas.some((f) => f.some((c) => !vacio(c)))) continue;
    if (['listas', 'leeme', 'instrucciones'].includes(normalizar(nombre))) continue;
    const cab = buscarCabecera(filas);
    const h = { nombre, filas, cab, columnas: [], datos: [], tipo: 'ignorar', map: {}, pisoDefecto: '', anio: anioLibro, modo: 'auto', etiquetas: 'auto' };
    // Año: en el nombre de la hoja o en las primeras filas
    const anio = [nombre, ...filas.slice(0, Math.max(1, cab + 1)).flat()].map((x) => String(x).match(/\b(20\d{2})\b/)?.[1]).find(Boolean);
    if (anio) h.anio = anio;
    const construir = () => {
      const ancho = Math.max(0, ...h.filas.slice(h.cab, h.cab + 300).map((f) => f.length));
      h.datos = h.filas.slice(h.cab + 1).filter((f) => f.some((c) => !vacio(c)));
      h.columnas = [];
      for (let i = 0; i < ancho; i++) {
        const titulo = texto(h.filas[h.cab][i]) || `Columna ${i + 1}`;
        h.columnas.push({ titulo, perfil: perfil(h.datos.slice(0, 400), i, titulo), mes: mesDeCelda(h.filas[h.cab][i], h.anio) });
      }
    };
    if (cab >= 0) {
      construir();
      let colMeses = h.columnas.filter((c) => c.mes).length;
      // Tabla girada: meses en las filas (primera columna) y pisos o conceptos en las columnas
      // (solo con nombres de mes, no fechas completas, y un mes distinto por fila)
      const mesesFila = h.datos.map((f) => (typeof f[0] === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(f[0]) ? mesDeCelda(f[0], h.anio) : null)).filter(Boolean);
      const enFilas = new Set(mesesFila).size === mesesFila.length ? mesesFila.length : 0;
      if (colMeses < 3 && enFilas >= 3 && enFilas >= h.datos.filter((f) => !esTotal(texto(f[0]))).length * 0.6) {
        const tabla = [filas[cab], ...h.datos];
        const ancho2 = Math.max(...tabla.map((f) => f.length));
        h.filas = Array.from({ length: ancho2 }, (_, j) => tabla.map((f) => f[j] ?? ''));
        h.cab = 0;
        h.transpuesta = true;
        construir();
        colMeses = h.columnas.filter((c) => c.mes).length;
      }
      if (colMeses >= 3) {
        h.tipo = 'meses';
        const esIng = puntuaNombre(nombre, 'cobros'); const esGas = puntuaNombre(nombre, 'gastos');
        h.modo = esIng && !esGas ? 'ingresos' : esGas && !esIng ? 'gastos' : 'auto';
      } else {
        let mejor = null;
        for (const tipo of Object.keys(TIPOS)) {
          const map = mapear(h, tipo);
          if (!cumple(tipo, map)) continue;
          const calidad = Object.keys(map).reduce((a, c) => a + puntuaTitulo(h.columnas[map[c]].titulo, c), 0);
          let p = calidad + puntuaNombre(nombre, tipo) * 6;
          // Desempates habituales
          if (tipo === 'movimientos' && ('ingreso' in map && 'gasto' in map)) p += 6;
          if (tipo === 'movimientos' && 'importe' in map && h.columnas[map.importe].perfil.negativos && h.columnas[map.importe].perfil.positivos) p += 4;
          if (tipo === 'cobros' && 'inquilino' in map) p += 3;
          if (tipo === 'gastos' && ('proveedor' in map || 'categoria' in map)) p += 2;
          if (tipo === 'pisos' && ('fecha' in mapear(h, 'gastos') || 'importe' in mapear(h, 'gastos'))) p -= 4;
          if (tipo === 'contratos' && 'renta' in map && puntuaTitulo(h.columnas[map.renta].titulo, 'renta') >= 2) p += 2;
          if (!mejor || p > mejor.p) mejor = { tipo, map, p };
        }
        if (mejor) { h.tipo = mejor.tipo; h.map = mejor.map; }
      }
    }
    hojas.push(h);
  }
  // Pisos detectados: los de la app, los de las columnas «piso» y los nombres de hoja que lo parecen
  const clave = (nombre) => (s?.pisos || []).find((p) => mismoPiso(p.nombre, nombre))?.id || `nuevo:${nombre}`;
  const turisticos = [...new Set([
    ...(s?.pisos || []).filter((p) => p.modalidad === 'turistico').map((p) => p.id),
    ...hojas.filter((h) => hojaEsPiso(h.nombre) && h.datos.some((f) => f.some((c) => typeof c === 'string' && /airbnb|booking|reserva|huesped|turist/.test(normalizar(c))))).map((h) => clave(h.nombre)),
  ])];
  for (const h of hojas) {
    // Columna de piso con un único piso: las filas que lo dejan vacío son de ese piso
    if (TIPOS[h.tipo] && 'piso' in h.map) {
      const distintos = [...new Set(h.datos.map((f) => separarHab(f[h.map.piso]).piso).filter((t) => t && !esTotal(t)).map(normalizar))];
      if (distintos.length === 1) { const t = h.datos.map((f) => separarHab(f[h.map.piso]).piso).find((x) => normalizar(x) === distintos[0]); h.pisoDefecto = clave(t); }
      continue;
    }
    const necesita = h.tipo === 'meses' || (TIPOS[h.tipo] && h.tipo !== 'pisos' && !('piso' in h.map));
    if (!necesita) continue;
    if (hojaEsPiso(h.nombre)) h.pisoDefecto = clave(h.nombre);
    else if (h.tipo === 'reservas' && turisticos.length === 1) h.pisoDefecto = turisticos[0];
    else if (s?.pisos?.length === 1) h.pisoDefecto = s.pisos[0].id;
  }
  return hojas;
}

/** Tabla por meses: columnas de mes y texto de cada fila. */
function columnasMeses(h) {
  const cols = h.columnas.map((c, i) => ({ i, mes: mesDeCelda(h.filas[h.cab][i], h.anio) })).filter((c) => c.mes && !c.mes.startsWith('?'));
  const iEtiqueta = h.columnas.findIndex((c, i) => i < (cols[0]?.i ?? 1) && c.perfil.p_texto >= 0.5);
  return { cols, iEtiqueta, etiquetaDe: (f) => texto(f[iEtiqueta >= 0 ? iEtiqueta : 0]) };
}
const PARECE_PISO = /^(piso|apartamento|apto|casa|atico|estudio|local|vivienda|chalet|duplex|loft|habitacion)(_|$)/;
/** ¿Las filas de una tabla por meses son pisos (y no conceptos)? */
function filasSonPisos(h, conocidos) {
  if (h.etiquetas !== 'auto') return h.etiquetas === 'pisos';
  const { etiquetaDe, iEtiqueta } = columnasMeses(h);
  if (iEtiqueta >= 0 && puntuaTitulo(h.columnas[iEtiqueta].titulo, 'piso') >= 2) return true;
  const et = h.datos.map(etiquetaDe).filter((t) => t && !esTotal(t) && !/^(ingreso|gasto)s?$/.test(normalizar(t)));
  const pareceDir = (t) => h.transpuesta && /[a-z].*\d/.test(normalizar(t)) && !/\b20\d{2}\b/.test(t);
  return et.length > 0 && et.filter((t) => conocidos.some((n) => mismoPiso(n, t)) || PARECE_PISO.test(normalizar(t)) || pareceDir(t)).length / et.length >= 0.6;
}

/** Todos los nombres de piso que aparecen en el libro, tal cual están escritos (sin repetir). */
function nombresCrudos(hojas, s) {
  const lista = [];
  const add = (n) => { const t = separarHab(n).piso; if (t && !esTotal(t) && !lista.some((x) => normalizar(x) === normalizar(t))) lista.push(t); };
  const conocidos = [...(s?.pisos || []).map((p) => p.nombre), ...hojas.filter((x) => hojaEsPiso(x.nombre)).map((x) => x.nombre)];
  for (const h of hojas) {
    if (h.tipo === 'ignorar') continue;
    if (h.tipo === 'meses' && filasSonPisos(h, conocidos)) { const { etiquetaDe, cols } = columnasMeses(h); for (const f of h.datos) if (cols.some((c) => !vacio(f[c.i]))) add(etiquetaDe(f)); continue; }
    if ('piso' in h.map) for (const f of h.datos) add(f[h.map.piso]);
    else if (h.tipo === 'pisos' && 'direccion' in h.map) for (const f of h.datos) add(f[h.map.direccion]);
    if (h.pisoDefecto?.startsWith('nuevo:')) add(h.pisoDefecto.slice(6));
  }
  return lista.slice(0, 300);
}

/** Propone a qué piso de la app corresponde cada nombre: uno existente, «igual que» otro del Excel o uno nuevo. */
function proponerAsignacion(crudos, s, previa = new Map()) {
  const asig = new Map();
  crudos.forEach((t, i) => {
    const k = normalizar(t);
    if (previa.has(k)) { asig.set(k, previa.get(k)); return; }
    const exacto = (s?.pisos || []).find((p) => normalizar(p.nombre) === k);
    if (exacto) { asig.set(k, exacto.id); return; }
    const hermano = crudos.slice(0, i).find((o) => mismoPiso(o, t));
    if (hermano) {
      const ha = asig.get(normalizar(hermano));
      asig.set(k, ha && ha !== 'nuevo' && !ha.startsWith('igual:') ? ha : `igual:${normalizar(hermano)}`);
      return;
    }
    const ex = (s?.pisos || []).filter((p) => mismoPiso(p.nombre, t) || (p.direccion && mismoPiso(p.direccion, t)));
    asig.set(k, ex.length === 1 ? ex[0].id : 'nuevo');
  });
  return asig;
}

/* ───────────── Conversión a las hojas de la app ───────────── */

function convertir(hojas, s, asignacion = new Map()) {
  const out = { pisos: [], unidades: [], contratos: [], gastos: [], cobros: [], reservas: [], hipotecas: [] };
  const notas = []; const avisos = [];
  let duplicados = 0; let omitidas = 0; let abonos = 0;
  const hoy = today();
  // Pisos: existentes + nuevos (con lo que se sabe de ellos para decidir modalidad)
  const nuevos = []; // { nombre, datos: {}, reservas: 0, habitaciones: Set }
  const crudoDe = new Map(); // nombre normalizado → texto original del Excel
  const resolverPiso = (nombre) => {
    let t = separarHab(nombre).piso;
    if (!t) return null;
    // Lo elegido en el asistente: un piso de la app, el mismo que otro nombre del Excel o uno nuevo
    let a = asignacion.get(normalizar(t));
    for (let i = 0; i < 6 && a?.startsWith('igual:'); i++) { const k = a.slice(6); t = crudoDe.get(k) || t; a = asignacion.get(k); }
    if (a && a !== 'nuevo') { const p = (s.pisos || []).find((x) => x.id === a); if (p) return { nombre: p.nombre, existente: p }; }
    if (a === 'nuevo') {
      let n = nuevos.find((x) => normalizar(x.nombre) === normalizar(t));
      if (!n) { n = { nombre: t, datos: {}, reservas: 0, habitaciones: new Set(), contratos: 0 }; nuevos.push(n); }
      return { nombre: n.nombre, nuevo: n };
    }
    const ex = (s.pisos || []).find((p) => normalizar(p.nombre) === normalizar(t)) || (s.pisos || []).find((p) => mismoPiso(p.nombre, t) || (p.direccion && mismoPiso(p.direccion, t)));
    if (ex) return { nombre: ex.nombre, existente: ex };
    let n = nuevos.find((x) => mismoPiso(x.nombre, t));
    if (!n) { n = { nombre: t, datos: {}, reservas: 0, habitaciones: new Set(), contratos: 0 }; nuevos.push(n); }
    return { nombre: n.nombre, nuevo: n };
  };
  for (const h of hojas) for (const n of nombresCrudos([h], s)) crudoDe.set(normalizar(n), n);
  const pisoDe = (h, f) => {
    if ('piso' in h.map && !vacio(f[h.map.piso])) return { ...resolverPiso(f[h.map.piso]), hab: separarHab(f[h.map.piso]).hab };
    const d = h.pisoDefecto;
    if (!d) return resolverPiso('Piso sin asignar');
    if (d.startsWith('nuevo:')) return resolverPiso(d.slice(6));
    const p = s.pisos.find((x) => x.id === d);
    return p ? { nombre: p.nombre, existente: p } : resolverPiso('Piso sin asignar');
  };
  const v = (h, f, campo) => (campo in h.map ? f[h.map[campo]] : '');
  const existeGasto = (p, fecha, importe, concepto) => p.existente && s.gastos.some((g) => g.pisoId === p.existente.id && g.fecha === fecha && Math.abs(g.importe - importe) < 0.005 && (!concepto || normalizar(g.concepto) === normalizar(concepto)));
  // Ya está si hay un cobro de ese piso, mes e importe del mismo pagador (o un recibo ya cobrado)
  const existeCobro = (p, periodo, importe, quien) => {
    if (!p.existente) return false;
    const delMes = s.cobros.filter((c) => c.pisoId === p.existente.id && c.periodo === periodo && !c.anulado);
    if (delMes.some((c) => {
      if (Math.abs(c.importe - importe) >= 0.005) return false;
      if (c.auto) return num(c.cobrado) > 0; // recibo ya cobrado de ese mes e importe: es el mismo pago
      const de = c.pagador || (s.contratos || []).find((k) => k.id === c.contratoId)?.inquilino || '';
      return !quien || !de || mismaPersona(de, quien);
    })) return true;
    // Total del piso en un mes (p. ej. la suma de las habitaciones) que ya está cobrado recibo a recibo
    const suma = delMes.reduce((a, c) => a + num(c.cobrado), 0);
    return !quien && delMes.length > 1 && Math.abs(suma - importe) < 0.5;
  };

  const gasto = (p, fecha, importe, concepto, extra = {}) => {
    importe = r2(Math.abs(importe));
    if (!(importe > 0) || !fecha) { omitidas++; return; }
    if (typeof p === 'function') p = p(); // el piso se resuelve solo si la fila vale (no crea pisos por filas de notas)
    if (existeGasto(p, fecha, importe, concepto)) { duplicados++; return; }
    const cat = adivinarCategoria(extra.categoria, concepto, extra.proveedor);
    if (cat === 'no_deducible' && /hipoteca|prestamo/.test(normalizar(`${concepto} ${extra.categoria || ''}`))) out._hipotecaComoGasto = true;
    out.gastos.push({ Fecha: fecha, Piso: p.nombre, Categoría: CAT[cat].nombre, Concepto: texto(concepto) || CAT[cat].nombre, Proveedor: texto(extra.proveedor), Importe: importe, Deducible: extra.deducible == null ? '' : extra.deducible ? 'sí' : 'no' });
  };
  const cobro = (p, fecha, periodo, importe, quien, concepto, cobrado, extra = {}) => {
    importe = r2(Math.abs(importe));
    periodo = periodo || fecha?.slice(0, 7);
    if (!(importe > 0) || !periodo) { omitidas++; return; }
    if (typeof p === 'function') p = p();
    if (existeCobro(p, periodo, importe, quien)) { duplicados++; return; }
    const fila = { Piso: p.nombre, Pagador: texto(quien), Concepto: texto(concepto) || `Renta ${mesLargo(periodo).toLowerCase()}`, Mes: periodo, Importe: importe, Vencimiento: fecha || `${periodo}-01`, Cobrado: cobrado == null ? importe : cobrado === true ? importe : cobrado === false ? 0 : r2(Math.min(importe, cobrado)) };
    const hab = normHab(extra.habitacion) || p.hab;
    if (hab) fila['Habitación'] = hab;
    if (fila.Cobrado > 0) fila['Fecha de cobro'] = fecha || `${periodo}-01`;
    fila._inquilino = texto(quien);
    out.cobros.push(fila);
  };

  for (const h of hojas) {
    if (h.tipo === 'ignorar') continue;
    if (h.tipo === 'meses') { convertirMeses(h); continue; }
    for (const f of h.datos) {
      // Filas de totales
      const primerTexto = f.find((c) => typeof c === 'string' && c && !/^\d{4}-\d{2}-\d{2}$/.test(c));
      if (primerTexto && esTotal(primerTexto)) continue;
      const pisoTxt = 'piso' in h.map ? texto(f[h.map.piso]) : '';
      if (pisoTxt && esTotal(pisoTxt)) continue;
      const fecha = fe('fecha') || (('mes' in h.map) && mesDeValor(v(h, f, 'mes'), h.anio) ? `${mesDeValor(v(h, f, 'mes'), h.anio)}-01` : null);
      const periodo = 'mes' in h.map ? mesDeValor(v(h, f, 'mes'), h.anio) : null;
      const n = (c) => { const x = v(h, f, c); return vacio(x) ? null : numL(x); };
      function fe(c) { return fechaL(v(h, f, c), c in h.map ? h.columnas[h.map[c]]?.perfil : null); }
      switch (h.tipo) {
        case 'gastos': {
          const p = () => pisoDe(h, f); const imp = n('importe');
          if (!Number.isFinite(imp)) { omitidas++; break; }
          const col = h.columnas[h.map.importe]?.perfil;
          if (imp < 0 && col?.positivos > col?.negativos) { abonos++; break; } // devolución o abono entre gastos
          gasto(p, fecha, imp, v(h, f, 'concepto') || v(h, f, 'notas'), { categoria: v(h, f, 'categoria'), proveedor: v(h, f, 'proveedor'), deducible: 'deducible' in h.map ? estadoDe(v(h, f, 'deducible')) : null });
          break;
        }
        case 'cobros': {
          const p = () => pisoDe(h, f); const imp = n('importe');
          if (!Number.isFinite(imp)) { omitidas++; break; }
          const col = h.columnas[h.map.importe]?.perfil;
          if (imp < 0 && col?.positivos > col?.negativos) { abonos++; break; }
          const cobrado = 'cobrado' in h.map && Number.isFinite(n('cobrado')) ? n('cobrado') : 'estado' in h.map ? estadoDe(v(h, f, 'estado')) : null;
          cobro(p, fecha, periodo, imp, v(h, f, 'inquilino'), v(h, f, 'concepto'), cobrado, { habitacion: v(h, f, 'habitacion') });
          break;
        }
        case 'movimientos': {
          const p = () => pisoDe(h, f);
          const ing = n('ingreso'); const gas = n('gasto'); const imp = n('importe');
          const concepto = v(h, f, 'concepto') || v(h, f, 'notas');
          if (Number.isFinite(ing) && ing) cobro(p, fecha, periodo, ing, v(h, f, 'inquilino'), concepto, true);
          if (Number.isFinite(gas) && gas) gasto(p, fecha, gas, concepto, { categoria: v(h, f, 'categoria'), proveedor: v(h, f, 'proveedor') });
          if (!Number.isFinite(ing) && !Number.isFinite(gas)) {
            if (!Number.isFinite(imp) || !imp) { omitidas++; break; }
            // Signo: negativo = gasto. Si todos son positivos, se decide por el concepto.
            const col = h.columnas[h.map.importe]?.perfil;
            const esIngreso = col?.negativos ? imp > 0 : esIngresoTexto(`${concepto} ${v(h, f, 'categoria')}`);
            if (esIngreso) cobro(p, fecha, periodo, imp, v(h, f, 'inquilino'), concepto, true);
            else gasto(p, fecha, imp, concepto, { categoria: v(h, f, 'categoria'), proveedor: v(h, f, 'proveedor') });
          }
          break;
        }
        case 'reservas': {
          // Filas de pagos y ajustes de las exportaciones de Airbnb / Booking
          if (f.some((c) => typeof c === 'string' && /^(payout|adjustment|resolution|pago_recibido|ajuste|transferencia|liquidacion)/.test(normalizar(c)))) { omitidas++; break; }
          const entrada = fe('entrada');
          let salida = fe('salida');
          if (!salida && entrada && n('noches') > 0) salida = addDays(entrada, n('noches') | 0);
          const imp = n('importe');
          if (!entrada || !salida || !(salida > entrada)) { omitidas++; break; }
          const p = pisoDe(h, f);
          if (p.existente && s.reservas.some((r) => r.pisoId === p.existente.id && r.entrada === entrada && r.salida === salida)) { duplicados++; break; }
          if (p.nuevo) p.nuevo.reservas++;
          const est = 'estado' in h.map ? estadoDe(v(h, f, 'estado')) : null;
          const importe = Number.isFinite(imp) ? r2(Math.abs(imp)) : 0;
          const cobrado = 'cobrado' in h.map && Number.isFinite(n('cobrado')) ? n('cobrado') : est === false ? 0 : est === true || entrada <= hoy ? importe : 0;
          const pista = `${h.nombre} ${h.archivo || ''} ${h.columnas.map((c) => c.titulo).join(' ')}`;
          const canal = texto(v(h, f, 'canal')) || (/airbnb/i.test(pista) ? 'Airbnb' : /booking/i.test(pista) ? 'Booking' : '');
          const cancelada = f.some((c) => typeof c === 'string' && /^(cancel|anulad)/.test(normalizar(c)));
          out.reservas.push({ Piso: p.nombre, Huésped: texto(v(h, f, 'huesped')) || 'Huésped', Teléfono: texto(v(h, f, 'telefono')), Canal: canal ? canalDe(/airbnb/i.test(canal) ? 'Airbnb' : /booking/i.test(canal) ? 'Booking' : /direct|particular|whats|telef/i.test(canal) ? 'Directo' : canal) : '', Entrada: entrada, Salida: salida, Huéspedes: Number.isFinite(n('huespedes')) ? n('huespedes') : '', 'Importe total': importe, Comisión: Number.isFinite(n('comision')) ? r2(Math.abs(n('comision'))) : '', Cobrado: cancelada ? 0 : r2(cobrado), Cancelada: cancelada ? 'sí' : '', Notas: texto(v(h, f, 'notas')) });
          break;
        }
        case 'contratos': {
          const inquilino = texto(v(h, f, 'inquilino'));
          const renta = n('renta');
          if (!inquilino || !(renta > 0)) {
            // Habitación libre («(libre)», sin renta): la habitación sí existe
            const habL = normHab(v(h, f, 'habitacion'));
            if (habL && ('piso' in h.map ? !vacio(f[h.map.piso]) : h.pisoDefecto)) { const pl = pisoDe(h, f); if (pl?.nuevo) pl.nuevo.habitaciones.add(habL); }
            else omitidas++;
            break;
          }
          const p = pisoDe(h, f);
          if (out.contratos.some((x) => x.Piso === p.nombre && mismaPersona(x.Inquilino, inquilino))) { duplicados++; break; }
          const fila = { Piso: p.nombre, Inquilino: inquilino, Teléfono: texto(v(h, f, 'telefono')), Email: texto(v(h, f, 'email')), DNI: texto(v(h, f, 'dni')), 'Renta inicial': r2(renta), 'Día de pago': n('diaPago') > 0 ? Math.min(31, n('diaPago') | 0) : '', Inicio: fe('inicio') || '', Fin: fe('fin') || '', Fianza: Number.isFinite(n('fianza')) ? r2(n('fianza')) : '', Notas: texto(v(h, f, 'notas')) };
          const hab = normHab(v(h, f, 'habitacion')) || p.hab;
          if (hab) { fila['Habitación'] = hab; if (p.nuevo) p.nuevo.habitaciones.add(hab); }
          if (p.nuevo) p.nuevo.contratos++;
          const ex = p.existente && s.contratos.find((k) => k.pisoId === p.existente.id && mismaPersona(k.inquilino, inquilino));
          if (ex) { fila.ID = ex.id; for (const k of Object.keys(fila)) if (fila[k] === '' && k !== 'ID') delete fila[k]; }
          out.contratos.push(fila);
          break;
        }
        case 'pisos': {
          const nombre = texto(v(h, f, 'piso')) || texto(v(h, f, 'direccion'));
          if (!nombre || esTotal(nombre)) { omitidas++; break; }
          const p = resolverPiso(nombre);
          const d = { Dirección: texto(v(h, f, 'direccion')), Titular: texto(v(h, f, 'titular')), 'Ref. catastral': texto(v(h, f, 'refCatastral')), 'Fecha adquisición': fe('fechaCompra') || '', 'Precio adquisición': Number.isFinite(n('precioCompra')) ? n('precioCompra') : '', Notas: texto(v(h, f, 'notas')) };
          const mod = normalizar(v(h, f, 'modalidad'));
          if (mod) d.Modalidad = /habitac/.test(mod) ? 'Por habitaciones' : /turist|vacacion|airbnb|booking|corta/.test(mod) ? 'Turístico' : 'Tradicional';
          if (n('habitaciones') > 0) d['Nº habitaciones (al crear)'] = n('habitaciones') | 0;
          if (p.existente) {
            const fila = { ID: p.existente.id };
            for (const [k, x] of Object.entries(d)) if (x !== '' && k !== 'Modalidad' && k !== 'Nº habitaciones (al crear)') fila[k] = x;
            out.pisos.push(fila);
          } else Object.assign(p.nuevo.datos, Object.fromEntries(Object.entries(d).filter(([, x]) => x !== '')));
          break;
        }
        case 'hipotecas': {
          let tipo = n('tipoInteres'); const capital = n('capital'); const cuota = n('cuota');
          const hayPiso = 'piso' in h.map && !vacio(f[h.map.piso]);
          if (!hayPiso && (!Number.isFinite(tipo) || !(capital > 0 || cuota > 0))) { omitidas++; break; }
          const p = pisoDe(h, f);
          // Datos del piso que vengan en la misma hoja (dirección, compra)
          const dp = { Dirección: texto(v(h, f, 'direccion')), 'Fecha adquisición': fe('fechaCompra') || '', 'Precio adquisición': Number.isFinite(n('precioCompra')) ? n('precioCompra') : '' };
          const dpOk = Object.fromEntries(Object.entries(dp).filter(([, x]) => x !== ''));
          if (Object.keys(dpOk).length) { if (p.nuevo) Object.assign(p.nuevo.datos, dpOk); else out.pisos.push({ ID: p.existente.id, ...dpOk }); }
          if (!Number.isFinite(tipo) || !(capital > 0 || cuota > 0)) break; // piso sin hipoteca
          if (tipo > 0 && tipo < 0.3) tipo *= 100;
          const mesRef = hoy.slice(0, 7);
          let mesFin = fe('finHipoteca')?.slice(0, 7);
          if (!mesFin && capital > 0 && cuota > 0) {
            const i = tipo / 1200;
            const meses = i > 0 ? Math.ceil(-Math.log(1 - (i * capital) / cuota) / Math.log(1 + i)) : Math.ceil(capital / cuota);
            if (Number.isFinite(meses) && meses > 0) mesFin = addMonths(mesRef, meses - 1);
          }
          if (!mesFin || !(capital > 0)) { avisos.push(`Hipoteca de ${p.nombre}: faltan el capital pendiente o la fecha de la última cuota; añádela desde la ficha del piso.`); omitidas++; break; }
          const exH = p.existente && (s.hipotecas || []).find((x) => x.pisoId === p.existente.id);
          out.hipotecas.push({ ...(exH ? { ID: exH.id } : {}), Piso: p.nombre, Entidad: texto(v(h, f, 'entidad')), 'Tipo de interés %': r2(tipo), 'Capital pendiente': r2(capital), 'Mes de referencia': mesRef, 'Última cuota (mes)': mesFin, 'Cuota mensual': cuota > 0 ? r2(cuota) : '' });
          break;
        }
        default: break;
      }
    }
  }

  function convertirMeses(h) {
    const { cols, etiquetaDe } = columnasMeses(h);
    const sonPisos = filasSonPisos(h, [...(s.pisos || []).map((p) => p.nombre), ...nuevos.map((n) => n.nombre), ...hojas.filter((x) => hojaEsPiso(x.nombre)).map((x) => x.nombre)]);
    let seccion = h.modo === 'auto' ? null : h.modo;
    for (const f of h.datos) {
      const et = etiquetaDe(f);
      const hayNumeros = cols.some((c) => Number.isFinite(numL(f[c.i] ?? '')) && !vacio(f[c.i]));
      if (!hayNumeros) { // fila de sección: «INGRESOS», «GASTOS»
        if (h.modo === 'auto' && et) { if (/ingreso|cobro|renta|alquiler/.test(normalizar(et))) seccion = 'ingresos'; else if (/gasto|pago|coste/.test(normalizar(et))) seccion = 'gastos'; }
        continue;
      }
      if (!et || esTotal(et)) continue;
      const p = sonPisos ? resolverPiso(et) : pisoDe(h, f);
      if (!p) continue;
      for (const c of cols) {
        const x = numL(f[c.i] ?? '');
        if (!Number.isFinite(x) || !x) continue;
        const fecha = `${c.mes}-01`;
        const esIng = h.modo === 'ingresos' || (h.modo !== 'gastos' && (seccion === 'ingresos' || (!seccion && (sonPisos ? x > 0 && esIngresoTexto(h.nombre) : esIngresoTexto(et)))));
        const concepto = sonPisos ? (esIng ? '' : h.nombre) : et;
        if (esIng && x > 0) {
          if (p.nuevo && /airbnb|booking|reserva|huesped|turist/.test(normalizar(et))) p.nuevo.turistico = true;
          cobro(p, fecha, c.mes, x, '', concepto, true);
        }
        else gasto(p, fecha, x, concepto);
      }
    }
  }

  // Pisos nuevos: modalidad por lo que se ha visto
  for (const n of nuevos) {
    const mod = n.datos.Modalidad || (n.reservas || n.turistico ? 'Turístico' : n.habitaciones.size > 1 || n.contratos > 1 ? 'Por habitaciones' : 'Tradicional');
    const habs = Math.max(n.habitaciones.size, mod === 'Por habitaciones' ? n.contratos : 0);
    out.pisos.push({ Nombre: n.nombre, Modalidad: mod, ...n.datos, ...(mod === 'Por habitaciones' && !n.datos['Nº habitaciones (al crear)'] ? { 'Nº habitaciones (al crear)': Math.max(1, habs) } : {}) });
    if (mod === 'Por habitaciones' && n.habitaciones.size) {
      // Las habitaciones con nombre en el Excel y, hasta el número indicado, «Habitación 1, 2…»
      const total = Number(n.datos['Nº habitaciones (al crear)']) || 0;
      const nombresH = [...n.habitaciones];
      for (let i = 1; nombresH.length < total && i <= 50; i++) if (!nombresH.some((x) => normalizar(x) === normalizar(`Habitación ${i}`))) nombresH.push(`Habitación ${i}`);
      for (const hab of nombresH) out.unidades.push({ Piso: n.nombre, Nombre: hab });
    }
  }
  // Contratos sin fecha de inicio: el primer cobro de ese inquilino, o el día 1 de este mes
  for (const k of out.contratos) {
    if (k.ID || k.Inicio) continue;
    const suyos = out.cobros.filter((c) => c.Piso === k.Piso && c._inquilino && mismaPersona(c._inquilino, k.Inquilino)).map((c) => c.Vencimiento).sort();
    k.Inicio = suyos[0] ? `${suyos[0].slice(0, 7)}-01` : `${hoy.slice(0, 7)}-01`;
    avisos.push(`Contrato de ${k.Inquilino} (${k.Piso}): sin fecha de inicio; se usa ${k.Inicio.split('-').reverse().join('/')}. Cámbiala en la app si no es correcta.`);
  }
  // Cobros de inquilinos con contrato: se enlazan al contrato para que cuadren con sus recibos
  for (const c of out.cobros) {
    if (!c._inquilino) continue;
    const k = out.contratos.find((x) => x.Piso === c.Piso && mismaPersona(x.Inquilino, c._inquilino)) || (s.contratos || []).find((x) => s.pisos.find((p) => p.id === x.pisoId)?.nombre === c.Piso && mismaPersona(x.inquilino, c._inquilino));
    if (k) c._contrato = k.ID || k.id || k.Inquilino;
  }
  if (duplicados) notas.push(duplicados === 1 ? "1 fila ya estaba en la app y no se duplica." : `${duplicados} filas ya estaban en la app y no se duplican.`);
  if (abonos) avisos.push(`${abonos} importes negativos entre gastos o cobros (devoluciones o abonos) no se han importado; revísalos si hace falta.`);
  if (omitidas) notas.push(omitidas === 1 ? '1 fila sin importe, fecha o datos suficientes se ha saltado.' : `${omitidas} filas sin importe, fecha o datos suficientes se han saltado.`);
  if (out._hipotecaComoGasto) avisos.push('Las cuotas de hipoteca o préstamo se importan como gasto no deducible (la cuota incluye capital). Da de alta la hipoteca en la ficha del piso para que la app calcule los intereses deducibles.');
  const pisosNuevos = nuevos.map((n) => n.nombre);
  return { out, notas, avisos, pisosNuevos, duplicados };
}

/** Pasa las filas convertidas a un libro con las hojas y títulos de la app. */
function aLibro(out) {
  const libro = {};
  const hoja = (k, filas) => {
    if (!filas.length) return;
    const titulos = H[k].cols.map((c) => c[0]);
    libro[H[k].hoja] = [titulos, ...filas.map((f) => titulos.map((t) => (t === 'Contrato (ID o inquilino)' ? f._contrato ?? '' : f[t] ?? '')))];
  };
  hoja('pisos', out.pisos); hoja('unidades', out.unidades); hoja('contratos', out.contratos); hoja('hipotecas', out.hipotecas);
  hoja('gastos', out.gastos); hoja('cobros', out.cobros); hoja('reservas', out.reservas);
  return libro;
}

/** Tras importar: un cobro suelto de un inquilino con contrato se funde con el recibo de ese mes. */
function fundirCobros(estado, base) {
  const antes = new Set((base?.cobros || []).map((c) => c.id));
  let fundidos = 0;
  estado.cobros = estado.cobros.filter((c) => {
    if (antes.has(c.id) || c.auto) return true;
    // Con contrato: su recibo de ese mes. Sin contrato (p. ej. una transferencia del banco): el recibo
    // sin cobrar de ese piso y mes con el mismo importe.
    const recibo = c.contratoId
      ? estado.cobros.find((x) => x.auto && !x.anulado && x.contratoId === c.contratoId && x.periodo === c.periodo)
      : estado.cobros.find((x) => x.auto && !x.anulado && x.pisoId === c.pisoId && x.periodo === c.periodo && Math.abs(x.importe - c.importe) < 0.005 && num(x.cobrado) < x.importe);
    if (!recibo) return true;
    const pagado = r2(Math.min(recibo.importe, num(recibo.cobrado) + num(c.cobrado)));
    if (pagado > num(recibo.cobrado)) {
      recibo.pagos = [...(recibo.pagos || []), { fecha: c.fechaCobro || c.vencimiento, importe: r2(pagado - num(recibo.cobrado)) }];
      recibo.cobrado = pagado;
      recibo.fechaCobro = c.fechaCobro || c.vencimiento;
    }
    fundidos++;
    return false;
  });
  return fundidos;
}

/* ───────────── Interfaz ───────────── */

function opcionesPiso(h, s, detectados) {
  const sel = h.pisoDefecto;
  const ops = [];
  for (const p of s?.pisos || []) ops.push([p.id, p.nombre]);
  for (const n of detectados) if (!ops.some(([, t]) => t === n)) ops.push([`nuevo:${n}`, `${n} (nuevo)`]);
  if (hojaEsPiso(h.nombre) && !ops.some(([k]) => k === `nuevo:${h.nombre}`) && !(s?.pisos || []).some((p) => p.id === sel)) ops.push([`nuevo:${h.nombre}`, `${h.nombre} (nuevo)`]);
  ops.push(['', 'Crear «Piso sin asignar»']);
  return ops.map(([k, t]) => html`<option value="${k}" ${k === sel ? 'selected' : ''}>${t}</option>`);
}

function tarjeta(h, i, s, detectados) {
  const T = TIPOS[h.tipo];
  const ejemplo = (c) => c.perfil.ejemplos.slice(0, 2).join(' · ');
  const tipos = Object.keys(ETIQUETA_TIPO).filter((k) => k !== 'meses' || h.columnas.filter((c) => c.mes).length >= 2);
  const pidePiso = h.tipo === 'meses' || (T && h.tipo !== 'pisos' && !('piso' in h.map));
  return html`
    <section class="libre-hoja" data-hoja="${i}">
      <header><b>${h.nombre}</b><span class="muted small">${h.datos.length} filas</span></header>
      <label class="field"><span class="field-label">Esta hoja contiene</span>
        <select name="t:${i}" data-libre-tipo="${i}">${tipos.map((k) => html`<option value="${k}" ${k === h.tipo ? 'selected' : ''}>${ETIQUETA_TIPO[k]}</option>`)}</select></label>
      ${h.tipo === 'ignorar' ? '' : h.tipo === 'meses' ? html`
        <div class="form-grid">
          <label class="field"><span class="field-label">Año</span><input name="y:${i}" type="number" min="1990" max="2100" value="${h.anio}"></label>
          <label class="field"><span class="field-label">Cada fila es</span><select name="e:${i}">${[['auto', 'Detectar'], ['conceptos', 'Un concepto (luz, comunidad…)'], ['pisos', 'Un piso']].map(([k, t]) => html`<option value="${k}" ${k === h.etiquetas ? 'selected' : ''}>${t}</option>`)}</select></label>
          <label class="field span2"><span class="field-label">Los importes son</span><select name="m:${i}">${[['auto', 'Detectar (ingresos si dicen alquiler, renta…)'], ['gastos', 'Gastos'], ['ingresos', 'Ingresos']].map(([k, t]) => html`<option value="${k}" ${k === h.modo ? 'selected' : ''}>${t}</option>`)}</select></label>
        </div>` : html`
        <div class="libre-cols">
          ${h.columnas.map((c, ci) => (c.perfil.n ? html`<label class="libre-col field"><span><b>${c.titulo}</b><small class="muted">${ejemplo(c)}</small></span>
            <select name="c:${i}:${ci}"><option value="">— no importar —</option>${T.campos.map((campo) => html`<option value="${campo}" ${h.map[campo] === ci ? 'selected' : ''}>${CAMPOS[campo].t}</option>`)}</select></label>` : ''))}
        </div>
        ${cumple(h.tipo, h.map) ? '' : html`<p class="import-err small">Faltan columnas imprescindibles: ${T.req.filter((alt) => !alt.some((c) => c in h.map)).map((alt) => alt.map((c) => CAMPOS[c].t).join(' o ')).join(', ')}.</p>`}`}
      ${pidePiso && h.tipo !== 'ignorar' ? html`<label class="field"><span class="field-label">Piso de estas filas</span><select name="p:${i}">${opcionesPiso(h, s, detectados)}</select></label>` : ''}
    </section>`;
}

function leerPropuesta(form, hojas) {
  hojas.forEach((h, i) => {
    const el = (n) => form.elements[n];
    if (el(`t:${i}`)) h.tipo = el(`t:${i}`).value;
    if (el(`p:${i}`)) h.pisoDefecto = el(`p:${i}`).value;
    if (h.tipo === 'meses') { h.anio = el(`y:${i}`)?.value || h.anio; h.modo = el(`m:${i}`)?.value || 'auto'; h.etiquetas = el(`e:${i}`)?.value || 'auto'; return; }
    if (!TIPOS[h.tipo]) return;
    const map = {};
    h.columnas.forEach((c, ci) => { const x = el(`c:${i}:${ci}`)?.value; if (x && !(x in map)) map[x] = ci; });
    h.map = map;
  });
}

/** Punto de entrada: libro leído de cualquier origen. */
export function importarLibre(libro, nombreArchivo) {
  const s = app.s;
  const hojas = analizar(libro, s);
  if (!hojas.length) return toast('El archivo no tiene datos que importar.', { tipo: 'warn' });
  for (const h of hojas) h.archivo = nombreArchivo;
  let pasadosCobrados = true;
  let asignacion = new Map();
  let crudos = [];
  const pintar = () => {
    crudos = nombresCrudos(hojas, s);
    asignacion = proponerAsignacion(crudos, s, asignacion);
    const nuevosN = crudos.filter((t) => asignacion.get(normalizar(t)) === 'nuevo');
    const opciones = (t) => {
      const v = asignacion.get(normalizar(t));
      const ops = [...(s?.pisos || []).map((p) => [p.id, `Es «${p.nombre}» (ya en la app)`]), ['nuevo', 'Piso nuevo'],
        ...crudos.filter((o) => o !== t && (asignacion.get(normalizar(o)) === 'nuevo' || v === `igual:${normalizar(o)}`)).map((o) => [`igual:${normalizar(o)}`, `Es el mismo que «${o}»`])];
      return ops.map(([k, x]) => html`<option value="${k}" ${k === v ? 'selected' : ''}>${x}</option>`);
    };
    return html`
      <p class="muted">He leído <b>${nombreArchivo}</b> y esto es lo que he entendido. Revisa cada hoja y corrige lo que haga falta; lo que ya está en la app no se duplica ni se borra.</p>
      ${crudos.length ? html`<section class="libre-hoja"><header><b>Pisos que aparecen en tu Excel</b><span class="muted small">${nuevosN.length ? `${nuevosN.length} nuevos` : 'todos ya existen'}</span></header>
        <div class="libre-cols">${crudos.map((t, k) => html`<label class="libre-col field"><span><b>${t}</b></span><select name="pm:${k}">${opciones(t)}</select></label>`)}</div></section>` : ''}
      ${hojas.some((h) => h.tipo === 'contratos') ? html`<label class="check libre-check"><input type="checkbox" name="pasados" ${pasadosCobrados ? 'checked' : ''}><span>Los meses ya pasados de los contratos que no traen cobros en el Excel están <b>cobrados</b> (si no, aparecerán como impagados)</span></label>` : ''}
      <div class="libre-hojas">${hojas.map((h, i) => tarjeta(h, i, s, nuevosN))}</div>`;
  };
  const leerAsignacion = (f) => {
    crudos.forEach((t, k) => { const x = f.elements[`pm:${k}`]?.value; if (x) asignacion.set(normalizar(t), x); });
    if (f.elements.pasados) pasadosCobrados = f.elements.pasados.checked;
  };
  const form = abrirDialogo({
    titulo: 'Importar desde tu Excel',
    cuerpo: pintar(),
    ancho: 'wide',
    textoOk: 'Continuar',
    submit: (d, f) => {
      leerPropuesta(f, hojas);
      leerAsignacion(f);
      if (hojas.every((h) => h.tipo === 'ignorar')) { toast('No has elegido ninguna hoja para importar.', { tipo: 'warn' }); return false; }
      const fallida = hojas.find((h) => TIPOS[h.tipo] && !cumple(h.tipo, h.map));
      if (fallida) { toast(`En «${fallida.nombre}» faltan columnas imprescindibles.`, { tipo: 'warn' }); return false; }
      aplicar(hojas, nombreArchivo, asignacion, { pasadosCobrados });
      return false; // el resumen sustituye a este diálogo
    },
  });
  // Al cambiar el tipo de una hoja se vuelven a proponer sus columnas; al cambiar columnas, se repinta el aviso
  form.addEventListener('change', (e) => {
    const sel = e.target;
    if (!sel.name || sel.name.startsWith('y:')) return;
    const body = form.querySelector('.dlg-body');
    const scroll = body.scrollTop;
    leerPropuesta(form, hojas);
    leerAsignacion(form);
    if (sel.dataset.libreTipo != null) { const h = hojas[Number(sel.dataset.libreTipo)]; h.map = mapear(h, h.tipo); }
    body.innerHTML = String(pintar());
    body.scrollTop = scroll;
  });
}

async function aplicar(hojas, nombreArchivo, asignacion, { pasadosCobrados = true } = {}) {
  try {
    const base = app.s;
    const s = base || { pisos: [], gastos: [], cobros: [], reservas: [], contratos: [] };
    const { out, notas, avisos, duplicados } = convertir(hojas, s, asignacion);
    const libro = aLibro(out);
    if (!Object.keys(libro).length) {
      if (duplicados) cerrarDialogo();
      return toast(duplicados ? 'Todo lo de este archivo ya estaba en la app: no hay nada nuevo que importar.' : 'No se ha encontrado ninguna fila con datos suficientes para importar.', { tipo: duplicados ? 'ok' : 'warn', ms: 6000 });
    }
    const { estado, informe } = await prepararImportacion(libro, base);
    const fundidos = fundirCobros(estado, base);
    // Contratos nuevos sin ningún cobro en el Excel: sus meses pasados se dan por cobrados si así se indica
    if (pasadosCobrados) {
      const previos = new Set((base?.contratos || []).map((k) => k.id));
      const mesActual = today().slice(0, 7);
      let marcados = 0;
      for (const k of estado.contratos) {
        if (previos.has(k.id) || estado.cobros.some((c) => c.contratoId === k.id && !c.auto)) continue;
        for (const c of estado.cobros) {
          if (c.contratoId !== k.id || !c.auto || c.anulado || c.periodo >= mesActual || num(c.cobrado) >= c.importe) continue;
          c.cobrado = c.importe; c.fechaCobro = c.vencimiento; c.pagos = [{ fecha: c.vencimiento, importe: c.importe }];
          marcados++;
        }
      }
      if (marcados) notas.push(`${marcados} recibos de meses pasados de contratos nuevos se han marcado como cobrados.`);
    }
    if (fundidos) {
      notas.push(fundidos === 1 ? "1 cobro se ha apuntado como pagado en el recibo de su contrato." : `${fundidos} cobros se han apuntado como pagados en los recibos de su contrato.`);
      const fila = informe.hojas.find((x) => x.hoja === 'Cobros');
      if (fila) { fila.nuevos = Math.max(0, fila.nuevos - fundidos); informe.total.nuevos = Math.max(0, informe.total.nuevos - fundidos); }
    }
    informe.notas = [...notas, ...(informe.notas || [])];
    informe.avisos = [...avisos, ...informe.avisos];
    informe.ignoradas = [];
    mostrarResumen(nombreArchivo, estado, informe);
  } catch (e) {
    console.error(e);
    toast(`No se ha podido importar: ${e.message}`, { tipo: 'error', ms: 8000 });
  }
}


/** ¿Es un libro descargado de la app (hojas con su columna ID)? Entonces se importa tal cual. */
function esFormatoApp(libro) {
  return Object.entries(libro).some(([n, filas]) => {
    const k = Object.keys(H).find((x) => normalizar(H[x].hoja) === normalizar(n));
    if (!k) return false;
    const titulos = H[k].cols.map((c) => normalizar(c[0]));
    return filas.slice(0, 5).some((f) => f.some((c) => normalizar(c) === 'id') && f.filter((c) => titulos.includes(normalizar(c))).length >= 3);
  });
}

/** Lee un archivo de Numbers (Apple) con SheetJS, que se carga solo cuando hace falta. */
let sheetjs = null;
function cargarSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  sheetjs ||= new Promise((ok, mal) => {
    const sc = document.createElement('script');
    sc.src = 'js/vendor/xlsx.core.min.js';
    sc.onload = () => ok(window.XLSX);
    sc.onerror = () => { sheetjs = null; mal(new Error('No se ha podido cargar el lector de Numbers. Conéctate a internet una vez y vuelve a probar.')); };
    document.head.appendChild(sc);
  });
  return sheetjs;
}
async function leerNumbers(file) {
  const X = await cargarSheetJS();
  let wb;
  try { wb = X.read(new Uint8Array(await file.arrayBuffer()), { cellDates: true }); } catch (e) {
    throw new Error('No se ha podido leer este archivo de Numbers. Ábrelo en Numbers y usa Archivo → Exportar a → Excel, y sube ese .xlsx.');
  }
  const iso = (d) => new Date(d.getTime() + 12 * 3600e3).toISOString().slice(0, 10); // fecha sin desfase horario
  const libro = {};
  for (const n of wb.SheetNames) {
    const filas = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: true });
    libro[n] = filas.map((f) => f.map((v) => (v instanceof Date ? iso(v) : typeof v === 'boolean' ? (v ? 'sí' : 'no') : v)));
  }
  return libro;
}

/** Importa .xlsx, .ods, .csv o .numbers: el Excel de la app directamente; cualquier otro, con el asistente. */
export async function importarArchivo(file) {
  try {
    const ext = (file.name.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
    if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
      const filas = filasCSV(await file.text());
      return importarLibre({ [file.name.replace(/\.\w+$/, '')]: filas.map((f) => f.map((c) => c.trim())) }, file.name);
    }
    if (ext === 'numbers') {
      const libro = await leerNumbers(file);
      return esFormatoApp(libro) ? importarExcel(file, libro) : importarLibre(libro, file.name);
    }
    if (ext === 'ods') {
      const libro = await leerOds(file);
      return esFormatoApp(libro) ? importarExcel(file, libro) : importarLibre(libro, file.name);
    }
    if (ext === 'xls') throw new Error('Es un Excel antiguo (.xls). Ábrelo en Excel o Numbers y guárdalo como .xlsx.');
    const libro = await leerXlsx(file);
    if (esFormatoApp(libro)) return importarExcel(file);
    importarLibre(await leerXlsx(file, { fechas: true }), file.name);
  } catch (e) {
    console.error(e);
    toast(`No se ha podido leer el archivo: ${e.message}`, { tipo: 'error', ms: 8000 });
  }
}
