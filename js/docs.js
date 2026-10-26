// Documentos adjuntos (fotos de tickets, facturas, contratos, escrituras…).
// Los archivos se guardan en IndexedDB de este dispositivo; en el estado de la app solo queda
// su ficha (tipo, a qué pertenece, nombre, tamaño). Incluye un ZIP mínimo (sin compresión)
// para enviar los justificantes al gestor y para las copias de seguridad con documentos.

const DB = 'alquileres-docs';
const ALMACEN = 'docs';
let dbp = null;

function db() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function op(modo, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(ALMACEN, modo);
    const req = fn(tx.objectStore(ALMACEN));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('Sin espacio para guardar el documento'));
  });
}
export const ponerBlob = (clave, blob) => op('readwrite', (s) => s.put(blob, clave));
export const leerBlob = (clave) => op('readonly', (s) => s.get(clave));
export async function borrarDoc(id) {
  urls.get(id) && URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
  await op('readwrite', (s) => { s.delete(id); s.delete(`${id}:t`); });
}

/* ───────────── Preparar archivos (las fotos se reducen para ocupar menos) ───────────── */

const MAX_LADO = 2200;
async function aCanvas(file, lado) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const f = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * f);
  c.height = Math.round(bmp.height * f);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}
const aBlob = (c, calidad) => new Promise((r) => c.toBlob(r, 'image/jpeg', calidad));

/** Devuelve { blob, miniatura, mime, nombre } listo para guardar. */
export async function prepararArchivo(file) {
  const esImagen = /^image\/(jpeg|png|webp|heic|heif)/.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  let blob = file;
  let mime = file.type || 'application/octet-stream';
  let nombre = file.name || 'documento';
  let miniatura = null;
  if (esImagen) {
    try {
      const c = await aCanvas(file, MAX_LADO);
      const j = await aBlob(c, 0.82);
      if (j && (j.size < file.size || /heic|heif/i.test(mime))) { blob = j; mime = 'image/jpeg'; nombre = nombre.replace(/\.\w+$/, '') + '.jpg'; }
      const t = await aCanvas(file, 360);
      miniatura = await aBlob(t, 0.7);
    } catch {
      // Formato que el navegador no sabe abrir: se guarda tal cual.
    }
  }
  return { blob, miniatura, mime, nombre };
}

/** Guarda el archivo y su miniatura; devuelve la ficha del documento (sin asociar todavía). */
export async function guardarArchivo(file, id) {
  const p = await prepararArchivo(file);
  await ponerBlob(id, p.blob);
  if (p.miniatura) await ponerBlob(`${id}:t`, p.miniatura);
  return { id, nombre: p.nombre, mime: p.mime, size: p.blob.size, miniatura: !!p.miniatura, creado: new Date().toISOString() };
}

/* ───────────── URLs para ver los archivos ───────────── */

const urls = new Map();
let buscarFuera = null;
/** Quién trae un archivo que no está en este móvil (la sincronización). */
export function alFaltarArchivo(fn) { buscarFuera = fn; }
/** El archivo de este móvil o, si llegó la ficha de otro móvil, descargado de la sincronización. */
export async function obtenerBlob(clave) { return (await leerBlob(clave)) || (buscarFuera ? buscarFuera(clave) : null); }
export async function urlDe(id, miniatura = false) {
  const clave = miniatura ? `${id}:t` : id;
  if (urls.has(clave)) return urls.get(clave);
  let b = await leerBlob(clave);
  if (!b && buscarFuera) b = await buscarFuera(clave); // llegó de otro móvil: se descarga ahora
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urls.set(clave, u);
  return u;
}

export const tamano = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const extension = (mime, nombre = '') => (/\.(\w{2,5})$/.exec(nombre)?.[1] || ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[mime] || 'bin')).toLowerCase();

/* ───────────── ZIP (método «store», nombres UTF-8) ───────────── */

let TABLA = null;
function crc32(buf) {
  if (!TABLA) {
    TABLA = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLA[i] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function fechaDos(d = new Date()) {
  return {
    t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    f: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** entradas: [{ nombre, datos: Blob | Uint8Array | string }] → Blob zip */
export async function crearZip(entradas) {
  const enc = new TextEncoder();
  const partes = [];
  const central = [];
  let offset = 0;
  const { t, f } = fechaDos();
  for (const e of entradas) {
    const datos = e.datos instanceof Uint8Array ? e.datos : typeof e.datos === 'string' ? enc.encode(e.datos) : new Uint8Array(await e.datos.arrayBuffer());
    const nombre = enc.encode(e.nombre);
    const crc = crc32(datos);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
    loc.setUint16(10, t, true); loc.setUint16(12, f, true); loc.setUint32(14, crc, true);
    loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true); loc.setUint16(26, nombre.length, true); loc.setUint16(28, 0, true);
    partes.push(loc.buffer, nombre, datos);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, t, true); cen.setUint16(14, f, true); cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true);
    cen.setUint16(28, nombre.length, true); cen.setUint32(42, offset, true);
    central.push(cen.buffer, nombre);
    offset += 30 + nombre.length + datos.length;
  }
  const tamCentral = central.reduce((a, p) => a + (p.byteLength ?? p.length), 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, entradas.length, true); fin.setUint16(10, entradas.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
  return new Blob([...partes, ...central, fin.buffer], { type: 'application/zip' });
}

/** Lee un ZIP (sin compresión, o «deflate» si el navegador lo soporta). → [{ nombre, datos: Uint8Array }] */
export async function leerZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error('El archivo no es un ZIP válido.');
  const n = dv.getUint16(fin + 10, true);
  let p = dv.getUint32(fin + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < n; i++) {
    const metodo = dv.getUint16(p + 10, true);
    const comp = dv.getUint32(p + 20, true);
    const ln = dv.getUint16(p + 28, true);
    const le = dv.getUint16(p + 30, true);
    const lc = dv.getUint16(p + 32, true);
    const loc = dv.getUint32(p + 42, true);
    const nombre = dec.decode(buf.subarray(p + 46, p + 46 + ln));
    const ini = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
    let datos = buf.subarray(ini, ini + comp);
    if (metodo === 8) {
      if (!('DecompressionStream' in window)) throw new Error('Este navegador no puede abrir ZIP comprimidos.');
      datos = new Uint8Array(await new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    } else if (metodo !== 0) throw new Error('ZIP con un formato no soportado.');
    out.push({ nombre, datos });
    p += 46 + ln + le + lc;
  }
  return out;
}
