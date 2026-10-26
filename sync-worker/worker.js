// Servidor de sincronización de «Alquileres» (Cloudflare Worker + KV).
// Solo guarda datos CIFRADOS en el móvil con el código de la cartera: aquí no se puede leer nada.
//
//   GET  /v1/:id            → { version, datos }         (404 si la cartera no existe)
//   PUT  /v1/:id            ← { base, datos }            → { version } · 409 { version, datos } si alguien
//                                                          subió antes otra versión (el móvil junta y reintenta)
//   GET  /v1/:id/doc/:doc   → archivo cifrado (fotos de tickets, contratos…)
//   PUT  /v1/:id/doc/:doc   ← archivo cifrado
//
// :id es un resumen (SHA-256) del código de la cartera, nunca el código.
// Necesita un espacio de nombres KV enlazado con el nombre CARTERAS.

const MAX_CARTERA = 8 * 1024 * 1024; // 8 MB de datos cifrados por cartera
const MAX_DOC = 12 * 1024 * 1024; // 12 MB por archivo
const ID = /^[A-Za-z0-9_-]{43}$/;
const DOC = /^[A-Za-z0-9_-]{6,64}(:t)?$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const error = (status, msg) => json({ error: msg }, status);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!env.CARTERAS) return error(500, 'Falta enlazar el espacio KV con el nombre CARTERAS');
    const url = new URL(request.url);
    const partes = url.pathname.split('/').filter(Boolean);
    if (partes.length === 0) return json({ ok: true, servicio: 'alquileres-sync' });
    if (partes[0] !== 'v1' || !ID.test(partes[1] || '')) return error(404, 'No encontrado');
    const id = partes[1];

    // Archivos adjuntos
    if (partes[2] === 'doc') {
      const doc = decodeURIComponent(partes[3] || '');
      if (!DOC.test(doc)) return error(400, 'Documento no válido');
      const clave = `d:${id}:${doc}`;
      if (request.method === 'GET') {
        const v = await env.CARTERAS.get(clave, 'arrayBuffer');
        if (!v) return error(404, 'No existe');
        return new Response(v, { headers: { ...CORS, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
      }
      if (request.method === 'PUT') {
        const cuerpo = await request.arrayBuffer();
        if (cuerpo.byteLength > MAX_DOC) return error(413, 'Archivo demasiado grande');
        await env.CARTERAS.put(clave, cuerpo);
        return json({ ok: true });
      }
      return error(405, 'Método no permitido');
    }
    if (partes.length !== 2) return error(404, 'No encontrado');

    const clave = `c:${id}`;
    if (request.method === 'GET') {
      const v = await env.CARTERAS.get(clave, 'json');
      return v ? json(v) : error(404, 'No existe');
    }
    if (request.method === 'PUT') {
      const texto = await request.text();
      if (texto.length > MAX_CARTERA) return error(413, 'Demasiados datos');
      let cuerpo;
      try { cuerpo = JSON.parse(texto); } catch { return error(400, 'JSON no válido'); }
      if (typeof cuerpo.datos !== 'string' || !Number.isInteger(cuerpo.base)) return error(400, 'Faltan datos');
      const actual = await env.CARTERAS.get(clave, 'json');
      const version = actual?.version || 0;
      if (cuerpo.base !== version) return json({ conflicto: true, version, datos: actual?.datos || null }, 409);
      const nueva = { version: version + 1, datos: cuerpo.datos, fecha: new Date().toISOString() };
      await env.CARTERAS.put(clave, JSON.stringify(nueva));
      return json({ version: nueva.version });
    }
    return error(405, 'Método no permitido');
  },
};
