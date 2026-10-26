// Interfaz de documentos adjuntos: zona de fotos/archivos en los formularios, visor y borrado.
import { html, raw, ICON, toast, esc, fmtFecha, alCerrar } from './ui.js';
import { app } from './state.js';
import { uid } from './store.js';
import { guardarArchivo, borrarDoc, urlDe, tamano, leerBlob, obtenerBlob, extension } from './docs.js';

export const docsDe = (tipo, refId) => (app.s.docs || []).filter((d) => d.tipo === tipo && d.refId === refId);
export const tieneDocs = (tipo, refId) => (app.s.docs || []).some((d) => d.tipo === tipo && d.refId === refId);

const CAMARA = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
export const CLIP = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5 12.5 19a5 5 0 0 1-7-7l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.8 1.8 0 0 1-2.5-2.5L15 7.5"/></svg>';

/** Zona de adjuntos para poner dentro del cuerpo de un formulario. */
export function zonaDocs(titulo = 'Justificantes', ayuda = 'Foto del ticket o la factura. Se guarda en este dispositivo y se incluye en el ZIP para el gestor.') {
  return html`
    <div class="docs-zona span2" data-docs>
      <div class="docs-head">
        <span class="field-label">${raw(CLIP)} ${titulo}</span>
        <span class="grow"></span>
        <label class="btn btn-sm">${raw(CAMARA)}<span>Hacer foto</span><input type="file" accept="image/*" capture="environment" data-docs-in hidden></label>
        <label class="btn btn-sm btn-ghost">${raw(CLIP)}<span>Adjuntar</span><input type="file" accept="image/*,application/pdf" multiple data-docs-in hidden></label>
      </div>
      <div class="docs-grid" data-docs-grid></div>
      <small class="field-help">${ayuda}</small>
    </div>`;
}

/**
 * Activa la zona de adjuntos de un formulario. Los archivos nuevos se guardan al momento en el
 * dispositivo, pero solo quedan asociados al registro al confirmar; si se cancela, se borran.
 */
export function montarDocs(form, { tipo, refId }) {
  const zona = form.querySelector('[data-docs]');
  if (!zona) return { confirmar() {}, descartar() {} };
  const grid = zona.querySelector('[data-docs-grid]');
  const existentes = refId ? docsDe(tipo, refId) : [];
  const nuevos = [];
  const quitar = new Set();
  let confirmado = false;
  let procesando = 0;

  const pintar = () => {
    const lista = [...existentes.filter((d) => !quitar.has(d.id)), ...nuevos];
    grid.innerHTML = String(html`${lista.map((d) => html`
      <figure class="doc" data-id="${d.id}">
        <button type="button" class="doc-ver" data-doc-ver="${d.id}" aria-label="Ver ${d.nombre}">
          ${d.miniatura ? html`<img alt="" data-thumb="${d.id}">` : html`<span class="doc-pdf">${extension(d.mime, d.nombre).toUpperCase()}</span>`}
        </button>
        <figcaption><span>${d.nombre}</span><small>${tamano(d.size)}</small></figcaption>
        <button type="button" class="doc-x" data-doc-x="${d.id}" aria-label="Quitar ${d.nombre}">${raw(ICON.x)}</button>
      </figure>`)}${procesando ? html`<figure class="doc doc-cargando"><span class="spinner"></span><figcaption><span>Guardando…</span></figcaption></figure>` : ''}`);
    grid.querySelectorAll('[data-thumb]').forEach(async (img) => { img.src = (await urlDe(img.dataset.thumb, true)) || ''; });
    zona.classList.toggle('vacia', !lista.length && !procesando);
  };
  pintar();

  zona.addEventListener('change', async (e) => {
    const input = e.target.closest('[data-docs-in]');
    if (!input) return;
    const files = [...input.files];
    input.value = '';
    for (const file of files) {
      if (file.size > 40 * 1048576) { toast(`«${file.name}» es demasiado grande (máx. 40 MB).`, { tipo: 'error' }); continue; }
      procesando++;
      pintar();
      try {
        nuevos.push(await guardarArchivo(file, uid()));
      } catch (err) {
        console.error(err);
        toast('No se ha podido guardar el archivo en este dispositivo (¿sin espacio?).', { tipo: 'error', ms: 7000 });
      }
      procesando--;
      pintar();
    }
  });
  zona.addEventListener('click', (e) => {
    const ver = e.target.closest('[data-doc-ver]');
    if (ver) { e.preventDefault(); verDoc([...existentes, ...nuevos].find((d) => d.id === ver.dataset.docVer)); return; }
    const x = e.target.closest('[data-doc-x]');
    if (x) {
      e.preventDefault();
      const id = x.dataset.docX;
      const i = nuevos.findIndex((d) => d.id === id);
      if (i >= 0) { borrarDoc(id); nuevos.splice(i, 1); } else quitar.add(id);
      pintar();
    }
  });
  alCerrar(() => { if (!confirmado) for (const d of nuevos) borrarDoc(d.id); });

  return {
    /** Asocia los nuevos al registro y borra los quitados. Llamar desde el submit, antes de commit(). */
    confirmar(ref, pisoId) {
      confirmado = true;
      if (quitar.size) {
        app.s.docs = app.s.docs.filter((d) => !quitar.has(d.id));
        for (const id of quitar) borrarDoc(id);
      }
      for (const d of nuevos) app.s.docs.push({ ...d, tipo, refId: ref, pisoId });
      // Si cambió de piso, sus documentos también.
      for (const d of app.s.docs) if (d.tipo === tipo && d.refId === ref) d.pisoId = pisoId;
    },
  };
}

/** Quita los documentos de un registro borrado; devuelve una función para deshacerlo (8 s). */
export function apartarDocs(tipo, refId) {
  const quitados = docsDe(tipo, refId);
  if (!quitados.length) return () => {};
  app.s.docs = app.s.docs.filter((d) => !quitados.includes(d));
  const t = setTimeout(() => quitados.forEach((d) => borrarDoc(d.id)), 9000);
  return () => { clearTimeout(t); app.s.docs.push(...quitados); };
}

/* ───────────── Visor ───────────── */

export async function verDoc(d) {
  if (!d) return;
  const v = document.getElementById('visor');
  const url = await urlDe(d.id);
  if (!url) { toast('Este documento no está en este dispositivo. Restaura la copia con documentos.', { tipo: 'warn', ms: 6000 }); return; }
  const pdf = d.mime === 'application/pdf';
  v.innerHTML = String(html`
    <div class="visor-barra">
      <div class="visor-tit"><strong>${d.nombre}</strong><small>${tamano(d.size)} · ${fmtFecha(d.creado?.slice(0, 10))}</small></div>
      <button type="button" class="btn btn-sm" data-visor="compartir">Compartir</button>
      <a class="btn btn-sm" href="${url}" download="${d.nombre}">Descargar</a>
      <button type="button" class="icon-btn" data-visor="cerrar" aria-label="Cerrar">${raw(ICON.x)}</button>
    </div>
    <div class="visor-cuerpo">${pdf ? html`<iframe src="${url}" title="${d.nombre}"></iframe>` : html`<img src="${url}" alt="${d.nombre}">`}</div>`);
  v.onclick = async (e) => {
    const b = e.target.closest('[data-visor]');
    if (e.target === v || b?.dataset.visor === 'cerrar') v.close();
    if (b?.dataset.visor === 'compartir') {
      const blob = await obtenerBlob(d.id);
      const file = new File([blob], d.nombre, { type: d.mime });
      if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file], title: d.nombre }).catch(() => {});
      else toast('Este navegador no permite compartir archivos: usa «Descargar».', { tipo: 'warn' });
    }
  };
  v.showModal();
}

export { esc };
