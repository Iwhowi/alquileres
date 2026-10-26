// Sincronización entre móviles (sin cuentas): los móviles que comparten el mismo CÓDIGO comparten la
// cartera. Todo se cifra en el móvil (AES-GCM con una clave sacada del código) antes de subirlo, así que
// el servidor solo guarda datos ilegibles.
//
// Cómo se juntan los cambios: cada registro (piso, gasto, cobro…) lleva la hora de su último cambio en
// este móvil; al sincronizar gana, registro a registro, el cambio más reciente, y los borrados viajan
// como «borrado a tal hora». Así los dos pueden apuntar cosas a la vez sin pisarse.
import { app } from './state.js';
import { guardar, alGuardar, sincronizar, migrar, estadoVacio } from './store.js';
import { leerBlob, ponerBlob, borrarDoc, alFaltarArchivo, obtenerBlob, crearZip, leerZip } from './docs.js';
import { toast } from './ui.js';
import { num, todayISO } from './calc.js';

/** Dirección del servidor (Cloudflare Worker). Se puede cambiar en Ajustes → Sincronizar → Avanzado. */
export const SERVIDOR_DEFECTO = '';

const CLAVE = 'alquileres.sync';
const COLS = ['titulares', 'pisos', 'unidades', 'contratos', 'cobros', 'reservas', 'gastos', 'recurrentes', 'hipotecas', 'docs'];
const AJ_LOCALES = new Set(['ultimoBackup', 'tipEdificio', 'creado', 'demo']); // propios de cada móvil

let cfg = leerCfg();
let estado = { fase: cfg?.codigo ? 'pendiente' : 'apagado', mensaje: '' };
let enCurso = null;
let temporizador = null;
const oyentes = new Set();

function leerCfg() { try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; } }
function guardarCfg() { try { if (cfg) localStorage.setItem(CLAVE, JSON.stringify(cfg)); else localStorage.removeItem(CLAVE); } catch (e) { console.warn(e); } }
const servidor = () => (cfg?.servidor || SERVIDOR_DEFECTO || '').replace(/\/+$/, '');
const avisar = () => { for (const f of oyentes) try { f(estado); } catch {} };
const fijar = (fase, mensaje = '') => { estado = { ...estado, fase, mensaje }; avisar(); };

export const activo = () => !!cfg?.codigo;
export const hayServidor = () => !!servidor();
export const estadoSync = () => ({ ...estado, ultima: cfg?.ultima || null, codigo: cfg?.codigo || '', servidor: servidor() });
export function alCambiarEstado(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

/* ───────────── Código y cifrado ───────────── */

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // sin I, L, O, U para no confundir
function codigoNuevo() {
  const b = crypto.getRandomValues(new Uint8Array(20)); // 160 bits
  let bits = 0; let val = 0; let out = '';
  for (const x of b) { val = (val << 8) | x; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  return out.match(/.{4}/g).join('-');
}
/** Normaliza lo que escribe la persona: minúsculas, espacios, O por 0, I/L por 1… */
export function normalizarCodigo(t) {
  const limpio = String(t || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  return limpio.length === 32 && [...limpio].every((c) => B32.includes(c)) ? limpio.match(/.{4}/g).join('-') : null;
}
const enc = new TextEncoder();
const sha = async (t) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t)));
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function aB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }
const deB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const claves = new Map();
async function clavesDe(codigo) {
  if (!claves.has(codigo)) {
    const base = codigo.replace(/-/g, '');
    const id = b64u(await sha(`alquileres:id:${base}`));
    const key = await crypto.subtle.importKey('raw', await sha(`alquileres:clave:${base}`), 'AES-GCM', false, ['encrypt', 'decrypt']);
    claves.set(codigo, { id, key });
  }
  return claves.get(codigo);
}
async function comprimir(u8, modo) {
  if (typeof CompressionStream === 'undefined') return u8;
  const s = new Blob([u8]).stream().pipeThrough(modo === 'c' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function cifrar(key, u8) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const z = await comprimir(u8, 'c');
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, z));
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = typeof CompressionStream === 'undefined' ? 0 : 1; // 1 = comprimido
  out.set(iv, 1); out.set(ct, 13);
  return out;
}
async function descifrar(key, u8) {
  const plano = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(1, 13) }, key, u8.subarray(13)));
  return u8[0] === 1 ? comprimir(plano, 'd') : plano;
}

/* ───────────── Huellas y marcas de cambio ───────────── */

function huella(obj) { // FNV-1a de 32 bits sobre el JSON
  const t = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
const ajustesComunes = (a = {}) => Object.fromEntries(Object.entries(a).filter(([k]) => !AJ_LOCALES.has(k)));
function huellasDe(s) {
  const h = {};
  for (const col of COLS) h[col] = Object.fromEntries((s[col] || []).map((x) => [x.id, huella(x)]));
  h.$aj = huella(ajustesComunes(s.ajustes));
  return h;
}
/** Anota qué registros han cambiado desde la última vez (se llama en cada guardado). */
// El registro de cambios funciona siempre (también sin servidor): sirve para juntar datos al pasarlos
// de un móvil a otro con un archivo.
function asegurarSeguimiento() {
  cfg ||= {};
  cfg.marcas ||= {}; cfg.borrados ||= {}; cfg.huellas ||= {}; cfg.ajT ||= 0;
}
function marcarCambios(s) {
  if (!s) return;
  asegurarSeguimiento();
  const ahora = Date.now();
  const nuevas = huellasDe(s);
  let hay = false;
  for (const col of COLS) {
    const antes = cfg.huellas[col] || {};
    const m = (cfg.marcas[col] ||= {}); const b = (cfg.borrados[col] ||= {});
    for (const [id, hh] of Object.entries(nuevas[col])) if (antes[id] !== hh) { m[id] = ahora; delete b[id]; hay = true; }
    for (const id of Object.keys(antes)) if (!(id in nuevas[col])) { b[id] = ahora; delete m[id]; hay = true; }
  }
  if (cfg.huellas.$aj !== nuevas.$aj) { cfg.ajT = ahora; hay = true; }
  cfg.huellas = nuevas;
  guardarCfg();
  if (hay) programar(3000);
}
alGuardar((s) => marcarCambios(s));

/* ───────────── Juntar ───────────── */

function paquete(s) {
  const cols = {};
  for (const col of COLS) cols[col] = Object.fromEntries((s[col] || []).map((x) => [x.id, { t: cfg.marcas[col]?.[x.id] || 0, v: x }]));
  return { formato: 1, cols, borrados: cfg.borrados, aj: { t: cfg.ajT || 0, v: ajustesComunes(s.ajustes) } };
}

/** Junta lo local con lo remoto, registro a registro. Devuelve { s, marcas, borrados, ajT, subir, cambiosLocales }. */
export function juntar(local, marcasL, borradosL, ajTL, remoto) {
  const s = JSON.parse(JSON.stringify(local));
  const marcas = {}; const borrados = {};
  let subir = false; let cambiosLocales = 0;
  for (const col of COLS) {
    const L = new Map((local[col] || []).map((x) => [x.id, x]));
    const R = remoto?.cols?.[col] || {};
    const bL = borradosL?.[col] || {}; const bR = remoto?.borrados?.[col] || {};
    const ids = new Set([...L.keys(), ...Object.keys(R), ...Object.keys(bL), ...Object.keys(bR)]);
    const resultado = []; const m = {}; const b = {};
    for (const id of ids) {
      const tl = L.has(id) ? marcasL?.[col]?.[id] || 0 : -1;
      const tr = R[id] ? R[id].t || 0 : -1;
      const tb = Math.max(bL[id] || -1, bR[id] || -1);
      const t = Math.max(tl, tr);
      if (tb >= 0 && tb >= t) { // borrado más reciente que cualquier cambio
        b[id] = tb;
        if (L.has(id)) cambiosLocales++;
        if ((bR[id] || -1) < tb || R[id]) subir = true;
        continue;
      }
      if (t < 0) continue;
      const ganaLocal = tl >= tr && L.has(id);
      const v = ganaLocal ? L.get(id) : R[id].v;
      resultado.push(v); m[id] = t;
      if (ganaLocal && (!R[id] || tl > tr || huella(R[id].v) !== huella(v))) subir = true;
      if (!ganaLocal && (!L.has(id) || huella(L.get(id)) !== huella(v))) cambiosLocales++;
    }
    // Conserva el orden local y añade lo nuevo al final
    const orden = new Map((local[col] || []).map((x, i) => [x.id, i]));
    resultado.sort((a, c) => (orden.get(a.id) ?? 1e9) - (orden.get(c.id) ?? 1e9));
    s[col] = resultado; marcas[col] = m; borrados[col] = b;
  }
  let ajT = ajTL || 0;
  if (remoto?.aj && (remoto.aj.t || 0) > ajT) {
    if (huella(ajustesComunes(local.ajustes)) !== huella(remoto.aj.v)) cambiosLocales++;
    s.ajustes = { ...s.ajustes, ...remoto.aj.v };
    ajT = remoto.aj.t;
  } else if (!remoto?.aj || (ajTL || 0) > (remoto.aj.t || 0)) subir = true;
  // Recibos y apuntes de gastos fijos generados a la vez en los dos móviles: uno por contrato/gasto y mes
  const quitar = (col, x) => { s[col] = s[col].filter((y) => y !== x); borrados[col][x.id] = Math.max((marcas[col][x.id] || 0) + 1, Date.now()); delete marcas[col][x.id]; subir = true; };
  const unicos = (col, filtro, clave, mejor) => {
    const vistos = new Map();
    for (const x of [...s[col]]) {
      if (!filtro(x)) continue;
      const k = clave(x);
      const otro = vistos.get(k);
      if (!otro) { vistos.set(k, x); continue; }
      const [queda, sobra] = mejor(otro, x) >= 0 ? [otro, x] : [x, otro];
      vistos.set(k, queda); quitar(col, sobra);
    }
  };
  const peso = (col) => (x) => [num(x.cobrado) > 0 ? 1 : 0, x.editado ? 1 : 0, marcas[col][x.id] || 0, x.id];
  const comparar = (col) => (a, c) => { const pa = peso(col)(a); const pc = peso(col)(c); for (let i = 0; i < pa.length; i++) if (pa[i] !== pc[i]) return pa[i] > pc[i] ? 1 : -1; return 0; };
  unicos('cobros', (x) => x.auto && x.contratoId, (x) => `${x.contratoId}|${x.periodo}`, comparar('cobros'));
  unicos('gastos', (x) => x.recurrenteId, (x) => `${x.recurrenteId}|${x.periodo}`, comparar('gastos'));
  return { s, marcas, borrados, ajT, subir, cambiosLocales };
}

/* ───────────── Red ───────────── */

async function pedir(ruta, opciones = {}) {
  const r = await fetch(`${servidor()}${ruta}`, { ...opciones, cache: 'no-store' });
  return r;
}
async function bajar(id, key) {
  const r = await pedir(`/v1/${id}`);
  if (r.status === 404) return { version: 0, datos: null };
  if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
  const j = await r.json();
  return { version: j.version, datos: j.datos ? JSON.parse(new TextDecoder().decode(await descifrar(key, deB64(j.datos)))) : null };
}
async function subir(id, key, base, datos) {
  const cuerpo = aB64(await cifrar(key, enc.encode(JSON.stringify(datos))));
  const r = await pedir(`/v1/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base, datos: cuerpo }) });
  if (r.status === 409) return { conflicto: true };
  if (!r.ok) throw new Error(r.status === 413 ? 'La cartera es demasiado grande para sincronizar' : `El servidor respondió ${r.status}`);
  return { version: (await r.json()).version };
}

/* ───────────── Documentos (fotos de tickets, contratos…) ───────────── */

async function subirDocs(s, id, key) {
  cfg.subidos ||= [];
  const hechos = new Set(cfg.subidos);
  for (const d of s.docs || []) {
    if (hechos.has(d.id)) continue;
    const blob = await leerBlob(d.id);
    if (!blob) continue; // aún no está en este móvil
    for (const [clave, b] of [[d.id, blob], [`${d.id}:t`, d.miniatura ? await leerBlob(`${d.id}:t`) : null]]) {
      if (!b) continue;
      const cuerpo = await cifrar(key, new Uint8Array(await b.arrayBuffer()));
      const r = await pedir(`/v1/${id}/doc/${encodeURIComponent(clave)}`, { method: 'PUT', body: cuerpo });
      if (!r.ok) throw new Error(`No se ha podido subir un documento (${r.status})`);
    }
    hechos.add(d.id); cfg.subidos = [...hechos]; guardarCfg();
  }
}
async function bajarDoc(clave) {
  if (!cfg?.codigo || !servidor()) return null;
  const { id, key } = await clavesDe(cfg.codigo);
  const r = await pedir(`/v1/${id}/doc/${encodeURIComponent(clave)}`);
  if (!r.ok) return null;
  const ficha = app.s?.docs?.find((d) => d.id === clave.replace(/:t$/, ''));
  const blob = new Blob([await descifrar(key, new Uint8Array(await r.arrayBuffer()))], { type: clave.endsWith(':t') ? 'image/jpeg' : ficha?.mime || 'application/octet-stream' });
  await ponerBlob(clave, blob);
  return blob;
}
// Un documento que llegó de otro móvil se descarga la primera vez que se abre
alFaltarArchivo((clave) => bajarDoc(clave).catch(() => null));

/* ───────────── Sincronizar ───────────── */

function hayDialogo() { return !!document.querySelector('dialog[open]'); }

/** Sincroniza ahora. Devuelve true si todo fue bien. `forzar`: aunque haya un formulario abierto. */
export function sincronizarAhora({ forzar = false, silencioso = true } = {}) {
  if (!cfg?.codigo || !servidor()) return Promise.resolve(false);
  if (enCurso) return enCurso;
  if (!forzar && hayDialogo()) { programar(5000); return Promise.resolve(false); } // no cambiar datos con un formulario abierto
  if (!navigator.onLine) { fijar('sinConexion', 'Sin conexión: se sincronizará al volver'); return Promise.resolve(false); }
  enCurso = (async () => {
    fijar('sincronizando');
    try {
      const { id, key } = await clavesDe(cfg.codigo);
      for (let intento = 0; intento < 4; intento++) {
        const remoto = await bajar(id, key);
        const local = app.s || estadoVacio();
        const r = juntar(local, cfg.marcas, cfg.borrados, cfg.ajT, remoto.datos);
        // Documentos borrados en el otro móvil: fuera también aquí
        const docsAntes = new Set((local.docs || []).map((d) => d.id));
        const docsDespues = new Set(r.s.docs.map((d) => d.id));
        if (r.cambiosLocales || !app.s) {
          if (sincronizar(r.s, todayISO())) r.subir = true; // recibos del mes que falten
          cfg.marcas = r.marcas; cfg.borrados = r.borrados; cfg.ajT = r.ajT;
          cfg.huellas = huellasDe(r.s);
          guardarCfg();
          app.s = migrar(r.s);
          guardar(app.s); // las huellas ya coinciden: no se marca como cambio propio
          marcarCambios(app.s); // por si sincronizar() creó algo
          if (!hayDialogo()) app.render();
          if (!silencioso || r.cambiosLocales) toast(`Datos actualizados desde el otro móvil (${r.cambiosLocales} cambios)`);
        } else {
          cfg.marcas = r.marcas; cfg.borrados = r.borrados; cfg.ajT = r.ajT; guardarCfg();
        }
        for (const d of docsAntes) if (!docsDespues.has(d)) borrarDoc(d).catch(() => {});
        if (r.subir || remoto.version === 0) {
          const res = await subir(id, key, remoto.version, paquete(app.s));
          if (res.conflicto) continue; // otro móvil subió justo antes: se vuelve a juntar
          cfg.version = res.version;
        } else cfg.version = remoto.version;
        cfg.ultima = new Date().toISOString();
        guardarCfg();
        await subirDocs(app.s, id, key);
        // Miniaturas de los documentos llegados de otro móvil
        for (const d of app.s.docs || []) if (d.miniatura && !(await leerBlob(`${d.id}:t`))) await bajarDoc(`${d.id}:t`).catch(() => null);
        fijar('ok');
        return true;
      }
      throw new Error('Demasiados cambios a la vez; se reintentará');
    } catch (e) {
      console.error(e);
      fijar('error', e.message || String(e));
      if (!silencioso) toast(`No se ha podido sincronizar: ${e.message}`, { tipo: 'error', ms: 7000 });
      return false;
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}
export function programar(ms = 3000) {
  if (!cfg?.codigo) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => sincronizarAhora(), ms);
}

/* ───────────── Activar, unirse y salir ───────────── */

function empezar(codigo, s, tiempo) {
  const previo = cfg?.marcas && Object.keys(cfg.marcas).length ? cfg : null; // se conserva el registro de cambios
  cfg = { servidor: cfg?.servidor || '', codigo, version: 0, ultima: null, marcas: previo?.marcas || {}, borrados: previo?.borrados || {}, ajT: previo?.ajT || tiempo, huellas: huellasDe(s), subidos: [] };
  if (!previo) for (const col of COLS) cfg.marcas[col] = Object.fromEntries((s[col] || []).map((x) => [x.id, tiempo]));
  guardarCfg();
}

/** Primer móvil: crea la cartera compartida con los datos de este móvil y devuelve el código. */
export async function crearCartera() {
  if (!servidor()) throw new Error('Falta la dirección del servidor de sincronización');
  if (!app.s) throw new Error('Primero crea tu cartera o importa tus datos');
  const codigo = codigoNuevo();
  empezar(codigo, app.s, Date.now());
  const ok = await sincronizarAhora({ forzar: true, silencioso: false });
  if (!ok) { const msg = estado.mensaje; cfg = null; guardarCfg(); fijar('apagado'); throw new Error(msg || 'No se ha podido conectar con el servidor'); }
  return codigo;
}

/** Otro móvil: se une con el código. `descartarLocal`: empezar con los datos compartidos solamente. */
export async function unirse(codigoTexto, { descartarLocal = false } = {}) {
  const codigo = normalizarCodigo(codigoTexto);
  if (!codigo) throw new Error('El código no es correcto: son 32 letras y números (puedes pegarlo con o sin guiones)');
  if (!servidor()) throw new Error('Falta la dirección del servidor de sincronización');
  const { id, key } = await clavesDe(codigo);
  let remoto;
  try { remoto = await bajar(id, key); } catch (e) { throw new Error(/decrypt|operation/i.test(e.message) ? 'El código no coincide con la cartera' : e.message); }
  if (!remoto.datos) throw new Error('No existe ninguna cartera con ese código. Revisa que esté bien copiado.');
  if (descartarLocal || !app.s) app.s = null;
  // Lo que ya hubiera en este móvil entra con hora 1: si coincide algo, manda lo compartido
  empezar(codigo, app.s || estadoVacio(), 1);
  const ok = await sincronizarAhora({ forzar: true, silencioso: true });
  if (!ok) { const msg = estado.mensaje; cfg = null; guardarCfg(); fijar('apagado'); throw new Error(msg || 'No se ha podido sincronizar'); }
  return true;
}

/** Deja de sincronizar en este móvil (los datos se quedan aquí y en el otro móvil). */
export function salir() { cfg = { servidor: cfg?.servidor || '', marcas: cfg?.marcas || {}, borrados: cfg?.borrados || {}, huellas: cfg?.huellas || {}, ajT: cfg?.ajT || 0 }; guardarCfg(); fijar('apagado'); }
export function fijarServidor(url) {
  const u = String(url || '').trim().replace(/\/+$/, '');
  if (u && !/^(https:\/\/[^\s/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)/.test(u)) throw new Error('La dirección debe empezar por https://');
  cfg = { ...(cfg || {}), servidor: u }; guardarCfg(); avisar();
}

/** Arranque: sincroniza al abrir, al volver a la app, al recuperar conexión y cada minuto con la app a la vista. */
export function iniciarSync() {
  // Primera vez con datos ya existentes: todo cuenta como «antiguo» (hora 1)
  if (app.s && !cfg?.huellas) {
    asegurarSeguimiento();
    cfg.huellas = huellasDe(app.s);
    for (const col of COLS) cfg.marcas[col] = Object.fromEntries((app.s[col] || []).map((x) => [x.id, cfg.marcas[col]?.[x.id] || 1]));
    cfg.ajT ||= 1;
    guardarCfg();
  }
  setTimeout(() => sincronizarAhora(), 1500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') programar(800); });
  window.addEventListener('online', () => programar(800));
  setInterval(() => { if (document.visibilityState === 'visible') sincronizarAhora(); }, 60000);
  document.addEventListener('close', () => { if (cfg?.codigo) programar(1500); }, true); // al cerrar un formulario
}

/* ───────────── Pasar los datos con un archivo (sin servidor) ───────────── */

/** Archivo ZIP con los datos de este móvil (y sus documentos) para juntarlos en otro móvil. */
export async function archivoParaOtroMovil() {
  if (!app.s) throw new Error('Todavía no hay datos en este móvil');
  marcarCambios(app.s);
  const datos = { ...paquete(app.s), formato: 'alquileres-cambios', version: 1, creado: new Date().toISOString() };
  const entradas = [{ nombre: 'cambios.json', datos: enc.encode(JSON.stringify(datos)) }];
  for (const d of app.s.docs || []) {
    const b = await obtenerBlob(d.id).catch(() => null);
    if (b) entradas.push({ nombre: `docs/${d.id}`, datos: new Uint8Array(await b.arrayBuffer()) });
    const t = d.miniatura ? await obtenerBlob(`${d.id}:t`).catch(() => null) : null;
    if (t) entradas.push({ nombre: `docs/${d.id}.t`, datos: new Uint8Array(await t.arrayBuffer()) });
  }
  return crearZip(entradas);
}

/** Lee un archivo de otro móvil: devuelve lo que cambiaría y una función para aplicarlo. */
export async function leerDeOtroMovil(file) {
  const entradas = await leerZip(file);
  const e = entradas.find((x) => x.nombre === 'cambios.json');
  if (!e) return null;
  const remoto = JSON.parse(new TextDecoder().decode(e.datos));
  if (remoto.formato !== 'alquileres-cambios') throw new Error('El archivo no es de la app');
  if (app.s) marcarCambios(app.s);
  asegurarSeguimiento();
  const local = app.s || estadoVacio();
  const r = juntar(local, cfg.marcas, cfg.borrados, cfg.ajT, remoto);
  const antes = new Map(COLS.map((c) => [c, new Set((local[c] || []).map((x) => x.id))]));
  const nuevos = {}; let borrados = 0;
  for (const c of COLS) {
    nuevos[c] = r.s[c].filter((x) => !antes.get(c).has(x.id)).length;
    borrados += [...antes.get(c)].filter((id) => !r.s[c].some((x) => x.id === id)).length;
  }
  const aplicar = async () => {
    const docsAntes = new Set((local.docs || []).map((d) => d.id));
    sincronizar(r.s, todayISO());
    cfg.marcas = r.marcas; cfg.borrados = r.borrados; cfg.ajT = r.ajT;
    cfg.huellas = huellasDe(r.s);
    guardarCfg();
    // Documentos que llegan en el archivo
    for (const x of entradas) {
      if (!x.nombre.startsWith('docs/')) continue;
      const clave = x.nombre.slice(5).replace(/\.t$/, ':t');
      const id = clave.replace(/:t$/, '');
      if (!r.s.docs.some((d) => d.id === id) || (await leerBlob(clave))) continue;
      const ficha = r.s.docs.find((d) => d.id === id);
      await ponerBlob(clave, new Blob([x.datos], { type: clave.endsWith(':t') ? 'image/jpeg' : ficha?.mime || 'application/octet-stream' }));
    }
    for (const d of docsAntes) if (!r.s.docs.some((x) => x.id === d)) borrarDoc(d).catch(() => {});
    app.s = migrar(r.s);
    guardar(app.s);
    marcarCambios(app.s);
  };
  return { cambios: r.cambiosLocales, nuevos, borrados, remotoCreado: remoto.creado, aplicar };
}
