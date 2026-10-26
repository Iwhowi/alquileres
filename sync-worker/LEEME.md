# Servidor de sincronización (Cloudflare Worker)

Permite que varios móviles compartan la misma cartera. Guarda solo datos **cifrados en el móvil**
con el código de la cartera: el servidor no puede leer nada. Plan gratuito de Cloudflare.

## Ponerlo en marcha (una sola vez, ~10 minutos)

1. Crea una cuenta gratuita en <https://dash.cloudflare.com/sign-up>.
2. **Guardar los datos:** menú *Storage & Databases* → *KV* → **Create** → nombre `alquileres` → *Add*.
3. **Crear el servidor:** menú *Compute (Workers)* → *Workers & Pages* → **Create** → *Start with Hello World!*
   → nombre `alquileres-sync` → **Deploy**.
4. Pulsa **Edit code**, borra todo lo que hay, pega el contenido de [`worker.js`](worker.js) y pulsa **Deploy**.
5. **Enlazar los datos:** vuelve al Worker → pestaña *Bindings* (o *Settings → Bindings*) → **Add binding**
   → *KV namespace* → Variable name: `CARTERAS` → KV namespace: `alquileres` → **Add binding** / **Deploy**.
6. Copia la dirección del Worker (tipo `https://alquileres-sync.TU-NOMBRE.workers.dev`) y ábrela:
   debe decir `{"ok":true,"servicio":"alquileres-sync"}`.
7. Pon esa dirección en `SERVIDOR_DEFECTO` de `js/sync.js` (o en la app: *Ajustes → Compartir entre
   móviles → Avanzado*).

## Límites del plan gratuito

100 000 lecturas y 1 000 escrituras al día en KV: de sobra para una familia (cada sincronización con
cambios es una escritura; cada foto nueva, dos).

## API

- `GET /v1/:id` → `{ version, datos }` · `PUT /v1/:id` ← `{ base, datos }` (409 si `base` no es la última versión)
- `GET|PUT /v1/:id/doc/:doc` → archivos adjuntos cifrados

`:id` es un SHA-256 del código; `datos` es JSON comprimido y cifrado con AES-GCM en el móvil.
