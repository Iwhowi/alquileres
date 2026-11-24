// Dictar a la app: el móvil pasa la voz a texto (reconocimiento de voz del navegador) y la app
// interpreta la frase con sus propias reglas (voz-interpretar.js). Nunca guarda nada sin enseñarlo:
// abre el formulario ya relleno para revisarlo y pulsar «Guardar».
import { html, raw, abrirDialogo, cerrarDialogo, alCerrar, toast, fmtEUR, fmtMes, esc } from './ui.js';
import { app } from './state.js';
import { interpretar } from './voz-interpretar.js';
import * as F from './forms.js';

const Reconocimiento = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
export const MICRO = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';

const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const nombrePiso = (id) => app.s.pisos.find((p) => p.id === id)?.nombre || '';

const EJEMPLOS = [
  'Gasto de luz de noviembre en Ramón y Cajal de 120 euros',
  'He pagado 80 euros al fontanero en Juan de Ledesma',
  'Comunidad de Sigüenza 65 euros',
  'Miguel ha pagado el alquiler de noviembre',
];

export function abrirVoz() {
  if (!app.s?.pisos?.length) { toast('Primero añade tus pisos.', { tipo: 'warn' }); return; }
  let rec = null;
  let escuchando = false;
  let finalTxt = '';
  const form = abrirDialogo({
    titulo: 'Dictar a la app',
    textoOk: 'Continuar',
    cuerpo: html`
      <div class="voz">
        ${Reconocimiento
          ? html`<button type="button" class="voz-micro" data-voz-micro aria-label="Hablar">${raw(MICRO)}</button>
                 <p class="voz-estado" data-voz-estado aria-live="polite">Toca el micro y habla</p>`
          : html`<p class="voz-estado">Este navegador no deja usar el micro dentro de la app. Toca el cuadro de abajo y usa el <b>micrófono del teclado</b> para dictar, o escríbelo.</p>`}
        <textarea name="frase" rows="3" class="voz-texto" placeholder="Lo que digas aparecerá aquí. También puedes escribirlo o corregirlo."></textarea>
        <p class="voz-aviso form-error" data-voz-aviso hidden></p>
        <details class="voz-ejemplos"><summary>Ejemplos de lo que puedes decir</summary>
          <ul>${EJEMPLOS.map((e) => html`<li>«${e}»</li>`)}</ul>
          <p class="muted small">Di el piso, qué es, el mes y el importe. Antes de guardar verás el formulario relleno para revisarlo.</p>
        </details>
      </div>`,
    submit: (d) => {
      parar();
      const frase = (d.frase || '').trim();
      if (!frase) { aviso('Di o escribe qué quieres apuntar.'); return false; }
      return actuar(frase, aviso);
    },
  });
  const caja = form.querySelector('textarea');
  const estado = form.querySelector('[data-voz-estado]');
  const boton = form.querySelector('[data-voz-micro]');
  const avisoEl = form.querySelector('[data-voz-aviso]');
  function aviso(t) { avisoEl.hidden = !t; avisoEl.textContent = t || ''; }
  function parar() { escuchando = false; boton?.classList.remove('on'); try { rec?.stop(); } catch {} }
  alCerrar(parar);

  function escuchar() {
    if (escuchando) { parar(); return; }
    aviso('');
    rec = new Reconocimiento();
    rec.lang = 'es-ES';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    finalTxt = caja.value.trim() ? `${caja.value.trim()} ` : '';
    rec.onresult = (e) => {
      let provisional = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTxt += `${e.results[i][0].transcript} `;
        else provisional += e.results[i][0].transcript;
      }
      caja.value = (finalTxt + provisional).trim();
    };
    rec.onerror = (e) => {
      const m = { 'not-allowed': 'No hay permiso para el micrófono. Actívalo en los ajustes del navegador para esta web.', 'service-not-allowed': 'Este navegador no deja usar el reconocimiento de voz aquí. Usa el micrófono del teclado.', 'no-speech': 'No te he oído. Toca el micro y vuelve a intentarlo.', network: 'El reconocimiento de voz necesita conexión a internet.', 'audio-capture': 'No se encuentra el micrófono.' }[e.error];
      if (m) aviso(m);
    };
    rec.onend = () => {
      escuchando = false;
      boton?.classList.remove('on');
      if (estado) estado.textContent = caja.value.trim() ? 'Revisa el texto y pulsa «Continuar»' : 'Toca el micro y habla';
      // Al terminar de hablar se interpreta solo, si lo entendido es completo
      const frase = caja.value.trim();
      if (frase && form.isConnected && document.getElementById('dialogo').open) {
        const r = interpretar(frase, app.s, hoy());
        if ((r.tipo === 'gasto' && !r.faltan.length) || (r.tipo === 'cobro' && r.candidatos.length === 1)) actuar(frase, aviso);
      }
    };
    try {
      rec.start();
      escuchando = true;
      boton?.classList.add('on');
      if (estado) estado.textContent = 'Te escucho…';
    } catch { aviso('No se ha podido usar el micrófono.'); }
  }
  boton?.addEventListener('click', escuchar);
  if (Reconocimiento) escuchar(); // empieza a escuchar nada más abrir
}

/** Hace lo que pide la frase. Devuelve false si el diálogo de voz debe quedarse abierto. */
function actuar(frase, aviso) {
  const r = interpretar(frase, app.s, hoy());
  if (r.tipo === 'gasto') {
    const partes = [r.importe != null ? fmtEUR(r.importe) : null, r.concepto || null, r.pisoId ? nombrePiso(r.pisoId) : null].filter(Boolean);
    const falta = r.faltan.length ? ` Falta ${r.faltan.join(' y ')}: complétalo abajo.` : '';
    F.formGasto(null, r.pisoId, {
      nota: `Has dicho: «${frase}». ${partes.length ? `He entendido: ${partes.join(' · ')}.` : ''}${falta} Revisa y pulsa «Guardar».`,
      fecha: r.fecha, importe: r.importe ?? 0, pisoId: r.pisoId, categoria: r.categoria, concepto: r.concepto, proveedor: r.proveedor, extraordinario: r.extraordinario,
    });
    return false;
  }
  if (r.tipo === 'cobro') {
    const quien = r.inquilino || (r.pisoId ? nombrePiso(r.pisoId) : '');
    if (!quien) { aviso('No sé de qué piso o inquilino es el cobro. Di su nombre o el piso.'); return false; }
    const cands = r.candidatos;
    if (cands.length === 1) { F.cobrar('cobro', cands[0].id); return false; }
    if (!cands.length) {
      aviso(`No encuentro nada pendiente de cobrar de ${quien} en ${fmtMes(r.periodo)}. Puede que ya esté cobrado: míralo en Cobros.`);
      return false;
    }
    elegirCobro(cands, frase);
    return false;
  }
  aviso('No lo he entendido. Di, por ejemplo: «gasto de luz de noviembre en Ramón y Cajal de 120 euros».');
  return false;
}

function elegirCobro(cands, frase) {
  const nombre = (c) => app.s.contratos.find((k) => k.id === c.contratoId)?.inquilino || c.pagador || '';
  abrirDialogo({
    titulo: '¿Qué cobro es?',
    cuerpo: html`
      <p class="muted">Has dicho: «${frase}». Hay varios pendientes:</p>
      <div class="voz-lista">${cands.map((c) => html`<button type="button" class="btn voz-opcion" data-voz-cobro="${c.id}"><span><strong>${nombre(c)}</strong> · ${c.concepto}</span><b>${fmtEUR(c.importe - (Number(c.cobrado) || 0))}</b></button>`)}</div>`,
  });
  document.querySelectorAll('[data-voz-cobro]').forEach((b) => b.addEventListener('click', () => F.cobrar('cobro', b.dataset.vozCobro)));
}
