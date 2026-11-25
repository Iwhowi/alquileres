// Órdenes por voz más allá de gastos y cobros: altas y bajas de inquilinos, renovaciones, subidas de
// renta, cambios de cualquier dato (contrato, piso, titular, hipoteca), reservas, gastos fijos y
// navegación. Devuelve qué formulario abrir y con qué campos rellenos; el formulario es el mismo que
// se usa a mano y no se guarda nada hasta pulsar «Guardar». Módulo puro (sin DOM).
import { norm, cifras, importe, buscarPiso, buscarUnidad, buscarInquilino, tema, palabras, parecida } from './voz-interpretar.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const RE_MES = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';
const numMes = (n) => (n === 'setiembre' ? 9 : MESES.indexOf(n) + 1);
const p2 = (n) => String(n).padStart(2, '0');
const ultimoDia = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y, m, d) => `${y}-${p2(m)}-${p2(Math.min(d, ultimoDia(y, m)))}`;
const sumarDias = (f, n) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const sumarMeses = (f, n) => { const [y, m, d] = f.split('-').map(Number); const t = y * 12 + m - 1 + n; return iso(Math.floor(t / 12), (t % 12) + 1, d); };
const capNombre = (t) => t.split(' ').filter(Boolean).map((w) => (/^(de|del|la|las|los|y)$/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');

/* ───────────── Fechas con su posición en la frase ───────────── */

/** Todas las fechas dichas, en orden. `futuro`: si no se dice el año, la más cercana hacia delante. */
export function fechas(t, hoy, futuro = true) {
  const [ay, am, ad] = hoy.split('-').map(Number);
  const out = [];
  const anio = (m, d, dicho) => {
    if (dicho) return Number(dicho);
    const f = iso(ay, m, d);
    if (futuro) return f < sumarDias(hoy, -60) ? ay + 1 : ay;
    return f > sumarDias(hoy, 31) ? ay - 1 : ay;
  };
  const usado = [];
  const libre = (i, j) => !usado.some(([a, b]) => i < b && j > a);
  const poner = (i, j, f, extra = {}) => { if (libre(i, j)) { usado.push([i, j]); out.push({ i, fecha: f, ...extra }); } };
  let x;
  // «del 5 al 8 de diciembre (de 2026)»
  const reRango = new RegExp(`\\b(?:del?\\s+)?(?:dia\\s+)?(\\d{1,2})\\s+(?:al|hasta el|a)\\s+(?:dia\\s+)?(\\d{1,2})\\s+de\\s+${RE_MES}(?:\\s+(?:de|del)\\s+(\\d{4}))?`, 'g');
  while ((x = reRango.exec(t))) {
    const m = numMes(x[3]);
    const y = anio(m, Number(x[1]), x[4]);
    poner(x.index, x.index + x[0].length, iso(y, m, Number(x[1])));
    out.push({ i: x.index + 1, fecha: iso(y, m, Number(x[2])) });
  }
  const reDia = new RegExp(`\\b(?:el\\s+)?(?:dia\\s+)?(\\d{1,2})\\s+de\\s+${RE_MES}(?:\\s+(?:de|del)\\s+(\\d{4}))?`, 'g');
  while ((x = reDia.exec(t))) { const m = numMes(x[2]); poner(x.index, x.index + x[0].length, iso(anio(m, Number(x[1]), x[3]), m, Number(x[1]))); }
  const reNum = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g;
  while ((x = reNum.exec(t))) poner(x.index, x.index + x[0].length, iso(Number(x[3].length === 2 ? `20${x[3]}` : x[3]), Number(x[2]), Number(x[1])));
  const reFinal = new RegExp(`\\b(?:a\\s+)?(?:final(?:es)?|fin)\\s+de\\s+${RE_MES}(?:\\s+(?:de|del)\\s+(\\d{4}))?`, 'g');
  while ((x = reFinal.exec(t))) { const m = numMes(x[1]); const y = anio(m, 28, x[2]); poner(x.index, x.index + x[0].length, iso(y, m, 31)); }
  const reMes = new RegExp(`\\b(?:(?:a\\s+)?principios?\\s+de\\s+|(?:el\\s+)?mes\\s+de\\s+)?${RE_MES}(?:\\s+(?:de|del)\\s+(\\d{4}))?`, 'g');
  while ((x = reMes.exec(t))) { const m = numMes(x[1]); poner(x.index, x.index + x[0].length, iso(anio(m, 15, x[2]), m, 1), { soloMes: true }); }
  const simples = [[/\bpasado manana\b/g, sumarDias(hoy, 2)], [/\bmanana\b/g, sumarDias(hoy, 1)], [/\bhoy\b/g, hoy], [/\bayer\b/g, sumarDias(hoy, -1)], [/\b(?:a\s+)?(?:final|fin)\s+de\s+(?:este\s+)?mes\b/g, iso(ay, am, 31)], [/\b(?:el\s+)?mes que viene\b|\bproximo mes\b/g, iso(am === 12 ? ay + 1 : ay, am === 12 ? 1 : am + 1, 1)]];
  for (const [re, f] of simples) while ((x = re.exec(t))) poner(x.index, x.index + x[0].length, f);
  void ad;
  return out.sort((a, b) => a.i - b.i);
}

/** Fecha que va justo detrás de alguna de estas palabras («desde el 1 de diciembre»). */
function fechaTras(t, fs, re) {
  let x;
  const r = new RegExp(re.source, 'g');
  while ((x = r.exec(t))) {
    const fin = x.index + x[0].length;
    const f = fs.find((d) => d.i >= fin && d.i - fin <= 14);
    if (f) return f;
  }
  return null;
}

/** Importe que va cerca de una palabra: «renta de 400», «400 euros de fianza». */
function numeroCerca(t, re, { antes = true } = {}) {
  const r = new RegExp(re.source, 'g');
  let x;
  while ((x = r.exec(t))) {
    const tras = t.slice(x.index + x[0].length, x.index + x[0].length + 60);
    let m = tras.match(/^\s*(?:[a-zñ]+\s+){0,7}?(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2}))?(?!\d)(?!\s*(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|dias|meses|anos|personas|noches)\b)/);
    if (m) return Number(m[1].replace(/\./g, '')) + (m[2] ? Number(m[2].padEnd(2, '0')) / 100 : 0);
    if (antes) {
      const prev = t.slice(Math.max(0, x.index - 26), x.index);
      m = prev.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(?:euros?|€)?\s*(?:de|en|como)?\s*$/);
      if (m) return Number(m[1].replace(/\./g, '')) + (m[2] ? Number(m[2].padEnd(2, '0')) / 100 : 0);
    }
  }
  return null;
}

/** Une los trozos de un código dictado con espacios («B 50 586 312» → «B50586312»). */
const juntarCodigos = (t) => String(t).replace(/(\b[A-Za-z])[\s-]+(?=\d)/g, '$1').replace(/(\d)[\s.-]+(?=[\dA-Za-z]\b|\d)/g, '$1').replace(/(\d)[\s-]+(?=[A-Za-z]\b)/g, '$1');

/* ───────────── Datos personales ───────────── */

function telefono(t) {
  const x = t.match(/(?:\+?\s*34\s*)?\b([6789](?:\s*\d){8})\b/);
  return x ? x[1].replace(/\s/g, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : null;
}
function correo(original) {
  let t = ` ${String(original || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `;
  t = t.replace(/\s+arroba\s+/g, '@').replace(/\s*@\s*/g, '@').replace(/\s+(?:punto|\.)\s+(?=[a-z0-9])/g, '.').replace(/\s+guion bajo\s+/g, '_').replace(/\s+guion\s+/g, '-');
  const x = t.match(/([a-z0-9][a-z0-9._-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)+)/);
  return x ? x[1].replace(/\.$/, '') : null;
}
function documento(t) {
  let x = t.match(/\b([xyz])\s*-?\s*(\d{7})\s*-?\s*(?:letra\s+)?([a-z])\b/);
  if (x) return `${x[1]}${x[2]}${x[3]}`.toUpperCase();
  x = t.match(/\b(\d{8})\s*-?\s*(?:letra\s+)?([a-z])\b/);
  if (x) return `${x[1]}${x[2]}`.toUpperCase();
  x = t.match(/\b(?:pasaporte|documento|dni|nie)\s+(?:numero\s+|es\s+|el\s+)*([a-z0-9]{6,12})\b/);
  return x && /\d/.test(x[1]) ? x[1].toUpperCase() : null;
}

const CORTE = new Set(['en', 'desde', 'con', 'por', 'que', 'a', 'al', 'dni', 'nie', 'telefono', 'movil', 'renta', 'fianza', 'para', 'hasta', 'paga', 'pagando', 'pagara', 'el', 'la', 'los', 'las', 'habitacion', 'hab', 'piso', 'y', 'email', 'correo', 'empieza', 'entra', 'a partir', 'durante', 'cobrando', 'alquiler', 'precio', 'contrato', 'mes', 'se', 'su', 'es', 'del', 'como', 'inquilino', 'inquilina']);
/** Nombre de una persona dicho tras «inquilino», «se llama», «alta de»… */
function nombrePersona(original, t) {
  const r = /\b(?:inquilin[oa]|huesped|cliente|se llama|llamad[oa]|a nombre de|alta (?:de|a)|nuevo contrato (?:para|de|con|a)|nueva inquilina|nuevo inquilino|entra a vivir|alquilad[oa] a|alquila(?:r)? a|reserva (?:de|para|a nombre de))\s+(.+)/;
  const x = t.match(r);
  if (!x) return null;
  const ws = x[1].replace(/[.,;:]/g, ' ').split(' ').filter(Boolean);
  const nom = [];
  while (ws.length && /^(a|al|la|el|de|inquilin[oa]|nuev[oa]|huesped|senor|senora|don|dona|una|un)$/.test(ws[0])) ws.shift();
  for (const w of ws) {
    if (CORTE.has(w) || /\d/.test(w) || (nom.length && /^(de|del)$/.test(w) && false)) break;
    if (/^(de|del)$/.test(w)) { if (!nom.length) continue; nom.push(w); continue; }
    nom.push(w);
    if (nom.length >= 5) break;
  }
  while (nom.length && /^(de|del)$/.test(nom[nom.length - 1])) nom.pop();
  // Si el texto original traía mayúsculas (el dictado suele ponerlas en los nombres), se respetan
  const n = nom.join(' ');
  if (!n) return null;
  const orig = String(original).normalize('NFC');
  const re = new RegExp(n.split(' ').map((w) => w.replace(/[aeiou]/g, '[$&áéíóúÁÉÍÓÚ]').replace(/n/g, '[nñ]')).join('\\s+'), 'i');
  const enOrig = orig.match(re)?.[0];
  return enOrig && /[A-ZÁÉÍÓÚÑ]/.test(enOrig) ? enOrig.replace(/\s+/g, ' ') : capNombre(n);
}

/* ───────────── Contrato al que se refiere la frase ───────────── */

function contratoDe(t, s, hoy) {
  const vivos = (s.contratos || []).filter((k) => !k.finalizado && (!k.fin || k.fin >= hoy || k.fin >= sumarDias(hoy, -40)));
  const k = buscarInquilino(t, s);
  if (k) return k;
  const piso = buscarPiso(t, s);
  if (!piso) return null;
  const u = buscarUnidad(t, s, piso.id);
  const cands = vivos.filter((c) => c.pisoId === piso.id && (!u || c.unidadId === u.id) && c.inicio <= sumarDias(hoy, 60));
  return cands.length === 1 ? cands[0] : null;
}

/* ───────────── Órdenes ───────────── */

const SECCIONES = [
  [/\b(panel|inicio|resumen|portada)\b/, '', 'el panel'],
  [/\b(cobros?|recibos|impagos?)\b/, 'cobros', 'Cobros'],
  [/\bgastos?\b/, 'gastos', 'Gastos'],
  [/\b(calendario|reservas)\b/, 'calendario', 'el calendario'],
  [/\b(impuestos?|fiscal|hacienda|declaracion|renta anual|irpf)\b/, 'fiscal', 'Impuestos'],
  [/\b(ajustes|configuracion|opciones)\b/, 'ajustes', 'Ajustes'],
  [/\bpisos\b/, 'pisos', 'Pisos'],
];

/**
 * Devuelve null si la frase no es una de estas órdenes (entonces se prueba con gastos y cobros), o
 * { tipo: 'ir', ruta, texto } · { tipo: 'form', form, id?, pisoId?, unidadId?, campos, resumen, faltan, aviso? }.
 */
export function ordenar(original, s, hoy) {
  const t = cifras(norm(original).replace(/\bpor ciento\b/g, '%'));
  const piso = buscarPiso(t, s);

  // Ir a una pantalla
  if (/^(abre|abrir|ve a|vete a|ir a|vamos a|llevame a|lleva me a|ensename|muestrame|mostrar|ver|quiero ver|pasa a)\b/.test(t)) {
    for (const [re, ruta, nombre] of SECCIONES) if (re.test(t) && !(ruta === 'pisos' && piso)) return { tipo: 'ir', ruta: `#/${ruta}`, resumen: `Abro ${nombre}` };
    if (piso) return { tipo: 'ir', ruta: `#/pisos/${piso.id}`, resumen: `Abro ${piso.nombre}` };
  }

  // Alta de inquilino / nuevo contrato
  if (/\b(nuevo inquilino|nueva inquilina|nuevo contrato|alta de|alta a|da de alta|dar de alta|damos de alta|entra a vivir|entra en la habitacion|entra en el piso|alquilad[oa] a|he alquilado|hemos alquilado|alquila la habitacion|nuevo alquiler)\b/.test(t)) {
    const fs = fechas(t, hoy, true);
    const pisoId = piso?.id || null;
    const u = buscarUnidad(t, s, pisoId);
    const campos = {};
    const nombre = nombrePersona(original, t);
    if (nombre) campos.inquilino = nombre;
    const tel = telefono(t); if (tel) campos.telefono = tel;
    const mail = correo(original); if (mail) campos.email = mail;
    const doc = documento(t); if (doc) campos.dni = doc;
    let renta = numeroCerca(t, /\b(renta|alquiler|mensualidad|precio|paga|pagara|pagando|cuota)\b/);
    const fianza = numeroCerca(t, /\b(fianza|deposito)\b/);
    if (renta == null) { const imp = importe(t.replace(/\b(fianza|deposito)\b[^0-9]*\d+(?:[.,]\d+)?/g, ' ').replace(/\b(telefono|movil)\b[\s\d]*/g, ' ')); if (imp != null) renta = imp; }
    if (renta != null) campos.renta = renta;
    if (fianza != null) campos.fianza = fianza;
    else if (/\bfianza de (un|una|1) mes\b/.test(t) && renta) campos.fianza = renta;
    else if (/\bfianza de (dos|2) meses\b/.test(t) && renta) campos.fianza = renta * 2;
    const dia = t.match(/\b(?:paga|pagara|pago|cobro|cobra)\s+(?:el\s+)?(?:dia\s+)?(\d{1,2})\s+de\s+cada\s+mes\b|\bdia de pago\s+(?:el\s+)?(\d{1,2})\b/);
    if (dia) campos.diaPago = Number(dia[1] || dia[2]);
    const ini = fechaTras(t, fs, /\b(desde|empieza|empezando|entra|a partir de|inicio|comienza|comenzando|el contrato empieza)\b/) || fs.find((f) => !/\bhasta\b/.test(t.slice(Math.max(0, f.i - 8), f.i)));
    if (ini) campos.inicio = ini.fecha;
    const finF = fechaTras(t, fs, /\b(hasta|termina|terminando|finaliza|fin|acaba|sale)\b/);
    const dur = t.match(/\b(?:por|durante|de)\s+(\d+|un|una|medio)\s+(anos?|meses?)\b/);
    const desde = campos.inicio || hoy;
    if (finF) campos.fin = finF.soloMes ? sumarDias(sumarMeses(finF.fecha, 1), -1) : finF.fecha;
    else if (dur) {
      const n = dur[1] === 'medio' ? 6 : (dur[1] === 'un' || dur[1] === 'una' ? 1 : Number(dur[1])) * (/^ano/.test(dur[2]) ? 12 : 1);
      campos.fin = sumarDias(sumarMeses(desde, n), -1);
    }
    const faltan = [];
    if (!pisoId) faltan.push('el piso');
    if (!campos.inquilino) faltan.push('el nombre');
    if (campos.renta == null) faltan.push('la renta');
    const pModo = piso?.modalidad;
    if (pModo === 'habitaciones' && !u) faltan.push('la habitación');
    if (pModo === 'habitaciones' && u) {
      const ocupada = (s.contratos || []).find((k) => k.unidadId === u.id && !k.finalizado && (!k.fin || k.fin >= (campos.inicio || hoy)));
      if (ocupada) return { tipo: 'form', form: 'contrato', pisoId, unidadId: u.id, campos, faltan, resumen: 'Nuevo contrato', aviso: `Ojo: ${u.nombre} está ocupada por ${ocupada.inquilino}${ocupada.fin ? ` hasta el ${ocupada.fin.split('-').reverse().join('/')}` : ''}. Finaliza antes ese contrato o cambia la habitación.` };
    }
    return { tipo: 'form', form: 'contrato', pisoId, unidadId: u?.id || null, campos, faltan, resumen: 'Nuevo contrato' };
  }

  // Fin de contrato
  if (/\b(finaliza|finalizar|finalizo|termina|terminar|termino|da de baja|dar de baja|baja de|baja a|se va|se marcha|se fue|se ha ido|se ha marchado|deja la habitacion|deja el piso|dejo la habitacion|dejo el piso|sale del piso|rescinde|rescindir|acaba el contrato|fin del contrato|fin de contrato|ha terminado|abandona)\b/.test(t)
      && !/\b(cambia|cambiar|corrige|modifica|pon|ponle)\b/.test(t)) {
    const k = contratoDe(t, s, hoy);
    if (!k) return { tipo: 'form', form: 'finalizar', id: null, campos: {}, faltan: ['de quién es el contrato'], resumen: 'Finalizar contrato' };
    const fs = fechas(t, hoy, true);
    const f = fs[fs.length - 1];
    const campos = {};
    if (f) campos.fin = f.soloMes ? sumarDias(sumarMeses(f.fecha, 1), -1) : f.fecha;
    return { tipo: 'form', form: 'finalizar', id: k.id, campos, faltan: [], resumen: `Finalizar el contrato de ${k.inquilino}` };
  }

  // Renovar
  if (/\b(renueva|renovar|renovamos|renovacion|prorroga|prorrogar|prorrogamos|ampliar el contrato|amplia el contrato)\b/.test(t)) {
    const k = contratoDe(t, s, hoy);
    if (!k) return { tipo: 'form', form: 'renovar', id: null, campos: {}, faltan: ['de quién es el contrato'], resumen: 'Renovar contrato' };
    const campos = {};
    const pct = t.match(/(-?\d+(?:[.,]\d+)?)\s*(?:%|por ciento)/);
    if (pct) campos.pct = pct[1].replace('.', ',');
    else if (/\b(misma renta|sin subir|igual)\b/.test(t)) campos.pct = '0';
    return { tipo: 'form', form: 'renovar', id: k.id, campos, faltan: [], resumen: `Renovar el contrato de ${k.inquilino}` };
  }

  // Cambio de renta
  if (/\b(renta|alquiler|mensualidad)\b/.test(t) && /\b(sube|subir|subimos|subele|sube le|baja|bajar|bajamos|bajale|actualiza|actualizar|actualizamos|cambia|cambiar|pon|ponle|nueva|ipc|pasa a|queda en|ahora paga|va a pagar|pagara)\b/.test(t) && !/\b(gasto|cobrado|ha pagado)\b/.test(t)) {
    const k = contratoDe(t, s, hoy);
    if (k) {
      const campos = {};
      const fs = fechas(t, hoy, true);
      const f = fechaTras(t, fs, /\b(desde|a partir de|empezando|en)\b/) || fs[0];
      if (f) campos.desde = f.fecha.slice(0, 7);
      const pct = t.match(/(-?\d+(?:[.,]\d+)?)\s*(?:%|por ciento)/);
      if (pct) campos.pct = pct[1].replace('.', ',');
      else {
        const n = numeroCerca(t, /\b(renta|alquiler|mensualidad|a|en|paga|pagar|pagara)\b/, { antes: false });
        if (n != null && n > 31) campos.nueva = n;
        else { const imp = importe(t); if (imp != null && imp > 31) campos.nueva = imp; }
      }
      return { tipo: 'form', form: 'renta', id: k.id, campos, faltan: campos.pct || campos.nueva ? [] : ['la nueva renta o el porcentaje'], resumen: `Actualizar la renta de ${k.inquilino}` };
    }
  }

  // Reserva turística
  if (/\breserva\b/.test(t) && !/\b(borra|elimina|cancela|anula)\b/.test(t)) {
    const fs = fechas(t, hoy, true);
    const campos = {};
    const nombre = nombrePersona(original, t);
    if (nombre) campos.huesped = nombre;
    if (fs[0]) campos.entrada = fs[0].fecha;
    if (fs[1]) campos.salida = fs[1].fecha;
    const noches = t.match(/\b(\d+)\s+noches?\b/);
    if (!fs[1] && fs[0] && noches) campos.salida = sumarDias(fs[0].fecha, Number(noches[1]));
    const imp = numeroCerca(t, /\b(importe|precio|total|por|paga|pagan|cobro|cobra)\b/, { antes: true }) ?? importe(t);
    if (imp != null) campos.importe = imp;
    const com = numeroCerca(t, /\bcomision\b/);
    if (com != null) campos.comision = com;
    const canal = t.match(/\b(airbnb|booking|directo|directa|particular)\b/);
    if (canal) campos.canal = { airbnb: 'Airbnb', booking: 'Booking', directo: 'Directo', directa: 'Directo', particular: 'Directo' }[canal[1]];
    const hs = t.match(/\b(\d+)\s+(personas|huespedes|adultos)\b/);
    if (hs) campos.huespedes = Number(hs[1]);
    const tel = telefono(t); if (tel) campos.telefono = tel;
    const faltan = [];
    if (!campos.entrada) faltan.push('las fechas');
    if (campos.importe == null) faltan.push('el importe');
    return { tipo: 'form', form: 'reserva', pisoId: piso?.id || null, campos, faltan, resumen: 'Nueva reserva' };
  }

  // Gasto fijo (se repite)
  const periodo = t.match(/\b(gasto fijo|todos los meses|cada mes|mensualmente|al mes|mensual|cada dos meses|bimestral|cada tres meses|trimestral|trimestralmente|cada seis meses|semestral|cada ano|anual|anualmente|al ano|domiciliad[oa])\b/);
  if (periodo && /\b(gasto|pago|pagamos|cuota|recibo|cargo|comunidad|seguro|ibi|luz|agua|internet|gas|basura|fijo)\b/.test(t) && !/\b(renta|alquiler|inquilino|cobr)/.test(t)) {
    const tm = tema(t);
    const cada = /dos meses|bimestral/.test(periodo[1]) ? 2 : /tres meses|trimestral/.test(periodo[1]) ? 3 : /seis meses|semestral/.test(periodo[1]) ? 6 : /ano|anual/.test(periodo[1]) ? 12 : 1;
    const campos = { cadaMeses: cada };
    if (tm) { campos.categoria = tm.categoria; campos.concepto = tm.concepto; }
    const imp = importe(t); if (imp != null) campos.importe = imp;
    const fs = fechas(t, hoy, true);
    const ini = fechaTras(t, fs, /\b(desde|a partir de|empezando|primer cargo|empieza)\b/);
    const diaM = t.match(/\b(?:el\s+)?(?:dia\s+)?(\d{1,2})\s+de\s+cada\s+mes\b/);
    if (ini) campos.desde = ini.fecha;
    else if (diaM) campos.desde = `${hoy.slice(0, 8)}${p2(diaM[1])}`;
    const hasta = fechaTras(t, fs, /\b(hasta|termina)\b/); if (hasta) campos.hasta = hasta.fecha;
    const faltan = []; if (!piso) faltan.push('el piso'); if (imp == null) faltan.push('el importe');
    return { tipo: 'form', form: 'recurrente', pisoId: piso?.id || null, campos, faltan, resumen: 'Nuevo gasto fijo' };
  }

  // Hipoteca
  if (/\bhipoteca\b/.test(t) && /\b(cuota|capital|pendiente|debo|tipo|interes|euribor|banco|entidad|ultima cuota|termina|acaba|nueva hipoteca|anade|crea)\b/.test(t) && !/\b(gasto|he pagado|pague|apunta)\b/.test(t) && piso) {
    const h = (s.hipotecas || []).find((x) => x.pisoId === piso.id);
    const campos = {};
    const cuota = numeroCerca(t, /\bcuota\b/); if (cuota != null) campos.cuota = cuota;
    const cap = numeroCerca(t, /\b(capital|pendiente|debo|queda por pagar|quedan)\b/); if (cap != null && cap > 500) campos.capitalPendiente = cap;
    const tipoI = t.match(/\b(?:tipo|interes|tin)\b[^0-9]{0,24}(\d+(?:[.,]\d+)?)/); if (tipoI && Number(tipoI[1].replace(',', '.')) < 20) campos.tipo = tipoI[1].replace('.', ',');
    const ent = t.match(/\b(?:banco|entidad|con el|con la|en el)\s+(santander|bbva|caixabank|la caixa|sabadell|bankinter|unicaja|ing|abanca|kutxabank|ibercaja|cajamar|openbank|cajasur|caja rural|deutsche bank|evo)\b/);
    if (ent) campos.entidad = capNombre(ent[1]);
    const fs = fechas(t, hoy, true);
    const fin = fechaTras(t, fs, /\b(ultima cuota|termina|acaba|hasta)\b/); if (fin) campos.mesFin = fin.fecha.slice(0, 7);
    if (campos.capitalPendiente != null) campos.mesRef = hoy.slice(0, 7);
    return { tipo: 'form', form: 'hipoteca', id: h?.id || null, pisoId: piso.id, campos, faltan: [], resumen: h ? `Hipoteca de ${piso.nombre}` : `Nueva hipoteca de ${piso.nombre}` };
  }

  // Corregir o borrar un gasto ya apuntado
  if (/\b(borra|borrar|elimina|eliminar|quita|quitar|cambia|cambiar|corrige|corregir|modifica|modificar|edita|editar|era de|eran)\b/.test(t) && /\bgasto\b|\bfactura\b/.test(t)) {
    const tm = tema(t);
    const fs = fechas(t, hoy, false);
    const mes = fs.find((f) => f.soloMes || f.fecha)?.fecha.slice(0, 7);
    let cands = (s.gastos || []).filter((g) => (!piso || g.pisoId === piso.id) && (!tm || g.categoria === tm.categoria) && (!mes || g.fecha.slice(0, 7) === mes || g.periodo === mes));
    if (tm && tm.categoria === 'suministros') { const w = norm(tm.concepto).split(' ')[0]; const alias = { luz: /luz|electric|endesa|iberdrola/, agua: /agua|emasesa/, gas: /gas|naturgy/, internet: /internet|fibra|wifi|digi|movistar|vodafone|orange/ }[w]; if (alias) cands = cands.filter((g) => alias.test(norm(`${g.concepto} ${g.proveedor || ''}`))); }
    cands.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const borrar = /\b(borra|borrar|elimina|eliminar|quita|quitar)\b/.test(t);
    const campos = {};
    if (!borrar) { const n = numeroCerca(t, /\b(son|es|era|eran|a|por|importe|pon|ponle)\b/, { antes: false }); if (n != null) campos.importe = n; }
    if (!cands.length) return { tipo: 'nada', resumen: 'No encuentro ese gasto. Di el piso, qué era y el mes.' };
    return { tipo: 'form', form: 'gasto', id: cands[0].id, otros: cands.length - 1, campos, faltan: [], borrar, resumen: borrar ? 'Borrar gasto' : 'Corregir gasto' };
  }

  // Nueva habitación
  if (/\b(anade|crea|nueva|otra)\s+(una\s+)?habitacion\b/.test(t) && piso) return { tipo: 'form', form: 'unidad', pisoId: piso.id, campos: {}, faltan: [], resumen: `Nueva habitación en ${piso.nombre}` };

  // Cambiar datos de un contrato (teléfono, email, DNI, fianza, día de pago, fechas, nombre, notas)
  const cambio = /\b(telefono|movil|email|correo|dni|nie|fianza|nota|nif|cif|valor|superficie)\b.*\b(es|son|sera|seran)\b/.test(t) || /\b(cambia|cambiar|cambiale|pon|ponle|ponme|modifica|corrige|actualiza|anade|anadele|apunta|guarda|es el|es la|su telefono|su email|su correo|su dni|tiene)\b/.test(t);
  const campoContrato = t.match(/\b(telefono|movil|whatsapp|email|e-mail|correo|dni|nie|pasaporte|documento|fianza|dia de pago|fecha de inicio|fecha de fin|fecha de salida|fecha de entrada|fecha final|nombre|nota|notas|apellido|apellidos)\b/);
  if (cambio && campoContrato) {
    const k = contratoDe(t, s, hoy);
    if (k) {
      const campos = {};
      const c = campoContrato[1];
      if (/telefono|movil|whatsapp/.test(c)) { const v = telefono(t); if (v) campos.telefono = v; }
      if (/email|e-mail|correo/.test(c)) { const v = correo(original); if (v) campos.email = v; }
      if (/dni|nie|pasaporte|documento/.test(c)) { const v = documento(t); if (v) campos.dni = v; }
      if (c === 'fianza') { const v = numeroCerca(t, /\bfianza\b/); if (v != null) campos.fianza = v; }
      if (c === 'dia de pago') { const v = t.match(/dia de pago\D{0,12}(\d{1,2})/); if (v) campos.diaPago = Number(v[1]); }
      if (/fecha de (inicio|entrada)/.test(c)) { const f = fechas(t, hoy, true)[0]; if (f) campos.inicio = f.fecha; }
      if (/fecha (de fin|de salida|final)/.test(c)) { const f = fechas(t, hoy, true)[0]; if (f) campos.fin = f.fecha; }
      if (/nombre|apellido/.test(c)) { const x = original.match(/\b(?:es|a|por)\s+([A-Za-zÁÉÍÓÚÑáéíóúñü ]{3,60})$/); if (x) campos.inquilino = x[1].trim(); }
      if (/nota/.test(c)) {
        const x = original.match(/\bnotas?\b\s*(?:que dice|que diga|diciendo|:|de que|con)?\s*(.+)$/i);
        if (x) campos.notas = `${k.notas ? `${k.notas} ` : ''}${x[1].trim()}`;
      }
      const faltan = Object.keys(campos).length ? [] : [`el nuevo valor (${c})`];
      return { tipo: 'form', form: 'contrato', id: k.id, campos, faltan, resumen: `Contrato de ${k.inquilino}` };
    }
  }

  // Cambiar datos de un piso
  const CAMPOS_PISO = [
    [/\b(superficie|metros cuadrados|metros|m2)\b/, 'superficie', 'n'],
    [/\b(zonas comunes)\b/, 'superficieComun', 'n'],
    [/\b(valor de mercado|valor|vale|tasacion|tasado)\b/, 'valorMercado', 'n'],
    [/\b(precio de compra|precio de adquisicion|me costo|costo|lo compre por|compramos por)\b/, 'precioAdquisicion', 'n'],
    [/\b(dormitorios|habitaciones tiene)\b/, 'dormitorios', 'n'],
    [/\b(banos)\b/, 'banos', 'n'],
    [/\b(ano de construccion|construido en|reformado en|ano de reforma)\b/, 'anioConstruccion', 'n'],
    [/\b(referencia catastral|catastral|catastro)\b/, 'refCatastral', 'ref'],
    [/\b(direccion)\b/, 'direccion', 'texto'],
    [/\b(extras|caracteristicas)\b/, 'caracteristicas', 'texto'],
    [/\b(nombre del piso)\b/, 'nombre', 'texto'],
  ];
  if (piso && (cambio || /\b(tiene|mide|son|es|vale)\b/.test(t))) {
    const campos = {};
    for (const [re, campo, tipo] of CAMPOS_PISO) {
      if (!re.test(t) || campos[campo] != null) continue;
      if (tipo === 'n') { const v = numeroCerca(t, re); if (v != null) campos[campo] = v; }
      else if (tipo === 'ref') { const x = juntarCodigos(original).match(/\b[0-9A-Za-z]{20}\b/); if (x) campos[campo] = x[0].toUpperCase(); }
      else { const x = original.match(new RegExp(`${re.source.replace(/\\b/g, '')}\\s*(?:es|a|:)?\\s*(.+)$`, 'i')); if (x) campos[campo] = x[x.length - 1].trim(); }
    }
    if (campos.valorMercado != null) campos.fechaValoracion = hoy;
    if (Object.keys(campos).length) return { tipo: 'form', form: 'piso', id: piso.id, campos, faltan: [], resumen: `Datos de ${piso.nombre}` };
  }

  // Titular (nombre o NIF de la persona o sociedad)
  if (/\b(nif|cif|titular|sociedad)\b/.test(t) && cambio) {
    const ts = s.titulares || [];
    const tit = ts.find((x) => palabras(x.nombre).some((p) => p.length >= 4 && palabras(t).some((w) => parecida(w, p)))) || (piso && ts.find((x) => x.id === piso.titularId)) || (/\bsociedad\b/.test(t) ? ts.find((x) => x.tipo === 'sociedad') : null) || (ts.length === 1 ? ts[0] : null);
    if (tit) {
      const campos = {};
      const nif = juntarCodigos(original).match(/\b([A-Za-z]\d{7}[A-Za-z0-9]|\d{8}[A-Za-z])\b/);
      if (nif) campos.nif = nif[1].toUpperCase();
      return { tipo: 'form', form: 'titular', id: tit.id, campos, faltan: Object.keys(campos).length ? [] : ['el NIF'], resumen: `Titular ${tit.nombre}` };
    }
  }

  // «Abre el contrato de Miguel», «edita el piso de Sigüenza»
  if (/^(abre|edita|editar|ver|muestrame|ensename)\b/.test(t)) {
    if (/\bcontrato\b/.test(t)) { const k = contratoDe(t, s, hoy); if (k) return { tipo: 'form', form: 'contrato', id: k.id, campos: {}, faltan: [], resumen: `Contrato de ${k.inquilino}` }; }
    if (piso) return { tipo: 'ir', ruta: `#/pisos/${piso.id}`, resumen: `Abro ${piso.nombre}` };
  }
  return null;
}
