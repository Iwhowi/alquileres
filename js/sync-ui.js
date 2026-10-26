// Pantallas de la sincronización entre móviles (tarjeta de Ajustes y diálogos).
import { html, raw, ICON, toast, abrirDialogo, cerrarDialogo, confirmar } from './ui.js';
import { app, commit } from './state.js';
import { activo, hayServidor, estadoSync, crearCartera, unirse, salir, sincronizarAhora, fijarServidor, alCambiarEstado, normalizarCodigo } from './sync.js';

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

/** Tarjeta de Ajustes. */
export function tarjetaSync() {
  const e = estadoSync();
  if (!hayServidor()) {
    return html`<section class="card" id="sync">
      <div class="card-head"><h2>Compartir entre móviles</h2></div>
      <p class="muted">Para que dos o más móviles compartan los mismos datos hace falta conectar el servidor de sincronización (se configura una sola vez).</p>
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
