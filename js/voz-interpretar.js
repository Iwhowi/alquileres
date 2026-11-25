// Interpreta frases dichas o escritas en español («ponme en Ramón y Cajal un gasto de luz de noviembre
// de 120 euros») y devuelve qué hacer. Sin inteligencia artificial ni servicios externos: reglas.
// Módulo puro (sin DOM) para poder probarlo aparte.

export const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ.,€%\s-]/g, ' ').replace(/\s+/g, ' ').trim();

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NOMBRE_MES = (m) => MESES[m - 1];

/* ───────────── Números dichos con palabras ───────────── */

const UNIDADES = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const DECENAS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS = { cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900 };
const esPalabraNum = (w) => w in UNIDADES || w in DECENAS || w in CENTENAS || w === 'mil' || w === 'y';

/** Cambia los números dichos con letras por cifras: «ciento veinte euros» → «120 euros». */
export function cifras(texto) {
  const ws = texto.split(' ');
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    if (!(ws[i] in UNIDADES || ws[i] in DECENAS || ws[i] in CENTENAS || ws[i] === 'mil')) { out.push(ws[i]); continue; }
    // «un/una» sueltos son artículos («un gasto»), no números
    if ((ws[i] === 'un' || ws[i] === 'una' || ws[i] === 'uno') && !esPalabraNum(ws[i + 1] || '') && !/^(euro|eur|€)/.test(ws[i + 1] || '')) { out.push(ws[i]); continue; }
    let total = 0, parte = 0, j = i;
    for (; j < ws.length && esPalabraNum(ws[j]); j++) {
      const w = ws[j];
      if (w === 'y') { if (!(ws[j + 1] in UNIDADES)) break; continue; }
      if (w === 'mil') { total += (parte || 1) * 1000; parte = 0; } else parte += UNIDADES[w] ?? DECENAS[w] ?? CENTENAS[w];
    }
    if (ws[j - 1] === 'y') j--;
    out.push(String(total + parte));
    i = j - 1;
  }
  return out.join(' ');
}

/* ───────────── Importe ───────────── */

export function importe(t) {
  // «120 con 50», «120,50 €», «1.250 euros», «120 euros con 50 céntimos»
  let m = t.match(/(\d[\d.]*)(?:,(\d{1,2}))?\s*(?:euros?|eur|€)?\s*con\s*(\d{1,2})\b/);
  if (m) return Number(m[1].replace(/\./g, '')) + Number(m[3].padEnd(2, '0')) / 100;
  const candidatos = [];
  const re = /(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2}))?(?!\d)\s*(euros?|eur|€|pavos)?/g;
  while ((m = re.exec(t))) {
    const antes = t.slice(Math.max(0, m.index - 12), m.index);
    const despues = t.slice(m.index + m[0].length, m.index + m[0].length + 14);
    const n = Number(m[1].replace(/\./g, '')) + (m[2] ? Number(m[2].padEnd(2, '0')) / 100 : 0);
    if (/^\s*(de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.test(despues) && n <= 31 && !m[3]) continue; // «5 de noviembre»
    if (/(dia|piso|habitacion|hab|numero|n|portal|planta)\s*$/.test(antes) && !m[3]) continue;
    if (/^\s*(dias|meses|anos|habitaciones|m2|metros)/.test(despues)) continue;
    if (n >= 1990 && n <= 2100 && !m[3]) continue; // un año
    candidatos.push({ n, euros: !!m[3] });
  }
  const conEuros = candidatos.find((c) => c.euros);
  return (conEuros || candidatos[candidatos.length - 1])?.n ?? null;
}

/* ───────────── Fecha y mes ───────────── */

function fecha(t, hoy) {
  const [ay, am, ad] = hoy.split('-').map(Number);
  let y = null, m = null, d = null;
  let x;
  if ((x = t.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b(?:\s+(?:de|del)?\s*(\d{4}))?/))) {
    m = x[1] === 'setiembre' ? 9 : MESES.indexOf(x[1]) + 1;
    if (x[2]) y = Number(x[2]);
  }
  if ((x = t.match(/\b(?:el\s+)?(?:dia\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/))) d = Number(x[1]);
  else if ((x = t.match(/\bdia\s+(\d{1,2})\b/))) d = Number(x[1]);
  if ((x = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) { d = Number(x[1]); m = Number(x[2]); if (x[3]) y = Number(x[3].length === 2 ? `20${x[3]}` : x[3]); }
  if (/\bhoy\b/.test(t)) { y = ay; m = am; d = ad; }
  else if (/\bayer\b/.test(t)) { const f = new Date(Date.UTC(ay, am - 1, ad - 1)); y = f.getUTCFullYear(); m = f.getUTCMonth() + 1; d = f.getUTCDate(); }
  else if (/\b(mes pasado|ultimo mes|mes anterior)\b/.test(t)) { m = am === 1 ? 12 : am - 1; y = am === 1 ? ay - 1 : ay; }
  else if (/\b(este mes|mes actual)\b/.test(t) && !m) { m = am; y = ay; }
  if ((x = t.match(/\b(?:del?\s+)?(?:ano\s+)?(20\d{2})\b/)) && !y) y = Number(x[1]);
  if (/\bano pasado\b/.test(t) && !y) y = ay - 1;
  if (!m) return { fecha: hoy, periodo: hoy.slice(0, 7), dicho: false };
  if (!y) {
    // El último que ya ha llegado; el mes que viene cuenta como próximo (se paga por adelantado)
    if (am === 12 && m === 1) y = ay + 1;
    else y = m > am + 1 ? ay - 1 : ay;
  }
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const periodo = `${y}-${String(m).padStart(2, '0')}`;
  let dia = d ? Math.min(d, ultimo) : null;
  if (!dia) dia = periodo === hoy.slice(0, 7) ? ad : ultimo; // mes en curso: hoy; mes pasado: su último día
  let f = `${periodo}-${String(dia).padStart(2, '0')}`;
  if (f > hoy && periodo === hoy.slice(0, 7)) f = hoy;
  return { fecha: f, periodo, dicho: true, mesNombre: `${NOMBRE_MES(m)} ${y}` };
}

/* ───────────── Pisos, habitaciones e inquilinos ───────────── */

const VACIAS = new Set(['piso', 'calle', 'c', 'cl', 'avda', 'avenida', 'plaza', 'pza', 'paseo', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'n', 'no', 'num', 'numero', 'bajo', 'sevilla', 'madrid', 'en', 'a', 'casa', 'apartamento', 'vivienda', 'izq', 'izquierda', 'dcha', 'derecha']);
export const palabras = (t) => norm(t).replace(/[.,:;]/g, ' ').split(' ').filter((w) => w && !VACIAS.has(w) && !/^\d+[a-z]?$/.test(w) && w.length > 1);

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export const parecida = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= (Math.min(a.length, b.length) >= 7 ? 2 : 1)) || (a.length >= 5 && b.startsWith(a)) || (b.length >= 5 && a.startsWith(b));

/** Puntuación de cuánto se parece lo dicho al nombre (o dirección) de un piso. */
function puntos(dichas, nombre) {
  const ps = palabras(nombre);
  if (!ps.length) return 0;
  let ok = 0;
  for (const p of ps) if (dichas.some((w) => parecida(w, p))) ok += p.length >= 4 ? 1 : 0.5;
  return ok / Math.max(1.5, ps.length * 0.75);
}

export function buscarPiso(t, s) {
  const dichas = palabras(t);
  let mejor = null;
  for (const p of s.pisos || []) {
    let sc = Math.max(puntos(dichas, p.nombre), puntos(dichas, p.direccion || '') * 0.9);
    const num = (p.nombre || '').match(/piso\s*(\d+)/i)?.[1];
    if (num && new RegExp(`\\bpiso (numero )?${num}\\b`).test(t)) sc = Math.max(sc, 1.2);
    if (sc > (mejor?.sc || 0)) mejor = { p, sc };
  }
  return mejor && mejor.sc >= 0.6 ? mejor.p : null;
}

export function buscarUnidad(t, s, pisoId) {
  const x = t.match(/\b(?:habitacion|hab)\s*(?:numero\s*)?(\d+)/);
  if (!x || !pisoId) return null;
  return (s.unidades || []).find((u) => u.pisoId === pisoId && new RegExp(`\\b${x[1]}\\b`).test(norm(u.nombre))) || null;
}

const NO_NOMBRE = /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|lunes|martes|miercoles|jueves|viernes|sabado|domingo|renta|fianza|piso|contrato|gasto|alquiler|pagado|cobrado|habitacion|final|desde|hasta|telefono|correo|email)$/;
export function buscarInquilino(t, s) {
  const dichas = palabras(t).filter((w) => !NO_NOMBRE.test(w));
  let mejor = null;
  for (const k of s.contratos || []) {
    if (k.finalizado) continue;
    const ps = palabras(k.inquilino);
    const ok = ps.filter((p) => p.length >= 3 && dichas.some((w) => parecida(w, p))).length;
    if (ok && ok > (mejor?.ok || 0)) mejor = { k, ok };
  }
  return mejor?.k || null;
}

/* ───────────── Categorías de gasto ───────────── */

const TEMAS = [
  ['cuota_hipoteca', /\b(cuota de (la )?hipoteca|hipoteca|prestamo)\b/, 'Cuota de hipoteca'],
  ['suministros', /\b(luz|electricidad|electrica|endesa|iberdrola|holaluz|repsol|totalenergies)\b/, 'Luz'],
  ['suministros', /\b(agua|emasesa|aljarafesa|canal de isabel)\b/, 'Agua'],
  ['suministros', /\b(gas|butano|naturgy)\b/, 'Gas'],
  ['suministros', /\b(internet|fibra|wifi|router|telefono|movistar|vodafone|orange|digi|jazztel|masmovil)\b/, 'Internet'],
  ['comunidad', /\b(comunidad|derrama|administrador de fincas)\b/, 'Comunidad'],
  ['ibi', /\b(ibi|contribucion|impuesto de bienes)\b/, 'IBI'],
  ['tasas', /\b(basura|basuras|tasa|tasas|vado)\b/, 'Tasa'],
  ['seguro', /\b(seguro|poliza|mapfre|allianz|axa|generali|mutua|linea directa)\b/, 'Seguro'],
  ['limpieza', /\b(limpieza|limpiadora|lavanderia|limpiar)\b/, 'Limpieza'],
  ['consumibles', /\b(menaje|consumibles?|sabanas|toallas|vajilla|bombillas?|productos de limpieza|papel higienico|amenities)\b/, 'Menaje y consumibles'],
  ['comisiones', /\b(comision(es)? de (airbnb|booking)|airbnb|booking|agencia inmobiliaria|inmobiliaria)\b/, 'Comisión'],
  ['financieros', /\b(comision(es)? (del |de )?banc|gastos bancarios|banco)\b/, 'Gastos bancarios'],
  ['gestion', /\b(gestor|gestoria|asesor|asesoria|administracion)\b/, 'Gestoría'],
  ['juridico', /\b(abogado|notario|notaria|registro|procurador)\b/, 'Abogado o notaría'],
  ['mobiliario', /\b(mueble|muebles|sofa|cama|colchon|armario|mesa|silla|lavadora|frigorifico|nevera|horno|microondas|television|tele|electrodomestico|aire acondicionado|secadora|lavavajillas|vitro|vitroceramica|termo)\b/, 'Mobiliario'],
  ['mejora', /\b(reforma|mejora|ampliacion)\b/, 'Reforma'],
  ['reparacion', /\b(reparacion|reparar|arreglo|arreglar|averia|fontanero|fontaneria|electricista|cerrajero|cerradura|pintura|pintar|pintor|albanil|persiana|grifo|cisterna|mantenimiento)\b/, 'Reparación'],
];
const PROVEEDORES = ['endesa', 'iberdrola', 'naturgy', 'repsol', 'holaluz', 'totalenergies', 'emasesa', 'aljarafesa', 'movistar', 'vodafone', 'orange', 'digi', 'jazztel', 'masmovil', 'pepephone', 'mapfre', 'allianz', 'axa', 'generali', 'mutua madrileña', 'linea directa', 'ikea', 'leroy merlin', 'amazon', 'airbnb', 'booking'];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const capTodo = (t) => t.replace(/(^|\s)\S/g, (x) => x.toUpperCase());

export function tema(t) {
  for (const [cat, re, nombre] of TEMAS) {
    const x = t.match(re);
    if (x) {
      let concepto = nombre;
      if (cat === 'reparacion' || cat === 'mobiliario') concepto = cap(x[0]);
      return { categoria: cat, concepto };
    }
  }
  return null;
}

/* ───────────── Interpretación ───────────── */

/**
 * Devuelve { tipo: 'gasto' | 'cobro' | 'nada', ...datos, faltan: [], resumen }.
 * `s` es el estado de la app; `hoy` la fecha 'YYYY-MM-DD'.
 */
export function interpretar(texto, s, hoy) {
  const t = cifras(norm(texto));
  const f = fecha(t, hoy);
  const piso = buscarPiso(t, s);
  const inq = buscarInquilino(t, s);
  const esCobro = /\b(cobrado|cobrada|cobra|cobrar|cobre|me ha pagado|ha pagado|han pagado|ha abonado|ingreso del alquiler|ha ingresado|ingresado)\b/.test(t) && !/\b(gasto|factura|he pagado|pague|pagado yo)\b/.test(t);

  if (esCobro) {
    const pisoId = piso?.id || inq?.pisoId || null;
    const unidad = buscarUnidad(t, s, pisoId);
    const periodo = f.periodo;
    let cands = (s.cobros || []).filter((c) => !c.anulado && c.periodo === periodo && (!pisoId || c.pisoId === pisoId) && num(c.cobrado) < num(c.importe) - 0.005);
    if (inq) cands = cands.filter((c) => c.contratoId === inq.id);
    else if (unidad) cands = cands.filter((c) => c.unidadId === unidad.id);
    if (/\b(alquiler|renta|mensualidad)\b/.test(t)) { const r = cands.filter((c) => c.auto || /renta|alquiler/i.test(c.concepto || '')); if (r.length) cands = r; }
    const imp = importe(t);
    return {
      tipo: 'cobro', texto, pisoId, periodo, mesNombre: f.mesNombre || null, inquilino: inq?.inquilino || null, importe: imp,
      candidatos: pisoId || inq ? cands : [], fechaCobro: /\b(hoy|ayer|\d{1,2} de )/.test(t) ? f.fecha : hoy,
    };
  }

  const tm = tema(t);
  const imp = importe(t);
  const esGasto = tm || /\b(gasto|factura|recibo de|he pagado|pague|compra|compre|ticket)\b/.test(t);
  if (!esGasto && imp == null) return { tipo: 'nada', texto };
  const prov = PROVEEDORES.find((p) => new RegExp(`\\b${p}\\b`).test(t));
  let concepto = tm?.concepto || '';
  if (concepto && f.dicho && tm.categoria !== 'mobiliario' && tm.categoria !== 'mejora') concepto += ` ${f.mesNombre}`;
  const faltan = [];
  if (imp == null) faltan.push('el importe');
  if (!piso) faltan.push('el piso');
  return {
    tipo: 'gasto', texto, pisoId: piso?.id || null, categoria: tm?.categoria || null, concepto: cap(concepto.trim()) || '', proveedor: prov ? capTodo(prov) : '',
    importe: imp, fecha: f.fecha > hoy ? hoy : f.fecha, mesNombre: f.mesNombre || null, extraordinario: /\b(extraordinario|derrama|averia|reforma)\b/.test(t), faltan,
  };
}

const num = (v) => Number(v) || 0;
