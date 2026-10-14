import { num, r2 } from './calc.js';
// Utilidades de interfaz: plantillas seguras, formato, diálogos y avisos.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s ?? ''));

function val(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
}

/** Plantilla que escapa todo lo interpolado salvo lo marcado con raw() o devuelto por otro html``. */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += val(vals[i]) + strings[i + 1];
  return new Raw(out);
}

/* ───────────── Formato ───────────── */

// useGrouping 'always': separador de miles también en cifras de 4 dígitos (1.234 €), para alinear columnas.
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const eur0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
const pct = new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

export const fmtEUR = (x) => eur.format(Math.abs(x) < 0.005 ? 0 : x);
export const fmtEUR0 = (x) => eur0.format(Math.abs(x) < 0.5 ? 0 : x);
export const fmtPct = (x) => (x == null || !Number.isFinite(x) ? '—' : pct.format(x));
export const fmtN = (x) => n0.format(x);

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
export const DIAS_C = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function fmtFecha(s, { corto = false, anio = true } = {}) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  if (corto) return `${d} ${MESES_C[m - 1]}${anio ? ` ${String(y).slice(2)}` : ''}`;
  return `${d} de ${MESES[m - 1]}${anio ? ` de ${y}` : ''}`;
}
export const fmtFechaNum = (s) => (s ? s.split('-').reverse().join('/') : '');

export function fmtMes(ym, { corto = false } = {}) {
  const [y, m] = ym.split('-').map(Number);
  return corto ? `${MESES_C[m - 1]} ${String(y).slice(2)}` : `${MESES[m - 1].replace(/^./, (c) => c.toUpperCase())} ${y}`;
}
export const mesNombre = (m) => MESES[m - 1];

export function plural(n, uno, varios) {
  return `${fmtN(n)} ${n === 1 ? uno : varios}`;
}

export function diasTexto(dias) {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}

/* ───────────── Avisos y diálogos ───────────── */

export function toast(msg, { tipo = 'ok', accion, ms = 3800 } = {}) {
  const zona = document.getElementById('toasts');
  // Uno cada vez: el nuevo sustituye al anterior para no tapar la pantalla.
  zona.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (accion) {
    const b = document.createElement('button');
    b.className = 'toast-btn';
    b.textContent = accion.texto;
    b.onclick = () => { accion.fn(); el.remove(); };
    el.appendChild(b);
  }
  zona.appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

let dlg;
let onSubmit = null;
let onClose = null;

/**
 * Abre un diálogo con un formulario. `submit(datos, form)` devuelve false para mantenerlo abierto.
 * Los campos con name="x" se recogen en `datos.x` (checkbox → booleano).
 */
export function abrirDialogo({ titulo, cuerpo, submit, textoOk = 'Guardar', peligro, extra = '', ancho = '', alCerrar }) {
  if (!dlg) {
    dlg = document.getElementById('dialogo');
    // Esc o cierre del sistema: ejecuta igualmente el callback de cierre.
    dlg.addEventListener('close', () => { const cb = onClose; onClose = null; cb?.(); });
  }
  dlg.className = ancho ? `dlg-${ancho}` : '';
  dlg.innerHTML = String(html`
    <form method="dialog" class="dlg-form" novalidate>
      <header class="dlg-head">
        <h2>${titulo}</h2>
        <button type="button" class="icon-btn" data-dlg-close aria-label="Cerrar">${raw(ICON.x)}</button>
      </header>
      <div class="dlg-body">${cuerpo}</div>
      <footer class="dlg-foot">
        ${extra}
        <span class="grow"></span>
        <button type="button" class="btn btn-ghost" data-dlg-close>${submit ? 'Cancelar' : 'Cerrar'}</button>
        ${submit ? html`<button type="submit" class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" value="ok">${textoOk}</button>` : ''}
      </footer>
    </form>`);
  onSubmit = submit;
  onClose = alCerrar;
  const form = dlg.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add('validado');
      form.querySelector(':invalid')?.focus();
      return;
    }
    const datos = leerForm(form);
    if (datos._incompletos) {
      let el = form.querySelector('.form-error');
      if (!el) { el = document.createElement('p'); el.className = 'form-error'; el.setAttribute('role', 'alert'); form.querySelector('.dlg-body').prepend(el); }
      el.textContent = 'Completa el mes y el año (o deja ambos vacíos).';
      return;
    }
    const r = onSubmit ? onSubmit(datos, form) : true;
    if (r !== false) cerrarDialogo();
  });
  dlg.querySelectorAll('[data-dlg-close]').forEach((b) => b.addEventListener('click', cerrarDialogo));
  if (!dlg.open) dlg.showModal();
  const primero = form.querySelector('.dlg-body input:not([type=hidden]):not([readonly]), .dlg-body select, .dlg-body textarea');
  if (primero && !matchMedia('(pointer: coarse)').matches) primero.focus();
  return form;
}

export function cerrarDialogo() {
  if (dlg?.open) dlg.close();
  else { const cb = onClose; onClose = null; cb?.(); }
}

export function leerForm(form) {
  const d = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') d[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; }
    else d[el.name] = el.value.trim();
  }
  // Selectores de mes (name__m + name__y) → 'YYYY-MM'
  for (const k of Object.keys(d)) {
    if (!k.endsWith('__m')) continue;
    const base = k.slice(0, -3);
    const m = d[k];
    const y = d[`${base}__y`];
    d[base] = m && y ? `${y}-${m}` : '';
    if (!!m !== !!y) (d._incompletos ||= []).push(base);
    delete d[k];
    delete d[`${base}__y`];
  }
  return d;
}

/** Confirmación en un diálogo propio, encima del que esté abierto (no lo cierra). */
export function confirmar(titulo, texto, { ok = 'Eliminar', peligro = true } = {}) {
  const d = document.getElementById('confirmacion');
  d.innerHTML = String(html`
    <form method="dialog" class="dlg-form">
      <header class="dlg-head"><h2>${titulo}</h2></header>
      <div class="dlg-body"><p class="muted">${texto}</p></div>
      <footer class="dlg-foot">
        <span class="grow"></span>
        <button value="no" class="btn btn-ghost">Cancelar</button>
        <button value="si" class="btn ${peligro ? 'btn-danger' : 'btn-primary'}">${ok}</button>
      </footer>
    </form>`);
  d.returnValue = '';
  d.showModal();
  d.querySelector('button[value="si"]').focus();
  return new Promise((resolve) => {
    d.addEventListener('close', () => resolve(d.returnValue === 'si'), { once: true });
  });
}

export function descargar(nombre, contenido, tipo = 'application/json') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: `${tipo};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ───────────── Campos de formulario ───────────── */

export function campo(label, input, { ayuda, clase = '' } = {}) {
  return html`<label class="field ${clase}"><span class="field-label">${label}</span>${input}${ayuda ? html`<small class="field-help">${ayuda}</small>` : ''}</label>`;
}

export function inp(name, value = '', { type = 'text', req, min, max, step, ph, attrs = '' } = {}) {
  return raw(
    `<input name="${name}" type="${type}" value="${esc(value ?? '')}"${req ? ' required' : ''}${min != null ? ` min="${min}"` : ''}${max != null ? ` max="${max}"` : ''}${step != null ? ` step="${step}"` : ''}${ph ? ` placeholder="${esc(ph)}"` : ''}${type === 'number' ? ' inputmode="decimal"' : ''} ${attrs}>`,
  );
}

/** Número con decimales: texto con teclado decimal para admitir coma (12,50) en cualquier navegador. */
export const dec = (name, value, opts = {}) => {
  const v = value === '' || value == null ? '' : String(value).replace('.', ',');
  return inp(name, v, { ...opts, type: 'text', attrs: `inputmode="decimal" autocomplete="off" ${opts.attrs || ''}` });
};
export const money = (name, value, opts = {}) => {
  const n = typeof value === 'number' ? value : num(value);
  const vacio = value === '' || value == null || (Math.abs(n) < 0.005 && !opts.cero);
  const v = vacio ? '' : Number.isInteger(r2(n)) ? String(r2(n)) : r2(n).toFixed(2);
  return dec(name, v, { ph: '0,00', ...opts });
};

/** Selector de mes (mes + año) que funciona también en Safari de Mac, que no tiene <input type="month">. */
export function mesSel(name, value, { req, vacio = false, anios } = {}) {
  const [y, m] = value ? value.split('-') : ['', ''];
  const hoy = new Date().getFullYear();
  const lista = anios || Array.from({ length: hoy + 46 - 1990 }, (_, i) => 1990 + i);
  if (y && !lista.includes(Number(y))) lista.push(Number(y));
  lista.sort((a, b) => a - b);
  const mo = [vacio ? '<option value="">—</option>' : '', ...MESES.map((n, i) => `<option value="${pad2(i + 1)}"${pad2(i + 1) === m ? ' selected' : ''}>${n.replace(/^./, (c) => c.toUpperCase())}</option>`)].join('');
  const yo = [vacio ? '<option value="">—</option>' : '', ...lista.map((a) => `<option value="${a}"${String(a) === y ? ' selected' : ''}>${a}</option>`)].join('');
  return raw(`<span class="mes-sel"><select name="${name}__m" aria-label="Mes"${req ? ' required' : ''}>${mo}</select><select name="${name}__y" aria-label="Año"${req ? ' required' : ''}>${yo}</select></span>`);
}
const pad2 = (n) => String(n).padStart(2, '0');

export function sel(name, opciones, actual, { req, attrs = '' } = {}) {
  return raw(
    `<select name="${name}"${req ? ' required' : ''} ${attrs}>${opciones
      .map((o) => (o.grupo ? `<optgroup label="${esc(o.grupo)}">${o.items.map((i) => opt(i, actual)).join('')}</optgroup>` : opt(o, actual)))
      .join('')}</select>`,
  );
}
const opt = (o, actual) => `<option value="${esc(o.v)}"${String(o.v) === String(actual ?? '') ? ' selected' : ''}>${esc(o.t)}</option>`;

export function chk(name, checked, texto) {
  return html`<label class="check"><input type="checkbox" name="${name}" ${checked ? raw('checked') : ''}><span>${texto}</span></label>`;
}

/* ───────────── Iconos (trazo 1.6, 24×24) ───────────── */

const I = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  panel: I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  cobros: I('<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6.5 15h4"/>'),
  gastos: I('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  pisos: I('<path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>'),
  calendario: I('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
  fiscal: I('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>'),
  ajustes: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  mas: I('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  x: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  left: I('<path d="m15 6-6 6 6 6"/>'),
  right: I('<path d="m9 6 6 6-6 6"/>'),
  check: I('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  edit: I('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  wa: I('<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a3.5 3.5 0 0 1-1.8-1.8l.8-1-1-2z"/>'),
  copy: I('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  bell: I('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  download: I('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  upload: I('<path d="M12 20V9M7 13.5l5-5 5 5M5 4h14"/>'),
  in: I('<path d="M3 12h11M10 8l4 4-4 4"/><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/>'),
  out: I('<path d="M10 12h11M17 8l4 4-4 4"/><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"/>'),
  doc: I('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>'),
  key: I('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>'),
  bank: I('<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>'),
  search: I('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
};
