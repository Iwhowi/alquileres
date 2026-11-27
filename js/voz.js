// Hablar con la app: el móvil pasa la voz a texto (reconocimiento de voz del navegador) y la app
// interpreta la frase con sus propias reglas (voz-interpretar.js y voz-ordenes.js). Nunca guarda nada
// sin enseñarlo: abre el formulario de siempre con lo dicho ya relleno para revisarlo.
import { html, raw, abrirDialogo, cerrarDialogo, alCerrar, toast, fmtEUR, fmtMes, rellenar, ICON } from './ui.js';
import { app, piso } from './state.js';
import { todayISO } from './calc.js';
import { interpretar } from './voz-interpretar.js';
import { ordenar } from './voz-ordenes.js';
import * as F from './forms.js';
import { abrirReparto } from './reparto.js';

const Reconocimiento = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

const ERRORES_MICRO = {
  'not-allowed': 'No hay permiso para el micrófono. Actívalo en los ajustes del navegador para esta web.',
  'service-not-allowed': 'Este navegador no deja usar el reconocimiento de voz aquí. Usa el micrófono del teclado.',
  'no-speech': 'No te he oído. Toca el micro y vuelve a intentarlo.',
  network: 'El reconocimiento de voz necesita conexión a internet.',
  'audio-capture': 'No se encuentra el micrófono.',
};

/**
 * Escucha una frase. `alTexto(texto)` recibe lo oído mientras se habla (si `parcial`), `alFin(texto)`
 * lo definitivo al callarse. Devuelve una función para parar, o null si no se pudo empezar.
 */
function escuchar({ parcial = false, previo = '', alTexto, alFin, alAviso }) {
  const rec = new Reconocimiento();
  rec.lang = 'es-ES';
  rec.interimResults = parcial;
  let final = previo ? `${previo} ` : '';
  rec.onresult = (e) => {
    let provisional = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += `${e.results[i][0].transcript} `;
      else provisional += e.results[i][0].transcript;
    }
    alTexto?.((final + provisional).trim());
  };
  rec.onerror = (e) => { if (ERRORES_MICRO[e.error]) alAviso(ERRORES_MICRO[e.error]); };
  rec.onend = () => alFin(final.trim());
  try { rec.start(); } catch { alAviso('No se ha podido usar el micrófono.'); return null; }
  return () => { try { rec.stop(); } catch { /* ya parado */ } };
}

const EJEMPLOS = [
  ['Gastos', ['Gasto de luz de noviembre en Ramón y Cajal de 120 euros', 'Comunidad de Sigüenza 60 euros todos los meses']],
  ['Cobros', ['Miguel ha pagado el alquiler de noviembre', 'Reparte la luz de Juan de Ledesma, 120 euros, de octubre']],
  ['Inquilinos y contratos', ['Nuevo inquilino Pedro García en la habitación 2 de Juan de Ledesma desde el 1 de diciembre, 400 euros', 'Miguel se va el 30 de junio', 'Cambia el teléfono de Claudia a 654 321 987']],
  ['Pisos y reservas', ['Reserva en Marqués de Pickman de Juan Pérez del 5 al 8 de diciembre por 300 euros', 'Abre Juan de Ledesma']],
];

export function abrirVoz() {
  if (!app.s?.pisos?.length) { toast('Primero añade tus pisos.', { tipo: 'warn' }); return; }
  let parar = null;
  const form = abrirDialogo({
    titulo: 'Hablar con la app',
    textoOk: 'Continuar',
    cuerpo: html`
      <div class="voz">
        ${Reconocimiento
          ? html`<button type="button" class="voz-micro" data-voz-micro aria-label="Hablar">${raw(ICON.micro)}</button>
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
      parar?.();
      const frase = (d.frase || '').trim();
      if (!frase) aviso('Di o escribe qué quieres apuntar.');
      else actuar(frase, aviso);
      return false;
    },
  });
  const caja = form.querySelector('textarea');
  const estado = form.querySelector('[data-voz-estado]');
  const boton = form.querySelector('[data-voz-micro]');
  const avisoEl = form.querySelector('[data-voz-aviso]');
  function aviso(t) { avisoEl.hidden = !t; avisoEl.textContent = t || ''; }
  alCerrar(() => parar?.());

  function empezar() {
    if (parar) { parar(); return; }
    aviso('');
    parar = escuchar({
      parcial: true,
      previo: caja.value.trim(),
      alTexto: (t) => { caja.value = t; },
      alAviso: aviso,
      alFin: (frase) => {
        parar = null;
        boton.classList.remove('on');
        estado.textContent = frase ? 'Revisa el texto y pulsa «Continuar»' : 'Toca el micro y habla';
        // Al callarse se hace solo, si lo entendido está completo
        if (frase && document.getElementById('dialogo').open && form.isConnected) actuar(frase, aviso, { soloSiCompleto: true });
      },
    });
    if (parar) { boton.classList.add('on'); estado.textContent = 'Te escucho… (toca el micro para parar)'; }
  }
  boton?.addEventListener('click', empezar);
  if (Reconocimiento) empezar(); // empieza a escuchar nada más abrir
}

/** Hace lo que pide la frase. Con `soloSiCompleto`, no hace nada si falta algo (se espera a «Continuar»). */
function actuar(frase, aviso, { soloSiCompleto = false } = {}) {
  const hoy = todayISO();
  const o = ordenar(frase, app.s, hoy);
  if (o) { if (!(soloSiCompleto && o.tipo === 'nada')) ejecutar(o, frase, aviso); return; }
  const r = interpretar(frase, app.s, hoy);
  if (r.tipo === 'gasto') {
    if (soloSiCompleto && r.faltan.length) return;
    const campos = { fecha: r.fecha, importe: r.importe, pisoId: r.pisoId, categoria: r.categoria, concepto: r.concepto, proveedor: r.proveedor, extraordinario: r.extraordinario || null };
    ejecutar({ tipo: 'form', form: 'gasto', id: null, pisoId: r.pisoId, campos, faltan: r.faltan }, frase, aviso);
    return;
  }
  if (r.tipo === 'cobro') {
    const cands = r.candidatos;
    if (soloSiCompleto && cands.length !== 1) return;
    const quien = r.inquilino || piso(r.pisoId)?.nombre;
    if (!quien) aviso('No sé de qué piso o inquilino es el cobro. Di su nombre o el piso.');
    else if (cands.length === 1) abrirCobro(cands[0].id, r);
    else if (!cands.length) aviso(`No encuentro nada pendiente de cobrar de ${quien} en ${fmtMes(r.periodo)}. Puede que ya esté cobrado: míralo en Cobros.`);
    else elegirCobro(cands, frase, r);
    return;
  }
  if (!soloSiCompleto) aviso('No lo he entendido. Di, por ejemplo: «gasto de luz de noviembre en Ramón y Cajal de 120 euros».');
}

/* ───────────── Órdenes: abren el formulario de siempre con los campos dichos ya rellenos ───────────── */

const ABRIR = {
  contrato: (o) => (o.id ? F.formContrato(o.id) : F.formContrato(null, { pisoId: o.pisoId, unidadId: o.unidadId })),
  finalizar: (o) => F.finalizarContrato(o.id),
  renovar: (o) => F.renovar(o.id),
  renta: (o) => F.actualizarRenta(o.id),
  reserva: (o) => F.formReserva(null, { pisoId: o.pisoId || undefined, fecha: o.campos.entrada }),
  recurrente: (o) => F.formRecurrente(null, o.pisoId || app.s.pisos[0]?.id),
  hipoteca: (o) => F.formHipoteca(o.id, o.pisoId),
  gasto: (o) => F.formGasto(o.id, o.pisoId),
  unidad: (o) => F.formUnidad(null, o.pisoId),
  piso: (o) => F.formPiso(o.id),
  titular: (o) => F.formTitular(o.id),
  reparto: (o) => abrirReparto(o.pisoId),
};

function ejecutar(o, frase, aviso) {
  if (o.tipo === 'nada') { aviso(o.resumen); return; }
  if (o.tipo === 'ir') { cerrarDialogo(); location.hash = o.ruta; toast(o.resumen); return; }
  ABRIR[o.form](o);
  const form = document.querySelector('#dialogo form');
  if (!form) return;
  const marcados = rellenar(form, { ...(o.unidadId && !o.id ? { unidadId: o.unidadId } : {}), ...(o.campos || {}) });
  const boton = form.querySelector('[type=submit]')?.textContent.trim();
  const partes = [];
  if (marcados) partes.push('He rellenado lo marcado en color.');
  if (o.faltan?.length) partes.push(`Falta ${o.faltan.join(', ')}: complétalo aquí.`);
  if (o.otros) partes.push(`Hay ${o.otros} gasto${o.otros > 1 ? 's' : ''} más que encajan: si no es este, búscalo en Gastos.`);
  partes.push(o.borrar ? 'Para borrarlo, pulsa «Eliminar».' : boton ? `Revisa y pulsa «${boton}».` : 'Revisa los datos.');
  const nota = document.createElement('div');
  nota.className = 'voz-nota';
  nota.innerHTML = String(html`${partes.join(' ')}<small>Has dicho: «${frase}»</small>`);
  form.querySelector('.dlg-body')?.prepend(nota);
  if (o.aviso) { const a = document.createElement('p'); a.className = 'form-error'; a.textContent = o.aviso; nota.after(a); }
}

/** Pantalla de «Marcar cobrado» con la cantidad y la fecha dichas, si se dijeron. */
function abrirCobro(id, r) {
  F.cobrar('cobro', id);
  const form = document.querySelector('#dialogo form');
  if (form) rellenar(form, { cantidad: r.importe, fecha: r.fechaCobro !== todayISO() ? r.fechaCobro : null });
}

function elegirCobro(cands, frase, r) {
  const nombre = (c) => app.s.contratos.find((k) => k.id === c.contratoId)?.inquilino || c.pagador || '';
  abrirDialogo({
    titulo: '¿Qué cobro es?',
    cuerpo: html`
      <p class="muted">Has dicho: «${frase}». Hay varios pendientes:</p>
      <div class="voz-lista">${cands.map((c) => html`<button type="button" class="btn voz-opcion" data-voz-cobro="${c.id}"><span><strong>${nombre(c)}</strong> · ${c.concepto}</span><b>${fmtEUR(c.importe - (Number(c.cobrado) || 0))}</b></button>`)}</div>`,
  });
  document.querySelectorAll('[data-voz-cobro]').forEach((b) => b.addEventListener('click', () => abrirCobro(b.dataset.vozCobro, r)));
}

/**
 * Micro dentro de un formulario: escucha una frase y llama a `alFinal(texto)`. Si el navegador no
 * tiene reconocimiento de voz, pide el texto (se puede dictar con el micro del teclado).
 */
const escuchandoEn = new WeakMap();
export function dictarEn(boton, alFinal, alAviso = (t) => toast(t, { tipo: 'warn', ms: 6000 })) {
  if (!Reconocimiento) {
    const t = prompt('Dicta o escribe los datos (puedes usar el micrófono del teclado):');
    if (t?.trim()) alFinal(t.trim());
    return;
  }
  if (escuchandoEn.has(boton)) { escuchandoEn.get(boton)(); return; }
  const parar = escuchar({
    alAviso,
    alFin: (texto) => { escuchandoEn.delete(boton); boton.classList.remove('on'); if (texto) alFinal(texto); },
  });
  if (parar) { escuchandoEn.set(boton, parar); boton.classList.add('on'); }
}
