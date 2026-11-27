// Dictar a la app: el móvil pasa la voz a texto (reconocimiento de voz del navegador) y la app
// interpreta la frase con sus propias reglas (voz-interpretar.js). Nunca guarda nada sin enseñarlo:
// abre el formulario ya relleno para revisarlo y pulsar «Guardar».
import { html, raw, abrirDialogo, cerrarDialogo, alCerrar, toast, fmtEUR, fmtMes, esc } from './ui.js';
import { app } from './state.js';
import { interpretar } from './voz-interpretar.js';
import { ordenar } from './voz-ordenes.js';
import * as F from './forms.js';
import { abrirReparto } from './reparto.js';

const Reconocimiento = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
export const MICRO = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';

const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const nombrePiso = (id) => app.s.pisos.find((p) => p.id === id)?.nombre || '';

const EJEMPLOS = [
  ['Gastos', ['Gasto de luz de noviembre en Ramón y Cajal de 120 euros', 'He pagado 80 euros al fontanero en Juan de Ledesma', 'Comunidad de Sigüenza 60 euros todos los meses', 'Corrige el gasto de luz de noviembre de Sigüenza, son 125 euros']],
  ['Cobros', ['Miguel ha pagado el alquiler de noviembre', 'Marca cobrado noviembre de Sigüenza']],
  ['Inquilinos y contratos', ['Nuevo inquilino Pedro García en la habitación 2 de Juan de Ledesma desde el 1 de diciembre, 400 euros, fianza 400, por un año', 'Miguel se va el 30 de junio', 'Renueva el contrato de Claudia con un 3 %', 'Sube la renta de Claudia a 420 desde enero', 'Cambia el teléfono de Claudia a 654 321 987', 'Ponle a Miguel una nota que diga paga por Bizum', 'Reparte la luz de Juan de Ledesma, 120 euros, del 31 de octubre al 29 de noviembre']],
  ['Pisos, reservas e hipotecas', ['Reserva en Hornos de Juan Pérez del 5 al 8 de diciembre por 300 euros por Airbnb', 'El valor de mercado de Ramón y Cajal es 210.000 euros', 'La cuota de la hipoteca de Sigüenza es de 650 euros', 'Abre Juan de Ledesma', 'Llévame a cobros']],
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
          ${EJEMPLOS.map(([g, xs]) => html`<p class="voz-grupo">${g}</p><ul>${xs.map((e) => html`<li>«${e}»</li>`)}</ul>`)}
          <p class="muted small">Puedes cambiar por voz cualquier dato que se cambia a mano. Antes de guardar verás el formulario relleno, con lo que has dicho marcado en color.</p>
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
        const o = ordenar(frase, app.s, hoy());
        if (o) { if (o.tipo !== 'nada') actuar(frase, aviso); return; }
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
  const o = ordenar(frase, app.s, hoy());
  if (o) return ejecutar(o, frase, aviso);
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

/* ───────────── Órdenes: abren el formulario de siempre con los campos dichos ya rellenos ───────────── */

const ABRIR = {
  contrato: (o) => (o.id ? F.formContrato(o.id) : o.pisoId ? F.formContrato(null, { pisoId: o.pisoId, unidadId: o.unidadId }) : null),
  finalizar: (o) => o.id && F.finalizarContrato(o.id),
  renovar: (o) => o.id && F.renovar(o.id),
  renta: (o) => o.id && F.actualizarRenta(o.id),
  reserva: (o) => F.formReserva(null, { pisoId: o.pisoId || undefined, fecha: o.campos.entrada }),
  recurrente: (o) => F.formRecurrente(null, o.pisoId || app.s.pisos[0]?.id),
  hipoteca: (o) => F.formHipoteca(o.id, o.pisoId),
  gasto: (o) => F.formGasto(o.id),
  unidad: (o) => F.formUnidad(null, o.pisoId),
  piso: (o) => F.formPiso(o.id),
  titular: (o) => F.formTitular(o.id),
  reparto: (o) => abrirReparto(o.pisoId),
};

function ejecutar(o, frase, aviso) {
  if (o.tipo === 'nada') { aviso(o.resumen); return false; }
  if (o.tipo === 'ir') { cerrarDialogo(); location.hash = o.ruta; toast(o.resumen); return false; }
  if (o.form === 'contrato' && !o.id && !o.pisoId) { aviso('¿En qué piso? Di el piso (y la habitación, si se alquila por habitaciones).'); return false; }
  if (['finalizar', 'renovar', 'renta'].includes(o.form) && !o.id) { aviso('¿De quién es el contrato? Di el nombre del inquilino, o el piso y la habitación.'); return false; }
  if (o.form === 'reserva' && o.pisoId && app.s.pisos.find((p) => p.id === o.pisoId)?.modalidad !== 'turistico') { aviso('Ese piso no es turístico: las reservas son para pisos de alquiler turístico.'); return false; }
  ABRIR[o.form](o);
  const form = document.querySelector('#dialogo form');
  if (!form) return false;
  const marcados = rellenar(form, { ...(o.unidadId && !o.id ? { unidadId: o.unidadId } : {}), ...(o.campos || {}) });
  const partes = [`Has dicho: «${frase}».`];
  if (marcados) partes.push(`He rellenado ${marcados === 1 ? 'lo marcado' : 'los campos marcados'} en color.`);
  if (o.faltan?.length) partes.push(`Falta ${o.faltan.join(', ')}: complétalo aquí.`);
  if (o.borrar) partes.push('Para borrarlo, pulsa «Eliminar» abajo.');
  if (o.otros) partes.push(`Hay ${o.otros} gasto${o.otros > 1 ? 's' : ''} más que encajan: si no es este, búscalo en Gastos.`);
  partes.push(o.borrar ? '' : 'Revisa y pulsa el botón para guardar.');
  const p = document.createElement('p');
  p.className = 'voz-nota';
  p.textContent = partes.filter(Boolean).join(' ');
  form.querySelector('.dlg-body')?.prepend(p);
  if (o.aviso) { const a = document.createElement('p'); a.className = 'form-error'; a.textContent = o.aviso; p.after(a); }
  return false;
}

/** Pone los valores en los campos del formulario abierto y los marca. Devuelve cuántos ha puesto. */
export function rellenar(form, campos) {
  let n = 0;
  const avisar = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.closest('.field, .check')?.classList.add('voz-marcado'); n++; };
  for (const [k, v] of Object.entries(campos)) {
    if (v == null || v === '') continue;
    const m = form.elements[`${k}__m`];
    if (m) {
      const [yy, mm] = String(v).split('-');
      const y = form.elements[`${k}__y`];
      if (![...y.options].some((x) => x.value === yy)) y.add(new Option(yy, yy));
      m.value = mm; y.value = yy;
      avisar(m);
      continue;
    }
    const el = form.elements[k];
    if (!el || el.readOnly) continue;
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.tagName === 'SELECT') { if (![...el.options].some((x) => x.value === String(v))) continue; el.value = String(v); }
    else if (typeof v === 'number' && el.type !== 'number') el.value = Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
    else el.value = String(v);
    avisar(el);
  }
  return n;
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

/**
 * Micro dentro de un formulario: escucha una frase y llama a `alFinal(texto)`. Si el navegador no
 * tiene reconocimiento de voz, pide el texto (se puede dictar con el micro del teclado).
 */
export function dictarEn(boton, alFinal, alAviso = (t) => toast(t, { tipo: 'warn', ms: 6000 })) {
  if (!Reconocimiento) {
    const t = prompt('Dicta o escribe los datos (puedes usar el micrófono del teclado):');
    if (t?.trim()) alFinal(t.trim());
    return;
  }
  if (boton.classList.contains('on')) { boton._rec?.stop(); return; }
  const rec = new Reconocimiento();
  rec.lang = 'es-ES'; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 1;
  let texto = '';
  rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) texto += `${e.results[i][0].transcript} `; };
  rec.onerror = (e) => {
    const m = { 'not-allowed': 'No hay permiso para el micrófono. Actívalo en los ajustes del navegador para esta web.', 'no-speech': 'No te he oído. Toca el micro y vuelve a intentarlo.', network: 'El reconocimiento de voz necesita conexión a internet.' }[e.error];
    if (m) alAviso(m);
  };
  rec.onend = () => { boton.classList.remove('on'); boton._rec = null; if (texto.trim()) alFinal(texto.trim()); };
  try { rec.start(); boton._rec = rec; boton.classList.add('on'); } catch { alAviso('No se ha podido usar el micrófono.'); }
}
