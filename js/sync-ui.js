// Pantallas de la sincronización entre móviles (tarjeta de Ajustes y diálogos).
import { html, raw, ICON, toast, abrirDialogo, cerrarDialogo, confirmar } from './ui.js';
import { app, commit } from './state.js';
import { activo, hayServidor, estadoSync, crearCartera, unirse, salir, sincronizarAhora, fijarServidor, alCambiarEstado, normalizarCodigo, archivoParaOtroMovil, leerDeOtroMovil } from './sync.js';
import { descargar } from './ui.js';
import { today } from './state.js';

function haceCuanto(iso) {
  if (!iso) return 'nunca';
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}
export function textoEstado(e = estadoSync()) {
  if (e.fase === 'sincronizando') return 'Sincronizando…';
  if (e.fase === 'error') return `Error: ${e.mensaje}. Se reintentará solo.`;
  if (e.fase === 'sinConexion') return 'Sin conexión. Se sincronizará al volver la conexión.';
  return `Sincronizado ${haceCuanto(e.ultima)}`;
}
// La línea de estado de Ajustes se actualiza sola
alCambiarEstado(() => { const el = document.getElementById('sync-estado'); if (el) el.textContent = textoEstado(); });

const avanzado = (e) => html`
  <details class="sync-avanzado"><summary class="small muted">Avanzado: servidor de sincronización</summary>
    <form data-form="sync-servidor" class="sync-servidor">
      <input name="servidor" type="url" placeholder="https://alquileres-sync.tu-nombre.workers.dev" value="${e.servidor}" autocomplete="off">
      <button class="btn btn-sm" type="submit">Guardar</button>
    </form>
  </details>`;

const porArchivo = (titulo = true) => html`
  ${titulo ? html`<h3 class="sub-h">Pasar los datos con un archivo</h3>` : ''}
  <ol class="steps small">
    <li>En el móvil que tiene los datos nuevos pulsa <b>«Enviar mis datos al otro móvil»</b> y mándalo por WhatsApp.</li>
    <li>En el otro móvil abre la app y pulsa <b>«Recibir datos del otro móvil»</b> y elige ese archivo.</li>
  </ol>
  <p class="muted small">Los datos <b>se juntan</b>: no se pierde lo que ya tenga el otro móvil. Las fotos y documentos también pasan. Repetidlo cuando queráis poneros al día, en un sentido o en el otro.</p>
  <div class="btn-row">
    <button class="btn btn-primary" data-action="enviar-otro-movil">${raw(ICON.upload)}<span>Enviar mis datos al otro móvil</span></button>
    <label class="btn">${raw(ICON.download)}<span>Recibir datos del otro móvil</span><input type="file" accept=".zip,application/zip" data-import="otro-movil" hidden></label>
  </div>`;

/** Tarjeta de Ajustes. */
export function tarjetaSync() {
  const e = estadoSync();
  if (!hayServidor()) {
    return html`<section class="card" id="sync">
      <div class="card-head"><h2>Compartir entre móviles</h2></div>
      <p class="muted">¿Usáis la app en dos móviles? Pasad los datos de uno a otro con un archivo, sin cuentas ni configuración.</p>
      ${porArchivo(false)}
      ${avanzado(e)}
    </section>`;
  }
  if (!activo()) {
    return html`<section class="card" id="sync">
      <div class="card-head"><h2>Compartir entre móviles</h2></div>
      <p class="muted">Usad la misma cartera en varios móviles: lo que uno apunte le aparece al otro. Sin cuentas ni contraseñas: un móvil la activa y los demás se unen con su código. Los datos viajan cifrados; nadie más puede leerlos.</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="sync-crear">${raw(ICON.upload)}<span>Activar en este móvil</span></button>
        <button class="btn" data-action="sync-unirse">${raw(ICON.download)}<span>Unirme con un código</span></button>
      </div>
      ${porArchivo()}
      ${avanzado(e)}
    </section>`;
  }
  return html`<section class="card" id="sync">
    <div class="card-head"><h2>Compartir entre móviles</h2><span class="chip chip-ok">Activado</span></div>
    <p><b id="sync-estado">${textoEstado(e)}</b></p>
    <p class="muted small">Se sincroniza sola al abrir la app, al volver a ella y unos segundos después de cada cambio. Para añadir otro móvil, mándale el código y que en su app pulse «Unirme con un código».</p>
    <div class="btn-row">
      <button class="btn btn-primary" data-action="sync-ahora">Sincronizar ahora</button>
      <button class="btn" data-action="sync-codigo">Ver el código para otro móvil</button>
      <button class="btn btn-ghost" data-action="sync-salir">Dejar de sincronizar aquí</button>
    </div>
    ${avanzado(e)}
  </section>`;
}

const mensajeCodigo = (c) => `Código para compartir nuestra cartera de Alquileres:\n\n${c}\n\nEn la app: Ajustes → Compartir entre móviles → «Unirme con un código» (o «Unirme a una cartera» al abrirla por primera vez) y pega el código.`;

function dialogoCodigo(codigo, nuevo = false) {
  abrirDialogo({
    titulo: nuevo ? 'Sincronización activada' : 'Código de la cartera',
    cuerpo: html`
      ${nuevo ? html`<p>Este móvil ya guarda la cartera en el servidor, cifrada. Para usarla en otro móvil, mándale este código:</p>` : html`<p>Mándale este código al otro móvil:</p>`}
      <p class="sync-codigo" data-codigo>${codigo}</p>
      <div class="btn-row"><button type="button" class="btn btn-primary" data-sync-compartir>Enviar por WhatsApp…</button><button type="button" class="btn" data-sync-copiar>Copiar</button></div>
      <p class="small muted">En el otro móvil: abrir la app → Ajustes → Compartir entre móviles → «Unirme con un código» y pegarlo. Guarda el código: quien lo tenga puede ver y cambiar la cartera.</p>`,
  });
  const dlg = document.getElementById('dialogo');
  dlg.querySelector('[data-sync-copiar]').onclick = async () => { try { await navigator.clipboard.writeText(codigo); toast('Código copiado'); } catch { toast('Mantén pulsado el código para copiarlo', { tipo: 'warn' }); } };
  dlg.querySelector('[data-sync-compartir]').onclick = async () => {
    const texto = mensajeCodigo(codigo);
    if (navigator.share) { try { await navigator.share({ text: texto }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  };
}

export function dialogoUnirse() {
  const hayDatos = !!app.s && !app.s.ajustes?.demo && (app.s.gastos.length || app.s.cobros.length || app.s.contratos.length);
  const form = abrirDialogo({
    titulo: 'Unirme a una cartera compartida',
    textoOk: 'Unirme',
    cuerpo: html`
      <p class="muted">Pega el código que te han enviado desde el otro móvil.</p>
      <label class="field"><span class="field-label">Código</span><input name="codigo" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" class="sync-entrada"></label>
      ${hayDatos ? html`<fieldset class="sync-opciones"><legend class="field-label">Este móvil ya tiene datos</legend>
        <label class="check"><input type="radio" name="modo" value="juntar" checked><span>Juntarlos con los de la cartera compartida</span></label>
        <label class="check"><input type="radio" name="modo" value="descartar"><span>Usar solo los de la cartera compartida (se borran los de este móvil)</span></label></fieldset>` : ''}
      <p class="small import-err" data-sync-error hidden></p>`,
    submit: (d, f) => {
      const codigo = normalizarCodigo(d.codigo);
      const err = f.querySelector('[data-sync-error]');
      if (!codigo) { err.hidden = false; err.textContent = 'El código no es correcto: son 32 letras y números. Puedes pegarlo con o sin guiones.'; return false; }
      const boton = f.querySelector('button[type=submit]');
      boton.disabled = true; boton.textContent = 'Uniendo…'; err.hidden = true;
      unirse(codigo, { descartarLocal: d.modo === 'descartar' || !!app.s?.ajustes?.demo })
        .then(() => { cerrarDialogo(); commit('Listo: este móvil ya comparte la cartera'); if (!location.hash || location.hash === '#') location.hash = '#/'; })
        .catch((e) => { err.hidden = false; err.textContent = e.message; boton.disabled = false; boton.textContent = 'Unirme'; });
      return false;
    },
  });
  return form;
}

export const accionesSync = {
  'enviar-otro-movil': () => enviarAOtroMovil(),
  'sync-crear': async () => {
    if (!(await confirmar('Compartir entre móviles', 'Se guardará una copia cifrada de esta cartera en el servidor y te daré un código para unir otros móviles. ¿Activar?', { ok: 'Activar', peligro: false }))) return;
    try { const codigo = await crearCartera(); app.render(); dialogoCodigo(codigo, true); } catch (e) { toast(`No se ha podido activar: ${e.message}`, { tipo: 'error', ms: 7000 }); }
  },
  'sync-unirse': () => dialogoUnirse(),
  'sync-codigo': () => dialogoCodigo(estadoSync().codigo),
  'sync-ahora': async () => { const ok = await sincronizarAhora({ silencioso: false }); if (ok) toast('Sincronizado'); app.render(); },
  'sync-salir': async () => {
    if (!(await confirmar('Dejar de sincronizar', 'Este móvil dejará de recibir y enviar cambios. Los datos se quedan aquí y en los demás móviles. Para volver, únete otra vez con el código.', { ok: 'Dejar de sincronizar' }))) return;
    salir(); app.render(); toast('Sincronización desactivada en este móvil');
  },
};

export function guardarServidor(form) {
  try { fijarServidor(form.elements.servidor.value); toast('Servidor guardado'); app.render(); } catch (e) { toast(e.message, { tipo: 'error' }); }
}

/** Comparte (o descarga) el archivo para el otro móvil. */
export async function enviarAOtroMovil() {
  try {
    const blob = await archivoParaOtroMovil();
    const nombre = `alquileres-para-otro-movil-${today()}.zip`;
    const file = new File([blob], nombre, { type: 'application/zip' });
    if (navigator.canShare?.({ files: [file] })) {
      // Solo el archivo: si se añade texto, WhatsApp en iPhone a veces envía el texto y no el archivo
      try { await navigator.share({ files: [file] }); toast('Enviado. En el otro móvil: «Recibir datos del otro móvil».'); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    descargar(nombre, blob);
    toast('Archivo descargado. Mándalo al otro móvil y ábrelo con «Recibir datos del otro móvil».', { ms: 7000 });
  } catch (e) {
    console.error(e);
    toast(`No se ha podido preparar el archivo: ${e.message}`, { tipo: 'error', ms: 7000 });
  }
}

/** Junta en este móvil los datos de un archivo de otro móvil (tras confirmar). */
export async function recibirDeOtroMovil(file) {
  let r;
  try { r = await leerDeOtroMovil(file); } catch (e) { toast(`No se ha podido leer el archivo: ${e.message}`, { tipo: 'error', ms: 7000 }); return true; }
  if (!r) return false; // no es de este tipo: que lo trate la restauración de copias
  if (!r.cambios) { toast('Este móvil ya tenía todo lo de ese archivo.'); return true; }
  const n = r.nuevos;
  const pl = (k, uno, varios) => (k === 1 ? `1 ${uno}` : `${k} ${varios}`);
  const partes = [n.pisos && pl(n.pisos, 'piso', 'pisos'), n.contratos && pl(n.contratos, 'contrato', 'contratos'), n.gastos && pl(n.gastos, 'gasto', 'gastos'), n.cobros && pl(n.cobros, 'cobro', 'cobros'), n.reservas && pl(n.reservas, 'reserva', 'reservas'), n.docs && pl(n.docs, 'documento', 'documentos')].filter(Boolean);
  const cuando = r.remotoCreado ? new Date(r.remotoCreado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const ok = await confirmar('Recibir datos del otro móvil', `Se juntarán con los de este móvil los datos del archivo${cuando ? ` (enviado el ${cuando})` : ''}: ${pl(r.cambios, 'cambio', 'cambios')}${partes.length ? `, entre ellos nuevos: ${partes.join(', ')}` : ''}${r.borrados ? `. ${r.borrados === 1 ? 'Se quitará 1 cosa que se borró' : `Se quitarán ${r.borrados} cosas que se borraron`} en el otro móvil` : ''}. No se pierde lo que solo esté en este móvil.`, { ok: 'Juntar datos', peligro: false });
  if (!ok) return true;
  try { await r.aplicar(); commit(`Datos recibidos: ${r.cambios} cambios`); if (!location.hash || location.hash === '#') location.hash = '#/'; } catch (e) { console.error(e); toast(`No se ha podido aplicar: ${e.message}`, { tipo: 'error', ms: 7000 }); }
  return true;
}
